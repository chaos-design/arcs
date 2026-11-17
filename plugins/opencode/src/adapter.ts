import { capabilitiesFor, createAuditSink, createSessionClaim, emptyDecision, HookEntryAdapter, type HostDecision } from '@chaos-design/arcs-host-kit';
import { PluginRuntime, type ConfigOverrides, type RawEvent } from '@chaos-design/arcs-plugin-kit';

/**
 * 文件锁会话 claim：跨进程互斥，旧 owner 退出或超过 TTL 后可接管。
 * HOME 解析集中在 host-kit，可用 ARCS_CLAIM_HOME 覆盖（测试隔离）。
 */
let sessionClaim = createSessionClaim('opencode');

/** 覆盖 claim 根目录（测试隔离 / 自定义部署），会释放此前持有的 claim */
export function configureClaims(home: string): void {
  sessionClaim.releaseAll();
  sessionClaim = createSessionClaim('opencode', home);
}

export function claimSession(sessionId: string): boolean {
  return sessionClaim.claim(sessionId);
}

/** 仅供测试隔离：释放本句柄抢到的 claim */
export function resetClaims(): void {
  sessionClaim.releaseAll();
}

/** 复用 host-kit 的唯一适配器：订阅函数注入第 4 参，长订阅事件前 reset() */
export function createOpencodeAdapter(
  goal: string,
  subscribeFn?: (notify: (raw: RawEvent) => void) => void,
): HookEntryAdapter {
  return new HookEntryAdapter('opencode', capabilitiesFor('opencode'), goal, subscribeFn);
}

export interface PipelineOptions {
  goal?: string;
  /** 测试/观测钩子：每次映射出的 RawEvent 都会回调 */
  onRaw?: (raw: RawEvent) => void;
  /** 审计端；未提供时按 ARCS_AUDIT_FILE / ARCS_HOME 环境变量构造 */
  sink?: ReturnType<typeof createAuditSink>;
  /** 宿主策略覆盖（如 redirectMap），用于产生 L2/L3 注入 */
  config?: ConfigOverrides;
}

export interface SteeringPipeline {
  readonly runtime: PluginRuntime;
  readonly adapter: HookEntryAdapter;
  /** 复位 → 运行引擎 → 返回本次决策；任何异常 fail-open 返回 allow */
  run(raw: RawEvent): Promise<HostDecision>;
}

/** 一条独立管线（避免观测订阅与工具中间件共享可变 decision 造成串扰） */
export function createPipeline(subscribeFn?: (notify: (raw: RawEvent) => void) => void, options: PipelineOptions = {}): SteeringPipeline {
  const adapter = createOpencodeAdapter(options.goal ?? '', subscribeFn);
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
