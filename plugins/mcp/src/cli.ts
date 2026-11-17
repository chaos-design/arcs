#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { McpProxy } from './proxy.js';

export interface CliArgs {
  goal?: string;
  target?: string;
  'drift-threshold'?: string;
  'max-consecutive-loops'?: string;
  'protected-paths'?: string;
}

/** 极简 --key value 解析（无第三方依赖） */
export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith('--')) continue;
    const key = token.slice(2) as keyof CliArgs;
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith('--')) {
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

/**
 * 引号感知的命令切分：支持单/双引号包裹含空格的参数。
 * 背景：--target 的值已经过 shell 消费一层引号，内层引号（如
 * `--target 'node "/path with space/server.mjs"'`）会原样到达这里，
 * 必须在本函数内解析而不是盲目按空白切分。未闭合引号按字面量保留。
 */
export function splitCommand(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.goal || !args.target) {
    process.stderr.write(
      '用法: arcs-plugin-mcp --goal <既定目标> --target <下游 MCP Server 启动命令> ' +
        '[--drift-threshold 0.75] [--max-consecutive-loops 2] [--protected-paths ".env*,**/migrations/**"]\n' +
      '提示: 路径含空格时用内层引号包裹，如 --target \'node "/path with space/server.mjs"\'\n',
    );
    process.exit(2);
  }

  const targetArgv = splitCommand(args.target!);
  if (targetArgv.length === 0) {
    process.stderr.write('--target 解析结果为空，请检查命令格式\n');
    process.exit(2);
  }

  const configOverrides = {
    driftThreshold: args['drift-threshold'] !== undefined ? Number(args['drift-threshold']) : undefined,
    maxConsecutiveLoops:
      args['max-consecutive-loops'] !== undefined ? Number(args['max-consecutive-loops']) : undefined,
    protectedPaths:
      args['protected-paths'] !== undefined
        ? args['protected-paths']!.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
  };

  const proxy = new McpProxy({
    goal: args.goal,
    target: targetArgv,
    configOverrides,
    onDownstreamExit: (code) => process.exit(code ?? 0),
    // spawn 失败（ENOENT 等）只触发 error 不触发 exit：显式退出避免悬挂
    onDownstreamError: () => process.exit(127),
  });
  proxy.start();
}

// 仅作为 bin 入口直接执行时启动；被 import（测试/编程使用）时不产生副作用
const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) main();
