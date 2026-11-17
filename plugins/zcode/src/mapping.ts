import {
  pickString,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/**
 * ZCode 的 hook 载荷是 Claude Code 兼容形态并带自有字段别名：
 * - toolCallId → toolUseId
 * - toolInput  → toolArgs
 * - toolResponse → payload
 * - Stop 事件的 responseText → thought
 * 事件名从 stdin JSON 读取，env.ARCS_EVENT 为兜底。
 */
export function parseZcodeHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  let obj: Record<string, unknown> = {};
  try {
    obj = (JSON.parse(text || '{}') ?? {}) as Record<string, unknown>;
  } catch {
    obj = {};
  }

  const eventName = pickString(obj, ['hook_event_name', 'event', 'eventName'], env['ARCS_EVENT'] ?? 'unknown');
  const prompt = pickString(obj, ['prompt', 'message']);
  const responseText = pickString(obj, ['responseText']);

  let thought: string | undefined;
  if (eventName === 'UserPromptSubmit') {
    thought = prompt || undefined;
  } else if (eventName === 'Stop' && responseText) {
    thought = responseText;
  }

  return {
    eventName,
    sessionId: pickString(obj, ['session_id', 'sessionId'], 'unknown-session'),
    timestamp: typeof obj['timestamp'] === 'number' ? (obj['timestamp'] as number) : Date.now(),
    toolUseId: pickString(obj, ['toolCallId', 'tool_use_id', 'toolUseId', 'id']) || undefined,
    toolName: pickString(obj, ['tool_name', 'toolName', 'name']) || undefined,
    toolArgs: pickToolArgs(obj),
    thought,
    payload: pickRecord(obj, ['toolResponse', 'tool_response', 'response']) ?? obj,
  };
}

/** 工具实参：对象直接取用，字符串按 Bash 的 command 约定包裹 */
function pickToolArgs(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const key of ['toolInput', 'tool_input', 'input', 'args']) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      return { command: value };
    }
  }
  return undefined;
}

function pickRecord(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

/** 只在 PreToolUse 前置拦截时纠偏，其余生命周期事件直接放行 */
export function shouldSteerZcode(native: NativeEvent): boolean {
  return native.eventName === 'PreToolUse';
}

/**
 * 决策 → ZCode（Claude Code 兼容）hook 输出。
 * ZCode 是 Tier B：可 deny、无改参与审批回调通道，L4 由 host-kit 降级为 block。
 * 因此这里的 kind 只会是 allow/block（ask 也保守映射为 deny），updatedInput 通常为空。
 */
export function serializeZcode(decision: HostDecision, native: NativeEvent | undefined): string {
  if (native?.eventName !== 'PreToolUse') return '{}';

  const permissionDecision = decision.kind === 'allow' ? 'allow' : 'deny';
  // deny 必须带非空 reason，否则宿主可能判 hook 失败并放行原调用
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

  const hookSpecificOutput: Record<string, unknown> = {
    hookEventName: 'PreToolUse',
    permissionDecision,
    ...(reason ? { permissionDecisionReason: reason } : {}),
    ...(decision.kind === 'allow' && decision.updatedInput
      ? { updatedInput: decision.updatedInput }
      : {}),
    ...(context ? { additionalContext: context } : {}),
  };

  return JSON.stringify({ hookSpecificOutput });
}
