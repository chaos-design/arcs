import type { HostDecision, HostDecisionKind } from './decision.js';
import { pickRecord, pickString, type NativeEvent } from './mapping.js';

/**
 * Hook 型宿主的统一解析/序列化原语。
 *
 * 各插件过去各写一份 parse/serialize，行为细微差异只能靠契约护栏逐个钉死。
 * 这里把「从 stdin JSON 取字段」与「把 HostDecision 翻成宿主输出」收敛为两份
 * 声明式配置；插件只保留宿主本身的差异（事件名、字段别名、Tier 策略）。
 */

/** stdin JSON → NativeEvent 的字段来源配置。所有键均为「按优先级尝试」的别名列表。 */
export interface HookParseOptions {
  eventKeys: string[];
  sessionKeys?: string[];
  toolNameKeys?: string[];
  toolUseIdKeys?: string[];
  toolArgsKeys?: string[];
  /** 字符串实参是否包裹为 { command }；Claude Code 的 tool_input 恒为对象，关闭以保留原行为 */
  wrapStringArgs?: boolean;
  thoughtKeys?: string[];
  /** thoughtKeys 只在指定事件里读取（如 ZCode Stop 的 responseText） */
  thoughtEvents?: string[];
  promptKeys?: string[];
  /** 从这些事件名里取 prompt 作为 thought（默认 UserPromptSubmit） */
  promptEvents?: string[];
  /** 事件名兜底，显式值优先 */
  fallbackEvent?: string;
  /** 事件名兜底的环境变量名，默认 ARCS_EVENT；传 null 可禁用 */
  fallbackEventEnvKey?: string | null;
  /** 会话 ID 兜底，按顺序读取 env（如 CODEBUDDY_SESSION_ID） */
  sessionEnvKeys?: string[];
  /** 对解析出的对象做补充/改写，用于宿主自有字段（如 ZCode toolResponse） */
  payload?: (obj: Record<string, unknown>, env: NodeJS.ProcessEnv) => Record<string, unknown>;
}

/** 工具实参：对象直接取用，字符串按 Bash 的 command 约定包裹 */
export function pickToolArgs(
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      return { command: value };
    }
  }
  return undefined;
}

/** 构造 NativeEvent 的唯一入口：补齐 sessionId/timestamp 默认值，避免各插件散落字面量 */
export function makeNativeEvent(
  input: Omit<NativeEvent, 'sessionId'> & { sessionId?: string },
): NativeEvent {
  return {
    ...input,
    sessionId: input.sessionId || 'unknown-session',
    timestamp: input.timestamp ?? Date.now(),
  };
}

/** 统一的 hook 载荷解析：畸形 JSON 一律回退到空对象，绝不抛异常（fail-open） */
export function parseHookPayload(
  text: string,
  env: NodeJS.ProcessEnv,
  options: HookParseOptions,
): NativeEvent {
  let obj: Record<string, unknown> = {};
  try {
    obj = (JSON.parse(text || '{}') ?? {}) as Record<string, unknown>;
  } catch {
    obj = {};
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) obj = {};

  const envKey = options.fallbackEventEnvKey === null ? undefined : (options.fallbackEventEnvKey ?? 'ARCS_EVENT');
  const fallbackEvent = options.fallbackEvent ?? (envKey ? env[envKey] : undefined) ?? 'unknown';
  const eventName = pickString(obj, options.eventKeys, fallbackEvent);
  const promptEvents = options.promptEvents ?? ['UserPromptSubmit'];
  const prompt = pickString(obj, options.promptKeys ?? []);
  const thoughtKeys = options.thoughtKeys ?? [];

  let thought: string | undefined;
  if (promptEvents.includes(eventName) && prompt) thought = prompt;
  else if (!options.thoughtEvents || options.thoughtEvents.includes(eventName)) {
    thought = pickString(obj, thoughtKeys) || undefined;
  }

  const sessionId =
    pickString(obj, options.sessionKeys ?? []) ||
    (options.sessionEnvKeys ?? []).map((key) => env[key] ?? '').find(Boolean) ||
    'unknown-session';

  const keys = options.toolArgsKeys ?? [];
  const toolArgs =
    options.wrapStringArgs === false
      ? pickRecord(obj, keys)
      : pickToolArgs(obj, keys);

  return {
    eventName,
    sessionId,
    timestamp: typeof obj['timestamp'] === 'number' ? (obj['timestamp'] as number) : Date.now(),
    toolUseId: pickString(obj, options.toolUseIdKeys ?? []) || undefined,
    toolName: pickString(obj, options.toolNameKeys ?? []) || undefined,
    toolArgs: toolArgs && Object.keys(toolArgs).length > 0 ? toolArgs : undefined,
    thought,
    payload: options.payload ? options.payload(obj, env) : obj,
  };
}

