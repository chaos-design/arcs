// Static site build orchestrator.
// 1) prepares dist/assets with the browser-ready Mermaid runtime (local, offline)
// 2) runs the docs-site generator (bilingual pages) from a JSON config
// 3) runs the structural check and asserts the CI contract on dist/index.html
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(siteDir, '..');
const dist = join(siteDir, 'dist');
const generator = join(siteDir, 'scripts', 'docs_site.py');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'assets'), { recursive: true });
await cp(
  join(siteDir, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  join(dist, 'assets', 'mermaid.min.js'),
);
await cp(join(siteDir, 'public'), dist, { recursive: true });

run('python3', [generator, 'generate', '--config', join(siteDir, 'site.config.json'), '--content', join(repoRoot, 'docs'), '--out', dist], siteDir);
run('python3', [generator, 'check', '--out', dist], siteDir);

const index = await readFile(join(dist, 'index.html'), 'utf8');
if (!index.includes('ARCS')) throw new Error('CI contract: dist/index.html must mention ARCS');

console.log('site build OK: ' + dist);
