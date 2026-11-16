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
}

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

/**
 * MCP 透明代理网关（STDIO，行分隔 JSON-RPC）：
 *  client stdin ─→ [拦截 tools/call → PluginRuntime 纠偏] ─→ downstream
 *  client stdout ←── [透传 / 合成响应] ←── downstream stdout
 * 拦截按串行队列处理，保证与请求顺序一致。
 */
export class McpProxy {
  private readonly adapter: McpAdapter;
  private readonly runtime: PluginRuntime;
  private readonly sink: TelemetrySink;
  private downstream?: ChildProcessWithoutNullStreams;
  private clientBuffer = '';
  private downstreamBuffer = '';
  private queue: Promise<void> = Promise.resolve();
  /** 全量审计事件（观测 / 测试；生产可替换为 OTLP/HTTP sink） */
  readonly auditEvents: AuditEvent[] = [];

  constructor(
    private readonly opts: McpProxyOptions,
    deps: { adapter?: McpAdapter; sink?: TelemetrySink } = {},
  ) {
    this.adapter = deps.adapter ?? new McpAdapter();
    this.sink = deps.sink ?? new InMemorySink();
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
    this.downstream.on('exit', (code) => this.opts.onDownstreamExit?.(code));
    this.downstream.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));

    // 客户端 → 代理
    clientInput.on('data', (chunk: Buffer) => {
      this.clientBuffer += chunk.toString();
      let idx: number;
      while ((idx = this.clientBuffer.indexOf('\n')) !== -1) {
        const line = this.clientBuffer.slice(0, idx).trim();
        this.clientBuffer = this.clientBuffer.slice(idx + 1);
        if (line) this.enqueue(line, clientOutput);
      }
    });
    clientInput.on('close', () => this.stop());

    // 下游 → 客户端（透传）
    this.downstream.stdout.on('data', (chunk: Buffer) => {
      this.downstreamBuffer += chunk.toString();
      let idx: number;
      while ((idx = this.downstreamBuffer.indexOf('\n')) !== -1) {
        const line = this.downstreamBuffer.slice(0, idx).trim();
        this.downstreamBuffer = this.downstreamBuffer.slice(idx + 1);
        if (line) clientOutput.write(line + '\n');
      }
    });
  }

  stop(): void {
    this.downstream?.kill();
    this.downstream = undefined;
  }

  private enqueue(line: string, out: NodeJS.WritableStream): void {
    this.queue = this.queue
      .then(() => this.handleLine(line, out))
      .catch((err) => {
        // fail-open：处理异常时不吞掉请求——原样转发下游
        process.stderr.write(`[arcs-mcp] line 处理异常，原样转发：${String(err)}\n`);
        this.sendToDownstream(line);
      });
  }

  private async handleLine(line: string, out: NodeJS.WritableStream): Promise<void> {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // 非法行丢弃
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
        this.sendToDownstream({ jsonrpc: '2.0', id: msg.id, method: 'tools/call', params: action.params });
      } else {
        this.writeClient(out, { jsonrpc: '2.0', id: msg.id, result: action.result });
      }
      return;
    }

    // 其余消息（initialize / tools/list / notifications 等）原样透传
    this.sendToDownstream(msg);
  }

  private sendToDownstream(msg: unknown): void {
    this.downstream?.stdin.write(JSON.stringify(msg) + '\n');
  }

  private writeClient(out: NodeJS.WritableStream, msg: unknown): void {
    out.write(JSON.stringify(msg) + '\n');
  }
}
