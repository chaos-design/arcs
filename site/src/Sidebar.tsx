import { GithubIcon } from './GithubIcon';
import { navFor, t } from './i18n';
import { LangToggle } from './LangToggle';
import { hrefDoc, hrefHome, type Lang, type Route } from './routes';

interface SidebarProps {
  route: Route;
  lang: Lang;
  onLang: (lang: Lang) => void;
  open?: boolean;
  onNavigate?: () => void;
}

/**
 * 左侧分组导航：三段式（固定品牌头 / 滚动目录 / 吸底 GitHub + 语言切换双按钮）。
 * 首组「导航」含首页入口；文档项单行标题，阅读顺序即 docs/README.md 索引顺序。
 */
export function Sidebar({ route, lang, onLang, open = false, onNavigate }: SidebarProps) {
  const s = t(lang);
  const isHome = route.kind !== 'doc';
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-head">
        <a className="brand" href={hrefHome(lang)} onClick={onNavigate}>
          <span className="brand-mark">ARC</span>
          <span className="brand-text">
            <span className="brand-name">ARCS</span>
            <span className="brand-sub">{s.brandSub}</span>
          </span>
        </a>
      </div>
      <div className="sidebar-scroll">
        <nav>
          <div className="nav-group">
            <div className="nav-label">{s.navGroupNav}</div>
            <a className={`nav-item${isHome ? ' active' : ''}`} href={hrefHome(lang)} onClick={onNavigate}>
              {s.navHome}
            </a>
          </div>
          {navFor(lang).map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.entries.map((entry) => (
                <a
                  key={entry.key}
                  href={hrefDoc(entry.key, lang)}
                  onClick={onNavigate}
                  className={`nav-item${
                    route.kind === 'doc' && route.lang === lang && route.key === entry.key ? ' active' : ''
                  }`}
                >
                  {entry.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="sidebar-footer">
        <a href="https://github.com/chaos-design/arcs" target="_blank" rel="noreferrer">
          <GithubIcon size={16} />
          <span>GitHub</span>
          <span className="ext-arrow">↗</span>
        </a>
        <LangToggle lang={lang} onChange={onLang} />
      </div>
    </aside>
  );
}
