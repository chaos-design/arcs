import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { capabilitiesFor, claimSession as fileClaimSession, emptyDecision, type HostDecision } from '@chaos-design/arcs-host-kit';
import type { RawEvent } from '@chaos-design/arcs-plugin-kit';
import {
  claimSession,
  configureClaims,
  createOpencodePlugin,
  resetClaims,
  type OpencodeContext,
  type OpencodeToolInput,
  type OpencodeToolOutput,
} from './index.js';
import {
  mapOpencodeEvent,
  opencodeEventToRaw,
  translateOpencodeDecision,
} from './mapping.js';

type Middleware = (input: OpencodeToolInput, output: OpencodeToolOutput) => void | Promise<void>;
type EventHandler = (event: { type: string; sessionID?: string; properties?: Record<string, unknown> }) => void;

const claimHomes: string[] = [];
afterEach(() => {
  resetClaims();
  for (const home of claimHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

type ContextHandler = (event: { system: string[]; messages: unknown[]; sessionID?: string }) => void;

async function setupPlugin(goal = '安全重构'): Promise<{
  subscribeHandler: EventHandler;
  middleware?: Middleware;
  contextHandler?: ContextHandler;
  asks: Array<{ tool: string; reason: string }>;
  ctx: OpencodeContext;
}> {
  const home = mkdtempSync(join(tmpdir(), 'arcs-opencode-setup-'));
  configureClaims(home);
  claimHomes.push(home);
  let subscribeHandler!: EventHandler;
  let middleware: Middleware | undefined;
  let contextHandler: ContextHandler | undefined;
  const asks: Array<{ tool: string; reason: string }> = [];
  const ctx: OpencodeContext = {
    goal,
    event: {
      subscribe: (_options, handler) => { subscribeHandler = handler; },
    },
    tool: {
      execute: {
        before: (handler) => { middleware = handler; },
      },
    },
    client: {
      permission: {
        ask: async (request) => { asks.push(request); return {}; },
      },
    },
    session: {
      hook: (_name, handler) => { contextHandler = handler; },
    },
  };
  await createOpencodePlugin().setup(ctx);
  return { subscribeHandler, middleware, contextHandler, asks, ctx };
}

describe('opencode 事件映射', () => {
  it('原生事件 → 规范事件名（含 step finish 分支与未知保留）', () => {
    expect(mapOpencodeEvent({ type: 'session.created' })).toBe('SessionStart');
    expect(mapOpencodeEvent({ type: 'session.tool.called' })).toBe('PreToolUse');
    expect(mapOpencodeEvent({ type: 'session.tool.success' })).toBe('PostToolUse');
    expect(mapOpencodeEvent({ type: 'session.tool.failed' })).toBe('PostToolUseFailure');
    expect(mapOpencodeEvent({ type: 'permission.asked' })).toBe('PermissionRequest');
    expect(mapOpencodeEvent({ type: 'session.text.ended' })).toBe('AgentMessage');
    expect(mapOpencodeEvent({ type: 'session.step.ended', properties: { finish: 'stop' } })).toBe('Stop');
    expect(mapOpencodeEvent({ type: 'session.step.ended', properties: { finish: 'end_turn' } })).toBe('Stop');
    expect(mapOpencodeEvent({ type: 'session.step.ended', properties: { finish: 'error' } })).toBe('StopFailure');
    expect(mapOpencodeEvent({ type: 'session.step.ended', properties: { finish: 'failed' } })).toBe('StopFailure');
    expect(mapOpencodeEvent({ type: 'brand.new.event' })).toBe('brand.new.event');
  });

  it('PreToolUse 映射为带工具信息的 tool-call RawEvent', () => {
    const raw: RawEvent = opencodeEventToRaw({
      type: 'session.tool.called',
      sessionID: 's1',
      properties: { tool: 'Bash', toolCallID: 'c1', args: { command: 'ls' } },
    });
    expect(raw.host).toBe('opencode');
    expect(raw.type).toBe('tool-call');
    expect(raw.sessionId).toBe('s1');
    const payload = raw.payload as Record<string, unknown>;
    expect(payload['toolName']).toBe('Bash');
    expect(payload['toolArgs']).toEqual({ command: 'ls' });
    expect(payload['nativeEventName']).toBe('PreToolUse');
  });
});

describe('opencode 订阅注册', () => {
  it('setup 注册全局事件订阅与工具中间件，并可驱动事件', async () => {
    const { subscribeHandler } = await setupPlugin();
    expect(typeof subscribeHandler).toBe('function');
    expect(() => subscribeHandler({ type: 'session.created', sessionID: 'sub-1' })).not.toThrow();
  });

  it('会话 claim 跨进程互斥：不同 pid 抢占同一会话被拒绝', () => {
    const home = mkdtempSync(join(tmpdir(), 'arcs-opencode-claim-'));
    try {
      configureClaims(home);
      expect(claimSession('dup-1')).toBe(true);
      expect(claimSession('dup-1')).toBe(true); // 同进程幂等续约
      expect(
        fileClaimSession({
          home,
          source: 'opencode',
          sessionId: 'dup-1',
          pid: 999999,
          isAlive: () => true,
          now: () => Date.now(),
        }),
      ).toBe(false);
      expect(claimSession('dup-2')).toBe(true);
    } finally {
      resetClaims();
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('opencode 能力决策', () => {
  it('能力矩阵为 Tier A（patch/suspend/block 可用，redirect 不可用）', () => {
    const caps = capabilitiesFor('opencode');
    expect(caps.tier).toBe('A');
    expect(caps.patchArgs).toBe(true);
    expect(caps.injectMessage).toBe(true);
    expect(caps.suspend).toBe(true);
    expect(caps.block).toBe(true);
    expect(caps.redirectTool).toBe(false);
  });

  it('PatchArgs 决策写回 updatedInput（写回工具参数）', () => {
    const decision: HostDecision = { ...emptyDecision(), updatedInput: { command: 'echo fixed' } };
    const translated = translateOpencodeDecision(decision, 'Bash');
    expect(translated.updatedInput).toEqual({ command: 'echo fixed' });
  });

  it('危险命令在工具中间件产出 ask（Tier A 通过权限询问挂起）', async () => {
    const { middleware, asks } = await setupPlugin();
    expect(middleware).toBeDefined();
    const output: OpencodeToolOutput = { args: { command: 'rm -rf /' } };
    await middleware!(
      { tool: 'Bash', callID: 'c1', sessionID: 'e2e', args: { command: 'rm -rf /' } },
      output,
    );
    expect(asks.length).toBeGreaterThan(0);
    expect(asks[0]!.tool).toBe('Bash');
  });

  it('block 决策翻译为阻断动作', () => {
    const decision: HostDecision = { ...emptyDecision(), kind: 'block', reason: '禁止执行' };
    const translated = translateOpencodeDecision(decision);
    expect(translated.block).toEqual({ reason: '禁止执行' });
  });
});

describe('opencode 注入通道', () => {
  it('注入经 session context hook 写入 system[]，而非无效的 output.arcsContext', async () => {
    const ctx: OpencodeContext = {
      goal: '安全重构',
      event: { subscribe: () => {} },
      tool: { execute: { before: () => {} } },
      session: {
        hook: (_name, handler) => { captured = handler; },
      },
    };
    let captured: ContextHandler | undefined;
    await createOpencodePlugin({ config: { redirectMap: { write_file: 'edit_file' } } }).setup(ctx);
    expect(typeof captured).toBe('function');

    // 触发 L3：redirectMap 命中 → 无 redirectTool 能力 → 降级为 InjectMessage
    const output: OpencodeToolOutput = { args: { path: 'poem.txt', content: 'x' } };
    // 中间件未捕获（上面 before 是空函数），因此直接验证 hook 注入管线：
    // 通过一次带 middleware 的 setup 捕获真实 handler
    let middleware: Middleware | undefined;
    const ctx2: OpencodeContext = {
      goal: '安全重构',
      event: { subscribe: () => {} },
      tool: { execute: { before: (h) => { middleware = h; } } },
      session: { hook: (_name, handler) => { captured = handler; } },
    };
    await createOpencodePlugin().setup(ctx2);
    const input = { tool: 'bash', callID: 'c1', sessionID: 's1', args: { command: 'npm test' } };
    // 同一 pipeline 的 SessionStore 按 sessionId 累积；连续 3 次相同调用触发 L2 循环注入
    for (let i = 0; i < 3; i += 1) {
      const out: OpencodeToolOutput = { args: { command: 'npm test' } };
      await middleware!(input, out);
      expect(out['arcsContext']).toBeUndefined();
    }
    const event = { system: ['base'], messages: [], sessionID: 's1' };
    captured!(event);
    expect(event.system.length).toBeGreaterThan(1);
    expect(event.system.join('\n')).toContain('ARCS');
  });
});

describe('opencode fail-open', () => {
  it('安全命令放行，不触发 ask/block', async () => {
    const { middleware, asks } = await setupPlugin();
    await middleware!({ tool: 'Bash', args: { command: 'ls' } }, { args: { command: 'ls' } });
    expect(asks.length).toBe(0);
  });

  it('未知/畸形事件不抛异常且原样保留', () => {
    expect(() => mapOpencodeEvent({ type: '', properties: undefined })).not.toThrow();
    expect(mapOpencodeEvent({ type: 'x.y' })).toBe('x.y');
    const raw = opencodeEventToRaw({ type: 'x.y' });
    expect(raw.host).toBe('opencode');
    expect((raw.payload as Record<string, unknown>)['nativeType']).toBe('x.y');
  });
});
