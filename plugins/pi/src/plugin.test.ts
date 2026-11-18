import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { capabilitiesFor, claimSession as fileClaimSession, emptyDecision, type HostDecision } from '@chaos-design/arcs-host-kit';
import type { RawEvent } from '@chaos-design/arcs-plugin-kit';
import {
  configureClaims,
  createPiExtension,
  mapPiEvent,
  resetClaims,
  piEventToRaw,
  translatePiDecision,
  type PiEvent,
  type PiExtension,
} from './index.js';

type Handler = (event: PiEvent) => unknown | Promise<unknown>;

const ALL_EVENTS = [
  'session_start', 'input', 'before_agent_start', 'message_end', 'tool_call',
  'tool_result', 'user_bash', 'model_select', 'session_before_compact',
  'session_compact', 'session_shutdown',
];

const claimHomes: string[] = [];
afterEach(() => {
  resetClaims();
  for (const home of claimHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function makePi(claimHome?: string): { pi: PiExtension; handlers: Map<string, Handler[]> } {
  const home = claimHome ?? mkdtempSync(join(tmpdir(), 'arcs-pi-setup-'));
  configureClaims(home);
  if (!claimHome) claimHomes.push(home);
  const handlers = new Map<string, Handler[]>();
  const pi: PiExtension = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler as Handler);
      handlers.set(event, list);
    },
  };
  return { pi, handlers };
}

async function invoke(handlers: Map<string, Handler[]>, event: string, payload: PiEvent = {}): Promise<unknown[]> {
  const list = handlers.get(event) ?? [];
  return Promise.all(list.map((h) => h(payload)));
}

describe('pi 事件映射', () => {
  it('11 个原生事件 → 规范事件名', () => {
    expect(mapPiEvent('session_start')).toBe('SessionStart');
    expect(mapPiEvent('input')).toBe('UserPromptSubmit');
    expect(mapPiEvent('before_agent_start')).toBe('UserPromptSubmit');
    expect(mapPiEvent('tool_call')).toBe('PreToolUse');
    expect(mapPiEvent('tool_result', { isError: false })).toBe('PostToolUse');
    expect(mapPiEvent('tool_result', { isError: true })).toBe('PostToolUseFailure');
    expect(mapPiEvent('message_end', { type: 'text' })).toBe('AgentMessage');
    expect(mapPiEvent('message_end', { type: 'thinking' })).toBe('Reasoning');
    expect(mapPiEvent('session_shutdown')).toBe('SessionEnd');
    expect(mapPiEvent('brand.new')).toBe('brand.new');
  });

  it('tool_call 映射为带工具信息的 tool-call RawEvent', () => {
    const raw: RawEvent = piEventToRaw('tool_call', {
      sessionId: 's1', toolName: 'Bash', toolCallId: 'c1', args: { command: 'ls' },
    });
    expect(raw.host).toBe('pi');
    expect(raw.type).toBe('tool-call');
    expect(raw.sessionId).toBe('s1');
    const payload = raw.payload as Record<string, unknown>;
    expect(payload['toolName']).toBe('Bash');
    expect(payload['toolArgs']).toEqual({ command: 'ls' });
    expect(payload['nativeEventName']).toBe('PreToolUse');
  });
});

