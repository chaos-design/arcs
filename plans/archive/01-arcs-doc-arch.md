---
title: ARCS 架构文档优化
priority: P1
created: 2026-11-16 23:24:40
updated: 2026-11-16 23:42:32
---

# ARCS 架构文档优化

## 目标

修订 docs 架构文档，消除内部矛盾、补齐设计缺口、补充更新架构图，使设计达到可直接按 roadmap P0 开工的完整度；仅文档，不写代码

## 范围

- 包含：`README_zh.md`、`docs/` 全部 11 份文档的修订；新建 `docs/telemetry.md`、`docs/testing.md`、`LICENSE`；新增/更新 Mermaid 架构图约 13 幅；`plans/README.md` 契约。
- 不包含：任何代码实现（packages/sdk/plugins 工程骨架与算法按 docs/roadmap.md 分阶段另行立项）。

## 实施任务

- [x] [P0] core.md：kind 补 schema、plan 返回 SteeringEffect[]、定义 ToolCall/Snapshot/Budget、默认传感器清单、预算分解、降级语义、新增 core 流水线图
- [x] [P0] plugin-kit.md：run 异步签名 + SteeringOutcome、定义 RawEvent、SessionState/TTL、HITL 恢复契约、配置优先级、fail-open 落地、新增编排流水线图、TelemetrySink 归属标注
- [x] [P0] 算子名统一：key-flows.md / plugins.md / README_zh.md 废除 ArgHotPatch/ContextInject/CourseRedirect/HITLSuspend，改用 Effect 类型名
- [x] [P0] architecture.md：总纲补 fail-open、依赖单链化 plugins→plugin-kit→telemetry→core、分层图与时序图更新
- [x] [P1] key-flows.md：新增 HITL 挂起-恢复时序图与失败降级路径图；闭环图/插件时序图更新
- [x] [P1] 新建 docs/testing.md：三层测试策略（core 单测 / ReplayHarness 回放仿真 / 真宿主 E2E）
- [x] [P1] sdk.md：定义 SteerEvent 契约、onSteer 示例字段更新、新增 SDK 拦截点时序图
- [x] [P1] plugins.md：补 claude-code HookAdapter、补 MCP 仅 L1-L3 原因、新增接入拓扑图
- [x] [P1] 新建 docs/telemetry.md：AuditEvent 模型、偏移曲线、TelemetrySink 契约、依赖方向、审计事件流图
- [x] [P2] constraints.md：新增约束 #7 fail-open、#8 效果列表契约、#9 SessionState TTL；术语表补 SessionState/Degraded
- [x] [P2] extension-points.md：审批通道超时=拒绝语义、遥测后端注意事项、新增扩展点全景图
- [x] [P2] roadmap.md：DoD 同步（P0 补降级单测、P1 补回放仿真）
- [x] [P2] 新建 LICENSE（Apache 2.0 全文）
- [x] [P2] 索引与 README 同步：docs/README.md、directory-layout.md、README_zh.md（索引加 telemetry/testing、约束与示例字段同步）
- [x] [P2] 全库验证：断链=0、Mermaid 全渲染、术语归零 grep、README 与 docs 数字交叉一致

## 完成标准

- [x] code: 15/15 实施任务勾选，12 份 markdown + LICENSE 全部落盘，无占位符残留
- [x] linter_result: 全库 `grep -rE "ArgHotPatch|ContextInject|CourseRedirect|HITLSuspend"` 命中 0；所有 `](./xxx.md)` 相对链接目标存在（断链=0）
- [x] unit_test_result: 全部 Mermaid 代码块通过语法校验/渲染，预期 ≥13 幅
- [x] func_test_result: README↔docs 交叉核对一致：约束条数（10 条）、L1–L4 策略表、预算数字（35/10/5ms、50ms）、文档索引数量（12 份）
- [x] status: 状态、剩余风险和回滚方式已记录

## 风险与回滚

- 剩余风险：① 本目录仍非 git 仓库，本轮之后的误改无版本控制兜底——建议尽快 `git init` 并建立首个基线提交；② 文档约定的效果列表 / HITL 协议 / fail-open 语义尚未有代码实现佐证，P0 阶段实现时如发现契约需调整，须回改本批文档并同步全部出现点；③ 原计划预期 ≥13 幅图，实际 15 幅（新增扩展点全景图等），均渲染通过。
- 回滚方式：执行前已全量备份 `README_zh.md` 与 `docs/` 至 `/tmp/arcs-doc-backup-20261116/`；回滚 = 用备份目录覆盖还原（plans/ 与 LICENSE 为本次新建，可删除 plans/ 整目录）。渲染产物在 /tmp/arcs-mmd/（仅校验用，不入库）。

## 进度日志

