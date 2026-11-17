import { describe, expect, it } from 'vitest';
import { capabilitiesFor, emptyDecision, runHookEntry, type HostDecision } from '@chaos-design/arcs-host-kit';
import { validateCodexPreToolUse } from '../../../scripts/behavior-contracts.mjs';
import { parseCodexHook, serializeCodex, shouldSteerCodex } from './mapping.js';

describe('parseCodexHook', () => {
  it('提取事件名、工具名、参数与会话 ID', () => {
    const native = parseCodexHook(
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
    expect(native.toolUseId).toBe('call-1');
    expect(native.toolArgs).toEqual({ command: 'ls' });
  });

  it('兼容 event/eventName 与 input/args 字段别名', () => {
    const viaEvent = parseCodexHook(JSON.stringify({ event: 'PreToolUse', input: { command: 'echo a' } }), {});
    expect(viaEvent.eventName).toBe('PreToolUse');
    expect(viaEvent.toolArgs).toEqual({ command: 'echo a' });

    const viaEventName = parseCodexHook(JSON.stringify({ eventName: 'Stop', args: { command: 'echo b' } }), {});
    expect(viaEventName.eventName).toBe('Stop');
    expect(viaEventName.toolArgs).toEqual({ command: 'echo b' });
  });

  it('非法 JSON 不抛异常，回退到 ARCS_EVENT 环境', () => {
    const native = parseCodexHook('not json', { ARCS_EVENT: 'Stop' });
    expect(native.eventName).toBe('Stop');
    expect(native.sessionId).toBe('unknown-session');
    expect(native.toolArgs).toBeUndefined();
  });

  it('只对 PreToolUse 纠偏', () => {
    expect(shouldSteerCodex(parseCodexHook('{"hook_event_name":"PreToolUse"}', {}))).toBe(true);
    expect(shouldSteerCodex(parseCodexHook('{"hook_event_name":"PostToolUse"}', {}))).toBe(false);
    expect(shouldSteerCodex(parseCodexHook('{"hook_event_name":"UserPromptSubmit"}', {}))).toBe(false);
  });
});

describe('serializeCodex', () => {
  const native = { eventName: 'PreToolUse', sessionId: 's' };

  it('allow + updatedInput 写回修复参数', () => {
    const d: HostDecision = { ...emptyDecision(), updatedInput: { command: 'echo fixed' } };
    const out = JSON.parse(serializeCodex(d, native)) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string; updatedInput: Record<string, unknown> };
    };
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.updatedInput).toEqual({ command: 'echo fixed' });
  });

  it('block 决策产出 deny + reason', () => {
    const d: HostDecision = { ...emptyDecision(), kind: 'block', reason: '高危命令' };
    const out = JSON.parse(serializeCodex(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('高危命令');
  });

  it('ask 决策降级为 deny（Codex 不支持 permissionDecision:ask）', () => {
    const d: HostDecision = { ...emptyDecision(), kind: 'ask', reason: '需人工审批' };
    const out = JSON.parse(serializeCodex(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('人工审批');
  });

  it('allow 但无 updatedInput 时不输出孤立 permissionDecision', () => {
    const out = JSON.parse(serializeCodex(emptyDecision(), native)) as {
      hookSpecificOutput: Record<string, unknown>;
    };
    expect(out.hookSpecificOutput['permissionDecision']).toBeUndefined();
    expect(out.hookSpecificOutput['updatedInput']).toBeUndefined();
  });

  it('block 缺少 reason 时补默认理由，避免 deny 被宿主忽略', () => {
    const out = JSON.parse(
      serializeCodex({ ...emptyDecision(), kind: 'block' }, native),
    ) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason.trim().length).toBeGreaterThan(0);
  });

  it('非 PreToolUse 输出空对象', () => {
    expect(serializeCodex(emptyDecision(), { eventName: 'Stop', sessionId: 's' })).toBe('{}');
  });
});

describe('行为级契约校验（Codex output_parser 规则）', () => {
  it('全部效果路径的序列化输出均通过规则断言', () => {
    const native = { eventName: 'PreToolUse', sessionId: 's' };
    const cases: Array<[string, HostDecision]> = [
      ['PassThrough', emptyDecision()],
      ['allow+PatchArgs', { ...emptyDecision(), updatedInput: { command: 'echo fixed' } }],
      ['block 无 reason', { ...emptyDecision(), kind: 'block' }],
      ['ask 降级', { ...emptyDecision(), kind: 'ask', reason: '需审批' }],
      [
        '注入降级',
        {
          ...emptyDecision(),
          degraded: ['patchArgs'],
          injected: [{ role: 'system', content: '请检查参数' }],
        },
      ],
    ];
    for (const [name, decision] of cases) {
      const output = JSON.parse(serializeCodex(decision, native));
      expect(validateCodexPreToolUse(output, { toolName: 'Bash' }), name).toEqual([]);
    }
  });

  it('规则断言能识别孤立 allow 与无理由 deny（负向对照）', () => {
    expect(
      validateCodexPreToolUse({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
      }),
    ).toContain('permissionDecision:allow 缺少 updatedInput（parser 判失败并放行原调用）');
    expect(
      validateCodexPreToolUse({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
      }),
    ).toContain('permissionDecision:deny 缺少 permissionDecisionReason（parser 判失败并放行）');
  });
});

describe('端到端入口桥', () => {
  it('高危命令产出 block 决策并序列化为 Codex 的 deny', async () => {
    let out = '';
    const decision = await runHookEntry({
      source: 'codex',
      capabilities: capabilitiesFor('codex'),
      goal: '安全重构',
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'e2e',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
      parse: parseCodexHook,
      shouldSteer: shouldSteerCodex,
      serialize: serializeCodex,
      write: (t) => { out = t; },
      errWrite: () => {},
    });
    expect(decision.kind).toBe('block');
    expect(decision.degraded).toContain('suspend→block');
    const parsed = JSON.parse(out) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
  });
});
