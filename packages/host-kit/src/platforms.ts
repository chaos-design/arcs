/**
 * 平台名唯一来源。OpenAI 宿主统一用 `chatgpt`（覆盖 Codex 兼容契约），
 * Pi 宿主统一用 `pi`；同名宿主不重复立平台，插件内部禁止散落硬编码平台名。
 */
export const PLATFORMS = [
  'claude-code',
  'opencode',
  'zcode',
  'workbuddy',
  'pi',
  'deepseek',
  'trae',
  'chatgpt',
  'qwen-code',
] as const;

export type PlatformName = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is PlatformName {
  return (PLATFORMS as readonly string[]).includes(value);
}
