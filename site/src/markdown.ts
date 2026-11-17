// 按需注册语言（全量包超过 1MB，文档站只需常见语言）
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Marked } from 'marked';
import { hrefDoc } from './routes';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

/** marked 实例：GFM（默认开启）；代码高亮与 mermaid 在 DOM 后处理阶段做 */
const marked = new Marked({ gfm: true, breaks: false });

/** GitHub 风格 slug：小写、空白转 -、剔除部分标点；中文保留 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[（）()：:，,。.？?！!【】[\]"']/g, '')
    .replace(/\s+/g, '-');
}

/**
 * CJK 加粗兼容：CommonMark 的强调侧翼规则对「**中文**的」这类邻接不生效
 * （闭界后跟 CJK 字母而非标点/空白），原样显示星号。文档为受控内容，
 * 这里在 inline code 之外把 `**…**` 预转换为 <strong>。
 */
function cjkBoldSafe(md: string): string {
  return md
    .split(/(`+[^`\n]*`+)/g)
    .map((seg, i) =>
      i % 2 === 1 ? seg : seg.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>'),
    )
    .join('');
}

/** 渲染 markdown → HTML 字符串 */
export function renderMarkdown(source: string): string {
  return marked.parse(cjkBoldSafe(source), { async: false }) as string;
}

/**
 * 渲染后的 DOM 后处理（在挂载/更新的容器内执行）：
 * 1. 标题补 slug id（页内锚点跳转）
 * 2. 代码块 highlight.js 高亮（mermaid 块除外，由 DocView 单独渲染）
 * 3. 文档间 *.md 相对链接改写为 hash 路由
 */
export function postProcess(container: HTMLElement): HTMLElement[] {
  // 1) 标题 id
  for (const h of container.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (!h.id) h.id = slugify(h.textContent ?? '');
  }

  // 2) 代码高亮（跳过 mermaid，.DocView 将其替换为图）
  const codeBlocks: HTMLElement[] = [];
  for (const code of container.querySelectorAll('pre > code')) {
    const el = code as HTMLElement;
    if (el.classList.contains('language-mermaid')) continue;
    if (!el.dataset.highlighted) {
      hljs.highlightElement(el);
      el.dataset.highlighted = 'true';
    }
    if (code.parentElement) codeBlocks.push(code.parentElement as HTMLElement);
  }

  // 3) 文档链接改写：./xxx.md#anchor、xxx.md → #/doc/xxx
  for (const a of container.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? '';
    if (!href) continue;
    if (/\.md($|#)/.test(href)) {
      const m = href.match(/^(?:\.\/)?([^#]+?\.md)(?:#(.+))?$/);
      if (m) {
        const key = m[1].slice(0, -3);
        a.setAttribute('href', hrefDoc(key, m[2] ? slugify(decodeURIComponent(m[2])) : undefined));
      }
    }
  }
  return codeBlocks;
}
