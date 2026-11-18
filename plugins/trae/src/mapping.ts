import {
  pickRecord,
  pickString,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/** 把 stdin 的宿主 payload 解析为统一中间事件（兼容事件名在 payload 或 --event 两种来源） */
export function parseTraeHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  let obj: Record<string, unknown> = {};
  try {
    obj = (JSON.parse(text || '{}') ?? {}) as Record<string, unknown>;
  } catch {
    obj = {};
  }

  const eventName = pickString(
    obj,
    ['event', 'eventName', 'hook_event_name'],
    env['ARCS_EVENT'] ?? 'unknown',
  );
  const toolInput = pickRecord(obj, ['tool_input', 'toolInput', 'input', 'args']) ?? {};
  const prompt = pickString(obj, ['prompt', 'message', 'text']);

  return {
    eventName,
    sessionId: pickString(
      obj,
      ['session_id', 'sessionId', 'conversation_id'],
      'unknown-session',
    ),
    timestamp: typeof obj['timestamp'] === 'number' ? (obj['timestamp'] as number) : Date.now(),
    toolUseId: pickString(obj, ['tool_use_id', 'toolUseId', 'tool_call_id']) || undefined,
    toolName: pickString(obj, ['tool_name', 'toolName', 'name']) || undefined,
    toolArgs: Object.keys(toolInput).length > 0 ? toolInput : undefined,
    thought: eventName === 'UserPromptSubmit' ? prompt || undefined : undefined,
    payload: obj,
  };
}

/** 把 hook 命令的 --event 参数固化为 parse 闭包，勿改动 host-kit */
export function withTraeEvent(
  eventArg: string,
): (text: string, env: NodeJS.ProcessEnv) => NativeEvent {
  return (text, env) => parseTraeHook(text, { ...env, ARCS_EVENT: eventArg || env['ARCS_EVENT'] });
}

/** 只在 PreToolUse 前置决策点采集与注入，其余事件透传放行 */
export function shouldSteerTrae(native: NativeEvent): boolean {
  return native.eventName === 'PreToolUse';
}

/**
 * 决策 → Trae hookSpecificOutput。
 * Trae 为 Tier C 只读：无 block/patchArgs/suspend，始终 fail-open 放行，
 * 仅通过 additionalContext 附带提示与降级说明。
 */
export function serializeTrae(decision: HostDecision, native: NativeEvent | undefined): string {
  if (native?.eventName !== 'PreToolUse') return '{}';

  const context = [
    ...decision.injected.map((m) => m.content),
    ...(decision.degraded.length > 0 ? [`[ARCS 能力降级] ${decision.degraded.join(', ')}`] : []),
  ].join('\n');

  // Trae 官方契约：permissionDecision 与 additionalContext 都在 hookSpecificOutput 内。
  // Tier C 始终放行，不阻断、不改参。
  const output: Record<string, unknown> = {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      ...(context ? { additionalContext: context } : {}),
    },
  };

  return JSON.stringify(output);
}
