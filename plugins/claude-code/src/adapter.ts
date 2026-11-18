import { HookEntryAdapter, capabilitiesFor } from '@chaos-design/arcs-host-kit';
import type { HostAdapter } from '@chaos-design/arcs-plugin-kit';

export { parseClaudeHook, serializeClaude, shouldSteerClaude } from './mapping.js';

/** 一次性 hook 内完成纠偏，复用 host-kit 的唯一入口桥实现 */
export function createClaudeAdapter(goal: string): HostAdapter {
  return new HookEntryAdapter('claude-code', capabilitiesFor('claude-code'), goal);
}
