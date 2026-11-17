import { describe, expect, it } from 'vitest';
import { capabilitiesFor, type HostDecision } from '@chaos-design/arcs-host-kit';
import * as plugin from './index.js';
import { apply, mapHarnessEvent, mapTurnEnd, shouldSteerDeepseek } from './index.js';
import type { HarnessEvent } from './mapping.js';

interface MockCtx {
  handlers: Map<string, Array<(payload: any) => any>>;
  events: Array<{ name: string; payload: any }>;
  on(name: string, handler: (payload: any) => any): void;
  emit(name: string, payload: any): void;
}

function createMockCtx(): MockCtx {
  const handlers = new Map<string, Array<(payload: any) => any>>();
  const events: Array<{ name: string; payload: any }> = [];
  return {
    handlers,
    events,
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    emit(name, payload) {
      events.push({ name, payload });
    },
  };
}

/** 触发某事件的所有订阅 handler，返回其返回值（通常为 Promise<HostDecision>） */
function fire(ctx: MockCtx, name: string, payload: any): any[] {
  return (ctx.handlers.get(name) ?? []).map((handler) => handler(payload));
}

describe('事件映射', () => {
  it('Harness 原生事件 → 规范事件名', () => {
    expect(mapHarnessEvent({ type: 'user/message', source: { kind: 'user' } }).eventName).toBe('UserPromptSubmit');
    expect(mapHarnessEvent({ type: 'assistant/message' }).eventName).toBe('AgentMessage');
    expect(mapHarnessEvent({ type: 'assistant/attempt' }).eventName).toBe('Reasoning');
    expect(mapHarnessEvent({ type: 'tool/call' }).eventName).toBe('PreToolUse');
    expect(mapHarnessEvent({ type: 'tool/result' }).eventName).toBe('PostToolUse');
    expect(mapHarnessEvent({ type: 'tool/result', isError: true }).eventName).toBe('PostToolUseFailure');
    expect(mapHarnessEvent({ type: 'session/created' }).eventName).toBe('SessionStart');
    expect(mapHarnessEvent({ type: 'session/disposed' }).eventName).toBe('SessionEnd');
    expect(mapHarnessEvent({ type: 'turn/end', reason: { kind: 'aborted' } }).eventName).toBe('Interrupted');
    expect(mapHarnessEvent({ type: 'turn/end', reason: { kind: 'error' } }).eventName).toBe('StopFailure');
    expect(mapHarnessEvent({ type: 'turn/end' }).eventName).toBe('Stop');
    expect(mapHarnessEvent({ type: 'unknown/thing' }).eventName).toBe('Notification');
  });

  it('turn end 细分与工具参数提取', () => {
    expect(mapTurnEnd('interrupted')).toBe('Interrupted');
    expect(mapTurnEnd('blocked')).toBe('StopFailure');
    expect(mapTurnEnd('completed')).toBe('Stop');
    const native = mapHarnessEvent({
      type: 'tool/call',
      sessionId: 's1',
      callId: 'c1',
      tool: { name: 'Bash' },
      input: { command: 'ls' },
    });
    expect(native.sessionId).toBe('s1');
    expect(native.toolName).toBe('Bash');
    expect(native.toolUseId).toBe('c1');
    expect(native.toolArgs).toEqual({ command: 'ls' });
    expect(shouldSteerDeepseek(native)).toBe(true);
    expect(shouldSteerDeepseek(mapHarnessEvent({ type: 'assistant/message' }))).toBe(false);
  });
});

describe('订阅注册', () => {
  it('apply 注册三个 Cordis 生命周期事件', () => {
    const ctx = createMockCtx();
    apply(ctx, { goal: '安全重构' });
    expect([...ctx.handlers.keys()].sort()).toEqual([
      'session/created',
      'session/disposed',
      'session/event',
    ]);
  });

  it('刻意不声明 inject，避免 sessions 服务未就绪死锁', () => {
    expect((plugin as unknown as Record<string, unknown>)['inject']).toBeUndefined();
  });
});

describe('能力决策', () => {
  it('Tier B 能力矩阵：可 block + 可注入，不可改参/改道/挂起', () => {
    const caps = capabilitiesFor('deepseek');
    expect(caps.tier).toBe('B');
    expect(caps.patchArgs).toBe(false);
    expect(caps.redirectTool).toBe(false);
    expect(caps.injectMessage).toBe(true);
    expect(caps.suspend).toBe(false);
    expect(caps.block).toBe(true);
  });

  it('危险命令端到端产出 block（Suspend 降级为 block）', async () => {
    const ctx = createMockCtx();
    const handle = apply(ctx, { goal: '安全重构' });
    const [result] = fire(ctx, 'session/event', {
      type: 'tool/call',
      sessionId: 'e2e',
      callId: 'call-1',
      tool: { name: 'Bash' },
      input: { command: 'rm -rf /' },
    });
    const decision = (await result) as HostDecision;
    expect(decision.kind).toBe('block');
    expect(decision.level).toBe(4);
    expect(decision.degraded).toContain('suspend→block');
    expect(handle.decisionBySession.get('e2e')?.kind).toBe('block');
    const emitted = ctx.events.find((e) => e.name === 'arcs/decision');
    expect((emitted?.payload as { decision: HostDecision }).decision.kind).toBe('block');
  });
});

