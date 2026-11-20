[English](./README.en.md) · 中文

# plugin-mcp-demo

`plugins/mcp` 透明代理网关端到端演示：真实三进程拓扑（客户端 → 代理 → 下游 MCP Server），无需 API Key。

- **透传**：`initialize` / `tools/list` 直达下游。
- **L2 熔断**：同一 `bash` 调用连续第 3 次，代理合成虚拟报错（不转发下游）。
- **L4 阻断**：`rm -rf` 危险命令命中策略，默认 HITL 通道按超时拒绝 → 拒绝语义返回。
- **审计落盘**：`ARCS_AUDIT_FILE` 写 JSONL，可用 `pnpm dashboard` 生成偏移曲线面板。

## 运行

```bash
# 仓库根目录
corepack pnpm install
corepack pnpm build:native-plugins   # 产出 plugins/mcp/dist
node examples/plugin-mcp-demo/demo.mjs
```

> 代理亦可通过统一 CLI 启动：`corepack pnpm build && node packages/cli/dist/cli.js start mcp -- --goal "..." --target "node <server.mjs>"`。
