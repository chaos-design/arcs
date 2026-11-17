import type { AuditEvent } from './audit.js';
import { buildOffsetCurves, type OffsetCurve } from './curve.js';

/** 面板级会话摘要：曲线 + 收敛判定（docs/telemetry.md 的两个问题） */
export interface DashboardSession {
  sessionId: string;
  host: string;
  eventCount: number;
  /** 偏移曲线（severity 时序） */
  curve: OffsetCurve;
  /** 纠偏等级直方图：1=补参 2=注入 3=改道 4=阻断，null=放行 */
  levelCounts: { '1': number; '2': number; '3': number; '4': number; null: number };
  /** 收敛判定：最后 3 点 severity 均值 < 首 3 点均值 → true */
  converging: boolean;
  lastTs: number;
}

/** 全局面板模型（纯数据，可 JSON 化，供终端/HTML 渲染器消费） */
export interface DashboardModel {
  eventCount: number;
  sessionCount: number;
  degradedCount: number;
  /** 各宿主事件数 */
  hostCounts: Record<string, number>;
  /** 全局等级直方图（含 null=放行） */
  levelCounts: { '1': number; '2': number; '3': number; '4': number; null: number };
  /** HITL 三分支统计（仅 L4 事件携带；批准/拒绝/超时互斥计数，asked 为总数） */
  hitl: { asked: number; approved: number; rejected: number; timeout: number };
  /** 放行占比（过舵评估：过高=漏检，过低=过舵） */
  passThroughRatio: number;
  timeRange: { first: number | null; last: number | null };
  sessions: DashboardSession[];
}

/**
 * 面板数据模型（纯函数，零 I/O）：从审计事件流构建偏移曲线面板所需的全部聚合。
 * 文件读取由使用方（scripts/offset-dashboard.mjs / 自建面板）完成。
 */
export function buildDashboardModel(events: AuditEvent[]): DashboardModel {
  const hostCounts: Record<string, number> = {};
  const levelCounts = { '1': 0, '2': 0, '3': 0, '4': 0, null: 0 } as DashboardModel['levelCounts'];
  const hitl = { asked: 0, approved: 0, rejected: 0, timeout: 0 };
  let degradedCount = 0;
  let first: number | null = null;
  let last: number | null = null;

  for (const e of events) {
    hostCounts[e.host] = (hostCounts[e.host] ?? 0) + 1;
    levelCounts[String(e.level) as keyof typeof levelCounts] += 1;
    if (e.degraded) degradedCount += 1;
    if (e.hitl) {
      hitl.asked += 1;
      if (e.hitl.approved) hitl.approved += 1;
      else if (e.hitl.timeout) hitl.timeout += 1;
      else hitl.rejected += 1;
    }
    if (first === null || e.ts < first) first = e.ts;
    if (last === null || e.ts > last) last = e.ts;
  }

  const curves = buildOffsetCurves(events);
  const eventsBySession = new Map<string, AuditEvent[]>();
  for (const e of events) {
    const list = eventsBySession.get(e.sessionId);
    if (list) list.push(e);
    else eventsBySession.set(e.sessionId, [e]);
  }

  const sessions: DashboardSession[] = curves.map((curve) => {
    const list = eventsBySession.get(curve.sessionId) ?? [];
    const severities = curve.points.map((p) => p.severity);
    const head = avg(severities.slice(0, 3));
    const tail = avg(severities.slice(-3));
    const levelCountsOf: DashboardSession['levelCounts'] = { '1': 0, '2': 0, '3': 0, '4': 0, null: 0 };
    let host = 'unknown';
    let lastTs = curve.points.length > 0 ? curve.points[curve.points.length - 1]!.ts : 0;
    for (const e of list) {
      levelCountsOf[String(e.level) as keyof typeof levelCountsOf] += 1;
      host = e.host;
      lastTs = e.ts;
    }
    return {
      sessionId: curve.sessionId,
      host,
      eventCount: curve.points.length,
      curve,
      levelCounts: levelCountsOf,
      // 收敛：有足够点位且尾段均值低于首段（含空曲线视为未收敛）
      converging: severities.length >= 3 && tail < head,
      lastTs,
    };
  });

  const eventCount = events.length;
  return {
    eventCount,
    sessionCount: sessions.length,
    degradedCount,
    hostCounts,
    levelCounts,
    hitl,
    passThroughRatio: eventCount === 0 ? 0 : levelCounts.null / eventCount,
    timeRange: { first, last },
    sessions,
  };
}

function avg(list: number[]): number {
  if (list.length === 0) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}
