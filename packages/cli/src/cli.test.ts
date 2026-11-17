import { describe, expect, it, vi } from 'vitest';
import { findPlugin, formatHelp, formatList, run, type Entrypoint, type RunDeps } from './index.js';
import { PLUGINS } from './plugins.js';

function deps(overrides: Partial<RunDeps> = {}) {
  const out = vi.fn();
  const err = vi.fn();
  const spawn = vi.fn(async () => 0);
  const resolveEntrypoint = vi.fn<(_pkg: string, _bin: string) => Entrypoint>(
    () => ({ command: '/abs/node', prefixArgs: ['/abs/arcs-plugin-mcp/dist/cli.js'] }),
  );
  return { out, err, spawn, resolveEntrypoint, d: { out, err, spawn, resolveEntrypoint } };
}

describe('插件清单', () => {
  it('覆盖全部 9 个插件，mcp 为唯一 service 型', () => {
    expect(PLUGINS).toHaveLength(9);
    expect(PLUGINS.filter((p) => p.kind === 'service').map((p) => p.name)).toEqual(['mcp']);
  });

  it('findPlugin 按短名命中，未知名返回 undefined', () => {
    expect(findPlugin('mcp')?.package).toBe('@chaos-design/arcs-plugin-mcp');
    expect(findPlugin('nope')).toBeUndefined();
    expect(findPlugin(undefined)).toBeUndefined();
  });

  it('formatList / formatHelp 含关键引导', () => {
    expect(formatList()).toContain('mcp');
    expect(formatList()).toContain('claude-code');
    expect(formatHelp()).toContain('arcs start');
  });
});

describe('run', () => {
  it('无参数 / help 打印帮助并返回 0', async () => {
    const t = deps();
    expect(await run([], t.d)).toBe(0);
    expect(await run(['help'], t.d)).toBe(0);
    expect(t.out.mock.calls.flat().join('')).toContain('用法');
  });

  it('list 列出插件', async () => {
    const t = deps();
    expect(await run(['list'], t.d)).toBe(0);
    expect(t.out.mock.calls.flat().join('')).toContain('mcp');
  });

  it('start 未知插件返回 2 并提示可用清单', async () => {
    const t = deps();
    expect(await run(['start', 'nope'], t.d)).toBe(2);
    expect(t.err.mock.calls.flat().join('')).toContain('未知插件');
  });

  it('start service 型：解析入口并 spawn，透传 -- 后的参数', async () => {
    const t = deps();
    const code = await run(
      ['start', 'mcp', '--', '--goal', '修复样式', '--target', 'npx server-filesystem'],
      t.d,
    );
    expect(code).toBe(0);
    expect(t.resolveEntrypoint).toHaveBeenCalledWith('@chaos-design/arcs-plugin-mcp', 'arcs-plugin-mcp');
    expect(t.spawn).toHaveBeenCalledWith('/abs/node', [
      '/abs/arcs-plugin-mcp/dist/cli.js',
      '--goal',
      '修复样式',
      '--target',
      'npx server-filesystem',
    ]);
  });

  it('start service 型 --dry-run 只打印命令，不 spawn', async () => {
    const t = deps();
    expect(await run(['start', 'mcp', '--dry-run', '--', '--goal', 'g'], t.d)).toBe(0);
    expect(t.spawn).not.toHaveBeenCalled();
    expect(t.out.mock.calls.flat().join('')).toContain('[dry-run]');
    expect(t.out.mock.calls.flat().join('')).toContain('--goal g');
  });

  it('start host-managed 型：打印启用方式，不 spawn', async () => {
    const t = deps();
    expect(await run(['start', 'claude-code'], t.d)).toBe(0);
    expect(t.spawn).not.toHaveBeenCalled();
    expect(t.out.mock.calls.flat().join('')).toContain('由宿主加载');
    expect(t.out.mock.calls.flat().join('')).toContain('--plugin-dir');
  });

  it('入口无法解析时返回 1 且不 spawn', async () => {
    const t = deps();
    t.resolveEntrypoint.mockReturnValue(null);
    expect(await run(['start', 'mcp'], t.d)).toBe(1);
    expect(t.spawn).not.toHaveBeenCalled();
    expect(t.err.mock.calls.flat().join('')).toContain('无法定位');
  });

  it('spawn 失败退出码透传', async () => {
    const t = deps();
    t.spawn.mockResolvedValue(7);
    expect(await run(['start', 'mcp'], t.d)).toBe(7);
  });

  it('未知命令返回 2', async () => {
    const t = deps();
    expect(await run(['frobnicate'], t.d)).toBe(2);
    expect(t.err.mock.calls.flat().join('')).toContain('未知命令');
  });
});
