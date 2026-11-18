import { readFileSync } from 'node:fs';
import type { ExecutionContext, SteeringEffect } from '@chaos-design/arcs-core';
import type { TelemetrySink } from '@chaos-design/arcs-telemetry';
import {
  PluginRuntime,
  configToPolicy,
  effectLevel,
  resolveConfig,
  type ArcsConfig,
  type ConfigOverrides,
  type HostAdapter,
  type KitHandles,
  type MaterializeResult,
  type RawEvent,
} from '@chaos-design/arcs-plugin-kit';
import type { HostCapabilities } from './capabilities.js';
import { createAuditSink } from './audit-sink.js';
import { applyEffect, emptyDecision, type HostDecision } from './decision.js';
import { nativeToRaw, toolCallFromNative, type NativeEvent } from './mapping.js';

export interface HookEntryOptions {
  /** 平台名（来自 platforms.ts，禁止硬编码字符串散落） */
  source: string;
  capabilities: HostCapabilities;
  goal: string;
  /** 把宿主 stdin 文本解析为中间事件 */
  parse: (text: string, env: NodeJS.ProcessEnv) => NativeEvent;
  /** 仅对真正需要纠偏的事件运行引擎；其余事件直接放行（避免 prompt 文本误触发） */
  shouldSteer?: (native: NativeEvent) => boolean;
  /** 把宿主决策序列化为该平台的 hook 输出 */
  serialize: (decision: HostDecision, native: NativeEvent | undefined) => string;
  config?: ConfigOverrides;
  /** 显式审计端；未提供时按 ARCS_AUDIT_FILE / ARCS_HOME 环境变量构造 */
  sink?: TelemetrySink;
  /** 测试注入：跳过 stdin 读取 */
  input?: string;
  write?: (text: string) => void;
  errWrite?: (text: string) => void;
}

/**
 * Hook 型平台的一次性适配器：
 * - subscribe 空操作（hook 是单次调用，不是长订阅）
 * - Suspend 不在此处同步调用 hitl.request（hook 有 5s 超时），而是按能力翻译为 ask/block
 * - 真正的异步 HITL 仅由具备事件订阅能力的平台（opencode/pi）在其专用 adapter 内完成
 */
export class HookEntryAdapter implements HostAdapter {
  readonly decision: HostDecision = emptyDecision();
  private config: ArcsConfig = resolveConfig();
  private readonly subject = { name: 'unknown', args: {} as Record<string, unknown> };
  private readonly effects: SteeringEffect[] = [];

  constructor(
    private readonly source: string,
    private readonly capabilities: HostCapabilities,
    private readonly goal: string,
    private readonly subscribeFn?: (notify: (raw: RawEvent) => void) => void,
  ) {}

  setup(handles: KitHandles): void {
    this.config = handles.config;
  }

  subscribe(notify: (raw: RawEvent) => void): void {
    // Hook 平台为空；事件订阅型平台（opencode/pi/deepseek）注入订阅函数
    this.subscribeFn?.(notify);
  }

  /** 长订阅平台每次事件前复位，避免上一次的决策残留 */
  reset(): void {
    this.decision.kind = 'allow';
    this.decision.reason = undefined;
    this.decision.updatedInput = undefined;
    this.decision.updatedName = undefined;
    this.decision.injected = [];
    this.decision.degraded = [];
    this.decision.level = null;
    this.effects.length = 0;
  }

  normalize(raw: RawEvent): ExecutionContext {
    const toolCall = toolCallFromNative(raw);
    this.subject.name = toolCall.name;
    this.subject.args = toolCall.args;
    const p = (raw.payload ?? {}) as Record<string, unknown>;
    return {
      goal: this.goal,
      thought: typeof p['thought'] === 'string' ? p['thought'] : '',
      toolCall,
      history: [],
      budget: { stepsUsed: 0, stepsMax: 15, elapsedMs: 0 },
      policy: configToPolicy(this.config),
    };
  }

  async materialize(effect: SteeringEffect): Promise<MaterializeResult> {
    this.effects.push(effect);
    applyEffect(this.decision, effect, this.capabilities, this.subject);
    this.decision.level = effectLevel(this.effects);
    return { applied: true };
  }
}

/** 从 hook 命令参数或环境读取纠偏目标（--goal=... / --goal ... / ARCS_GOAL） */
export function goalFromArgs(argv: string[], env: NodeJS.ProcessEnv): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--goal=')) return arg.slice('--goal='.length);
    if (arg === '--goal' && argv[i + 1]) return argv[i + 1] as string;
  }
  return env['ARCS_GOAL'] ?? '';
}

/** 读取 stdin（测试可传入 input 绕过） */
export function readInput(input?: string): string {
  if (input !== undefined) return input;
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Hook 入口桥：stdin → NativeEvent → RawEvent → PluginRuntime.run → 宿主输出。
 * 任何异常都 fail-open：输出放行决策、错误只写 stderr、退出码由调用方保持 0。
 */
export async function runHookEntry(options: HookEntryOptions): Promise<HostDecision> {
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const errWrite = options.errWrite ?? ((text: string) => process.stderr.write(text));
  let native: NativeEvent | undefined;
  let decision = emptyDecision();

  try {
    const text = readInput(options.input);
    native = options.parse(text, process.env);
    if (options.shouldSteer && !options.shouldSteer(native)) {
      decision = emptyDecision();
    } else {
      const raw = nativeToRaw(options.source, native);
      const adapter = new HookEntryAdapter(options.source, options.capabilities, options.goal);
      const runtime = new PluginRuntime(adapter, {
      host: options.config,
      sink: options.sink ?? createAuditSink(),
    });
      await runtime.run(raw);
      decision = adapter.decision;
    }
  } catch (err) {
    errWrite(`[arcs:${options.source}] fail-open，异常已放行：${String(err)}\n`);
    decision = { ...emptyDecision(), reason: 'arcs fail-open' };
  }

  try {
    write(options.serialize(decision, native));
  } catch (err) {
    errWrite(`[arcs:${options.source}] 输出宿主决策失败，已放行：${String(err)}\n`);
  }
  return decision;
}
