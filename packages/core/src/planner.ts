import type { CoursePlanner, DriftKind, DriftSignal, ExecutionContext, SteeringEffect } from './types.js';
import { buildSchemaPatch } from './sensors/schema-sensor.js';

/** 等级优先级：L4 > L3 > L2 > L1，单事件取最高优先级信号做出单一决策 */
const PRIORITY: Record<DriftKind, number> = { policy: 4, semantic: 3, loop: 2, schema: 1 };

/**
 * 默认规则规划器：DriftSignal → 有序 SteeringEffect 列表。
 * 契约（docs/core.md 效果列表约定）：
 *  - policy(L4) → [Suspend]（独立出现）
 *  - semantic(L3) → [RedirectTool?, InjectMessage]（有 redirectMap 才改道）
 *  - loop(L2) → [InjectMessage]（虚拟报错提示）
 *  - schema(L1) → [PatchArgs]（可修复时）否则 [InjectMessage]
 */
export class RuleBasedPlanner implements CoursePlanner {
  plan(ctx: ExecutionContext, signals: DriftSignal[]): SteeringEffect[] {
    if (signals.length === 0) return [{ type: 'PassThrough' }];
    const top = [...signals].sort(
      (a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || b.severity - a.severity,
    )[0];
    if (!top) return [{ type: 'PassThrough' }];

    switch (top.kind) {
      case 'policy':
        return [{ type: 'Suspend', reason: top.evidence }];

      case 'semantic': {
        const effects: SteeringEffect[] = [];
        const target = ctx.policy.redirectMap[ctx.toolCall.name];
        if (target) effects.push({ type: 'RedirectTool', target });
        effects.push({
          type: 'InjectMessage',
          role: 'system',
          content: `【ARCS 纠偏】当前动作（${ctx.toolCall.name}）已偏离既定目标，证据：${top.evidence}。请立即回到目标：${ctx.goal}`,
        });
        return effects;
      }

      case 'loop':
        return [
          {
            type: 'InjectMessage',
            role: 'tool',
            content: `【ARCS 纠偏 · 虚拟报错】工具 ${ctx.toolCall.name} 已连续重复 ${top.score} 次且结果相同，继续重试无意义。请更换排查思路，朝目标推进：${ctx.goal}`,
          },
        ];

      case 'schema': {
        if (ctx.policy.enablePatchArgs) {
          const patch = buildSchemaPatch(ctx.toolCall, ctx.policy.toolSchemas![ctx.toolCall.name]!);
          if (patch.fixable && patch.patch) {
            return [{ type: 'PatchArgs', patch: patch.patch }];
          }
        }
        return [
          {
            type: 'InjectMessage',
            role: 'tool',
            content: `【ARCS 纠偏】工具 ${ctx.toolCall.name} 参数校验失败且无法自动修复：${top.evidence}`,
          },
        ];
      }
    }
  }
}

/** Suspend 只能独立出现且位于末位（docs/constraints.md #8）；违规时收敛为单独 Suspend */
export function sanitizeEffects(effects: SteeringEffect[]): {
  effects: SteeringEffect[];
  sanitized: boolean;
} {
  const suspendIdx = effects.findIndex((e) => e.type === 'Suspend');
  if (suspendIdx === -1) return { effects, sanitized: false };
  const suspend = effects[suspendIdx];
  if (effects.length === 1 && suspendIdx === 0) return { effects, sanitized: false };
  return { effects: [suspend], sanitized: true };
}
