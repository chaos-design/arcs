---
title: ARCS 全平台 Agent 宿主插件
priority: P1
created: 2026-11-17 13:26:29
updated: 2026-11-17 13:43:22
---

# ARCS 全平台 Agent 宿主插件

## 目标

让 ARCS 纠偏能力以各平台原生插件形态落地，覆盖 astro 同款 8 家 Agent 平台；借鉴 astro 的多平台接入形态，数据契约与 HostAdapter 全部自研；按平台能力分级纠偏，全程 fail-open 不中断任务

## 范围

包含：

- 新增 `packages/host-kit`：Hook 入口桥（stdin 读宿主 payload → `RawEvent` → `PluginRuntime.run` → 宿主输出 JSON）、能力矩阵（capabilities）、按能力降级的效果翻译、fail-open（任何异常 exit 0 且只写 stderr）。这是 8 个插件唯一的共用运行时，禁止每个平台各写一份 recorder。
- 8 个平台插件，每个含 `HostAdapter`（subscribe/normalize/materialize）、原生事件 → `RawEvent` 映射、入口（hook 命令 / 全局插件 / bundle）、清单与 hooks 配置、单测：
  - Tier A（可改参 + 可阻塞，完整 L1-L4）：`plugins/claude-code`（17 hooks，`updatedInput` + `permissionDecision`）、`plugins/codex`（12 hooks）、`plugins/opencode`（全局插件 `tool.execute.before`）。
  - Tier B（可阻塞但难改参，L1-L3 + 注入，L4 降级为 block）：`plugins/zcode`（7 hooks）、`plugins/workbuddy`（25 hooks，`--event=<Name>`）、`plugins/pi`（全局扩展 `pi.on`）、`plugins/deepseek`（Cordis bundle `ctx.on`）。
  - Tier C（只读观测）：`plugins/trae`（项目 hooks）；仅采集与审计，提示注入仅在宿主允许 hook 输出追加上下文时生效。
- 平台名常量、能力矩阵、事件映射基类集中在 `host-kit`，插件内不得散落硬编码平台名。
- 配套改动：`scripts/scan-deps.mjs` 的 RULES 增加 host-kit 与 8 个插件目录（node 内建逐条白名单）；`vitest.config.ts` alias 视新依赖补充；`turbo.json` 依赖拓扑自动纳入新包。
- 安装/构建脚本与文档同步：`docs/plugins.md` 能力矩阵表、`README_zh.md` 插件清单、各插件 `README.md`。

不包含：

- 不移植 astro 的 `schemaVersion: 2` 事件信封、`trace-recorder.cjs`、脱敏规则、`~/.astrox` JSONL 存储与 HTTP/SSE 控制台 —— ARCS 沿用自有 `RawEvent` / `AuditEvent` / `PluginRuntime`。
- 不实现 Browser SDK、HTTP 摄入、CLI ingest、Codex 历史导入等 astro 通用通道。
- 不在真实宿主环境做端到端实测（本机无这些 CLI）；以文档与 astro 取证为契约，用 mock host + 子进程夹具验证。
- 不改动 `packages/core`、`packages/plugin-kit`、`packages/telemetry` 的算法与契约；若发现硬矛盾，另开计划而非夹带修改。
- 不实现各平台的 marketplace 发布/上架，只产出可本地安装（`--plugin-dir` / 项目 hooks / 插件目录）的插件形态。

## 实施任务

- [x] 落地 8 平台能力矩阵并同步 docs/plugins.md
- [x] 新增 packages/host-kit：Hook 入口桥（stdin→RawEvent→runtime.run→宿主输出，fail-open exit 0）
- [x] 新增 packages/host-kit：事件映射基类型与按 capability 降级的效果翻译
- [x] 扩展 scan-deps.mjs / vitest.config.ts / turbo 纳入 host-kit 与全部 plugins
- [x] 实现 plugins/claude-code（17 hooks，L1-L4 + HITL，updatedInput/permissionDecision）
- [x] 实现 plugins/codex（12 hooks，L1-L4 尽力 + 输入改写能力边界）
- [x] 实现 plugins/opencode（全局插件 + tool.execute.before，L1-L4，claim 去重）
- [x] 实现 plugins/zcode（7 hooks，L1-L3 + 注入）
- [x] 实现 plugins/workbuddy（25 hooks，--event 模式，L1-L3 + 注入）
- [x] 实现 plugins/pi（全局扩展 pi.on，L1-L3 + 注入）
- [x] 实现 plugins/deepseek（Cordis bundle ctx.on，L1-L3 + 注入）
- [x] 实现 plugins/trae（项目 hooks，观测 + 提示注入）
- [x] 跨平台能力一致性测试：capabilities 声明与 materialize 行为一致 + fail-open
- [x] 提供安装/构建脚本与 README 插件章节同步
- [x] 全量验证：build/lint/test/scan + 每平台端到端夹具

