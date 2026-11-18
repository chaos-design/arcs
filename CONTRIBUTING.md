[中文](./CONTRIBUTING_zh.md) · English

# Contributing to ARCS

Thank you for wanting to improve **ARCS** (**A**gent **R**eal-time **C**ourse **S**teering) — a framework- and harness-agnostic, real-time steering control plane that keeps agents on track **without interrupting the task**. Code, tests, documentation, scripts, plans and review are all equally valuable contributions.

This guide is the contributor's single source of truth. It is written from the repository's actual configuration and documentation; every command, path and package name below is verified against this repo. The rules for the two language versions are strict: **every document exists as a bilingual pair, and neither version is an abbreviation of the other** (see [§11 Documentation conventions](#11-documentation-conventions)).

---

## 1. Welcome and the Two Core Commitments

Every design decision in ARCS serves two non-negotiable commitments. They are also the first thing to check when reviewing a change:

| # | Core commitment | What it means in practice | Where it is enforced |
|---|---|---|---|
| 1 | **Maintain task continuity; never interrupt the current task** | Correction happens *inside* the execution flow — hot-fix parameters, inject a steering prompt, or redirect a tool. The task always moves forward; it is never forcibly terminated or discarded. Only a single high-risk action may be briefly suspended via HITL and resumes after approval — the goal is to *continue* the task safely, not to abandon it. | `docs/README.md` / `docs/en/README.md` §"Two Core Requirements"; `docs/constraints.md` items 4 and 7 |
| 2 | **Detect drift immediately and keep advancing toward the goal** | Deviation is detected in real time and corrected as soon as it crosses a boundary so drift cannot accumulate. The runtime budget is normalize + sense ≤ 35 ms, plan ≤ 10 ms, materialize ≤ 5 ms, total < 50 ms (measured in CPU time, not wall-clock). | `docs/constraints.md` item 2 |

The safety net for commitment 1 is **fail-open** (constraint 7): any detection/planning exception or budget overrun passes the action through and marks it `degraded` with an audit event. **A contribution that allows ARCS to become a source of task interruption is a bug, even if the new algorithm is otherwise clever.**

If you are unsure whether a change preserves these commitments, stop and discuss it in an issue before writing code.

---

## 2. Code of Conduct and License

### Code of conduct

All contributors, maintainers and participants are expected to follow the project's code of conduct in every space (issues, pull requests, discussions, reviews and private reports):

- [Code of Conduct (English)](./CODE_OF_CONDUCT.md)
- [行为准则（中文）](./CODE_OF_CONDUCT_zh.md)

See [§15 Community and communication](#15-community-and-communication) for etiquette and enforcement. Reports of unacceptable behavior go through the private channel described there — **do not** escalate them in public threads.

### Open-source license

ARCS is released under the **Apache License 2.0**; the full text is in [`LICENSE`](./LICENSE) (header: `Apache License / Version 2.0, January 2004 / http://www.apache.org/licenses/`).

- By submitting a contribution you agree that it is licensed under the same Apache 2.0 terms.
- Do not copy code with an incompatible license into the repository, and do not remove or alter license/attribution notices in files you modify.
- New files that are derived from third-party material must carry appropriate attribution and must respect Apache 2.0's patent and notice clauses.
- The license applies to code, docs, scripts, examples and site content alike.

---

## 3. Development Environment Prerequisites

| Requirement | Version / value | Where it is pinned | How to verify |
|---|---|---|---|
| **Node.js** | **>= 20** | `package.json#engines` | `node -v` |
| **pnpm** | **10.28.1** (exact) | `package.json#packageManager` (`pnpm@10.28.1`) | `corepack pnpm -v` |
| **Corepack** | Ships with Node 20 | Enable it locally so the pinned pnpm version is used automatically | `corepack enable` |
| **Git** | Any current version | Used for branches, commits and PRs | `git --version` |
| Optional: real host CLIs | `claude`, `codex`, `opencode`, `pi`, `dsh`, `zcode`, `codebuddy`, … | Only needed for Tier-3 real-host checks (§9), performed by the integrating party | `node scripts/host-real-check.mjs` |

Notes:

- Always invoke pnpm through Corepack (`corepack pnpm …`) so the repository's pinned version is used; CI does the same. Do not rely on a globally installed pnpm of a different version.
- CI installs with `corepack pnpm install --frozen-lockfile` on Node 20 (`.github/workflows/ci.yml`), so **commit an updated `pnpm-lock.yaml` whenever dependencies change**.
- The workspace is private (`"private": true` in `package.json`); packages are intended to be published under the `@chaos-design` namespace.

---

## 4. Local Setup

```bash
# 1. Clone the repository (or your fork)
git clone <repository-url> arcs
cd arcs

# 2. Activate the pinned pnpm version and install all workspaces
corepack enable
corepack pnpm install                 # CI: corepack pnpm install --frozen-lockfile

# 3. Build every workspace through Turborepo (respects ^build ordering)
corepack pnpm build

# 4. Run the full test suite (Vitest consumes src via aliases — no build needed)
corepack pnpm test

# 5. Scan dependency red lines (core purity, host-agnostic glue, SDK boundary)
corepack pnpm scan

# 6. Verify host-plugin contracts (run build first: behavioral checks import dist/)
corepack pnpm verify:contracts

# 7. Start the documentation site (127.0.0.1:5175)
corepack pnpm site:dev

# 8. Offset-curve dashboard examples (reads ARCS_HOME, default ~/.arcs)
corepack pnpm dashboard
corepack pnpm dashboard -- --home ~/.arcs --limit 10
corepack pnpm dashboard -- --home ~/.arcs --html dashboard.html
```

Script-to-command mapping (all from `package.json`):

| Script | Command | Purpose |
|---|---|---|
| `pnpm build` | `turbo run build` | Build all workspaces, `outputs: dist/**`, `dependsOn: ["^build"]` |
| `pnpm lint` | `turbo run lint` | Per-package `tsc --noEmit` type check (no build output) |
| `pnpm test` | `vitest run` | All `*.test.ts` under the configured include globs |
| `pnpm scan` | `node scripts/scan-deps.mjs` | Dependency-direction red-line scan |
| `pnpm verify:contracts` | `node scripts/verify-host-contracts.mjs` | Static + behavioral host-plugin contract guards |
| `pnpm real-check` | `node scripts/host-real-check.mjs` | Real-host verification helper (integration party) |
| `pnpm dashboard` | `node scripts/offset-dashboard.mjs` | Offset curve from `FileAuditSink` JSONL, terminal + optional HTML |
| `pnpm site:dev` / `site:build` / `site:preview` | `pnpm --filter @chaos-design/arcs-site dev` / `build` / `preview` | Documentation site |
| `pnpm build:native-plugins` / `install-plugins` | `node scripts/build-host-plugins.mjs` / `node scripts/install-host-plugins.mjs` | Build/install host plugins |

A clean local pass of steps 3–6 is the minimum bar before opening a PR; CI will run the same gates.

---

## 5. Monorepo Structure and Dependency Red Lines

The repository uses `pnpm workspace` + `Turborepo`; all published packages live under the `@chaos-design` namespace. `pnpm-workspace.yaml` declares the members: `packages/*`, `sdk/*`, `plugins/*`, `examples/*`, `site`.

```text
arcs/
├── packages/          # core, plugin-kit, host-kit, cli, telemetry
├── sdk/               # code-level integration: vercel, langchain (+ README.md)
├── plugins/           # host plugins: codex, deepseek, claude-code, mcp,
│                      # zcode, workbuddy, opencode, pi, trae
├── examples/          # sdk-vercel-demo, plugin-mcp-demo
├── site/              # Vite + React docs site; embeds docs/**/*.md at build time
├── docs/              # Chinese docs; docs/en/ holds the English counterparts
├── scripts/           # zero-dependency guard scripts (scan, contracts, dashboard, …)
├── plans/             # plan-flow plans (status/priority contract in plans/README.md)
├── LICENSE            # Apache 2.0
├── turbo.json
└── pnpm-workspace.yaml
```

### Dependency direction (red line)

```text
plugins/*  →  host-kit  →  plugin-kit  →  telemetry  →  core
    │             │
    └── host SDKs are pushed down into plugins/* only
        (host-kit is the only packages/* layer allowed node I/O)

sdk/*  →  core   (direct; deliberately bypasses the glue layer)
```

The scan is implemented in `scripts/scan-deps.mjs`; it reads non-relative imports from each `src` tree and rejects anything not explicitly allowed. Test files (`*.test.ts`) are excluded from the scan because they run under Vitest.

| Source directory | Allowed non-relative imports | Allowed `node:` builtins (must be justified) |
|---|---|---|
| `packages/core/src` | `zod` | none — zero host dependencies, zero I/O |
| `packages/telemetry/src` | `zod`, `@chaos-design/arcs-core` | none |
| `packages/plugin-kit/src` | `zod`, core, telemetry | none — must not import any host SDK |
| `packages/host-kit/src` | `zod`, core, telemetry, plugin-kit, host-kit | `node:fs`, `node:os`, `node:path`, `node:process`, `node:crypto` (`claim.ts` uses `crypto` for collision-resistant short hashes of long session IDs) |
| `plugins/mcp/src` | `zod`, core, host-kit, telemetry, plugin-kit | `node:child_process` (spawn downstream MCP Server), `node:process`, `node:url` |
| `plugins/{claude-code,codex,zcode,workbuddy,trae,opencode,pi,deepseek}/src` | host deps (`zod`, core, telemetry, plugin-kit, host-kit) | narrow, per-plugin allowlist (e.g. `node:url` for the CLI entry guard; `node:fs`/`node:os` for session claim files) |
| `sdk/vercel/src` | `zod`, `@chaos-design/arcs-core`, `@ai-sdk/provider` | none |
| `sdk/langchain/src` | `@chaos-design/arcs-core` | none |

Practical rules:

- **Never** add a host SDK import to `plugin-kit`, `telemetry`, `core` or an SDK adapter; host dependencies belong in `plugins/*`.
- **Never** make `sdk/*` depend on `plugin-kit` — SDKs are direct, in-process wrappers around core.
- If you genuinely need a new `node:` builtin in a plugin, add it to the per-plugin allowlist in `scripts/scan-deps.mjs` **with an inline reason**; broadening a whitelist without justification weakens the red line.
- Host-plugin manifests, hook counts and output schemas are additionally guarded by `scripts/verify-host-contracts.mjs` + `scripts/behavior-contracts.mjs` (8 platforms: 5 native hooks + 3 extension/bundle).

---

## 6. Development Workflow

1. **Create a branch** from an up-to-date `main` (see naming suggestions below).
2. **Commit in small, logical steps** using Conventional Commits (§7). Each commit should build and pass tests on its own.
3. **Sync with main** frequently: `git fetch origin && git rebase origin/main`. Resolve conflicts locally; never force-push a branch other people are working on.
4. **Open a pull request** early (a draft PR is fine), fill in the required description (below), and let CI run. Address review comments with new commits or a final squash.

### Branch naming suggestions

| Prefix | Use for | Example |
|---|---|---|
| `feat/` | New capability | `feat/mcp-hitl-timeout` |
| `fix/` | Bug fix | `fix/opencode-claim-collision` |
| `docs/` | Documentation only | `docs/en-contributing-guide` |
| `chore/` | Maintenance, plans, dependencies | `chore/archive-plan-12` |
| `refactor/` | No behavior change | `refactor/plugin-runtime-pipeline` |
| `test/` | Tests only | `test/replay-harness-cases` |
| `perf/` | Performance work | `perf/sense-budget` |
| `ci/` / `build/` | CI or build tooling | `ci/dashboard-smoke` |
| `site/` | Documentation site | `site/nav-bilingual` |

Keep names short, lowercase and hyphen-separated; include an issue number when one exists.

### Required PR description

Every PR must contain these five sections — they are how reviewers verify the two core commitments:

```markdown
## Background
What problem does this solve? Link the issue/plan. Which core commitment does it protect?

## Changes
What changed, file by file / package by package. Note any new dependency or import.

## Verification
Commands run locally (build / lint / test / scan / verify:contracts / site:build)
and their results; which of the three test tiers were exercised.

## Risks
Behavior changes, latency-budget impact, fail-open/degraded implications,
host-version sensitivity, and anything intentionally out of scope.

## Rollback
How to revert: commits to revert, config flags to turn off, and whether any
generated artifacts (audit JSONL, plugin installs, site build) need cleanup.
```

If a section is genuinely not applicable, write "N/A" and say why — do not delete the heading.

---

## 7. Commit Message Convention

ARCS uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
type(scope): subject

[optional body: what and why, not how]

[optional footer: BREAKING CHANGE: ..., Refs: #123]
```

- `type`, `scope` and `subject` are required; the scope may be omitted only for truly cross-cutting changes.
- Append `!` before the colon for a breaking change: `type(scope)!: subject`.
- Subject: imperative mood, lowercase, no trailing period, ideally ≤ 72 characters. Explain the *why* in the body if it is not obvious.

### Allowed types

| Type | Meaning |
|---|---|
| `feat` | New feature / capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Maintenance, plans, tooling, dependency housekeeping |
| `refactor` | Restructuring without behavior change |
| `test` | Adding or fixing tests |
| `perf` | Performance improvement |
| `ci` | CI workflow / pipeline changes |
| `build` | Build system or build artifacts |

### Common scopes

`core`, `plugin-kit`, `host-kit`, `telemetry`, `mcp`, `cli`, `ci`, `site`, `scripts`, `plans`, `examples`, `sdk`, `vercel`, `langchain`. Multi-scope changes use a comma-separated list; combined work uses a `+` join. All of these forms appear in the repository history.

### Real examples from this repository (`git log --oneline -20`)

| Commit message (verbatim) | Why it is a good example |
|---|---|
| `feat(ci): GitHub Actions 全量护栏流水线（构建/类型检查/测试/依赖红线/宿主契约/面板冒烟）` | `feat` + `ci` scope, subject summarizes the whole pipeline |
| `fix(plugin-kit): 初始化异常 fail-open——run() 捕获 ensureInit 失败降级放行并支持重试，start() 订阅链兜底不外抛` | `fix` + precise scope; describes the guarantee, not just the symptom |
| `feat(p5): 偏移曲线面板——telemetry buildDashboardModel 聚合 + 零依赖终端/HTML 双形态 dashboard 脚本` | Phase tag as scope (`p5`), references the concrete API |
| `fix(mcp,cli): MCP 代理稳健性红线——EPIPE 防线/行缓冲上限/JSON-RPC 错误响应/未决请求兑现；CLI 信号监听器泄漏修复；--target 引号感知切分` | Multiple scopes separated by commas for one coherent robustness fix |
| `docs+site: 架构文档修订至当前实现（host-kit/8 插件/能力矩阵/稳健性红线）、新增 host-kit 分册与面试题库（36 题）、Vite+React 文档站点（内嵌 docs、mermaid 单 chunk 根治首渲死锁、CJK 粗体兼容）+ GitHub Pages 工作流` | Combined `docs+site` work; detailed subject carries the review context |
| `docs: 同步 roadmap P3/P5 状态、README 面板用法与目录树、telemetry 面板章节、testing CI 落地说明` | Cross-cutting docs change without a scope |
| `chore(plans): 归档 11/12 号计划（加固与 P5 面板、文档站点与题库）` | `chore` + `plans` scope for plan lifecycle work |

The repository's commit history is mixed-language; keep your subject in the language of the surrounding discussion, but keep the `type(scope):` prefix in English so tooling can parse it.

---

## 8. Code Style and Quality Gates

### TypeScript configuration

`tsconfig.base.json` is the shared base:

| Option | Value |
|---|---|
| `target` / `lib` | `ES2022` |
| `module` / `moduleResolution` | `NodeNext` |
| `strict` | `true` — no implicit `any`, strict null checks, etc. |
| `declaration` / `declarationMap` / `sourceMap` | `true` |
| `skipLibCheck` | `true` |
| `esModuleInterop` | `true` |
| `forceConsistentCasingInFileNames` | `true` |
| `useDefineForClassFields` | `true` |

Write small, typed, side-effect-free units at the algorithm layer; keep I/O at the host edge.

### Quality gates

- `corepack pnpm lint` → `turbo run lint` → per-package `tsc --noEmit`. All packages must type-check with zero errors; fix types rather than adding `any` or `@ts-ignore`.
- `corepack pnpm test` → `vitest run`; tests are colocated as `*.test.ts` and consume source directly via workspace aliases (§9).
- `corepack pnpm scan` → dependency red lines (§5).
- `corepack pnpm verify:contracts` → host-plugin contracts (build first).
- CI additionally runs a dashboard smoke test and, on docs/site changes, builds and deploys the site (`.github/workflows/site.yml`).

### The ten constraints (verbatim contract, see `docs/constraints.md`)

| # | Constraint | Rationale | Enforcement |
|---|---|---|---|
| 1 | **core purity red line**: no `fs` / `net` / `child_process` imports | Portable, testable, side-effect-free algorithms | CI dependency-scan assertion |
| 2 | **Latency budget**: normalize + sense ≤ 35 ms, plan ≤ 10 ms, materialize ≤ 5 ms, total < 50 ms | Detect and correct immediately | Measured in **CPU time** (`process.cpuUsage` via `globalThis` to keep core at zero imports), not wall clock; `createArcsEngine({ clock })` allows a fake clock for deterministic tests |
| 3 | **Serializable decisions**: `SteeringEffect` and ordered lists must be JSON-serializable | Audit, replay and telemetry | Type constraints + JSON roundtrip unit tests |
| 4 | **Approval semantics**: `Suspend` suspends only one high-risk action and resumes after approval; reject/timeout (default 120 s) → block + inject explanation, task continues | Preserve task continuity, never terminate the task | HITL bridge contract (`HitlDecision.timeout` required) |
| 5 | **Host-agnostic glue**: `plugin-kit` must not import any host SDK | Reusable glue layer | Host dependencies pushed down to `plugins/*` |
| 6 | **SDK boundary**: `sdk/*` implements no lifecycle hooks and no traffic proxying | Avoid overlapping plugin responsibilities | Design review |
| 7 | **Fail open on failure**: exceptions or budget overruns always pass through with a `degraded` mark | ARCS must never interrupt a task (fallback for commitment 1) | try/catch at each runtime level + degraded audit-event tests |
| 8 | **Effect-list contract**: `plan` returns ordered `SteeringEffect[]`; `Suspend` may appear only alone and last | Composite "block + inject" correction, no partial materialization | Type constraints + planner validation tests |
| 9 | **State TTL**: idle `SessionState` (default 30 min) must be cleaned up | No memory leaks in long-running plugin processes | Runtime lifecycle tests |
| 10 | **No telemetry backpressure**: `TelemetrySink.emit` must not throw or block the main chain | Telemetry failure must never affect correction | Sink contract tests with injected exceptions |

### Explicitly forbidden / required in changes

- **Do not** import `fs`, `net` or `child_process` anywhere under `packages/core/src`.
- **Do not** import a host SDK into `plugin-kit` (or depend on `plugin-kit` from an SDK).
- **Do not** implement lifecycle hooks or traffic proxying in `sdk/*`.
- **Do** keep fail-open behavior: a broken sensor must be skipped, a global failure must yield `[PassThrough]` + `degraded`; never propagate an exception into the host's execution flow.
- **Do** keep `DriftSignal` and `SteeringEffect[]` JSON-roundtrip-safe; if you extend the discriminated union, update serialization tests and replay cases in the same PR.
- **Do** keep `Suspend` alone and last, and keep `TelemetrySink.emit` non-throwing and synchronous-fast.

---

## 9. Testing Guide

Three tiers correspond to the DoD of the roadmap phases; the first two are fully offline, only Tier 3 touches a real host (`docs/testing.md`).

| Tier | Scope | Where tests live (from `vitest.config.ts`) | Examples in this repo |
|---|---|---|---|
| 1 · Core pure functions (P0) | Sensors (`SchemaSensor`, `LoopHashSensor`, `SemanticSensor`, `PolicySensor`), `CoursePlanner`, effect serialization, level mapping, fail-open degradation | `packages/*/src/**/*.test.ts` | `packages/core/src/core.test.ts`, `packages/telemetry/src/telemetry.test.ts` |
| 2 · Replay simulation (P1) | `MockHostAdapter` + `ReplayHarness` drive `PluginRuntime.run` with JSONL traces; assert effect order, `latencyMs`, `degraded`, `AuditEvent`, HITL approved/rejected/timeout | same glob, next to runtime | `packages/plugin-kit/src/runtime.test.ts`, `packages/host-kit/src/conformance.test.ts` |
| 3 · Real-host e2e (P2–P4) | Real MCP Server, real host processes, SDK demos, approval/resume | `plugins/*/src/**/*.test.ts`, `sdk/*/src/**/*.test.ts` | `plugins/mcp/src/e2e.test.ts`, `sdk/vercel/src/integration.test.ts`, `sdk/langchain/src/node.test.ts` |
| Scripts | Dashboard aggregation and CLI behavior | `scripts/**/*.test.ts` | `scripts/offset-dashboard.test.ts`, `packages/cli/src/cli.test.ts` |

### Running tests

```bash
corepack pnpm test                                   # all tests (vitest run)
corepack pnpm exec vitest run packages/core/src/core.test.ts   # one file, local iteration
```

Notes:

- Tests directly consume package source through aliases in `vitest.config.ts` (`@chaos-design/arcs-core` → `packages/core/src/index.ts`, etc.), so **you do not need to build before `pnpm test`**. Environment is `node`, `testTimeout` 15000 ms.
- Add new tests next to the code they cover, with the same `*.test.ts` suffix and inside the include globs above. Tests are excluded from the dependency scan, but keep them honest: no undisclosed host SDK imports sneaking into runtime code via test helpers.
- Required test cases for sensors/planners: level mapping (schema→L1, loop→L2, semantic→L3, policy→L4), `Suspend` alone and last, planner rejection of invalid input, single-sensor exception skip, global exception → `[PassThrough]` + `degraded`.

### What CI runs

`.github/workflows/ci.yml`: on pushes to `main` and on every pull request — install (`--frozen-lockfile`) → build → lint → test → scan → verify:contracts → dashboard smoke test (writes a sample audit JSONL under `/tmp/arcs-ci` and generates HTML). Local equivalents are §4's `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm scan`, `pnpm verify:contracts`.

`.github/workflows/site.yml`: on pushes to `main` touching `docs/**`, `site/**` or the workflow itself (and via `workflow_dispatch`) — install → `pnpm site:build` → upload `site/dist` → deploy to GitHub Pages. So a docs-only PR still has a real build gate.

### Real-host verification

Tier 3 is executed by the **integrating party**, not CI:

```bash
node scripts/host-real-check.mjs          # probe CLIs/plugins, print manual session steps
node scripts/host-real-check.mjs --verify --home ~/.arcs   # read local audit JSONL for evidence
```

The helper deliberately does not trigger model calls, spend quota or modify user configuration. Record results (host + version, scenario, observed L1–L4 behavior, audit evidence) in the PR description or an issue; never paste secrets or raw user transcripts.

---

## 10. How to Extend

ARCS exposes stable extension points at every layer; host-facing extensions never require changing core (`docs/extension-points.md`).

| Extension point | Location | How to extend | Touches core? |
|---|---|---|---|
| New detection algorithm (`DriftSensor`) | core | Implement `DriftSensor` and register it | New implementation only |
| New correction strategy (`CoursePlanner` / `SteeringEffect`) | core | Extend the discriminated union + planner | Yes — must extend the union |
| New host plugin (`HostAdapter`) | plugins | Implement `HostAdapter` | No |
| Approval channel (`HitlTransport`) | plugin-kit | Implement `HitlTransport` | No |
| Telemetry backend (`TelemetrySink`) | telemetry | Implement `TelemetrySink` | No |
| New SDK adapter | sdk | Wrap core in a framework-native wrapper | No |

### Steps by extension type

**New `DriftSensor`:** implement `DriftSensor.sense(ctx): DriftSignal[]`; keep it pure, synchronous and I/O-free; do not change the `ExecutionContext` contract; route heavy model judgement through the async bypass (results land in the next event window); register in core and add unit tests including exception-skip/degradation.

**New `CoursePlanner` / `SteeringEffect`:** extend the discriminated union and planner; keep everything JSON-serializable (constraint 3); keep `Suspend` alone and last (constraint 8); update serialization unit tests and replay-simulation cases in the same change.

**New `HostAdapter` (host plugin):** create `plugins/<host>/` depending on `plugin-kit` and the host SDK; implement `subscribe` / `normalize` / `materialize`; reuse `PluginRuntime` instead of reimplementing detection, planning, state management or fail-open; expose host config through `ConfigSchema` (thresholds, protected paths, steering mode); add end-to-end tests for L1–L4 "task uninterrupted" behavior; register any new node builtin in `scripts/scan-deps.mjs` with a justification; ensure `pnpm verify:contracts` covers the new manifest/hooks/output schema.

**New `HitlTransport`:** implement the transport with a mandatory timeout (default 120 s; timeout counts as rejection); never suspend the flow indefinitely; return `HitlDecision` with an explicit `timeout` field; test approved / rejected / timeout branches through the HITL bridge.

**New `TelemetrySink`:** implement `emit` so it never throws and stays under 1 ms on the synchronous path (buffer and flush asynchronously if needed); prove it with exception-injection contract tests; keep `AuditEvent` field completeness intact.

**New SDK adapter:** create `sdk/<framework>/` as a thin, in-process wrapper over core; import core directly (never `plugin-kit`), implement the framework-native interception point and emit `SteerEvent` with the correct fields; do not take over lifecycle hooks or proxy traffic; add an example under `examples/` and a demo test; pass design review against constraint 6.

Cross-references: `docs/extension-points.md`, `docs/sdk.md`, `docs/testing.md`, `docs/constraints.md`.

---

## 11. Documentation Conventions

**This is the most easily violated rule in a bilingual repository: every document must be provided as a paired translation in both languages. A single-language document is not "done".**

### Naming and pairing

| Scope | Chinese version | English version | Notes |
|---|---|---|---|
| Root README | `README_zh.md` | `README.md` | English has no suffix; Chinese uses `_zh` |
| `docs/` | `docs/*.md` | `docs/en/*.md` | Same basename; English lives under `en/` |
| Other companion files | `*.md` | `*.en.md` | English companion uses the `.en.md` suffix |
| This guide | `CONTRIBUTING_zh.md` | `CONTRIBUTING.md` | Root-level `_zh` pattern |

Language switch line at the very top of each page (the link points to the *other* language, the current language stays plain text):

```text
# English pages (CONTRIBUTING.md, docs/en/*.md)
[中文](./CONTRIBUTING_zh.md) · English

# Chinese pages (CONTRIBUTING_zh.md, docs/*.md)
[English](./CONTRIBUTING.md) · 中文
```

Adjust the relative path per location (for example `docs/en/architecture.md` uses `[中文版](../architecture.md) · English`, matching the existing docs).

### When editing documentation

1. **Update both versions in the same PR.** Same section order, same numbering, same tables and code blocks; the Chinese file is a full translation, never a summary, and vice versa.
2. **Keep links paired:** a link to `docs/constraints.md` in Chinese should point to `docs/en/constraints.md` in English; never leave a broken or cross-language-mismatched link.
3. **Keep terminology consistent** with the glossary in `docs/constraints.md`: Drift / Steering Arc / Steering Prompt / Goal / Steering (correction) / non-invasive integration / SessionState / Degraded / effect list. Use the same English terms in both versions when referring to code identifiers (`DriftSensor`, `SteeringEffect`, `HostAdapter`, `HitlTransport`, `TelemetrySink`).
4. **Update both indexes** — `docs/README.md` and `docs/en/README.md` — when adding, renaming or removing a doc.
5. **Update the site navigation** when adding a doc: `site/src/i18n.ts` holds both the Chinese and English `NAV` lists; register the new doc in both, keeping the reading order and matching each language's docs index.
6. Validate Mermaid diagrams render and relative links resolve; this is part of the documentation DoD in `docs/roadmap.md` and `docs/testing.md`.

### How the site embeds docs

`site/vite.config.ts` defines the `docsModule()` Vite plugin: at build time it recursively collects every Markdown file under `docs/`, keys them by path relative to `docs/` with `.md` removed (e.g. `README`, `architecture`, `en/architecture`), and inlines their raw text into the virtual module `virtual:arcs-docs`. There is **no runtime fetch** — the output is fully self-contained and can be hosted at any subpath. `site/src/docs.ts` consumes it as `ALL_DOCS` and `docContent()` picks the right language (falling back to Chinese when a translation is missing); `site/src/i18n.ts` holds both languages' `NAV` and UI strings, `site/src/routes.ts` encodes the language in the hash route (`?lang=en`), and `site/src/markdown.ts` rewrites `*.md` links to language-aware hash routes based on the current document's physical path. `pnpm site:build` emits `site/dist` (deployed by `.github/workflows/site.yml`). Consequence: both language versions are embedded and reachable through the 中文/EN switch in the sidebar footer or mobile header; add the new file to both `NAV` lists to make it reachable in the sidebar.

---

## 12. Plan Management

Plans live in `plans/` and follow the plan-flow contract in `plans/README.md`. **The directory is the status**:

| Status | Directory | Meaning |
|---|---|---|
| `planing` | `plans/planing/` | Designed and broken down, ready to implement |
| `pending` | `plans/pending/` | Blocked on a product/security/release/platform decision |
| `archive` | `plans/archive/` | Completed and archived, read-only (errata only) |

### Priority definitions (project-specific mapping)

| Level | Definition |
|---|---|
| **P0** | Hard contradiction between documents: an incorrect contract signature or enum that future code would inherit (broken gates / wrong contract) |
| **P1** | Design gap blocking roadmap P0 work, plus new architecture diagrams (unreachable core features / incomplete recovery) |
| **P2** | Completeness sync: indexes, constraints, LICENSE, cross-validation |

Completion keys, interpreted per plan file: `code` (all tasks done), `linter_result` (links/terminology check), `unit_test_result` (Mermaid rendering), `func_test_result` (README ↔ docs cross-consistency), `status` (remaining risk and rollback).

Note the two different P-scales: `docs/roadmap.md` uses phases **P0–P5** for implementation stages, while `plans/README.md` uses priorities **P0–P2** for plan urgency. Do not conflate them.

---

## 13. Security Vulnerability Reporting

- **Do not** report suspected vulnerabilities in a public issue, pull request or discussion. Public disclosure before a fix puts users at risk.
- Use the private reporting channel described in [`SECURITY.md`](./SECURITY.md) / [`安全报告（中文）`](./SECURITY_zh.md). If you are unsure which channel applies, contact a maintainer privately and do not post details publicly.
- Include the affected version/commit, host and platform, a minimal reproduction, impact assessment and (if relevant) a proof of concept. **Redact secrets, tokens and raw user data/transcripts.**
- Give maintainers a reasonable window to investigate and release a fix before any public discussion; coordinate disclosure with them.
- Security work follows the same bilingual documentation rule (§11) and the code of conduct (§2).

---

## 14. Pre-Merge Self-Check Checklist

- [ ] Branch created from an up-to-date `main`, name follows §6 conventions
- [ ] Commits follow Conventional Commits (§7), one logical change each, prefix parseable by tooling
- [ ] `corepack pnpm build` passes across all workspaces
- [ ] `corepack pnpm lint` passes (`tsc --noEmit` in every package, no `any`/`@ts-ignore` added)
- [ ] `corepack pnpm test` passes; new tests are in the correct include glob and cover the relevant tier
- [ ] `corepack pnpm scan` passes; no new forbidden imports; any new `node:` builtin has an inline justification
- [ ] `corepack pnpm verify:contracts` passes after build (manifests, hook counts, output schemas, 8 platforms)
- [ ] Two core commitments preserved: no task interruption, drift corrected within budget; fail-open/`degraded` path tested
- [ ] `SteeringEffect` / `DriftSignal` JSON roundtrip still asserted; `Suspend` alone and last
- [ ] Latency budget (CPU time) respected; new sensors are pure, sync and I/O-free
- [ ] Documentation updated in **both** languages with paired links, switch lines, glossary terms and both index files
- [ ] Both site `NAV` lists updated if a doc was added (`site/src/i18n.ts`); Mermaid and links validated
- [ ] PR description contains Background / Changes / Verification / Risks / Rollback
- [ ] Plan status/priority updated in `plans/` if applicable; no secrets, user data or unrelated changes
- [ ] Real-host tier-3 evidence noted for the integrating party (`scripts/host-real-check.mjs`)

---

## 15. Community and Communication

### Suggested issue templates

| Template | Fields to request |
|---|---|
| Bug report | ARCS version/commit, Node & pnpm versions, host + version, minimal reproduction, expected vs actual, logs with secrets redacted, relevant audit JSONL excerpt |
| Feature request | Problem and goal first, proposed approach, alternatives considered, which core commitment it serves |
| Docs issue | Exact file path **and language version**, section/line, what is wrong or missing, suggested paired fix |
| Question / discussion | Context, what you tried, where you are stuck; mark as resolved when answered |

### Discussion etiquette

- Search existing issues/discussions before opening a new one; attach a minimal reproduction rather than screenshots of walls of text.
- Assume good faith, discuss ideas not people, and keep technical claims evidence-based (commands, logs, links to code).
- Reply in the language of the thread; when you cross language boundaries, summarize in both so nothing is lost.
- Keep sensitive security reports out of public threads (§13).

### Code of conduct enforcement

Maintainers may edit, hide or remove off-topic or abusive content, issue warnings, and temporarily or permanently restrict participation. Enforcement decisions are recorded privately and communicated respectfully. Reports go through the private channel in the [Code of Conduct](./CODE_OF_CONDUCT.md) / [行为准则](./CODE_OF_CONDUCT_zh.md); contributors are expected to cooperate with a fair investigation.

---

Thank you for helping keep agents on track — in real time, and without interrupting the task. Contributions are licensed under Apache 2.0 (see [`LICENSE`](./LICENSE)).
