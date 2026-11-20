import { describe, expect, it } from 'vitest';
import { capabilitiesFor, emptyDecision, runHookEntry } from '@chaos-design/arcs-host-kit';
import { parsePlAgentHook, serializePlAgent, shouldSteerPlAgent } from './mapping.js';

const native = { eventName: 'PreToolUse', sessionId: 's' };

describe('pl-agent hook 映射', () => {
  it('提取事件、会话与工具字段', () => {
    const parsed = parsePlAgentHook(
      JSON.stringify({
        event: 'PreToolUse',
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
    expect(shouldSteerPlAgent(parsed)).toBe(true);
  });

  it('畸形 JSON fail-open', () => {
    const parsed = parsePlAgentHook('not json', { ARCS_EVENT: 'Stop' });
    expect(parsed.eventName).toBe('Stop');
    expect(parsed.sessionId).toBe('unknown-session');
  });
});

describe('pl-agent 决策序列化', () => {
  it('allow 放行，block/ask 降为 deny，带顶层 continue', () => {
    const allow = JSON.parse(serializePlAgent(emptyDecision(), native));
    expect(allow.continue).toBe(true);
    expect(allow.hookSpecificOutput.permissionDecision).toBe('allow');

    const block = JSON.parse(
      serializePlAgent({ ...emptyDecision(), kind: 'block', reason: '高危' }, native),
    );
    expect(block.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(block.hookSpecificOutput.permissionDecisionReason).toBe('高危');

    const ask = JSON.parse(serializePlAgent({ ...emptyDecision(), kind: 'ask' }, native));
    expect(ask.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('无改参通道时不写回 updatedInput', () => {
    const out = JSON.parse(
      serializePlAgent({ ...emptyDecision(), updatedInput: { command: 'echo fixed' } }, native),
    );
    expect(out.hookSpecificOutput.updatedInput).toBeUndefined();
  });

  it('非 PreToolUse 输出空对象', () => {
    expect(serializePlAgent(emptyDecision(), { eventName: 'Stop', sessionId: 's' })).toBe('{}');
  });
});

describe('pl-agent 能力与端到端', () => {
  it('Tier B：可阻断/注入，不可改参/挂起', () => {
    const caps = capabilitiesFor('pl-agent');
    expect(caps.tier).toBe('B');
    expect(caps.patchArgs).toBe(false);
    expect(caps.block).toBe(true);
    expect(caps.suspend).toBe(false);
  });

  it('高危命令在入口桥产出 deny 与降级说明', async () => {
    let out = '';
    const decision = await runHookEntry({
      source: 'pl-agent',
      capabilities: capabilitiesFor('pl-agent'),
      goal: '安全重构',
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'e2e',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
      parse: parsePlAgentHook,
      shouldSteer: shouldSteerPlAgent,
      serialize: serializePlAgent,
      write: (t) => { out = t; },
      errWrite: () => {},
    });
    expect(decision.kind).toBe('block');
    const parsed = JSON.parse(out);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('suspend→block');
  });
});