describe('真实阻断通道', () => {
  const dangerous = {
    type: 'tool/call',
    sessionId: 'blocked',
    callId: 'c1',
    tool: { name: 'Bash' },
    input: { command: 'rm -rf /' },
  };

  it('注入 blockTransport 且返回 true 时真正阻断并标记 enforced', async () => {
    const calls: HostDecision[] = [];
    const ctx = createMockCtx();
    const handle = apply(ctx, {
      goal: '安全重构',
      blockTransport: async (decision) => { calls.push(decision); return true; },
    });
    await fire(ctx, 'session/event', dangerous)[0];
    expect(handle.hasBlockTransport).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0]!.kind).toBe('block');
    expect(handle.enforcedBySession.get('blocked')).toBe(true);
    const emitted = ctx.events.find((e) => e.name === 'arcs/decision');
    expect((emitted?.payload as { enforced: boolean }).enforced).toBe(true);
  });

  it('无阻断通道时保持事件广播 + 审计，enforced=false', async () => {
    const ctx = createMockCtx();
    const handle = apply(ctx, { goal: '安全重构' });
    const [result] = fire(ctx, 'session/event', dangerous);
    expect(((await result) as HostDecision).kind).toBe('block');
    expect(handle.hasBlockTransport).toBe(false);
    expect(handle.enforcedBySession.get('blocked')).toBe(false);
  });

  it('阻断通道抛异常时 fail-open，不把异常抛给宿主', async () => {
    const ctx = createMockCtx();
    const handle = apply(ctx, {
      goal: '安全重构',
      blockTransport: () => { throw new Error('host rejected channel'); },
    });
    const [result] = fire(ctx, 'session/event', dangerous);
    expect(((await result) as HostDecision).kind).toBe('block');
    expect(handle.enforcedBySession.get('blocked')).toBe(false);
  });
});

describe('fail-open', () => {
  it('未知与畸形事件放行，不抛异常', async () => {
    const ctx = createMockCtx();
    apply(ctx, {});
    const [unknownResult] = fire(ctx, 'session/event', { type: 'mystery/event', sessionId: 's' });
    expect(((await unknownResult) as HostDecision).kind).toBe('allow');

    const [nullResult] = fire(ctx, 'session/event', null);
    expect(((await nullResult) as HostDecision).kind).toBe('allow');

    const [garbageResult] = fire(ctx, 'session/event', { sessionId: 's', input: 'not-an-object' });
    expect(((await garbageResult) as HostDecision).kind).toBe('allow');
  });
});

describe('生命周期', () => {
  it('session/created 与 session/disposed 维护 turn 表并产出 SessionStart/SessionEnd', async () => {
    const ctx = createMockCtx();
    const handle = apply(ctx, {});
    const [created] = fire(ctx, 'session/created', { sessionId: 'sess-x', turnId: 't-init' });
    await created;
    expect(handle.turnBySession.get('sess-x')).toBe('t-init');

    const [disposed] = fire(ctx, 'session/disposed', { sessionId: 'sess-x' });
    await disposed;
    expect(handle.turnBySession.has('sess-x')).toBe(false);
    expect(handle.decisionBySession.get('sess-x')?.kind).toBe('allow');
  });
});

describe('turn 计数', () => {
  it('同会话事件递增，显式 turnId 覆盖', async () => {
    const ctx = createMockCtx();
    const handle = apply(ctx, {});
    await fire(ctx, 'session/created', { sessionId: 's' })[0];
    expect(handle.turnBySession.get('s')).toBe('0');

    await fire(ctx, 'session/event', { type: 'tool/result', sessionId: 's' })[0];
    expect(handle.turnBySession.get('s')).toBe('1');

    await fire(ctx, 'session/event', { type: 'assistant/message', sessionId: 's' })[0];
    expect(handle.turnBySession.get('s')).toBe('2');

    await fire(ctx, 'session/event', {
      type: 'tool/call',
      sessionId: 's',
      turnId: 'turn-9',
      tool: { name: 'Bash' },
      input: { command: 'ls' },
    })[0];
    expect(handle.turnBySession.get('s')).toBe('turn-9');
  });
});
