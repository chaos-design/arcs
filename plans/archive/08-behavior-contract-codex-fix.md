---
title: Hook 输出契约行为级校验与 Codex 违规修复
priority: P0
created: 2026-11-17 15:59:58
updated: 2026-11-17 16:05:42
---

# Hook 输出契约行为级校验与 Codex 违规修复

## 目标

把契约校验从静态 grep 升级为执行序列化函数的行为级校验；依据 Codex 官方 output_parser.rs 修复 allow 必须配对 updatedInput、deny 必须有非空 reason 等会导致阻断失效的违规

## 范围

官方依据（已取证，2026-11-17）：`openai/codex` 的 `codex-rs/hooks/schema/generated/pre-tool-use.command.output.schema.json`（已落地为 `scripts/contracts/` fixture）与 `codex-rs/hooks/src/engine/output_parser.rs`。解析器的实际规则**比 schema 更严格**：`allow` 必须与 `updatedInput` 成对（单独 `allow` 判失败）、`deny` 必须带非空 reason、`ask` 一律拒绝。

包含：

- `scripts/contracts/` 落地官方 Codex PreToolUse 输出 schema fixture；`scripts/behavior-contracts.mjs` 零依赖实现字段白名单、enum/const、以及 output_parser 的成对规则断言
- 升级 `scripts/verify-host-contracts.mjs`：除静态结构外，**实际调用** `serializeCodex` / `serializeClaude` 生成输出并做行为级校验
- 修复 `plugins/codex/src/mapping.ts`：PassThrough/纯注入时不再输出孤立 `allow`；`deny` 补非空 reason；`updatedInput` 仅与 `allow` 同现；字段白名单
- 核查 Claude Code 的 `permissionDecision: allow` 单独合法性（Claude 允许单独 allow，不做无谓改动），仅修正与契约不符处
- 行为级单测覆盖 allow / deny / ask / PatchArgs / PassThrough 全路径
- 文档同步 `docs/plugins.md`、`plugins/codex/README.md`

不包含：

- 不引入 ajv 等 JSON Schema 依赖；校验器只覆盖本项目实际使用的子集
- 不修改其它 6 个平台的序列化逻辑（除非行为校验发现同类违规）
- 不触发真实宿主调用或模型消耗
- 不改变能力矩阵与纠偏语义，只修正输出合法性

## 实施任务

- [x] 落地 Codex PreToolUse 输出规则断言（零依赖，依据官方 schema 与 output_parser.rs）
- [x] 升级 verify-host-contracts.mjs：执行 serialize 函数做行为级校验
- [x] 修复 serializeCodex：allow 必须配对 updatedInput、deny 必须带非空 reason、字段白名单
- [x] 核查 Claude Code 输出契约并按需修正 allow/updatedInput 配对
- [x] 补充行为级契约单测覆盖 allow/deny/ask/PatchArgs/PassThrough 全路径
- [x] 更新 docs/plugins.md 与 codex README 的契约依据与限制
- [x] 全量验证：build/lint/test/scan/contracts 行为级校验

## 完成标准

- [x] code: 7 个实施任务全部勾选；Codex 输出不再出现孤立 allow、无理由 deny 或孤立 updatedInput
- [x] linter_result: `pnpm build && pnpm lint` 退出码均为 0
- [x] unit_test_result: `pnpm test` 退出码 0；codex 行为级用例覆盖 5 条效果路径且每条通过规则断言；记录总用例数
- [x] func_test_result: `node scripts/verify-host-contracts.mjs` 退出码 0 且报告"行为级校验"通过数；`pnpm scan` 0 违规；用真实 `serializeCodex` 输出喂给规则断言器全通过
- [x] status: 已记录 schema 落后于 parser 的事实、Claude/Codex 差异、本机无真实宿主的剩余风险与回滚命令

## 风险与回滚

- 风险：
  1. 官方 schema 标注 `ask` 合法但 parser 一律拒绝；`allow` 未标注必须配对 `updatedInput` —— 以 parser 行为为准，schema 仅作字段白名单参考；上游可能变更，需定期复核 fixture。
  2. Claude Code 的 `permissionDecision: allow` 单独合法（用于跳过权限提示），不能照搬 Codex 的成对规则 —— 校验器按平台分治。
  3. `additionalContext` 放在 `hookSpecificOutput` 内才被 Codex 接受（顶层会被 schema 拒绝）—— 已按此实现。
  4. 本机无 Codex/Claude CLI，无法用真实宿主确认 parser 行为 —— 结论来自官方源码与文档，已在 README 标注依据链接。
- 回滚：删除 `scripts/contracts/`、`scripts/behavior-contracts.mjs`；从 `scripts/verify-host-contracts.mjs` 撤回行为级校验段；`git checkout -- plugins/codex/src/mapping.ts plugins/codex/src/plugin.test.ts docs/plugins.md plugins/codex/README.md`。其它包未改动。

## 进度日志

- 2026-11-17 15:59:58 创建（planing）
- 2026-11-17 16:05:42 完成 #1 落地 Codex PreToolUse 输出规则断言（零依赖，依据官方 schema 与 output_parser.rs）
- 2026-11-17 16:05:42 完成 #2 升级 verify-host-contracts.mjs：执行 serialize 函数做行为级校验
- 2026-11-17 16:05:42 完成 #3 修复 serializeCodex：allow 必须配对 updatedInput、deny 必须带非空 reason、字段白名单
- 2026-11-17 16:05:42 完成 #4 核查 Claude Code 输出契约并按需修正 allow/updatedInput 配对
- 2026-11-17 16:05:42 完成 #5 补充行为级契约单测覆盖 allow/deny/ask/PatchArgs/PassThrough 全路径
- 2026-11-17 16:05:42 完成 #6 更新 docs/plugins.md 与 codex README 的契约依据与限制
- 2026-11-17 16:05:42 完成 #7 全量验证：build/lint/test/scan/contracts 行为级校验
- 2026-11-17 16:05:42 官方 schema fixture + behavior-contracts.mjs 零依赖规则断言；verify-host-contracts 升级为执行 serialize 的行为级校验（75 项）；修复 Codex 孤立 allow/无理由 deny、Claude 非法 block→deny、ZCode deny 缺理由；codex 13 + claude 8 用例；docs 与 README 同步
- 2026-11-17 16:05:42 完成 #8 code: 7 个实施任务全部勾选；Codex 输出不再出现孤立 allow、无理由 deny 或孤立 updatedInput
- 2026-11-17 16:05:42 完成 #9 linter_result: `pnpm build && pnpm lint` 退出码均为 0
- 2026-11-17 16:05:42 完成 #10 unit_test_result: `pnpm test` 退出码 0；codex 行为级用例覆盖 5 条效果路径且每条通过规则断言；记录总用例数
- 2026-11-17 16:05:42 完成 #11 func_test_result: `node scripts/verify-host-contracts.mjs` 退出码 0 且报告"行为级校验"通过数；`pnpm scan` 0 违规；用真实 `serializeCodex` 输出喂给规则断言器全通过
- 2026-11-17 16:05:42 完成 #12 status: 已记录 schema 落后于 parser 的事实、Claude/Codex 差异、本机无真实宿主的剩余风险与回滚命令
- 2026-11-17 16:05:42 build/lint 全绿；vitest 连续 5 次 206/206 全绿（21 文件）；scan 66 文件 0 违规；verify:contracts 75 项 0 违规含 Codex/Claude/ZCode 行为级输出断言；风险段记录 schema 落后 parser、Claude allow 单独合法差异与回滚
- 2026-11-17 16:05:42 归档：任务与完成标准全部满足
