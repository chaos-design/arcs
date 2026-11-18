import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAuditEvent, type AuditEvent, InMemorySink } from '@chaos-design/arcs-telemetry';
import { FileAuditSink, createAuditSink } from './audit-sink.js';
import { runHookEntry } from './entry.js';
import { capabilitiesFor } from './capabilities.js';

const homes: string[] = [];
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'arcs-audit-'));
  homes.push(home);
  return home;
}
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return buildAuditEvent({
    ts: Date.UTC(2026, 0, 2, 3, 4, 5),
    sessionId: 's-1',
    host: 'claude-code',
    level: 4,
    signals: [{ kind: 'policy', severity: 1, score: 1, evidence: '高危命令' }],
    effects: [{ type: 'Suspend', reason: '高危命令' }],
    latencyMs: 3,
    degraded: false,
    ...overrides,
  });
}

describe('FileAuditSink', () => {
  it('按 host 与 UTC 日期分文件追加 JSONL', () => {
    const home = freshHome();
    const sink = new FileAuditSink({ home });
    sink.emit(event());
    const file = join(home, 'audit', 'claude-code', '2026-01-02.jsonl');
    expect(existsSync(file)).toBe(true);
    const row = JSON.parse(readFileSync(file, 'utf8').trim()) as AuditEvent;
    expect(row.level).toBe(4);
    expect(row.host).toBe('claude-code');
  });

  it('多次 emit 追加多行而不覆盖', () => {
    const home = freshHome();
    const sink = new FileAuditSink({ home });
    sink.emit(event());
    sink.emit(event({ level: null, effects: [{ type: 'PassThrough' }], signals: [] }));
    const file = join(home, 'audit', 'claude-code', '2026-01-02.jsonl');
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('ARCS_AUDIT_FILE 精确路径覆盖分文件规则', () => {
    const home = freshHome();
    const exact = join(home, 'custom', 'audit.jsonl');
    const sink = new FileAuditSink({ home, file: exact });
    sink.emit(event());
    expect(existsSync(exact)).toBe(true);
    expect(existsSync(join(home, 'audit'))).toBe(false);
  });

  it('路径不可写时 emit 静默 fail-open', () => {
    const home = freshHome();
    const sink = new FileAuditSink({ file: home }); // 指向目录
    expect(() => sink.emit(event())).not.toThrow();
  });

  it('host 段被收敛为安全文件名', () => {
    const home = freshHome();
    const sink = new FileAuditSink({ home });
    sink.emit(event({ host: '../../etc/passwd' }));
    expect(existsSync(join(home, 'audit', '..', '..', 'etc', 'passwd', '2026-01-02.jsonl'))).toBe(false);
    expect(sink.filePath(event({ host: '../../etc/passwd' }))).toContain('/audit/..-..-etc-passwd/');
  });
});

describe('createAuditSink', () => {
  it('未配置任何环境变量时不创建 sink', () => {
    expect(createAuditSink({})).toBeUndefined();
  });

  it('ARCS_HOME 或 ARCS_AUDIT_FILE 任一存在即创建', () => {
    expect(createAuditSink({ ARCS_HOME: '/tmp/x' })).toBeInstanceOf(FileAuditSink);
    expect(createAuditSink({ ARCS_AUDIT_FILE: '/tmp/x.jsonl' })).toBeInstanceOf(FileAuditSink);
  });

  it('runHookEntry 使用显式 sink 产出审计事件', async () => {
    const sink = new InMemorySink();
    await runHookEntry({
      source: 'claude-code',
      capabilities: capabilitiesFor('claude-code'),
      goal: '安全重构',
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'audit-e2e',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
      parse: (text) => {
        const obj = JSON.parse(text || '{}') as Record<string, unknown>;
        const input = (obj['tool_input'] ?? {}) as Record<string, unknown>;
        return {
          eventName: String(obj['hook_event_name'] ?? 'unknown'),
          sessionId: String(obj['session_id'] ?? 'unknown-session'),
          toolName: String(obj['tool_name'] ?? 'unknown'),
          toolArgs: input,
        };
      },
      shouldSteer: (n) => n.eventName === 'PreToolUse',
      serialize: () => '{}',
      sink,
      write: () => {},
      errWrite: () => {},
    });
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.level).toBe(4);
    expect(sink.events[0]?.host).toBe('claude-code');
  });
});
