#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { capabilitiesFor, goalFromArgs, runHookEntry } from '@chaos-design/arcs-host-kit';
import { parseCodexHook, serializeCodex, shouldSteerCodex } from './mapping.js';

export function main(argv: string[] = process.argv.slice(2)): Promise<unknown> {
  return runHookEntry({
    source: 'codex',
    capabilities: capabilitiesFor('codex'),
    goal: goalFromArgs(argv, process.env),
    parse: parseCodexHook,
    shouldSteer: shouldSteerCodex,
    serialize: serializeCodex,
  });
}

const isEntry =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) void main();
