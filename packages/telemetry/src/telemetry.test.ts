import { describe, expect, it } from 'vitest';
import {
  auditEventSchema,
  buildAuditEvent,
  buildOffsetCurves,
  InMemorySink,
} from './index.js';

const baseEvent = {
  ts: 1700000000000,
  sessionId: 's1',
  host: 'codex',
  level: 2 as const,
  signals: [{ kind: 'loop' as const, severity: 0.6, score: 3, evidence: '连续重复 3 次' }],
  effects: [{ type: 'InjectMessage' as const, role: 'tool' as const, content: '提示' }],
  latencyMs: 12,
  degraded: false,
};

describe('AuditEvent 契约', () => {
  it('合法事件通过校验', () => {
    expect(() => buildAuditEvent(baseEvent)).not.toThrow();
  });

  it('level 为 null 表示无偏航放行', () => {
    const e = { ...baseEvent, level: null as null, signals: [], effects: [{ type: 'PassThrough' as const }] };
    expect(auditEventSchema.safeParse(e).success).toBe(true);
  });

  it('effects 不可 JSON 化的结构被拒绝', () => {
    const e = { ...baseEvent, effects: [{ type: 'Unknown' }] };
    expect(auditEventSchema.safeParse(e).success).toBe(false);
  });

  it('degraded 标记可序列化', () => {
    const e = { ...baseEvent, degraded: true };
    expect(JSON.parse(JSON.stringify(buildAuditEvent(e))).degraded).toBe(true);
  });
});

describe('InMemorySink', () => {
  it('emit 聚合事件且不抛异常', () => {
    const sink = new InMemorySink();
    sink.emit(buildAuditEvent(baseEvent));
    sink.emit(buildAuditEvent({ ...baseEvent, sessionId: 's2' }));
    expect(sink.events).toHaveLength(2);
    sink.clear();
    expect(sink.events).toHaveLength(0);
  });
});

describe('偏移曲线聚合', () => {
  it('按会话分组、按时间排序并统计降级', () => {
    const sink = new InMemorySink();
    sink.emit(buildAuditEvent({ ...baseEvent, ts: 200, signals: [{ kind: 'loop', severity: 0.6, score: 3, evidence: 'x' }] }));
    sink.emit(buildAuditEvent({ ...baseEvent, ts: 100, sessionId: 's2', degraded: true, level: null, signals: [], effects: [{ type: 'PassThrough' }] }));
    sink.emit(buildAuditEvent({ ...baseEvent, ts: 300, signals: [{ kind: 'policy', severity: 1, score: 1, evidence: 'y' }], effects: [{ type: 'Suspend', reason: 'y' }], level: 4 }));

    const curves = buildOffsetCurves(sink.events);
    expect(curves).toHaveLength(2);
    const s1 = curves.find((c) => c.sessionId === 's1')!;
    expect(s1.points.map((p) => p.ts)).toEqual([200, 300]);
    expect(s1.maxSeverity).toBe(1);
    const s2 = curves.find((c) => c.sessionId === 's2')!;
    expect(s2.degradedCount).toBe(1);
  });

  it('severity 取单事件信号最大值', () => {
    const curves = buildOffsetCurves([
      buildAuditEvent({
        ...baseEvent,
        signals: [
          { kind: 'loop', severity: 0.5, score: 3, evidence: 'a' },
          { kind: 'policy', severity: 1, score: 1, evidence: 'b' },
        ],
      }),
    ]);
    expect(curves[0]!.maxSeverity).toBe(1);
  });
});
