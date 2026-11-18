# 变更日志

[English](./CHANGELOG.md) · 中文

本文件记录 ARCS 的所有重要变更。

本文件的格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本控制（Semantic Versioning）](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增（Added）

- 中英双语文档集：新增英文 `README.md` 与中文 `README_zh.md` 相互对应，覆盖架构、模块划分、四级操舵策略、快速开始与文档索引。
- 中英双语社区与治理文件：`CONTRIBUTING.md` / `CONTRIBUTING_zh.md`、`CODE_OF_CONDUCT.md` / `CODE_OF_CONDUCT_zh.md`、`SECURITY.md` / `SECURITY_zh.md`，以及本变更日志（`CHANGELOG.md` / `CHANGELOG_zh.md`）。
- `docs/en/` 下全部 15 篇文档完成英译：[README](./docs/en/README.md)、[architecture](./docs/en/architecture.md)、[directory-layout](./docs/en/directory-layout.md)、[core](./docs/en/core.md)、[plugin-kit](./docs/en/plugin-kit.md)、[host-kit](./docs/en/host-kit.md)、[plugins](./docs/en/plugins.md)、[sdk](./docs/en/sdk.md)、[key-flows](./docs/en/key-flows.md)、[telemetry](./docs/en/telemetry.md)、[testing](./docs/en/testing.md)、[extension-points](./docs/en/extension-points.md)、[constraints](./docs/en/constraints.md)、[roadmap](./docs/en/roadmap.md) 与 [interview](./docs/en/interview.md)。
- 为所有自带 README 的插件与示例补齐英文伴生文件：9 个插件目录中有 7 个自带 README（`codex`、`deepseek`、`opencode`、`pi`、`trae`、`workbuddy`、`zcode`），以及两个示例（`examples/sdk-vercel-demo`、`examples/plugin-mcp-demo`）。

### 变更（Changed）

- 中英两种语言的文档索引现均交叉链接各篇文档的中英文版本。

## [0.1.0] - 2026-11-18

首个公开发布版本：完整的 ARCS 实时航向操舵引擎——core、telemetry、插件胶水层、宿主插件、SDK 适配、统一命令行、可观测性面板、文档站点与 CI 护栏。设计与阶段沿革见 [architecture](./docs/architecture.md) 与 [roadmap](./docs/roadmap.md)。

### 新增（Added）

- **P0–P2 地基**（`9e461cd`）：四个包——纯逻辑的 `@chaos-design/arcs-core`（DriftSensor、CoursePlanner、ExecutionContext、SteeringEffect）、`@chaos-design/arcs-telemetry`（AuditEvent 模型、TelemetrySink 契约）、`@chaos-design/arcs-plugin-kit`（HostAdapter、PluginRuntime、Config/HITL/SessionState 桥接），以及首个宿主插件 `@chaos-design/arcs-plugin-mcp`；并落地初始 P0–P2 文档集。
- **P3 宿主插件与共用运行时**（`63f4dd3`）：八家平台插件——codex、deepseek、claude-code、zcode、workbuddy、opencode、pi、trae——全部基于新增的 `@chaos-design/arcs-host-kit` 共用运行时（能力矩阵、Hook 入口桥、效果翻译）。新增契约护栏（`pnpm verify:contracts`、`scripts/verify-host-contracts.mjs`）与审计/安装辅助脚本（`scripts/host-real-check.mjs`、`scripts/install-host-plugins.mjs`、`scripts/build-host-plugins.mjs`）。
- **P4 SDK 适配**（`19cdd15`）：`@chaos-design/arcs-sdk-vercel` 提供 `withArcs` 中间件，`@chaos-design/arcs-sdk-langchain` 提供 `createArcsNode` 图节点（`SteerEvent` 契约，`sdk/*` 直接依赖 core）。
- **统一命令行**（`b7cfad9`）：`@chaos-design/arcs-cli` 提供 `list` 与 `start` 命令（含 `--dry-run` 与 `--` 参数透传），一键发现并启动插件服务。
- **P5 偏移曲线面板**（`831930a`）：telemetry 中的 `buildDashboardModel` 聚合，以及通过 `pnpm dashboard`（`scripts/offset-dashboard.mjs`）提供的零依赖终端 + 独立 HTML 双形态面板，可回答审计 JSONL 中的收敛与过舵问题。
- **端到端示例**（`145912f`）：两个零依赖演示——`examples/sdk-vercel-demo`（L1 补参 / L2 熔断）与 `examples/plugin-mcp-demo`（三进程透传 / L2 熔断 / L4 阻断 / 审计落盘）；MCP CLI 现装配 `FileAuditSink`。
- **CI 护栏**（`d57e3f3`）：`.github/workflows/ci.yml` 全量流水线——构建、类型检查、测试、依赖红线扫描、宿主契约校验与面板冒烟测试。
- **文档站点与 GitHub Pages**（`7544730`）：Vite + React 文档站点（`pnpm site:dev` / `site:build` / `site:preview`），构建时内嵌 docs，采用 Mermaid 单 chunk 根治首渲死锁，兼容 CJK 粗体，并通过 `.github/workflows/site.yml` 部署 GitHub Pages。另新增 host-kit 分册（[host-kit.md](./docs/host-kit.md)）与 36 题面试题库（[interview.md](./docs/interview.md)）。
- **计划归档**（`daf91d0`）：将已完成的加固与 P5 面板、文档站点与题库计划归档至 `plans/`。

### 变更（Changed）

- **文档同步**（`cf384e4`、`7544730`）：修订 [architecture](./docs/architecture.md) 以对齐当前实现（host-kit、8 家插件、能力矩阵、稳健性红线）；同步 roadmap P3/P5 状态、README 面板用法与目录树、telemetry 面板章节，以及 testing/CI 落地说明。

### 修复（Fixed）

- **plugin-kit 初始化 fail-open**（`3ad7aac`）：`run()` 现捕获 `ensureInit` 失败、降级放行并支持重试；`start()` 订阅链兜底不外抛——ARCS 绝不成为任务中断源。
- **MCP 代理稳健性**（`6a3c8de`）：EPIPE 防线、行缓冲上限、JSON-RPC 错误响应与未决请求兑现；修复 CLI 信号监听器泄漏，并让 `--target` 切分支持引号感知。
- **并发与容量**（`8ae8dd7`，涉及 deepseek/opencode/telemetry/host-kit）：消除并发竞态，新增会话/队列/审计容量上限，并使 claim 文件名防碰撞。
- **面板管道安全**（`d58dfc0`）：当下游消费者（如 `head`）提前关闭管道时，dashboard 脚本不再因 EPIPE 崩溃。

[Unreleased]: https://github.com/chaos-design/arcs/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/chaos-design/arcs/compare/74d1182...daf91d0
