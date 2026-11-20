#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { capabilitiesFor, goalFromArgs, runHookEntry } from '@chaos-design/arcs-host-kit';
import { parsePlAgentHook, serializePlAgent, shouldSteerPlAgent } from './mapping.js';

export function main(argv: string[] = process.argv.slice(2)): Promise<unknown> {
  return runHookEntry({
    source: 'pl-agent',
    capabilities: capabilitiesFor('pl-agent'),
    goal: goalFromArgs(argv, process.env),
    parse: parsePlAgentHook,
    shouldSteer: shouldSteerPlAgent,
    serialize: serializePlAgent,
  });
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) void main();
