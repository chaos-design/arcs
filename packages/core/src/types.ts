import type { ZodTypeAny } from 'zod';
import type { Embedder } from './embedder.js';

/** 工具调用 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** 历史执行快照（供循环检测等使用） */
export interface Snapshot {
  thought: string;
  toolCall: ToolCall;
  ts: number;
  outcome?: 'ok' | 'error';
}

/** 预算计数 */
export interface Budget {
  stepsUsed: number;
  stepsMax: number;
  elapsedMs: number;
}

/** 策略：阈值、保护路径、操舵模式等约束（由胶水层/SDK 从配置映射而来） */
export interface Policy {
  /** 语义相似度低于该阈值视为任务发散（L3） */
  driftThreshold: number;
  /** 同一工具连续重复的容忍次数，超过即触发 L2 */
  maxConsecutiveLoops: number;
  /** 是否开启工具参数自动热修复（L1） */
  enablePatchArgs: boolean;
  /** 保护路径 glob 列表（L4） */
  protectedPaths: string[];
  /** 高危命令正则（字符串形式，L4） */
  dangerousCommands: string[];
  /** 工具降级路由映射：偏航工具 → 安全替代工具（L3 改道用） */
  redirectMap: Record<string, string>;
  /** 操舵模式 */
  steerMode: 'inject-hint' | 'block';
  /** 工具参数 Schema 注册表（L1 校验依据，可选） */
  toolSchemas?: Record<string, ZodTypeAny>;
  /** 语义嵌入器（L3 检测依据，可选；缺省时跳过语义检测） */
  embedder?: Embedder;
}

/** 偏航信号类别，与纠偏等级一一对应：schema→L1、loop→L2、semantic→L3、policy→L4 */
export type DriftKind = 'schema' | 'loop' | 'semantic' | 'policy';

export interface DriftSignal {
  kind: DriftKind;
  /** 0–1，越界程度 */
  severity: number;
  /** 原始得分 / 证据数值 */
  score: number;
  evidence: string;
}

/**
 * 纠偏效果判别联合。plan 输出其有序列表，运行时按序物化：
 *  - L1 = [PatchArgs]（patch 为修复后的完整参数，整体替换）
 *  - L2 = [InjectMessage]
 *  - L3 = [RedirectTool, InjectMessage]
 *  - L4 = [Suspend]（只能独立出现且位于末位）
 */
export type SteeringEffect =
  | { type: 'PassThrough' }
  | { type: 'PatchArgs'; patch: Record<string, unknown> }
  | { type: 'InjectMessage'; role: 'system' | 'tool'; content: string }
  | { type: 'RedirectTool'; target: string }
  | { type: 'Suspend'; reason: string };

/** 归一化执行快照（history/budget 由胶水层 SessionState 注入） */
export interface ExecutionContext {
  goal: string;
  thought: string;
  toolCall: ToolCall;
  history: Snapshot[];
  budget: Budget;
  policy: Policy;
}

export interface DriftSensor {
  readonly kind: DriftKind;
  /** 可选传感器：超出 sense 预算时优先跳过 */
  readonly optional?: boolean;
  sense(ctx: ExecutionContext): DriftSignal[];
}

export interface CoursePlanner {
  plan(ctx: ExecutionContext, signals: DriftSignal[]): SteeringEffect[];
}

/** 引擎单次 run 的结果（sense + plan 组合，fail-open 兜底后） */
export interface EngineOutcome {
  effects: SteeringEffect[];
  signals: DriftSignal[];
  latencyMs: number;
  degraded: boolean;
  notes: string[];
}
