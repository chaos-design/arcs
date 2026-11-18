import type { DriftSignal, SteeringEffect } from '@chaos-design/arcs-core';

/** 操舵介入事件（docs/sdk.md SteerEvent 契约） */
export interface SteerEvent {
  /** 触发的纠偏等级 */
  level: 1 | 2 | 3 | 4;
  /** 实际物化的有序效果列表 */
  effects: SteeringEffect[];
  /** 触发信号 */
  signals: DriftSignal[];
  /** sense + plan 耗时 */
  latencyMs: number;
  /** 人类可读的介入原因 */
  reason: string;
}

export interface HitlRequest {
  toolCallId: string;
  toolName: string;
  reason: string;
}

export interface WithArcsOptions {
  /** 既定目标（Goal） */
  goal: string;
  /** 策略覆盖（阈值、保护路径、redirectMap、toolSchemas 等） */
  policy?: {
    driftThreshold?: number;
    maxConsecutiveLoops?: number;
    enablePatchArgs?: boolean;
    protectedPaths?: string[];
    dangerousCommands?: string[];
    redirectMap?: Record<string, string>;
    steerMode?: 'inject-hint' | 'block';
    toolSchemas?: Record<string, import('zod').ZodTypeAny>;
    embedder?: import('@chaos-design/arcs-core').Embedder;
  };
  /** 操舵介入回调（仅在纠偏发生时触发） */
  onSteer?: (event: SteerEvent) => void;
  /**
   * L4 高危动作的进程内 HITL 回调（confirm UI / webhook 等）。
   * 返回 true 放行原工具调用；false/缺省 → 阻断并以文本提示替代。
   */
  hitl?: (request: HitlRequest) => Promise<boolean>;
}
