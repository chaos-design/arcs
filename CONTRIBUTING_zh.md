[English](./CONTRIBUTING.md) · 中文

# 参与 ARCS 贡献

感谢你愿意改进 **ARCS**（**A**gent **R**eal-time **C**ourse **S**teering）——一个框架与宿主双无关的实时航向操舵控制平面，让 Agent **在任务不中断的前提下**始终在轨。代码、测试、文档、脚本、计划与评审都是同等重要的贡献。

本指南是贡献者的单一事实来源，内容全部依据仓库真实配置与文档写成；下面每一条命令、路径与包名都经过本仓库核对。对两个语言版本的要求极为严格：**每份文档都必须成对提供中英双语版本，任何一方都不是另一方的简写版**（见[第 11 节 文档规范](#11-文档规范)）。

---

## 1. 欢迎与两条核心承诺

ARCS 的每一项设计决策都服务于两条不可妥协的承诺。它们也是评审变更时首先要检查的准则：

| # | 核心承诺 | 实践含义 | 保障位置 |
|---|---|---|---|
| 1 | **保持任务连续性，不中断当前任务** | 纠偏发生在执行流**内部**——热修复参数、注入纠偏指令或重定向工具。任务始终向前推进，绝不被强制终止或丢弃。仅单个高危动作可通过 HITL 短暂挂起，审批后恢复执行——目的是**安全延续**任务，而非放弃任务。 | `docs/README.md` / `docs/en/README.md` 的「两条核心要求」；`docs/constraints.md` 第 4、7 条 |
| 2 | **发现偏航立即纠偏，持续朝目标推进** | 实时检测偏差，越界即修正，避免偏航累积。运行时预算为 normalize + sense ≤ 35 ms、plan ≤ 10 ms、materialize ≤ 5 ms，合计 < 50 ms（按 **CPU 时间**计量，而非墙钟时间）。 | `docs/constraints.md` 第 2 条 |

承诺 1 的兜底是 **fail-open 降级**（约束第 7 条）：任何检测/规划异常或超预算都放行该动作，并标记 `degraded`、伴随审计事件。**任何使 ARCS 成为任务中断源的变更都是缺陷，哪怕新算法本身再巧妙。**

如果你不确定某项变更是否守住这两条承诺，请先停下来在 issue 中讨论，再动手写代码。

---

## 2. 行为准则与开源协议

### 行为准则

所有贡献者、维护者与参与者在所有场合（issue、PR、讨论、评审与私密报告）都应遵守项目行为准则：

- [行为准则（中文）](./CODE_OF_CONDUCT_zh.md)
- [Code of Conduct (English)](./CODE_OF_CONDUCT.md)

执行与礼仪见[第 15 节 社区与沟通](#15-社区与沟通)。不可接受行为的报告应走该节的私密渠道——**不要**在公开讨论区升级此类事件。

### 开源协议

ARCS 采用 **Apache License 2.0**，全文见 [`LICENSE`](./LICENSE)（头部：`Apache License / Version 2.0, January 2004 / http://www.apache.org/licenses/`）。

- 提交贡献即表示你同意该贡献同样遵循 Apache 2.0 条款。
- 不得将不兼容协议的代码复制进仓库，不得移除或改动你所修改文件中的许可/署名声明。
- 衍生自第三方材料的新文件必须保留适当署名，并遵守 Apache 2.0 的专利与声明条款。
- 协议对代码、文档、脚本、示例与站点内容一视同仁。

---

## 3. 开发环境前置条件

| 要求 | 版本 / 取值 | 固定位置 | 验证方式 |
|---|---|---|---|
| **Node.js** | **>= 20** | `package.json#engines` | `node -v` |
| **pnpm** | **10.28.1**（精确版本） | `package.json#packageManager`（`pnpm@10.28.1`） | `corepack pnpm -v` |
| **Corepack** | Node 20 自带 | 本地启用后自动使用固定版本 | `corepack enable` |
| **Git** | 任意当前版本 | 用于分支、提交与 PR | `git --version` |
| 可选：真实宿主 CLI | `claude`、`codex`、`opencode`、`pi`、`dsh`、`zcode`、`codebuddy` 等 | 仅第三层真实宿主实测需要（见第 9 节），由集成方执行 | `node scripts/host-real-check.mjs` |

说明：

- 始终通过 Corepack 调用 pnpm（`corepack pnpm …`），以使用仓库固定版本；CI 同样如此。不要依赖全局安装的其他版本 pnpm。
- CI 在 Node 20 上以 `corepack pnpm install --frozen-lockfile` 安装（`.github/workflows/ci.yml`），因此**依赖变更时必须一并提交更新后的 `pnpm-lock.yaml`**。
- 工作区为私有（`package.json` 中 `"private": true`）；包以 `@chaos-design` 命名空间发布。

---

## 4. 本地搭建步骤

```bash
# 1. 克隆仓库（或你的 fork）
git clone <repository-url> arcs
cd arcs

# 2. 启用固定版本的 pnpm 并安装所有工作区
corepack enable
corepack pnpm install                 # CI：corepack pnpm install --frozen-lockfile

# 3. 通过 Turborepo 构建所有工作区（遵循 ^build 顺序）
corepack pnpm build

# 4. 运行全量测试（Vitest 通过别名直接消费 src——无需先构建）
corepack pnpm test

# 5. 扫描依赖红线（core 纯度、胶水层宿主无关、SDK 边界）
corepack pnpm scan

# 6. 校验宿主插件契约（先构建：行为级校验会 import dist/）
corepack pnpm verify:contracts

# 7. 启动文档站点（127.0.0.1:5175）
corepack pnpm site:dev

# 8. 偏移曲线面板示例（读取 ARCS_HOME，默认 ~/.arcs）
corepack pnpm dashboard
corepack pnpm dashboard -- --home ~/.arcs --limit 10
corepack pnpm dashboard -- --home ~/.arcs --html dashboard.html
```

脚本与命令映射（全部来自 `package.json`）：

| 脚本 | 命令 | 用途 |
|---|---|---|
| `pnpm build` | `turbo run build` | 构建所有工作区，`outputs: dist/**`、`dependsOn: ["^build"]` |
| `pnpm lint` | `turbo run lint` | 各包 `tsc --noEmit` 类型检查（不产出构建物） |
| `pnpm test` | `vitest run` | 配置范围内全部 `*.test.ts` |
| `pnpm scan` | `node scripts/scan-deps.mjs` | 依赖方向红线扫描 |
| `pnpm verify:contracts` | `node scripts/verify-host-contracts.mjs` | 静态 + 行为级宿主插件契约护栏 |
| `pnpm real-check` | `node scripts/host-real-check.mjs` | 真实宿主验证辅助（集成方执行） |
| `pnpm dashboard` | `node scripts/offset-dashboard.mjs` | 从 `FileAuditSink` JSONL 聚合偏移曲线，终端 + 可选 HTML |
| `pnpm site:dev` / `site:build` / `site:preview` | `pnpm --filter @chaos-design/arcs-site dev` / `build` / `preview` | 文档站点 |
| `pnpm build:native-plugins` / `install-plugins` | `node scripts/build-host-plugins.mjs` / `node scripts/install-host-plugins.mjs` | 构建/安装宿主插件 |

本地干净通过第 3–6 步是发起 PR 的最低门槛；CI 会运行同一套护栏。

---

## 5. Monorepo 结构与依赖方向红线

仓库基于 `pnpm workspace` + `Turborepo`，所有发布包位于 `@chaos-design` 命名空间。`pnpm-workspace.yaml` 声明成员：`packages/*`、`sdk/*`、`plugins/*`、`examples/*`、`site`。

```text
arcs/
├── packages/          # core、plugin-kit、host-kit、cli、telemetry
├── sdk/               # 代码级接入：vercel、langchain（另含 README.md）
├── plugins/           # 宿主插件：codex、deepseek、claude-code、mcp、
│                      # zcode、workbuddy、opencode、pi、trae
├── examples/          # sdk-vercel-demo、plugin-mcp-demo
├── site/              # Vite + React 文档站点；构建时内嵌 docs/**/*.md
├── docs/              # 中文文档；docs/en/ 为英文对应版本
├── scripts/           # 零依赖护栏脚本（scan、契约、面板等）
├── plans/             # plan-flow 计划（状态/优先级契约见 plans/README.md）
├── LICENSE            # Apache 2.0
├── turbo.json
└── pnpm-workspace.yaml
```

### 依赖方向（红线）

```text
plugins/*  →  host-kit  →  plugin-kit  →  telemetry  →  core
    │             │
    └── 宿主 SDK 仅下沉到 plugins/*；
        host-kit 是唯一允许 node I/O 的 packages/* 层包

sdk/*  →  core   （直连，刻意绕过胶水层）
```

扫描由 `scripts/scan-deps.mjs` 实现：读取各 `src` 树的非相对导入，不在显式白名单内即报错。测试文件（`*.test.ts`）因运行在 Vitest 环境而被排除在扫描之外。

| 源码目录 | 允许的非相对导入 | 允许的 `node:` 内建（须说明理由） |
|---|---|---|
| `packages/core/src` | `zod` | 无——零宿主依赖、零 I/O |
| `packages/telemetry/src` | `zod`、`@chaos-design/arcs-core` | 无 |
| `packages/plugin-kit/src` | `zod`、core、telemetry | 无——不得 import 任何宿主 SDK |
| `packages/host-kit/src` | `zod`、core、telemetry、plugin-kit、host-kit | `node:fs`、`node:os`、`node:path`、`node:process`、`node:crypto`（`claim.ts` 用 `crypto` 为超长 sessionId 计算防碰撞短哈希） |
| `plugins/mcp/src` | `zod`、core、host-kit、telemetry、plugin-kit | `node:child_process`（spawn 下游 MCP Server）、`node:process`、`node:url` |
| `plugins/{claude-code,codex,zcode,workbuddy,trae,opencode,pi,deepseek}/src` | 宿主依赖（`zod`、core、telemetry、plugin-kit、host-kit） | 逐插件窄白名单（如 `node:url` 用于 CLI 入口守卫；`node:fs`/`node:os` 用于会话 claim 文件） |
| `sdk/vercel/src` | `zod`、`@chaos-design/arcs-core`、`@ai-sdk/provider` | 无 |
| `sdk/langchain/src` | `@chaos-design/arcs-core` | 无 |

实践规则：

- **绝不**在 `plugin-kit`、`telemetry`、`core` 或 SDK 适配器中引入宿主 SDK；宿主依赖属于 `plugins/*`。
- **绝不**让 `sdk/*` 依赖 `plugin-kit`——SDK 是直连 core 的进程内包装器。
- 若插件确实需要新的 `node:` 内建模块，在 `scripts/scan-deps.mjs` 的逐插件白名单中登记并**写明理由**；无理由放宽白名单会削弱红线。
- 宿主插件的 manifest、hook 数量与输出 schema 另由 `scripts/verify-host-contracts.mjs` + `scripts/behavior-contracts.mjs` 守护（8 个平台：5 个原生 hooks + 3 个扩展/bundle）。

---

## 6. 开发工作流

1. **建分支**：从最新的 `main` 切出（命名建议见下）。
2. **小步提交**：使用 Conventional Commits（第 7 节），每个提交自身都能构建并通过测试。
3. **同步主线**：频繁执行 `git fetch origin && git rebase origin/main`。冲突在本地解决；不要对他人协作的分支强推。
4. **发起 PR**：尽早开（草稿 PR 亦可），填写下述必需描述，让 CI 跑起来；评审意见用新提交或最终 squash 处理。

### 分支命名建议

| 前缀 | 用途 | 示例 |
|---|---|---|
| `feat/` | 新能力 | `feat/mcp-hitl-timeout` |
| `fix/` | 缺陷修复 | `fix/opencode-claim-collision` |
| `docs/` | 仅文档 | `docs/en-contributing-guide` |
| `chore/` | 维护、计划、依赖 | `chore/archive-plan-12` |
| `refactor/` | 无行为变更的重构 | `refactor/plugin-runtime-pipeline` |
| `test/` | 仅测试 | `test/replay-harness-cases` |
| `perf/` | 性能工作 | `perf/sense-budget` |
| `ci/` / `build/` | CI 或构建工具 | `ci/dashboard-smoke` |
| `site/` | 文档站点 | `site/nav-bilingual` |

名称保持短小、小写、连字符分隔；有对应 issue 时带上编号。

### PR 描述必需内容

每个 PR 必须包含以下五节——这是评审者验证两条核心承诺的方式：

```markdown
## 背景（Background）
解决了什么问题？链接 issue/计划。守护了哪条核心承诺？

## 变更（Changes）
逐文件/逐包说明改了什么。标注任何新增依赖或导入。

## 验证（Verification）
本地执行过的命令（build / lint / test / scan / verify:contracts / site:build）
及结果；覆盖了三层测试中的哪几层。

## 风险（Risks）
行为变化、延迟预算影响、fail-open/degraded 影响、宿主版本敏感性，
以及有意排除在范围外的内容。

## 回滚（Rollback）
如何回退：需 revert 的提交、需关闭的配置开关，以及是否需要清理
生成的产物（审计 JSONL、插件安装、站点构建物）。
```

某节确实不适用时写「N/A」并说明原因——不要删除标题。

---

## 7. 提交信息规范

ARCS 采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```text
type(scope): subject

[可选正文：说明是什么与为什么，而非怎么做]

[可选脚注：BREAKING CHANGE: ...、Refs: #123]
```

- `type`、`scope`、`subject` 必填；仅真正跨全局的变更才可省略 scope。
- 破坏性变更在冒号前加 `!`：`type(scope)!: subject`。
- subject 使用祈使语气、小写、句末不加句号，最好 ≤ 72 字符；原因不明显时在正文解释 *为什么*。

### 允许的类型

| 类型 | 含义 |
|---|---|
| `feat` | 新特性 / 新能力 |
| `fix` | 缺陷修复 |
| `docs` | 仅文档 |
| `chore` | 维护、计划、工具、依赖整理 |
| `refactor` | 无行为变更的结构调整 |
| `test` | 新增或修复测试 |
| `perf` | 性能优化 |
| `ci` | CI 工作流 / 流水线变更 |
| `build` | 构建系统或构建产物 |

### 常用 scope

`core`、`plugin-kit`、`host-kit`、`telemetry`、`mcp`、`cli`、`ci`、`site`、`scripts`、`plans`、`examples`、`sdk`、`vercel`、`langchain`。多 scope 用逗号分隔；复合工作用 `+` 连接。这些形式都出现在本仓库历史中。

### 本仓库真实提交示例（`git log --oneline -20`）

| 提交信息（原文） | 为何是好示例 |
|---|---|
| `feat(ci): GitHub Actions 全量护栏流水线（构建/类型检查/测试/依赖红线/宿主契约/面板冒烟）` | `feat` + `ci` scope，subject 概括整条流水线 |
| `fix(plugin-kit): 初始化异常 fail-open——run() 捕获 ensureInit 失败降级放行并支持重试，start() 订阅链兜底不外抛` | `fix` + 精确 scope；描述的是保障，而非表面症状 |
| `feat(p5): 偏移曲线面板——telemetry buildDashboardModel 聚合 + 零依赖终端/HTML 双形态 dashboard 脚本` | 阶段标签作 scope（`p5`），引用具体 API |
| `fix(mcp,cli): MCP 代理稳健性红线——EPIPE 防线/行缓冲上限/JSON-RPC 错误响应/未决请求兑现；CLI 信号监听器泄漏修复；--target 引号感知切分` | 逗号分隔多 scope，对应一组连贯的稳健性修复 |
| `docs+site: 架构文档修订至当前实现（host-kit/8 插件/能力矩阵/稳健性红线）、新增 host-kit 分册与面试题库（36 题）、Vite+React 文档站点（内嵌 docs、mermaid 单 chunk 根治首渲死锁、CJK 粗体兼容）+ GitHub Pages 工作流` | `docs+site` 复合工作；详细 subject 承载评审上下文 |
| `docs: 同步 roadmap P3/P5 状态、README 面板用法与目录树、telemetry 面板章节、testing CI 落地说明` | 跨全局文档变更，无需 scope |
| `chore(plans): 归档 11/12 号计划（加固与 P5 面板、文档站点与题库）` | `chore` + `plans` scope 用于计划生命周期工作 |

仓库提交历史为中英混排；subject 可沿用讨论所用语言，但 `type(scope):` 前缀保持英文，以便工具解析。

---

## 8. 代码风格与质量门槛

### TypeScript 配置

`tsconfig.base.json` 为共享基础：

| 选项 | 取值 |
|---|---|
| `target` / `lib` | `ES2022` |
| `module` / `moduleResolution` | `NodeNext` |
| `strict` | `true`——禁止隐式 `any`、严格空值检查等 |
| `declaration` / `declarationMap` / `sourceMap` | `true` |
| `skipLibCheck` | `true` |
| `esModuleInterop` | `true` |
| `forceConsistentCasingInFileNames` | `true` |
| `useDefineForClassFields` | `true` |

算法层写小而类型化、无副作用的单元；I/O 留在宿主边缘。

### 质量门槛

- `corepack pnpm lint` → `turbo run lint` → 各包 `tsc --noEmit`。所有包必须零错误通过类型检查；修类型，而不是加 `any` 或 `@ts-ignore`。
- `corepack pnpm test` → `vitest run`；测试以 `*.test.ts` 就近放置，通过工作区别名直接消费源码（第 9 节）。
- `corepack pnpm scan` → 依赖红线（第 5 节）。
- `corepack pnpm verify:contracts` → 宿主插件契约（先构建）。
- CI 另跑面板冒烟；在文档/站点变更时还会构建并部署站点（`.github/workflows/site.yml`）。

### 十条约束（契约原文，见 `docs/constraints.md`）

| # | 约束 | 理由 | 保障方式 |
|---|---|---|---|
| 1 | **core 纯度红线**：不得出现 `fs` / `net` / `child_process` 导入 | 保证算法可移植、可测试、无副作用 | CI 依赖扫描断言 |
| 2 | **延迟预算**：normalize + sense ≤ 35 ms、plan ≤ 10 ms、materialize ≤ 5 ms，合计 < 50 ms | 做到「偏航即发现、立即纠偏」 | 按 **CPU 时间**计量（`process.cpuUsage` 经 `globalThis` 取用以保持 core 零 import），不按墙钟；`createArcsEngine({ clock })` 可注入假时钟做确定性测试 |
| 3 | **决策可序列化**：`SteeringEffect` 及有序列表必须可 JSON 化 | 支撑审计、回放与遥测 | 类型约束 + JSON roundtrip 单测 |
| 4 | **审批语义**：`Suspend` 只挂起单个高危动作，审批后恢复；拒绝/超时（默认 120 s）→ 阻断 + 注入解释，任务继续 | 保证任务连续性，避免演变为任务终止 | HITL 桥接契约（`HitlDecision.timeout` 必填） |
| 5 | **胶水层宿主无关**：`plugin-kit` 不 import 任何宿主 SDK | 保持胶水层可复用 | 宿主依赖下沉到 `plugins/*` |
| 6 | **SDK 边界**：`sdk/*` 不实现生命周期 Hook 或流量代理 | 避免与插件职责重叠 | 设计评审检查 |
| 7 | **失败即降级（fail-open）**：检测/规划异常或超预算一律放行并标记 `degraded` | ARCS 绝不成为任务中断源（核心承诺 1 的兜底） | 运行时逐级 try/catch + degraded 审计事件单测 |
| 8 | **效果列表契约**：`plan` 返回有序 `SteeringEffect[]`，按序物化；`Suspend` 只能独立出现且位于末位 | 支撑「阻断 + 注入」复合纠偏，避免部分物化状态 | 类型约束 + 规划器校验单测 |
| 9 | **状态 TTL**：`SessionState` 空转超时（默认 30 分钟）必须清理 | 防止长驻插件进程内存泄漏 | Runtime 生命周期测试 |
| 10 | **遥测不反压**：`TelemetrySink.emit` 不得抛异常、不得阻塞主链 | 遥测失败绝不影响纠偏 | sink 契约测试（异常注入） |

### 变更中的明确禁止项与必做项

- **不得**在 `packages/core/src` 任意位置 import `fs`、`net` 或 `child_process`。
- **不得**在 `plugin-kit` 中 import 宿主 SDK，也**不得**让 SDK 适配器依赖 `plugin-kit`。
- **不得**在 `sdk/*` 中实现生命周期 Hook 或流量代理。
- **必须**保持 fail-open：单个传感器异常→跳过；整体异常→`[PassThrough]` + `degraded`；绝不把异常传播到宿主执行流。
- **必须**保持 `DriftSignal` 与 `SteeringEffect[]` 的 JSON roundtrip 安全；若扩展判别联合，须在同一 PR 更新序列化单测与回放用例。
- **必须**保持 `Suspend` 独立且位于末位，保持 `TelemetrySink.emit` 不抛异常且同步路径足够快。

---

## 9. 测试指引

三层测试对应 roadmap 各阶段 DoD；前两层完全离线，只有第三层进真实宿主（`docs/testing.md`）。

| 层 | 范围 | 测试位置（来自 `vitest.config.ts`） | 本仓库示例 |
|---|---|---|---|
| 第一层 · core 纯函数（P0） | 传感器（`SchemaSensor`、`LoopHashSensor`、`SemanticSensor`、`PolicySensor`）、`CoursePlanner`、效果序列化、等级映射、失败降级 | `packages/*/src/**/*.test.ts` | `packages/core/src/core.test.ts`、`packages/telemetry/src/telemetry.test.ts` |
| 第二层 · 回放仿真（P1） | `MockHostAdapter` + `ReplayHarness` 用 JSONL 轨迹驱动 `PluginRuntime.run`；断言效果顺序、`latencyMs`、`degraded`、`AuditEvent`、HITL approved/rejected/timeout | 同一范围，就近放置 | `packages/plugin-kit/src/runtime.test.ts`、`packages/host-kit/src/conformance.test.ts` |
| 第三层 · 真实宿主端到端（P2–P4） | 真实 MCP Server、真实宿主进程、SDK demo、审批恢复 | `plugins/*/src/**/*.test.ts`、`sdk/*/src/**/*.test.ts` | `plugins/mcp/src/e2e.test.ts`、`sdk/vercel/src/integration.test.ts`、`sdk/langchain/src/node.test.ts` |
| 脚本 | 面板聚合与 CLI 行为 | `scripts/**/*.test.ts` | `scripts/offset-dashboard.test.ts`、`packages/cli/src/cli.test.ts` |

### 如何运行

```bash
corepack pnpm test                                   # 全量测试（vitest run）
corepack pnpm exec vitest run packages/core/src/core.test.ts   # 单文件，本地迭代
```

说明：

- 测试通过 `vitest.config.ts` 中的别名直接消费包源码（`@chaos-design/arcs-core` → `packages/core/src/index.ts` 等），因此**运行 `pnpm test` 前无需构建**。环境为 `node`，`testTimeout` 15000 ms。
- 新测试就近放在被测代码旁，使用同样的 `*.test.ts` 后缀并落在上述 include 范围内。测试文件不参与依赖扫描，但仍要保持诚实：不要把未声明的宿主 SDK 导入通过测试辅助代码偷渡进运行时。
- 传感器/规划器必测项：等级映射（schema→L1、loop→L2、semantic→L3、policy→L4）、`Suspend` 独立且在末位、规划器拒绝非法输入、单传感器异常跳过、整体异常→`[PassThrough]` + `degraded`。

### CI 会跑什么

`.github/workflows/ci.yml`：push 到 `main` 与每个 PR——安装（`--frozen-lockfile`）→ 构建 → 类型检查 → 测试 → 依赖扫描 → 宿主契约校验 → 面板冒烟（在 `/tmp/arcs-ci` 写入样例审计 JSONL 并生成 HTML）。本地等价命令见第 4 节的 `pnpm build`、`pnpm lint`、`pnpm test`、`pnpm scan`、`pnpm verify:contracts`。

`.github/workflows/site.yml`：push 到 `main` 且触及 `docs/**`、`site/**` 或该工作流文件（也可 `workflow_dispatch` 手动触发）——安装 → `pnpm site:build` → 上传 `site/dist` → 部署到 GitHub Pages。因此仅改文档的 PR 也有真实的构建门禁。

### 真实宿主实测

第三层由**集成方**执行，不在 CI 中：

```bash
node scripts/host-real-check.mjs          # 探测 CLI/插件产物，打印手工会话步骤
node scripts/host-real-check.mjs --verify --home ~/.arcs   # 读取本地审计 JSONL 作为证据
```

该辅助脚本刻意不触发模型调用、不消耗额度、不改动用户配置。请将结果（宿主及版本、场景、观测到的 L1–L4 行为、审计证据）记录在 PR 描述或 issue 中；绝不粘贴密钥或原始用户记录。

---

## 10. 如何扩展

ARCS 在每一层都预留了稳定扩展点；面向宿主的扩展无需改动 core（`docs/extension-points.md`）。

| 扩展点 | 位置 | 扩展方式 | 是否触碰 core |
|---|---|---|---|
| 新检测算法（`DriftSensor`） | core | 实现 `DriftSensor` 并注册 | 仅新增实现 |
| 新纠偏策略（`CoursePlanner` / `SteeringEffect`） | core | 扩展判别联合 + 规划器 | 是——必须扩展联合类型 |
| 新宿主插件（`HostAdapter`） | plugins | 实现 `HostAdapter` | 否 |
| 审批通道（`HitlTransport`） | plugin-kit | 实现 `HitlTransport` | 否 |
| 遥测后端（`TelemetrySink`） | telemetry | 实现 `TelemetrySink` | 否 |
| 新 SDK 适配 | sdk | 用框架原生 Wrapper 包装 core | 否 |

### 按扩展类型的步骤

**新增 `DriftSensor`：**实现 `DriftSensor.sense(ctx): DriftSignal[]`；保持纯函数、同步、无 I/O；不改 `ExecutionContext` 契约；重模型判断走异步旁路（结果进入下一事件窗口）；在 core 注册并补充单测，含异常跳过/降级行为。

**新增 `CoursePlanner` / `SteeringEffect`：**扩展判别联合与规划器；保持全部可 JSON 化（约束第 3 条）；保持 `Suspend` 独立且位于末位（约束第 8 条）；在同一变更中更新序列化单测与回放仿真用例。

**新增 `HostAdapter`（宿主插件）：**在 `plugins/<host>/` 新建包，依赖 `plugin-kit` 与宿主 SDK；实现 `subscribe` / `normalize` / `materialize`；复用 `PluginRuntime`，不重复实现检测、规划、状态管理与 fail-open 兜底；按 `ConfigSchema` 暴露宿主配置项（阈值、保护路径、操舵模式）；补 L1–L4「任务不中断」端到端测试；若新增 node 内建模块，在 `scripts/scan-deps.mjs` 中带理由登记；确保 `pnpm verify:contracts` 覆盖新的 manifest/hooks/输出 schema。

**新增 `HitlTransport`：**实现必须带超时语义（默认 120 s，超时视为拒绝），不得无限挂起执行流；返回 `HitlDecision` 必须显式携带 `timeout` 字段；通过 HITL 桥接测试 approved / rejected / timeout 三个分支。

**新增 `TelemetrySink`：**实现 `emit`，不得抛异常，同步路径 < 1 ms（必要时缓冲后异步冲刷）；用异常注入契约测试证明；保持 `AuditEvent` 字段完整性。

**新增 SDK 适配：**在 `sdk/<framework>/` 创建轻量的进程内 core 包装器；直连 core（绝不依赖 `plugin-kit`），实现框架原生拦截点并正确发射 `SteerEvent` 字段；不接管生命周期 Hook、不做流量代理；在 `examples/` 补示例与 demo 测试；按约束第 6 条通过设计评审。

交叉引用：`docs/extension-points.md`、`docs/sdk.md`、`docs/testing.md`、`docs/constraints.md`。

---

## 11. 文档规范

**这是双语仓库中最容易被违反的规则：每份文档都必须成对提供中英文翻译。只有单一语言的文档不算「完成」。**

### 命名与配对

| 范围 | 中文版本 | 英文版本 | 说明 |
|---|---|---|---|
| 根 README | `README_zh.md` | `README.md` | 英文无后缀；中文用 `_zh` |
| `docs/` | `docs/*.md` | `docs/en/*.md` | 同名文件；英文置于 `en/` 下 |
| 其他伴生文件 | `*.md` | `*.en.md` | 英文伴生文件使用 `.en.md` 后缀 |
| 本指南 | `CONTRIBUTING_zh.md` | `CONTRIBUTING.md` | 根级 `_zh` 模式 |

每页顶部写语言切换行（链接指向**另一种**语言，当前语言保持纯文本）：

```text
# 英文页面（CONTRIBUTING.md、docs/en/*.md）
[中文](./CONTRIBUTING_zh.md) · English

# 中文页面（CONTRIBUTING_zh.md、docs/*.md）
[English](./CONTRIBUTING.md) · 中文
```

按所在位置调整相对路径（例如 `docs/en/architecture.md` 使用 `[中文版](../architecture.md) · English`，与现有文档一致）。

### 修改文档时

1. **在同一 PR 中更新两个版本**：章节顺序、编号、表格与代码块一致；中文文件是完整翻译，绝不是摘要，反之亦然。
2. **保持链接成对**：中文版指向 `docs/constraints.md` 的链接，英文版应指向 `docs/en/constraints.md`；不留断链或跨语言错配的链接。
3. **保持术语一致**，遵循 `docs/constraints.md` 的术语约定：偏航（Drift）/ 修正弧线（Steering Arc）/ 纠偏指令（Steering Prompt）/ 既定目标（Goal）/ 操舵·纠偏（Steering）/ 无侵入接入 / 会话状态（SessionState）/ 降级（Degraded）/ 效果列表。两版引用代码标识符（`DriftSensor`、`SteeringEffect`、`HostAdapter`、`HitlTransport`、`TelemetrySink`）时使用相同英文写法。
4. **更新两个索引**——新增、重命名或删除文档时，同时更新 `docs/README.md` 与 `docs/en/README.md`。
5. **更新站点导航**：新增文档时在 `site/src/i18n.ts` 的中英两套 `NAV` 列表中成对登记，其顺序即阅读顺序，描述与对应语言的文档索引一致。
6. 验证 Mermaid 图可渲染、相对链接可解析；这是 `docs/roadmap.md` 与 `docs/testing.md` 中文档 DoD 的一部分。

### 站点如何内嵌文档

`site/vite.config.ts` 定义 `docsModule()` Vite 插件：构建时递归收集 `docs/` 下所有 Markdown，以相对 `docs/` 的路径去掉 `.md` 作为键（如 `README`、`architecture`、`en/architecture`），把原文内联进虚拟模块 `virtual:arcs-docs`。**没有运行时 fetch**——产物完全自包含，可托管于任意子路径。`site/src/docs.ts` 将其作为 `ALL_DOCS` 消费，并由 `docContent()` 按语言取原文（缺译回退中文）；`site/src/i18n.ts` 维护中英双语 `NAV` 与界面文案，`site/src/routes.ts` 把语言编码进 hash 路由（`?lang=en`），`site/src/markdown.ts` 按当前文档的物理路径把 `*.md` 链接改写为带语言的 hash 路由，`pnpm site:build` 产出 `site/dist`（由 `.github/workflows/site.yml` 部署）。结果：两种语言版本都会被内嵌并通过底部/顶栏的中英切换访问；新增文件须在中英两套 `NAV` 中成对登记才能从侧栏访问。

---

## 12. 计划管理

计划位于 `plans/`，遵循 `plans/README.md` 的 plan-flow 契约。**目录即状态**：

| 状态 | 目录 | 含义 |
|---|---|---|
| `planing` | `plans/planing/` | 已设计拆解，可实施 |
| `pending` | `plans/pending/` | 阻塞于产品/安全/发布/平台决策 |
| `archive` | `plans/archive/` | 已完成归档，只读（仅限勘误） |

### 优先级定义（本项目化映射）

| 级别 | 定义 |
|---|---|
| **P0** | 文档间硬矛盾：错误的契约签名/枚举若不修正将被未来代码继承（broken gates / wrong contract） |
| **P1** | 阻断 roadmap P0 开工的设计缺口与新架构图（unreachable core features / incomplete recovery） |
| **P2** | 完整性同步：索引、约束、LICENSE、交叉校验 |

完成标准键（含义以各计划文件为准）：`code`（任务全部完成）、`linter_result`（链接与术语检查）、`unit_test_result`（Mermaid 渲染）、`func_test_result`（README↔docs 交叉一致）、`status`（剩余风险与回滚）。

注意两套不同的 P 刻度：`docs/roadmap.md` 的 **P0–P5** 是实施阶段，而 `plans/README.md` 的 **P0–P2** 是计划优先级。不要混淆。

---

## 13. 安全漏洞报告

- **不要**在公开 issue、PR 或讨论中报告疑似漏洞。在修复前公开披露会使用户处于风险中。
- 使用 [`SECURITY.md`](./SECURITY.md) / [`安全报告（中文）`](./SECURITY_zh.md) 描述的私密报告渠道。若不确定用哪个渠道，私信联系维护者，不要公开发布细节。
- 提供受影响版本/commit、宿主与平台、最小复现、影响评估及相关时附概念验证。**请脱敏密钥、令牌与原始数据/用户记录。**
- 在任何公开讨论前，给维护者合理的调查与修复窗口，并与其协调披露。
- 安全相关工作同样遵守双语文档规则（第 11 节）与行为准则（第 2 节）。

---

## 14. PR 合并前自查清单

- [ ] 分支从最新的 `main` 切出，命名符合第 6 节约定
- [ ] 提交符合 Conventional Commits（第 7 节），每个提交一个逻辑变更，前缀可被工具解析
- [ ] `corepack pnpm build` 在所有工作区通过
- [ ] `corepack pnpm lint` 通过（各包 `tsc --noEmit`，未新增 `any`/`@ts-ignore`）
- [ ] `corepack pnpm test` 通过；新测试位于正确的 include 范围并覆盖相应层
- [ ] `corepack pnpm scan` 通过；无新禁止导入；新增 `node:` 内建已写明理由
- [ ] 构建后 `corepack pnpm verify:contracts` 通过（manifest、hook 数量、输出 schema、8 个平台）
- [ ] 守住两条核心承诺：不中断任务、预算内纠偏；fail-open/`degraded` 路径已测试
- [ ] `SteeringEffect` / `DriftSignal` 的 JSON roundtrip 仍有断言；`Suspend` 独立且在末位
- [ ] 延迟预算（CPU 时间）未被突破；新传感器纯函数、同步、无 I/O
- [ ] 文档**两种语言**均已更新，链接、切换行、术语表与两个索引文件成对一致
- [ ] 新增文档时已成对更新站点中英 `NAV`（`site/src/i18n.ts`）；Mermaid 与链接已验证
- [ ] PR 描述包含背景 / 变更 / 验证 / 风险 / 回滚
- [ ] 适用时已更新 `plans/` 中的计划状态/优先级；无密钥、用户数据或无关变更
- [ ] 已为集成方标注第三层真实宿主证据（`scripts/host-real-check.mjs`）

---

## 15. 社区与沟通

### issue 模板建议

| 模板 | 建议字段 |
|---|---|
| 缺陷报告 | ARCS 版本/commit、Node 与 pnpm 版本、宿主及版本、最小复现、期望与实际、脱敏日志、相关审计 JSONL 片段 |
| 功能请求 | 先写问题与目标、提议方案、考虑过的替代方案、服务于哪条核心承诺 |
| 文档问题 | 精确文件路径**与语言版本**、章节/行号、错误或缺漏之处、建议的成对修复 |
| 问答 / 讨论 | 背景、尝试过什么、卡在哪里；解决后标记为已解决 |

### 讨论礼仪

- 新建 issue/讨论前先搜索已有内容；附上最小复现，而非大段文字截图。
- 善意推定，对事不对人，技术论断以证据为准（命令、日志、代码链接）。
- 用线程所用语言回复；跨语言时两种语言都做小结，避免信息丢失。
- 敏感的安全报告不放进公开讨论（第 13 节）。

### 行为准则执行

维护者可以编辑、隐藏或移除离题/攻击性内容，发出警告，并临时或永久限制参与。执行决定私密记录并以尊重的方式沟通。报告走[行为准则](./CODE_OF_CONDUCT_zh.md) / [Code of Conduct](./CODE_OF_CONDUCT.md) 中的私密渠道；贡献者应配合公平调查。

---

感谢你帮助 Agent 始终在轨——实时纠偏，且任务不中断。所有贡献均依 Apache 2.0 授权（见 [`LICENSE`](./LICENSE)）。
