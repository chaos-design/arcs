[中文版](./README.md) · English

# plugin-mcp-demo

End-to-end demo of the `plugins/mcp` transparent proxy gateway: a real three-process topology (client → proxy → downstream MCP Server), with no API Key required.

- **Pass-through**: `initialize` / `tools/list` go straight to the downstream.
- **L2 circuit breaking**: on the 3rd consecutive call of the same `bash` tool, the proxy synthesizes a dummy error (not forwarded downstream).
- **L4 blocking**: a dangerous `rm -rf` command hits the policy; the default HITL channel rejects on timeout → a rejection result is returned.
- **Audit to disk**: `ARCS_AUDIT_FILE` writes JSONL, and `pnpm dashboard` can generate a deviation-curve panel.

## Running

```bash
# Repository root
corepack pnpm install
corepack pnpm build:native-plugins   # produces plugins/mcp/dist
node examples/plugin-mcp-demo/demo.mjs
```

> The proxy can also be started through the unified CLI: `corepack pnpm build && node packages/cli/dist/cli.js start mcp -- --goal "..." --target "node <server.mjs>"`.
