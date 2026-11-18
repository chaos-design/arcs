#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { run } from './index.js';

export async function main(): Promise<void> {
  const code = await run(process.argv.slice(2));
  process.exitCode = code;
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) void main();
