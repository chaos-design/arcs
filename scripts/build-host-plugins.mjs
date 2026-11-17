#!/usr/bin/env node
// 构建 host-kit 与全部宿主插件；turbo 依据 workspace 依赖拓扑自动排序。
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FILTERS = [
  '@chaos-design/arcs-host-kit',
  '@chaos-design/arcs-plugin-claude-code',
  '@chaos-design/arcs-plugin-codex',
  '@chaos-design/arcs-plugin-opencode',
  '@chaos-design/arcs-plugin-zcode',
  '@chaos-design/arcs-plugin-workbuddy',
  '@chaos-design/arcs-plugin-pi',
  '@chaos-design/arcs-plugin-deepseek',
  '@chaos-design/arcs-plugin-trae',
];

const args = ['--filter', FILTERS[0]];
for (const pkg of FILTERS.slice(1)) args.push('--filter', pkg);
args.push('build');

execFileSync('corepack', ['pnpm', ...args], { cwd: ROOT, stdio: 'inherit' });
console.log(`宿主插件构建完成：${FILTERS.length} 个包`);
