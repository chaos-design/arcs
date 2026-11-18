import type { SteeringEffect } from '@chaos-design/arcs-core';
import { effectLevel } from '@chaos-design/arcs-plugin-kit';
import type { HostCapabilities } from './capabilities.js';

/** 宿主 hook 的通用决策语义，由各平台序列化为自身的字段名 */
export type HostDecisionKind = 'allow' | 'block' | 'ask';

export interface InjectedMessage {
  role: 'system' | 'tool';
  content: string;
}

export interface HostDecision {
  kind: HostDecisionKind;
  reason?: string;
  /** PatchArgs 的修复后完整参数（整体替换） */
  updatedInput?: Record<string, unknown>;
  /** RedirectTool 的目标工具名 */
  updatedName?: string;
  injected: InjectedMessage[];
  /** 因宿主能力不足而未能原样落地的效果，供审计与文档核对 */
  degraded: string[];
  level: 1 | 2 | 3 | 4 | null;
}

export interface DecisionSubject {
  name: string;
  args: Record<string, unknown>;
}

export function emptyDecision(): HostDecision {
  return { kind: 'allow', injected: [], degraded: [], level: null };
}

function withLevel(decision: HostDecision, effects: SteeringEffect[]): HostDecision {
  decision.level = effectLevel(effects);
  return decision;
}

/**
 * 按宿主能力把一条效果翻译为宿主决策。任何能力缺口都 fail-open：
 * 宁可放行并留审计痕迹，也不阻断 Agent 任务（docs/constraints.md #7）。
 */
export function applyEffect(
  decision: HostDecision,
  effect: SteeringEffect,
  caps: HostCapabilities,
  _subject: DecisionSubject,
): HostDecision {
  switch (effect.type) {
    case 'PassThrough':
      return decision;

    case 'PatchArgs':
      if (caps.patchArgs) {
        decision.updatedInput = effect.patch;
      } else {
        decision.degraded.push('patchArgs');
        decision.injected.push({
          role: 'system',
          content: `[ARCS] 检测到工具参数需要修正，但宿主 ${caps.source} 不支持自动改参，请检查参数后重试：${JSON.stringify(effect.patch)}`,
        });
      }
      return decision;

    case 'RedirectTool':
      if (caps.redirectTool) {
        decision.updatedName = effect.target;
      } else {
        decision.degraded.push('redirectTool');
        decision.injected.push({
          role: 'system',
          content: `[ARCS] 当前工具方向已偏航，建议改用安全工具 "${effect.target}"（宿主 ${caps.source} 不支持自动改道）。`,
        });
      }
      return decision;

    case 'InjectMessage':
      if (caps.injectMessage) {
        decision.injected.push({ role: effect.role, content: effect.content });
      } else {
        decision.degraded.push('injectMessage');
      }
      return decision;

    case 'Suspend':
      if (caps.suspend) {
        decision.kind = 'ask';
        decision.reason = effect.reason;
      } else if (caps.block) {
        decision.kind = 'block';
        decision.reason = effect.reason;
        decision.degraded.push('suspend→block');
      } else {
        decision.degraded.push('suspend→allow');
        decision.injected.push({
          role: 'system',
          content: `[ARCS] 该动作需要人工审批，但宿主 ${caps.source} 不支持挂起，已按 fail-open 放行：${effect.reason}`,
        });
      }
      return decision;
  }
}

/** 有序效果列表 → 宿主决策（Suspend 位于末位，由 core 保证） */
export function translateEffects(
  effects: SteeringEffect[],
  caps: HostCapabilities,
  subject: DecisionSubject,
): HostDecision {
  let decision = emptyDecision();
  for (const effect of effects) {
    decision = applyEffect(decision, effect, caps, subject);
  }
  return withLevel(decision, effects);
}
