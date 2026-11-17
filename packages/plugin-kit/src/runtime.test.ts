import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HashingEmbedder, type SteeringEffect } from '@chaos-design/arcs-core';
import { InMemorySink } from '@chaos-design/arcs-telemetry';
import type { ExecutionContext, RawEvent } from './index.js';
import {
  MockHitlTransport,
  MockHostAdapter,
  PluginRuntime,
  ReplayHarness,
  SessionStore,
  effectLevel,
  resolveConfig,
} from './index.js';

function makeRaw(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    host: 'codex',
    type: 'tool-call',
    sessionId: 's1',
    timestamp: Date.now(),
    payload: {
      goal: '重构 src/auth 目录下的鉴权逻辑',
      thought: '修改鉴权逻辑',
      toolCall: { id: 't1', name: 'write_file', args: { path: 'src/auth/index.ts', content: 'code' } },
    },
    ...overrides,
  };
}

function makeRuntime(opts: Parameters<typeof makeRuntimeHelpers>[0]) {
  return makeRuntimeHelpers(opts);
}

function makeRuntimeHelpers(opts: {
  policy?: Record<string, unknown>;
  host?: Record<string, unknown>;
  hitl?: MockHitlTransport;
  sink?: InMemorySink;
}) {
  const adapter = new MockHostAdapter();
  const sink = opts.sink ?? new InMemorySink();
  const hitl = opts.hitl ?? new MockHitlTransport();
  const runtime = new PluginRuntime(adapter, {
    policy: opts.policy as never,
    host: opts.host as never,
    hitl,
    sink,
  });
  return { adapter, sink, hitl, runtime };
}

describe('配置三级优先级', () => {
  it('内置默认 < Policy < 宿主配置', () => {
    const cfg = resolveConfig({ driftThreshold: 0.9 }, { driftThreshold: 0.5 });
    expect(cfg.driftThreshold).toBe(0.5);
    expect(cfg.maxConsecutiveLoops).toBe(2); // 未覆盖时用内置默认
    expect(cfg.sessionTtlMs).toBe(1_800_000);
    expect(cfg.protectedPaths).toEqual(['.env*', '**/migrations/**']);
  });

  it('undefined 不覆盖下层', () => {
    const cfg = resolveConfig({ maxConsecutiveLoops: 4 }, { maxConsecutiveLoops: undefined });
    expect(cfg.maxConsecutiveLoops).toBe(4);
  });
});

describe('L1 参数畸变：PatchArgs 全链', () => {
  it('键名幻觉被自动热修复，审计 level=1', async () => {
    const { runtime, adapter, sink } = makeRuntime({
      policy: { toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) } },
    });
    const raw = makeRaw({
      payload: {
        goal: 'g', thought: 't',
        toolCall: { id: 't', name: 'write_file', args: { pathh: 'a.ts', content: 'c' } },
      },
    });
    const outcome = await runtime.run(raw);
    expect(outcome.effects).toEqual([{ type: 'PatchArgs', patch: { path: 'a.ts', content: 'c' } }]);
    expect(outcome.degraded).toBe(false);
    expect(adapter.materialized[0]!.effect.type).toBe('PatchArgs');
    expect(sink.events[0]!.level).toBe(1);
    expect(sink.events[0]!.sessionId).toBe('s1');
  });
});

describe('L2 死循环：InjectMessage', () => {
  it('连续第 3 次重复触发虚拟报错', async () => {
    const { runtime, sink } = makeRuntime({});
    const raw = makeRaw({
      payload: {
        goal: 'g', thought: 't',
        toolCall: { id: 't', name: 'bash', args: { command: 'npm test' } },
        outcome: 'error',
      },
    });
    const o1 = await runtime.run(raw);
    const o2 = await runtime.run({ ...raw, timestamp: raw.timestamp + 1 });
    const o3 = await runtime.run({ ...raw, timestamp: raw.timestamp + 2 });
    expect(o1.effects[0]!.type).toBe('PassThrough');
    expect(o2.effects[0]!.type).toBe('PassThrough');
    expect(o3.effects[0]!.type).toBe('InjectMessage');
    expect(sink.events).toHaveLength(3);
    expect(sink.events[2]!.level).toBe(2);
  });
});

describe('L3 任务发散：RedirectTool + InjectMessage', () => {
  it('redirectMap 命中时改道并注入', async () => {
    const { runtime, adapter } = makeRuntime({
      policy: { embedder: new HashingEmbedder(), redirectMap: { write_file: 'edit_file' } },
    });
    const outcome = await runtime.run(makeRaw({
      payload: {
        goal: '重构 src/auth 目录下的鉴权逻辑',
        thought: '帮用户写一首关于春天的诗',
        toolCall: { id: 't', name: 'write_file', args: { path: 'x.txt', content: 'poem' } },
      },
    }));
    expect(outcome.effects.map((e: SteeringEffect) => e.type)).toEqual(['RedirectTool', 'InjectMessage']);
    expect(adapter.materialized.map((m) => m.effect.type)).toEqual(['RedirectTool', 'InjectMessage']);
  });
});

