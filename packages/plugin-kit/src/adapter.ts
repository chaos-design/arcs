import { z } from 'zod';
import type { ExecutionContext, SteeringEffect } from '@chaos-design/arcs-core';
import type { ArcsConfig } from './config.js';

/** 宿主原始事件（归一前），sessionId 作为 sessionKey */
export const rawEventSchema = z.object({
  host: z.string().min(1),
  type: z.enum(['tool-call', 'thought', 'command']),
  sessionId: z.string().min(1),
  timestamp: z.number(),
  payload: z.unknown(),
});

export type RawEvent = z.infer<typeof rawEventSchema>;

export type MaterializeResult =
  | { applied: true }
  | { applied: false; reason: string };

export interface HitlDecision {
  approved: boolean;
  /** 超时视为拒绝（docs/plugin-kit.md HITL 契约） */
  timeout: boolean;
  comment?: string;
}

export type SuspendEffect = Extract<SteeringEffect, { type: 'Suspend' }>;

/** 审批通道契约：实现必须带超时语义，不得无限挂起执行流 */
export interface HitlTransport {
  request(e: SuspendEffect, ctx: ExecutionContext): Promise<HitlDecision>;
}

/** kit 注入适配器的运行时句柄（Suspend 的审批在 adapter.materialize 内部完成） */
export interface KitHandles {
  hitl: HitlTransport;
  config: ArcsConfig;
}

/**
 * 宿主适配契约（docs/plugin-kit.md）：
 *  - subscribe 采集宿主事件；normalize 归一上下文；materialize 按序落地效果
 *  - setup 为可选钩子：PluginRuntime 初始化时注入 hitl 与最终配置
 */
export interface HostAdapter {
  subscribe(notify: (raw: RawEvent) => void): void;
  normalize(raw: RawEvent): ExecutionContext;
  materialize(effect: SteeringEffect, ctx: ExecutionContext): Promise<MaterializeResult>;
  setup?(handles: KitHandles): void | Promise<void>;
}
