import {
  pickRecord,
  pickString,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/** Claude Code 把 hook 名放在 hook_event_name；命令行 --event 作为兜底 */
export function parseClaudeHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  let obj: Record<string, unknown> = {};
  try {
    obj = (JSON.parse(text || '{}') ?? {}) as Record<string, unknown>;
  } catch {
    obj = {};
  }

  const eventName = pickString(obj, ['hook_event_name', 'event', 'eventName'], env['ARCS_EVENT'] ?? 'unknown');
  const toolInput = pickRecord(obj, ['tool_input', 'input']) ?? {};
  const prompt = pickString(obj, ['prompt']);

  return {
    eventName,
    sessionId: pickString(obj, ['session_id', 'sessionId'], 'unknown-session'),
    timestamp: typeof obj['timestamp'] === 'number' ? (obj['timestamp'] as number) : Date.now(),
    toolUseId: pickString(obj, ['tool_use_id', 'toolUseId']) || undefined,
    toolName: pickString(obj, ['tool_name', 'name']) || undefined,
    toolArgs: Object.keys(toolInput).length > 0 ? toolInput : undefined,
    thought: eventName === 'UserPromptSubmit' ? prompt || undefined : undefined,
    payload: obj,
  };
}

/** 只在 PreToolUse 前置拦截时纠偏，其余生命周期事件直接放行 */
export function shouldSteerClaude(native: NativeEvent): boolean {
  return native.eventName === 'PreToolUse';
}

/** 决策 → Claude Code PreToolUse hookSpecificOutput */
export function serializeClaude(decision: HostDecision, native: NativeEvent | undefined): string {
  if (native?.eventName !== 'PreToolUse') return '{}';

  // 宿主只接受 allow|deny|ask；ARCS 内部的 block 必须映射为 deny。
  const permissionDecision = decision.kind === 'block' ? 'deny' : decision.kind;
  const reason =
    decision.reason && decision.reason.trim()
      ? decision.reason
      : decision.kind === 'block'
        ? 'ARCS 策略阻断了该操作'
        : undefined;

  const context = [
    ...decision.injected.map((m) => m.content),
    ...(decision.degraded.length > 0 ? [`[ARCS 能力降级] ${decision.degraded.join(', ')}`] : []),
  ].join('\n');

  const output: Record<string, unknown> = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      ...(reason ? { permissionDecisionReason: reason } : {}),
      ...(decision.kind === 'allow' && decision.updatedInput
        ? { updatedInput: decision.updatedInput }
        : {}),
      // Claude Code 官方把 additionalContext 列在 hookSpecificOutput 内
      ...(context ? { additionalContext: context } : {}),
    },
  };

  return JSON.stringify(output);
}