/** 把 hook 命令的 --event 参数固化为 parse 闭包 */
export function withHookEvent(
  eventArg: string,
  parse: (text: string, env: NodeJS.ProcessEnv) => NativeEvent,
): (text: string, env: NodeJS.ProcessEnv) => NativeEvent {
  return (text, env) => parse(text, { ...env, ARCS_EVENT: eventArg || env['ARCS_EVENT'] });
}

/** 仅在 PreToolUse 前置决策点纠偏，其余生命周期事件放行 */
export function shouldSteerPreToolUse(native: NativeEvent): boolean {
  return native.eventName === 'PreToolUse';
}

/** 注入提示 + 能力降级说明，所有 Hook 插件共用同一拼装规则 */
export function hookContextText(decision: HostDecision): string {
  return [
    ...decision.injected.map((m) => m.content),
    ...(decision.degraded.length > 0 ? [`[ARCS 能力降级] ${decision.degraded.join(', ')}`] : []),
  ].join('\n');
}

/** 决策序列化配置：宿主差异全部在此声明，序列化算法只有一份 */
export interface HookSerializeOptions {
  /** 写入 hookSpecificOutput.hookEventName，默认 PreToolUse */
  eventName?: string;
  /** kind → 宿主 permissionDecision；返回 undefined 表示不写该字段 */
  permissionOf?: (kind: HostDecisionKind, decision: HostDecision) => 'allow' | 'deny' | 'ask' | undefined;
  /** 拒绝时的默认原因 */
  denyReason?: string;
  /** 自定义原因文案（Codex 的 ask→deny 需要解释降级） */
  reasonOf?: (decision: HostDecision, permission: 'allow' | 'deny' | 'ask') => string | undefined;
  /** 改参写回字段名；不设置表示宿主无改参通道 */
  updatedInputKey?: string;
  /** Codex parser 规则：allow 必须与 updatedInput 成对，否则不输出 permissionDecision */
  allowOnlyWithUpdatedInput?: boolean;
  /** Tier C 等只读宿主：无论决策如何都输出 allow */
  forceAllow?: boolean;
  /** 顶层 continue: true */
  topLevelContinue?: boolean;
}

const DEFAULT_DENY_REASON = 'ARCS 策略阻断了该操作';

/** HostDecision → 宿主 hook JSON。非目标事件输出 '{}'，由宿主放行 */
export function serializeHookDecision(
  decision: HostDecision,
  native: NativeEvent | undefined,
  options: HookSerializeOptions = {},
): string {
  const eventName = options.eventName ?? 'PreToolUse';
  if (!native || native.eventName !== eventName) return '{}';

  const permissionOf =
    options.permissionOf ??
    ((kind: HostDecisionKind) => (kind === 'block' ? 'deny' : kind));
  const permission = options.forceAllow
    ? 'allow'
    : permissionOf(decision.kind, decision);

  const denyReason = options.denyReason ?? DEFAULT_DENY_REASON;
  let reason: string | undefined;
  if (options.reasonOf && permission) {
    reason = options.reasonOf(decision, permission);
  } else if (permission === 'deny') {
    reason = decision.reason?.trim() || denyReason;
  } else if (decision.kind === 'ask' && !options.forceAllow) {
    reason = decision.reason?.trim() || undefined;
  }

  const context = hookContextText(decision);
  const hso: Record<string, unknown> = { hookEventName: eventName };

  if (permission && !(options.allowOnlyWithUpdatedInput && permission === 'allow' && !decision.updatedInput)) {
    hso['permissionDecision'] = permission;
  }
  if (reason) hso['permissionDecisionReason'] = reason;
  if (options.updatedInputKey && permission === 'allow' && decision.updatedInput) {
    hso[options.updatedInputKey] = decision.updatedInput;
  }
  if (context) hso['additionalContext'] = context;

  const output: Record<string, unknown> = options.topLevelContinue
    ? { continue: true, hookSpecificOutput: hso }
    : { hookSpecificOutput: hso };
  return JSON.stringify(output);
}
