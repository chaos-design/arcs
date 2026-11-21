import {
  parseHookPayload,
  serializeHookDecision,
  shouldSteerPreToolUse,
  withHookEvent,
  type HookSerializeOptions,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/** 把 stdin 的宿主 payload 解析为统一中间事件（兼容事件名在 payload 或 --event 两种来源） */
export function parseTraeHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  return parseHookPayload(text, env, {
    eventKeys: ['event', 'eventName', 'hook_event_name'],
    sessionKeys: ['session_id', 'sessionId', 'conversation_id'],
    toolNameKeys: ['tool_name', 'toolName', 'name'],
    toolUseIdKeys: ['tool_use_id', 'toolUseId', 'tool_call_id'],
    toolArgsKeys: ['tool_input', 'toolInput', 'input', 'args'],
    promptKeys: ['prompt', 'message', 'text'],
  });
}

/** 把 hook 命令的 --event 参数固化为 parse 闭包，勿改动 host-kit */
export const withTraeEvent = (eventArg: string) => withHookEvent(eventArg, parseTraeHook);

/** 只在 PreToolUse 前置决策点采集与注入，其余事件透传放行 */
export const shouldSteerTrae = shouldSteerPreToolUse;

/** Tier C 只读：始终 allow，仅通过 additionalContext 附带提示与降级说明 */
const TRAE_PROFILE: HookSerializeOptions = {
  forceAllow: true,
  topLevelContinue: true,
};

export function serializeTrae(decision: HostDecision, native: NativeEvent | undefined): string {
  return serializeHookDecision(decision, native, TRAE_PROFILE);
}