## 完成标准

- [x] code: 15 个实施任务全部勾选；`packages/host-kit` 与 `plugins/{claude-code,codex,opencode,zcode,workbuddy,pi,deepseek,trae}` 全部落地；core/plugin-kit/telemetry 零改动
- [x] linter_result: `pnpm build && pnpm lint` 退出码均为 0，新增的 9 个包均被 turbo 拓扑纳入、无 TS error
- [x] unit_test_result: `pnpm test` 退出码为 0；host-kit ≥ 8 用例，8 个平台插件每个 ≥ 2 用例（normalize + materialize/降级），报告中记录总用例数
- [x] func_test_result: `pnpm scan` 退出码为 0（host-kit 与 8 插件均在白名单内，node 内建逐条登记）；每平台至少 1 条「原生事件 → RawEvent → 纠偏效果 → 宿主输出」夹具验证，记录实际效果类型；每平台另验证一条异常输入的 fail-open 路径（exit 0 / 放行）
- [x] status: 已记录未在真实宿主实测的平台清单、仅支持降级纠偏的平台清单、上游品牌重命名风险，以及下方具体回滚命令

## 风险与回滚

- 风险：
  1. 本机无真实宿主 CLI，hook 输出契约来自文档与 astro 取证，可能与宿主实际版本不符 → 每平台入口做严格 fail-open 与输出自校验，错误只写 stderr，绝不阻塞 Agent。
  2. 只读 Hook 平台（Trae，及 WorkBuddy/ZCode/DeepSeek/Pi 的部分场景）无法改参或阻塞审批，L1/L4 只能降级为 inject/block → 必须在 `docs/plugins.md` 逐平台标注真实能力，不做虚假承诺。
  3. 上游品牌重命名（本地 astro 分支已将 codex → chatgpt）可使平台目录名失效 → 平台名常量集中在 host-kit 一处，插件内禁止散落硬编码。
  4. Hook 普遍有 5s 超时，而 HITL 默认 120s → hook 平台的 L4 必须返回宿主原生的 `ask`/`permissionDecision` 语义，禁止在入口内同步长等待审批。
  5. 8 个插件同时新增易使 scan-deps 的 node 白名单过宽、削弱红线 → 仅放行实际使用的 node 内建，逐条登记理由。
  6. 实施中核实到 Codex 官方 schema 虽列出 `ask`，但当前版本解析后不支持 → 能力矩阵已改为 `suspend=false`、输出降级 `deny`；仍需真实宿主确认 `deny` 确实阻断工具执行。
  7. DeepSeek 的 `block` 目前通过 `ctx.emit('arcs/decision')` 广播并存入 handle，插件本身不调用宿主拒绝 API → 宿主必须订阅该事件才能真正阻断，否则仅停留在审计层。
  8. OpenCode / Pi 的会话 claim 是单进程内存 Set，无法跨进程去重 → 生产环境需替换为带 TTL 的文件锁（已在各自 README 标注）。
- 回滚：删除 `plugins/{claude-code,codex,opencode,zcode,workbuddy,pi,deepseek,trae}` 与 `packages/host-kit`；从 `scripts/scan-deps.mjs` 的 RULES、`vitest.config.ts` 的 alias、`turbo.json` 撤回新增项；`git checkout -- docs/plugins.md README_zh.md` 还原文档。core/plugin-kit/telemetry 未被改动，无需回滚；本计划保持 planing 状态待重新评估，不直接归档。

## 进度日志

