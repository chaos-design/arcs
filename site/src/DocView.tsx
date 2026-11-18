import { useEffect, useMemo, useRef, useState } from 'react';
import { docContent } from './docs';
import { docTitle, navFor, ORDERED_KEYS, t } from './i18n';
import { postProcess, renderMarkdown } from './markdown';
import { hrefDoc, hrefHome, type Route } from './routes';

let mermaidSeq = 0;
let mermaidReady: Promise<typeof import('mermaid')['default']> | undefined;
/** mermaid 体积大（含 katex/cytoscape），仅当页面确有图时动态加载；initialize 只执行一次 */
function renderMermaidSvg(graph: string): Promise<string> {
  // securityLevel 用 loose：仓库受控文档需要 <br/> HTML label；strict 会干扰渲染管线
  mermaidReady ??= import('mermaid').then((m) => {
    // themeVariables 与 styles.css 的设计 token 手工对齐
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

interface TocItem {
  id: string;
  text: string;
}

interface DocViewProps {
  route: Route;
}

/** 文档视图：markdown → HTML → DOM 后处理（高亮/链接改写/mermaid 渲染），右侧粘性 TOC + 灯箱 */
export function DocView({ route }: DocViewProps) {
  const { key, lang } = route;
  const s = t(lang);
  const doc = docContent(key!, lang);
  const source = doc?.source;
  // useMemo 按 source 派生：DocView 在路由/语言间复用同一组件实例，useState 初始化器只跑一次
  // 会导致切换文档或语言时正文停留旧内容；mermaid 状态随每次正文变化复位。
  const html = useMemo(() => (source ? renderMarkdown(source) : ''), [source]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mermaidFailed, setMermaidFailed] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [zoomSvg, setZoomSvg] = useState<string | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    setMermaidFailed(false);
    setZoomSvg(null);
    // 相对链接按当前文档的物理路径解析：中文 ./core.md → core，英文 ./core.md → en/core
    postProcess(body, doc!.key);

    // TOC 数据源：正文 h2（postProcess 已补 slug id）；仅两节以上才展示
    setToc(
      Array.from(body.querySelectorAll('h2'))
        .filter((h) => h.id)
        .map((h) => ({ id: h.id, text: h.textContent ?? '' })),
    );

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
  }, [html, key, lang]);

  // TOC scroll spy：以滚动容器视口顶部附近（+96px 判定线）最近已越过的 h2 作为当前节。
  // 除 scroll 事件外挂一个 300ms 兜底轮询：后台/节流环境下渲染帧暂停，
  // scroll 事件可能不派发（scrollTop 变了但事件不来），轮询保证高亮最终收敛。
  useEffect(() => {
    if (toc.length < 2) return;
    const content = document.querySelector<HTMLElement>('.content');
    if (!content) return;
    let lastTop = -1;
    const compute = () => {
      const top = content.scrollTop;
      if (top === lastTop) return;
      lastTop = top;
      const anchor = content.getBoundingClientRect().top + 96;
      let current = toc[0]!.id;
      for (const item of toc) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= anchor) current = item.id;
      }
      setActiveHeading(current);
    };
    compute();
    content.addEventListener('scroll', compute, { passive: true });
    const timer = window.setInterval(compute, 300);
    return () => {
      content.removeEventListener('scroll', compute);
      window.clearInterval(timer);
    };
  }, [toc]);

  // 灯箱：Esc 关闭 + 打开期间锁定滚动容器
  useEffect(() => {
    if (!zoomSvg) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomSvg(null);
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('zoom-lock');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('zoom-lock');
    };
  }, [zoomSvg]);

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
        <h1>{s.docNotFound}</h1>
        <p>
          {s.docNotFoundHint}
          <code>{key}</code>
          {s.docNotFoundHint2}
          <a href={hrefHome(lang)}>{s.backHome}</a>
        </p>
      </div>
    );
  }

  // 三级面包屑：ARCS / <分组> / <文档标题>
  const group = navFor(lang).find((g) => g.entries.some((e) => e.key === key));
  const idx = ORDERED_KEYS.indexOf(key!);
  const prev = idx > 0 ? ORDERED_KEYS[idx - 1] : undefined;
  const next = idx >= 0 && idx < ORDERED_KEYS.length - 1 ? ORDERED_KEYS[idx + 1] : undefined;

  return (
    <div className="doc-layout">
      <article className="doc-view">
        <p className="crumb">
          <a href={hrefHome(lang)}>ARCS</a>
          <span className="crumb-sep">/</span>
          {group?.label}
          <span className="crumb-sep">/</span>
          {docTitle(key!, lang)}
        </p>
        {mermaidFailed && <p className="doc-warning">{s.mermaidWarning}</p>}
        <div
          ref={bodyRef}
          className="doc-body markdown"
          // renderMarkdown 的输入是本仓库受控文档（构建时内嵌，非用户输入）
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => {
            // 点击 mermaid 图打开灯箱放大查看
            const figure = (e.target as HTMLElement).closest<HTMLElement>('.mermaid-figure');
            if (!figure) return;
            const svg = figure.querySelector('svg');
            if (svg) setZoomSvg(svg.outerHTML);
          }}
        />
        <nav className="doc-pager">
          {prev ? (
            <a className="pager-cell" href={hrefDoc(prev, lang)}>
              <span className="pager-kicker">← {s.pagerPrev}</span>
              <span className="pager-title">{docTitle(prev, lang)}</span>
            </a>
          ) : (
            <span className="pager-cell empty" aria-hidden="true" />
          )}
          {next ? (
            <a className="pager-cell next" href={hrefDoc(next, lang)}>
              <span className="pager-kicker">{s.pagerNext} →</span>
              <span className="pager-title">{docTitle(next, lang)}</span>
            </a>
          ) : (
            <span className="pager-cell empty" aria-hidden="true" />
          )}
        </nav>
      </article>
      {toc.length >= 2 && (
        <aside className="doc-toc">
          <h4>{s.tocTitle}</h4>
          <ol>
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={activeHeading === item.id ? 'active' : undefined}
                  onClick={(e) => {
                    // SPA hash 路由下禁止改写 location.hash，仅滚动到锚点
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </aside>
      )}
      {zoomSvg && (
        <div className="lightbox" onClick={() => setZoomSvg(null)} role="dialog" aria-label={s.closeZoom}>
          <div className="lightbox-body" dangerouslySetInnerHTML={{ __html: zoomSvg }} />
          <button
            className="lightbox-close"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomSvg(null);
            }}
            aria-label={s.closeZoom}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
