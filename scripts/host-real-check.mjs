#!/usr/bin/env node
// 真实宿主验证辅助：探测 CLI 与插件产物，给出会话步骤；--verify 读取本地审计 JSONL。
// 本脚本不触发模型调用、不消耗额度、不改动用户配置。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const CLIENTS = [
  { name: 'claude-code', cli: 'claude', label: 'Claude Code' },
  { name: 'codex', cli: 'codex', label: 'Codex' },
  { name: 'opencode', cli: 'opencode', label: 'OpenCode' },
  { name: 'pi', cli: 'pi', label: 'Pi' },
  { name: 'deepseek', cli: 'dsh', label: 'DeepSeek Harness' },
  { name: 'zcode', cli: 'zcode', label: 'ZCode' },
  { name: 'workbuddy', cli: 'codebuddy', label: 'WorkBuddy / CodeBuddy' },
  { name: 'trae', cli: null, label: 'Trae（IDE 项目 hooks）' },
  { name: 'chatgpt', cli: 'chatgpt', label: 'ChatGPT / Codex 兼容 Hook' },
  { name: 'pl-agent', cli: null, label: 'PL Agent（通用 Hook）' },
  { name: 'qwen-code', cli: 'qwen', label: 'Qwen Code CLI' },
];

function parseArgs(argv) {
  const out = { verify: false };
  for (const arg of argv) {
    if (arg === '--verify') out.verify = true;
    else if (arg.startsWith('--home=')) out.home = arg.slice('--home='.length);
  }
  return out;
}

function binaryExists(name) {
  if (!name) return false;
  const path = process.env.PATH ?? '';
  return path.split(':').some((dir) => existsSync(join(dir, name)));
}

function listJsonl(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsonl(full));
    else if (entry.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

function readEvents(file) {
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // 单行损坏不影响后续审计事件
    }
  }
  return rows;
}

function report() {
  const available = CLIENTS.filter((c) => binaryExists(c.cli));
  console.log('本机可用宿主 CLI：');
  for (const c of CLIENTS) {
    console.log(`  ${binaryExists(c.cli) ? '✓' : '·'} ${c.label}${c.cli ? ` (${c.cli})` : ''}`);
  }
  console.log('\n插件产物：');
  for (const c of CLIENTS) {
    const dir = join(ROOT, 'plugins', c.name);
    const built = existsSync(join(dir, 'dist')) || existsSync(join(dir, 'src', 'index.ts'));
    console.log(`  ${built ? '✓' : '✗'} ${c.name}`);
  }
  console.log('\n真实会话步骤（用你自己的账号，在本机执行）：');
  console.log('  1) 安装插件：node scripts/install-host-plugins.mjs --client=<平台> [--target=<工作区>]');
  console.log('  2) 启用审计：export ARCS_HOME=~/.arcs   # 或 ARCS_AUDIT_FILE=/abs/path/audit.jsonl');
  console.log('  3) 启动一次真实会话并触发工具调用（建议用只读命令，例如读取一个文件）');
  console.log('  4) 校验证据：node scripts/host-real-check.mjs --verify');
  console.log(`\n可用 CLI：${available.length}/${CLIENTS.length}。无凭据时本步骤需在你的环境执行。`);
}

function verify(home) {
  const root = home ? resolve(home) : join(process.env['ARCS_HOME'] ?? homedir(), 'audit');
  const files = listJsonl(root);
  if (files.length === 0) {
    console.error(`未找到审计文件：${root}`);
    console.error('确认已设置 ARCS_HOME / ARCS_AUDIT_FILE 并完成一次真实会话。');
    process.exit(1);
  }
  const events = files.flatMap(readEvents);
  // 缺 ts / ts 非数字的行不参与统计与时间输出，避免 new Date(NaN).toISOString() 抛 RangeError
  const valid = events.filter((e) => typeof e.ts === 'number' && Number.isFinite(e.ts));
  if (valid.length === 0) {
    console.error(`审计文件为空（或全部事件缺 ts 字段）：${root}`);
    process.exit(1);
  }
  const skipped = events.length - valid.length;
  if (skipped > 0) console.warn(`[real-check] 跳过 ${skipped} 行缺 ts / ts 非法的事件`);
  const byHost = {};
  const byLevel = {};
  let degraded = 0;
  for (const e of valid) {
    byHost[e.host ?? 'unknown'] = (byHost[e.host ?? 'unknown'] ?? 0) + 1;
    const level = String(e.level ?? 'pass');
    byLevel[level] = (byLevel[level] ?? 0) + 1;
    if (e.degraded) degraded += 1;
  }
  console.log(`审计文件：${files.length} 个，事件：${valid.length} 条`);
  console.log(`按宿主：${JSON.stringify(byHost)}`);
  console.log(`按等级：${JSON.stringify(byLevel)}`);
  console.log(`降级(fail-open)：${degraded}`);
  for (const file of files) console.log(`  ${file} (${statSync(file).size} bytes)`);
  console.log('\n最近 5 条：');
  for (const e of valid.slice(-5)) {
    console.log(`  ${new Date(e.ts).toISOString()} ${e.host} level=${e.level ?? 'pass'} degraded=${e.degraded}`);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.verify) verify(args.home);
else report();
