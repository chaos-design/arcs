import {
  pickString,
  type HostDecision,
  type NativeEvent,
} from '@chaos-design/arcs-host-kit';

/**
 * Codex 把 hook 名放在 hook_event_name；命令行 --event 仅作宿主侧登记，
 * 解析以 stdin JSON 为准，env.ARCS_EVENT 为兜底。
 * 工具字段弹性兼容 tool_name/tool_input/input/args。
 */
export function parseCodexHook(text: string, env: NodeJS.ProcessEnv): NativeEvent {
  let obj: Record<string, unknown> = {};
  try {
    obj = (JSON.parse(text || '{}') ?? {}) as Record<string, unknown>;
  } catch {
    obj = {};
  }

  const eventName = pickString(obj, ['hook_event_name', 'event', 'eventName'], env['ARCS_EVENT'] ?? 'unknown');
  const prompt = pickString(obj, ['prompt', 'message']);

  return {
    eventName,
    sessionId: pickString(obj, ['session_id', 'sessionId'], 'unknown-session'),
    timestamp: typeof obj['timestamp'] === 'number' ? (obj['timestamp'] as number) : Date.now(),
    toolUseId: pickString(obj, ['tool_use_id', 'toolUseId', 'id']) || undefined,
    toolName: pickString(obj, ['tool_name', 'toolName', 'name']) || undefined,
    toolArgs: pickToolArgs(obj),
    thought: eventName === 'UserPromptSubmit' ? prompt || undefined : undefined,
    payload: obj,
  };
}

/** 工具实参：对象直接取用，字符串按 Bash 的 command 约定包裹 */
function pickToolArgs(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const key of ['tool_input', 'input', 'args']) {
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

/** 只在 PreToolUse 前置拦截时纠偏，其余生命周期事件直接放行 */
export function shouldSteerCodex(native: NativeEvent): boolean {
  return native.eventName === 'PreToolUse';
}

/**
 * 决策 → Codex PreToolUse hookSpecificOutput。
 *
 * 依据 OpenAI 官方文档与生成的 JSON Schema（见 README 参考链接）：
 * - hookSpecificOutput.hookEventName 必填且恒为 "PreToolUse"；
 * - permissionDecision ∈ {allow, deny, ask}，allow + updatedInput 表示改写；
 * - deny + permissionDecisionReason 表示拒绝；
 * - ask 在当前 Codex 版本「parsed but not supported」，宿主会把 hook 判失败并
 *   放行原调用。出于 fail-safe，ask 决策降级为 deny 并写明需要人工审批。
 * 顶层与 hookSpecificOutput 均 additionalProperties:false，附加上下文只能放
 * hookSpecificOutput.additionalContext。
 */
export function serializeCodex(decision: HostDecision, native: NativeEvent | undefined): string {
  if (native?.eventName !== 'PreToolUse') return '{}';

  const hookSpecificOutput: Record<string, unknown> = { hookEventName: 'PreToolUse' };

  if (decision.kind === 'allow') {
    // Codex parser 规则：allow 与 updatedInput 必须成对出现；单独 allow 会被判失败并放行原调用。
    // 因此无改写时只输出附加上下文（或空对象），不输出 permissionDecision。
    if (decision.updatedInput) {
      hookSpecificOutput['permissionDecision'] = 'allow';
      hookSpecificOutput['updatedInput'] = decision.updatedInput;
    }
  } else {
    // deny 必须带非空 reason，否则 parser 判失败并放行原调用（fail-open 失效）。
    const fallback = 'ARCS 策略阻断了该操作';
    const reason =
      decision.kind === 'ask'
        ? `需要人工审批，但当前 Codex 不支持 permissionDecision:ask，已阻止：${decision.reason || fallback}`
        : decision.reason || fallback;
    hookSpecificOutput['permissionDecision'] = 'deny';
    hookSpecificOutput['permissionDecisionReason'] = reason;
  }

  const context = [
    ...decision.injected.map((m) => m.content),
    ...(decision.degraded.length > 0 ? [`[ARCS 能力降级] ${decision.degraded.join(', ')}`] : []),
  ].join('\n');
  if (context) hookSpecificOutput['additionalContext'] = context;

  return JSON.stringify({ hookSpecificOutput });
}
