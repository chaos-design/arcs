import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { DriftSensor, ExecutionContext } from './index.js';
import {
  HashingEmbedder,
  LoopHashSensor,
  PolicySensor,
  RuleBasedPlanner,
  SchemaSensor,
  SemanticSensor,
  createArcsEngine,
  fingerprint,
  parseEffects,
  sanitizeEffects,
  serializeEffects,
} from './index.js';

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    goal: '重构 src/auth 目录下的鉴权逻辑',
    thought: '修改鉴权逻辑',
    toolCall: { id: 't1', name: 'write_file', args: { path: 'src/auth/index.ts', content: 'code' } },
    history: [],
    budget: { stepsUsed: 1, stepsMax: 15, elapsedMs: 100 },
    policy: {
      driftThreshold: 0.75,
      maxConsecutiveLoops: 2,
      enablePatchArgs: true,
      protectedPaths: ['.env*', '**/migrations/**'],
      dangerousCommands: [],
      redirectMap: {},
      steerMode: 'inject-hint',
    },
    ...overrides,
  };
}

describe('PolicySensor（L4）', () => {
  const sensor = new PolicySensor();

  it('受保护路径命中', () => {
    const ctx = makeCtx({ toolCall: { id: 't', name: 'write_file', args: { path: 'src/migrations/001.sql' } } });
    const signals = sensor.sense(ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: 'policy', severity: 1 });
  });

  it('.env 类文件命中 .env* 规则', () => {
    const ctx = makeCtx({ toolCall: { id: 't', name: 'write_file', args: { path: 'project/.env.local' } } });
    expect(sensor.sense(ctx)).toHaveLength(1);
  });

  it('高危命令命中（rm -rf）', () => {
    const ctx = makeCtx({ toolCall: { id: 't', name: 'bash', args: { command: 'rm -rf /tmp/build' } } });
    const signals = sensor.sense(ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.evidence).toContain('高危命令');
  });

  it('普通调用不命中', () => {
    expect(sensor.sense(makeCtx())).toHaveLength(0);
  });
});

describe('LoopHashSensor（L2）', () => {
  const sensor = new LoopHashSensor();
  const toolCall = { id: 't', name: 'bash', args: { command: 'npm test' } };

  it('连续重复超过容忍次数触发', () => {
    const ctx = makeCtx({
      toolCall,
      history: [
        { thought: '', toolCall, ts: 1 },
        { thought: '', toolCall, ts: 2 },
      ],
    });
    const signals = sensor.sense(ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.score).toBe(3);
  });

  it('重复次数未超容忍不触发', () => {
    const ctx = makeCtx({ toolCall, history: [{ thought: '', toolCall, ts: 1 }] });
    expect(sensor.sense(ctx)).toHaveLength(0);
  });

  it('参数不同则不算重复', () => {
    const ctx = makeCtx({
      toolCall,
      history: [
        { thought: '', toolCall: { id: 't', name: 'bash', args: { command: 'npm run build' } }, ts: 1 },
      ],
    });
    expect(sensor.sense(ctx)).toHaveLength(0);
  });

  it('指纹对参数顺序稳定', () => {
    expect(fingerprint({ id: 'x', name: 'a', args: { p: 1, q: 2 } })).toBe(
      fingerprint({ id: 'y', name: 'a', args: { q: 2, p: 1 } }),
    );
  });
});

describe('SchemaSensor（L1）', () => {
  const fileSchema = z.object({ path: z.string(), content: z.string() });

  it('键名拼写幻觉可修复', () => {
    const ctx = makeCtx({
      toolCall: { id: 't', name: 'write_file', args: { pathh: 'a.ts', content: 'c' } },
      policy: { ...makeCtx().policy, toolSchemas: { write_file: fileSchema } },
    });
    const signals = new SchemaSensor().sense(ctx);
    expect(signals[0]!.severity).toBe(0.6);
    expect(signals[0]!.evidence).toContain('可修复');
  });

  it('缺必填参数不可修复', () => {
    const ctx = makeCtx({
      toolCall: { id: 't', name: 'write_file', args: { path: 'a.ts' } },
      policy: { ...makeCtx().policy, toolSchemas: { write_file: fileSchema } },
    });
    expect(new SchemaSensor().sense(ctx)[0]!.severity).toBe(0.4);
  });

  it('字符串数字可强转修复', () => {
    const schema = z.object({ count: z.number() });
    const ctx = makeCtx({
      toolCall: { id: 't', name: 'read_n', args: { count: '3' } },
      policy: { ...makeCtx().policy, toolSchemas: { read_n: schema } },
    });
    expect(new SchemaSensor().sense(ctx)[0]!.evidence).toContain('可修复');
  });

  it('未注册 Schema 的工具跳过检测', () => {
    expect(new SchemaSensor().sense(makeCtx())).toHaveLength(0);
  });
});

