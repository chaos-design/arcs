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

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.goal || !args.target) {
    process.stderr.write(
      '用法: arcs-plugin-mcp --goal <既定目标> --target <下游 MCP Server 启动命令> ' +
        '[--drift-threshold 0.75] [--max-consecutive-loops 2] [--protected-paths ".env*,**/migrations/**"]\n',
    );
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
    target: args.target!.split(/\s+/).filter(Boolean),
    configOverrides,
    onDownstreamExit: (code) => process.exit(code ?? 0),
  });
  proxy.start();
}

// 仅作为 bin 入口直接执行时启动；被 import（测试/编程使用）时不产生副作用
const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) main();
