#!/usr/bin/env node
// 宿主插件安装器：对能直接写入的平台做幂等安装；对需平台 CLI 的 marketplace 平台打印准确命令。
// 非破坏性：合并 hooks 时保留无关配置，重复安装不会重复写入同一命令。
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const MARKETPLACE = {
  'claude-code': [
    `claude plugin marketplace add ${ROOT}`,
    'claude plugin install arcs-claude-code@astro-local --scope user',
  ],
  codex: [
    `codex plugin marketplace add ${ROOT}`,
    'codex plugin add arcs-codex@astro-local',
  ],
  workbuddy: [
    `codebuddy plugin marketplace add ${ROOT}`,
    'codebuddy plugin install arcs-workbuddy@astro-local --scope user',
  ],
  zcode: [
    `codex plugin marketplace add ${join(ROOT, 'plugins/zcode')}`,
    'codex plugin add arcs-zcode@astro-zcode-local',
  ],
  deepseek: [
    `pnpm build:native-plugins`,
    'pnpm install-plugins -- --clients=deepseek --deepseek-profile=web',
  ],
};

const COPY_PLUGINS = {
  opencode: join(homedir(), '.config/opencode/plugins/arcs-steering'),
  pi: join(homedir(), '.pi/agent/extensions/arcs-steering'),
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--client=')) out.client = arg.slice('--client='.length);
    else if (arg === '--client' && argv[i + 1]) out.client = argv[++i];
    else if (arg.startsWith('--target=')) out.target = arg.slice('--target='.length);
    else if (arg === '--target' && argv[i + 1]) out.target = argv[++i];
  }
  return out;
}

/** 合并 hooks.json：按事件名拼接，按 command 去重，保留无关事件与字段 */
export function mergeHooks(existing, incoming) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const out = { ...base, hooks: { ...(base.hooks ?? {}) } };
  for (const [event, groups] of Object.entries(incoming.hooks ?? {})) {
    const previous = out.hooks[event] ?? [];
    const merged = [...previous];
    for (const group of groups) {
      const commands = new Set(
        merged.flatMap((g) => (g.hooks ?? []).map((h) => h.command)),
      );
      const hooks = (group.hooks ?? []).filter((h) => !commands.has(h.command));
      if (hooks.length > 0) merged.push({ ...group, hooks });
    }
    out.hooks[event] = merged;
  }
  return out;
}

function installTrae(target) {
  if (!target) {
    console.warn('[trae] 需要 --target=<工作区绝对路径>，已跳过');
    return;
  }
  const incoming = JSON.parse(
    readFileSync(join(ROOT, 'plugins/trae/hooks/hooks.json'), 'utf8'),
  );
  const file = resolve(target, '.trae/hooks.json');
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const merged = mergeHooks(existing, incoming);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`[trae] 已写入 ${file}`);
}

function copyPlugin(name, destination) {
  const source = join(ROOT, 'plugins', name);
  if (!existsSync(source)) throw new Error(`插件目录不存在：${source}`);
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
  console.log(`[${name}] 已复制到 ${destination}`);
}

function printMarketplace(name) {
  console.log(`[${name}] 通过平台 CLI 安装：`);
  for (const cmd of MARKETPLACE[name]) console.log(`  ${cmd}`);
}

export function main(argv = process.argv.slice(2)) {
  const { client = 'all', target } = parseArgs(argv);
  const names = client === 'all' ? Object.keys({ ...MARKETPLACE, ...COPY_PLUGINS, trae: 1 }) : [client];
  for (const name of names) {
    if (name === 'trae') installTrae(target);
    else if (COPY_PLUGINS[name]) copyPlugin(name, COPY_PLUGINS[name]);
    else if (MARKETPLACE[name]) printMarketplace(name);
    else console.warn(`[${name}] 未知平台，跳过`);
  }
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) main();
