import type { DriftSensor, DriftSignal, ExecutionContext } from '../types.js';
import { cosine, type Embedder } from '../embedder.js';

/**
 * L3 任务发散检测：goal 与当前 thought 的语义相似度低于阈值即报偏航。
 * 可选传感器（sense 预算紧张时优先跳过）；未注入 Embedder 时直接跳过。
 */
export class SemanticSensor implements DriftSensor {
  readonly kind = 'semantic' as const;
  readonly optional = true as const;

  sense(ctx: ExecutionContext): DriftSignal[] {
    const embedder: Embedder | undefined = ctx.policy.embedder;
    if (!embedder) return [];
    const sim = cosine(embedder.embed(ctx.goal), embedder.embed(ctx.thought));
    if (sim < ctx.policy.driftThreshold) {
      return [
        {
          kind: 'semantic',
          severity: Math.min(1, Number((1 - sim).toFixed(3))),
          score: Number(sim.toFixed(3)),
          evidence: `语义相似度 ${sim.toFixed(3)} 低于阈值 ${ctx.policy.driftThreshold}`,
        },
      ];
    }
    return [];
  }
}
