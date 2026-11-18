#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { capabilitiesFor, goalFromArgs, runHookEntry } from '@chaos-design/arcs-host-kit';
import { shouldSteerTrae, serializeTrae, withTraeEvent } from './mapping.js';

/** 从 hook 命令参数里读取显式事件名：--event=<Name> */
function eventFromArgs(argv: string[]): string {
  for (const arg of argv) {
    if (arg.startsWith('--event=')) return arg.slice('--event='.length);
  }
  return '';
}

export function main(argv: string[] = process.argv.slice(2)): Promise<unknown> {
  return runHookEntry({
    source: 'trae',
    capabilities: capabilitiesFor('trae'),
    goal: goalFromArgs(argv, process.env),
    parse: withTraeEvent(eventFromArgs(argv)),
    shouldSteer: shouldSteerTrae,
    serialize: serializeTrae,
  });
}

const isEntry =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) void main();
