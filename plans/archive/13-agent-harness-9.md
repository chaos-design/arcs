---
title: Agent harness 插件统一架构与 9 平台覆盖
priority: P1
created: 2026-11-21 00:53:27
updated: 2026-11-21 01:34:57
---

# Agent harness 插件统一架构与 9 平台覆盖

## 目标

把 8 个已有宿主插件统一到 host-kit 的 hook 原语架构，并新增 ChatGPT / PL Agent / Qwen Code 三个插件，全量集成后提 PR

## 范围

- 包含：`packages/host-kit` 的统一 hook 原语（`parseHookPayload` / `hookContextText` / `serializeHookDecision`）与单测；`PLATFORMS` 由 8 扩到 11（`chatgpt` / `pl-agent` / `qwen-code`），`HOST_CAPABILITIES` 同步；8 个已有平台插件迁移到原语；3 个新插件包（src/cli/hooks/manifest/README/test）；`packages/cli/src/plugins.ts`、`scripts/install-host-plugins.mjs`、`scripts/verify-host-contracts.mjs`、`docs/plugins.md`、`docs/en/plugins.md`、`README_zh.md`、`README.md`。
- 不包含：core 检测/规划算法、plugin-kit 运行时协议、telemetry 存储格式、MCP 代理实现、SDK 适配、site 站点、真实宿主进程实测（仍需集成方执行 `pnpm real-check`）。
- 不做无证据的宿主承诺：ChatGPT / PL Agent / Qwen Code 的 hook 契约按「Claude 兼容 PreToolUse + `--event`」形态实现，并在文档标记为待真实宿主验证。

## 实施任务

- [x] 基于 origin/main 创建 feat/agent-harness-plugins 分支并确认基线
- [x] host-kit 新增统一 hook 解析/决策序列化原语并补单测
- [x] host-kit 平台清单与能力矩阵扩展到 11 个平台并补 conformance 校验
- [x] 重写 claude-code 插件为统一 hook 原语架构并保持行为
- [x] 重写 workbuddy/zcode/trae 插件为统一架构并保持行为
- [x] 重写 opencode/deepseek 插件为统一架构并保持行为
- [x] 升级 codex/pi 插件到统一架构并保持行为
- [x] 新增 chatgpt 插件（Hook 型）与单测
- [x] 新增 pl-agent 插件（Hook 型）与单测
- [x] 新增 qwen-code 插件（Hook 型）与单测
- [x] 同步 CLI 清单、安装脚本与 verify:contracts 护栏
- [x] 同步中文/英文文档与 README 插件清单
- [x] 全量验证：build / test / lint / verify:contracts / scan
- [x] 提交并推送分支，创建 PR

## 完成标准

- [x] code: 11 个平台插件全部使用 host-kit 统一原语，`PLATFORMS`/`HOST_CAPABILITIES`/CLI/安装器/契约护栏/文档均含 11 个平台，旧的分叉解析逻辑删除
- [x] linter_result: `pnpm lint` 与 `pnpm verify:contracts` 退出码均为 0，契约校验项数 ≥ 85
- [x] unit_test_result: `pnpm test` 全绿；host-kit 原语单测覆盖畸形 JSON、事件别名、决策降级与序列化输出
- [x] func_test_result: `pnpm build` + `node scripts/host-real-check.mjs --help` + `pnpm --filter @chaos-design/arcs-cli exec node dist/cli.js list` 输出 12 个插件（含 MCP）
- [x] status: 状态、剩余风险（真实宿主实测）与回滚方式已记录

## 风险与回滚

- 风险：迁移改变既有插件的序列化字节输出，导致官方 schema 断言失败；新平台的宿主契约可能与假设不一致；文档与代码漂移。
- 回滚：`git revert <merge commit>` 或删除 PR 分支；单插件回退可将该插件目录重置到 origin/main 对应版本，host-kit 的原语为新增导出、不影响旧调用方。

## 进度日志

