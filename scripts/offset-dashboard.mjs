#!/usr/bin/env node
// ARCS 偏移曲线面板（roadmap P5 · docs/telemetry.md）
// 终端统计 + 可选独立 HTML 面板（内联 SVG，零外部资源），数据来自 FileAuditSink 的 JSONL。
// 用法：
//   node scripts/offset-dashboard.mjs                          # 读 ARCS_HOME（默认 ~/.arcs）audit/**/*.jsonl
//   node scripts/offset-dashboard.mjs --home ~/.arcs           # 指定宿主数据根目录
//   node scripts/offset-dashboard.mjs --file a.jsonl --file b.jsonl
//   node scripts/offset-dashboard.mjs --session <id 前缀>      # 过滤会话
//   node scripts/offset-dashboard.mjs --html dashboard.html    # 生成 HTML 面板
//   node scripts/offset-dashboard.mjs --limit 10               # 终端最多展示的会话数
// 聚合语义复用 packages/telemetry（buildDashboardModel）；dist 未构建时给出明确指引。
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 解析 --key value / --key=value 形式参数（零依赖） */
export function parseDashboardArgs(argv) {
  const out = { files: [], home: undefined, html: undefined, session: undefined, limit: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const takeValue = () => {
      if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
      i += 1;
      return argv[i];
    };
    if (arg === '--file' || arg.startsWith('--file=')) out.files.push(takeValue());
    else if (arg === '--home' || arg.startsWith('--home=')) out.home = takeValue();
    else if (arg === '--html' || arg.startsWith('--html=')) out.html = takeValue();
    else if (arg === '--session' || arg.startsWith('--session=')) out.session = takeValue();
    else if (arg === '--limit' || arg.startsWith('--limit=')) out.limit = Number(takeValue()) || undefined;
  }
  return out;
}

/** 收集 JSONL 文件：--file 优先；否则扫描 <home>/audit/**\/*.jsonl */
export function collectAuditFiles(args) {
  if (args.files.length > 0) return args.files;
  const home = args.home ?? process.env['ARCS_HOME'] ?? join(homedir(), '.arcs');
  const auditDir = join(home, 'audit');
  if (!existsSync(auditDir)) return [];
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(auditDir);
  return out.sort();
}

/**
 * 解析审计 JSONL：每行一个 AuditEvent；非法行跳过并计数（遥测是尽力而为的旁路，
 * 历史文件中混入损坏行不应让面板失败）。
 */
export function parseAuditJsonl(text, origin = '<memory>') {
  const events = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed);
      if (typeof value?.ts === 'number' && typeof value?.sessionId === 'string') {
        events.push(value);
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { events, skipped, origin };
}

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** severity → sparkline 字符（0→▁，1→█） */
export function sparkline(severities) {
  return severities.map((s) => {
    const idx = Math.min(SPARK_CHARS.length - 1, Math.max(0, Math.round(s * (SPARK_CHARS.length - 1))));
    return SPARK_CHARS[idx];
  }).join('');
}

const LEVEL_LABELS = { 1: 'L1 补参', 2: 'L2 注入', 3: 'L3 改道', 4: 'L4 阻断', null: '放行' };

function levelChips(levelCounts) {
  return Object.entries(levelCounts)
    .map(([k, v]) => `${LEVEL_LABELS[k] ?? k}:${v}`)
    .join(' ');
}

