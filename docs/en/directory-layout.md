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
│   ├── langchain/             # @chaos-design/arcs-sdk-langchain
│   └── README.md              # SDK responsibilities and boundaries overview
├── plugins/                   # Host plugins (primary implementation target)
│   ├── codex/                 # @chaos-design/arcs-plugin-codex
│   ├── deepseek/              # @chaos-design/arcs-plugin-deepseek
│   ├── claude-code/           # @chaos-design/arcs-plugin-claude-code
│   └── mcp/                   # @chaos-design/arcs-plugin-mcp
├── examples/
│   ├── sdk-vercel-demo/       # Vercel AI SDK integration example (mock model, L1/L2)
│   └── plugin-mcp-demo/       # MCP transparent proxy three-process hands-on example (passthrough / L2 / L4 / audit persistence)
├── docs/                      # Architecture and design documentation
│   ├── README.md
│   ├── architecture.md
│   ├── directory-layout.md
│   ├── core.md
│   ├── plugin-kit.md
│   ├── plugins.md
│   ├── sdk.md
│   ├── key-flows.md
│   ├── telemetry.md
│   ├── testing.md
│   ├── extension-points.md
│   ├── constraints.md
│   └── roadmap.md
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