describe('L4 高危越权：Suspend + HITL 三分支', () => {
  const dangerousRaw = () =>
    makeRaw({
      payload: {
        goal: 'g', thought: 't',
        toolCall: { id: 't', name: 'bash', args: { command: 'rm -rf /tmp/x' } },
      },
    });

  it('审批通过 → 放行原动作（applied=true）', async () => {
    const hitl = new MockHitlTransport(['approve']);
    const { runtime, adapter } = makeRuntime({ hitl });
    const outcome = await runtime.run(dangerousRaw());
    expect(outcome.effects).toEqual([{ type: 'Suspend', reason: expect.stringContaining('高危命令') }]);
    expect(adapter.materialized[0]!.result).toEqual({ applied: true });
    expect(hitl.requests).toHaveLength(1);
  });

  it('审批拒绝 → 阻断原动作（applied=false）', async () => {
    const hitl = new MockHitlTransport(['reject']);
    const { runtime, adapter } = makeRuntime({ hitl });
    await runtime.run(dangerousRaw());
    expect(adapter.materialized[0]!.result).toEqual({ applied: false, reason: 'HITL 拒绝' });
  });

  it('审批超时 → 同拒绝处理；脚本耗尽默认超时拒绝', async () => {
    const hitl = new MockHitlTransport(['timeout']);
    const { runtime, adapter } = makeRuntime({ hitl });
    await runtime.run(dangerousRaw());
    expect(adapter.materialized[0]!.result.applied).toBe(false);

    const hitlEmpty = new MockHitlTransport();
    const r2 = makeRuntime({ hitl: hitlEmpty });
    await r2.runtime.run(dangerousRaw());
    expect(r2.adapter.materialized[0]!.result.applied).toBe(false);
  });
});

describe('fail-open 兜底', () => {
  it('RawEvent 校验失败 → degraded PassThrough', async () => {
    const { runtime, sink } = makeRuntime({});
    const outcome = await runtime.run({ host: '', type: 'tool-call', sessionId: '', timestamp: 0, payload: null } as RawEvent);
    expect(outcome.effects).toEqual([{ type: 'PassThrough' }]);
    expect(outcome.degraded).toBe(true);
    expect(sink.events[0]!.degraded).toBe(true);
    expect(sink.events[0]!.sessionId).toBe('invalid');
  });

  it('normalize 抛异常 → degraded PassThrough，不外抛', async () => {
    const adapter = new MockHostAdapter({ normalize: () => { throw new Error('normalize boom'); } });
    const runtime = new PluginRuntime(adapter, { sink: new InMemorySink(), hitl: new MockHitlTransport() });
    const outcome = await runtime.run(makeRaw());
    expect(outcome.effects).toEqual([{ type: 'PassThrough' }]);
    expect(outcome.degraded).toBe(true);
  });

  it('materialize 抛异常 → 放行原始调用并标记 degraded', async () => {
    const adapter = new MockHostAdapter({
      onMaterialize: () => { throw new Error('materialize boom'); },
    });
    const sink = new InMemorySink();
    const runtime = new PluginRuntime(adapter, {
      sink,
      hitl: new MockHitlTransport(),
      policy: { toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) } },
    });
    const outcome = await runtime.run(makeRaw({
      payload: { goal: 'g', thought: 't', toolCall: { id: 't', name: 'write_file', args: { pathh: 'a.ts', content: 'c' } } },
    }));
    expect(outcome.effects[0]!.type).toBe('PatchArgs');
    expect(outcome.degraded).toBe(true);
    expect(sink.events[0]!.degraded).toBe(true);
  });

  it('sink.emit 抛异常 → 静默忽略，主链不受影响', async () => {
    const badSink = { emit: () => { throw new Error('sink boom'); } };
    const runtime = new PluginRuntime(new MockHostAdapter(), {
      sink: badSink,
      hitl: new MockHitlTransport(),
    });
    const outcome = await runtime.run(makeRaw());
    expect(outcome.degraded).toBe(false);
  });
});