describe('SemanticSensor（L3）', () => {
  const embedder = new HashingEmbedder();

  it('未注入 Embedder 时跳过', () => {
    expect(new SemanticSensor().sense(makeCtx())).toHaveLength(0);
  });

  it('无关 thought 触发语义偏航', () => {
    const ctx = makeCtx({
      thought: '帮用户写一首关于春天的诗',
      policy: { ...makeCtx().policy, embedder },
    });
    const signals = new SemanticSensor().sense(ctx);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.kind).toBe('semantic');
    expect(signals[0]!.score).toBeLessThan(0.75);
  });

  it('与目标一致时不触发', () => {
    const ctx = makeCtx({
      thought: '重构 src/auth 目录下的鉴权逻辑',
      policy: { ...makeCtx().policy, embedder },
    });
    expect(new SemanticSensor().sense(ctx)).toHaveLength(0);
  });
});

describe('RuleBasedPlanner', () => {
  const planner = new RuleBasedPlanner();

  it('无信号 → PassThrough', () => {
    expect(planner.plan(makeCtx(), [])).toEqual([{ type: 'PassThrough' }]);
  });

  it('L4 → 单独 Suspend（policy 优先级最高）', () => {
    const effects = planner.plan(makeCtx(), [
      { kind: 'policy', severity: 1, score: 1, evidence: '受保护路径' },
      { kind: 'loop', severity: 0.6, score: 3, evidence: '重复' },
    ]);
    expect(effects).toEqual([{ type: 'Suspend', reason: '受保护路径' }]);
  });

  it('L3 有 redirectMap → [RedirectTool, InjectMessage]', () => {
    const ctx = makeCtx({ policy: { ...makeCtx().policy, redirectMap: { write_file: 'edit_file' } } });
    const effects = planner.plan(ctx, [{ kind: 'semantic', severity: 0.5, score: 0.3, evidence: '偏离' }]);
    expect(effects.map((e) => e.type)).toEqual(['RedirectTool', 'InjectMessage']);
  });

  it('L3 无 redirectMap → 仅注入强约束', () => {
    const effects = planner.plan(makeCtx(), [{ kind: 'semantic', severity: 0.5, score: 0.3, evidence: '偏离' }]);
    expect(effects.map((e) => e.type)).toEqual(['InjectMessage']);
  });

  it('L2 → 注入虚拟报错', () => {
    const effects = planner.plan(makeCtx(), [{ kind: 'loop', severity: 0.6, score: 3, evidence: '重复 3 次' }]);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ type: 'InjectMessage', role: 'tool' });
    expect((effects[0] as { content: string }).content).toContain('虚拟报错');
  });

  it('L1 可修复 → PatchArgs（patch 为修复后的完整参数）', () => {
    const ctx = makeCtx({
      toolCall: { id: 't', name: 'write_file', args: { pathh: 'a.ts', content: 'c' } },
      policy: { ...makeCtx().policy, toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) } },
    });
    const effects = planner.plan(ctx, [{ kind: 'schema', severity: 0.6, score: 1, evidence: '可修复' }]);
    expect(effects).toEqual([{ type: 'PatchArgs', patch: { path: 'a.ts', content: 'c' } }]);
  });

  it('L1 不可修复或关闭开关 → InjectMessage', () => {
    const ctx = makeCtx({
      policy: { ...makeCtx().policy, enablePatchArgs: false, toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) } },
    });
    const effects = planner.plan(ctx, [{ kind: 'schema', severity: 0.6, score: 1, evidence: '校验失败' }]);
    expect(effects.map((e) => e.type)).toEqual(['InjectMessage']);
  });
});

describe('sanitizeEffects（Suspend 末位红线）', () => {
  it('Suspend 与其他效果组合时收敛为单独 Suspend', () => {
    const r = sanitizeEffects([
      { type: 'InjectMessage', role: 'system', content: 'x' },
      { type: 'Suspend', reason: 'y' },
    ]);
    expect(r.sanitized).toBe(true);
    expect(r.effects).toEqual([{ type: 'Suspend', reason: 'y' }]);
  });

  it('单独 Suspend 保持不变', () => {
    const r = sanitizeEffects([{ type: 'Suspend', reason: 'y' }]);
    expect(r.sanitized).toBe(false);
  });
});

