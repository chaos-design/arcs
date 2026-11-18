import { useEffect, useState } from 'react';
import { DocView } from './DocView';
import { Home } from './Home';
import { Sidebar } from './Sidebar';
import { parseHash, type Route } from './routes';

function readRoute(): Route {
  return parseHash(window.location.hash);
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="app">
      <Sidebar route={route} />
      <main className="main">
        {route.kind === 'doc' ? <DocView route={route} /> : route.kind === 'home' ? <Home /> : <NotFound />}
      </main>
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
