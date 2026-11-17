import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  PluginRuntime,
  type ConfigOverrides,
  type RawEvent,
} from '@chaos-design/arcs-plugin-kit';
import { InMemorySink, type AuditEvent, type TelemetrySink } from '@chaos-design/arcs-telemetry';
import { McpAdapter, paramsToToolCall, type McpCallParams, type ProxyAction } from './adapter.js';

export interface McpProxyOptions {
  /** 既定目标（注入 normalize 的 goal） */
  goal: string;
  /** 下游 MCP Server 启动命令（argv 形式） */
  target: string[];
  /** 宿主配置级覆盖（最高优先级） */
  configOverrides?: ConfigOverrides;
  /** 下游进程退出回调 */
  onDownstreamExit?: (code: number | null) => void;
  /** 下游进程 spawn 失败（如命令不存在）回调；不设置时仅记录日志 */
  onDownstreamError?: (err: Error) => void;
}

export interface McpProxyDeps {
  adapter?: McpAdapter;
  sink?: TelemetrySink;
  /** 诊断日志出口（默认 stderr）；测试可注入收集 */
  log?: (line: string) => void;
}

/** 单行 JSON-RPC 消息缓冲上限：超过视为客户端异常流，丢弃并告警（防无限增长） */
export const MAX_LINE_LENGTH = 1_000_000;

/** JSON-RPC 2.0 标准错误码（本代理用到的子集） */
export const JSONRPC_ERRORS = {
  parseError: -32700,
  internalError: -32603,
  serverError: -32000,
} as const;

/**
 * 决策矩阵（纯函数）：一次调用的物化动作队列 → 最终代理动作。
 * 规则（docs/plugins.md）：存在转发（含改道）则以最后一个转发为准——L3 的注入
 * 在改道后没有结果通道，跳过；否则取最后一个合成响应；空队列回退为原样转发。
 */
export function decideProxyAction(actions: ProxyAction[], fallbackParams: McpCallParams): ProxyAction {
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i]!.kind === 'forward') return actions[i]!;
  }
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i]!.kind === 'respond') return actions[i]!;
  }
  return { kind: 'forward', params: fallbackParams };
}

function isToolsCallRequest(msg: unknown): msg is { id: number | string; params: McpCallParams } {
  const m = msg as { method?: unknown; id?: unknown; params?: unknown };
  return (
    m.method === 'tools/call' &&
    m.id !== undefined &&
    typeof m.params === 'object' &&
    m.params !== null &&
    typeof (m.params as McpCallParams).name === 'string'
  );
}

function requestIdOf(msg: unknown): number | string | undefined {
  const m = msg as { id?: unknown } | null;
  if (m && m.id !== undefined && (typeof m.id === 'number' || typeof m.id === 'string')) {
    return m.id;
  }
  return undefined;
}

/**
 * 从无法 JSON.parse 的原始行里尽力提取 id（JSON-RPC 错误响应需要回执）。
 * 正则覆盖 `"id": 3` / `"id": "abc"` 两种合法形态；提取不到返回 undefined。
 */
