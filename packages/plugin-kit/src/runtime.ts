import {
  createArcsEngine,
  type DriftSignal,
  type ExecutionContext,
  type SteeringEffect,
  type ToolCall,
} from '@chaos-design/arcs-core';
import { buildAuditEvent, type TelemetrySink } from '@chaos-design/arcs-telemetry';
import { configToPolicy, resolveConfig, type ArcsConfig, type ConfigOverrides } from './config.js';
import { rawEventSchema, type HostAdapter, type HitlTransport, type RawEvent } from './adapter.js';
import { SessionStore } from './state.js';

/** 单次编排结果（docs/plugin-kit.md SteeringOutcome） */
export interface SteeringOutcome {
  effects: SteeringEffect[];
  signals: DriftSignal[];
  latencyMs: number;
  degraded: boolean;
}

export interface RuntimeOptions {
  /** Policy 级覆盖（引擎拥有方默认值） */
  policy?: ConfigOverrides;
  /** 宿主配置级覆盖（最高优先级） */
  host?: ConfigOverrides;
  hitl?: HitlTransport;
  sink?: TelemetrySink;
}

/** 未配置审批通道时的兜底：按超时拒绝（fail-safe，docs/plugin-kit.md HITL 契约） */
const fallbackHitl: HitlTransport = {
  request: async () => ({ approved: false, timeout: true, comment: '未配置审批通道，按超时拒绝处理' }),
};

const fallbackSink: TelemetrySink = { emit: () => {} };

/** 效果列表 → 纠偏等级（供 AuditEvent.level） */
export function effectLevel(effects: SteeringEffect[]): 1 | 2 | 3 | 4 | null {
  if (effects.some((e) => e.type === 'Suspend')) return 4;
  if (effects.some((e) => e.type === 'RedirectTool')) return 3;
  if (effects.some((e) => e.type === 'InjectMessage')) return 2;
  if (effects.some((e) => e.type === 'PatchArgs')) return 1;
  return null;
}

/**
 * 运行时编排器（docs/plugin-kit.md 编排流水线）：
 * RawEvent → normalize → SessionState 注入 → engine.run（sense/plan，fail-open）
 * → 效果列表按序 materialize → emit AuditEvent。
 * 任何异常不外抛到宿主（fail-open 红线，docs/constraints.md #7）。
 */
export class PluginRuntime {
  private cfg?: ArcsConfig;
  private engine?: ReturnType<typeof createArcsEngine>;
  private store?: SessionStore;
  private initPromise?: Promise<void>;
  private readonly hitl: HitlTransport;
  private readonly sink: TelemetrySink;

  constructor(
    private readonly adapter: HostAdapter,
    private readonly opts: RuntimeOptions = {},
  ) {
    this.hitl = opts.hitl ?? fallbackHitl;
    this.sink = opts.sink ?? fallbackSink;
  }

