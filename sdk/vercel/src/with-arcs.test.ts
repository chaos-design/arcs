import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { LanguageModelV4, LanguageModelV4Content, LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { HashingEmbedder } from '@chaos-design/arcs-core';
import { withArcs, extractThought } from './index.js';
import type { SteerEvent } from './index.js';

function makeMockModel(
  responses: Array<Array<LanguageModelV4Content>>,
): LanguageModelV4 & { calls: () => number } {
  let calls = 0;
  return {
    specificationVersion: 'v4' as const,
    provider: 'mock',
    modelId: 'mock-1',
    supportedUrls: {},
    calls: () => calls,
    async doGenerate() {
      const parts = responses[Math.min(calls, responses.length - 1)]!;
      calls += 1;
      return {
        content: parts,
        finishReason: { unified: 'tool-calls' },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
      } as unknown as LanguageModelV4GenerateResult;
    },
    async doStream() {
      throw new Error('stream sentinel');
    },
  } as unknown as LanguageModelV4 & { calls: () => number };
}

function toolCallPart(name: string, args: Record<string, unknown>, id = 'c1'): LanguageModelV4Content {
  return { type: 'tool-call', toolCallId: id, toolName: name, input: JSON.stringify(args) };
}

const userPrompt = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] } as never;

const BASE_OPTIONS = {
  goal: '重构 src/auth 目录下的鉴权逻辑',
  policy: {
    toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) },
  },
};

describe('withArcs · doGenerate 拦截', () => {
  it('L1：键名幻觉参数被热修复，onSteer 事件字段正确', async () => {
    const model = makeMockModel([[toolCallPart('write_file', { pathh: 'a.ts', content: 'c' })]]);
    const onSteer = vi.fn();
    const wrapped = withArcs(model, { ...BASE_OPTIONS, onSteer });

    const result = await wrapped.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: '开始重构鉴权模块' }] }],
    } as never);
    const part = result.content[0] as { type: string; input: string; toolName: string };
    expect(part.type).toBe('tool-call');
    expect(JSON.parse(part.input)).toEqual({ path: 'a.ts', content: 'c' });
    expect(part.toolName).toBe('write_file');
    expect(onSteer).toHaveBeenCalledTimes(1);
    const event = onSteer.mock.calls[0]![0] as SteerEvent;
    expect(event.level).toBe(1);
    expect(event.effects).toEqual([{ type: 'PatchArgs', patch: { path: 'a.ts', content: 'c' } }]);
    expect(event.reason).toContain('可修复');
    expect(event.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('L2：同一调用第 3 次被替换为虚拟报错文本，finishReason 改为 stop', async () => {
    const model = makeMockModel([[toolCallPart('bash', { command: 'npm test' })]]);
    const onSteer = vi.fn();
    const wrapped = withArcs(model, { goal: 'g', onSteer });

    const r1 = await wrapped.doGenerate(userPrompt);
    const r2 = await wrapped.doGenerate(userPrompt);
    const r3 = await wrapped.doGenerate(userPrompt);
    expect(r1.content[0]!.type).toBe('tool-call');
    expect(r2.content[0]!.type).toBe('tool-call');
    const blocked = r3.content[0] as { type: string; text: string };
    expect(blocked.type).toBe('text');
    expect(blocked.text).toContain('ARCS');
    expect(r3.finishReason.unified).toBe('stop');
    expect(onSteer.mock.calls.at(-1)![0] as SteerEvent).toMatchObject({ level: 2 });
  });

  it('L3：redirectMap 命中 → 改道 toolName（改道后放行，注入跳过）', async () => {
    const model = makeMockModel([[toolCallPart('write_file', { path: 'x.txt', content: 'poem' })]]);
    const wrapped = withArcs(model, {
      goal: '重构 src/auth 目录下的鉴权逻辑',
      policy: {
        redirectMap: { write_file: 'edit_file' },
        embedder: new HashingEmbedder(),
      },
    });
    // thought（用户输入）与 goal 无关 → 语义偏航触发 L3
    const result = await wrapped.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: '帮用户写一首关于春天的诗' }] }],
    } as never);
    expect((result.content[0] as { toolName: string }).toolName).toBe('edit_file');
  });

  it('L4：默认 HITL（未提供回调）→ 阻断并以文本替代；提供 approve 回调则放行', async () => {
    const dangerous = [[toolCallPart('bash', { command: 'rm -rf /tmp/x' })]];
    const blocked = withArcs(makeMockModel(dangerous), { goal: 'g' });
    const r1 = await blocked.doGenerate(userPrompt);
    expect((r1.content[0] as { type: string; text: string }).text).toContain('ARCS 阻断');

    const hitl = vi.fn(async () => true);
    const approved = withArcs(makeMockModel(dangerous), { goal: 'g', hitl });
    const r2 = await approved.doGenerate(userPrompt);
    expect(r2.content[0]!.type).toBe('tool-call');
    expect(hitl).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'bash' }));
  });

  it('无工具调用（纯文本）→ 原样透传且不触发 onSteer', async () => {
    const model = makeMockModel([[{ type: 'text', text: '普通回答' }]]);
    const onSteer = vi.fn();
    const wrapped = withArcs(model, { goal: 'g', onSteer });
    const result = await wrapped.doGenerate(userPrompt);
    expect(result.content[0]).toEqual({ type: 'text', text: '普通回答' });
    expect(onSteer).not.toHaveBeenCalled();
  });

  it('input 非法 JSON → 不介入原样放行；doStream 透传', async () => {
    const model = makeMockModel([[{ type: 'tool-call', toolCallId: 'c', toolName: 't', input: 'not-json' }]]);
    const wrapped = withArcs(model, { goal: 'g' });
    const result = await wrapped.doGenerate(userPrompt);
    expect(result.content[0]!.type).toBe('tool-call');

    const sentinel = { stream: 'sentinel' };
    const m2 = makeMockModel([[]]);
    (m2 as { doStream: unknown }).doStream = async () => sentinel;
    expect(await withArcs(m2, { goal: 'g' }).doStream({} as never)).toBe(sentinel);
  });

  it('extractThought：取最后一条文本消息', () => {
    const prompt = [
      { role: 'system', content: '系统提示' },
      { role: 'user', content: [{ type: 'text', text: '第一条' }, { type: 'text', text: '第二条' }] },
    ] as never;
    expect(extractThought(prompt)).toBe('第二条');
  });
});
