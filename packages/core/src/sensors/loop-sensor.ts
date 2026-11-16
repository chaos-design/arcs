import type { DriftSensor, DriftSignal, ExecutionContext, ToolCall } from '../types.js';

/** 工具调用指纹：名称 + 排序后参数的稳定哈希（djb2 → 36 进制） */
export function fingerprint(toolCall: ToolCall): string {
  const stable = JSON.stringify([
    toolCall.name,
    Object.keys(toolCall.args)
      .sort()
      .map((k) => [k, toolCall.args[k]]),
  ]);
  let h = 5381;
  for (let i = 0; i < stable.length; i++) h = ((h << 5) + h + stable.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * 滑动窗口循环检测（L2）：基于 history 尾部的连续同指纹计数。
 * 触发条件：连续出现次数（含当前）> policy.maxConsecutiveLoops。
 */
export class LoopHashSensor implements DriftSensor {
  readonly kind = 'loop' as const;

  sense(ctx: ExecutionContext): DriftSignal[] {
    const fp = fingerprint(ctx.toolCall);
    let consecutive = 0;
    for (let i = ctx.history.length - 1; i >= 0; i--) {
      const snapshot = ctx.history[i];
      if (snapshot && fingerprint(snapshot.toolCall) === fp) consecutive += 1;
      else break;
    }
    const occurrences = consecutive + 1;
    if (occurrences > ctx.policy.maxConsecutiveLoops) {
      return [
        {
          kind: 'loop',
          severity: Math.min(1, 0.5 + 0.1 * consecutive),
          score: occurrences,
          evidence: `同一工具调用连续重复 ${occurrences} 次（容忍 ${ctx.policy.maxConsecutiveLoops}）：${ctx.toolCall.name}`,
        },
      ];
    }
    return [];
  }
}
