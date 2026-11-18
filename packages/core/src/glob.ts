/** 极简 glob 匹配（支持 **、*、?），覆盖保护路径场景 */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`(?:^|/)${escaped}(?:$|/)`);
}

export function matchPath(path: string, globs: string[]): boolean {
  return globs.some((g) => {
    try {
      return globToRegExp(g).test(path);
    } catch {
      return false;
    }
  });
}
