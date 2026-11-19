# Changelog

[中文](./CHANGELOG_zh.md) · English

All notable changes to ARCS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Bilingual docs site: language encoded in the hash route (`?lang=en`, `en/` physical keys) with a 中文/EN toggle in the sidebar footer and mobile header; switching preserves the current page and anchor, missing translations fall back to Chinese; UI strings and both navigation lists live in `site/src/i18n.ts` (`2b26ed9`).
- New bilingual READMEs for the `claude-code` and `mcp` plugins: 17-hook output contract (`permissionDecision` / `updatedInput`) and the MCP proxy's L1–L4 landing semantics, CLI arguments, serial queue and fail-open guarantees (`854f1a6`).
- README.md for every publishable package: `packages/{core,telemetry,plugin-kit,host-kit}` and `sdk/{vercel,langchain}`.

- Bilingual documentation set: a new English `README.md` mirrors the Chinese `README_zh.md`, covering architecture, module split, four-level steering policy, quick start and documentation index.
- Bilingual community and governance files: `CONTRIBUTING.md` / `CONTRIBUTING_zh.md`, `CODE_OF_CONDUCT.md` / `CODE_OF_CONDUCT_zh.md`, `SECURITY.md` / `SECURITY_zh.md`, and this changelog (`CHANGELOG.md` / `CHANGELOG_zh.md`).
- Full English translations of all 15 documents under `docs/en/`: [README](./docs/en/README.md), [architecture](./docs/en/architecture.md), [directory-layout](./docs/en/directory-layout.md), [core](./docs/en/core.md), [plugin-kit](./docs/en/plugin-kit.md), [host-kit](./docs/en/host-kit.md), [plugins](./docs/en/plugins.md), [sdk](./docs/en/sdk.md), [key-flows](./docs/en/key-flows.md), [telemetry](./docs/en/telemetry.md), [testing](./docs/en/testing.md), [extension-points](./docs/en/extension-points.md), [constraints](./docs/en/constraints.md), [roadmap](./docs/en/roadmap.md) and [interview](./docs/en/interview.md).
- English companion READMEs for every plugin and example: all 9 `plugins/*` directories plus both demos (`examples/sdk-vercel-demo`, `examples/plugin-mcp-demo`).

### Fixed

- Mobile drawer geometry: `height: 100%` overrode the top/bottom stretch under fixed positioning, pushing the drawer's bottom edge off screen by one header height; now `height: auto` for an exact fit, shadow flipped to the right side, and `.app.nav-open .content { overflow: hidden }` actually locks background scrolling (body overflow never locked the real scroller); `.app` prefers `100dvh` where available.
- `scripts/build-host-plugins.mjs` now builds the `mcp` plugin too, so `examples/plugin-mcp-demo` works by following its README.
- DeepSeek installation no longer references a nonexistent `--deepseek-profile` flag; the plugin's README and the installer print honest Cordis-bundle integration steps.
- Mermaid sequence diagrams in `architecture` / `sdk` / `key-flows` (both languages) no longer fall back to source: ` + ` inside message lines is parsed as an activation token.

### Changed

- Documentation indexes in both languages now cross-link the English and Chinese variants of every document.
- Site layout aligned to the memx reference: sectioned documentation matrix with top-accent cards, breadcrumb + quick-entry cards, single-line sidebar nav with a leading 导航 group and dual footer buttons, mobile header with GitHub icon and animated hamburger, right-hand sticky TOC, mermaid lightbox, and a two-line previous/next pager (`be09700`).
- `scripts/install-host-plugins.mjs` now prints verified local-plugin-directory commands instead of nonexistent `astro-*` marketplace names, accepts `--clients=a,b` multi-selection, and excludes `node_modules`/`dist` when copying global plugins.

## [0.1.0] - 2026-11-18

First public release: the full ARCS real-time course-steering engine — core, telemetry, plugin glue layer, host plugins, SDK adapters, unified CLI, observability dashboard, docs site and CI guardrails. See the [architecture](./docs/en/architecture.md) and [roadmap](./docs/en/roadmap.md) for the design and phase history.

### Added

