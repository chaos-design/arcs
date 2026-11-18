import { z } from 'zod';
import type { SteeringEffect } from './types.js';

/** SteeringEffect 判别联合的 zod 契约（可 JSON 化红线，docs/constraints.md #3） */
export const steeringEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PassThrough') }),
  z.object({ type: z.literal('PatchArgs'), patch: z.record(z.string(), z.unknown()) }),
  z.object({
    type: z.literal('InjectMessage'),
    role: z.enum(['system', 'tool']),
    content: z.string(),
  }),
  z.object({ type: z.literal('RedirectTool'), target: z.string().min(1) }),
  z.object({ type: z.literal('Suspend'), reason: z.string().min(1) }),
]);

export const steeringEffectListSchema = z.array(steeringEffectSchema);

/** 序列化：校验后输出 JSON（审计 / 回放 / 遥测通用） */
export function serializeEffects(effects: SteeringEffect[]): string {
  const parsed = steeringEffectListSchema.parse(effects);
  return JSON.stringify(parsed);
}

/** 反序列化：JSON → 效果列表（roundtrip 保持类型不变） */
export function parseEffects(json: string): SteeringEffect[] {
  return steeringEffectListSchema.parse(JSON.parse(json)) as SteeringEffect[];
}
