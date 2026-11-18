import {
  createArcsEngine,
  DEFAULT_DANGEROUS_COMMANDS,
  type DriftSignal,
  type Policy,
  type Snapshot,
  type SteeringEffect,
} from '@chaos-design/arcs-core';

/** LangGraph 节点状态约定（宿主图状态需包含以下字段） */
export interface ArcsNodeState {
  goal: string;
  thought: string;
  toolCall?: { id?: string; name: string; args: Record<string, unknown> } | null;
  history?: Array<{
    thought: string;
    toolCall: { id?: string; name: string; args: Record<string, unknown> };
    outcome?: 'ok' | 'error';
  }>;
}

export interface SteerEvent {
  level: 1 | 2 | 3 | 4;
  effects: SteeringEffect[];
  signals: DriftSignal[];
  latencyMs: number;
  reason: string;
}

/** 节点输出：写回宿主图状态（toolCall 改写/置空 + 注入提示 + 纠偏事件） */
export interface ArcsNodeOutput {
  /** 改写后的工具调用；null = 阻断（PatchArgs/RedirectTool 或 L2/L4 阻断时） */
  toolCall?: ArcsNodeState['toolCall'] | null;
  /** 注入宿主对话的纠偏提示文本（L2 虚拟报错 / L4 阻断提示） */
  inject?: string;
  steer?: SteerEvent;
}

export interface CreateArcsNodeOptions {
  /** 既定目标（Goal） */
  goal: string;
  /** 策略覆盖 */
  policy?: Partial<
    Pick<
      Policy,
      | 'driftThreshold'
      | 'maxConsecutiveLoops'
      | 'enablePatchArgs'
      | 'protectedPaths'
      | 'dangerousCommands'
      | 'redirectMap'
      | 'steerMode'
      | 'toolSchemas'
      | 'embedder'
    >
  >;
}

function buildPolicy(options: CreateArcsNodeOptions): Policy {
  const o = options.policy ?? {};
  return {
    driftThreshold: o.driftThreshold ?? 0.75,
    maxConsecutiveLoops: o.maxConsecutiveLoops ?? 2,
    enablePatchArgs: o.enablePatchArgs ?? true,
    protectedPaths: o.protectedPaths ?? ['.env*', '**/migrations/**'],
    dangerousCommands: o.dangerousCommands ?? DEFAULT_DANGEROUS_COMMANDS,
    redirectMap: o.redirectMap ?? {},
    steerMode: o.steerMode ?? 'inject-hint',
    toolSchemas: o.toolSchemas,
    embedder: o.embedder,
  };
}

/**
 * LangGraph 兼容纠偏节点（零框架依赖）：在 `LLM Thought → Tool Execution` 的
 * 图节点位拦截 toolCall，执行 sense → plan，输出改写后的状态增量。
 * 效果翻译与 MCP 代理/vercel SDK 同规则：改道优先、注入跳过；Suspend（节点无
 * HITL 通道）按拒绝语义阻断 + 提示。
 *
 * 用法：`graph.addNode('arcs', createArcsNode({ goal: '...' }))`
 */
export function createArcsNode(options: CreateArcsNodeOptions) {
  const engine = createArcsEngine(buildPolicy(options));
  return async (state: ArcsNodeState): Promise<ArcsNodeOutput> => {
    if (!state.toolCall) return {};
    const toolCall = {
      id: state.toolCall.id ?? 'node-tool-call',
      name: state.toolCall.name,
      args: state.toolCall.args,
    };
    const history: Snapshot[] = (state.history ?? []).slice(-20).map((h, i) => ({
      thought: h.thought,
      toolCall: { id: h.toolCall.id ?? `h-${i}`, name: h.toolCall.name, args: h.toolCall.args },
      ts: i,
      outcome: h.outcome,
    }));

    const outcome = engine.run({
      goal: state.goal,
      thought: state.thought,
      toolCall,
      history,
      budget: { stepsUsed: history.length, stepsMax: 15, elapsedMs: 0 },
      policy: engine.policy,
    });

    const effects = outcome.effects;
    if (effects[0]!.type === 'PassThrough') return {};

    const topSignal = [...outcome.signals].sort((a, b) => b.severity - a.severity)[0];
    const suspend = effects.find(
      (e): e is Extract<SteeringEffect, { type: 'Suspend' }> => e.type === 'Suspend',
    );
    const steer: SteerEvent = {
      level: effects.some((e) => e.type === 'Suspend')
        ? 4
        : effects.some((e) => e.type === 'RedirectTool')
          ? 3
          : effects.some((e) => e.type === 'InjectMessage')
            ? 2
            : 1,
      effects,
      signals: outcome.signals,
      latencyMs: outcome.latencyMs,
      reason: topSignal?.evidence ?? suspend?.reason ?? '',
    };

    let forwardToolCall: ArcsNodeState['toolCall'] = null;
    let inject: string | undefined;
    for (const effect of effects) {
      if (effect.type === 'PatchArgs') {
        forwardToolCall = { ...state.toolCall, args: effect.patch };
      } else if (effect.type === 'RedirectTool') {
        forwardToolCall = { ...state.toolCall, name: effect.target };
      } else if (effect.type === 'InjectMessage' && forwardToolCall === null) {
        inject = effect.content;
      } else if (effect.type === 'Suspend') {
        inject = `【ARCS 阻断】${effect.reason}。该高危工具调用已被节点拦截，请调整方案后重试。`;
      }
    }

    if (forwardToolCall !== null) {
      return { toolCall: forwardToolCall, steer };
    }
    // 阻断（L2/L4）：置空 toolCall + 注入提示
    return { toolCall: null, inject, steer };
  };
}