- 2026-11-16 23:24:40 创建（planing）
- 2026-11-16 23:25:55 完成 #1 [P0] core.md：kind 补 schema、plan 返回 SteeringEffect[]、定义 ToolCall/Snapshot/Budget、默认传感器清单、预算分解、降级语义、新增 core 流水线图
- 2026-11-16 23:25:55 core.md 重写完成：kind=schema/loop/semantic/policy 四类、plan 返回 SteeringEffect[]、ToolCall/Snapshot/Budget 契约、4 传感器等级映射表、预算分解表、fail-open 降级语义、新增内部流水线 Mermaid 图
- 2026-11-16 23:26:44 完成 #2 [P0] plugin-kit.md：run 异步签名 + SteeringOutcome、定义 RawEvent、SessionState/TTL、HITL 恢复契约、配置优先级、fail-open 落地、新增编排流水线图、TelemetrySink 归属标注
- 2026-11-16 23:26:44 plugin-kit.md 重写完成：run→Promise<SteeringOutcome>、RawEvent/SteeringOutcome/SessionState/HitlDecision 契约、状态所有权与 TTL、HITL 挂起恢复四步契约、配置三级优先级、fail-open 兜底表、新增编排流水线图、TelemetrySink 归属 telemetry 标注
- 2026-11-16 23:27:14 完成 #3 [P0] 算子名统一：key-flows.md / plugins.md / README_zh.md 废除 ArgHotPatch/ContextInject/CourseRedirect/HITLSuspend，改用 Effect 类型名
- 2026-11-16 23:27:14 两个策略表（README_zh.md / key-flows.md）列名改为效果类型，L3 改为 RedirectTool + InjectMessage；grep 术语命中 0（exit=1 为无匹配，符合预期）
- 2026-11-16 23:27:28 撤销 #3 [P0] 算子名统一：key-flows.md / plugins.md / README_zh.md 废除 ArgHotPatch/ContextInject/CourseRedirect/HITLSuspend，改用 Effect 类型名
- 2026-11-16 23:27:38 完成 #3 [P0] 算子名统一：key-flows.md / plugins.md / README_zh.md 废除 ArgHotPatch/ContextInject/CourseRedirect/HITLSuspend，改用 Effect 类型名
- 2026-11-16 23:27:38 策略表列名改效果类型 + 配置字段 enableArgHotPatch→enablePatchArgs（README/sdk.md）；复验 grep 四别名命中 0（exit=1）
- 2026-11-16 23:28:01 完成 #4 [P0] architecture.md：总纲补 fail-open、依赖单链化 plugins→plugin-kit→telemetry→core、分层图与时序图更新
- 2026-11-16 23:28:01 architecture.md：总纲新增 fail-open 原则行、依赖改单链 plugins→plugin-kit→telemetry→core 并注明 AuditEvent 归属、分层图 telemetry 归位（KIT→TELE→CORE）、时序图补 HitlTransport participant 与 L4 三分支、详细设计索引补 telemetry/testing
- 2026-11-16 23:28:44 完成 #5 [P1] key-flows.md：新增 HITL 挂起-恢复时序图与失败降级路径图；闭环图/插件时序图更新
- 2026-11-16 23:28:44 key-flows.md：闭环图改效果列表化、插件时序图改 run(raw) Promise + 三分支、新增 HITL 挂起-恢复时序图（通过/拒绝/超时三分支）、新增失败降级路径图；策略表已在 T3 统一
- 2026-11-16 23:29:25 完成 #6 [P1] 新建 docs/testing.md：三层测试策略（core 单测 / ReplayHarness 回放仿真 / 真宿主 E2E）
- 2026-11-16 23:29:25 docs/testing.md 新建：三层测试（core 单测含降级必测项 / MockHostAdapter+ReplayHarness 回放 / 真宿主 E2E 表）+ CI 边界守护
- 2026-11-16 23:29:26 完成 #7 [P1] sdk.md：定义 SteerEvent 契约、onSteer 示例字段更新、新增 SDK 拦截点时序图
- 2026-11-16 23:29:26 sdk.md：新增拦截点时序图、SteerEvent 契约（level/effects/signals/latencyMs/reason）、onSteer 示例改 event.level/effects、enablePatchArgs 字段
- 2026-11-16 23:30:01 完成 #8 [P1] plugins.md：补 claude-code HookAdapter、补 MCP 仅 L1-L3 原因、新增接入拓扑图
- 2026-11-16 23:30:01 plugins.md：新增接入拓扑图（4 宿主×4 适配方式）、补 claude-code HookAdapter（Claude Code Hooks）、补 MCP 仅 L1-L3 原因说明（无审批回调通道）
- 2026-11-16 23:30:01 完成 #9 [P1] 新建 docs/telemetry.md：AuditEvent 模型、偏移曲线、TelemetrySink 契约、依赖方向、审计事件流图
- 2026-11-16 23:30:01 docs/telemetry.md 新建：包定位与依赖方向（单链）、AuditEvent 契约、审计事件流图（3 种 Sink）、TelemetrySink 实现要求、偏移曲线定义
- 2026-11-16 23:31:30 范围微调：constraints.md 落地为 10 条（新增 #10 遥测不反压，与 telemetry.md Sink 契约呼应，超出计划原 3 条），DoD 约束条数 9→10
- 2026-11-16 23:31:20 完成 #10 [P2] constraints.md：新增约束 #7 fail-open、#8 效果列表契约、#9 SessionState TTL；术语表补 SessionState/Degraded
- 2026-11-16 23:31:20 constraints.md：约束表扩至 10 条（#7 fail-open、#8 效果列表+Suspend 末位、#9 SessionState TTL、#10 遥测不反压）、预算数字改 35/10/5ms、术语表补 SessionState/Degraded/效果列表
- 2026-11-16 23:31:21 完成 #11 [P2] extension-points.md：审批通道超时=拒绝语义、遥测后端注意事项、新增扩展点全景图
- 2026-11-16 23:31:21 extension-points.md：新增扩展点全景图（三层收敛）、扩展契约注意事项（审批超时=拒绝、遥测不反压、重传感器旁路）、遥测后端位置改 telemetry 包
- 2026-11-16 23:32:17 完成 #12 [P2] roadmap.md：DoD 同步（P0 补降级单测、P1 补回放仿真）
- 2026-11-16 23:32:17 roadmap.md：P0 DoD 补失败降级单测、P1 补 ReplayHarness 回放仿真、P3 补拒绝/超时分支、P5 改偏移曲线聚合；新增 plans/ 流程指引
- 2026-11-16 23:32:17 完成 #13 [P2] 新建 LICENSE（Apache 2.0 全文）
- 2026-11-16 23:32:17 LICENSE 新建：Apache 2.0 全文，Copyright 2026 Chaos Design（修复 README 悬空链接）
- 2026-11-16 23:34:26 完成 #14 [P2] 索引与 README 同步：docs/README.md、directory-layout.md、README_zh.md（索引加 telemetry/testing、约束与示例字段同步）
- 2026-11-16 23:34:26 索引同步完成：docs/README.md 索引 12 条（加 telemetry/testing）、directory-layout.md 目录树加 telemetry/testing/plans/LICENSE、README_zh.md 8 处同步（架构图 telemetry 归位、依赖单链、模块划分表、10 条约束、onSteer 示例、文档索引、P0/P1 DoD、目录树）
- 2026-11-16 23:42:25 完成 #15 [P2] 全库验证：断链=0、Mermaid 全渲染、术语归零 grep、README 与 docs 数字交叉一致
- 2026-11-16 23:42:25 全库验证：断链 0/66、术语 grep 归零、占位符 0、约束 10/10（constraints.md 与 README）、文档索引 12/12、L1-L4 表 4/4、预算数字 35/10/5ms 全出现、Mermaid 15 幅 mmdc 全渲染通过（修复 key-flows-0 边标签 [] 加引号）
- 2026-11-16 23:42:26 完成 #16 code: 15/15 实施任务勾选，12 份 markdown + LICENSE 全部落盘，无占位符残留
- 2026-11-16 23:42:26 15/15 任务完成；12 份 md（README_zh + docs 11→13 含 telemetry/testing，实际文档 13 份 md + LICENSE + plans 2 份）落盘；占位符 grep=0
- 2026-11-16 23:42:26 完成 #17 linter_result: 全库 `grep -rE "ArgHotPatch|ContextInject|CourseRedirect|HITLSuspend"` 命中 0；所有 `](./xxx.md)` 相对链接目标存在（断链=0）
- 2026-11-16 23:42:26 grep 四别名命中 0；链接检查脚本 66 条相对链接 0 断链
- 2026-11-16 23:42:26 完成 #18 unit_test_result: 全部 Mermaid 代码块通过语法校验/渲染，预期 ≥13 幅
- 2026-11-16 23:42:26 15 幅 Mermaid 全部通过 mmdc 渲染（SVG 15/15），超出预期 ≥13
- 2026-11-16 23:42:27 完成 #19 func_test_result: README↔docs 交叉核对一致：约束条数（10 条）、L1–L4 策略表、预算数字（35/10/5ms、50ms）、文档索引数量（12 份）
- 2026-11-16 23:42:27 约束 10 条（constraints.md 表 10 行 / README 列表 10 项）；L1-L4 表 4 行×2 处一致；预算 35/10/5ms 与 50ms 在 core/plugin-kit/constraints/README 一致；文档索引 12 行×2 处一致
- 2026-11-16 23:42:32 完成 #20 status: 状态、剩余风险和回滚方式已记录
- 2026-11-16 23:42:32 状态=全部完成；剩余风险与回滚方式已写入计划「风险与回滚」节（git init 建议、契约待代码佐证、备份位置 /tmp/arcs-doc-backup-20261116/）
- 2026-11-16 23:42:32 归档：任务与完成标准全部满足
