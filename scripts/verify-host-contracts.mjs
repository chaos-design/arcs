#!/usr/bin/env node
// 宿主插件静态契约校验：manifest/hooks 结构、事件数量、hook 输出 schema 关键约束。
// 这是回归护栏，不替代真实宿主验证（宿主版本升级仍可能改变 schema）。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateClaudeCompatiblePreToolUse, validateCodexPreToolUse } from './behavior-contracts.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const NATIVE = {
  'claude-code': { manifest: '.claude-plugin/plugin.json', hooks: 17, env: 'CLAUDE_PLUGIN_ROOT' },
  codex: { manifest: '.codex-plugin/plugin.json', hooks: 12, env: 'CODEX_PLUGIN_ROOT' },
  zcode: { manifest: '.zcode-plugin/plugin.json', hooks: 7, env: 'CLAUDE_PLUGIN_ROOT' },
  workbuddy: { manifest: '.codebuddy-plugin/plugin.json', hooks: 25, env: 'CODEBUDDY_PLUGIN_ROOT' },
  trae: { manifest: null, hooks: 13, env: null },
};

const EXTENSIONS = ['opencode', 'pi', 'deepseek'];

const violations = [];
const checks = [];
function check(condition, message) {
  if (condition) checks.push(message);
  else violations.push(message);
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function verifyNative(name, spec) {
  const dir = join(ROOT, 'plugins', name);
  const pkg = readJson(join(dir, 'package.json'));
  check(pkg?.name === `@chaos-design/arcs-plugin-${name}`, `${name}: package.json 名称正确`);

  if (spec.manifest) {
    const manifest = readJson(join(dir, spec.manifest));
    check(!!manifest?.name && !!manifest?.hooks, `${name}: manifest 存在且含 name/hooks`);
    check(manifest?.hooks === './hooks/hooks.json', `${name}: manifest 指向 ./hooks/hooks.json`);
  }

  const hooks = readJson(join(dir, 'hooks/hooks.json'));
  check(!!hooks?.hooks, `${name}: hooks.json 存在且含 hooks 字段`);
  const events = Object.keys(hooks?.hooks ?? {});
  check(events.length === spec.hooks, `${name}: hook 事件数 ${events.length}/${spec.hooks}`);

  const commands = Object.values(hooks?.hooks ?? {}).flatMap((groups) =>
    (Array.isArray(groups) ? groups : []).flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? '')),
  );
  check(commands.length > 0 && commands.every((c) => c.includes('cli.js') || c.includes('arcs-plugin-')),
    `${name}: 所有 hook 都调用本插件入口`);
  if (spec.env) {
    check(commands.every((c) => c.includes(spec.env)), `${name}: hook 命令使用 ${spec.env}`);
  }
  if (name === 'workbuddy' || name === 'trae') {
    check(commands.every((c) => c.includes('--event=')), `${name}: 每个 hook 显式传 --event=`);
  }

  const mapping = join(dir, 'src/mapping.ts');
  const source = existsSync(mapping) ? readFileSync(mapping, 'utf8') : '';
  if (name === 'claude-code' || name === 'codex') {
    for (const token of ['hookSpecificOutput', 'hookEventName', 'permissionDecision', 'updatedInput']) {
      check(source.includes(token), `${name}: 输出 schema 含 ${token}`);
    }
    check(source.includes('additionalContext'), `${name}: 输出 schema 含 additionalContext`);
  }
  if (name === 'codex') {
    check(/permissionDecision'\]\s*=\s*'deny'/.test(source),
      'codex: ask 已降级为 deny（不得透传宿主不支持的 ask）');
  }
}

function verifyExtension(name) {
  const dir = join(ROOT, 'plugins', name);
  const pkg = readJson(join(dir, 'package.json'));
  check(pkg?.name === `@chaos-design/arcs-plugin-${name}`, `${name}: package.json 名称正确`);
  check(!!pkg?.main && existsSync(join(dir, pkg.main)), `${name}: main 入口 ${pkg?.main ?? '(缺失)'} 存在`);
  const index = join(dir, 'src/index.ts');
  const source = existsSync(index) ? readFileSync(index, 'utf8') : '';
  check(source.includes('apply') || source.includes('setup') || source.includes('create'),
    `${name}: 导出宿主加载入口`);
  if (name === 'deepseek') {
    check(existsSync(join(dir, 'cordis.patch.yml')), 'deepseek: cordis.patch.yml 存在');
    check(pkg?.dsh?.bundle?.patch === './cordis.patch.yml', 'deepseek: dsh.bundle.patch 指向正确');
    check(!/export\s+const\s+inject\b/.test(source), 'deepseek: 未导出 inject 声明（避免死锁）');
  }
}