- **P0–P2 foundation** (`9e461cd`): four packages — pure-logic `@chaos-design/arcs-core` (DriftSensor, CoursePlanner, ExecutionContext, SteeringEffect), `@chaos-design/arcs-telemetry` (AuditEvent model, TelemetrySink contract), `@chaos-design/arcs-plugin-kit` (HostAdapter, PluginRuntime, Config/HITL/SessionState bridges) and the first host plugin `@chaos-design/arcs-plugin-mcp`; plus the initial P0–P2 documentation set.
- **P3 host plugins and shared runtime** (`63f4dd3`): eight platform plugins — codex, deepseek, claude-code, zcode, workbuddy, opencode, pi and trae — all built on the new `@chaos-design/arcs-host-kit` shared runtime (capability matrix, Hook entry bridge, effect translation). Added contract guardrails (`pnpm verify:contracts`, `scripts/verify-host-contracts.mjs`) and audit/install helpers (`scripts/host-real-check.mjs`, `scripts/install-host-plugins.mjs`, `scripts/build-host-plugins.mjs`).
- **P4 SDK adapters** (`19cdd15`): `@chaos-design/arcs-sdk-vercel` with the `withArcs` middleware and `@chaos-design/arcs-sdk-langchain` with the `createArcsNode` graph node (`SteerEvent` contract, `sdk/*` depends directly on core).
- **Unified CLI** (`b7cfad9`): `@chaos-design/arcs-cli` with `list` and `start` commands (including `--dry-run` and `--` argument forwarding) to discover and launch plugin services in one step.
- **P5 offset-curve panel** (`831930a`): `buildDashboardModel` aggregation in telemetry and a zero-dependency terminal + standalone HTML dashboard via `pnpm dashboard` (`scripts/offset-dashboard.mjs`), answering convergence and over-steering questions from audit JSONL.
- **End-to-end examples** (`145912f`): two zero-dependency demos, `examples/sdk-vercel-demo` (L1 patch args / L2 loop break) and `examples/plugin-mcp-demo` (three-process pass-through / L2 break / L4 block / audit persistence); the MCP CLI now wires `FileAuditSink`.
- **CI guardrails** (`d57e3f3`): `.github/workflows/ci.yml` full pipeline — build, type-check, tests, dependency red-line scan, host contract verification and dashboard smoke test.
- **Docs site and GitHub Pages** (`7544730`): Vite + React documentation site (`pnpm site:dev` / `site:build` / `site:preview`) embedding docs at build time, Mermaid single-chunk fix for first-render deadlock, CJK bold font compatibility, and `.github/workflows/site.yml` for GitHub Pages. Also added the host-kit companion volume ([host-kit.md](./docs/en/host-kit.md)) and the 36-question interview bank ([interview.md](./docs/en/interview.md)).
- **Plan archiving** (`daf91d0`): archived the completed plans for hardening/P5 panel and docs site/interview bank under `plans/`.

### Changed

- **Documentation sync** (`cf384e4`, `7544730`): revised [architecture](./docs/en/architecture.md) to match the current implementation (host-kit, 8 plugins, capability matrix, robustness red lines); updated roadmap P3/P5 status, README panel usage and directory tree, telemetry dashboard chapter, and testing/CI notes.

### Fixed

- **plugin-kit fail-open initialization** (`3ad7aac`): `run()` now catches `ensureInit` failures, degrades to pass-through and supports retry; `start()` subscription chain falls back without throwing — ARCS never becomes a source of task interruption.
- **MCP proxy robustness** (`6a3c8de`): EPIPE defense, line-buffering limit, JSON-RPC error responses and settlement of pending requests; fixed CLI signal-listener leak and made `--target` splitting quote-aware.
- **Concurrency and capacity** (`8ae8dd7`, in deepseek/opencode/telemetry/host-kit): eliminated race conditions, added session/queue/audit capacity caps and made claim filenames collision-proof.
- **Dashboard pipe safety** (`d58dfc0`): the dashboard script no longer crashes on EPIPE when a downstream consumer such as `head` closes the pipe early.

[Unreleased]: https://github.com/chaos-design/arcs/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/chaos-design/arcs/compare/74d1182...daf91d0
