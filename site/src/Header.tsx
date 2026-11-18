import { hrefHome } from './routes';

interface HeaderProps {
  navOpen: boolean;
  onMenu: () => void;
}

/** 移动端顶栏：品牌 + GitHub + 汉堡按钮（桌面由 CSS 隐藏） */
export function Header({ navOpen, onMenu }: HeaderProps) {
  return (
    <header className="header">
      <a className="brand" href={hrefHome()} aria-label="ARCS 首页">
        <span className="brand-mark">ARC</span>
        <span className="brand-name">ARCS</span>
      </a>
      <div className="header-actions">
        <a
          className="icon-btn"
          href="https://github.com/chaos-design/arcs"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub 仓库"
          title="GitHub 仓库"
        >
          ↗
        </a>
        <button
          className="icon-btn"
          type="button"
          onClick={onMenu}
          aria-label={navOpen ? '关闭导航' : '打开导航'}
          aria-expanded={navOpen}
        >
          {navOpen ? '✕' : '☰'}
        </button>
      </div>
    </header>
  );
}
