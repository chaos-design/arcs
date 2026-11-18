#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { capabilitiesFor, goalFromArgs, runHookEntry } from '@chaos-design/arcs-host-kit';
import { parseClaudeHook, serializeClaude, shouldSteerClaude } from './mapping.js';

export function main(argv: string[] = process.argv.slice(2)): Promise<unknown> {
  return runHookEntry({
    source: 'claude-code',
    capabilities: capabilitiesFor('claude-code'),
    goal: goalFromArgs(argv, process.env),
    parse: parseClaudeHook,
    shouldSteer: shouldSteerClaude,
    serialize: serializeClaude,
  });
}

const isEntry =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) void main();
