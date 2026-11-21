import {
  parseHookPayload,
  serializeHookDecision,
  shouldSteerPreToolUse,
  type HookSerializeOptions,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/**
 * ChatGPT / Codex 兼容 hook：事件名在 hook_event_name，
 * hook 命令的 --event 经 ARCS_EVENT 兜底。字段别名取 Claude/Codex 并集。
 */
export function parseChatgptHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  return parseHookPayload(text, env, {
    eventKeys: ['hook_event_name', 'event', 'eventName'],
    sessionKeys: ['session_id', 'sessionId'],
    toolNameKeys: ['tool_name', 'toolName', 'name'],
    toolUseIdKeys: ['tool_use_id', 'toolUseId', 'id'],
    toolArgsKeys: ['tool_input', 'input', 'args'],
    promptKeys: ['prompt', 'message'],
  });
}

export const shouldSteerChatgpt = shouldSteerPreToolUse;

/** Tier A：支持 updatedInput 与 deny；ask 在本契约下降级为 deny 并说明 */
const CHATGPT_PROFILE: HookSerializeOptions = {
  permissionOf: (kind) => (kind === 'allow' ? 'allow' : 'deny'),
  reasonOf: (decision, permission) => {
    if (decision.kind === 'ask') {
      return `需要人工审批，当前 ChatGPT/Codex 兼容契约不支持挂起，已阻止：${decision.reason || 'ARCS 策略阻断了该操作'}`;
    }
    return permission === 'deny' ? decision.reason?.trim() || 'ARCS 策略阻断了该操作' : undefined;
  },
  updatedInputKey: 'updatedInput',
  allowOnlyWithUpdatedInput: true,
};

export function serializeChatgpt(decision: HostDecision, native: NativeEvent | undefined): string {
  return serializeHookDecision(decision, native, CHATGPT_PROFILE);
}
