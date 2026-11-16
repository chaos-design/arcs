import type {
  CoursePlanner,
  DriftSensor,
  DriftSignal,
  EngineOutcome,
  ExecutionContext,
  Policy,
  SteeringEffect,
} from './types.js';
import { PolicySensor } from './sensors/policy-sensor.js';
import { LoopHashSensor } from './sensors/loop-sensor.js';
import { SchemaSensor } from './sensors/schema-sensor.js';
import { SemanticSensor } from './sensors/semantic-sensor.js';
import { RuleBasedPlanner, sanitizeEffects } from './planner.js';

export interface EngineBudgets {
  /** normalize + sense 预算（ms） */
  senseMs: number;
  /** plan 预算（ms） */
  planMs: number;
}

export interface ArcsEngine {
  readonly policy: Policy;
  sense(ctx: ExecutionContext): { signals: DriftSignal[]; degraded: boolean; notes: string[] };
  plan(ctx: ExecutionContext, signals: DriftSignal[]): { effects: SteeringEffect[]; degraded: boolean; notes: string[] };
  run(ctx: ExecutionContext): EngineOutcome;
}

export function defaultSensors(): DriftSensor[] {
  return [new PolicySensor(), new LoopHashSensor(), new SchemaSensor(), new SemanticSensor()];
}

/**
 * core 组装入口：传感器 + 规划器 + 预算 + fail-open（docs/core.md 降级语义）。
 *  - 单传感器异常/超时 → 跳过该传感器，其余照常（degraded）
 *  - 可选传感器在 sense 预算耗尽后跳过
 *  - plan 异常或超预算 → [PassThrough] + degraded
 *  - Suspend 违规组合 → 收敛为单独 Suspend
 */
export function createArcsEngine(
  policy: Policy,
  options: {
    sensors?: DriftSensor[];
    planner?: CoursePlanner;
    budgets?: EngineBudgets;
  } = {},
): ArcsEngine {
  const sensors = options.sensors ?? defaultSensors();
  const planner = options.planner ?? new RuleBasedPlanner();
  const budgets: EngineBudgets = options.budgets ?? { senseMs: 35, planMs: 10 };

  function sense(ctx: ExecutionContext) {
    const t0 = Date.now();
    const signals: DriftSignal[] = [];
    let degraded = false;
    const notes: string[] = [];
    for (const sensor of sensors) {
      if (sensor.optional && Date.now() - t0 >= budgets.senseMs) {
        notes.push(`sense 预算耗尽，跳过可选传感器 ${sensor.kind}`);
        continue;
      }
      try {
        signals.push(...sensor.sense(ctx));
      } catch (err) {
        degraded = true;
        notes.push(`传感器 ${sensor.kind} 异常跳过：${String(err)}`);
      }
    }
    return { signals, degraded, notes };
  }

  function plan(ctx: ExecutionContext, signals: DriftSignal[]) {
    const t0 = Date.now();
    let degraded = false;
    const notes: string[] = [];
    let effects: SteeringEffect[];
    try {
      effects = planner.plan(ctx, signals);
    } catch (err) {
      effects = [{ type: 'PassThrough' }];
      degraded = true;
      notes.push(`plan 异常降级：${String(err)}`);
    }
    if (Date.now() - t0 >= budgets.planMs) {
      effects = [{ type: 'PassThrough' }];
      degraded = true;
      notes.push(`plan 超预算（>${budgets.planMs}ms），降级放行`);
    }
    const clean = sanitizeEffects(effects);
    if (clean.sanitized) notes.push('Suspend 违规组合，已收敛为单独 Suspend');
    return { effects: clean.effects, degraded, notes };
  }

  function run(ctx: ExecutionContext): EngineOutcome {
    const t0 = Date.now();
    const s = sense(ctx);
    const p = plan(ctx, s.signals);
    return {
      effects: p.effects,
      signals: s.signals,
      latencyMs: Date.now() - t0,
      degraded: s.degraded || p.degraded,
      notes: [...s.notes, ...p.notes],
    };
  }

  return { policy, sense, plan, run };
}
