import { useEffect, useState } from 'react';
import { DocView } from './DocView';
import { Header } from './Header';
import { Home } from './Home';
import { Sidebar } from './Sidebar';
import { parseHash, type Route } from './routes';

/** 与 CSS 的移动端断点保持一致（styles.css 的 @media (max-width: 860px)） */
const MOBILE_NAV_QUERY = '(max-width: 860px)';

function readRoute(): Route {
  return parseHash(window.location.hash);
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(readRoute());
      setNavOpen(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
      <Header navOpen={navOpen} onMenu={() => setNavOpen((v) => !v)} />
      <Sidebar route={route} open={navOpen} onNavigate={() => setNavOpen(false)} />
      <div
        className={`nav-scrim${navOpen ? ' open' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <div className="content">
        <main className="main">
          {route.kind === 'doc' ? <DocView route={route} /> : route.kind === 'home' ? <Home /> : <NotFound />}
        </main>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="doc-view">
      <h1>404</h1>
      <p>页面不存在。请从侧栏选择文档。</p>
    </div>
  );
}
