import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPlugin, PLUGINS, type PluginInfo } from './plugins.js';

export { PLUGINS, findPlugin, type PluginInfo, type StartKind } from './plugins.js';

export interface Entrypoint {
  /** 可执行文件 */
  command: string;
  /** 固定前置参数（如 node 后的脚本路径） */
  prefixArgs: string[];
}

export interface RunDeps {
  out: (line: string) => void;
  err: (line: string) => void;
  /** 启动常驻子进程，resolve 为其退出码 */
  spawn: (command: string, args: string[]) => Promise<number>;
  /** 解析插件可执行入口；返回 null 表示无法定位 */
  resolveEntrypoint: (pkg: string, bin: string) => Entrypoint | null;
}

/** 默认 spawner：继承 stdio，父进程收到信号时转发给子进程（导出供测试验证监听器清理） */
export function inheritedSpawn(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(command, args, { stdio: 'inherit' });
    const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
    const onSigint = forward('SIGINT');
    const onSigterm = forward('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    // spawn 失败只触发 error 不触发 exit：两条路径都要清理监听器，否则反复启动会累积
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      fn();
    };
    child.on('error', (err) => settle(() => reject(err)));
    child.on('exit', (code, signal) => settle(() => resolve(signal ? 1 : (code ?? 0))));
  });
}

/** 默认入口解析：优先用已安装包的主入口推导同目录 cli.js，否则回退到 PATH 上的 bin */
export function resolveEntrypoint(pkg: string, bin: string): Entrypoint | null {
  let mainPath: string | undefined;
  try {
    // exports 通常只声明 import 条件，createRequire 的 require 条件会解析失败，故优先 import.meta.resolve
    mainPath = fileURLToPath(import.meta.resolve(pkg));
  } catch {
    try {
      mainPath = createRequire(import.meta.url).resolve(pkg);
    } catch {
      // 包未安装，回退到 PATH
    }
  }
  if (mainPath) {
    const cliPath = join(dirname(mainPath), 'cli.js');
    if (existsSync(cliPath)) {
      return { command: process.execPath, prefixArgs: [cliPath] };
    }
  }
  return { command: bin, prefixArgs: [] };
}

export function formatList(): string {
  const rows = PLUGINS.map((p) => {
    const start = p.kind === 'service' ? '常驻服务' : '宿主调用';
    return `  ${p.name.padEnd(12)} ${p.host.padEnd(24)} ${start.padEnd(10)} ${p.capability}`;
  });
  return ['可用插件（arcs start <name>）：', '', ...rows, ''].join('\n');
}

export function formatHelp(): string {
  return [
    'ARCS 统一命令行 — 发现并快速启动宿主插件服务',
    '',
    '用法：',
    '  arcs list                          列出全部插件',
    '  arcs start <name> [-- ...args]     启动插件服务（MCP 为常驻 stdio 代理）',
    '  arcs start <name> --dry-run        只打印将要执行的命令，不启动',
    '  arcs help                          显示本帮助',
    '',
    '示例：',
    '  arcs start mcp -- --goal "仅修复前端样式" --target "npx -y @modelcontextprotocol/server-filesystem ./src"',
    '  arcs start claude-code             （Hook 型无独立服务，打印宿主启用方式）',
    '',
  ].join('\n');
}

function describeCommand(name: string, args: string[], ep: Entrypoint): string {
  return [ep.command, ...ep.prefixArgs, ...args].join(' ');
}

interface ParsedStart {
  name: string;
  args: string[];
  dryRun: boolean;
}

function parseStart(argv: string[]): ParsedStart | null {
  const dryRun = argv.includes('--dry-run');
  const rest = argv.filter((a) => a !== '--dry-run');
  const sep = rest.indexOf('--');
  const head = sep === -1 ? rest : rest.slice(0, sep);
  const tail = sep === -1 ? [] : rest.slice(sep + 1);
  const name = head.find((a) => !a.startsWith('-'));
  if (!name) return null;
  return { name, args: tail, dryRun };
}

function defaultDeps(): RunDeps {
  return {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    spawn: inheritedSpawn,
    resolveEntrypoint,
  };
}

/** 执行 CLI，返回进程退出码。依赖可注入以便测试。 */
export async function run(argv: string[], deps: Partial<RunDeps> = {}): Promise<number> {
  const d: RunDeps = { ...defaultDeps(), ...deps };
  const [command, ...rest] = argv;

  if (!command || command === 'help' || command === '-h' || command === '--help') {
    d.out(formatHelp());
    return 0;
  }

  if (command === 'list' || command === 'ls') {
    d.out(formatList());
    return 0;
  }

  if (command === 'start') {
    const parsed = parseStart(rest);
    if (!parsed) {
      d.err('用法：arcs start <name> [-- ...args]');
      return 2;
    }
    const plugin: PluginInfo | undefined = findPlugin(parsed.name);
    if (!plugin) {
      d.err(`未知插件 "${parsed.name}"。可用插件：`);
      d.err(PLUGINS.map((p) => p.name).join(', '));
      return 2;
    }

    if (plugin.kind === 'host-managed') {
      d.out(`插件 "${plugin.name}" 由宿主加载，无独立常驻服务。`);
      if (plugin.enableHint) d.out(`启用方式：${plugin.enableHint}`);
      d.out(`能力：${plugin.capability}`);
      return 0;
    }

    if (!plugin.bin) {
      d.err(`插件 "${plugin.name}" 缺少 bin 声明，无法启动。`);
      return 1;
    }

    const ep = d.resolveEntrypoint(plugin.package, plugin.bin);
    if (!ep) {
      d.err(`无法定位插件 "${plugin.name}" 的可执行入口，请先构建或安装 ${plugin.package}。`);
      return 1;
    }

    const cmd = describeCommand(plugin.name, parsed.args, ep);
    if (parsed.dryRun) {
      d.out(`[dry-run] ${cmd}`);
      return 0;
    }

    d.out(`启动 ${plugin.name} 服务：${cmd}`);
    return d.spawn(ep.command, [...ep.prefixArgs, ...parsed.args]);
  }

  d.err(`未知命令 "${command}"。`);
  d.out(formatHelp());
  return 2;
}
