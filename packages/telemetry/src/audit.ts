import { z } from 'zod';
import { steeringEffectListSchema } from '@chaos-design/arcs-core';

/** DriftSignal 契约（与 core 类型保持一致的可序列化 Schema） */
export const driftSignalSchema = z.object({
  kind: z.enum(['schema', 'loop', 'semantic', 'policy']),
  severity: z.number().min(0).max(1),
  score: z.number(),
  evidence: z.string(),
});

/** 审计事件：每次编排结束由 PluginRuntime emit（docs/telemetry.md） */
export const auditEventSchema = z.object({
  ts: z.number(),
  sessionId: z.string(),
  host: z.string(),
  /** 触发等级，null = 无偏航放行 */
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.null()]),
  signals: z.array(driftSignalSchema),
  effects: steeringEffectListSchema,
  latencyMs: z.number().min(0),
  /** fail-open 降级标记（docs/constraints.md #7） */
  degraded: z.boolean(),
  /** 仅 L4 存在（由宿主侧适配物化后回填，可选） */
  hitl: z
    .object({ approved: z.boolean(), timeout: z.boolean() })
    .optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type DriftSignalLike = z.infer<typeof driftSignalSchema>;

/** 构造并校验审计事件；校验失败抛出（调用方须自行兜底，遥测不得阻塞主链） */
export function buildAuditEvent(input: AuditEvent): AuditEvent {
  return auditEventSchema.parse(input) as AuditEvent;
}
