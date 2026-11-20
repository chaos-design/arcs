import { describe, expect, it } from 'vitest';
import { capabilitiesFor, emptyDecision, runHookEntry } from '@chaos-design/arcs-host-kit';
import { parseQwenCodeHook, serializeQwenCode, shouldSteerQwenCode } from './mapping.js';

const native = { eventName: 'PreToolUse', sessionId: 's' };

describe('qwen-code hook 映射', () => {
  it('提取事件、会话与工具字段（兼容 arguments 别名）', () => {
    const parsed = parseQwenCodeHook(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 's1',
        tool_name: 'Bash',
        arguments: { command: 'ls' },
      }),
      {},
    );
    expect(parsed.eventName).toBe('PreToolUse');
    expect(parsed.sessionId).toBe('s1');
    expect(parsed.toolName).toBe('Bash');
    expect(parsed.toolArgs).toEqual({ command: 'ls' });
    expect(shouldSteerQwenCode(parsed)).toBe(true);
  });

  it('畸形 JSON fail-open', () => {
    const parsed = parseQwenCodeHook('not json', { ARCS_EVENT: 'Stop' });
    expect(parsed.eventName).toBe('Stop');
    expect(parsed.sessionId).toBe('unknown-session');
  });
});

describe('qwen-code 决策序列化', () => {
  it('allow 放行，block/ask 降为 deny，带顶层 continue', () => {
    const allow = JSON.parse(serializeQwenCode(emptyDecision(), native));
    expect(allow.continue).toBe(true);
    expect(allow.hookSpecificOutput.permissionDecision).toBe('allow');

    const block = JSON.parse(
      serializeQwenCode({ ...emptyDecision(), kind: 'block', reason: '高危' }, native),
    );
    expect(block.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(block.hookSpecificOutput.permissionDecisionReason).toBe('高危');
  });

  it('保守策略不写回改参', () => {
    const out = JSON.parse(
      serializeQwenCode({ ...emptyDecision(), updatedInput: { command: 'echo fixed' } }, native),
    );
    expect(out.hookSpecificOutput.updatedInput).toBeUndefined();
  });

  it('非 PreToolUse 输出空对象', () => {
    expect(serializeQwenCode(emptyDecision(), { eventName: 'Stop', sessionId: 's' })).toBe('{}');
  });
});

describe('qwen-code 能力与端到端', () => {
  it('Tier B 保守：可阻断/注入，不改参/挂起', () => {
    const caps = capabilitiesFor('qwen-code');
    expect(caps.tier).toBe('B');
    expect(caps.patchArgs).toBe(false);
    expect(caps.block).toBe(true);
    expect(caps.suspend).toBe(false);
  });

  it('高危命令在入口桥产出 deny', async () => {
    let out = '';
    const decision = await runHookEntry({
      source: 'qwen-code',
      capabilities: capabilitiesFor('qwen-code'),
      goal: '安全重构',
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'e2e',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
      parse: parseQwenCodeHook,
      shouldSteer: shouldSteerQwenCode,
      serialize: serializeQwenCode,
      write: (t) => { out = t; },
      errWrite: () => {},
    });
    expect(decision.kind).toBe('block');
    expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('deny');
  });
});
