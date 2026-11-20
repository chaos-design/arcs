import {
  parseHookPayload,
  serializeHookDecision,
  shouldSteerPreToolUse,
  type HookSerializeOptions,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/** PL Agent 通用 Hook 契约：stdin JSON + --event 兜底，字段取 Claude 兼容别名 */
export function parsePlAgentHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  return parseHookPayload(text, env, {
    eventKeys: ['hook_event_name', 'event', 'eventName'],
    sessionKeys: ['session_id', 'sessionId'],
    toolNameKeys: ['tool_name', 'toolName', 'name'],
    toolUseIdKeys: ['tool_use_id', 'toolUseId', 'callId'],
    toolArgsKeys: ['tool_input', 'input', 'args'],
    promptKeys: ['prompt', 'message', 'text'],
  });
}

export const shouldSteerPlAgent = shouldSteerPreToolUse;

/** Tier B：可注入与 deny，无改参/挂起通道；ask 降为 deny */
const PL_AGENT_PROFILE: HookSerializeOptions = {
  permissionOf: (kind) => (kind === 'allow' ? 'allow' : 'deny'),
  topLevelContinue: true,
};

export function serializePlAgent(decision: HostDecision, native: NativeEvent | undefined): string {
  return serializeHookDecision(decision, native, PL_AGENT_PROFILE);
}
