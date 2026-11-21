#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { capabilitiesFor, goalFromArgs, runHookEntry } from '@chaos-design/arcs-host-kit';
import { parseChatgptHook, serializeChatgpt, shouldSteerChatgpt } from './mapping.js';

export function main(argv: string[] = process.argv.slice(2)): Promise<unknown> {
  return runHookEntry({
    source: 'chatgpt',
    capabilities: capabilitiesFor('chatgpt'),
    goal: goalFromArgs(argv, process.env),
    parse: parseChatgptHook,
    shouldSteer: shouldSteerChatgpt,
    serialize: serializeChatgpt,
  });
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) void main();
