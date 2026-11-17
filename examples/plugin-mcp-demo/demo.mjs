// ARCS MCP 透明代理（plugins/mcp）端到端演示：真实进程，无需任何 API Key
// 拓扑：本脚本（模拟 MCP 客户端） ──→ arcs-plugin-mcp 代理 ──→ fake-mcp-server.mjs
// 场景：
//   1. initialize / tools/list 透传
//   2. L2 —— 同一 bash 调用连续第 3 次，代理合成虚拟报错（不转发下游）
//   3. L4 —— rm -rf 危险命令被阻断（默认 HITL 通道按超时拒绝 → 拒绝语义）
//   4. 审计 JSONL 落盘（ARCS_AUDIT_FILE）→ 可直接用 pnpm dashboard 查看偏移曲线
// 运行前（仓库根目录）：corepack pnpm install && corepack pnpm build:native-plugins
// 运行：node examples/plugin-mcp-demo/demo.mjs
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PROXY_CLI = join(HERE, '../../plugins/mcp/dist/cli.js');
const FAKE_SERVER = join(HERE, 'fake-mcp-server.mjs');

const auditFile = join(mkdtempSync(join(tmpdir(), 'arcs-demo-')), 'audit.jsonl');

const proxy = spawn(process.execPath, [
  PROXY_CLI,
  '--goal', '仅修复前端样式 Bug，禁止修改后端 API 路由',
  '--target', `node ${FAKE_SERVER}`,
], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, ARCS_AUDIT_FILE: auditFile },
});
proxy.on('exit', (code) => {
  console.log(`\n代理退出（code=${code}）`);
  printAudit();
  rmSync(auditFile, { force: true });
});

const pending = new Map();
let nextId = 1;
createInterface({ input: proxy.stdout }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const resolve = pending.get(msg.id);
  if (resolve) {
    pending.delete(msg.id);
    resolve(msg);
  }
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`超时：${method} id=${id}`));
      }
    }, 8000);
    proxy.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const summary = (res) => {
  if (res.error) return `JSON-RPC 错误 ${res.error.code}：${res.error.message}`;
  const result = res.result ?? {};
  const first = (result.content ?? [])[0]?.text ?? '';
  if (result.isError) return `虚拟报错 ${first.slice(0, 44)}…`;
  if (!first) return `透传成功 ${JSON.stringify(result).slice(0, 52)}`;
  return first.slice(0, 60);
};

async function main() {
  console.log('== MCP 透明代理演示 ==');
  console.log(`审计文件：${auditFile}\n`);

  const init = await request('initialize', {});
  console.log('1) initialize      →', summary(init));
  const list = await request('tools/list', {});
  console.log('2) tools/list      →', summary(list));

  const loop = { name: 'bash', arguments: { command: 'npm test' } };
  const r1 = await request('tools/call', loop);
  const r2 = await request('tools/call', loop);
  const r3 = await request('tools/call', loop);
  console.log('3) bash npm test   →', summary(r1));
  console.log('   （第 2 次重复）  →', summary(r2));
  console.log('   （第 3 次重复）  →', summary(r3), '  ← L2 熔断：未转发下游');

  const danger = await request('tools/call', { name: 'bash', arguments: { command: 'rm -rf /tmp/x' } });
  console.log('4) rm -rf /tmp/x   →', summary(danger), '  ← L4 阻断：未获审批');

  proxy.stdin.end();
}

function printAudit() {
  let text;
  try {
    text = readFileSync(auditFile, 'utf8');
  } catch {
    console.log('审计文件为空（代理未写入）。');
    return;
  }
  console.log('== 审计事件（ARCS_AUDIT_FILE JSONL） ==');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    console.log(`  L${e.level ?? '·'} ${e.host} severity=${Math.max(0, ...e.signals.map((s) => s.severity)).toFixed(2)} degraded=${e.degraded}`);
  }
  console.log('\n查看偏移曲线：corepack pnpm dashboard --file <该 JSONL> [--html dashboard.html]');
}

main().catch((err) => {
  console.error('演示失败：', err.message);
  proxy.kill();
  process.exitCode = 1;
});
