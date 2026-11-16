import { describe, expect, it, vi } from 'vitest';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import type { LanguageModelV4, LanguageModelV4Content, LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { withArcs } from './index.js';

/** 返回固定 tool-call 的 mock 模型（真实 generateText 驱动） */
function scriptedModel(parts: LanguageModelV4Content[]): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-1',
    supportedUrls: {},
    doGenerate: async () =>
      ({
        content: parts,
        finishReason: { unified: 'tool-calls' },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
      }) as unknown as LanguageModelV4GenerateResult,
    doStream: async () => {
      throw new Error('unused');
    },
  } as unknown as LanguageModelV4;
}

describe('generateText 全链集成（真实 ai 包 + mock 模型）', () => {
  it('L1：execute 收到热修复后的参数', async () => {
    const execute = vi.fn(async () => 'ok');
    const model = withArcs(scriptedModel([{ type: 'tool-call', toolCallId: 'c1', toolName: 'write_file', input: JSON.stringify({ pathh: 'a.ts', content: 'c' }) }]), {
      goal: '重构鉴权模块',
      policy: { toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) } },
    });

    const result = await generateText({
      model,
      prompt: '开始重构鉴权模块',
      tools: {
        write_file: tool({ description: '写文件', inputSchema: z.object({ path: z.string(), content: z.string() }), execute }),
      },
      stopWhen: stepCountIs(2),
    });

    expect(execute).toHaveBeenCalledTimes(2); // 两步各触发一次，均被补参
    expect(execute.mock.calls[0]![0]).toEqual({ path: 'a.ts', content: 'c' });
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('L4：高危调用被阻断（execute 不执行），提示文本成为模型输出', async () => {
    const execute = vi.fn(async () => 'ok');
    const model = withArcs(scriptedModel([{ type: 'tool-call', toolCallId: 'c1', toolName: 'bash', input: JSON.stringify({ command: 'rm -rf /tmp/x' }) }]), {
      goal: '重构鉴权模块',
    });

    const result = await generateText({
      model,
      prompt: 'x',
      tools: {
        bash: tool({ description: '执行命令', inputSchema: z.object({ command: z.string() }), execute }),
      },
      stopWhen: stepCountIs(2),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.text).toContain('ARCS 阻断');
  });
});
