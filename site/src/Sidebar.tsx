import { NAV } from './docs';
import { hrefDoc, hrefHome, type Route } from './routes';

interface SidebarProps {
  route: Route;
}

/** 左侧分组导航：阅读顺序即 docs/README.md 索引顺序 */
export function Sidebar({ route }: SidebarProps) {
  return (
    <aside className="sidebar">
      <a className="brand" href={hrefHome()}>
        <span className="brand-mark">ARCS</span>
        <span className="brand-sub">Agent 纠偏系统</span>
      </a>
      <nav>
        {NAV.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.entries.map((entry) => (
              <a
                key={entry.key}
                href={hrefDoc(entry.key)}
                className={`nav-item${route.kind === 'doc' && route.key === entry.key ? ' active' : ''}`}
              >
                <span className="nav-title">{entry.title}</span>
                <span className="nav-desc">{entry.desc}</span>
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <a href="https://github.com/chaos-design/arcs" target="_blank" rel="noreferrer">
          GitHub 仓库 ↗
        </a>
      </div>
    </aside>
  );
}
