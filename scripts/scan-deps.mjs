#!/usr/bin/env node
// 依赖扫描红线（docs/constraints.md #1/#5）：
//  - packages/core   仅允许 zod 与相对导入（零宿主 SDK、零 node 内建、零网络/文件）
//  - packages/telemetry 仅允许 core/zod 与相对导入
//  - packages/plugin-kit  仅允许 core/telemetry/zod 与相对导入（宿主依赖下沉 plugins/*）
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const HOST_DEPS = [
  'zod',
  '@chaos-design/arcs-core',
  '@chaos-design/arcs-telemetry',
  '@chaos-design/arcs-plugin-kit',
  '@chaos-design/arcs-host-kit',
];

// 平台插件的 node 内建逐条登记理由，避免白名单过宽削弱红线
const PLUGIN_NODE = {
  'claude-code': ['node:url'], // cli 入口 isEntry 守卫
  codex: ['node:url'],
  zcode: ['node:url'],
  workbuddy: ['node:url'],
  trae: ['node:url'],
  opencode: ['node:fs', 'node:url', 'node:os'], // 会话 claim 文件 + 默认 HOME + cli 守卫
  pi: ['node:fs', 'node:url', 'node:os'],
  deepseek: ['node:path', 'node:url'],
};

const RULES = [
  { dir: 'packages/core/src', allow: ['zod'] },
  { dir: 'packages/telemetry/src', allow: ['zod', '@chaos-design/arcs-core'] },
  {
    dir: 'packages/plugin-kit/src',
    allow: ['zod', '@chaos-design/arcs-core', '@chaos-design/arcs-telemetry'],
  },
  {
    // 共用宿主运行时：唯一允许 node I/O 的 packages 层包
    dir: 'packages/host-kit/src',
    allow: HOST_DEPS,
    // node:crypto：claim.ts 对超长 sessionId 计算防碰撞短哈希（11 号计划）
    allowNode: ['node:fs', 'node:os', 'node:path', 'node:process', 'node:crypto'],
  },
  ...Object.entries(PLUGIN_NODE).map(([name, allowNode]) => ({
    dir: `plugins/${name}/src`,
    allow: HOST_DEPS,
    allowNode,
  })),
  {
    // 插件层允许宿主侧 I/O（spawn 下游 MCP Server）；宿主 SDK 仍下沉、不在白名单
    dir: 'plugins/mcp/src',
    allow: [
      'zod',
      '@chaos-design/arcs-core',
      '@chaos-design/arcs-host-kit', // cli 装配 FileAuditSink（ARCS_AUDIT_FILE 落盘）
      '@chaos-design/arcs-telemetry',
      '@chaos-design/arcs-plugin-kit',
    ],
    allowNode: ['node:child_process', 'node:process', 'node:url'],
  },
  {
    // SDK 直线边界（docs/sdk.md）：直接依赖 core + 框架类型包，禁 plugin-kit（绕过胶水层）
    dir: 'sdk/vercel/src',
    allow: ['zod', '@chaos-design/arcs-core', '@ai-sdk/provider'],
  },
  {
    dir: 'sdk/langchain/src',
    allow: ['@chaos-design/arcs-core'],
  },
];

const IMPORT_RE = /(?:\bfrom\s+|\bimport\s+|\brequire\(\s*)(['"])([^'"]+)\1/g;

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTsFiles(p));
    // 测试文件运行在 vitest 环境，不在运行时红线扫描范围内
    else if (name.name.endsWith('.ts') && !name.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const violations = [];
let files = 0;

for (const rule of RULES) {
  const dir = join(ROOT, rule.dir);
  let tsFiles = [];
  try {
    tsFiles = listTsFiles(dir);
  } catch {
    console.warn(`WARN: 目录不存在，跳过 ${rule.dir}`);
    continue;
  }
  for (const file of tsFiles) {
    files += 1;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[2];
      const isRelative = spec.startsWith('./') || spec.startsWith('../');
      if (isRelative) continue;
      if (rule.allow.includes(spec)) continue;
      if (spec.startsWith('node:')) {
        if (rule.allowNode?.includes(spec)) continue;
        violations.push(`${rule.dir}: ${file.replace(ROOT + '/', '')} 导入了未授权的 node 模块 "${spec}"`);
        continue;
      }
      violations.push(`${rule.dir}: ${file.replace(ROOT + '/', '')} 导入了不允许的模块 "${spec}"`);
    }
  }
}

if (violations.length > 0) {
  console.error(`依赖扫描失败：${violations.length} 处红线违规`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`依赖扫描通过：${files} 个文件，0 处违规`);