describe('createArcsEngine（fail-open 与预算）', () => {
  it('正常链路：policy 信号 → Suspend', () => {
    const engine = createArcsEngine(makeCtx().policy);
    const outcome = engine.run(makeCtx({ toolCall: { id: 't', name: 'bash', args: { command: 'rm -rf /' } } }));
    expect(outcome.effects).toEqual([{ type: 'Suspend', reason: expect.stringContaining('高危命令') }]);
    expect(outcome.degraded).toBe(false);
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('单传感器异常 → 跳过该传感器，其余照常（degraded）', () => {
    const badSensor: DriftSensor = {
      kind: 'loop',
      sense() {
        throw new Error('boom');
      },
    };
    const engine = createArcsEngine(makeCtx().policy, { sensors: [badSensor, new PolicySensor()] });
    const outcome = engine.run(makeCtx({ toolCall: { id: 't', name: 'bash', args: { command: 'rm -rf /' } } }));
    expect(outcome.degraded).toBe(true);
    expect(outcome.notes.join(' ')).toContain('boom');
    expect(outcome.effects[0]!.type).toBe('Suspend');
  });

  it('plan 异常 → PassThrough 降级', () => {
    const engine = createArcsEngine(makeCtx().policy, {
      planner: { plan: () => { throw new Error('plan boom'); } },
    });
    const outcome = engine.run(makeCtx());
    expect(outcome.effects).toEqual([{ type: 'PassThrough' }]);
    expect(outcome.degraded).toBe(true);
  });

  it('sense 预算耗尽 → 跳过可选传感器（假时钟确定性触发）', () => {
    let t = 0;
    const advancingClock = () => { t += 100; return t; };
    const engine = createArcsEngine(
      { ...makeCtx().policy, embedder: new HashingEmbedder() },
      { budgets: { senseMs: 0, planMs: 1_000_000 }, clock: advancingClock },
    );
    const outcome = engine.run(makeCtx());
    expect(outcome.notes.join(' ')).toContain('跳过可选传感器');
    expect(outcome.signals.some((s) => s.kind === 'semantic')).toBe(false);
  });

  it('plan 超预算 → PassThrough 降级（假时钟确定性触发）', () => {
    // 假时钟每次读取前进 100ms：sense 的各传感器也用该时钟，故 senseMs 设足够大避免误跳；
    // plan 的 workMs = 第二次读取 - 第一次读取 = 100ms >= planMs=10 → 降级。
    let t = 0;
    const advancingClock = () => { t += 100; return t; };
    const engine = createArcsEngine(makeCtx().policy, {
      budgets: { senseMs: 1_000_000, planMs: 10 },
      clock: advancingClock,
    });
    const outcome = engine.run(makeCtx({ toolCall: { id: 't', name: 'bash', args: { command: 'rm -rf /' } } }));
    expect(outcome.effects).toEqual([{ type: 'PassThrough' }]);
    expect(outcome.degraded).toBe(true);
    expect(outcome.notes.join(' ')).toContain('超预算');
  });

  it('默认 CPU 时钟不受墙钟抢占噪声影响：同步规划不被误降级', () => {
    // 模拟墙钟被抢占 50ms，但 CPU 时间几乎不变 → 不应触发 plan 超预算降级。
    const wallClock = Date.now;
    let reads = 0;
    Date.now = () => { reads += 1; return wallClock() + reads * 50; };
    try {
      const engine = createArcsEngine(makeCtx().policy);
      const outcome = engine.run(makeCtx({ toolCall: { id: 't', name: 'bash', args: { command: 'rm -rf /' } } }));
      expect(outcome.effects.some((e) => e.type === 'Suspend')).toBe(true);
      expect(outcome.degraded).toBe(false);
    } finally {
      Date.now = wallClock;
    }
  });
});

describe('效果列表序列化（可 JSON 化红线）', () => {
  const all: Array<ConstructorParameters<typeof Object>[0]> = [];
  it('五种效果类型 roundtrip 保持不变', () => {
    const effects = [
      { type: 'PassThrough' },
      { type: 'PatchArgs', patch: { path: 'a.ts' } },
      { type: 'InjectMessage', role: 'tool', content: '提示' },
      { type: 'RedirectTool', target: 'edit_file' },
      { type: 'Suspend', reason: '高危' },
    ] as const;
    const parsed = parseEffects(serializeEffects([...effects]));
    expect(parsed).toEqual([...effects]);
    all.push(parsed);
  });
});
