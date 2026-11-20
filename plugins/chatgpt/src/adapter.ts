import { HookEntryAdapter, capabilitiesFor } from '@chaos-design/arcs-host-kit';
import type { HostAdapter } from '@chaos-design/arcs-plugin-kit';

export { parseChatgptHook, serializeChatgpt, shouldSteerChatgpt } from './mapping.js';

export function createChatgptAdapter(goal: string): HostAdapter {
  return new HookEntryAdapter('chatgpt', capabilitiesFor('chatgpt'), goal);
}