export function extractIdFromRawLine(line: string): number | string | undefined {
  const numeric = line.match(/"id"\s*:\s*(-?\d+(?:\.\d+)?)/);
  if (numeric) return Number(numeric[1]);
  const stringId = line.match(/"id"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (stringId) return stringId[1];
  return undefined;
}

/**
 * MCP 透明代理网关（STDIO，行分隔 JSON-RPC）：
 *  client stdin ─→ [拦截 tools/call → PluginRuntime 纠偏] ─→ downstream
 *  client stdout ←── [透传 / 合成响应] ←── downstream stdout
 * 拦截按串行队列处理，保证与请求顺序一致。
 * 稳健性红线：① 下游任何流错误（EPIPE 等）不得击穿代理进程；② 每个已转发
 * 的带 id 请求都必须有应答——下游退出 / 写失败时统一回 JSON-RPC 错误响应，
 * 绝不悬挂客户端。
 */
export class McpProxy {
  private readonly adapter: McpAdapter;
  private readonly runtime: PluginRuntime;
  private readonly sink: TelemetrySink;
  private readonly log: (line: string) => void;
  private downstream?: ChildProcessWithoutNullStreams;
  private clientBuffer = '';
  private downstreamBuffer = '';
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  /** 已转发至下游、尚未收到响应的带 id 请求（id → 客户端输出流），下游死亡时统一回错 */
  private pendingForwarded = new Map<number | string, NodeJS.WritableStream>();
  /** 全量审计事件（观测 / 测试；生产可替换为 OTLP/HTTP sink） */
  readonly auditEvents: AuditEvent[] = [];

  constructor(
    private readonly opts: McpProxyOptions,
    deps: McpProxyDeps = {},
  ) {
    this.adapter = deps.adapter ?? new McpAdapter();
    this.sink = deps.sink ?? new InMemorySink();
    this.log = deps.log ?? ((line) => process.stderr.write(`${line}\n`));
    this.runtime = new PluginRuntime(this.adapter, {
      host: opts.configOverrides,
      sink: this.sink,
    });
  }

  get events(): AuditEvent[] {
    if (this.sink instanceof InMemorySink) return this.sink.events;
    return this.auditEvents;
  }

  start(
    clientInput: NodeJS.ReadableStream = process.stdin,
    clientOutput: NodeJS.WritableStream = process.stdout,
  ): void {
    this.downstream = spawn(this.opts.target[0]!, this.opts.target.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.downstream.on('exit', (code) => {
      this.failPendingForwarded('下游 MCP Server 已退出');
      this.opts.onDownstreamExit?.(code);
    });
    this.downstream.on('error', (err) => {
      // spawn 失败（ENOENT 等）只触发 error 不触发 exit：必须显式上报，否则宿主端悬挂
      this.failPendingForwarded('下游 MCP Server 启动失败');
      this.log(`[arcs-mcp] 下游进程启动失败：${err.message}`);
      this.opts.onDownstreamError?.(err);
    });
    // EPIPE 防线：下游任一管道出错只记录 + 兑现未决请求，不让 'error' 事件击穿代理
    this.downstream.stdin.on('error', () => this.failPendingForwarded('下游 stdin 写入失败'));
    this.downstream.stdout.on('error', (err) => this.log(`[arcs-mcp] 下游 stdout 读取失败：${String(err)}`));
    this.downstream.stderr.on('error', () => {}); // 转发失败时静默，保命优先
    this.downstream.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));

    // 客户端 → 代理
    clientInput.on('data', (chunk: Buffer) => {
      this.clientBuffer += chunk.toString();
      if (!this.clientBuffer.includes('\n') && this.clientBuffer.length > MAX_LINE_LENGTH) {
        this.log(`[arcs-mcp] 客户端行缓冲超过 ${MAX_LINE_LENGTH} 字节且无换行，已丢弃`);
        this.clientBuffer = '';
        return;
      }
      let idx: number;
      while ((idx = this.clientBuffer.indexOf('\n')) !== -1) {
        const line = this.clientBuffer.slice(0, idx).trim();
        this.clientBuffer = this.clientBuffer.slice(idx + 1);
        if (line) this.enqueue(line, clientOutput);
      }
    });
    clientInput.on('close', () => this.stop());

    // 下游 → 客户端（透传；顺带兑现已收到响应的未决请求）
    this.downstream.stdout.on('data', (chunk: Buffer) => {
      this.downstreamBuffer += chunk.toString();
      if (!this.downstreamBuffer.includes('\n') && this.downstreamBuffer.length > MAX_LINE_LENGTH) {
        this.log(`[arcs-mcp] 下游行缓冲超过 ${MAX_LINE_LENGTH} 字节且无换行，已丢弃`);
        this.downstreamBuffer = '';
        return;
      }
      let idx: number;
      while ((idx = this.downstreamBuffer.indexOf('\n')) !== -1) {
        const line = this.downstreamBuffer.slice(0, idx).trim();
        this.downstreamBuffer = this.downstreamBuffer.slice(idx + 1);
        if (!line) continue;
        try {
          const id = requestIdOf(JSON.parse(line));
          if (id !== undefined) this.pendingForwarded.delete(id);
        } catch {
          // 下游噪声行不解析；原样透传
        }
        clientOutput.write(line + '\n');
      }
    });
  }

  stop(): void {
    this.stopped = true;
    this.clientBuffer = '';
    this.downstreamBuffer = '';
    this.pendingForwarded.clear();
    this.downstream?.kill();
    this.downstream = undefined;
  }

  private enqueue(line: string, out: NodeJS.WritableStream): void {
    if (this.stopped) return;
    this.queue = this.queue
      .then(() => this.handleLine(line, out))
      .catch((err) => {
        // fail-open：处理异常时不吞掉请求——能转发则原样转发，否则回 JSON-RPC 错误
        this.log(`[arcs-mcp] line 处理异常：${String(err)}`);
        if (!this.tryForward(line, out)) {
          const id = extractIdFromRawLine(line);
          if (id !== undefined) {
            this.writeError(out, id, JSONRPC_ERRORS.internalError, '代理内部错误，请求未转发');
          }
        }
      });
  }

  private async handleLine(line: string, out: NodeJS.WritableStream): Promise<void> {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      // 非法 JSON：能提取 id 则回 Parse error（JSON-RPC 2.0 规范），否则丢弃
      const id = extractIdFromRawLine(line);
      if (id !== undefined) {
        this.writeError(out, id, JSONRPC_ERRORS.parseError, 'Parse error');
      } else {
        this.log('[arcs-mcp] 非法 JSON 行且无法提取 id，已丢弃');
      }
      return;
    }

    if (isToolsCallRequest(msg)) {
      const params = msg.params;
      this.adapter.setCallParams(params);
      const raw: RawEvent = {
        host: 'mcp',
        type: 'tool-call',
        sessionId: 'mcp-proxy',
        timestamp: Date.now(),
        payload: { goal: this.opts.goal, toolCall: paramsToToolCall(msg.id, params) },
      };
      await this.runtime.run(raw);
      const action = decideProxyAction(this.adapter.actionQueue, params);
      if (action.kind === 'forward') {
        if (
          !this.tryForward(
            { jsonrpc: '2.0', id: msg.id, method: 'tools/call', params: action.params },
            out,
          )
        ) {
          this.writeError(out, msg.id, JSONRPC_ERRORS.serverError, '下游 MCP Server 不可用，请求未执行');
        }
      } else {
        this.writeClient(out, { jsonrpc: '2.0', id: msg.id, result: action.result });
      }
      return;
    }

    // 其余消息（initialize / tools/list / notifications 等）原样透传；
    // 下游不可达时，带 id 的请求回错误响应，通知类消息静默丢弃
    const id = requestIdOf(msg);
    if (!this.tryForward(msg, out)) {
      if (id !== undefined) {
        this.writeError(out, id, JSONRPC_ERRORS.serverError, '下游 MCP Server 不可用，请求未执行');
      } else {
        this.log('[arcs-mcp] 下游不可达，通知类消息已丢弃');
      }
    }
  }

  /** 下游可达且 stdin 可写时写入并登记未决请求；返回是否真正转发 */
  private tryForward(msg: unknown, out: NodeJS.WritableStream): boolean {
    const child = this.downstream;
    if (!child || this.stopped) return false;
    const dead = child.exitCode !== null || child.signalCode !== null;
    if (dead || !child.stdin.writable) return false;
    child.stdin.write(JSON.stringify(msg) + '\n');
    const id = requestIdOf(msg);
    if (id !== undefined) this.pendingForwarded.set(id, out);
    return true;
  }

  /** 下游死亡 / 写失败时，对所有已转发未决请求统一回 JSON-RPC 错误响应 */
  private failPendingForwarded(reason: string): void {
    for (const [id, out] of this.pendingForwarded) {
      this.writeError(out, id, JSONRPC_ERRORS.serverError, `${reason}，请求未完成`);
    }
    this.pendingForwarded.clear();
  }

  private writeError(out: NodeJS.WritableStream, id: number | string, code: number, message: string): void {
    this.writeClient(out, { jsonrpc: '2.0', id, error: { code, message } });
  }

  private writeClient(out: NodeJS.WritableStream, msg: unknown): void {
    try {
      out.write(JSON.stringify(msg) + '\n');
    } catch {
      // 客户端输出流已关闭：无法应答也不得击穿代理
    }
  }
}
