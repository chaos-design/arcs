import { z } from 'zod';
import { DEFAULT_DANGEROUS_COMMANDS, type Policy } from '@chaos-design/arcs-core';

/** 插件配置 Schema：内置默认 < Policy 默认 < 宿主配置 三级合并（docs/plugin-kit.md） */
export const configSchema = z.object({
  driftThreshold: z.number().min(0).max(1).default(0.75),
  maxConsecutiveLoops: z.number().int().min(1).default(2),
  enablePatchArgs: z.boolean().default(true),
  protectedPaths: z.array(z.string()).default(['.env*', '**/migrations/**']),
  dangerousCommands: z.array(z.string()).default(DEFAULT_DANGEROUS_COMMANDS),
  redirectMap: z.record(z.string(), z.string()).default({}),
  steerMode: z.enum(['inject-hint', 'block']).default('inject-hint'),
  toolSchemas: z.record(z.string(), z.any()).optional(),
  embedder: z.any().optional(),
  /** HITL 审批超时（超时视为拒绝），docs 约定默认 120s */
  hitlTimeoutMs: z.number().int().positive().default(120000),
  /** SessionState 空转 TTL（docs/constraints.md #9），默认 30 分钟 */
  sessionTtlMs: z.number().int().positive().default(1_800_000),
  loopWindowMax: z.number().int().positive().default(8),
  historyMax: z.number().int().positive().default(20),
  senseBudgetMs: z.number().positive().default(35),
  planBudgetMs: z.number().positive().default(10),
});

export type ArcsConfig = z.infer<typeof configSchema>;
export type ConfigOverrides = Partial<ArcsConfig>;

/** 逐层合并（undefined 不覆盖），最后经 Schema 校验补全默认值 */
export function resolveConfig(...layers: Array<ConfigOverrides | undefined>): ArcsConfig {
  const merged: Record<string, unknown> = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return configSchema.parse(merged) as ArcsConfig;
}

/** 配置 → core Policy 映射 */
export function configToPolicy(cfg: ArcsConfig): Policy {
  return {
    driftThreshold: cfg.driftThreshold,
    maxConsecutiveLoops: cfg.maxConsecutiveLoops,
    enablePatchArgs: cfg.enablePatchArgs,
    protectedPaths: cfg.protectedPaths,
    dangerousCommands: cfg.dangerousCommands,
    redirectMap: cfg.redirectMap,
    steerMode: cfg.steerMode,
    toolSchemas: cfg.toolSchemas as Policy['toolSchemas'],
    embedder: cfg.embedder as Policy['embedder'],
  };
}
