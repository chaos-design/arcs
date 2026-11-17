import {
  nativeToRaw,
  pickRecord,
  pickString,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';
import type { RawEvent } from '@chaos-design/arcs-plugin-kit';

/** ARCS 规范事件名（已知事件有补全，未知事件原样保留） */
export type CanonicalEvent =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PermissionRequest'
  | 'AgentMessage'
  | 'Stop'
  | 'StopFailure'
  | 'UserPromptSubmit'
  | 'Reasoning'
  | 'SessionEnd'
  | (string & {});

/** Pi 事件载荷的最小形态（只取插件所需字段） */
export interface PiEvent {
  type?: string;
  isError?: boolean;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 原生事件名 → 规范事件名。未知事件原样保留 */
export function mapPiEvent(eventName: string, payload: PiEvent = {}): CanonicalEvent {
  switch (eventName) {
    case 'session_start':
      return 'SessionStart';
    case 'input':
      return 'UserPromptSubmit'; // 仅暂存，实际提交在 before_agent_start
    case 'before_agent_start':
      return 'UserPromptSubmit';
    case 'tool_call':
      return 'PreToolUse';
    case 'tool_result':
      return payload.isError ? 'PostToolUseFailure' : 'PostToolUse';
    case 'message_end':
      return payload.type === 'thinking' ? 'Reasoning' : 'AgentMessage';
    case 'session_shutdown':
      return 'SessionEnd';
    default:
      return eventName; // user_bash / model_select / session_* 等观测事件原样保留
  }
}

/** 原生事件 → RawEvent（复用 host-kit 的 nativeToRaw 映射基类） */
export function piEventToRaw(
  eventName: string,
  payload: PiEvent = {},
  canonical: CanonicalEvent = mapPiEvent(eventName, payload),
): RawEvent {
  const props = payload as Record<string, unknown>;
  const toolName = pickString(props, ['toolName', 'tool', 'name']) || undefined;
  const toolUseId = pickString(props, ['toolCallId', 'tool_call_id', 'callID']) || undefined;
  const toolArgs = pickRecord(props, ['args', 'arguments', 'input', 'parameters']);
  const thought = pickString(props, ['text', 'prompt', 'message', 'content']) || undefined;

  const native: NativeEvent = {
    eventName: canonical,
    sessionId: pickString(props, ['sessionId', 'sessionID'], 'unknown-session'),
    timestamp: typeof props['timestamp'] === 'number' ? (props['timestamp'] as number) : Date.now(),
    toolUseId,
    toolName,
    toolArgs,
    thought,
    payload: { ...props, nativeType: eventName, canonical },
  };
  return nativeToRaw('pi', native);
}

/** 宿主决策 → Pi 扩展回写动作（Tier B：无改参/挂起，仅注入 + block） */
export interface PiDecision {
  /** before_agent_start 注入的提示文本（空串表示无需注入） */
  injected: string;
  /** tool_call 阻断动作 */
  block?: { reason: string };
  degraded: string[];
  level: HostDecision['level'];
}

export function translatePiDecision(decision: HostDecision): PiDecision {
  return {
    injected: decision.injected.map((m) => m.content).join('\n'),
    ...(decision.kind === 'block' ? { block: { reason: decision.reason ?? '' } } : {}),
    // patchArgs=false → PatchArgs 已降级为注入；suspend=false → Suspend 已降级为 block
    degraded: [...decision.degraded],
    level: decision.level,
  };
}
