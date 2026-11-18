import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const siteDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(siteDir, '..');
const docsDir = join(repoRoot, 'docs');

const VIRTUAL_ID = 'virtual:arcs-docs';
const VIRTUAL_RESOLVED = '\0' + VIRTUAL_ID;

/** 递归收集 docs 目录下的全部 Markdown 文件（相对 docs/ 的键，去 .md 后缀，如 'architecture'、'README'） */
export function collectDocKeys(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${name.name}` : name.name;
    if (name.isDirectory()) {
      out.push(...collectDocKeys(join(dir, name.name), rel));
    } else if (name.name.endsWith('.md')) {
      out.push(rel.slice(0, -3));
    }
  }
  return out;
}

/**
 * 构建时把 docs 目录下的全部 Markdown 内嵌为虚拟模块（站点完全自包含，无运行时 fetch，
 * 产物可直接静态托管于任意子路径）。
 */
function docsModule(): Plugin {
  return {
    name: 'arcs-docs-module',
    resolveId(id) {
      if (id === VIRTUAL_ID) return VIRTUAL_RESOLVED;
      return undefined;
    },
    async load(id) {
      if (id !== VIRTUAL_RESOLVED) return undefined;
      const entries: Record<string, string> = {};
      for (const key of collectDocKeys(docsDir)) {
        entries[key] = await readFile(join(docsDir, `${key}.md`), 'utf8');
      }
      return `export default ${JSON.stringify(entries)};`;
    },
  };
}

export default defineConfig({
  root: siteDir,
  // 相对 base：产物可从仓库根、GitHub Pages 子路径或嵌套目录直接打开
  base: './',
  plugins: [react(), docsModule()],
  server: {
    host: '127.0.0.1',
    port: 5175,
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // mermaid 及其全部内部模块（图表 loader / d3 / dagre / cytoscape / katex）合并为单 chunk：
        // 消除「首次渲染时嵌套动态 import 死锁」（图表模块与依赖被拆成多 chunk 且首次
        // 并发解析时，__vitePreload 可能互相等待）；同 chunk 内 import() 被内联，渲染不再悬挂。
        manualChunks(id) {
          if (/node_modules\/(mermaid|cytoscape|katex|dagre|d3-|dompurify|@braintree)/.test(id)) {
            return 'arcs-mermaid';
          }
          return undefined;
        },
      },
    },
  },
});
