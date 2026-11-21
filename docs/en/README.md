[中文版](../README.md) · English

# ARCS Documentation Index

This directory organizes ARCS's architecture and design documentation by function. The README provides an overview, with details expanded here.

## Document List

| Document | Content |
|---|---|
| [architecture.md](./architecture.md) | General design principles, layered architecture, dependency relationships, capability matrix, process topology, and robustness red lines (Mermaid diagrams) |
| [directory-layout.md](./directory-layout.md) | Directory layout: `packages/*`, `sdk/xxx`, `plugins/xxx`, docs |
| [core.md](./core.md) | Core engine: responsibilities, core abstractions, interface boundaries, default sensors, budgets, and degradation |
| [plugin-kit.md](./plugin-kit.md) | Plugin glue layer: responsibilities, core abstractions, session state, and the separation boundary with core |
| [host-kit.md](./host-kit.md) | Host runtime: capability matrix, Hook entry bridge, effect translation, audit persistence, and session locks |
| [plugins.md](./plugins.md) | Concrete plugins: 10 providers including chatgpt / deepseek / claude-code / mcp |
| [sdk.md](./sdk.md) | SDK code-level integration: interception points, the SteerEvent contract, and boundaries with plugins |
| [key-flows.md](./key-flows.md) | Correction feedback loop, runtime sequence, four-level strategy, HITL recovery, and failure degradation |
| [telemetry.md](./telemetry.md) | Telemetry: the AuditEvent model, the TelemetrySink contract, offset curves, and dashboards |
| [testing.md](./testing.md) | Testing strategy: three test layers and CI boundary guards |
| [extension-points.md](./extension-points.md) | Extension points and steps for adding plugins/algorithms |
| [constraints.md](./constraints.md) | Constraints (10 items) and terminology conventions |
| [roadmap.md](./roadmap.md) | Phased rollout plan and completion criteria |
| [interview.md](./interview.md) | Interview question bank: 36 questions grouped by topic (problem domain / architecture / algorithms / materialization / observability / engineering / open design) |

## Two Core Requirements

1. **Maintain task continuity; never interrupt the current task.** Correction happens within the execution flow, so the task always moves forward.
2. **Correct drift immediately upon detection and keep advancing toward the goal.** Detect deviations in real time and correct them as soon as they cross a boundary, preventing drift from accumulating.

Start with [architecture.md](./architecture.md).
