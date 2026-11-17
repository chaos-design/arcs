import { describe, expect, it } from 'vitest';
import {
  capabilitiesFor,
  emptyDecision,
  runHookEntry,
  type HostDecision,
} from '@chaos-design/arcs-host-kit';
import {
  parseTraeHook,
  serializeTrae,
  shouldSteerTrae,
  withTraeEvent,
} from './mapping.js';

describe('parseTraeHook', () => {
  it('提取工具名、参数与会话 ID', () => {
    const native = parseTraeHook(
      JSON.stringify({
        event: 'PreToolUse',
        session_id: 'tr-session',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      }),
      {},
    );
    expect(native.eventName).toBe('PreToolUse');
    expect(native.sessionId).toBe('tr-session');
    expect(native.toolName).toBe('Bash');
    expect(native.toolArgs).toEqual({ command: 'ls' });
  });

  it('非法 JSON 不抛异常，事件名回退到 ARCS_EVENT', () => {
    const native = parseTraeHook('not json', { ARCS_EVENT: 'Stop' });
    expect(native.eventName).toBe('Stop');
    expect(native.sessionId).toBe('unknown-session');
  });
});

describe('shouldSteerTrae', () => {
  it('只在 PreToolUse 前置纠偏', () => {
    expect(shouldSteerTrae(parseTraeHook('{"event":"PreToolUse"}', {}))).toBe(true);
    expect(shouldSteerTrae(parseTraeHook('{"event":"PostToolUse"}', {}))).toBe(false);
  });
});

describe('serializeTrae', () => {
  const native = { eventName: 'PreToolUse', sessionId: 's' };

  it('三态：allow 始终放行（permissionDecision 在 hso 内）', () => {
    const out = JSON.parse(serializeTrae(emptyDecision(), native)) as {
      continue: boolean;
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(out.continue).toBe(true);
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('三态：block 决策被降级为 allow（Tier C 无法阻断）', () => {
    const d: HostDecision = { ...emptyDecision(), kind: 'block', reason: '高危命令' };
    const out = JSON.parse(serializeTrae(d, native)) as {
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('三态：ask 决策同样放行，并在 hso 内保留注入与降级上下文', () => {
    const d: HostDecision = {
      ...emptyDecision(),
      kind: 'ask',
      injected: [{ role: 'system', content: '需要人工审批' }],
      degraded: ['suspend→allow'],
    };
    const out = JSON.parse(serializeTrae(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; additionalContext: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(out.hookSpecificOutput.additionalContext).toContain('需要人工审批');
    expect(out.hookSpecificOutput.additionalContext).toContain('suspend→allow');
  });

  it('非 PreToolUse 输出空对象', () => {
    expect(serializeTrae(emptyDecision(), { eventName: 'Stop', sessionId: 's' })).toBe('{}');
  });
});

describe('能力边界', () => {
  it('trae 为 Tier C：仅注入，不可改参/改道/挂起/阻断', () => {
    const caps = capabilitiesFor('trae');
    expect(caps.tier).toBe('C');
    expect(caps.patchArgs).toBe(false);
    expect(caps.redirectTool).toBe(false);
    expect(caps.injectMessage).toBe(true);
    expect(caps.suspend).toBe(false);
    expect(caps.block).toBe(false);
  });
});

describe('端到端入口桥', () => {
  it('高危命令 fail-open 放行，并写入 suspend→allow 说明', async () => {
    let out = '';
    const errs: string[] = [];
    const decision = await runHookEntry({
      source: 'trae',
      capabilities: capabilitiesFor('trae'),
      goal: '安全重构',
      input: JSON.stringify({
        event: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
      parse: withTraeEvent('PreToolUse'),
      shouldSteer: shouldSteerTrae,
      serialize: serializeTrae,
      write: (t) => { out = t; },
      errWrite: (t) => { errs.push(t); },
    });
    expect(decision.kind).toBe('allow');
    expect(decision.degraded).toContain('suspend→allow');
    expect(decision.injected.some((m) => m.content.includes('fail-open'))).toBe(true);
    const parsed = JSON.parse(out) as {
      continue: boolean;
      hookSpecificOutput: { permissionDecision: string; additionalContext: string };
    };
    expect(parsed.continue).toBe(true);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('suspend→allow');
    expect(errs).toEqual([]);
  });
});
