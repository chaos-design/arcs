import { HookEntryAdapter, capabilitiesFor } from '@chaos-design/arcs-host-kit';
import type { HostAdapter } from '@chaos-design/arcs-plugin-kit';

export { parseQwenCodeHook, serializeQwenCode, shouldSteerQwenCode } from './mapping.js';

export function createQwenCodeAdapter(goal: string): HostAdapter {
  return new HookEntryAdapter('qwen-code', capabilitiesFor('qwen-code'), goal);
}