/** 终端渲染：总计 + 每会话一行（sparkline + 收敛标记 + 等级分布） */
export function renderTerminal(model, { limit = 20 } = {}) {
  const lines = [];
  lines.push('ARCS 偏移曲线面板（Steering Arc）');
  lines.push('════════════════════════════════');
  const tr = model.timeRange;
  const span = tr.first !== null ? new Date(tr.first).toISOString().slice(0, 19) : '—';
  const spanEnd = tr.last !== null ? new Date(tr.last).toISOString().slice(0, 19) : '—';
  lines.push(`事件 ${model.eventCount} · 会话 ${model.sessionCount} · 降级 ${model.degradedCount} · 放行占比 ${(model.passThroughRatio * 100).toFixed(1)}%`);
  lines.push(`时间范围 ${span} → ${spanEnd}`);
  lines.push(`宿主分布 ${JSON.stringify(model.hostCounts)}`);
  lines.push(`等级分布 ${levelChips(model.levelCounts)}`);
  lines.push(`HITL 询问 ${model.hitl.asked}（批准 ${model.hitl.approved} / 拒绝 ${model.hitl.rejected} / 超时 ${model.hitl.timeout}）`);
  lines.push('');
  if (model.sessions.length === 0) {
    lines.push('（无会话数据：先运行真实会话生成审计，或用 --file 指定 JSONL）');
    return lines.join('\n');
  }
  const shown = model.sessions
    .slice()
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, limit);
  for (const s of shown) {
    const mark = s.converging ? '✓收敛' : '·观察';
    lines.push(`${s.sessionId.slice(0, 24).padEnd(24)} ${s.host.padEnd(12)} ${sparkline(s.curve.points.map((p) => p.severity))} 峰值 ${s.curve.maxSeverity.toFixed(2)} 降级 ${s.curve.degradedCount} ${mark}`);
    lines.push(`  ${' '.repeat(24)} ${levelChips(s.levelCounts)}`);
  }
  if (model.sessions.length > shown.length) {
    lines.push(`… 其余 ${model.sessions.length - shown.length} 个会话未展示（--limit 调整）`);
  }
  return lines.join('\n');
}