- 2026-11-17 13:26:29 创建（planing）
- 2026-11-17 13:29:52 完成 #2 新增 packages/host-kit：Hook 入口桥（stdin→RawEvent→runtime.run→宿主输出，fail-open exit 0）
- 2026-11-17 13:29:52 完成 #3 新增 packages/host-kit：事件映射基类型与按 capability 降级的效果翻译
- 2026-11-17 13:29:52 完成 #4 扩展 scan-deps.mjs / vitest.config.ts / turbo 纳入 host-kit 与全部 plugins
- 2026-11-17 13:29:52 host-kit 新增 platforms/capabilities/decision/mapping/entry，build 通过；vitest packages/host-kit/src 17 用例全绿（决策降级 10 + 入口桥 7）；scan-deps 新增 host-kit 与 8 插件规则，pnpm scan 36 文件 0 违规
- 2026-11-17 13:32:37 完成 #5 实现 plugins/claude-code（17 hooks，L1-L4 + HITL，updatedInput/permissionDecision）
- 2026-11-17 13:32:37 plugins/claude-code 落地：17 hooks + manifest + mapping/adapter/cli/index，pnpm build 通过，vitest 7 用例全绿，端到端危险命令产出 ask
- 2026-11-17 13:43:02 完成 #1 落地 8 平台能力矩阵并同步 docs/plugins.md
- 2026-11-17 13:43:02 完成 #6 实现 plugins/codex（12 hooks，L1-L4 尽力 + 输入改写能力边界）
- 2026-11-17 13:43:02 完成 #7 实现 plugins/opencode（全局插件 + tool.execute.before，L1-L4，claim 去重）
- 2026-11-17 13:43:02 完成 #8 实现 plugins/zcode（7 hooks，L1-L3 + 注入）
- 2026-11-17 13:43:02 完成 #9 实现 plugins/workbuddy（25 hooks，--event 模式，L1-L3 + 注入）
- 2026-11-17 13:43:02 完成 #10 实现 plugins/pi（全局扩展 pi.on，L1-L3 + 注入）
- 2026-11-17 13:43:02 完成 #11 实现 plugins/deepseek（Cordis bundle ctx.on，L1-L3 + 注入）
- 2026-11-17 13:43:02 完成 #12 实现 plugins/trae（项目 hooks，观测 + 提示注入）
- 2026-11-17 13:43:02 8 平台插件全部落地：claude-code(7用例)/codex(9)/opencode(10)/zcode(9)/workbuddy(9)/pi(9)/deepseek(9)/trae(9)；共 71 平台用例；docs/plugins.md 能力矩阵与 README_zh.md 同步；Codex ask 因宿主不支持已如实改为 suspend=false 并降级 deny
- 2026-11-17 13:43:02 完成 #13 跨平台能力一致性测试：capabilities 声明与 materialize 行为一致 + fail-open
- 2026-11-17 13:43:02 完成 #14 提供安装/构建脚本与 README 插件章节同步
- 2026-11-17 13:43:02 完成 #15 全量验证：build/lint/test/scan + 每平台端到端夹具
- 2026-11-17 13:43:02 conformance.test.ts 6 条跨平台一致性用例锁定能力↔行为；build-host-plugins/install-host-plugins 脚本落地且 trae hooks 合并两次仍为 13 事件/1 组（幂等）；全量 build/lint/test/scan 通过：181 用例/19 文件、64 文件 0 违规
- 2026-11-17 13:43:17 完成 #16 code: 15 个实施任务全部勾选；`packages/host-kit` 与 `plugins/{claude-code,codex,opencode,zcode,workbuddy,pi,deepseek,trae}` 全部落地；core/plugin-kit/telemetry 零改动
- 2026-11-17 13:43:17 完成 #17 linter_result: `pnpm build && pnpm lint` 退出码均为 0，新增的 9 个包均被 turbo 拓扑纳入、无 TS error
- 2026-11-17 13:43:17 完成 #18 unit_test_result: `pnpm test` 退出码为 0；host-kit ≥ 8 用例，8 个平台插件每个 ≥ 2 用例（normalize + materialize/降级），报告中记录总用例数
- 2026-11-17 13:43:17 完成 #19 func_test_result: `pnpm scan` 退出码为 0（host-kit 与 8 插件均在白名单内，node 内建逐条登记）；每平台至少 1 条「原生事件 → RawEvent → 纠偏效果 → 宿主输出」夹具验证，记录实际效果类型；每平台另验证一条异常输入的 fail-open 路径（exit 0 / 放行）
- 2026-11-17 13:43:17 完成 #20 status: 已记录未在真实宿主实测的平台清单、仅支持降级纠偏的平台清单、上游品牌重命名风险，以及下方具体回滚命令
- 2026-11-17 13:43:17 code 15/15；build+lint 均 15/15 tasks exit 0；vitest 19 文件 181 用例全绿（host-kit 34、8 平台 71、conformance 6、既有 70）；scan 64 文件 0 违规，8 平台各有 RawEvent→纠偏→宿主输出端到端夹具；风险 8 条与回滚命令已写入风险与回滚段
- 2026-11-17 13:43:22 归档：任务与完成标准全部满足