- 2026-11-21 00:53:27 创建（planing）
- 2026-11-21 00:55:18 完成 #1 基于 origin/main 创建 feat/agent-harness-plugins 分支并确认基线
- 2026-11-21 00:55:18 基于 origin/main (7e88888) 创建 feat/agent-harness-plugins，工作树干净
- 2026-11-21 00:59:45 完成 #2 host-kit 新增统一 hook 解析/决策序列化原语并补单测
- 2026-11-21 00:59:45 packages/host-kit/src/hook.ts + hook.test.ts：11 项单测全绿（pnpm vitest run packages/host-kit/src/hook.test.ts）
- 2026-11-21 01:02:44 完成 #3 host-kit 平台清单与能力矩阵扩展到 11 个平台并补 conformance 校验
- 2026-11-21 01:02:44 PLATFORMS 8→11，HOST_CAPABILITIES 新增 chatgpt/pl-agent/qwen-code；host-kit conformance 6 项全绿
- 2026-11-21 01:07:12 完成 #4 重写 claude-code 插件为统一 hook 原语架构并保持行为
- 2026-11-21 01:07:12 完成 #5 重写 workbuddy/zcode/trae 插件为统一架构并保持行为
- 2026-11-21 01:07:12 完成 #6 重写 opencode/deepseek 插件为统一架构并保持行为
- 2026-11-21 01:07:12 完成 #7 升级 codex/pi 插件到统一架构并保持行为
- 2026-11-21 01:07:12 8 个存量插件迁移到 host-kit 统一原语；pnpm test 24 文件 259 项全绿，行为保持不变
- 2026-11-21 01:08:58 完成 #8 新增 chatgpt 插件（Hook 型）与单测
- 2026-11-21 01:08:58 完成 #9 新增 pl-agent 插件（Hook 型）与单测
- 2026-11-21 01:08:58 完成 #10 新增 qwen-code 插件（Hook 型）与单测
- 2026-11-21 01:08:58 新增 chatgpt/pl-agent/qwen-code 三个插件包（src/hooks/manifest/README/单测）；22 项新单测全绿
- 2026-11-21 01:29:51 完成 #11 同步 CLI 清单、安装脚本与 verify:contracts 护栏
- 2026-11-21 01:29:51 完成 #12 同步中文/英文文档与 README 插件清单
- 2026-11-21 01:29:51 CLI 清单 9→12、安装器/构建脚本/real-check/契约护栏同步；中英 README、docs、CHANGELOG 同步至 11 平台
- 2026-11-21 01:30:31 完成 #13 全量验证：build / test / lint / verify:contracts / scan
- 2026-11-21 01:30:31 build 20/20、lint 20/20、test 27 文件 281 项全绿、verify:contracts 133 项 0 违规、scan 68 文件 0 违规；CLI list 输出 12 个插件，real-check 探测 11 个插件产物
- 2026-11-21 01:30:52 完成 #15 code: 11 个平台插件全部使用 host-kit 统一原语，`PLATFORMS`/`HOST_CAPABILITIES`/CLI/安装器/契约护栏/文档均含 11 个平台，旧的分叉解析逻辑删除
- 2026-11-21 01:30:52 11 个平台插件 mapping 均调用 host-kit 原语；PLATFORMS/HOST_CAPABILITIES 11 项；CLI 12 项；安装器/构建脚本/real-check/契约护栏与中英文档同步
- 2026-11-21 01:30:52 完成 #16 linter_result: `pnpm lint` 与 `pnpm verify:contracts` 退出码均为 0，契约校验项数 ≥ 85
- 2026-11-21 01:30:52 pnpm lint 退出 0（20/20 tasks）；pnpm verify:contracts 退出 0（133 项 0 违规）
- 2026-11-21 01:30:52 完成 #17 unit_test_result: `pnpm test` 全绿；host-kit 原语单测覆盖畸形 JSON、事件别名、决策降级与序列化输出
- 2026-11-21 01:30:52 pnpm test 退出 0：27 文件 281 项全绿；hook.test.ts 11 项覆盖畸形 JSON/别名/降级/序列化
- 2026-11-21 01:30:52 完成 #18 func_test_result: `pnpm build` + `node scripts/host-real-check.mjs --help` + `pnpm --filter @chaos-design/arcs-cli exec node dist/cli.js list` 输出 12 个插件（含 MCP）
- 2026-11-21 01:30:52 pnpm build 20/20 成功；node scripts/host-real-check.mjs 探测 11 个插件产物；packages/cli dist/cli.js list 输出 12 个插件
- 2026-11-21 01:30:52 完成 #19 status: 状态、剩余风险（真实宿主实测）与回滚方式已记录
- 2026-11-21 01:30:52 状态：实现与验证完成，待提交 PR；剩余风险：ChatGPT/PL Agent/Qwen Code 真实宿主契约待集成方实测；回滚：revert PR 或将插件目录重置到 origin/main
- 2026-11-21 01:34:57 完成 #14 提交并推送分支，创建 PR
- 2026-11-21 01:34:57 提交 957a8e6，推送 feat/agent-harness-plugins，创建 PR #5（base main）：https://github.com/chaos-design/arcs/pull/5
- 2026-11-21 01:34:57 归档：任务与完成标准全部满足
