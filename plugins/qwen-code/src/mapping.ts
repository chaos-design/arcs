import {
  parseHookPayload,
  serializeHookDecision,
  shouldSteerPreToolUse,
  type HookSerializeOptions,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/** Qwen Code CLI：Gemini 兼容 BeforeTool hook，stdin JSON + --event 兜底 */
export function parseQwenCodeHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  return parseHookPayload(text, env, {
    eventKeys: ['hook_event_name', 'event', 'eventName'],
    sessionKeys: ['session_id', 'sessionId'],
    toolNameKeys: ['tool_name', 'toolName', 'name'],
    toolUseIdKeys: ['tool_use_id', 'toolUseId', 'callId', 'id'],
    toolArgsKeys: ['tool_input', 'input', 'args', 'arguments'],
    promptKeys: ['prompt', 'message', 'text'],
  });
}

export const shouldSteerQwenCode = shouldSteerPreToolUse;

/** Tier B 保守策略：可注入与 deny；改参契约待核实，暂不写回 */
const QWEN_CODE_PROFILE: HookSerializeOptions = {
  permissionOf: (kind) => (kind === 'allow' ? 'allow' : 'deny'),
  topLevelContinue: true,
};

export function serializeQwenCode(decision: HostDecision, native: NativeEvent | undefined): string {
  return serializeHookDecision(decision, native, QWEN_CODE_PROFILE);
}
