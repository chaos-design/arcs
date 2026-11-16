import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ExecutionContext } from '@chaos-design/arcs-core';
import { MockHitlTransport, resolveConfig } from '@chaos-design/arcs-plugin-kit';
import { McpAdapter, decideProxyAction, paramsToToolCall } from './index.js';
import { parseCliArgs } from './cli.js';

function makeCtx(): ExecutionContext {
  return {
    goal: '仅修复前端样式 Bug',
    thought: 'write_file {"path":"x"}',
    toolCall: { id: '1', name: 'write_file', args: { path: 'x' } },
    history: [],
    budget: { stepsUsed: 0, stepsMax: 15, elapsedMs: 0 },
    policy: {
      driftThreshold: 0.75,
      maxConsecutiveLoops: 2,
      enablePatchArgs: true,
      protectedPaths: ['.env*'],
      dangerousCommands: [],
      redirectMap: {},
      steerMode: 'inject-hint',
    },
  };
}

function makeAdapter(): McpAdapter {
  const adapter = new McpAdapter();
  adapter.setup({ hitl: new MockHitlTransport(), config: resolveConfig() });
  return adapter;
}

describe('paramsToToolCall', () => {
  it('提取 name/arguments，arguments 缺省为空对象', () => {
    expect(paramsToToolCall(7, { name: 'bash', arguments: { command: 'ls' } })).toEqual({
      id: '7', name: 'bash', args: { command: 'ls' },
    });
    expect(paramsToToolCall('x', { name: 't' }).args).toEqual({});
  });
});

describe('McpAdapter 效果 → 代理动作映射', () => {
  it('PassThrough → 转发原参数', async () => {
    const adapter = makeAdapter();
    adapter.setCallParams({ name: 'write_file', arguments: { path: 'a.ts' } });
    await adapter.materialize({ type: 'PassThrough' }, makeCtx());
    expect(adapter.actionQueue).toEqual([
      { kind: 'forward', params: { name: 'write_file', arguments: { path: 'a.ts' } } },
    ]);
  });

  it('PatchArgs → 改写 arguments 转发（patch 为完整参数）', async () => {
    const adapter = makeAdapter();
    adapter.setCallParams({ name: 'write_file', arguments: { pathh: 'a.ts' } });
    await adapter.materialize({ type: 'PatchArgs', patch: { path: 'a.ts', content: 'c' } }, makeCtx());
    expect(adapter.actionQueue[0]).toEqual({
      kind: 'forward',
      params: { name: 'write_file', arguments: { path: 'a.ts', content: 'c' } },
    });
  });

  it('InjectMessage → 合成 isError 虚拟报错响应', async () => {
    const adapter = makeAdapter();
    adapter.setCallParams({ name: 'bash', arguments: { command: 'npm test' } });
    await adapter.materialize({ type: 'InjectMessage', role: 'tool', content: '虚拟报错：已重复 3 次' }, makeCtx());
    expect(adapter.actionQueue[0]).toMatchObject({ kind: 'respond', result: { isError: true } });
    expect((adapter.actionQueue[0] as { result: { content: Array<{ text: string }> } }).result.content[0].text).toContain('虚拟报错');
  });

  it('Suspend → 按拒绝语义阻断 + 注入提示（代理无审批通道）', async () => {
    const adapter = makeAdapter();
    adapter.setCallParams({ name: 'bash', arguments: { command: 'rm -rf /' } });
    await adapter.materialize({ type: 'Suspend', reason: '高危命令' }, makeCtx());
    const action = adapter.actionQueue[0] as { kind: string; result: { isError: boolean; content: Array<{ text: string }> } };
    expect(action.kind).toBe('respond');
    expect(action.result.isError).toBe(true);
    expect(action.result.content[0].text).toContain('阻断');
  });
});

describe('decideProxyAction 决策矩阵', () => {
  const fallback = { name: 't', arguments: {} };

  it('L3 组合：改道转发优先，注入跳过（改道后无结果通道）', () => {
    const action = decideProxyAction(
      [
        { kind: 'forward', params: { name: 'edit_file', arguments: {} } },
        { kind: 'respond', result: { content: [{ type: 'text', text: 'hint' }], isError: true } },
      ],
      fallback,
    );
    expect(action.kind).toBe('forward');
    expect((action as { params: { name: string } }).params.name).toBe('edit_file');
  });

  it('纯合成响应 → 取最后一个 respond', () => {
    const action = decideProxyAction(
      [
        { kind: 'respond', result: { content: [{ type: 'text', text: 'a' }], isError: true } },
        { kind: 'respond', result: { content: [{ type: 'text', text: 'b' }], isError: true } },
      ],
      fallback,
    );
    expect((action as { result: { content: Array<{ text: string }> } }).result.content[0].text).toBe('b');
  });

  it('空队列 → 回退原样转发', () => {
    expect(decideProxyAction([], fallback)).toEqual({ kind: 'forward', params: fallback });
  });
});

describe('parseCliArgs', () => {
  it('解析 --key value 对并忽略独立 flag', () => {
    const args = parseCliArgs([
      '--goal', '修复样式', '--target', 'npx -y server ./src', '--protected-paths', '.env*,tmp/**', '--verbose',
    ]);
    expect(args.goal).toBe('修复样式');
    expect(args.target).toBe('npx -y server ./src');
    expect(args['protected-paths']).toBe('.env*,tmp/**');
    expect(args.verbose).toBeUndefined();
  });
});
