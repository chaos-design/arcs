import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_DOCS, docTitle, NAV } from './docs';
import { postProcess, renderMarkdown } from './markdown';
import { hrefDoc, hrefHome, type Route } from './routes';

let mermaidSeq = 0;
let mermaidReady: Promise<typeof import('mermaid')['default']> | undefined;
/** mermaid 体积大（含 katex/cytoscape），仅当页面确有图时动态加载；initialize 只执行一次 */
function renderMermaidSvg(graph: string): Promise<string> {
  // securityLevel 用 loose：仓库受控文档需要 <br/> HTML label；strict 会干扰渲染管线
  mermaidReady ??= import('mermaid').then((m) => {
    // themeVariables 与 styles.css 的设计 token 手工对齐（参考 memx 的做法）
    m.default.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      themeVariables: {
        background: '#141618',
        primaryColor: '#1b1e21',
        primaryTextColor: '#f3f0e9',
        primaryBorderColor: '#34393d',
        secondaryColor: '#24282c',
        tertiaryColor: '#1b1e21',
        lineColor: '#6f9dff',
        textColor: '#f3f0e9',
        mainBkg: '#1b1e21',
        nodeBorder: '#34393d',
        clusterBkg: '#141618',
        clusterBorder: '#34393d',
        edgeLabelBackground: '#141618',
        titleColor: '#f3f0e9',
      },
    });
    return m.default;
  });
  return mermaidReady.then(async (mermaid) => {
    const id = `arcs-mermaid-${++mermaidSeq}`;
    // 预检语法（错误尽早抛出）；渲染挂超时熔断，避免个别图悬挂阻塞整页
    await mermaid.parse(graph);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`mermaid render timeout: ${id}`)), 4_000),
    );
    const { svg } = await Promise.race([mermaid.render(id, graph), timeout]);
    return svg;
  });
}

/**
 * 渲染单块（带重试）：首次渲染会触发 mermaid 图表模块的嵌套动态 import，
 * 个别图在首挂载时可能悬挂——超时熔断后由调用方在整轮结束后重试（此时模块已缓存）。
 */
async function renderWithRetry(graph: string, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await renderMermaidSvg(graph);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

interface DocViewProps {
  route: Route;
}

/** 侧栏阅读顺序的扁平文档键列表（上一篇/下一篇用） */
const ORDERED_KEYS: string[] = NAV.flatMap((g) => g.entries.map((e) => e.key));

/** 文档视图：markdown → HTML → DOM 后处理（高亮/链接改写/mermaid 渲染） */
export function DocView({ route }: DocViewProps) {
  const key = route.key!;
  const source = ALL_DOCS[key];
  // useMemo 按 key 派生：DocView 在路由间复用同一组件实例，useState 初始化器只跑一次
  // 会导致切换文档时正文停留旧内容；mermaid 状态随每次正文变化复位。
  const html = useMemo(() => (source ? renderMarkdown(source) : ''), [source]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mermaidFailed, setMermaidFailed] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    setMermaidFailed(false);
    postProcess(body);

    // mermaid 块逐个替换为 SVG；单块失败保留源码并继续渲染其余块
    const blocks = Array.from(body.querySelectorAll('pre > code.language-mermaid'));
    if (blocks.length === 0) return;
    void (async () => {
      const failures: Array<{ pre: HTMLElement; graph: string; err: unknown }> = [];
      for (const code of blocks) {
        const pre = code.parentElement as HTMLElement;
        const graph = code.textContent ?? '';
        try {
          const svg = await renderWithRetry(graph, 1); // 首轮只试一次，快速失败
          const holder = document.createElement('div');
          holder.className = 'mermaid-figure';
          holder.innerHTML = svg;
          pre.replaceWith(holder);
        } catch (err) {
          failures.push({ pre, graph, err });
        }
      }
      // 整轮结束后重试失败块：此时 mermaid 图表模块已完成动态 import，通常一次即成
      const stillFailed: string[] = [];
      for (const f of failures) {
        try {
          const svg = await renderWithRetry(f.graph, 2);
          const holder = document.createElement('div');
          holder.className = 'mermaid-figure';
          holder.innerHTML = svg;
          f.pre.replaceWith(holder);
        } catch (err) {
          stillFailed.push(String(err));
        }
      }
      if (stillFailed.length > 0) {
        // 诊断信息挂在容器上（渲染失败回退源码，不白屏）
        bodyRef.current?.setAttribute('data-mermaid-errors', JSON.stringify(stillFailed));
        setMermaidFailed(true);
      }
    })();
  }, [html]);

  // 锚点跳转（#/doc/key/anchor）——滚动容器是 .content，而非 window
  useEffect(() => {
    const content = document.querySelector<HTMLElement>('.content');
    if (!route.anchor) {
      content?.scrollTo({ top: 0 });
      return;
    }
    const target = document.getElementById(route.anchor);
    if (target) target.scrollIntoView({ block: 'start' });
    else content?.scrollTo({ top: 0 });
  }, [route]);

  if (!source) {
    return (
      <div className="doc-view">
        <h1>文档不存在</h1>
        <p>
          未找到 <code>{key}</code>。请从侧栏选择文档，或
          <a href={hrefHome()}>返回首页</a>。
        </p>
      </div>
    );
  }

  const idx = ORDERED_KEYS.indexOf(key);
  const prev = idx > 0 ? ORDERED_KEYS[idx - 1] : undefined;
  const next = idx >= 0 && idx < ORDERED_KEYS.length - 1 ? ORDERED_KEYS[idx + 1] : undefined;

  return (
    <article className="doc-view">
      <div className="doc-crumb">
        <a href={hrefHome()}>首页</a>
        <span>/</span>
        <span>{docTitle(key)}</span>
      </div>
      {mermaidFailed && (
        <p className="doc-warning">部分 Mermaid 图渲染失败，已回退显示源码。</p>
      )}
      <div
        ref={bodyRef}
        className="doc-body markdown"
        // renderMarkdown 的输入是本仓库受控文档（构建时内嵌，非用户输入）
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <nav className="doc-pager">
        {prev ? (
          <a className="pager-prev" href={hrefDoc(prev)}>
            ← {docTitle(prev)}
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a className="pager-next" href={hrefDoc(next)}>
            {docTitle(next)} →
          </a>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
