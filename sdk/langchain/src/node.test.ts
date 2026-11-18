import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HashingEmbedder } from '@chaos-design/arcs-core';
import { createArcsNode } from './index.js';
import type { ArcsNodeState } from './index.js';

const GOAL = '重构 src/auth 目录下的鉴权逻辑';

function makeState(overrides: Partial<ArcsNodeState>): ArcsNodeState {
  return {
    goal: GOAL,
    thought: '修改鉴权逻辑',
    toolCall: { id: 't1', name: 'write_file', args: { path: 'src/auth/index.ts', content: 'code' } },
    history: [],
    ...overrides,
  };
}

describe('createArcsNode（LangGraph 兼容节点）', () => {
  it('无 toolCall → 空输出（透传）', async () => {
    const node = createArcsNode({ goal: GOAL });
    const out = await node({ goal: GOAL, thought: 't' });
    expect(out).toEqual({});
  });

  it('L1：PatchArgs 改写 args，steer.level=1', async () => {
    const node = createArcsNode({
      goal: GOAL,
      policy: { toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) } },
    });
    const out = await node(makeState({ toolCall: { id: 't', name: 'write_file', args: { pathh: 'a.ts', content: 'c' } } }));
    expect(out.toolCall).toEqual({ id: 't', name: 'write_file', args: { path: 'a.ts', content: 'c' } });
    expect(out.inject).toBeUndefined();
    expect(out.steer!.level).toBe(1);
    expect(out.steer!.effects).toEqual([{ type: 'PatchArgs', patch: { path: 'a.ts', content: 'c' } }]);
  });

  it('L2：连续第 3 次 → toolCall 置空 + 注入虚拟报错', async () => {
    const node = createArcsNode({ goal: GOAL });
    const toolCall = { id: 't', name: 'bash', args: { command: 'npm test' } };
    const history = [0, 1].map((i) => ({ thought: 't', toolCall, ts: i, outcome: 'error' as const }));
    const out = await node(makeState({ toolCall, history }));
    expect(out.toolCall).toBeNull();
    expect(out.inject).toContain('ARCS');
    expect(out.steer!.level).toBe(2);
  });

  it('L3：redirectMap 命中 → 改道 toolName（注入跳过）', async () => {
    const node = createArcsNode({
      goal: GOAL,
      policy: { redirectMap: { write_file: 'edit_file' }, embedder: new HashingEmbedder() },
    });
    const out = await node(
      makeState({
        goal: GOAL,
        thought: '帮用户写一首关于春天的诗',
        toolCall: { id: 't', name: 'write_file', args: { path: 'poem.txt', content: 'x' } },
      }),
    );
    expect(out.toolCall).toEqual({ id: 't', name: 'edit_file', args: { path: 'poem.txt', content: 'x' } });
    expect(out.inject).toBeUndefined();
    expect(out.steer!.level).toBe(3);
  });

  it('L4：高危调用 → toolCall 置空 + 阻断提示（节点无 HITL，拒绝语义）', async () => {
    const node = createArcsNode({ goal: GOAL });
    const out = await node(makeState({ toolCall: { id: 't', name: 'bash', args: { command: 'rm -rf /tmp/x' } } }));
    expect(out.toolCall).toBeNull();
    expect(out.inject).toContain('阻断');
    expect(out.steer!.level).toBe(4);
  });

  it('history 超容量截断为最近 20 条且不崩溃', async () => {
    const node = createArcsNode({ goal: GOAL });
    const history = Array.from({ length: 30 }, (_, i) => ({
      thought: 't',
      toolCall: { id: `h${i}`, name: 'n', args: {} },
    }));
    // 安全调用 + 超容量历史 → 正常 PassThrough（截断逻辑不抛错）
    const out = await node(makeState({ history }));
    expect(out).toEqual({});
  });
});
