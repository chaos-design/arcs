import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '@chaos-design/arcs-telemetry';
import {
  parseAuditJsonl,
  renderHtml,
  renderTerminal,
  sessionSvg,
  sparkline,
} from './offset-dashboard.mjs';

/** 手工构造的最小 DashboardModel（与 telemetry/buildDashboardModel 输出结构一致，测试不依赖 dist） */
function makeModel(overrides: Partial<typeof base> = {}) {
  const base = {
    eventCount: 3,
    sessionCount: 1,
    degradedCount: 0,
    hostCounts: { chatgpt: 3 },
    levelCounts: { '1': 1, '2': 0, '3': 0, '4': 0, null: 2 },
    hitl: { asked: 0, approved: 0, rejected: 0, timeout: 0 },
    passThroughRatio: 2 / 3,
    timeRange: { first: 1, last: 3 },
    sessions: [
      {
        sessionId: 'sess-a',
        host: 'chatgpt',
        eventCount: 3,
        curve: {
          sessionId: 'sess-a',
          points: [
            { ts: 1, severity: 0.9, level: 1, degraded: false },
            { ts: 2, severity: 0.4, level: null, degraded: false },
            { ts: 3, severity: 0.1, level: null, degraded: false },
          ],
          maxSeverity: 0.9,
          degradedCount: 0,
        },
        levelCounts: { '1': 1, '2': 0, '3': 0, '4': 0, null: 2 },
        converging: true,
        lastTs: 3,
      },
    ],
  };
  return { ...base, ...overrides };
}

describe('parseAuditJsonl', () => {
  it('解析合法行、跳过损坏行并计数', () => {
    const good = JSON.stringify({ ts: 1, sessionId: 'a', host: 'chatgpt', level: null, signals: [], effects: [], latencyMs: 0, degraded: false });
    const { events, skipped } = parseAuditJsonl(`${good}\nnot-json\n{}\n\n${good}\n`, 'f.jsonl');
    expect(events).toHaveLength(2);
    expect(skipped).toBe(2);
  });
});

describe('sparkline', () => {
  it('severity 0–1 映射到 8 级块字符', () => {
    expect(sparkline([0, 0.5, 1])).toBe('▁▅█');
  });
});

describe('renderTerminal', () => {
  it('输出总计与会话 sparkline 行（收敛标记 + 等级分布）', () => {
    const text = renderTerminal(makeModel(), { limit: 20 });
    expect(text).toContain('ARCS 偏移曲线面板');
    expect(text).toContain('事件 3');
    expect(text).toContain('sess-a');
    expect(text).toContain('▇▄▂'); // severity 0.9/0.4/0.1 的精确映射
    expect(text).toContain('✓收敛');
    expect(text).toContain('L1 补参:1');
  });

  it('空模型给出友好提示而非空输出', () => {
    const text = renderTerminal(makeModel({ sessions: [], sessionCount: 0, eventCount: 0 }));
    expect(text).toContain('无会话数据');
  });
});

describe('renderHtml', () => {
  it('生成自包含 HTML：内联 SVG polyline + 统计卡片，无外部资源引用', () => {
    const html = renderHtml(makeModel());
    expect(html).toContain('<svg');
    expect(html).toContain('<polyline');
    expect(html).toContain('sess-a');
    expect(html).toContain('✓ 收敛');
    expect(html).not.toMatch(/(src|href)\s*=\s*["']https?:/); // 零外部资源
    expect(html).toContain('放行占比');
  });

  it('对含特殊字符的 sessionId 做转义', () => {
    const model = makeModel();
    model.sessions[0]!.sessionId = '<script>alert(1)</script>';
    const html = renderHtml(model);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('sessionSvg', () => {
  it('降级点以红色圆点标注；无点时输出空图不抛错', () => {
    const model = makeModel();
    model.sessions[0]!.curve.points[1]!.degraded = true;
    const svg = sessionSvg(model.sessions[0]!);
    expect(svg).toContain('circle');
    expect(svg).toContain('fill="#f87171"');
    const empty = makeModel({
      sessions: [{ ...model.sessions[0]!, curve: { ...model.sessions[0]!.curve, points: [] } }],
    });
    expect(sessionSvg(empty.sessions[0]!)).toContain('<svg');
  });
});

// 类型引用（仅类型层面，运行时为 .mjs 导入）
void (0 as unknown as AuditEvent | undefined);
