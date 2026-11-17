import { describe, expect, it } from 'vitest';
import { HOST_CAPABILITIES } from './capabilities.js';
import { readInput, runHookEntry } from './entry.js';
import { nativeToRaw, toolCallFromNative, type NativeEvent } from './mapping.js';

const dangerous = (eventName = 'PreToolUse'): NativeEvent => ({
  eventName,
  sessionId: 's-1',
  timestamp: 1000,
  toolUseId: 'call-1',
  toolName: 'bash',
  toolArgs: { command: 'rm -rf /' },
});

describe('runHookEntry', () => {
  it('把高危命令翻译为支持挂起平台的 ask 决策', async () => {
    let out = '';
    const decision = await runHookEntry({
      source: 'claude-code',
      capabilities: HOST_CAPABILITIES['claude-code'],
      goal: '安全重构',
      input: '{}',
      parse: () => dangerous(),
      serialize: (d) => JSON.stringify(d),
      write: (text) => { out = text; },
      errWrite: () => {},
    });
    expect(decision.kind).toBe('ask');
    expect(decision.level).toBe(4);
    expect(out).toContain('"ask"');
  });

  it('同一效果在只能拒绝的平台降级为 block', async () => {
    const decision = await runHookEntry({
      source: 'zcode',
      capabilities: HOST_CAPABILITIES.zcode,
      goal: '安全重构',
      input: '{}',
      parse: () => dangerous(),
      serialize: (d) => JSON.stringify(d),
      write: () => {},
      errWrite: () => {},
    });
    expect(decision.kind).toBe('block');
    expect(decision.degraded).toContain('suspend→block');
  });

  it('parse 抛异常时 fail-open 放行且错误只写 stderr', async () => {
    let err = '';
    let out = '';
    const decision = await runHookEntry({
      source: 'trae',
      capabilities: HOST_CAPABILITIES.trae,
      goal: 'x',
      input: '',
      parse: () => { throw new Error('bad payload'); },
      serialize: (d) => JSON.stringify(d),
      write: (text) => { out = text; },
      errWrite: (text) => { err += text; },
    });
    expect(decision.kind).toBe('allow');
    expect(err).toContain('fail-open');
    expect(out).toContain('"allow"');
  });

  it('readInput 优先使用注入的输入', () => {
    expect(readInput('abc')).toBe('abc');
  });
});

describe('事件映射', () => {
  it('带工具名的事件映射为 tool-call', () => {
    expect(nativeToRaw('claude-code', dangerous()).type).toBe('tool-call');
  });

  it('prompt 事件映射为 thought', () => {
    const raw = nativeToRaw('codex', {
      eventName: 'UserPromptSubmit',
      sessionId: 's-2',
      thought: '请继续',
    });
    expect(raw.type).toBe('thought');
    expect((raw.payload as Record<string, unknown>)['thought']).toBe('请继续');
  });

  it('toolCallFromNative 从 tool_input 提取参数', () => {
    const raw = nativeToRaw('workbuddy', {
      eventName: 'PreToolUse',
      sessionId: 's-3',
      toolUseId: 'u-3',
      toolName: 'read',
      toolArgs: { path: 'a.txt' },
    });
    const tc = toolCallFromNative(raw);
    expect(tc.id).toBe('u-3');
    expect(tc.name).toBe('read');
    expect(tc.args).toEqual({ path: 'a.txt' });
  });
});