describe('SessionStore（TTL 与环形缓冲）', () => {
  it('TTL 空转回收', () => {
    const store = new SessionStore({ ttlMs: 100, loopWindowMax: 8, historyMax: 20, stepsMax: 15 });
    store.touch('a', 0);
    store.touch('b', 0);
    expect(store.sweep(50)).toBe(0);
    expect(store.sweep(101)).toBe(2);
    expect(store.size).toBe(0);
  });

  it('history / loopWindow 超容量截断', () => {
    const store = new SessionStore({ ttlMs: 1_000_000, loopWindowMax: 3, historyMax: 3, stepsMax: 15 });
    const state = store.touch('a', 0);
    for (let i = 0; i < 5; i++) {
      store.record(state, 't', { id: String(i), name: 'n', args: { i } }, i);
    }
    expect(state.history).toHaveLength(3);
    expect(state.loopWindow).toHaveLength(3);
    expect(state.history[0]!.ts).toBe(2);
    expect(state.budget.stepsUsed).toBe(5);
  });
});

describe('effectLevel 与 setup 注入', () => {
  it('效果类型 → 等级映射', () => {
    expect(effectLevel([{ type: 'Suspend', reason: 'r' }])).toBe(4);
    expect(effectLevel([{ type: 'RedirectTool', target: 't' }])).toBe(3);
    expect(effectLevel([{ type: 'InjectMessage', role: 'tool', content: 'c' }])).toBe(2);
    expect(effectLevel([{ type: 'PatchArgs', patch: {} }])).toBe(1);
    expect(effectLevel([{ type: 'PassThrough' }])).toBe(null);
  });

  it('runtime 初始化时向 adapter 注入 hitl 与最终配置', async () => {
    const { runtime, adapter, hitl } = makeRuntime({ policy: { driftThreshold: 0.5 } });
    await runtime.run(makeRaw());
    expect(adapter.handles).toBeDefined();
    expect(adapter.handles!.config.driftThreshold).toBe(0.5);
    expect(adapter.handles!.hitl).toBe(hitl);
    expect(runtime.getConfig()!.driftThreshold).toBe(0.5);
  });

  it('normalize 得到的 ctx 携带最终 Policy（历史由 runtime 注入）', async () => {
    const seen: ExecutionContext[] = [];
    const adapter = new MockHostAdapter({ normalize: (raw, handles) => {
      const p = raw.payload as { goal: string; thought: string; toolCall: never };
      const ctx: ExecutionContext = {
        goal: p.goal, thought: p.thought, toolCall: p.toolCall,
        history: [], budget: { stepsUsed: 0, stepsMax: 15, elapsedMs: 0 },
        policy: {
          driftThreshold: handles.config.driftThreshold, maxConsecutiveLoops: handles.config.maxConsecutiveLoops,
          enablePatchArgs: handles.config.enablePatchArgs, protectedPaths: handles.config.protectedPaths,
          dangerousCommands: handles.config.dangerousCommands, redirectMap: handles.config.redirectMap,
          steerMode: handles.config.steerMode,
        },
      };
      seen.push(ctx);
      return ctx;
    } });
    const runtime = new PluginRuntime(adapter, { sink: new InMemorySink(), hitl: new MockHitlTransport() });
    await runtime.run(makeRaw());
    // 历史注入为「既往事件」快照：首次运行历史为空；第二次运行可见第一次的调用
    expect(adapter.materialized[0]!.ctx.history).toHaveLength(0);
    expect(seen[0]!.policy.driftThreshold).toBe(0.75);
    await runtime.run(makeRaw({ timestamp: Date.now() + 1 }));
    expect(adapter.materialized[1]!.ctx.history).toHaveLength(1);
    expect(adapter.materialized[1]!.ctx.budget.stepsUsed).toBe(1);
  });
});

