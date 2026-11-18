import { GithubIcon } from './GithubIcon';
import { LangToggle } from './LangToggle';
import { t } from './i18n';
import { hrefHome, type Lang } from './routes';

interface HeaderProps {
  navOpen: boolean;
  lang: Lang;
  onLang: (lang: Lang) => void;
  onMenu: () => void;
}

/** 移动端顶栏：品牌 + GitHub 图标 + 语言切换 + 动画汉堡（桌面由 CSS 隐藏） */
export function Header({ navOpen, lang, onLang, onMenu }: HeaderProps) {
  const s = t(lang);
  return (
    <header className="header">
      <a className="brand" href={hrefHome(lang)} aria-label={`ARCS ${s.home}`}>
        <span className="brand-mark">ARC</span>
        <span className="brand-text">
          <span className="brand-name">ARCS</span>
          <span className="brand-sub">{s.brandSub}</span>
        </span>
      </a>
      <div className="header-actions">
        <a
          className="header-github"
          href="https://github.com/chaos-design/arcs"
          target="_blank"
          rel="noreferrer"
          aria-label={s.githubAria}
          title={s.githubAria}
        >
          <GithubIcon size={18} />
        </a>
        <LangToggle lang={lang} onChange={onLang} compact />
        <button
          className={`nav-toggle${navOpen ? ' open' : ''}`}
          type="button"
          onClick={onMenu}
          aria-label={navOpen ? s.closeNav : s.openNav}
          aria-expanded={navOpen}
        >
          <span className="nav-toggle-bars">
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>
    </header>
  );
}
