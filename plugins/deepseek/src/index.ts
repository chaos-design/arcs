import {
  HookEntryAdapter,
  capabilitiesFor,
  createAuditSink,
  emptyDecision,
  nativeToRaw,
  type HostDecision,
} from '@chaos-design/arcs-host-kit';
import { PluginRuntime, type ConfigOverrides, type RawEvent } from '@chaos-design/arcs-plugin-kit';
import { mapHarnessEvent, shouldSteerDeepseek, type HarnessEvent } from './mapping.js';

export {
  mapHarnessEvent,
  mapTurnEnd,
  shouldSteerDeepseek,
  serializeDeepseek,
  harnessToRaw,
  CANONICAL_EVENTS,
} from './mapping.js';
export type { HarnessEvent } from './mapping.js';

export const name = 'arcs-deepseek';

/** 会话级 Map 的容量上限（超过 FIFO 逐出；防宿主缺失 session/disposed 事件时泄漏） */
const SESSION_MAP_CAP = 512;

/** Cordis Context 的最小结构（仅用 on / emit，刻意不依赖 sessions 服务） */
export interface DeepseekContext {
  on(event: string, handler: (payload: any) => unknown): unknown;
  emit?(event: string, payload: unknown): unknown;
  [key: string]: unknown;
}

/**
 * 真实阻断通道。宿主若能提供拒绝工具执行的回调，注入它即可让 L4 真正落地；
 * 未注入时保持事件广播 + 审计的降级形态（不阻塞、不虚假承诺）。
 */
export type DeepseekBlockTransport = (
  decision: HostDecision,
  raw: RawEvent,
) => Promise<boolean> | boolean;

export type DeepseekConfig = ConfigOverrides & {
  goal?: string;
  blockTransport?: DeepseekBlockTransport;
};

