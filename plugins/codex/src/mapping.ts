import {
  parseHookPayload,
  serializeHookDecision,
  shouldSteerPreToolUse,
  type HookSerializeOptions,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/**
 * Codex 把 hook 名放在 hook_event_name；命令行 --event 仅作宿主侧登记，
 * 解析以 stdin JSON 为准，env.ARCS_EVENT / --event 为兜底。
 */
export function parseCodexHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  return parseHookPayload(text, env, {
    eventKeys: ['hook_event_name', 'event', 'eventName'],
    sessionKeys: ['session_id', 'sessionId'],
    toolNameKeys: ['tool_name', 'toolName', 'name'],
    toolUseIdKeys: ['tool_use_id', 'toolUseId', 'id'],
    toolArgsKeys: ['tool_input', 'input', 'args'],
    promptKeys: ['prompt', 'message'],
  });
}

/** 只在 PreToolUse 前置拦截时纠偏，其余生命周期事件直接放行 */
export const shouldSteerCodex = shouldSteerPreToolUse;

/**
 * Codex 兼容序列化（官方 output_parser 规则）：
 * - allow 必须与 updatedInput 成对；无改写时只输出 additionalContext
 * - deny 必须带非空 reason；ask 在当前版本「parsed but not supported」，降级为 deny 并说明
 */
const CODEX_PROFILE: HookSerializeOptions = {
  permissionOf: (kind) => (kind === 'allow' ? 'allow' : 'deny'),
  reasonOf: (decision, permission) => {
    if (decision.kind === 'ask') {
      return `需要人工审批，但当前 Codex 不支持 permissionDecision:ask，已阻止：${decision.reason || 'ARCS 策略阻断了该操作'}`;
    }
    return permission === 'deny' ? decision.reason?.trim() || 'ARCS 策略阻断了该操作' : undefined;
  },
  updatedInputKey: 'updatedInput',
  allowOnlyWithUpdatedInput: true,
};

export function serializeCodex(decision: HostDecision, native: NativeEvent | undefined): string {
  return serializeHookDecision(decision, native, CODEX_PROFILE);
}
