import {
  makeNativeEvent,
  nativeToRaw,
  pickRecord,
  pickString,
  type HostDecision,
} from '@chaos-design/arcs-host-kit';
import type { RawEvent } from '@chaos-design/arcs-plugin-kit';

/**
 * ARCS 规范事件名（与 claude-code 的 hook 名对齐，供跨平台上报与审计）。
 * `(string & {})` 让已知事件有补全，同时允许未知事件名原样保留。
 */
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

/** OpenCode 全局事件的最小形态（只取插件所需字段，不绑定宿主完整类型） */
export interface OpencodeEvent {
  type: string;
  sessionID?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 原生事件 → 规范事件名。未知事件原样保留（不下丢，便于前向兼容新宿主事件）。
 */
export function mapOpencodeEvent(event: OpencodeEvent): CanonicalEvent {
  switch (event.type) {
    case 'session.created':
      return 'SessionStart';
    case 'session.tool.called':
      return 'PreToolUse';
    case 'session.tool.success':
      return 'PostToolUse';
    case 'session.tool.failed':
      return 'PostToolUseFailure';
    case 'permission.asked':
      return 'PermissionRequest';
    case 'session.text.ended':
      return 'AgentMessage';
    case 'session.step.ended': {
      const props = event.properties ?? {};
      const finish = pickString(props, ['finish', 'finishReason', 'reason']);
      if (finish === 'stop' || finish === 'end_turn') return 'Stop';
      if (finish === 'error' || finish === 'failed') return 'StopFailure';
      return event.type; // 未知 finish 保留
    }
    default:
      return event.type; // 未知事件保留
  }
}

/** 从事件取会话 ID（供 claim 与 RawEvent 共用） */
export function opencodeSessionId(event: OpencodeEvent): string {
  return pickString(event as unknown as Record<string, unknown>, ['sessionID', 'sessionId'], 'unknown-session');
}

/**
 * 原生事件 → RawEvent。工具信息从 properties 的多种别名中提取，
 * 统一写入 NativeEvent，再复用 host-kit 的 nativeToRaw（平台内不重复实现映射基类）。
 */
export function opencodeEventToRaw(event: OpencodeEvent): RawEvent {
  const canonical = mapOpencodeEvent(event);
  const props = (event.properties ?? {}) as Record<string, unknown>;
  const toolName = pickString(props, ['tool', 'toolName', 'name']) || undefined;
  const toolUseId = pickString(props, ['toolCallID', 'callID', 'toolUseId']) || undefined;
  const toolArgs = pickRecord(props, ['args', 'arguments', 'input', 'parameters']);
  const thought = pickString(props, ['text', 'prompt', 'thought', 'content']) || undefined;

  const native = makeNativeEvent({
    eventName: canonical,
    sessionId: opencodeSessionId(event),
    timestamp: typeof props['timestamp'] === 'number' ? (props['timestamp'] as number) : undefined,
    toolUseId,
    toolName,
    toolArgs,
    thought,
    payload: { ...props, nativeType: event.type, canonical },
  });
  return nativeToRaw('opencode', native);
}

/** 工具中间件入参 → RawEvent（PreToolUse 前置拦截） */
export function opencodeToolInputToRaw(
  input: { tool?: string; toolName?: string; callID?: string; sessionID?: string; args?: Record<string, unknown> },
): RawEvent {
  const native = makeNativeEvent({
    eventName: 'PreToolUse',
    sessionId: input.sessionID,
    toolUseId: input.callID,
    toolName: input.tool ?? input.toolName,
    toolArgs: input.args ?? {},
    payload: { nativeType: 'session.tool.called', canonical: 'PreToolUse' },
  });
  return nativeToRaw('opencode', native);
}

/** 宿主决策 → OpenCode 工具中间件回写动作 */
export interface OpencodeDecision {
  /** L1 PatchArgs：整体替换后写回 output.args */
  updatedInput?: Record<string, unknown>;
  /** L2/L3 注入的上下文文本 */
  injected: string[];
  /** L4 Suspend（Tier A）：需通过权限询问挂起等待审批 */
  ask?: { tool: string; reason: string };
  /** 阻断（降级或宿主请求）， throw 拒绝执行 */
  block?: { reason: string };
  degraded: string[];
  level: HostDecision['level'];
}

/** 把 host-kit 的通用决策翻译为 OpenCode 中间件的具体动作 */
export function translateOpencodeDecision(decision: HostDecision, tool = 'unknown'): OpencodeDecision {
  return {
    ...(decision.updatedInput ? { updatedInput: decision.updatedInput } : {}),
    injected: decision.injected.map((m) => m.content),
    ...(decision.kind === 'ask' ? { ask: { tool, reason: decision.reason ?? '' } } : {}),
    ...(decision.kind === 'block' ? { block: { reason: decision.reason ?? '' } } : {}),
    degraded: [...decision.degraded],
    level: decision.level,
  };
}
