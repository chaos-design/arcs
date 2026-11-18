// 构建时由 vite 插件 docsModule() 内嵌的 docs/**/*.md 原文（键为 docs/ 相对路径去 .md）
import docsRaw from 'virtual:arcs-docs';
import { physicalKey, type Lang } from './routes';

export const ALL_DOCS: Record<string, string> = docsRaw as Record<string, string>;

export interface DocContent {
  source: string;
  /** 实际命中的物理键：缺译回退中文时用于相对链接解析，避免按英文路径误推导 */
  key: string;
}

/** 取原文：先按语言取物理键；缺译时回退中文，保证任何语言都不白屏 */
export function docContent(logicalKey: string, lang: Lang): DocContent | undefined {
  const physical = physicalKey(logicalKey, lang);
  if (ALL_DOCS[physical]) return { source: ALL_DOCS[physical], key: physical };
  if (ALL_DOCS[logicalKey]) return { source: ALL_DOCS[logicalKey], key: logicalKey };
  return undefined;
}
