import {
  parseHookPayload,
  pickRecord,
  serializeHookDecision,
  shouldSteerPreToolUse,
  type HookSerializeOptions,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/**
 * ZCode 的 hook 载荷是 Claude Code 兼容形态并带自有字段别名：
 * toolCallId → toolUseId，toolInput → toolArgs，toolResponse → payload，
 * Stop 事件的 responseText → thought。
 */
export function parseZcodeHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  return parseHookPayload(text, env, {
    eventKeys: ['hook_event_name', 'event', 'eventName'],
    sessionKeys: ['session_id', 'sessionId'],
    toolNameKeys: ['tool_name', 'toolName', 'name'],
    toolUseIdKeys: ['toolCallId', 'tool_use_id', 'toolUseId', 'id'],
    toolArgsKeys: ['toolInput', 'tool_input', 'input', 'args'],
    promptKeys: ['prompt'],
    thoughtKeys: ['responseText'],
    thoughtEvents: ['Stop'],
    payload: (obj) =>
      pickRecord(obj, ['toolResponse', 'tool_response', 'response']) ?? obj,
  });
}

/** 只在 PreToolUse 前置拦截时纠偏，其余生命周期事件直接放行 */
export const shouldSteerZcode = shouldSteerPreToolUse;

/** Tier B：可 deny、无改参与审批回调通道；ask 也保守映射为 deny */
const ZCODE_PROFILE: HookSerializeOptions = {
  permissionOf: (kind) => (kind === 'allow' ? 'allow' : 'deny'),
  updatedInputKey: 'updatedInput',
};

export function serializeZcode(decision: HostDecision, native: NativeEvent | undefined): string {
  return serializeHookDecision(decision, native, ZCODE_PROFILE);
}
