// 测试夹具：最小 MCP Server（行分隔 JSON-RPC over STDIO）
// - initialize / tools/list 正常应答
// - tools/call 原样回显请求参数（供断言代理是否改写）
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin });
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } });
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'write_file', inputSchema: { type: 'object' } }] } });
  } else if (msg.method === 'tools/call') {
    send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'echo:' + JSON.stringify(msg.params) }] } });
  }
});
