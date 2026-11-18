import type { Lang } from './routes';

interface LangSwitchProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
  /** 移动端顶栏用紧凑排布 */
  compact?: boolean;
}

/** 中/英切换控件：侧栏底部与移动端顶栏共用 */
export function LangSwitch({ lang, onChange, compact = false }: LangSwitchProps) {
  return (
    <div className={`lang-switch${compact ? ' compact' : ''}`} role="group" aria-label="Language / 语言">
      <button
        type="button"
        className={lang === 'zh' ? 'active' : ''}
        aria-pressed={lang === 'zh'}
        onClick={() => onChange('zh')}
      >
        中文
      </button>
      <button
        type="button"
        className={lang === 'en' ? 'active' : ''}
        aria-pressed={lang === 'en'}
        onClick={() => onChange('en')}
      >
        EN
      </button>
    </div>
  );
}
