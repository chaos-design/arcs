import {
  createArcsEngine,
  DEFAULT_DANGEROUS_COMMANDS,
  type EngineOutcome,
  type Policy,
  type Snapshot,
  type SteeringEffect,
} from '@chaos-design/arcs-core';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4ToolCall,
} from '@ai-sdk/provider';
import type { SteerEvent, WithArcsOptions } from './types.js';

const HISTORY_MAX = 20;

function buildPolicy(options: WithArcsOptions): Policy {
  const o = options.policy ?? {};
  return {
    driftThreshold: o.driftThreshold ?? 0.75,
    maxConsecutiveLoops: o.maxConsecutiveLoops ?? 2,
    enablePatchArgs: o.enablePatchArgs ?? true,
    protectedPaths: o.protectedPaths ?? ['.env*', '**/migrations/**'],
    dangerousCommands: o.dangerousCommands ?? DEFAULT_DANGEROUS_COMMANDS,
    redirectMap: o.redirectMap ?? {},
    steerMode: o.steerMode ?? 'inject-hint',
    toolSchemas: o.toolSchemas,
    embedder: o.embedder,
  };
}

function effectLevel(effects: SteeringEffect[]): 1 | 2 | 3 | 4 {
  if (effects.some((e) => e.type === 'Suspend')) return 4;
  if (effects.some((e) => e.type === 'RedirectTool')) return 3;
  if (effects.some((e) => e.type === 'InjectMessage')) return 2;
  return 1;
}

/** 从 prompt 提取最后一段可见文本作为 thought（代理无推理内容时以输入文本代之） */
function extractThought(prompt: LanguageModelV4Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i]!;
    if (typeof message.content === 'string') return message.content;
    for (let j = message.content.length - 1; j >= 0; j--) {
      const part = message.content[j]!;
      if (part.type === 'text') return part.text;
    }
  }
  return '';
}

/**
 * 单个 tool-call 的效果翻译（docs/sdk.md：改道后放行规则与 MCP 代理一致——
 * 存在 PatchArgs/RedirectTool 时按序应用并跳过 InjectMessage 替换；Suspend 走 HITL 门）。
 */
async function translateToolCall(
  part: LanguageModelV4ToolCall,
  outcome: EngineOutcome,
  options: WithArcsOptions,
): Promise<LanguageModelV4Content> {
  let current: LanguageModelV4Content = part;
  let forwardApplied = false;
  let replacedText: string | null = null;

  for (const effect of outcome.effects) {
    switch (effect.type) {
      case 'PassThrough':
        break;
      case 'PatchArgs':
        current = { ...part, input: JSON.stringify(effect.patch) };
        forwardApplied = true;
        break;
      case 'RedirectTool':
        current = { ...part, toolName: effect.target };
        forwardApplied = true;
        break;
      case 'InjectMessage':
        if (!forwardApplied) replacedText = effect.content;
        break;
      case 'Suspend': {
        const approved = options.hitl
          ? await options.hitl({ toolCallId: part.toolCallId, toolName: part.toolName, reason: effect.reason })
          : false;
        if (!approved) {
          replacedText = `【ARCS 阻断】${effect.reason}。该高危工具调用已被阻止，请调整方案后重试。`;
        }
        break;
      }
    }
  }

  if (replacedText !== null) {
    return { type: 'text', text: replacedText };
  }
  return current;
}

/**
 * ARCS 模型包装器（docs/sdk.md）：在 `LLM Thought → Tool Execution` 之间
 * 进程内拦截 tool-call，执行 sense → plan，并把效果翻译为框架内控制流。
 *
 * 边界红线：不接管生命周期、不做流量代理；doStream 在 v1 透传（streamText
 * 场景暂无纠偏，见 docs/sdk.md 标注）。
 */
export function withArcs(model: LanguageModelV4, options: WithArcsOptions): LanguageModelV4 {
  const engine = createArcsEngine(buildPolicy(options));
  const history: Snapshot[] = [];

  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,

    async doGenerate(callOptions) {
      const result = await model.doGenerate(callOptions);
      const thought = extractThought(callOptions.prompt);
      const content: LanguageModelV4Content[] = [];

      for (const part of result.content) {
        if (part.type !== 'tool-call' || part.providerExecuted) {
          content.push(part);
          continue;
        }
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(part.input) as Record<string, unknown>;
        } catch {
          content.push(part); // input 非法 JSON：不介入，原样放行
          continue;
        }

        const toolCall = { id: part.toolCallId, name: part.toolName, args };
        const outcome = engine.run({
          goal: options.goal,
          thought,
          toolCall,
          history: [...history],
          budget: { stepsUsed: history.length, stepsMax: 15, elapsedMs: 0 },
          policy: engine.policy,
        });
        // 检测后入史（与 kit 运行时同语义：history 只含既往事件）
        history.push({ thought, toolCall, ts: Date.now() });
        if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);

        if (outcome.effects[0]!.type === 'PassThrough') {
          content.push(part);
          continue;
        }

        const topSignal = [...outcome.signals].sort((a, b) => b.severity - a.severity)[0];
        const suspend = outcome.effects.find(
          (e): e is Extract<SteeringEffect, { type: 'Suspend' }> => e.type === 'Suspend',
        );
        const steered: SteerEvent = {
          level: effectLevel(outcome.effects),
          effects: outcome.effects,
          signals: outcome.signals,
          latencyMs: outcome.latencyMs,
          reason: topSignal?.evidence ?? suspend?.reason ?? '',
        };
        options.onSteer?.(steered);

        const translated = await translateToolCall(part, outcome, options);
        content.push(translated);
      }

      // 全部工具调用被替换为文本时，终止原因不应再是 tool-calls
      const finishReason =
        result.finishReason.unified === 'tool-calls' && !content.some((p) => p.type === 'tool-call')
          ? { ...result.finishReason, unified: 'stop' as const }
          : result.finishReason;

      const translated: LanguageModelV4GenerateResult = { ...result, content, finishReason };
      return translated;
    },

    // v1 透传：streamText 场景暂不纠偏（docs/sdk.md 已标注）
    doStream: (callOptions) => model.doStream(callOptions),
  };
}

export { extractThought };
