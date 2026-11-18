[中文版](./README.md) · English

# @chaos-design/arcs-plugin-mcp

ARCS MCP transparent proxy gateway. Between an MCP host and a downstream Server it acts as a transparent proxy over STDIO line-delimited JSON-RPC: `initialize` / `tools/list` go straight to the downstream server, while `tools/call` passes through ARCS steering before landing. It is the only resident service among the 9 plugins and the only one that can truly rewrite tool names (L3) — the front hooks of hook-based hosts can only rewrite arguments of the same tool, never `tools/call.name`.

## How it works

```text
MCP host stdin ──→ [arcs-plugin-mcp: intercept tools/call → sense/plan → apply decision] ──→ downstream MCP Server
MCP host stdout ←── [synthesized response (virtual error / blocking notice) or forwarded downstream response] ←──────────┘
```

- Requests are processed one by one through a **serial queue**, preserving host request order.
- Non-`tools/call` requests (`initialize`, `tools/list`, etc.) pass through untouched.
- Any exception is fail-open: the original call is allowed through; the steering system never becomes a source of interruption.

## Command-line arguments

```bash
npx @chaos-design/arcs-plugin-mcp \
  --goal "Fix frontend style bugs only; never touch backend API routes" \
  --target "npx -y @modelcontextprotocol/server-filesystem ./src" \
  [--drift-threshold 0.75] \
  [--max-consecutive-loops 2] \
  [--protected-paths ".env*,**/migrations/**"]
```

| Argument | Description |
| --- | --- |
| `--goal` | Established goal (required), the reference for drift judgment; can also come from `ARCS_GOAL` |
| `--target` | Downstream MCP Server launch command (required); quote inner paths that contain spaces, e.g. `--target 'node "/path with space/server.mjs"'` (quote-aware splitting) |
| `--drift-threshold` | Drift threshold; defaults to the plugin-kit config |
| `--max-consecutive-loops` | Consecutive repeated-call limit; exceeding it triggers steering |
| `--protected-paths` | Comma-separated glob protected paths; a hit escalates to L4 |

## Steering semantics (STDIO landing shape)

| Effect | Proxy action |
|---|---|
| `PassThrough` | Forward to downstream as-is |
| `PatchArgs` (L1) | Rewrite `arguments`, then forward (the patch is the full repaired arguments) |
| `RedirectTool` (L3) | Rewrite the `tools/call` target tool, then forward (the original call is blocked) |
| `InjectMessage` (L2) | Not forwarded downstream; synthesize an `isError: true` tool result (virtual error) |
| `Suspend` (L4) | Not forwarded downstream; synthesize a blocking-notice result (rejection semantics; the STDIO channel has no approval outlet) |

Decision rule: if the effect list of one call contains any forwarding (including redirects), the last forwarding wins — L3 injection has no result channel after a redirect and is skipped; otherwise the last synthesized response is used.

## Programmatic access

Besides the CLI, use the exported proxy class for in-process integration:

```ts
import { McpProxy, decideProxyAction } from '@chaos-design/arcs-plugin-mcp';
```

- `McpProxy` — the transparent proxy itself (host stdin/stdout ↔ downstream child process, serial interception)
- `decideProxyAction` — pure-function decision from effect list to landing action

## Audit

Persistence goes through host-kit's `createAuditSink`: after setting `ARCS_HOME` or `ARCS_AUDIT_FILE`, steering events are appended to `<home>/audit/mcp/<YYYY-MM-DD>.jsonl`; without the variables nothing is written and behavior is unchanged.

## Tests and verification

- `plugins/mcp/src/mcp.test.ts` — unit tests for decision and proxy logic (in-memory sink + mock HITL)
- `plugins/mcp/src/e2e.test.ts` — real-process e2e: passthrough, L1 argument hot-repair, L2 virtual error on consecutive calls, L4 blocking, invalid JSON line answered with `-32700` Parse error (never silently dropped), observable audit events
- Three-process hands-on demo: [examples/plugin-mcp-demo](../../examples/plugin-mcp-demo)

## Related documents

- Overall plugin matrix and topology: [docs/en/plugins.md](../../docs/en/plugins.md)
- MCP proxy landing semantics: the "MCP proxy semantics" section of [docs/en/plugins.md](../../docs/en/plugins.md)
- Unified CLI quick start: `npx @chaos-design/arcs-cli start mcp -- --goal "..." --target "..."`
