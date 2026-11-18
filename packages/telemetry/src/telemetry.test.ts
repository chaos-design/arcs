import { describe, expect, it } from 'vitest';
import {
  auditEventSchema,
  buildAuditEvent,
  buildDashboardModel,
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

describe('InMemorySink 容量上限（11 号计划加固）', () => {
  it('设置 maxEvents 后 FIFO 逐出最旧事件；缺省保持无上限', () => {
    const capped = new InMemorySink(3);
    for (let i = 0; i < 5; i++) {
      capped.emit(buildAuditEvent({ ts: i, sessionId: 's', host: 'codex', level: null, signals: [], effects: [], latencyMs: 1, degraded: false }));
    }
    expect(capped.events).toHaveLength(3);
    expect(capped.events.map((e) => e.ts)).toEqual([2, 3, 4]);

    const uncapped = new InMemorySink();
    for (let i = 0; i < 5; i++) {
      uncapped.emit(buildAuditEvent({ ts: i, sessionId: 's', host: 'codex', level: null, signals: [], effects: [], latencyMs: 1, degraded: false }));
    }
    expect(uncapped.events).toHaveLength(5);
  });
});

describe('buildDashboardModel 面板聚合（P5 · 11 号计划）', () => {
  const ev = (over: Partial<Parameters<typeof buildAuditEvent>[0]> & { ts: number; sessionId: string }) =>
    buildAuditEvent({
      host: 'codex',
      level: null,
      signals: [],
      effects: [],
      latencyMs: 1,
      degraded: false,
      ...over,
    } as never);

  it('聚合：事件/会话计数、等级直方图、HITL 三分支、放行占比、收敛判定', () => {
    const sig = (sev: number) => [{ kind: 'loop' as const, severity: sev, score: sev, evidence: 'x' }];
    const events = [
      ev({ ts: 1, sessionId: 'a', signals: sig(0.6), level: 1 }),
      ev({ ts: 2, sessionId: 'a', signals: sig(0.8), level: 2 }),
      ev({ ts: 3, sessionId: 'a', signals: sig(0.5), level: null }),
      ev({ ts: 4, sessionId: 'a', signals: sig(0.3), level: null }),
      ev({ ts: 5, sessionId: 'a', signals: sig(0.2), level: null }),
      ev({ ts: 6, sessionId: 'b', signals: sig(0.9), level: 4, hitl: { approved: true, timeout: false } }),
      ev({ ts: 7, sessionId: 'b', degraded: true }),
    ];
    const model = buildDashboardModel(events);
    expect(model.eventCount).toBe(7);
    expect(model.sessionCount).toBe(2);
    expect(model.degradedCount).toBe(1);
    expect(model.hostCounts).toEqual({ codex: 7 });
    expect(model.levelCounts).toEqual({ '1': 1, '2': 1, '3': 0, '4': 1, null: 4 });
    expect(model.hitl).toEqual({ asked: 1, approved: 1, rejected: 0, timeout: 0 });
    expect(model.passThroughRatio).toBeCloseTo(4 / 7);
    expect(model.timeRange).toEqual({ first: 1, last: 7 });

    const a = model.sessions.find((s) => s.sessionId === 'a')!;
    expect(a.converging).toBe(true); // 尾段均值 0.333 < 首段均值 0.633
    expect(a.curve.maxSeverity).toBe(0.8);
    const b = model.sessions.find((s) => s.sessionId === 'b')!;
    expect(b.converging).toBe(false);
  });

  it('空事件流：零值模型不抛错', () => {
    const model = buildDashboardModel([]);
    expect(model.eventCount).toBe(0);
    expect(model.sessionCount).toBe(0);
    expect(model.passThroughRatio).toBe(0);
    expect(model.timeRange.first).toBeNull();
  });
});
