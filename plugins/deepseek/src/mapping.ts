import {
  makeNativeEvent,
  nativeToRaw,
  pickRecord,
  pickString,
  shouldSteerPreToolUse,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';
import type { RawEvent } from '@chaos-design/arcs-plugin-kit';

/**
 * DeepSeek Harness 投递的原生事件。字段来源多元，按常见别名兼容；
 * 映射本身是纯函数，畸形/缺失字段一律降级为 Notification，绝不抛异常（fail-open）。
 */
export interface HarnessEvent {
  type?: string;
  event?: string;
  name?: string;
  source?: { kind?: string } | string;
  sessionId?: string;
  session_id?: string;
  session?: { id?: string };
  turnId?: string;
  turn?: { id?: string } | string;
  toolName?: string;
  tool_name?: string;
  toolUseId?: string;
  tool_use_id?: string;
  callId?: string;
  tool?: Record<string, unknown>;
  toolCall?: Record<string, unknown>;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
  toolArgs?: Record<string, unknown>;
  isError?: boolean;
  error?: unknown;
  status?: string;
  reason?: { kind?: string } | string;
  thought?: string;
  message?: { role?: string; content?: string };
  content?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

/** 映射后的规范事件名（与 host-kit 各平台 hook 语义对齐，便于跨平台审计） */
export const CANONICAL_EVENTS = [
  'UserPromptSubmit',
  'AgentMessage',
  'Reasoning',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Interrupted',
  'StopFailure',
  'Stop',
  'SessionStart',
  'SessionEnd',
  'Notification',
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 兼容 { kind } / 字符串两种 reason、source 形态 */
function kindOf(value: unknown): string {
  if (typeof value === 'string') return value;
  return pickString(asRecord(value), ['kind', 'type', 'name']);
}

/** turn/end 的 reason.kind → 规范事件名 */
export function mapTurnEnd(reasonKind: string): 'Stop' | 'Interrupted' | 'StopFailure' {
  if (reasonKind === 'aborted' || reasonKind === 'interrupted') return 'Interrupted';
  if (reasonKind === 'error' || reasonKind === 'blocked') return 'StopFailure';
  return 'Stop';
}

/** Harness 原生事件 → host-kit NativeEvent（canonical 事件名） */
export function mapHarnessEvent(input: HarnessEvent | null | undefined): NativeEvent {
  const event = asRecord(input);
  const type = pickString(event, ['type', 'event', 'name']) || 'unknown';

  const session = asRecord(event['session']);
  const sessionId =
    pickString(event, ['sessionId', 'session_id']) ||
    pickString(session, ['id', 'sessionId']) ||
    'unknown-session';

  const tool = { ...asRecord(event['tool']), ...asRecord(event['toolCall']) };
  const toolName =
    pickString(event, ['toolName', 'tool_name']) || pickString(tool, ['name', 'toolName']);
  const toolUseId =
    pickString(event, ['callId', 'toolUseId', 'tool_use_id', 'id']) ||
    pickString(tool, ['callId', 'id']);
  const toolArgs =
    pickRecord(event, ['input', 'args', 'arguments', 'toolArgs']) ??
    pickRecord(tool, ['input', 'args', 'arguments']);

  const message = asRecord(event['message']);
  const thought =
    pickString(event, ['thought']) ||
    (typeof event['content'] === 'string' ? (event['content'] as string) : '') ||
    pickString(message, ['content']);

  let eventName: string;
  switch (type) {
    case 'user/message':
      eventName = 'UserPromptSubmit';
      break;
    case 'assistant/message':
      eventName = 'AgentMessage';
      break;
    case 'assistant/attempt':
      eventName = 'Reasoning';
      break;
    case 'tool/call':
      eventName = 'PreToolUse';
      break;
    case 'tool/result': {
      const isError =
        event['isError'] === true ||
        (event['error'] !== undefined && event['error'] !== null) ||
        kindOf(event['status']) === 'error';
      eventName = isError ? 'PostToolUseFailure' : 'PostToolUse';
      break;
    }
    case 'turn/end':
      eventName = mapTurnEnd(kindOf(event['reason']));
      break;
    case 'session/created':
      eventName = 'SessionStart';
      break;
    case 'session/disposed':
      eventName = 'SessionEnd';
      break;
    default:
      eventName = 'Notification';
  }

  return makeNativeEvent({
    eventName,
    sessionId,
    timestamp: typeof event['timestamp'] === 'number' ? (event['timestamp'] as number) : undefined,
    toolUseId: toolUseId || undefined,
    toolName: toolName || undefined,
    toolArgs: toolArgs && Object.keys(toolArgs).length > 0 ? toolArgs : undefined,
    thought: thought || undefined,
    // 保留原生语义，便于审计与未知事件回放
    payload: { ...event, nativeType: type, sourceKind: kindOf(event['source']) },
  });
}

/** 仅对工具调用前置事件纠偏（dangerous command 在此拦截），其余事件 fail-open 放行 */
export const shouldSteerDeepseek = shouldSteerPreToolUse;

/** 决策 → 规范序列化（审计/宿主可读，保留原生语义） */
export function serializeDeepseek(decision: HostDecision, native?: NativeEvent): string {
  return JSON.stringify({
    kind: decision.kind,
    ...(decision.reason ? { reason: decision.reason } : {}),
    ...(decision.injected.length > 0 ? { injected: decision.injected } : {}),
    ...(decision.degraded.length > 0 ? { degraded: decision.degraded } : {}),
    level: decision.level,
    ...(native ? { nativeEventName: native.eventName, sessionId: native.sessionId } : {}),
  });
}

/** Harness 原生事件 → ARCS RawEvent（深寻平台源固定为 deepseek） */
export function harnessToRaw(input: HarnessEvent | null | undefined): RawEvent {
  return nativeToRaw('deepseek', mapHarnessEvent(input));
}
