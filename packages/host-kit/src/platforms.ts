/**
 * 平台名唯一来源。上游品牌重命名（如 codex → chatgpt）只影响此处，
 * 插件内部禁止散落硬编码平台名。
 */
export const PLATFORMS = [
  'claude-code',
  'codex',
  'opencode',
  'zcode',
  'workbuddy',
  'pi',
  'deepseek',
  'trae',
] as const;

export type PlatformName = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is PlatformName {
  return (PLATFORMS as readonly string[]).includes(value);
}
