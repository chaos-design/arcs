import type { AuditEvent } from './audit.js';

export interface CurvePoint {
  ts: number;
  severity: number;
  level: 1 | 2 | 3 | 4 | null;
  degraded: boolean;
}

export interface OffsetCurve {
  sessionId: string;
  points: CurvePoint[];
  maxSeverity: number;
  degradedCount: number;
}

/**
 * 偏移曲线（Steering Arc 曲线）：按 sessionId 聚合 severity 时序，
 * 回答「是否收敛 / 是否过舵」（docs/telemetry.md）。
 */
export function buildOffsetCurves(events: AuditEvent[]): OffsetCurve[] {
  const bySession = new Map<string, AuditEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.sessionId);
    if (list) list.push(e);
    else bySession.set(e.sessionId, [e]);
  }

  const curves: OffsetCurve[] = [];
  for (const [sessionId, list] of bySession) {
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    const points = sorted.map((e) => ({
      ts: e.ts,
      severity: e.signals.reduce((max, s) => Math.max(max, s.severity), 0),
      level: e.level,
      degraded: e.degraded,
    }));
    curves.push({
      sessionId,
      points,
      maxSeverity: points.reduce((max, p) => Math.max(max, p.severity), 0),
      degradedCount: points.filter((p) => p.degraded).length,
    });
  }
  return curves;
}
