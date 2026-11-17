---
title: 本地审计落盘与真实宿主验证准备
priority: P1
created: 2026-11-17 15:45:04
updated: 2026-11-17 15:55:14
---

# 本地审计落盘与真实宿主验证准备

## 目标

解决上一轮真实宿主联调被凭据/额度阻断的问题：给宿主插件加持久化审计落盘，使用户用自有账号跑一次真实会话即可留下可验证证据，并提供半自动检查脚本

## 范围

承接 06 号计划（已归档）风险 #1 与"真实宿主验证"待办。本机 OpenCode 免费额度已耗尽（HTTP 429）、无其它宿主 CLI 与模型凭据，真实会话无法在本环境执行；本计划把验证所需的可观测性补齐，把"不可做"变成"用户跑一次即可验证"。

包含：

- `packages/host-kit` 新增 `FileAuditSink`（实现 `TelemetrySink`）：append-only JSONL，按 `host` 与 UTC 日期分文件 `<home>/audit/<host>/<YYYY-MM-DD>.jsonl`；路径由 `ARCS_AUDIT_FILE`（精确文件）或 `ARCS_HOME`（默认 `~/.arcs`）决定；`emit` 失败一律静默（遥测不得阻塞主链）。
- `createAuditSink(env)` 工厂：返回 `FileAuditSink | undefined`，未配置任何环境变量时不创建（保持现有行为）。
- `runHookEntry` 增加可选 `sink` 参数（显式优先，否则读 env）；`HookEntryAdapter` 构造不变，`PluginRuntime` 已支持 `sink`。
- opencode / pi / deepseek 三条订阅管线创建 `PluginRuntime` 时传入按 env 构造的 sink；hook 型插件由 `runHookEntry` 统一处理。
- `scripts/host-real-check.mjs`：探测本机有哪些宿主 CLI、检查插件产物是否存在、打印该平台的真实会话步骤与审计文件路径；`--verify` 读取审计文件并报告自标记以来的事件（level/degraded/host 计数）。
- 单测与文档同步。

不包含：

- 不触发任何模型调用，不消耗额度，不改动用户全局配置。
- 不修改 `packages/telemetry` 的纯逻辑边界（`FileAuditSink` 放在已允许 node I/O 的 host-kit）。
- 不实现日志轮转、压缩、脱敏或远程上传；敏感字段脱敏仍由宿主侧负责，本 sink 只写 `AuditEvent` 已校验的结构化字段。
- 不改变任何插件的纠偏语义、能力矩阵或默认值（未配置环境变量时行为与当前完全一致）。

## 实施任务

- [x] host-kit 新增 FileAuditSink：append-only JSONL，路径由 ARCS_HOME/ARCS_AUDIT_FILE 决定，写失败静默降级
- [x] runHookEntry 与订阅型插件装配 sink（环境变量优先，显式参数覆盖）
- [x] 新增 scripts/host-real-check.mjs：探测 CLI/安装状态、给出真实会话步骤、校验审计文件增量
- [x] 补充单测：FileAuditSink 追加/幂等路径/写失败 fail-open/sink 装配
- [x] 同步 docs/telemetry.md、docs/plugins.md 与各插件 README 的审计说明
- [x] 全量验证：build/lint/test/scan/contracts + 用真实 plugin runtime 产出审计文件夹具
- [x] 修复 core 引擎 sense 预算误判：并行测试负载下的墙钟停顿会误跳可选语义传感器，导致 langchain L3 用例偶发失败；改为累计传感器实际执行耗时

## 完成标准

- [x] code: 7 个实施任务全部勾选；未配置 env 时所有插件行为与改动前一致；core 预算修复不改变正常路径语义
- [x] linter_result: `pnpm build && pnpm lint` 退出码均为 0，15 个 workspace 包无 TS error
- [x] unit_test_result: `pnpm test` 退出码 0；FileAuditSink ≥ 5 用例（追加、按 host/日期分文件、精确路径覆盖、写失败静默、未配置 env 不创建）；sink 装配 ≥ 2 用例；记录总用例数
- [x] func_test_result: `pnpm scan` 退出码 0 且 0 违规（host-kit 的 node:fs/node:path 白名单已覆盖）；`pnpm verify:contracts` 60 项 0 违规；用真实 `PluginRuntime` + `FileAuditSink` 在临时目录产出 JSONL 并检查字段完整；`host-real-check.mjs --verify` 能读出该文件的 level/degraded/host 统计
- [x] status: 已记录本机无法真实会话的客观原因（429 免费额度 + 无其它 CLI 凭据）、审计文件不含原始 prompt/工具参数的事实、以及下方具体回滚命令

## 风险与回滚