describe('pi 订阅注册', () => {
  it('默认函数通过 pi.on 注册全部 11 个事件', () => {
    const { pi, handlers } = makePi();
    createPiExtension()(pi);
    for (const name of ALL_EVENTS) {
      expect(handlers.has(name)).toBe(true);
    }
  });

  it('session_start 文件 claim：其它存活进程无法重复记录同一会话', async () => {
    const home = mkdtempSync(join(tmpdir(), 'arcs-pi-claim-'));
    try {
      const { pi, handlers } = makePi(home);
      const raws: RawEvent[] = [];
      createPiExtension({ onRaw: (r) => { raws.push(r); } })(pi);
      await invoke(handlers, 'session_start', { sessionId: 'pi-s1' });
      expect(raws.length).toBe(1);
      expect(
        fileClaimSession({
          home,
          source: 'pi',
          sessionId: 'pi-s1',
          pid: 999999,
          isAlive: () => true,
          now: () => Date.now(),
        }),
      ).toBe(false);
    } finally {
      resetClaims();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('input 暂存 prompt，before_agent_start 消费后产出 UserPromptSubmit', async () => {
    const { pi, handlers } = makePi();
    const raws: RawEvent[] = [];
    createPiExtension({ onRaw: (r) => { raws.push(r); } })(pi);

    await invoke(handlers, 'input', { text: '请修复登录' });
    await invoke(handlers, 'before_agent_start', {});

    const userPrompt = raws.find((r) => (r.payload as Record<string, unknown>)['canonical'] === 'UserPromptSubmit');
    expect(userPrompt).toBeDefined();
    expect((userPrompt!.payload as Record<string, unknown>)['thought']).toBe('请修复登录');
  });
});

describe('pi 注入回写契约', () => {
  it('before_agent_start 的注入返回结构化 message 对象，而非裸字符串', async () => {
    const { pi, handlers } = makePi();
    createPiExtension({ goal: '安全重构' })(pi);
    // 连续 3 次相同 prompt 触发 L2 循环注入（同一 tool pipeline 累积 history）
    let last: unknown;
    for (let i = 0; i < 3; i += 1) {
      await invoke(handlers, 'input', { text: '继续foo' });
      const results = await invoke(handlers, 'before_agent_start', { text: '继续foo' });
      last = results[0];
    }
    const result = last as { message?: { customType?: string; content?: string; display?: boolean } } | undefined;
    expect(result?.message).toBeDefined();
    expect(typeof result?.message).toBe('object');
    expect(result?.message?.customType).toBe('arcs-steering');
    expect(typeof result?.message?.content).toBe('string');
    expect(result?.message?.content).toContain('ARCS');
    expect(result?.message?.display).toBe(false);
  });
});

describe('pi 能力决策', () => {
  it('能力矩阵为 Tier B（无改参/挂起，可注入 + 可 block）', () => {
    const caps = capabilitiesFor('pi');
    expect(caps.tier).toBe('B');
    expect(caps.patchArgs).toBe(false);
    expect(caps.injectMessage).toBe(true);
    expect(caps.suspend).toBe(false);
    expect(caps.block).toBe(true);
    expect(caps.redirectTool).toBe(false);
  });

  it('PatchArgs 不写回参数（Tier B 无改参通道）', () => {
    const decision: HostDecision = { ...emptyDecision(), updatedInput: { command: 'echo fixed' } };
    const translated = translatePiDecision(decision);
    expect(translated.injected).toBe('');
    expect(Object.keys(translated)).not.toContain('updatedInput');
    expect(capabilitiesFor('pi').patchArgs).toBe(false);
  });

  it('危险命令在 tool_call 产出 block（Tier B L4 降级）', async () => {
    const { pi, handlers } = makePi();
    createPiExtension({ goal: '安全重构' })(pi);
    const results = await invoke(handlers, 'tool_call', {
      sessionId: 'e2e', toolName: 'Bash', toolCallId: 'c1', args: { command: 'rm -rf /' },
    });
    expect(results.some((r) => (r as { block?: boolean })?.block === true)).toBe(true);
  });
});

describe('pi fail-open', () => {
  it('安全命令放行（tool_call 不返回 block）', async () => {
    const { pi, handlers } = makePi();
    createPiExtension({ goal: '安全重构' })(pi);
    const results = await invoke(handlers, 'tool_call', {
      toolName: 'Bash', args: { command: 'ls' },
    });
    expect(results.some((r) => (r as { block?: boolean })?.block === true)).toBe(false);
  });

  it('未知/畸形事件不抛异常且原样保留', () => {
    expect(() => mapPiEvent('', {})).not.toThrow();
    expect(mapPiEvent('custom.x')).toBe('custom.x');
    const raw = piEventToRaw('custom.x', {});
    expect(raw.host).toBe('pi');
    expect((raw.payload as Record<string, unknown>)['nativeType']).toBe('custom.x');
  });
});
