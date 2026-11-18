import type { Lang } from './routes';

export interface DocEntry {
  key: string;
  title: string;
  desc: string;
}

export interface NavGroup {
  label: string;
  entries: DocEntry[];
}

/** 侧栏阅读顺序 = docs/README.md 索引顺序；两种语言共用逻辑键，仅标题/描述不同 */
const NAV_ZH: NavGroup[] = [
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

const NAV_EN: NavGroup[] = [
  {
    label: 'Get started',
    entries: [
      { key: 'README', title: 'Documentation index', desc: 'Overview and two core requirements' },
      { key: 'architecture', title: 'Architecture', desc: 'Layers, capability matrix, robustness red lines' },
      { key: 'directory-layout', title: 'Directory layout', desc: 'packages / sdk / plugins / site' },
    ],
  },
  {
    label: 'Package design',
    entries: [
      { key: 'core', title: 'core · Foundations', desc: 'Sensors, planner, budget and degradation' },
      { key: 'plugin-kit', title: 'plugin-kit · Glue layer', desc: 'HostAdapter contract and runtime' },
      { key: 'host-kit', title: 'host-kit · Host runtime', desc: 'Capability matrix / Hook bridge / audit / session lock' },
      { key: 'telemetry', title: 'telemetry · Telemetry', desc: 'AuditEvent, drift curve and dashboard' },
      { key: 'sdk', title: 'SDK integration', desc: 'withArcs / createArcsNode' },
    ],
  },
  {
    label: 'Plugins and flows',
    entries: [
      { key: 'plugins', title: 'Host plugins (9)', desc: 'codex / claude-code / mcp, etc.' },
      { key: 'key-flows', title: 'Key flows', desc: 'Closed loop / four-level strategies / HITL' },
    ],
  },
  {
    label: 'Quality and evolution',
    entries: [
      { key: 'testing', title: 'Testing strategy', desc: 'Three-layer tests and CI guardrails' },
      { key: 'extension-points', title: 'Extension points', desc: 'New host / algorithm / sink' },
      { key: 'constraints', title: 'Constraints', desc: '10 red lines and glossary' },
      { key: 'roadmap', title: 'Roadmap', desc: 'P0–P5 and completion criteria' },
    ],
  },
  {
    label: 'Deep dive',
    entries: [{ key: 'interview', title: 'Interview bank', desc: '36 questions with key points and answers' }],
  },
];

export function navFor(lang: Lang): NavGroup[] {
  return lang === 'en' ? NAV_EN : NAV_ZH;
}

/** 上一篇/下一篇共用的顺序（两种语言一致） */
export const ORDERED_KEYS: string[] = NAV_ZH.flatMap((g) => g.entries.map((e) => e.key));

export function docTitle(key: string, lang: Lang): string {
  for (const group of navFor(lang)) {
    const hit = group.entries.find((e) => e.key === key);
    if (hit) return hit.title;
  }
  return key;
}

interface Strings {
  home: string;
  githubRepo: string;
  openNav: string;
  closeNav: string;
  githubAria: string;
  heroKicker: string;
  heroTitleLead: string;
  heroTitleGrad: string;
  heroLead: string;
  heroCtaArchitecture: string;
  heroCtaInterview: string;
  heroCtaGithub: string;
  stat1Value: string;
  stat1Label: string;
  stat2Value: string;
  stat2Label: string;
  stat3Value: string;
  stat3Label: string;
  stat4Value: string;
  stat4Label: string;
  principle1Title: string;
  principle1Body: string;
  principle2Title: string;
  principle2Body: string;
  docMatrix: string;
  mermaidWarning: string;
  docNotFound: string;
  docNotFoundHint: string;
  docNotFoundHint2: string;
  backHome: string;
  notFoundTitle: string;
  notFoundBody: string;
}

const STRINGS: Record<Lang, Strings> = {
  zh: {
    home: '首页',
    githubRepo: 'GitHub 仓库 ↗',
    openNav: '打开导航',
    closeNav: '关闭导航',
    githubAria: 'GitHub 仓库',
    heroKicker: 'Agent Runtime Correction System',
    heroTitleLead: 'ARCS：Agent 执行流内的',
    heroTitleGrad: '实时纠偏系统',
    heroLead:
      '在工具调用落地前检测偏航——参数幻觉、死循环、任务发散、高危越权——并原地修复：修参数、注入提示、改道工具、请求审批。任务始终向前推进，从不被中断。',
    heroCtaArchitecture: '从架构设计开始 →',
    heroCtaInterview: '面试题库',
    heroCtaGithub: 'GitHub ↗',
    stat1Value: '4 级',
    stat1Label: '纠偏策略 L1–L4',
    stat2Value: '9 家',
    stat2Label: '宿主插件 + 2 个 SDK',
    stat3Value: 'p99 < 50ms',
    stat3Label: 'sense + plan 预算',
    stat4Value: 'fail-open',
    stat4Label: '绝不成为中断源',
    principle1Title: '① 任务不中断',
    principle1Body: '纠偏发生在执行流内部——修复参数、注入提示、重定向工具——任务始终向前推进。',
    principle2Title: '② 偏航立即纠偏',
    principle2Body: '实时检测执行方向与既定目标的偏差，越界即修正，避免 Agent 在错误方向越走越远。',
    docMatrix: '文档矩阵',
    mermaidWarning: '部分 Mermaid 图渲染失败，已回退显示源码。',
    docNotFound: '文档不存在',
    docNotFoundHint: '未找到 ',
    docNotFoundHint2: '。请从侧栏选择文档，或',
    backHome: '返回首页',
    notFoundTitle: '404',
    notFoundBody: '页面不存在。请从侧栏选择文档。',
  },
  en: {
    home: 'Home',
    githubRepo: 'GitHub repo ↗',
    openNav: 'Open navigation',
    closeNav: 'Close navigation',
    githubAria: 'GitHub repository',
    heroKicker: 'Agent Runtime Correction System',
    heroTitleLead: 'ARCS: ',
    heroTitleGrad: 'real-time course steering for agents',
    heroLead:
      'Detect drift before tool calls land — hallucinated arguments, loops, goal divergence, privilege escalation — and repair in place: patch parameters, inject prompts, redirect tools, request approval. Tasks keep moving, never interrupted.',
    heroCtaArchitecture: 'Start with architecture →',
    heroCtaInterview: 'Interview bank',
    heroCtaGithub: 'GitHub ↗',
    stat1Value: '4 levels',
    stat1Label: 'Correction strategies L1–L4',
    stat2Value: '9 hosts',
    stat2Label: 'Host plugins + 2 SDKs',
    stat3Value: 'p99 < 50ms',
    stat3Label: 'sense + plan budget',
    stat4Value: 'fail-open',
    stat4Label: 'Never a source of interruption',
    principle1Title: '① Never interrupt the task',
    principle1Body:
      'Correction happens inside the execution flow — patch parameters, inject prompts, redirect tools — so the task keeps moving.',
    principle2Title: '② Correct drift immediately',
    principle2Body:
      'Detect deviations between execution direction and stated goals in real time, and correct as soon as boundaries are crossed.',
    docMatrix: 'Documentation matrix',
    mermaidWarning: 'Some Mermaid diagrams failed to render; source is shown instead.',
    docNotFound: 'Document not found',
    docNotFoundHint: 'No document for ',
    docNotFoundHint2: '. Pick one from the sidebar, or ',
    backHome: 'back home',
    notFoundTitle: '404',
    notFoundBody: 'Page not found. Choose a document from the sidebar.',
  },
};

export function t(lang: Lang): Strings {
  return STRINGS[lang];
}