describe('ReplayHarness 回放仿真（docs/testing.md 第二层）', () => {
  it('四类对抗轨迹：L1→PatchArgs、L2→InjectMessage、L3→改道+注入、L4→Suspend', async () => {
    const { runtime } = makeRuntime({
      policy: {
        toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) },
        embedder: new HashingEmbedder(),
        redirectMap: { write_file: 'edit_file' },
      },
      hitl: new MockHitlTransport(['approve']),
    });
    const harness = new ReplayHarness(runtime);
    const aligned = { goal: '重构 src/auth 鉴权', thought: '重构 src/auth 鉴权' };
    const outcomes = await harness.replay([
      // L1 参数幻觉
      makeRaw({ sessionId: 'l1', payload: { ...aligned, toolCall: { id: '1', name: 'write_file', args: { pathh: 'a.ts', content: 'c' } } } }),
      // L2 死循环（第 3 次触发）
      makeRaw({ sessionId: 'l2', payload: { ...aligned, toolCall: { id: '2', name: 'bash', args: { command: 'npm test' } }, outcome: 'error' } }),
      makeRaw({ sessionId: 'l2', timestamp: 2, payload: { ...aligned, toolCall: { id: '2', name: 'bash', args: { command: 'npm test' } }, outcome: 'error' } }),
      makeRaw({ sessionId: 'l2', timestamp: 3, payload: { ...aligned, toolCall: { id: '2', name: 'bash', args: { command: 'npm test' } }, outcome: 'error' } }),
      // L3 任务发散
      makeRaw({ sessionId: 'l3', payload: { goal: '重构 src/auth 鉴权', thought: '帮用户写一首关于春天的诗', toolCall: { id: '3', name: 'write_file', args: { path: 'poem.txt', content: 'x' } } } }),
      // L4 高危越权
      makeRaw({ sessionId: 'l4', payload: { ...aligned, toolCall: { id: '4', name: 'bash', args: { command: 'rm -rf /tmp/x' } } } }),
    ]);

    expect(outcomes[0]!.effects[0]!.type).toBe('PatchArgs');
    expect(outcomes[1]!.effects[0]!.type).toBe('PassThrough');
    expect(outcomes[2]!.effects[0]!.type).toBe('PassThrough');
    expect(outcomes[3]!.effects[0]!.type).toBe('InjectMessage');
    expect(outcomes[4]!.effects.map((e) => e.type)).toEqual(['RedirectTool', 'InjectMessage']);
    expect(outcomes[5]!.effects[0]!.type).toBe('Suspend');
  });

  it('JSONL 解析：跳过空行', () => {
    const line = JSON.stringify(makeRaw());
    const raws = ReplayHarness.parseJsonl(`${line}\n\n${line}`);
    expect(raws).toHaveLength(2);
  });

  it('延迟预算：单次编排 < 50ms', async () => {
    const { runtime } = makeRuntime({ policy: { embedder: new HashingEmbedder() } });
    const outcome = await runtime.run(makeRaw());
    expect(outcome.latencyMs).toBeLessThan(50);
  });
});

describe('初始化失败 fail-open（11 号计划加固）', () => {
  it('adapter.setup 抛错：run 返回降级 PassThrough + 降级审计，不外抛', async () => {
    const adapter = new MockHostAdapter();
    adapter.setup = () => {
      throw new Error('宿主句柄未就绪');
    };
    const sink = new InMemorySink();
    const runtime = new PluginRuntime(adapter, { sink, hitl: new MockHitlTransport() });

    const outcome = await runtime.run(makeRaw());
    expect(outcome.degraded).toBe(true);
    expect(outcome.effects).toEqual([{ type: 'PassThrough' }]);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.degraded).toBe(true);
    expect(sink.events[0]!.level).toBeNull();
    expect(sink.events[0]!.sessionId).toBe('s1');
  });

  it('init 失败重置 initPromise：宿主就绪后下一个事件重试初始化成功', async () => {
    const adapter = new MockHostAdapter();
    const originalSetup = adapter.setup.bind(adapter);
    let failSetup = true;
    adapter.setup = (handles) => {
      if (failSetup) throw new Error('首事件时宿主未就绪');
      originalSetup(handles); // 恢复句柄注入，模拟宿主延迟就绪
    };
    const sink = new InMemorySink();
    const runtime = new PluginRuntime(adapter, { sink, hitl: new MockHitlTransport() });

    const first = await runtime.run(makeRaw());
    expect(first.degraded).toBe(true);

    failSetup = false; // 宿主延迟就绪
    const second = await runtime.run(makeRaw({ timestamp: Date.now() + 1 }));
    expect(second.degraded).toBe(false);
    expect(runtime.getConfig()).toBeDefined();
    expect(sink.events.map((e) => e.degraded)).toEqual([true, false]);
  });

  it('非法宿主配置（zod 校验失败）：降级放行且 start() 订阅链不产生未处理拒绝', async () => {
    const adapter = new MockHostAdapter();
    const sink = new InMemorySink();
    const runtime = new PluginRuntime(adapter, {
      host: { driftThreshold: Number.NaN } as never,
      sink,
      hitl: new MockHitlTransport(),
    });

    runtime.start(); // 订阅模式：回调内异常不允许逃逸为 unhandledRejection
    const notify = adapter.subscribed[0]!;
    const flush = () => new Promise((r) => setImmediate(r)); // 冲刷订阅回调内的 async 链
    await notify(makeRaw());
    await flush();
    await notify(makeRaw({ timestamp: Date.now() + 1 }));
    await flush();

    // 两个事件均 fail-open，且都记了降级审计（init 每次重试均失败）
    expect(sink.events).toHaveLength(2);
    expect(sink.events.every((e) => e.degraded && e.level === null)).toBe(true);
    expect(adapter.raws).toHaveLength(0); // 未进入 normalize，未污染宿主数据
  });
});
