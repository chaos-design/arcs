import { useEffect, useState } from 'react';
import { DocView } from './DocView';
import { Header } from './Header';
import { Home } from './Home';
import { Sidebar } from './Sidebar';
import { docTitle, t } from './i18n';
import { parseHash, parseLang, switchLangHash, type Lang, type Route } from './routes';

/** 与 CSS 的移动端断点保持一致（styles.css 的 @media (max-width: 860px)） */
const MOBILE_NAV_QUERY = '(max-width: 860px)';
const LANG_KEY = 'arcs-site-lang';

function readSavedLang(): Lang {
  try {
    return parseLang(localStorage.getItem(LANG_KEY));
  } catch {
    return 'zh';
  }
}

/** URL 中的 ?lang 优先于本地记忆，并写回记忆：分享链接决定语言，无参链接沿用上次选择 */
function bootstrap(): { lang: Lang; route: Route } {
  const hash = window.location.hash;
  const qi = hash.indexOf('?');
  const urlLang = qi >= 0 ? new URLSearchParams(hash.slice(qi + 1)).get('lang') : null;
  const lang = parseLang(urlLang, readSavedLang());
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // 隐私模式禁用 localStorage 时退化为仅 URL 记忆
  }
  return { lang, route: parseHash(hash, lang) };
}

export function App() {
  const [initial] = useState(bootstrap);
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [route, setRoute] = useState<Route>(initial.route);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      const next = parseHash(window.location.hash, readSavedLang());
      setRoute(next);
      setLang(next.lang);
      setNavOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // 文档标题与 <html lang> 跟随路由/语言：文档页显示文档标题，浏览器历史与分享链接可读
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title =
      route.kind === 'doc' && route.key ? `${docTitle(route.key, lang)} · ARCS` : t(lang).siteTitle;
  }, [route, lang]);

  // 切换语言：记忆新语言并改写 hash；hashchange 处理器统一回填 route/lang（浏览器前进后退同样生效）
  const changeLang = (next: Lang) => {
    if (next === lang) return;
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // 同上，忽略存储不可写
    }
    window.location.hash = switchLangHash(route, next);
  };

  // 移动端抽屉：Esc 关闭、宽屏自动关闭、打开时锁定背景滚动
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    const onResize = () => {
      if (!window.matchMedia(MOBILE_NAV_QUERY).matches) setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = '';
    };
  }, [navOpen]);

  return (
    <div className="app">
      <Header navOpen={navOpen} lang={lang} onLang={changeLang} onMenu={() => setNavOpen((v) => !v)} />
      <Sidebar
        route={route}
        lang={lang}
        onLang={changeLang}
        open={navOpen}
        onNavigate={() => setNavOpen(false)}
      />
      <div
        className={`nav-scrim${navOpen ? ' open' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <div className="content">
        <main className="main">
          {route.kind === 'doc' ? (
            <DocView route={route} />
          ) : route.kind === 'home' ? (
            <Home lang={lang} />
          ) : (
            <NotFound lang={lang} />
          )}
        </main>
      </div>
    </div>
  );
}

function NotFound({ lang }: { lang: Lang }) {
  const s = t(lang);
  return (
    <div className="doc-view">
      <h1>{s.notFoundTitle}</h1>
      <p>{s.notFoundBody}</p>
    </div>
  );
}
