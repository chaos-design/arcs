import { fingerprint } from '@chaos-design/arcs-core';
import type { Snapshot, ToolCall } from '@chaos-design/arcs-core';

/** 会话状态：按 sessionKey 分桶（docs/plugin-kit.md 状态所有权） */
export interface SessionState {
  sessionKey: string;
  /** 滑动窗口：工具调用指纹环形缓冲 */
  loopWindow: string[];
  /** 历史快照环形缓冲 */
  history: Snapshot[];
  budget: { stepsUsed: number; stepsMax: number; elapsedMs: number };
  lastActiveAt: number;
}

export interface SessionStoreOptions {
  ttlMs: number;
  loopWindowMax: number;
  historyMax: number;
  stepsMax: number;
}

export class SessionStore {
  private map = new Map<string, SessionState>();

  constructor(private readonly opts: SessionStoreOptions) {}

  touch(key: string, now: number = Date.now()): SessionState {
    let state = this.map.get(key);
    if (!state) {
      state = {
        sessionKey: key,
        loopWindow: [],
        history: [],
        budget: { stepsUsed: 0, stepsMax: this.opts.stepsMax, elapsedMs: 0 },
        lastActiveAt: now,
      };
      this.map.set(key, state);
    }
    state.lastActiveAt = now;
    return state;
  }

  record(
    state: SessionState,
    thought: string,
    toolCall: ToolCall,
    ts: number,
    outcome?: 'ok' | 'error',
  ): void {
    state.loopWindow.push(fingerprint(toolCall));
    if (state.loopWindow.length > this.opts.loopWindowMax) {
      state.loopWindow.splice(0, state.loopWindow.length - this.opts.loopWindowMax);
    }
    state.history.push({ thought, toolCall, ts, outcome });
    if (state.history.length > this.opts.historyMax) {
      state.history.splice(0, state.history.length - this.opts.historyMax);
    }
    state.budget.stepsUsed += 1;
  }

  /** TTL 清理：空转超时的会话状态回收，返回回收数量 */
  sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [key, state] of this.map) {
      if (now - state.lastActiveAt > this.opts.ttlMs) {
        this.map.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.map.size;
  }
}
