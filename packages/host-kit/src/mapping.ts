import type { ToolCall } from '@chaos-design/arcs-core';
import type { RawEvent } from '@chaos-design/arcs-plugin-kit';

/** 平台 hook/bundle 投递到入口桥前的统一中间形态 */
export interface NativeEvent {
  eventName: string;
  sessionId: string;
  timestamp?: number;
  toolUseId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  thought?: string;
  payload?: unknown;
}

/** 从对象里取第一个存在的字符串字段 */
export function pickString(obj: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return fallback;
}

/** 从对象里取第一个存在的记录字段 */
export function pickRecord(
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

const TOOL_EVENT = /tool|call|command|permission/i;
const THOUGHT_EVENT = /prompt|input|thought|message|text|user/i;

/** 原生事件 → ARCS RawEvent（各平台 adapter 可在此之上做特化） */
export function nativeToRaw(source: string, native: NativeEvent): RawEvent {
  let type: RawEvent['type'] = 'command';
  if (native.toolName || native.toolUseId || TOOL_EVENT.test(native.eventName)) {
    type = 'tool-call';
  } else if (native.thought || THOUGHT_EVENT.test(native.eventName)) {
    type = 'thought';
  }

  const extra =
    native.payload && typeof native.payload === 'object' && !Array.isArray(native.payload)
      ? (native.payload as Record<string, unknown>)
      : {};

  return {
    host: source,
    type,
    sessionId: native.sessionId || 'unknown-session',
    timestamp: native.timestamp ?? Date.now(),
    payload: {
      ...extra,
      toolUseId: native.toolUseId,
      toolName: native.toolName,
      toolArgs: native.toolArgs,
      thought: native.thought,
      nativeEventName: native.eventName,
    },
  };
}

/** 从 RawEvent.payload 还原工具调用（host-kit 入口桥默认实现） */
export function toolCallFromNative(raw: RawEvent, fallbackId = 'hook-call'): ToolCall {
  const p = (raw.payload ?? {}) as Record<string, unknown>;
  const embedded = p['toolCall'];
  if (embedded && typeof embedded === 'object' && !Array.isArray(embedded)) {
    const tc = embedded as Partial<ToolCall>;
    return {
      id: tc.id ?? pickString(p, ['toolUseId', 'tool_call_id'], fallbackId),
      name: tc.name ?? 'unknown',
      args: tc.args ?? {},
    };
  }
  return {
    id: pickString(p, ['toolUseId', 'tool_call_id', 'id'], fallbackId),
    name: pickString(p, ['toolName', 'tool_name', 'name'], 'unknown'),
    args: pickRecord(p, ['toolArgs', 'tool_input', 'input', 'args', 'arguments'])
      ?? pickRecord(p, ['payload'])
      ?? {},
  };
}
