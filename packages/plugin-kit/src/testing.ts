import type { ExecutionContext, SteeringEffect, ToolCall } from '@chaos-design/arcs-core';
import { configToPolicy, type ArcsConfig } from './config.js';
import type {
  HostAdapter,
  HitlDecision,
  HitlTransport,
  KitHandles,
  MaterializeResult,
  RawEvent,
  SuspendEffect,
} from './adapter.js';
import type { PluginRuntime, SteeringOutcome } from './runtime.js';

export type HitlScriptEntry = HitlDecision | 'approve' | 'reject' | 'timeout';

/** 可编程审批通道：按脚本依次返回；脚本耗尽时按超时拒绝（fail-safe） */
export class MockHitlTransport implements HitlTransport {
  readonly requests: Array<{ e: SuspendEffect; ctx: ExecutionContext }> = [];
  private queue: HitlScriptEntry[];

  constructor(script: HitlScriptEntry[] = []) {
    this.queue = [...script];
  }

  async request(e: SuspendEffect, ctx: ExecutionContext): Promise<HitlDecision> {
    this.requests.push({ e, ctx });
    const next = this.queue.shift();
    if (!next) return { approved: false, timeout: true, comment: 'MockHitlTransport 无脚本，按超时拒绝' };
    if (next === 'approve') return { approved: true, timeout: false };
    if (next === 'reject') return { approved: false, timeout: false };
    if (next === 'timeout') return { approved: false, timeout: true };
    return next;
  }
}

export interface MockAdapterOptions {
  normalize?: (raw: RawEvent, handles: KitHandles) => ExecutionContext;
  onMaterialize?: (
    effect: SteeringEffect,
    ctx: ExecutionContext,
    handles: KitHandles,
  ) => MaterializeResult | Promise<MaterializeResult>;
  defaultToolCall?: ToolCall;
}

/**
 * 可编程宿主适配器（docs/testing.md 第二层回放仿真）：
 *  - 记录 subscribe/raws/materialized 全链调用
 *  - Suspend 的物化按真实契约执行：内部调用 hitl.request 并按决定放行或阻断
 */
export class MockHostAdapter implements HostAdapter {
  handles?: KitHandles;
  readonly subscribed: Array<(raw: RawEvent) => void> = [];
  readonly raws: RawEvent[] = [];
  readonly materialized: Array<{
    effect: SteeringEffect;
    ctx: ExecutionContext;
    result: MaterializeResult;
  }> = [];

  constructor(private readonly options: MockAdapterOptions = {}) {}

  subscribe(notify: (raw: RawEvent) => void): void {
    this.subscribed.push(notify);
  }

  setup(handles: KitHandles): void {
    this.handles = handles;
  }

  normalize(raw: RawEvent): ExecutionContext {
    this.raws.push(raw);
    if (this.options.normalize) return this.options.normalize(raw, this.handles!);
    const payload = raw.payload as { goal?: string; thought?: string; toolCall?: ToolCall } | null;
    const toolCall: ToolCall =
      payload?.toolCall ?? this.options.defaultToolCall ?? { id: String(raw.timestamp), name: raw.type, args: {} };
    return {
      goal: payload?.goal ?? '',
      thought: payload?.thought ?? '',
      toolCall,
      history: [],
      budget: { stepsUsed: 0, stepsMax: 15, elapsedMs: 0 },
      policy: configToPolicy(this.handles!.config),
    };
  }

  async materialize(effect: SteeringEffect, ctx: ExecutionContext): Promise<MaterializeResult> {
    let result: MaterializeResult;
    if (effect.type === 'Suspend') {
      const decision = await this.handles!.hitl.request(effect, ctx);
      result = decision.approved
        ? { applied: true }
        : { applied: false, reason: decision.comment ?? 'HITL 拒绝' };
    } else if (this.options.onMaterialize) {
      result = await this.options.onMaterialize(effect, ctx, this.handles!);
    } else {
      result = { applied: true };
    }
    this.materialized.push({ effect, ctx, result });
    return result;
  }
}

/** 轨迹回放：按序驱动 runtime.run，返回每次编排结果（docs/testing.md） */
export class ReplayHarness {
  constructor(private readonly runtime: PluginRuntime) {}

  async replay(raws: RawEvent[]): Promise<SteeringOutcome[]> {
    const outcomes: SteeringOutcome[] = [];
    for (const raw of raws) {
      outcomes.push(await this.runtime.run(raw));
    }
    return outcomes;
  }

  /** 解析 JSONL 轨迹（一行一个 RawEvent，空行跳过） */
  static parseJsonl(text: string): RawEvent[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as RawEvent);
  }
}
