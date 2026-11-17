import { describe, expect, it } from 'vitest';
import { capabilitiesFor, emptyDecision, runHookEntry, type HostDecision } from '@chaos-design/arcs-host-kit';
import { parseClaudeHook, serializeClaude, shouldSteerClaude } from './mapping.js';

describe('parseClaudeHook', () => {
  it('提取工具名、参数与会话 ID', () => {
    const native = parseClaudeHook(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-1',
        tool_name: 'Bash',
        tool_use_id: 'call-1',
        tool_input: { command: 'ls' },
      }),
      {},
    );
    expect(native.eventName).toBe('PreToolUse');
    expect(native.sessionId).toBe('sess-1');
    expect(native.toolName).toBe('Bash');
    expect(native.toolArgs).toEqual({ command: 'ls' });
  });

  it('非法 JSON 不抛异常，回退到 --event 环境', () => {
    const native = parseClaudeHook('not json', { ARCS_EVENT: 'Stop' });
    expect(native.eventName).toBe('Stop');
    expect(native.sessionId).toBe('unknown-session');
  });

  it('只对 PreToolUse 纠偏', () => {
    expect(shouldSteerClaude(parseClaudeHook('{"hook_event_name":"PreToolUse"}', {}))).toBe(true);
    expect(shouldSteerClaude(parseClaudeHook('{"hook_event_name":"PostToolUse"}', {}))).toBe(false);
  });
});

describe('serializeClaude', () => {
  const native = { eventName: 'PreToolUse', sessionId: 's' };

  it('ask 决策带原因', () => {
    const d: HostDecision = { ...emptyDecision(), kind: 'ask', reason: '高危命令' };
    const out = JSON.parse(serializeClaude(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('高危命令');
  });

  it('allow + updatedInput 时写回修复参数', () => {
    const d: HostDecision = { ...emptyDecision(), updatedInput: { command: 'echo fixed' } };
    const out = JSON.parse(serializeClaude(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; updatedInput: Record<string, unknown> };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.updatedInput).toEqual({ command: 'echo fixed' });
  });

  it('block 映射为宿主可接受的 deny 并补默认原因', () => {
    const d: HostDecision = { ...emptyDecision(), kind: 'block' };
    const out = JSON.parse(serializeClaude(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('ARCS 策略阻断了该操作');
  });

  it('非 PreToolUse 输出空对象', () => {
    expect(serializeClaude(emptyDecision(), { eventName: 'Stop', sessionId: 's' })).toBe('{}');
  });
});

describe('端到端入口桥', () => {
  it('高危命令在 Claude Code 上产出 ask 决策', async () => {
    let out = '';
    await runHookEntry({
      source: 'claude-code',
      capabilities: capabilitiesFor('claude-code'),
      goal: '安全重构',
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'e2e',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
      parse: parseClaudeHook,
      shouldSteer: shouldSteerClaude,
      serialize: serializeClaude,
      write: (t) => { out = t; },
      errWrite: () => {},
    });
    const parsed = JSON.parse(out) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('ask');
  });
});
