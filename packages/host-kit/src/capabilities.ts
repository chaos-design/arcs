import type { PlatformName } from './platforms.js';

/**
 * 宿主能承载的纠偏动作。ARCS 的 5 种 SteeringEffect 并非每个平台都能落地：
 * - patchArgs    ：能否在工具执行前改写参数（L1）
 * - redirectTool ：能否替换工具名/目标（L3）
 * - injectMessage：能否把纠偏提示送回 Agent 上下文（L2/L3）
 * - suspend      ：能否真正挂起并等待审批恢复（L4）
 * - block        ：能否拒绝单个动作（L4 的降级形态）
 */
export type SteeringCapability =
  | 'patchArgs'
  | 'redirectTool'
  | 'injectMessage'
  | 'suspend'
  | 'block';

export interface HostCapabilities {
  readonly source: PlatformName;
  readonly tier: 'A' | 'B' | 'C';
  readonly patchArgs: boolean;
  readonly redirectTool: boolean;
  readonly injectMessage: boolean;
  readonly suspend: boolean;
  readonly block: boolean;
  /** 能力来源与降级原因，写入文档供审计，不做虚假承诺 */
  readonly note: string;
}

/**
 * 能力矩阵。取自各平台原生扩展点契约与 astro 的同款接入取证：
 * Tier A 可改参 + 可阻塞 → 完整 L1-L4；
 * Tier B 可阻塞但难改参 → L1-L3 + 注入，L4 降为 block；
 * Tier C 只读观测 → 采集与审计，注入仅在宿主允许 hook 输出追加上下文时生效。
 */
export const HOST_CAPABILITIES: Readonly<Record<PlatformName, HostCapabilities>> = {
  'claude-code': {
    source: 'claude-code',
    tier: 'A',
    patchArgs: true,
    redirectTool: false,
    injectMessage: true,
    suspend: true,
    block: true,
    note: 'PreToolUse 支持 updatedInput + permissionDecision(allow|deny|ask)，可落地 L1/L2/L4；工具名不可改，L3 降级为注入',
  },
  opencode: {
    source: 'opencode',
    tier: 'A',
    patchArgs: true,
    redirectTool: false,
    injectMessage: true,
    suspend: true,
    block: true,
    note: '工具中间件 tool.execute.before 可改参、permission.ask 可挂起；工具名不可替换，L3 降级为注入',
  },
  zcode: {
    source: 'zcode',
    tier: 'B',
    patchArgs: false,
    redirectTool: false,
    injectMessage: true,
    suspend: false,
    block: true,
    note: '仅 7 个 hook，可 deny 但无改参与审批回调通道；L1/L3 降为注入，L4 降为 block',
  },
  workbuddy: {
    source: 'workbuddy',
    tier: 'B',
    patchArgs: false,
    redirectTool: false,
    injectMessage: true,
    suspend: false,
    block: true,
    note: '25 个 hook，--event 传事件名；可拒绝但无改参通道，L4 降为 block',
  },
  pi: {
    source: 'pi',
    tier: 'B',
    patchArgs: false,
    redirectTool: false,
    injectMessage: true,
    suspend: false,
    block: true,
    note: '全局扩展事件订阅，可拦截但无稳定改参契约，L4 降为 block',
  },
  deepseek: {
    source: 'deepseek',
    tier: 'B',
    patchArgs: false,
    redirectTool: false,
    injectMessage: true,
    suspend: false,
    block: true,
    note: 'Cordis bundle ctx.on 订阅，可拒绝但无改参通道，L4 降为 block',
  },
  trae: {
    source: 'trae',
    tier: 'C',
    patchArgs: false,
    redirectTool: false,
    injectMessage: true,
    suspend: false,
    block: false,
    note: '项目级只读 hooks，仅采集与审计；注入仅在宿主允许 hook 输出追加上下文时生效',
  },
  chatgpt: {
    source: 'chatgpt',
    tier: 'A',
    patchArgs: true,
    redirectTool: false,
    injectMessage: true,
    suspend: false,
    block: true,
    note: 'ChatGPT / Codex 兼容 PreToolUse 契约：permissionDecision allow/deny 与 updatedInput；官方 schema 中的 ask 当前「parsed but not supported」，ask 一律降为 deny；真实宿主版本需集成方验证',
  },
  'qwen-code': {
    source: 'qwen-code',
    tier: 'B',
    patchArgs: false,
    redirectTool: false,
    injectMessage: true,
    suspend: false,
    block: true,
    note: 'Qwen Code CLI 的 Gemini 兼容 BeforeTool hook：可阻断与注入，改参契约待核实；按 Tier B 保守降级',
  },
};

export function capabilitiesFor(source: PlatformName): HostCapabilities {
  return HOST_CAPABILITIES[source];
}

/** 某能力是否在给定平台上可用（供一致性测试与降级日志使用） */
export function hasCapability(caps: HostCapabilities, capability: SteeringCapability): boolean {
  return caps[capability];
}
