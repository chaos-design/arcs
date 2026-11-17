import {
  pickRecord,
  pickString,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/**
 * WorkBuddy 不把事件名放进 stdin payload，事件名由 hook 命令的 `--event=<Name>`
 * 注入到 ARCS_EVENT 环境变量后再交给 host-kit 的 parse 读取。
 * 会话上下文来自 CODEBUDDY_SESSION_ID / CODEBUDDY_PROJECT_DIR。
 */
export function parseWorkbuddyHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
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
  const sessionId =
    env['CODEBUDDY_SESSION_ID'] || pickString(obj, ['session_id', 'sessionId'], 'unknown-session');
  const toolInput = pickRecord(obj, ['tool_input', 'toolInput', 'input', 'args']) ?? {};
  const prompt = pickString(obj, ['prompt', 'message', 'text']);

  return {
    eventName,
    sessionId,
    timestamp: typeof obj['timestamp'] === 'number' ? (obj['timestamp'] as number) : Date.now(),
    toolUseId: pickString(obj, ['tool_use_id', 'toolUseId', 'tool_call_id']) || undefined,
    toolName: pickString(obj, ['tool_name', 'toolName', 'name']) || undefined,
    toolArgs: Object.keys(toolInput).length > 0 ? toolInput : undefined,
    thought: eventName === 'UserPromptSubmit' ? prompt || undefined : undefined,
    payload: { ...obj, projectDir: env['CODEBUDDY_PROJECT_DIR'] },
  };
}

/** 把 hook 命令的 --event 参数固化为 parse 闭包，勿改动 host-kit */
export function withWorkbuddyEvent(
  eventArg: string,
): (text: string, env: NodeJS.ProcessEnv) => NativeEvent {
  return (text, env) => parseWorkbuddyHook(text, { ...env, ARCS_EVENT: eventArg || env['ARCS_EVENT'] });
}

/** 只在 PreToolUse 前置拦截时纠偏，其余生命周期事件直接放行 */
export function shouldSteerWorkbuddy(native: NativeEvent): boolean {
  return native.eventName === 'PreToolUse';
}

/** 决策 → WorkBuddy hookSpecificOutput（Tier B：可 block，无 updatedInput 通道） */
export function serializeWorkbuddy(decision: HostDecision, native: NativeEvent | undefined): string {
  if (native?.eventName !== 'PreToolUse') return '{}';

  const permissionDecision = decision.kind === 'allow' ? 'allow' : 'deny';
  const reason =
    decision.reason && decision.reason.trim()
      ? decision.reason
      : permissionDecision === 'deny'
        ? 'ARCS 策略阻断了该操作'
        : undefined;

  const context = [
    ...decision.injected.map((m) => m.content),
    ...(decision.degraded.length > 0 ? [`[ARCS 能力降级] ${decision.degraded.join(', ')}`] : []),
  ].join('\n');

  const hso: Record<string, unknown> = {
    hookEventName: 'PreToolUse',
    permissionDecision,
    ...(reason ? { permissionDecisionReason: reason } : {}),
    // WorkBuddy 的改参字段是 modifiedInput（局部覆盖），不是 updatedInput
    ...(decision.kind === 'allow' && decision.updatedInput
      ? { modifiedInput: decision.updatedInput }
      : {}),
    ...(context ? { additionalContext: context } : {}),
  };
  const output: Record<string, unknown> = { continue: true, hookSpecificOutput: hso };

  return JSON.stringify(output);
}
