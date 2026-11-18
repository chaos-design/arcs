// 构建时由 vite 插件 docsModule() 内嵌的 docs/**/*.md 原文（键为 docs/ 相对路径去 .md）
import docsRaw from 'virtual:arcs-docs';

export interface DocEntry {
  key: string;
  title: string;
  desc: string;
}

export interface NavGroup {
  label: string;
  entries: DocEntry[];
}

/** 侧栏导航（顺序即阅读顺序；title/desc 与 docs/README.md 索引保持一致） */
export const NAV: NavGroup[] = [
  {
    label: '开始',
    entries: [
      { key: 'README', title: '文档索引', desc: '总览与两条核心要求' },
      { key: 'architecture', title: '架构设计', desc: '分层、能力矩阵、稳健性红线' },
      { key: 'directory-layout', title: '目录规划', desc: 'packages / sdk / plugins / site' },
    ],
  },
  {
    label: '包设计',
    entries: [
      { key: 'core', title: 'core 基础内核', desc: '传感器、规划器、预算与降级' },
      { key: 'plugin-kit', title: 'plugin-kit 胶水层', desc: 'HostAdapter 契约与运行时' },
      { key: 'host-kit', title: 'host-kit 宿主运行时', desc: '能力矩阵 / Hook 桥 / 审计 / 会话锁' },
      { key: 'telemetry', title: 'telemetry 遥测', desc: 'AuditEvent、偏移曲线与面板' },
      { key: 'sdk', title: 'SDK 接入', desc: 'withArcs / createArcsNode' },
    ],
  },
  {
    label: '插件与流程',
    entries: [
      { key: 'plugins', title: '宿主插件（9 家）', desc: 'codex / claude-code / mcp 等' },
      { key: 'key-flows', title: '关键流程', desc: '闭环时序 / 四级策略 / HITL' },
    ],
  },
  {
    label: '质量与演进',
    entries: [
      { key: 'testing', title: '测试策略', desc: '三层测试与 CI 边界守护' },
      { key: 'extension-points', title: '扩展点', desc: '新增宿主 / 算法 / Sink' },
      { key: 'constraints', title: '约束说明', desc: '10 条红线与术语' },
      { key: 'roadmap', title: '落地计划', desc: 'P0–P5 与完成标准' },
    ],
  },
  {
    label: '深入',
    entries: [{ key: 'interview', title: '面试题库', desc: '36 题分组，含考点与答案' }],
  },
];

export const ALL_DOCS: Record<string, string> = docsRaw as Record<string, string>;

export function docTitle(key: string): string {
  for (const g of NAV) {
    const hit = g.entries.find((e) => e.key === key);
    if (hit) return hit.title;
  }
  return key;
}
