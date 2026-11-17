import { capabilitiesFor, createAuditSink, createSessionClaim, emptyDecision, HookEntryAdapter, type HostDecision } from '@chaos-design/arcs-host-kit';
import { PluginRuntime, type ConfigOverrides, type RawEvent } from '@chaos-design/arcs-plugin-kit';

/** 文件锁会话 claim：Pi 会话可 resume，旧 owner 退出后新进程可接管 */
let sessionClaim = createSessionClaim('pi');

export function claimSession(sessionId: string): boolean {
  return sessionClaim.claim(sessionId);
}

export function configureClaims(home: string): void {
  sessionClaim.releaseAll();
  sessionClaim = createSessionClaim('pi', home);
}

export function resetClaims(): void {
  sessionClaim.releaseAll();
}

/** 复用 host-kit 的唯一适配器：订阅函数注入第 4 参，长订阅事件前 reset() */
export function createPiAdapter(
  goal: string,
  subscribeFn?: (notify: (raw: RawEvent) => void) => void,
): HookEntryAdapter {
  return new HookEntryAdapter('pi', capabilitiesFor('pi'), goal, subscribeFn);
}

export interface PipelineOptions {
  goal?: string;
  /** 测试/观测钩子：每次映射出的 RawEvent 都会回调 */
  onRaw?: (raw: RawEvent) => void;
  /** 审计端；未提供时按 ARCS_AUDIT_FILE / ARCS_HOME 环境变量构造 */
  sink?: ReturnType<typeof createAuditSink>;
  /** 宿主策略覆盖（如 redirectMap） */
  config?: ConfigOverrides;
}

export interface SteeringPipeline {
  readonly runtime: PluginRuntime;
  readonly adapter: HookEntryAdapter;
  /** 复位 → 运行引擎 → 返回本次决策；任何异常 fail-open 返回 allow */
  run(raw: RawEvent): Promise<HostDecision>;
}

/** 一条独立管线（观测订阅与工具调用各用一条，避免共享可变 decision 串扰） */
export function createPipeline(
  subscribeFn?: (notify: (raw: RawEvent) => void) => void,
  options: PipelineOptions = {},
): SteeringPipeline {
  const adapter = createPiAdapter(options.goal ?? '', subscribeFn);
  const runtime = new PluginRuntime(adapter, {
    host: options.config,
    sink: options.sink ?? createAuditSink(),
  });
  return {
    runtime,
    adapter,
    async run(raw: RawEvent): Promise<HostDecision> {
      options.onRaw?.(raw);
      adapter.reset();
      try {
        await runtime.run(raw);
        return { ...adapter.decision };
      } catch {
        return emptyDecision();
      }
    },
  };
}
