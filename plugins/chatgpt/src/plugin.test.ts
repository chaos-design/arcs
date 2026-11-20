import { describe, expect, it } from 'vitest';
import { capabilitiesFor, emptyDecision, runHookEntry } from '@chaos-design/arcs-host-kit';
import { parseChatgptHook, serializeChatgpt, shouldSteerChatgpt } from './mapping.js';

const native = { eventName: 'PreToolUse', sessionId: 's' };

describe('chatgpt hook 映射', () => {
  it('提取事件、会话、工具字段并兼容别名', () => {
    const parsed = parseChatgptHook(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 's1',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      }),
      {},
    );
    expect(parsed.eventName).toBe('PreToolUse');
    expect(parsed.sessionId).toBe('s1');
    expect(parsed.toolName).toBe('Bash');
    expect(parsed.toolArgs).toEqual({ command: 'ls' });
    expect(shouldSteerChatgpt(parsed)).toBe(true);
  });

  it('畸形 JSON fail-open 回退到 ARCS_EVENT', () => {
    const parsed = parseChatgptHook('not json', { ARCS_EVENT: 'Stop' });
    expect(parsed.eventName).toBe('Stop');
    expect(shouldSteerChatgpt(parsed)).toBe(false);
  });
});

describe('chatgpt 决策序列化', () => {
  it('allow 无改参不输出孤立 permissionDecision', () => {
    const out = JSON.parse(serializeChatgpt(emptyDecision(), native));
    expect(out.hookSpecificOutput.permissionDecision).toBeUndefined();
  });

  it('allow + updatedInput 写回修复参数', () => {
    const out = JSON.parse(
      serializeChatgpt({ ...emptyDecision(), updatedInput: { command: 'echo fixed' } }, native),
    );
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.updatedInput).toEqual({ command: 'echo fixed' });
  });

  it('block 产出 deny + reason，ask 降级 deny', () => {
    const block = JSON.parse(
      serializeChatgpt({ ...emptyDecision(), kind: 'block', reason: '高危' }, native),
    );
    expect(block.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(block.hookSpecificOutput.permissionDecisionReason).toBe('高危');
    const ask = JSON.parse(serializeChatgpt({ ...emptyDecision(), kind: 'ask' }, native));
    expect(ask.hookSpecificOutput.permissionDecisionReason).toContain('不支持挂起');
  });

  it('非 PreToolUse 输出空对象', () => {
    expect(serializeChatgpt(emptyDecision(), { eventName: 'Stop', sessionId: 's' })).toBe('{}');
  });
});

describe('chatgpt 能力与端到端', () => {
  it('Tier A：可改参、可阻断，不可改道/挂起', () => {
    const caps = capabilitiesFor('chatgpt');
    expect(caps.tier).toBe('A');
    expect(caps.patchArgs).toBe(true);
    expect(caps.block).toBe(true);
    expect(caps.redirectTool).toBe(false);
    expect(caps.suspend).toBe(false);
  });

  it('高危命令在入口桥产出 deny', async () => {
    let out = '';
    const decision = await runHookEntry({
      source: 'chatgpt',
      capabilities: capabilitiesFor('chatgpt'),
      goal: '安全重构',
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'e2e',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
      parse: parseChatgptHook,
      shouldSteer: shouldSteerChatgpt,
      serialize: serializeChatgpt,
      write: (t) => { out = t; },
      errWrite: () => {},
    });
    expect(decision.kind).toBe('block');
    expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('deny');
  });
});
