import { t } from './i18n';
import { LangSwitch } from './LangSwitch';
import { hrefHome, type Lang } from './routes';

interface HeaderProps {
  navOpen: boolean;
  lang: Lang;
  onLang: (lang: Lang) => void;
  onMenu: () => void;
}

/** 移动端顶栏：品牌 + 语言切换 + GitHub + 汉堡按钮（桌面由 CSS 隐藏） */
export function Header({ navOpen, lang, onLang, onMenu }: HeaderProps) {
  const s = t(lang);
  return (
    <header className="header">
      <a className="brand" href={hrefHome(lang)} aria-label={`ARCS ${s.home}`}>
        <span className="brand-mark">ARC</span>
        <span className="brand-name">ARCS</span>
      </a>
      <div className="header-actions">
        <LangSwitch lang={lang} onChange={onLang} compact />
        <a
          className="icon-btn"
          href="https://github.com/chaos-design/arcs"
          target="_blank"
          rel="noreferrer"
          aria-label={s.githubAria}
          title={s.githubAria}
        >
          ↗
        </a>
        <button
          className="icon-btn"
          type="button"
          onClick={onMenu}
          aria-label={navOpen ? s.closeNav : s.openNav}
          aria-expanded={navOpen}
        >
          {navOpen ? '✕' : '☰'}
        </button>
      </div>
    </header>
  );
}
