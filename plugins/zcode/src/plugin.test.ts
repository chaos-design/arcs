import { describe, expect, it } from 'vitest';
import { capabilitiesFor, emptyDecision, runHookEntry, type HostDecision } from '@chaos-design/arcs-host-kit';
import { parseZcodeHook, serializeZcode, shouldSteerZcode } from './mapping.js';

describe('parseZcodeHook', () => {
  it('按别名提取 toolCallId / toolInput / toolResponse', () => {
    const native = parseZcodeHook(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-1',
        tool_name: 'Bash',
        toolCallId: 'call-1',
        toolInput: { command: 'ls' },
        toolResponse: { ok: true },
      }),
      {},
    );
    expect(native.eventName).toBe('PreToolUse');
    expect(native.sessionId).toBe('sess-1');
    expect(native.toolName).toBe('Bash');
    expect(native.toolUseId).toBe('call-1');
    expect(native.toolArgs).toEqual({ command: 'ls' });
    expect(native.payload).toEqual({ ok: true });
  });

  it('Stop 事件的 responseText 放入 thought', () => {
    const native = parseZcodeHook(
      JSON.stringify({ hook_event_name: 'Stop', responseText: '任务已完成' }),
      {},
    );
    expect(native.thought).toBe('任务已完成');
  });

  it('非法 JSON 不抛异常，回退到 ARCS_EVENT 环境', () => {
    const native = parseZcodeHook('not json', { ARCS_EVENT: 'PostToolUse' });
    expect(native.eventName).toBe('PostToolUse');
    expect(native.sessionId).toBe('unknown-session');
    expect(native.toolArgs).toBeUndefined();
  });

  it('只对 PreToolUse 纠偏', () => {
    expect(shouldSteerZcode(parseZcodeHook('{"hook_event_name":"PreToolUse"}', {}))).toBe(true);
    expect(shouldSteerZcode(parseZcodeHook('{"hook_event_name":"PostToolUse"}', {}))).toBe(false);
    expect(shouldSteerZcode(parseZcodeHook('{"hook_event_name":"PostToolUseFailure"}', {}))).toBe(false);
  });
});

describe('serializeZcode', () => {
  const native = { eventName: 'PreToolUse', sessionId: 's' };

  it('allow + updatedInput 写回修复参数', () => {
    const d: HostDecision = { ...emptyDecision(), updatedInput: { command: 'echo fixed' } };
    const out = JSON.parse(serializeZcode(d, native)) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string; updatedInput: Record<string, unknown> };
    };
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.updatedInput).toEqual({ command: 'echo fixed' });
  });

  it('block 决策产出宿主可识别的 deny + reason', () => {
    const d: HostDecision = { ...emptyDecision(), kind: 'block', reason: '高危命令' };
    const out = JSON.parse(serializeZcode(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('高危命令');
  });

  it('降级与注入写入 additionalContext', () => {
    const d: HostDecision = {
      ...emptyDecision(),
      kind: 'block',
      degraded: ['suspend→block'],
      injected: [{ role: 'system', content: '[ARCS] 请改用安全工具' }],
    };
    const out = JSON.parse(serializeZcode(d, native)) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(out.hookSpecificOutput.additionalContext).toContain('[ARCS] 请改用安全工具');
    expect(out.hookSpecificOutput.additionalContext).toContain('suspend→block');
  });

  it('非 PreToolUse 输出空对象', () => {
    expect(serializeZcode(emptyDecision(), { eventName: 'Stop', sessionId: 's' })).toBe('{}');
  });
});

describe('端到端入口桥', () => {
  it('高危命令在 ZCode 上产出 block 决策（suspend 降级为 block）', async () => {
    let out = '';
    const decision = await runHookEntry({
      source: 'zcode',
      capabilities: capabilitiesFor('zcode'),
      goal: '安全重构',
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'e2e',
        tool_name: 'Bash',
        toolInput: { command: 'rm -rf /' },
      }),
      parse: parseZcodeHook,
      shouldSteer: shouldSteerZcode,
      serialize: serializeZcode,
      write: (t) => { out = t; },
      errWrite: () => {},
    });
    expect(decision.kind).toBe('block');
    expect(decision.degraded).toContain('suspend→block');
    const parsed = JSON.parse(out) as {
      hookSpecificOutput: { permissionDecision: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('suspend→block');
  });
});
