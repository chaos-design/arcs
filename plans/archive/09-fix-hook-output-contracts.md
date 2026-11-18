---
title: 修复 WorkBuddy/Trae hook 输出契约与 additionalContext 位置回归
priority: P0
created: 2026-11-17 16:32:47
updated: 2026-11-17 16:39:23
---

# 修复 WorkBuddy/Trae hook 输出契约与 additionalContext 位置回归

## 目标

依据官方 hooks 文档修正 5 个平台的输出字段：WorkBuddy/Trae 改用 hookSpecificOutput.permissionDecision + 顶层 continue；Claude/ZCode 的 additionalContext 移回 hookSpecificOutput 内；扩展行为级校验覆盖全部 5 个 hook 平台

## 范围

官方依据：WorkBuddy/CodeBuddy 文档 `HookOutput` 用 `hookSpecificOutput.permissionDecision`（allow|deny|ask）+ 顶层 `continue`，改参字段为 `modifiedInput`；Trae 文档 PreToolUse stdout 用 `hookSpecificOutput.permissionDecision` + `permissionDecisionReason` + `updatedInput` + `additionalContext`（均在 hso 内）；Claude Code 官方 hooks 参考同样把 `additionalContext` 列在 `hookSpecificOutput` 内。08 号计划把 Claude/ZCode 的 additionalContext 移到顶层属误改，需回退。

包含：

- `plugins/workbuddy/src/mapping.ts`：输出 `continue` + `hookSpecificOutput.permissionDecision`（block→deny，带非空 reason）；改参用 `modifiedInput`
- `plugins/trae/src/mapping.ts`：Tier C 固定输出 `permissionDecision: 'allow'` + hso 内 `additionalContext`
- `plugins/claude-code/src/mapping.ts` 与 `plugins/zcode/src/mapping.ts`：`additionalContext` 移回 `hookSpecificOutput` 内
- `scripts/behavior-contracts.mjs` 新增通用校验 `validateClaudeCompatiblePreToolUse`（permissionDecision 枚举、hso 字段白名单、hso 内 additionalContext 字符串、continue 布尔）
- `scripts/verify-host-contracts.mjs` 把 5 个 hook 平台的 serialize 输出全部喂给规则断言器
- 单测 + 文档同步

不包含：

- 不改 core/plugin-kit/telemetry/host-kit；不改 opencode/pi/deepseek 的内部动作契约
- 不触发真实宿主或模型调用
- 不改变能力矩阵；Trae 仍为 Tier C 只读放行

## 实施任务

- [x] 修复 WorkBuddy：permissionDecision + continue + modifiedInput，deny 带 reason
- [x] 修复 Trae：permissionDecision=allow + hso 内 additionalContext（Tier C 始终放行）
- [x] 修复 Claude Code / ZCode：additionalContext 移回 hookSpecificOutput 内
- [x] 扩展行为级校验器覆盖 workbuddy/trae/claude/zcode/codex 全部 5 个 hook 平台
- [x] 补齐各平台输出契约单测并更新 README 与 docs/plugins.md 的依据链接
- [x] 全量验证：build/lint/test/scan/contracts

## 完成标准

- [x] code: 6 个任务全部勾选；5 个 Hook 平台输出均通过官方规则断言
- [x] linter_result: `pnpm build && pnpm lint` 退出码均为 0
- [x] unit_test_result: `pnpm test` 退出码 0，workbuddy/trae/claude/zcode 的 serialize 单测覆盖 allow/block/注入路径；记录总用例数
- [x] func_test_result: `pnpm verify:contracts` 报告 5 平台行为级校验全过；`pnpm scan` 0 违规
- [x] status: 已记录各平台 schema 差异（Codex 要求 allow+updatedInput 成对、其余为 Claude 兼容形态）、本机无真实宿主的限制与回滚命令

## 风险与回滚

- 风险：
  1. WorkBuddy/Trae/Claude/ZCode 同为 Claude 兼容形态但字段细节不同（modifiedInput vs updatedInput、continue 层级）→ 校验器按平台分治，不共用同一规则。
  2. 08 号计划把 additionalContext 移到顶层是误判（Claude 官方把它列在 hookSpecificOutput 内）→ 本计划回退，并在校验器中强制断言。
  3. 本机无这些宿主 CLI，契约来自官方文档 → 仍需真实会话验证。
- 回滚：`git checkout -- plugins/{workbuddy,trae,claude-code,zcode}/src/mapping.ts scripts/behavior-contracts.mjs scripts/verify-host-contracts.mjs docs/plugins.md plugins/{workbuddy,trae,claude-code,zcode}/README.md`。其它包未改动。

## 进度日志

- 2026-11-17 16:32:47 创建（planing）
- 2026-11-17 16:39:22 完成 #1 修复 WorkBuddy：permissionDecision + continue + modifiedInput，deny 带 reason
- 2026-11-17 16:39:22 完成 #2 修复 Trae：permissionDecision=allow + hso 内 additionalContext（Tier C 始终放行）
- 2026-11-17 16:39:22 完成 #3 修复 Claude Code / ZCode：additionalContext 移回 hookSpecificOutput 内
- 2026-11-17 16:39:22 完成 #4 扩展行为级校验器覆盖 workbuddy/trae/claude/zcode/codex 全部 5 个 hook 平台
- 2026-11-17 16:39:22 完成 #5 补齐各平台输出契约单测并更新 README 与 docs/plugins.md 的依据链接
- 2026-11-17 16:39:22 完成 #6 全量验证：build/lint/test/scan/contracts
- 2026-11-17 16:39:22 WorkBuddy/Trae 改用 permissionDecision+continue+hso 内 additionalContext，WorkBuddy 改参用 modifiedInput；Claude/ZCode additionalContext 移回 hso；行为校验扩展至 5 平台（85 项）；4 个插件单测与 4 个 README + docs/plugins.md 同步
- 2026-11-17 16:39:22 完成 #7 code: 6 个任务全部勾选；5 个 Hook 平台输出均通过官方规则断言
- 2026-11-17 16:39:22 完成 #8 linter_result: `pnpm build && pnpm lint` 退出码均为 0
- 2026-11-17 16:39:22 完成 #9 unit_test_result: `pnpm test` 退出码 0，workbuddy/trae/claude/zcode 的 serialize 单测覆盖 allow/block/注入路径；记录总用例数
- 2026-11-17 16:39:22 完成 #10 func_test_result: `pnpm verify:contracts` 报告 5 平台行为级校验全过；`pnpm scan` 0 违规
- 2026-11-17 16:39:22 完成 #11 status: 已记录各平台 schema 差异（Codex 要求 allow+updatedInput 成对、其余为 Claude 兼容形态）、本机无真实宿主的限制与回滚命令
- 2026-11-17 16:39:22 build/lint 全绿；vitest 连续 5 次 206/206 全绿；scan 66 文件 0 违规；verify:contracts 85 项 0 违规（5 平台行为级）；风险段记录平台 schema 差异、08 号计划误改回退与回滚命令
- 2026-11-17 16:39:23 归档：任务与完成标准全部满足
