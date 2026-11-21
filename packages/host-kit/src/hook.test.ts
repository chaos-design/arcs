import { describe, expect, it } from 'vitest';
import { emptyDecision, type HostDecision } from './decision.js';
import {
  hookContextText,
  parseHookPayload,
  pickToolArgs,
  serializeHookDecision,
  shouldSteerPreToolUse,
  withHookEvent,
  type HookSerializeOptions,
} from './hook.js';
import type { NativeEvent } from './mapping.js';

const EVENT_KEYS = ['hook_event_name', 'event', 'eventName'];
const native: NativeEvent = { eventName: 'PreToolUse', sessionId: 's' };

describe('parseHookPayload', () => {
  it('按优先级取事件名、会话、工具字段', () => {
    const parsed = parseHookPayload(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 's1',
        tool_name: 'Bash',
        tool_use_id: 'c1',
        tool_input: { command: 'ls' },
      }),
      {},
      {
        eventKeys: EVENT_KEYS,
        sessionKeys: ['session_id', 'sessionId'],
        toolNameKeys: ['tool_name', 'name'],
        toolUseIdKeys: ['tool_use_id', 'callID'],
        toolArgsKeys: ['tool_input', 'input'],
      },
    );
    expect(parsed.eventName).toBe('PreToolUse');
    expect(parsed.sessionId).toBe('s1');
    expect(parsed.toolName).toBe('Bash');
    expect(parsed.toolUseId).toBe('c1');
    expect(parsed.toolArgs).toEqual({ command: 'ls' });
  });

  it('畸形 JSON 回退到 env 事件名而非抛异常', () => {
    const parsed = parseHookPayload('not json', { ARCS_EVENT: 'Stop' }, { eventKeys: EVENT_KEYS });
    expect(parsed.eventName).toBe('Stop');
    expect(parsed.sessionId).toBe('unknown-session');
  });

  it('字符串实参包裹为 command，会话 ID 可来自 env', () => {
    const parsed = parseHookPayload(
      '{"event":"PreToolUse","args":"rm -rf /"}',
      { CODEBUDDY_SESSION_ID: 'env-session' },
      {
        eventKeys: EVENT_KEYS,
        toolArgsKeys: ['args'],
        sessionEnvKeys: ['CODEBUDDY_SESSION_ID'],
      },
    );
    expect(parsed.toolArgs).toEqual({ command: 'rm -rf /' });
    expect(parsed.sessionId).toBe('env-session');
  });

  it('payload 钩子可注入宿主自有字段', () => {
    const parsed = parseHookPayload(
      '{"hook_event_name":"Stop","toolResponse":{"ok":true}}',
      {},
      { eventKeys: EVENT_KEYS, payload: (obj) => ({ extra: obj['toolResponse'] }) },
    );
    expect(parsed.payload).toEqual({ extra: { ok: true } });
  });

  it('withHookEvent 用命令参数覆盖 env', () => {
    const parse = withHookEvent('PreToolUse', (text, env) =>
      parseHookPayload(text, env, { eventKeys: EVENT_KEYS }),
    );
    expect(parse('{}', { ARCS_EVENT: 'Stop' }).eventName).toBe('PreToolUse');
    expect(shouldSteerPreToolUse(parse('{}', {}))).toBe(true);
  });
});

describe('pickToolArgs', () => {
  it('对象原样返回，字符串包裹，缺失返回 undefined', () => {
    expect(pickToolArgs({ input: { a: 1 } }, ['input'])).toEqual({ a: 1 });
    expect(pickToolArgs({ input: 'echo hi' }, ['input'])).toEqual({ command: 'echo hi' });
    expect(pickToolArgs({}, ['input'])).toBeUndefined();
  });
});

describe('hookContextText', () => {
  it('合并注入文本与降级说明', () => {
    const d: HostDecision = {
      ...emptyDecision(),
      injected: [{ role: 'system', content: '回头' }],
      degraded: ['patchArgs'],
    };
    expect(hookContextText(d)).toBe('回头\n[ARCS 能力降级] patchArgs');
  });
});

describe('serializeHookDecision', () => {
  const claudeLike: HookSerializeOptions = {
    permissionOf: (kind) => (kind === 'block' ? 'deny' : kind),
    updatedInputKey: 'updatedInput',
  };

  it('非目标事件输出空对象', () => {
    expect(serializeHookDecision(emptyDecision(), { eventName: 'Stop', sessionId: 's' }, claudeLike)).toBe('{}');
    expect(serializeHookDecision(emptyDecision(), undefined, claudeLike)).toBe('{}');
  });

  it('Claude 兼容：ask 透传、block 映射 deny 并补原因、allow 写回参数', () => {
    const ask = serializeHookDecision({ ...emptyDecision(), kind: 'ask', reason: '高危' }, native, claudeLike);
    expect(JSON.parse(ask).hookSpecificOutput.permissionDecision).toBe('ask');

    const block = serializeHookDecision({ ...emptyDecision(), kind: 'block' }, native, claudeLike);
    expect(JSON.parse(block).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(JSON.parse(block).hookSpecificOutput.permissionDecisionReason).toBe('ARCS 策略阻断了该操作');

    const patched = serializeHookDecision(
      { ...emptyDecision(), updatedInput: { command: 'echo fixed' } },
      native,
      claudeLike,
    );
    expect(JSON.parse(patched).hookSpecificOutput.updatedInput).toEqual({ command: 'echo fixed' });
  });

  it('Codex 兼容：allow 无改参不输出 permissionDecision，ask 降为 deny 并说明', () => {
    const codex: HookSerializeOptions = {
      permissionOf: (kind) => (kind === 'allow' ? 'allow' : 'deny'),
      reasonOf: (d, permission) =>
        d.kind === 'ask'
          ? `需要人工审批，但当前 Codex 不支持 permissionDecision:ask，已阻止：${d.reason || 'ARCS 策略阻断了该操作'}`
          : permission === 'deny'
            ? d.reason?.trim() || 'ARCS 策略阻断了该操作'
            : undefined,
      updatedInputKey: 'updatedInput',
      allowOnlyWithUpdatedInput: true,
    };
    const out = JSON.parse(serializeHookDecision(emptyDecision(), native, codex));
    expect(out.hookSpecificOutput.permissionDecision).toBeUndefined();
    const ask = JSON.parse(serializeHookDecision({ ...emptyDecision(), kind: 'ask' }, native, codex));
    expect(ask.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(ask.hookSpecificOutput.permissionDecisionReason).toContain('不支持 permissionDecision:ask');
  });

  it('WorkBuddy/Trae：modifiedInput 与顶层 continue', () => {
    const wb: HookSerializeOptions = {
      permissionOf: (kind) => (kind === 'allow' ? 'allow' : 'deny'),
      updatedInputKey: 'modifiedInput',
      topLevelContinue: true,
    };
    const out = JSON.parse(
      serializeHookDecision({ ...emptyDecision(), updatedInput: { path: 'safe' } }, native, wb),
    );
    expect(out.continue).toBe(true);
    expect(out.hookSpecificOutput.modifiedInput).toEqual({ path: 'safe' });

    const trae = JSON.parse(
      serializeHookDecision({ ...emptyDecision(), kind: 'block', reason: 'x' }, native, {
        forceAllow: true,
        topLevelContinue: true,
      }),
    );
    expect(trae.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(trae.hookSpecificOutput.permissionDecisionReason).toBeUndefined();
  });
});
