import { HookEntryAdapter, capabilitiesFor } from '@chaos-design/arcs-host-kit';
import type { HostAdapter } from '@chaos-design/arcs-plugin-kit';

export { parsePlAgentHook, serializePlAgent, shouldSteerPlAgent } from './mapping.js';

export function createPlAgentAdapter(goal: string): HostAdapter {
  return new HookEntryAdapter('pl-agent', capabilitiesFor('pl-agent'), goal);
}
