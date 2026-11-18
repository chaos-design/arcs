import { NAV } from './docs';
import { hrefDoc, hrefHome, type Route } from './routes';

interface SidebarProps {
  route: Route;
  open?: boolean;
  onNavigate?: () => void;
}

/** 左侧分组导航：三段式（固定品牌头 / 滚动目录 / 吸底 GitHub），阅读顺序即 docs/README.md 索引顺序 */
export function Sidebar({ route, open = false, onNavigate }: SidebarProps) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-head">
        <a className="brand" href={hrefHome()} onClick={onNavigate}>
          <span className="brand-mark">ARC</span>
          <span>
            <span className="brand-name">ARCS</span>
            <span className="brand-sub">AGENT COURSE STEERING</span>
          </span>
        </a>
      </div>
      <div className="sidebar-scroll">
        <nav>
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.entries.map((entry) => (
                <a
                  key={entry.key}
                  href={hrefDoc(entry.key)}
                  onClick={onNavigate}
                  className={`nav-item${route.kind === 'doc' && route.key === entry.key ? ' active' : ''}`}
                >
                  <span className="nav-title">{entry.title}</span>
                  <span className="nav-desc">{entry.desc}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="sidebar-footer">
        <a href="https://github.com/chaos-design/arcs" target="_blank" rel="noreferrer">
          GitHub 仓库 ↗
        </a>
      </div>
    </aside>
  );
}