/** SVG 曲线（宽 W 高 H，severity 0–1 → y 轴反转；x 按事件序等距） */
export function sessionSvg(session, { width = 720, height = 140 } = {}) {
  const pts = session.curve.points;
  const pad = 8;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const coords = pts.map((p, i) => {
    const x = pts.length === 1 ? width / 2 : pad + (i / (pts.length - 1)) * innerW;
    const y = pad + innerH - p.severity * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const degradedPoints = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.degraded)
    .map(({ p, i }) => {
      const x = pts.length === 1 ? width / 2 : pad + (i / (pts.length - 1)) * innerW;
      const y = pad + innerH - p.severity * innerH;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#f87171"/>`;
    })
    .join('');
  const polyline = coords.length > 0
    ? `<polyline points="${coords.join(' ')}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linejoin="round"/>`
    : '';
  const color = session.converging ? '#34d399' : '#fbbf24';
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="severity curve for ${escapeHtml(session.sessionId)}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(148,163,184,0.06)" rx="6"/>
  ${polyline}
  ${degradedPoints}
  <text x="${pad}" y="${height - 2}" font-size="10" fill="${color}">${session.converging ? 'converging' : 'observing'} · peak ${session.curve.maxSeverity.toFixed(2)}</text>
</svg>`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 独立 HTML 面板：内联样式与 SVG，无外部资源，可直接用浏览器打开 */
export function renderHtml(model, { title = 'ARCS 偏移曲线面板' } = {}) {
  const cards = model.sessions
    .slice()
    .sort((a, b) => b.lastTs - a.lastTs)
    .map((s) => {
      const badge = s.converging
        ? '<span class="badge ok">✓ 收敛</span>'
        : '<span class="badge warn">· 观察</span>';
      return `<section class="card">
  <header><h3 title="${escapeHtml(s.sessionId)}">${escapeHtml(s.sessionId)}</h3>${badge}<span class="host">${escapeHtml(s.host)} · ${s.eventCount} 事件</span></header>
  ${sessionSvg(s)}
  <footer>${escapeHtml(levelChips(s.levelCounts))} · 降级 ${s.curve.degradedCount}</footer>
</section>`;
    })
    .join('\n');

  const histRows = Object.entries(model.levelCounts)
    .map(([k, v]) => `<tr><td>${LEVEL_LABELS[k] ?? escapeHtml(k)}</td><td>${v}</td></tr>`)
    .join('');
  const hostChips = Object.entries(model.hostCounts)
    .map(([k, v]) => `<span class="chip">${escapeHtml(k)}:${v}</span>`)
    .join(' ');

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #0b1120; color: #e2e8f0; font: 14px/1.6 system-ui, "PingFang SC", sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #94a3b8; margin-bottom: 20px; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
  .stat { background: #1e293b; border-radius: 8px; padding: 10px 16px; min-width: 120px; }
  .stat b { display: block; font-size: 22px; }
  .chip { display: inline-block; background: #1e293b; border-radius: 999px; padding: 2px 10px; margin-right: 6px; font-size: 12px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
  .card { background: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 14px; }
  .card header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .card h3 { font-size: 14px; margin: 0; max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card .host { color: #94a3b8; font-size: 12px; margin-left: auto; }
  .badge { font-size: 12px; border-radius: 999px; padding: 1px 8px; }
  .badge.ok { background: rgba(52,211,153,.15); color: #34d399; }
  .badge.warn { background: rgba(251,191,36,.15); color: #fbbf24; }
  .card footer { color: #94a3b8; font-size: 12px; margin-top: 6px; }
  table { border-collapse: collapse; }
  td { padding: 2px 14px 2px 0; color: #cbd5e1; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="sub">生成于 ${new Date().toISOString().slice(0, 19)}Z · 数据源：ARCS 审计 JSONL（FileAuditSink）</div>
<div class="stats">
  <div class="stat">事件<b>${model.eventCount}</b></div>
  <div class="stat">会话<b>${model.sessionCount}</b></div>
  <div class="stat">降级<b>${model.degradedCount}</b></div>
  <div class="stat">放行占比<b>${(model.passThroughRatio * 100).toFixed(1)}%</b></div>
  <div class="stat">HITL 询问<b>${model.hitl.asked}</b><small>批 ${model.hitl.approved} / 拒 ${model.hitl.rejected} / 超 ${model.hitl.timeout}</small></div>
</div>
<div>宿主分布：${hostChips || '—'}</div>
<table>${histRows}</table>
<h2>会话偏移曲线</h2>
<div class="grid">${cards || '<p>（无会话数据）</p>'}</div>
</body>
</html>
`;
}

async function loadModelBuilder() {
  const distUrl = pathToFileURL(join(ROOT, 'packages/telemetry/dist/index.js')).href;
  try {
    return (await import(distUrl)).buildDashboardModel;
  } catch (err) {
    process.stderr.write(
      `无法加载 @chaos-design/arcs-telemetry 构建产物（${String(err)}）。\n` +
        '请先在仓库根目录执行：corepack pnpm build\n',
    );
    process.exit(1);
  }
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      [
        'ARCS 偏移曲线面板：审计 JSONL → 终端统计 + 可选 HTML 面板',
        '',
        '用法：node scripts/offset-dashboard.mjs [选项]',
        '  --file <path>    指定 JSONL 文件（可重复）；缺省扫描 <home>/audit/**/*.jsonl',
        '  --home <dir>     ARCS 数据根目录（默认 $ARCS_HOME 或 ~/.arcs）',
        '  --session <id>   会话 id 前缀过滤',
        '  --html <out>     生成独立 HTML 面板到指定路径',
        '  --limit <n>      终端最多展示的会话数（默认 20）',
        '',
      ].join('\n'),
    );
    return 0;
  }

  const args = parseDashboardArgs(argv);
  const files = collectAuditFiles(args);
  if (files.length === 0) {
    process.stderr.write(
      '未找到审计 JSONL。设置 ARCS_HOME、用 --home 指定数据目录，或用 --file 指定文件。\n',
    );
    return 1;
  }

  let events = [];
  let skipped = 0;
  for (const file of files) {
    const parsed = parseAuditJsonl(readFileSync(file, 'utf8'), file);
    events = events.concat(parsed.events);
    skipped += parsed.skipped;
  }
  if (args.session) events = events.filter((e) => e.sessionId.startsWith(args.session));
  if (events.length === 0) {
    process.stderr.write(
      args.session
        ? `过滤后无事件（session 前缀 "${args.session}"）。\n`
        : 'JSONL 中没有可识别的 AuditEvent 行。\n',
    );
    return 1;
  }

  return loadModelBuilder().then((buildDashboardModel) => {
    const model = buildDashboardModel(events);
    process.stdout.write(renderTerminal(model, { limit: args.limit }) + '\n');
    if (skipped > 0) process.stderr.write(`[dashboard] 跳过 ${skipped} 行非法/不完整数据\n`);
    if (args.html) {
      mkdirSync(resolve(args.html, '..'), { recursive: true });
      writeFileSync(args.html, renderHtml(model), 'utf8');
      const shown = relative(process.cwd(), args.html);
      process.stdout.write(`HTML 面板已生成：${shown && !shown.startsWith('..') ? shown : args.html}\n`);
    }
    return 0;
  });
}

// 仅作为脚本直接执行时启动；被 import（测试）时不产生副作用
const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  // 管道下游提前关闭（如 `pnpm dashboard | head`）不得让脚本崩出 EPIPE 栈
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
    throw err;
  });
  main().then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}
