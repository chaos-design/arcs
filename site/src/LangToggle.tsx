import type { Lang } from './routes';

interface LangToggleProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
  /** 移动端顶栏用紧凑形态（显示短码 EN/中） */
  compact?: boolean;
}

/** 语言切换按钮：显示目标语言（点击即切），侧栏底部与移动端顶栏共用 */
export function LangToggle({ lang, onChange, compact = false }: LangToggleProps) {
  const next = lang === 'zh' ? 'en' : 'zh';
  const label = lang === 'zh' ? 'Switch to English' : '切换到中文';
  return (
    <button
      type="button"
      className={`lang-toggle${compact ? ' compact' : ''}`}
      onClick={() => onChange(next)}
      aria-label={label}
      title={label}
    >
      {compact ? (lang === 'zh' ? 'EN' : '中') : lang === 'zh' ? 'English' : '中文'}
    </button>
  );
}
