import {
  parseHookPayload,
  serializeHookDecision,
  shouldSteerPreToolUse,
  withHookEvent,
  type HookSerializeOptions,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/**
 * WorkBuddy 不把事件名放进 stdin payload，事件名由 hook 命令的 `--event=<Name>`
 * 注入到 ARCS_EVENT 后再交给统一解析原语；会话上下文来自 CODEBUDDY_SESSION_ID。
 */
export function parseWorkbuddyHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  return parseHookPayload(text, env, {
    eventKeys: ['event', 'eventName', 'hook_event_name'],
    sessionKeys: ['session_id', 'sessionId'],
    sessionEnvKeys: ['CODEBUDDY_SESSION_ID'],
    toolNameKeys: ['tool_name', 'toolName', 'name'],
    toolUseIdKeys: ['tool_use_id', 'toolUseId', 'tool_call_id'],
    toolArgsKeys: ['tool_input', 'toolInput', 'input', 'args'],
    promptKeys: ['prompt', 'message', 'text'],
    payload: (obj, env) => ({ ...obj, projectDir: env['CODEBUDDY_PROJECT_DIR'] }),
  });
}

/** 把 hook 命令的 --event 参数固化为 parse 闭包，勿改动 host-kit */
export const withWorkbuddyEvent = (eventArg: string) =>
  withHookEvent(eventArg, parseWorkbuddyHook);

/** 只在 PreToolUse 前置拦截时纠偏，其余生命周期事件直接放行 */
export const shouldSteerWorkbuddy = shouldSteerPreToolUse;

/** Tier B：可 block，无挂起通道；改参字段为 modifiedInput（局部覆盖） */
const WORKBUDDY_PROFILE: HookSerializeOptions = {
  permissionOf: (kind) => (kind === 'allow' ? 'allow' : 'deny'),
  updatedInputKey: 'modifiedInput',
  topLevelContinue: true,
};

export function serializeWorkbuddy(decision: HostDecision, native: NativeEvent | undefined): string {
  return serializeHookDecision(decision, native, WORKBUDDY_PROFILE);
}
