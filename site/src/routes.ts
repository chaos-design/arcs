/** hash 路由：#/home、#/doc/<key>（可带 #小节锚点：#/doc/key/anchor） */

export interface Route {
  kind: 'home' | 'doc' | 'not-found';
  key?: string;
  anchor?: string;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  if (!raw || raw === '/' || raw === '/home') return { kind: 'home' };
  const m = raw.match(/^\/doc\/([^/#]+)(?:\/([^#]+))?$/);
  if (!m) return { kind: 'not-found' };
  return { kind: 'doc', key: decodeURIComponent(m[1]), anchor: m[2] ? decodeURIComponent(m[2]) : undefined };
}

export function hrefHome(): string {
  return '#/home';
}

export function hrefDoc(key: string, anchor?: string): string {
  return `#/doc/${encodeURIComponent(key)}${anchor ? `/${encodeURIComponent(anchor)}` : ''}`;
}