- 风险：
  1. 免费模型额度耗尽（OpenCode 返回 429，retryAfter 约 16 小时），本机也无 claude/codex/dsh 等 CLI → 真实会话必须由用户在自有环境执行，本计划只提供可验证的审计证据链。
  2. 审计文件写入用户磁盘；虽然只含 `AuditEvent` 结构化字段（level/signals/effects/latency/degraded），不含原始 prompt 与工具参数，但 `evidence` 文本可能含路径信息 → 文档提示按需管理文件权限。
  3. 多进程同时写同一 JSONL 可能出现交错行 → 使用 `appendFileSync` 单次写入且每行完整；极端情况下单行损坏不影响后续读取（解析时跳过坏行）。
  4. `ARCS_AUDIT_FILE` 指向不可写路径时 `emit` 静默失败 → 插件行为不变但审计缺失；`host-real-check.mjs` 会提示路径可写性。
  5. 新增 env 变量若与已有 `ARCS_*` 命名冲突 → 统一前缀 `ARCS_AUDIT_`，并在文档中集中列出。
  6. 验证阶段发现已有 langchain L3 用例偶发失败：core `sense` 用整段墙钟时间判断预算，并行负载的调度停顿会误跳可选语义传感器 → 改为累计各传感器实际执行耗时（工作时长而非墙钟），不改预算数值与降级语义。
- 回滚：删除 `packages/host-kit/src/audit-sink.ts` 与其测试、`scripts/host-real-check.mjs`；从 `packages/host-kit/src/index.ts` 移除导出；从 `packages/host-kit/src/entry.ts` 与 `plugins/{opencode,pi,deepseek}/src` 撤回 sink 装配（恢复无 sink 的 `PluginRuntime` 构造）；从 `package.json` 移除 `real-check` 脚本；`git checkout -- docs/telemetry.md docs/plugins.md plugins/{opencode,pi,deepseek}/README.md packages/core/src/engine.ts`。plugin-kit/telemetry 未改动，无需回滚。

## 进度日志

- 2026-11-17 15:45:04 创建（planing）
- 2026-11-17 15:55:14 完成 #1 host-kit 新增 FileAuditSink：append-only JSONL，路径由 ARCS_HOME/ARCS_AUDIT_FILE 决定，写失败静默降级
- 2026-11-17 15:55:14 完成 #2 runHookEntry 与订阅型插件装配 sink（环境变量优先，显式参数覆盖）
- 2026-11-17 15:55:14 完成 #3 新增 scripts/host-real-check.mjs：探测 CLI/安装状态、给出真实会话步骤、校验审计文件增量
- 2026-11-17 15:55:14 完成 #4 补充单测：FileAuditSink 追加/幂等路径/写失败 fail-open/sink 装配
- 2026-11-17 15:55:14 完成 #5 同步 docs/telemetry.md、docs/plugins.md 与各插件 README 的审计说明
- 2026-11-17 15:55:14 完成 #6 全量验证：build/lint/test/scan/contracts + 用真实 plugin runtime 产出审计文件夹具
- 2026-11-17 15:55:14 完成 #7 修复 core 引擎 sense 预算误判：并行测试负载下的墙钟停顿会误跳可选语义传感器，导致 langchain L3 用例偶发失败；改为累计传感器实际执行耗时
- 2026-11-17 15:55:14 FileAuditSink + createAuditSink 落地并接入 runHookEntry/opencode/pi/deepseek；host-real-check.mjs 探测+--verify 统计；audit-sink.test.ts 8 用例；docs/telemetry.md/plugins.md 与 3 个 README 同步；core sense 预算改为累计实际执行耗时，连续 10 次全量测试无偶发失败
- 2026-11-17 15:55:14 完成 #8 code: 7 个实施任务全部勾选；未配置 env 时所有插件行为与改动前一致；core 预算修复不改变正常路径语义
- 2026-11-17 15:55:14 完成 #9 linter_result: `pnpm build && pnpm lint` 退出码均为 0，15 个 workspace 包无 TS error
- 2026-11-17 15:55:14 完成 #10 unit_test_result: `pnpm test` 退出码 0；FileAuditSink ≥ 5 用例（追加、按 host/日期分文件、精确路径覆盖、写失败静默、未配置 env 不创建）；sink 装配 ≥ 2 用例；记录总用例数
- 2026-11-17 15:55:14 完成 #11 func_test_result: `pnpm scan` 退出码 0 且 0 违规（host-kit 的 node:fs/node:path 白名单已覆盖）；`pnpm verify:contracts` 60 项 0 违规；用真实 `PluginRuntime` + `FileAuditSink` 在临时目录产出 JSONL 并检查字段完整；`host-real-check.mjs --verify` 能读出该文件的 level/degraded/host 统计
- 2026-11-17 15:55:14 完成 #12 status: 已记录本机无法真实会话的客观原因（429 免费额度 + 无其它 CLI 凭据）、审计文件不含原始 prompt/工具参数的事实、以及下方具体回滚命令
- 2026-11-17 15:55:14 code 7/7；build/lint 全绿；vitest 连续 10 次 201/201 全绿（新增 8 审计用例）；scan 66 文件 0 违规、contracts 60 项 0 违规；真实 runtime + FileAuditSink 产出 JSONL 且 host-real-check --verify 读出 level=4；风险段含 429 额度、审计内容边界与 core 回滚
- 2026-11-17 15:55:14 归档：任务与完成标准全部满足