export interface DeepseekHandle {
  readonly name: string;
  readonly adapter: HookEntryAdapter;
  readonly runtime: PluginRuntime;
  readonly turnBySession: Map<string, string>;
  readonly decisionBySession: Map<string, HostDecision>;
  /** block 决策是否经过真实阻断通道（无通道时为 false） */
  readonly enforcedBySession: Map<string, boolean>;
  readonly hasBlockTransport: boolean;
  readonly lastDecision: HostDecision;
  steer(raw: RawEvent): Promise<HostDecision>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sessionIdOf(event: HarnessEvent | null | undefined): string {
  const e = asRecord(event);
  if (typeof e['sessionId'] === 'string' && e['sessionId']) return e['sessionId'] as string;
  if (typeof e['session_id'] === 'string' && e['session_id']) return e['session_id'] as string;
  const s = asRecord(e['session']);
  if (typeof s['id'] === 'string' && s['id']) return s['id'] as string;
  return 'unknown-session';
}

function turnIdOf(event: HarnessEvent | null | undefined): string {
  const e = asRecord(event);
  if (typeof e['turnId'] === 'string' && e['turnId']) return e['turnId'] as string;
  const turn = e['turn'];
  if (typeof turn === 'string' && turn) return turn;
  const t = asRecord(turn);
  if (typeof t['id'] === 'string' && t['id']) return t['id'] as string;
  return '';
}

/**
 * DeepSeek Harness Cordis bundle 入口。
 *
 * 刻意不声明 `inject = ['sessions']`：DeepSeek 的 sessions 是第三方服务，
 * 若在 bundle 加载时声明依赖，服务未就绪会让 Cordis 一直等待注入而死锁。
 * 这里只用 ctx.on 订阅 + ctx.emit 广播决策，完全不触碰 sessions。
 */
export function apply(ctx: DeepseekContext, config: DeepseekConfig = {}): DeepseekHandle {
  const goal = config.goal ?? process.env['ARCS_GOAL'] ?? '';
  const blockTransport = config.blockTransport;
  const turnBySession = new Map<string, string>();
  const decisionBySession = new Map<string, HostDecision>();
  const enforcedBySession = new Map<string, boolean>();

  // 会话 Map 容量上限：宿主不发 session/disposed 时防止无限增长（FIFO 逐出最旧会话）
  const capSessionMaps = (): void => {
    while (turnBySession.size > SESSION_MAP_CAP) {
      turnBySession.delete(turnBySession.keys().next().value!);
    }
    while (decisionBySession.size > SESSION_MAP_CAP) {
      decisionBySession.delete(decisionBySession.keys().next().value!);
    }
    while (enforcedBySession.size > SESSION_MAP_CAP) {
      enforcedBySession.delete(enforcedBySession.keys().next().value!);
    }
  };

  // 共享决策持有者：第 4 个参数 subscribeFn 负责注册 Cordis 订阅；
  // 每次事件前用 reset() 清空上次决策，避免长订阅残留。
  const adapter = new HookEntryAdapter(
    'deepseek',
    capabilitiesFor('deepseek'),
    goal,
    (notify) => {
      // notify 由 adapter.subscribe(drive) 注入：返回策略决策 Promise
      const runAndDecide = notify as unknown as (raw: RawEvent) => Promise<HostDecision>;

      const dispatch = async (
        event: HarnessEvent | null | undefined,
        forcedType?: string,
      ): Promise<{ decision: HostDecision; raw?: RawEvent }> => {
        try {
          adapter.reset();
          const source = forcedType
            ? { ...asRecord(event), type: forcedType }
            : (event ?? {});
          const native = mapHarnessEvent(source as HarnessEvent);
          // 生命周期事件强制走审计；业务事件仅 PreToolUse 纠偏
          if (!forcedType && !shouldSteerDeepseek(native)) return { decision: emptyDecision() };
          const raw = nativeToRaw('deepseek', native);
          // raw 随决策一起返回（而非共享可变变量）：并发事件的 block 决策不会错拿他事件的数据
          return { decision: await runAndDecide(raw), raw };
        } catch (err) {
          return {
            decision: { ...emptyDecision(), reason: 'arcs fail-open', degraded: [`runtime:${String(err)}`] },
          };
        }
      };

      ctx.on('session/created', async (session: HarnessEvent) => {
        const sid = sessionIdOf(session);
        turnBySession.set(sid, turnIdOf(session) || '0');
        capSessionMaps();
        const { decision } = await dispatch(session, 'session/created');
        decisionBySession.set(sid, decision);
        return decision;
      });

      ctx.on('session/event', async (event: HarnessEvent) => {
        const sid = sessionIdOf(event);
        // turn 计数：显式 turnId 优先，否则按会话自增
        const prev = Number.parseInt(turnBySession.get(sid) ?? '0', 10);
        const turnId = turnIdOf(event) || String((Number.isNaN(prev) ? 0 : prev) + 1);
        turnBySession.set(sid, turnId);

        const { decision, raw } = await dispatch(event);
        decisionBySession.set(sid, decision);

        // 有阻断通道才真正拦截；通道异常一律 fail-open，不抛给宿主。
        // 使用本次事件自己的 raw，避免并发事件下错拿其它会话的原始数据
        let enforced = false;
        if (decision.kind === 'block' && blockTransport && raw) {
          try {
            enforced = (await blockTransport(decision, raw)) === true;
          } catch {
            enforced = false;
          }
        }
        enforcedBySession.set(sid, enforced);
        capSessionMaps();

        if (ctx.emit) {
          ctx.emit('arcs/decision', { sessionId: sid, turnId, decision, enforced });
        }
        return decision;
      });

      ctx.on('session/disposed', async (session: HarnessEvent) => {
        const sid = sessionIdOf(session);
        const { decision } = await dispatch(session, 'session/disposed');
        decisionBySession.set(sid, decision);
        turnBySession.delete(sid);
        return decision;
      });
    },
  );

  const runtime = new PluginRuntime(adapter, { host: config, sink: createAuditSink() });

  /** 单次纠偏：运行引擎 → 读取翻译后的决策 */
  const drive = async (raw: RawEvent): Promise<HostDecision> => {
    await runtime.run(raw);
    return { ...adapter.decision };
  };

  // adapter.subscribe 触发 subscribeFn 完成三个事件的订阅注册
  adapter.subscribe(drive as unknown as (raw: RawEvent) => void);

  return {
    name,
    adapter,
    runtime,
    turnBySession,
    decisionBySession,
    enforcedBySession,
    hasBlockTransport: typeof blockTransport === 'function',
    get lastDecision(): HostDecision {
      const values = [...decisionBySession.values()];
      return values.length > 0 ? (values[values.length - 1] as HostDecision) : emptyDecision();
    },
    steer: drive,
  };
}