  /** 一次性初始化：配置三级合并 → engine/store 组装 → adapter.setup 注入句柄 */
  async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const cfg = resolveConfig(this.opts.policy, this.opts.host);
        this.cfg = cfg;
        this.engine = createArcsEngine(configToPolicy(cfg), {
          budgets: { senseMs: cfg.senseBudgetMs, planMs: cfg.planBudgetMs },
        });
        this.store = new SessionStore({
          ttlMs: cfg.sessionTtlMs,
          loopWindowMax: cfg.loopWindowMax,
          historyMax: cfg.historyMax,
          stepsMax: 15,
        });
        await this.adapter.setup?.({ hitl: this.hitl, config: cfg });
      })();
    }
    await this.initPromise;
  }

  getConfig(): ArcsConfig | undefined {
    return this.cfg;
  }

  async run(raw: RawEvent): Promise<SteeringOutcome> {
    try {
      await this.ensureInit();
    } catch {
      // 初始化失败（配置校验 / adapter.setup 异常）：fail-open 放行并记降级审计；
      // 重置 initPromise，让下一个事件有机会重试初始化（如宿主延迟就绪）。
      this.initPromise = undefined;
      return this.degradedPassThrough(raw);
    }
    const t0 = Date.now();
    let degraded = false;
    const notes: string[] = [];
    let signals: DriftSignal[] = [];
    let effects: SteeringEffect[] = [{ type: 'PassThrough' }];
    let ctx: ExecutionContext | undefined;
    let sessionId = 'invalid';
    let host = 'unknown';
    let eventTs = Date.now();

    const parsed = rawEventSchema.safeParse(raw);
    if (!parsed.success) {
      degraded = true;
      notes.push(`RawEvent 校验失败，fail-open 放行：${parsed.error.message}`);
    } else {
      sessionId = parsed.data.sessionId;
      host = parsed.data.host;
      eventTs = parsed.data.timestamp;
      try {
        ctx = this.adapter.normalize(parsed.data);
        const state = this.store!.touch(parsed.data.sessionId, parsed.data.timestamp);
        // 快照注入：历史与预算取「既往事件」视图（当前调用尚未入史，避免重复计数）
        const fullCtx: ExecutionContext = {
          ...ctx,
          history: [...state.history],
          budget: { ...state.budget },
        };
        const outcome = this.engine!.run(fullCtx);
        signals = outcome.signals;
        effects = outcome.effects;
        degraded = outcome.degraded;
        notes.push(...outcome.notes);
        ctx = fullCtx;
        // 检测完成后才把当前调用写入历史，供下一次事件检测
        this.store!.record(
          state,
          ctx.thought,
          ctx.toolCall,
          parsed.data.timestamp,
          payloadOutcome(parsed.data.payload),
        );
      } catch (err) {
        degraded = true;
        notes.push(`normalize/决策链异常，fail-open 放行：${String(err)}`);
      }
    }

    const materialized: Array<{ effect: SteeringEffect; applied: boolean; reason?: string }> = [];
    if (ctx) {
      for (const effect of effects) {
        try {
          const result = await this.adapter.materialize(effect, ctx);
          materialized.push({ effect, applied: result.applied, reason: result.applied ? undefined : result.reason });
        } catch (err) {
          degraded = true;
          notes.push(`materialize(${effect.type}) 异常，放行原始调用：${String(err)}`);
          materialized.push({ effect, applied: true });
        }
      }
    }

    const latencyMs = Date.now() - t0;
    const outcome: SteeringOutcome = { effects, signals, latencyMs, degraded };

    // 遥测：emit 失败静默丢弃，不影响主链
    try {
      this.sink.emit(
        buildAuditEvent({
          ts: Date.now(),
          sessionId,
          host,
          level: effectLevel(effects),
          signals,
          effects,
          latencyMs,
          degraded,
        }),
      );
    } catch (err) {
      notes.push(`telemetry emit 失败（已忽略）：${String(err)}`);
    }

    // 每次编排后做一次 TTL 清扫（惰性回收；以事件时钟为基准，保证回放轨迹确定性）
    if (sessionId !== 'invalid') this.store?.sweep(eventTs);
    return outcome;
  }

  /** 订阅模式：adapter 采集到事件即驱动编排（fire-and-forget） */
  start(): void {
    this.adapter.subscribe((raw) => {
      // run() 内部已把所有异常收敛为 fail-open 结果；此处兜底保证绝不外抛到宿主
      void this.run(raw).catch(() => {});
    });
  }

  /**
   * 初始化失败 / 引擎不可用时的降级放行：PassThrough + degraded 审计。
   * 与主链同一遥测出口，保证面板能看到降级轨迹。
   */
  private degradedPassThrough(raw: RawEvent): SteeringOutcome {
    const parsed = rawEventSchema.safeParse(raw);
    const sessionId = parsed.success ? parsed.data.sessionId : 'invalid';
    const host = parsed.success ? parsed.data.host : 'unknown';
    const effects: SteeringEffect[] = [{ type: 'PassThrough' }];
    try {
      this.sink.emit(
        buildAuditEvent({
          ts: Date.now(),
          sessionId,
          host,
          level: null,
          signals: [],
          effects,
          latencyMs: 0,
          degraded: true,
        }),
      );
    } catch {
      // 遥测失败静默（telemetry.md Sink 契约）
    }
    return { effects, signals: [], latencyMs: 0, degraded: true };
  }
}

function payloadOutcome(payload: unknown): 'ok' | 'error' | undefined {
  const p = payload as { outcome?: unknown } | null;
  if (p?.outcome === 'error') return 'error';
  if (p?.outcome === 'ok') return 'ok';
  return undefined;
}

/** 便捷构造：从 payload 提取工具调用（供简单适配器复用） */
export function toolCallFromPayload(payload: unknown, fallbackId: string): ToolCall {
  const p = payload as { toolCall?: ToolCall } | null;
  return p?.toolCall ?? { id: fallbackId, name: 'unknown', args: {} };
}
