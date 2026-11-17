/** 插件启动方式：常驻服务（stdio 子进程）或宿主内一次性调用（Hook/扩展，无独立服务） */
export type StartKind = 'service' | 'host-managed';

export interface PluginInfo {
  /** `arcs start <name>` 使用的短名 */
  name: string;
  /** npm 包名 */
  package: string;
  /** bin 名（service 型用于解析入口） */
  bin?: string;
  /** 宿主 / 网关 */
  host: string;
  /** 启动方式 */
  kind: StartKind;
  /** 实际可落地的纠偏能力摘要 */
  capability: string;
  /** host-managed 插件的启用提示 */
  enableHint?: string;
}

/**
 * 统一插件清单。`arcs` 只负责发现与拉起，不重复各插件的能力声明；
 * 能力细节以 docs/plugins.md 与 host-kit 能力矩阵为准。
 */
export const PLUGINS: readonly PluginInfo[] = [
  {
    name: 'mcp',
    package: '@chaos-design/arcs-plugin-mcp',
    bin: 'arcs-plugin-mcp',
    host: '所有支持 MCP 的宿主',
    kind: 'service',
    capability: 'STDIO 透明代理 · L1 改参 / L2 虚拟报错 / L3 改道 / L4 阻断',
  },
  {
    name: 'claude-code',
    package: '@chaos-design/arcs-plugin-claude-code',
    host: 'Claude Code',
    kind: 'host-managed',
    capability: '原生 Hook（17）· L1 改参 / L2 注入 / L4 ask',
    enableHint: 'claude --plugin-dir /abs/path/to/arcs/plugins/claude-code',
  },
  {
    name: 'codex',
    package: '@chaos-design/arcs-plugin-codex',
    host: 'OpenAI Codex CLI',
    kind: 'host-managed',
    capability: '原生 Hook（12）· L1 改参 / L2 注入 / L4 deny',
    enableHint: 'codex plugin marketplace add /abs/path/to/arcs',
  },
  {
    name: 'opencode',
    package: '@chaos-design/arcs-plugin-opencode',
    host: 'OpenCode',
    kind: 'host-managed',
    capability: '全局插件 + 工具中间件 · L1 改参 / L2 注入 / L4 挂起',
    enableHint: 'node scripts/install-host-plugins.mjs --client=opencode',
  },
  {
    name: 'zcode',
    package: '@chaos-design/arcs-plugin-zcode',
    host: 'ZCode',
    kind: 'host-managed',
    capability: '原生 Hook（7）· L2 注入 / L4 阻断',
    enableHint: 'node scripts/install-host-plugins.mjs --client=zcode',
  },
  {
    name: 'workbuddy',
    package: '@chaos-design/arcs-plugin-workbuddy',
    host: 'WorkBuddy / CodeBuddy Code',
    kind: 'host-managed',
    capability: '原生 Hook（25）· L2 注入 / L4 阻断',
    enableHint: 'node scripts/install-host-plugins.mjs --client=workbuddy',
  },
  {
    name: 'pi',
    package: '@chaos-design/arcs-plugin-pi',
    host: 'Pi',
    kind: 'host-managed',
    capability: '全局扩展 pi.on · L2 注入 / L4 阻断',
    enableHint: 'node scripts/install-host-plugins.mjs --client=pi',
  },
  {
    name: 'deepseek',
    package: '@chaos-design/arcs-plugin-deepseek',
    host: 'DeepSeek Harness',
    kind: 'host-managed',
    capability: 'Cordis bundle · L2 注入 / L4 事件广播',
    enableHint: 'node scripts/install-host-plugins.mjs --client=deepseek',
  },
  {
    name: 'trae',
    package: '@chaos-design/arcs-plugin-trae',
    host: 'Trae',
    kind: 'host-managed',
    capability: '项目级 hooks（13）· 仅采集与审计',
    enableHint: 'node scripts/install-host-plugins.mjs --client=trae --target=/abs/path/to/workspace',
  },
];

export function findPlugin(name: string | undefined): PluginInfo | undefined {
  if (!name) return undefined;
  return PLUGINS.find((p) => p.name === name);
}
