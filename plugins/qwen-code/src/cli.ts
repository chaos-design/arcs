#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { capabilitiesFor, goalFromArgs, runHookEntry } from '@chaos-design/arcs-host-kit';
import { parseQwenCodeHook, serializeQwenCode, shouldSteerQwenCode } from './mapping.js';

export function main(argv: string[] = process.argv.slice(2)): Promise<unknown> {
  return runHookEntry({
    source: 'qwen-code',
    capabilities: capabilitiesFor('qwen-code'),
    goal: goalFromArgs(argv, process.env),
    parse: parseQwenCodeHook,
    shouldSteer: shouldSteerQwenCode,
    serialize: serializeQwenCode,
  });
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) void main();
