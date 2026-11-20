import {
  parseHookPayload,
  serializeHookDecision,
  shouldSteerPreToolUse,
  type HookSerializeOptions,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';
import type { HostDecision } from '@chaos-design/arcs-host-kit';

/** Claude Code 把 hook 名放在 hook_event_name；命令行 --event 作为兜底 */
export function parseClaudeHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  return parseHookPayload(text, env, {
    eventKeys: ['hook_event_name', 'event', 'eventName'],
    sessionKeys: ['session_id', 'sessionId'],
    toolNameKeys: ['tool_name', 'name'],
    toolUseIdKeys: ['tool_use_id', 'toolUseId'],
    toolArgsKeys: ['tool_input', 'input'],
    // Claude Code 的 tool_input 恒为对象，保留原行为：字符串不包裹为 command
    wrapStringArgs: false,
    promptKeys: ['prompt'],
  });
}

/** 只在 PreToolUse 前置拦截时纠偏，其余生命周期事件直接放行 */
export const shouldSteerClaude = shouldSteerPreToolUse;

/** Tier A：可改参 + ask/block，工具名不可改（L3 降级为注入） */
const CLAUDE_PROFILE: HookSerializeOptions = {
  permissionOf: (kind) => (kind === 'block' ? 'deny' : kind),
  updatedInputKey: 'updatedInput',
};

/** 决策 → Claude Code PreToolUse hookSpecificOutput */
export function serializeClaude(decision: HostDecision, native: NativeEvent | undefined): string {
  return serializeHookDecision(decision, native, CLAUDE_PROFILE);
}
