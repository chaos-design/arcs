/** hash 路由：#/home、#/doc/<key>（可带小节锚点与 ?lang=en） */

export type Lang = 'zh' | 'en';

export interface Route {
  kind: 'home' | 'doc' | 'not-found';
  /** 逻辑文档键（不含 en/ 前缀），两种语言共用同一套键 */
  key?: string;
  anchor?: string;
  lang: Lang;
}

export function parseLang(value: string | null, fallback: Lang = 'zh'): Lang {
  return value === 'en' || value === 'zh' ? value : fallback;
}

/** 逻辑键 → 物理键：docs/en/ 下的英文文档带 en/ 前缀 */
export function physicalKey(key: string, lang: Lang): string {
  return lang === 'en' ? `en/${key}` : key;
}

export function parseHash(hash: string, fallbackLang: Lang = 'zh'): Route {
  const raw = hash.replace(/^#/, '');
  const qi = raw.indexOf('?');
  const path = qi >= 0 ? raw.slice(0, qi) : raw;
  const query = qi >= 0 ? raw.slice(qi + 1) : '';
  let lang = parseLang(new URLSearchParams(query).get('lang'), fallbackLang);

  if (!path || path === '/' || path === '/home') return { kind: 'home', lang };

  // /doc/<物理键>[/<锚点>]；英文文档的物理键自带 en/ 前缀（多一段），需与锚点区分
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'doc' || parts.length < 2) return { kind: 'not-found', lang };
  let rest = parts.slice(1);
  if (rest[0] === 'en' && rest.length >= 2) {
    lang = 'en'; // en/ 前缀隐含语言，兼容手工构造的无 ?lang 链接
    rest = rest.slice(1);
  }
  return {
    kind: 'doc',
    key: decodeURIComponent(rest[0]),
    anchor: rest[1] ? decodeURIComponent(rest[1]) : undefined,
    lang,
  };
}

function langQuery(lang: Lang): string {
  return lang === 'en' ? '?lang=en' : '';
}

export function hrefHome(lang: Lang = 'zh'): string {
  return `#/home${langQuery(lang)}`;
}

export function hrefDoc(key: string, lang: Lang = 'zh', anchor?: string): string {
  // 逐段编码：en/architecture 的斜杠必须保留为路径分隔符，不能编码成 %2F
  const physical = physicalKey(key, lang)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const tail = anchor ? `/${encodeURIComponent(anchor)}` : '';
  return `#/doc/${physical}${tail}${langQuery(lang)}`;
}

/** 保持当前页语义，仅切换语言（文档锚点保留；404 回首页） */
export function switchLangHash(route: Route, lang: Lang): string {
  if (route.kind === 'doc' && route.key) return hrefDoc(route.key, lang, route.anchor);
  return hrefHome(lang);
}
