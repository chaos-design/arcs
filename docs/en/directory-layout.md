[中文版](../directory-layout.md) · English

# Directory Layout

The repository is built on `pnpm workspace` + `Turborepo`, with all packages published under the unified `@chaos-design` namespace.

```text
arcs/
├── packages/
│   ├── core/                  # Core engine: pure detection/decision, zero host dependencies
│   ├── plugin-kit/            # Plugin glue layer: HostAdapter contract + runtime + bridges
│   ├── host-kit/              # Shared runtime for host plugins: capability matrix + Hook entry bridge + effect translation
│   ├── cli/                   # @chaos-design/arcs-cli: unified CLI (discovery + quick-start plugin services)
│   └── telemetry/             # AuditEvent model / TelemetrySink contract / offset curves
├── sdk/                       # Code-level integration (sdk/xxx form, in-process)
│   ├── vercel/                # @chaos-design/arcs-sdk-vercel
│   └── langchain/             # @chaos-design/arcs-sdk-langchain
├── plugins/                   # Host plugins (11 agent platforms + MCP gateway)
│   ├── claude-code/           # @chaos-design/arcs-plugin-claude-code
│   ├── codex/                 # @chaos-design/arcs-plugin-codex
│   ├── opencode/              # @chaos-design/arcs-plugin-opencode
│   ├── pi/                    # @chaos-design/arcs-plugin-pi
│   ├── deepseek/              # @chaos-design/arcs-plugin-deepseek
│   ├── workbuddy/             # @chaos-design/arcs-plugin-workbuddy
│   ├── zcode/                 # @chaos-design/arcs-plugin-zcode
│   ├── trae/                  # @chaos-design/arcs-plugin-trae
│   ├── chatgpt/               # @chaos-design/arcs-plugin-chatgpt
│   ├── pl-agent/              # @chaos-design/arcs-plugin-pl-agent
│   ├── qwen-code/             # @chaos-design/arcs-plugin-qwen-code
│   └── mcp/                   # @chaos-design/arcs-plugin-mcp (resident transparent proxy gateway, the only one that can rewrite tool names)
├── examples/
│   ├── sdk-vercel-demo/       # Vercel AI SDK integration example (mock model, L1/L2)
│   └── plugin-mcp-demo/       # MCP transparent proxy three-process hands-on example (passthrough / L2 / L4 / audit persistence)
├── site/                      # Vite + React documentation site (embeds docs/*.md at build time, zero runtime fetch; bilingual switch)
│   └── src/                   # Routing / i18n / markdown rendering (mermaid kept as a single chunk)
├── docs/                      # Architecture and design documentation (en/ is the paired English edition)
│   ├── README.md
│   ├── architecture.md
│   ├── directory-layout.md
│   ├── core.md
│   ├── plugin-kit.md
│   ├── host-kit.md
│   ├── telemetry.md
│   ├── sdk.md
│   ├── plugins.md
│   ├── key-flows.md
│   ├── testing.md
│   ├── extension-points.md
│   ├── constraints.md
│   ├── roadmap.md
│   └── interview.md
├── scripts/                   # Zero-dependency guard scripts: scan-deps / verify-host-contracts / install-plugins / offset-dashboard (pnpm dashboard)
├── plans/                     # plan-flow plans (state and priority contracts defined in plans/README.md)
├── LICENSE                    # Apache 2.0
├── turbo.json
└── pnpm-workspace.yaml
```

## Directory Responsibilities at a Glance

| Directory | Responsibility | Boundary |
|---|---|---|
| `packages/core` | Execution context modeling, drift detection, course planning, decision generation | Zero host dependencies, zero I/O |
| `packages/plugin-kit` | HostAdapter contract, runtime orchestration, configuration/HITL/telemetry bridging | Does not import host SDKs |
| `packages/telemetry` | Data models and sinks for offset curves and correction audits | Does not participate in decisions |
| `sdk/*` | Framework-native Middleware / Model Wrappers | In-process, does not take over host lifecycle |
| `plugins/*` | HostAdapter implementations for a single host | Programs only against plugin-kit |

> SDKs use the standalone `sdk/xxx` folder form; see [sdk.md](./sdk.md) for their responsibilities and boundaries.
