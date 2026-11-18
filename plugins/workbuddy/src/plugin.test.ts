import { describe, expect, it } from 'vitest';
import {
  capabilitiesFor,
  emptyDecision,
  runHookEntry,
  type HostDecision,
} from '@chaos-design/arcs-host-kit';
import {
  parseWorkbuddyHook,
  serializeWorkbuddy,
  shouldSteerWorkbuddy,
  withWorkbuddyEvent,
} from './mapping.js';

const env = { CODEBUDDY_SESSION_ID: 'wb-session', CODEBUDDY_PROJECT_DIR: '/repo' };

describe('parseWorkbuddyHook', () => {
  it('从 env 读取会话上下文并提取工具名与参数', () => {
    const native = parseWorkbuddyHook(
      JSON.stringify({
        tool_name: 'Bash',
        tool_use_id: 'call-1',
        tool_input: { command: 'ls' },
      }),
      { ...env, ARCS_EVENT: 'PreToolUse' },
    );
    expect(native.eventName).toBe('PreToolUse');
    expect(native.sessionId).toBe('wb-session');
    expect(native.toolName).toBe('Bash');
    expect(native.toolArgs).toEqual({ command: 'ls' });
    expect((native.payload as Record<string, unknown>)['projectDir']).toBe('/repo');
  });

  it('非法 JSON 不抛异常，事件名回退到 ARCS_EVENT', () => {
    const native = parseWorkbuddyHook('not json', { ARCS_EVENT: 'Stop' });
    expect(native.eventName).toBe('Stop');
    expect(native.sessionId).toBe('unknown-session');
  });
});

describe('shouldSteerWorkbuddy', () => {
  it('只在 PreToolUse 前置纠偏', () => {
    expect(shouldSteerWorkbuddy(parseWorkbuddyHook('{}', { ARCS_EVENT: 'PreToolUse' }))).toBe(true);
    expect(shouldSteerWorkbuddy(parseWorkbuddyHook('{}', { ARCS_EVENT: 'PostToolUse' }))).toBe(false);
  });
});

describe('serializeWorkbuddy', () => {
  const native = { eventName: 'PreToolUse', sessionId: 's' };

  it('三态：allow（permissionDecision + 顶层 continue）', () => {
    const out = JSON.parse(serializeWorkbuddy(emptyDecision(), native)) as {
      continue: boolean;
      hookSpecificOutput: { permissionDecision: string };
    };
    expect(out.continue).toBe(true);
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('三态：block 映射为 deny 并携带原因', () => {
    const d: HostDecision = { ...emptyDecision(), kind: 'block', reason: '高危命令' };
    const out = JSON.parse(serializeWorkbuddy(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toBe('高危命令');
  });

  it('三态：ask 降级 deny，注入/降级上下文在 hso 内', () => {
    const d: HostDecision = {
      ...emptyDecision(),
      kind: 'ask',
      injected: [{ role: 'system', content: '请人工确认' }],
      degraded: ['suspend→block'],
    };
    const out = JSON.parse(serializeWorkbuddy(d, native)) as {
      hookSpecificOutput: { permissionDecision: string; additionalContext: string };
    };
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.additionalContext).toContain('请人工确认');
    expect(out.hookSpecificOutput.additionalContext).toContain('suspend→block');
  });

  it('非 PreToolUse 输出空对象', () => {
    expect(serializeWorkbuddy(emptyDecision(), { eventName: 'Stop', sessionId: 's' })).toBe('{}');
  });
});

describe('能力边界', () => {
  it('workbuddy 为 Tier B：可阻塞、可注入，不可改参/重定向/挂起', () => {
    const caps = capabilitiesFor('workbuddy');
    expect(caps.tier).toBe('B');
    expect(caps.patchArgs).toBe(false);
    expect(caps.redirectTool).toBe(false);
    expect(caps.injectMessage).toBe(true);
    expect(caps.suspend).toBe(false);
    expect(caps.block).toBe(true);
  });
});

describe('端到端入口桥', () => {
  it('高危命令产出 block，degraded 记录 suspend→block', async () => {
    let out = '';
    const errs: string[] = [];
    const decision = await runHookEntry({
      source: 'workbuddy',
      capabilities: capabilitiesFor('workbuddy'),
      goal: '安全重构',
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
      parse: withWorkbuddyEvent('PreToolUse'),
      shouldSteer: shouldSteerWorkbuddy,
      serialize: serializeWorkbuddy,
      write: (t) => { out = t; },
      errWrite: (t) => { errs.push(t); },
    });
    expect(decision.kind).toBe('block');
    expect(decision.degraded).toContain('suspend→block');
    const parsed = JSON.parse(out) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(errs).toEqual([]);
  });
});
