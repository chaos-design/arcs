import type { ExecutionContext, SteeringEffect, ToolCall } from '@chaos-design/arcs-core';
import {
  configToPolicy,
  type HostAdapter,
  type KitHandles,
  type MaterializeResult,
  type RawEvent,
} from '@chaos-design/arcs-plugin-kit';

/** tools/call 请求参数（代理只关心 name + arguments） */
export interface McpCallParams {
  name: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
}

export function paramsToToolCall(id: string | number, params: McpCallParams): ToolCall {
  return {
    id: String(id),
    name: params.name,
    args: (params.arguments ?? {}) as Record<string, unknown>,
  };
}

/** 代理层落地动作（docs/plugins.md 代理落地语义） */
export type ProxyAction =
  | { kind: 'forward'; params: McpCallParams }
  | {
      kind: 'respond';
      result: { content: Array<{ type: 'text'; text: string }>; isError: boolean };
    };

/**
 * MCP 效果 → 代理动作映射：
 *  - PassThrough   → 转发原调用
 *  - PatchArgs(L1) → 改写 arguments 后转发
 *  - RedirectTool(L3) → 改写 tools/call 目标后转发（原调用被阻断）
 *  - InjectMessage(L2) → 合成 isError 工具结果（虚拟报错，不转发下游）
 *  - Suspend(L4)   → 代理无审批回调通道，按拒绝语义阻断 + 注入提示（docs/plugins.md）
 */
export class McpAdapter implements HostAdapter {
  handles?: KitHandles;
  private notify?: (raw: RawEvent) => void;
  private originalParams: McpCallParams = { name: 'unknown', arguments: {} };
  readonly actionQueue: ProxyAction[] = [];

  setup(handles: KitHandles): void {
    this.handles = handles;
  }

  /** 代理为拉模式（宿主不推送事件）；保留 push 通道以复用 Runtime.start */
  subscribe(notify: (raw: RawEvent) => void): void {
    this.notify = notify;
  }

  get onEvent(): ((raw: RawEvent) => void) | undefined {
    return this.notify;
  }

  /** 每次拦截前由代理层设置原始请求参数并清空动作队列 */
  setCallParams(params: McpCallParams): void {
    this.originalParams = params;
    this.actionQueue.length = 0;
  }

  normalize(raw: RawEvent): ExecutionContext {
    const payload = raw.payload as { goal: string; toolCall: ToolCall };
    return {
      goal: payload.goal,
      // 代理只见工具流量，无模型推理内容；thought 以工具调用文本代替
      thought: `${payload.toolCall.name} ${JSON.stringify(payload.toolCall.args)}`,
      toolCall: payload.toolCall,
      history: [],
      budget: { stepsUsed: 0, stepsMax: 15, elapsedMs: 0 },
      policy: configToPolicy(this.handles!.config),
    };
  }

  async materialize(effect: SteeringEffect, _ctx: ExecutionContext): Promise<MaterializeResult> {
    const original = this.originalParams;
    switch (effect.type) {
      case 'PassThrough':
        this.actionQueue.push({ kind: 'forward', params: original });
        break;
      case 'PatchArgs':
        this.actionQueue.push({ kind: 'forward', params: { ...original, arguments: effect.patch } });
        break;
      case 'RedirectTool':
        this.actionQueue.push({ kind: 'forward', params: { ...original, name: effect.target } });
        break;
      case 'InjectMessage':
        this.actionQueue.push({
          kind: 'respond',
          result: { content: [{ type: 'text', text: effect.content }], isError: true },
        });
        break;
      case 'Suspend':
        this.actionQueue.push({
          kind: 'respond',
          result: {
            content: [
              {
                type: 'text',
                text: `【ARCS 阻断】${effect.reason}。MCP 代理模式不支持审批回调通道，已按拒绝语义阻断该调用；请改用安全方式或由宿主侧插件承接审批。`,
              },
            ],
            isError: true,
          },
        });
        break;
    }
    return { applied: true };
  }
}