function verifyCapabilities() {
  const source = readFileSync(join(ROOT, 'packages/host-kit/src/capabilities.ts'), 'utf8');
  const redirects = (source.match(/redirectTool:\s*(true|false)/g) ?? []);
  check(redirects.length === 8 && redirects.every((r) => r.includes('false')),
    `能力矩阵: 8 个宿主插件均声明 redirectTool=false（${redirects.length} 条）`);
  check(/source:\s*'codex'[\s\S]*?suspend:\s*false/.test(source),
    '能力矩阵: codex suspend=false（ask 不被宿主支持）');
  const conformance = existsSync(join(ROOT, 'packages/host-kit/src/conformance.test.ts'));
  check(conformance, '能力矩阵: conformance.test.ts 存在');
}

for (const [name, spec] of Object.entries(NATIVE)) verifyNative(name, spec);
for (const name of EXTENSIONS) verifyExtension(name);
verifyCapabilities();

// 行为级校验：真正执行序列化函数，把输出喂给官方规则断言器
async function verifyBehavior() {
  const codexFile = join(ROOT, 'plugins/codex/dist/mapping.js');
  const claudeFile = join(ROOT, 'plugins/claude-code/dist/mapping.js');
  const zcodeFile = join(ROOT, 'plugins/zcode/dist/mapping.js');
  const hookFiles = {
    'codex': codexFile,
    'claude-code': claudeFile,
    'zcode': zcodeFile,
    'workbuddy': join(ROOT, 'plugins/workbuddy/dist/mapping.js'),
    'trae': join(ROOT, 'plugins/trae/dist/mapping.js'),
  };
  if (Object.values(hookFiles).some((f) => !existsSync(f))) {
    console.warn('WARN: 插件 dist 不存在，跳过行为级校验（先运行 pnpm build）');
    return;
  }
  const codex = await import(pathToFileURL(codexFile).href);
  const claude = await import(pathToFileURL(claudeFile).href);
  const zcode = await import(pathToFileURL(zcodeFile).href);
  const workbuddy = await import(pathToFileURL(hookFiles['workbuddy']).href);
  const trae = await import(pathToFileURL(hookFiles['trae']).href);
  const native = { eventName: 'PreToolUse', sessionId: 'contract' };
  const decisions = [
    ['PassThrough', { kind: 'allow', injected: [], degraded: [], level: null }],
    ['allow+updatedInput', { kind: 'allow', updatedInput: { command: 'echo fixed' }, injected: [], degraded: [], level: 1 }],
    ['block', { kind: 'block', reason: '高危命令', injected: [], degraded: [], level: 4 }],
    ['block 无 reason', { kind: 'block', injected: [], degraded: [], level: 4 }],
    ['ask 降级', { kind: 'ask', reason: '需审批', injected: [], degraded: [], level: 4 }],
  ];
  for (const [name, decision] of decisions) {
    const output = JSON.parse(codex.serializeCodex(decision, native));
    const errors = validateCodexPreToolUse(output, { toolName: 'Bash' });
    check(errors.length === 0, `codex 行为级: ${name} 输出合法${errors.length ? `（${errors.join('; ')}）` : ''}`);
  }
  const compatible = [
    ['claude-code', claude.serializeClaude, {}],
    ['zcode', zcode.serializeZcode, {}],
    ['workbuddy', workbuddy.serializeWorkbuddy, { modifiedInputKey: 'modifiedInput' }],
    ['trae', trae.serializeTrae, {}],
  ];
  for (const [platform, serialize, options] of compatible) {
    for (const [name, decision] of decisions) {
      const output = JSON.parse(serialize(decision, native));
      const errors = validateClaudeCompatiblePreToolUse(output, options);
      check(errors.length === 0, `${platform} 行为级: ${name} 输出合法${errors.length ? `（${errors.join('; ')}）` : ''}`);
    }
  }
}
await verifyBehavior();

if (violations.length > 0) {
  console.error(`宿主契约校验失败：${violations.length} 项`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log(`宿主契约校验通过：${checks.length} 项，0 违规`);
console.log('  覆盖 8 个平台（5 原生 hooks + 3 扩展/bundle）、能力矩阵一致性与 Codex/Claude 行为级输出规则');
