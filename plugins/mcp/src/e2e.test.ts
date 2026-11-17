import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { McpProxy } from './index.js';
import type { InMemorySink } from '@chaos-design/arcs-telemetry';

const FAKE_SERVER = join(import.meta.dirname ?? '.', '..', 'test', 'fake-mcp-server.mjs');

interface RpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: unknown;
}

function startProxy(
  configOverrides: Record<string, unknown>,
  opts: {
    target?: string[];
    onDownstreamError?: (err: Error) => void;
    log?: (line: string) => void;
  } = {},
) {
  const clientInput = new PassThrough();
  const clientOutput = new PassThrough();
  const proxy = new McpProxy(
    {
      goal: '仅修复前端样式 Bug，禁止修改后端 API 路由',
      target: opts.target ?? ['node', FAKE_SERVER],
      configOverrides: configOverrides as never,
      onDownstreamError: opts.onDownstreamError,
    },
    { log: opts.log },
  );
  proxy.start(clientInput, clientOutput);

  const pending = new Map<number, (msg: RpcMessage) => void>();
  let nextId = 1;
  clientOutput.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as RpcMessage;
        const resolve = pending.get(msg.id as number);
        if (resolve) {
          pending.delete(msg.id as number);
          resolve(msg);
        }
      } catch {
        // 忽略非 JSON 行
      }
    }
  });

  async function request(method: string, params: unknown, timeoutMs = 8000): Promise<RpcMessage> {
    const id = nextId++;
    const promise = new Promise<RpcMessage>((resolve, reject) => {
      pending.set(id, resolve);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`请求超时：${method} id=${id}`));
        }
      }, timeoutMs);
    });
    clientInput.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return promise;
  }

  async function stop(): Promise<void> {
    clientInput.end();
    proxy.stop();
    await new Promise((r) => setTimeout(r, 50));
  }

  return {
    proxy,
    request,
    stop,
    clientInput,
    clientOutput,
    sink: (proxy as unknown as { sink: InMemorySink }).sink,
  };
}

describe('MCP 透明代理 · 真实进程 e2e', () => {
  it('L1：键名幻觉参数被热修复后转发下游', async () => {
    const { request, stop } = startProxy({
      toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) },
    });
    try {
      const res = await request('tools/call', { name: 'write_file', arguments: { pathh: 'a.ts', content: 'c' } });
      const text = (res.result as { content: Array<{ text: string }> }).content[0]!.text;
      const forwarded = JSON.parse(text.slice('echo:'.length)) as { arguments: Record<string, unknown> };
      expect(forwarded.arguments).toEqual({ path: 'a.ts', content: 'c' }); // pathh → path
    } finally {
      await stop();
    }
  });

  it('L2：同一调用连续第 3 次触发虚拟报错（不转发下游）', async () => {
    const { request, stop } = startProxy({});
    try {
      const params = { name: 'bash', arguments: { command: 'npm test' } };
      const r1 = await request('tools/call', params);
      const r2 = await request('tools/call', params);
      const r3 = await request('tools/call', params);
      const r4 = await request('tools/call', { name: 'bash', arguments: { command: 'npm run build' } });
      expect((r1.result as { content: Array<{ text: string }> }).content[0]!.text).toContain('echo:');
      expect((r2.result as { content: Array<{ text: string }> }).content[0]!.text).toContain('echo:');
      const blocked = r3.result as { isError: boolean; content: Array<{ text: string }> };
      expect(blocked.isError).toBe(true);
      expect(blocked.content[0]!.text).toContain('ARCS');
      // 第 4 次换了命令，恢复正常转发
      expect((r4.result as { content: Array<{ text: string }> }).content[0]!.text).toContain('echo:');
    } finally {
      await stop();
    }
  });

  it('L4：高危命令按拒绝语义阻断 + 提示', async () => {
    const { request, stop } = startProxy({});
    try {
      const res = await request('tools/call', { name: 'bash', arguments: { command: 'rm -rf /tmp/x' } });
      const blocked = res.result as { isError: boolean; content: Array<{ text: string }> };
      expect(blocked.isError).toBe(true);
      expect(blocked.content[0]!.text).toContain('阻断');
    } finally {
      await stop();
    }
  });

  it('透传：initialize 与 tools/list 直达下游', async () => {
    const { request, stop } = startProxy({});
    try {
      const init = await request('initialize', { protocolVersion: '2025-06-18' });
      expect((init.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18');
      const list = await request('tools/list', {});
      expect((list.result as { tools: Array<{ name: string }> }).tools[0]!.name).toBe('write_file');
    } finally {
      await stop();
    }
  });

  it('审计事件可观测：阻断产生 level=4、补参产生 level=1', async () => {
    const { proxy, request, stop } = startProxy({
      toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) },
    });
    try {
      await request('tools/call', { name: 'write_file', arguments: { pathh: 'a.ts', content: 'c' } });
      await request('tools/call', { name: 'bash', arguments: { command: 'rm -rf /tmp/x' } });
      const levels = proxy.events.map((e) => e.level);
      expect(levels).toContain(1);
      expect(levels).toContain(4);
    } finally {
      await stop();
    }
  });
});

describe('MCP 透明代理 · 稳健性红线（11 号计划加固）', () => {
  it('非法 JSON 行带 id：回 -32700 Parse error 而非静默丢弃', async () => {
    const logs: string[] = [];
    const { request, stop, clientInput, clientOutput } = startProxy({}, { log: (l) => logs.push(l) });
    // 先走一条正常请求确认链路可用
    const ok = await request('tools/list', {});
    expect(ok.result).toBeDefined();

    // 手写一条坏 JSON 行（保留合法 id 字段），等待 -32700 错误响应
    const reply = new Promise<RpcMessage>((resolve) => {
      const onData = (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as RpcMessage;
            if (msg.id === 99001 && msg.error) {
              clientOutput.removeListener('data', onData);
              resolve(msg);
            }
          } catch {
            // 忽略非 JSON 行
          }
        }
      };
      clientOutput.on('data', onData);
    });
    clientInput.write('{"jsonrpc":"2.0","id":99001,"method":"tools/call",broken\n');
    const res = await reply;
    expect(res.error).toMatchObject({ code: -32700, message: 'Parse error' });
    await stop();
  });

  it('下游立即退出：tools/call 回 -32000 错误响应，客户端不悬挂', async () => {
    const logs: string[] = [];
    const { request, stop } = startProxy(
      {},
      { target: ['node', '-e', 'process.exit(0)'], log: (l) => logs.push(l) },
    );
    await new Promise((r) => setTimeout(r, 150)); // 等下游退出
    // 下游可能尚在启动（转发并登记未决）或已退出（立即回错）——两条路径都必须有应答
    const res = await request('tools/call', { name: 'echo', arguments: { text: 'hi' } }, 3000);
    expect(res.error).toMatchObject({ code: -32000 });
    expect(String((res.error as { message: string }).message)).toContain('未完成');
    await stop();
  });

  it('spawn 失败（命令不存在）：onDownstreamError 上报且代理不崩溃', async () => {
    const errors: Error[] = [];
    const logs: string[] = [];
    const { stop } = startProxy(
      {},
      {
        target: ['arcs-definitely-not-exist-xyz'],
        onDownstreamError: (err) => errors.push(err),
        log: (l) => logs.push(l),
      },
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error & { code?: string }).code).toBe('ENOENT');
    await stop();
  });
});
