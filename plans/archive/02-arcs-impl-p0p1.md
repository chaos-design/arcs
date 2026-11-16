---
title: ARCS 架构实现 P0+P1
priority: P1
created: 2026-11-16 23:50:54
updated: 2026-11-17 00:10:55
---

# ARCS 架构实现 P0+P1

## 目标

按 docs 架构设计落地代码：完成 roadmap P0（core）+ P1（plugin-kit 运行时）与工程骨架、telemetry，全部测试通过、依赖扫描通过；P2-P5（MCP 插件/宿主插件/SDK/面板）随后续计划。忽略 .zcode/.workbuddy 工具目录（入 .gitignore，不纳入项目）

## 范围

- 包含：monorepo 工程骨架（pnpm+turbo+vitest）；`packages/core`（契约+4 传感器+规划器+引擎+单测）；`packages/telemetry`（AuditEvent+Sink+偏移曲线）；`packages/plugin-kit`（HostAdapter/PluginRuntime/SessionState/配置合并/测试导出物/回放仿真）；依赖扫描脚本。
- 不包含：`plugins/*`、`sdk/*`、`examples/*`（roadmap P2–P5，随后续计划）；`.zcode/`、`.workbuddy/` 工具目录（仅入 .gitignore）；git init（未经用户批准不执行）。
- 优先级映射：本仓库 plans/README.md 的映射面向文档阶段；本计划按 skill 默认定义取 P1（不可达的核心功能），终检类任务标 P2。

## 实施任务

- [x] [P1] 工程骨架：根 package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json / .gitignore / 根 vitest 配置（workspace 源码别名，测试免构建）
- [x] [P1] 依赖扫描：scripts/scan-deps.mjs（core 禁 fs/net/child_process 等节点模块；plugin-kit 禁宿主 SDK 清单）+ turbo scan 任务
- [x] [P1] core 契约：types.ts + schema.ts（zod）+ SteeringEffect[] JSON roundtrip 序列化
- [x] [P1] core 传感器 ×4：SchemaSensor（zod 校验 + 键名近似重命名/类型强转补丁）、LoopHashSensor（history 滑动窗口指纹）、SemanticSensor（可注入 Embedder + 余弦相似度，默认哈希词袋）、PolicySensor（保护路径 glob + 高危命令），含预算内可选跳过
- [x] [P1] core 规划与引擎：RuleBasedPlanner（policy>semantic>loop>schema 优先级、Suspend 独立末位、redirectMap 改道、PatchArgs 生成）+ createArcsEngine（fail-open 组装、预算控制 35/10ms）
- [x] [P1] core 单测：L1-L4 映射、效果列表顺序、Suspend 约束、序列化 roundtrip、传感器异常跳过与整体降级
- [x] [P1] telemetry：AuditEvent zod schema + buildAuditEvent、TelemetrySink 接口 + InMemorySink、偏移曲线 severity 时序聚合 + 单测
- [x] [P1] plugin-kit 契约与配置：RawEvent/HostAdapter(+setup)/MaterializeResult/HitlTransport 类型、ConfigSchema（zod）三级优先级合并（内置<Policy<宿主）
- [x] [P1] PluginRuntime：SessionState（TTL/环形缓冲/loop 窗口）、run 编排（归一→状态注入→engine.run→按序 materialize→emit AuditEvent）、fail-open 逐级兜底
- [x] [P1] 测试导出物：MockHostAdapter（可编程注入 + 调用记录）、MockHitlTransport（approve/reject/timeout 脚本）、ReplayHarness（JSONL 解析 + 顺序回放）
- [x] [P1] kit 单测与回放仿真：全链 capture→sense→plan→apply、HITL 三分支、degraded 审计、TTL 清理、预算断言、四类对抗轨迹（参数幻觉/死循环/任务发散/高危越权）
- [x] [P2] 全量验证：pnpm build/test/scan 全绿、tsc --noEmit 0 错、三包可独立 import
- [x] [P2] 文档一致性终检：实现与 docs 契约差异回改（HostAdapter.setup、PatchArgs 语义补注），README 快速开始与本地开发命令核对

## 完成标准

- [x] code: 13/13 实施任务勾选；`pnpm build` 全绿；core/telemetry/plugin-kit 三包可独立 import；无占位残留
- [x] linter_result: `pnpm lint`（tsc --noEmit）0 错；`pnpm scan` 断言通过（core 零 fs/net/child_process 导入，plugin-kit 零宿主 SDK）
- [x] unit_test_result: `pnpm test` 全绿，用例数 ≥40（覆盖传感器映射/效果顺序/降级/HITL 三分支/TTL/回放）
- [x] func_test_result: ReplayHarness 四类对抗轨迹（参数幻觉→PatchArgs、死循环→InjectMessage、任务发散→RedirectTool+InjectMessage、高危越权→Suspend）效果列表断言全部通过
- [x] status: 状态、剩余风险和回滚方式已记录

## 风险与回滚

- 剩余风险：① 仓库仍无 git，基线依赖 /tmp 备份（/tmp/arcs-doc-backup2/ 存 docs+plans 修订后版本），建议尽快 `git init` 提交首个代码基线；② zod 锁定 ^3.25（v4 迁移未做，升级时需复核 discriminatedUnion/record 用法）；③ SemanticSensor 默认 HashingEmbedder 为词袋级精度，生产需注入真实向量模型 Embedder（契约已预留）；④ 循环检测依赖宿主上报时间戳单调递增，乱序事件流需适配器侧先排序；⑤ P2–P5 未实现：plugins/mcp、宿主插件、SDK、面板随后续计划。
- 回滚方式：本轮为纯增量（新增 package.json/pnpm-workspace.yaml/turbo.json/tsconfig.base.json/.gitignore/vitest.config.ts/scripts/packages/*），回滚 = 删除新增文件即可还原到纯文档状态；docs 回改处已在任务 13 记录，可逆。

## 进度日志

- 2026-11-16 23:50:54 创建（planing）
- 2026-11-17 00:09:42 完成 #1 [P1] 工程骨架：根 package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json / .gitignore / 根 vitest 配置（workspace 源码别名，测试免构建）
- 2026-11-17 00:09:42 骨架落地：根 package.json/pnpm-workspace.yaml/turbo.json/tsconfig.base.json/.gitignore(含 .zcode/.workbuddy)/vitest.config.ts（workspace 源码别名免构建测试）；pnpm install 成功
- 2026-11-17 00:09:42 完成 #2 [P1] 依赖扫描：scripts/scan-deps.mjs（core 禁 fs/net/child_process 等节点模块；plugin-kit 禁宿主 SDK 清单）+ turbo scan 任务
- 2026-11-17 00:09:42 scripts/scan-deps.mjs：core 仅允许 zod+相对导入；telemetry/core/plugin-kit 白名单制；排除 *.test.ts；turbo scan 任务；实测 21 文件 0 违规
- 2026-11-17 00:09:43 完成 #3 [P1] core 契约：types.ts + schema.ts（zod）+ SteeringEffect[] JSON roundtrip 序列化
- 2026-11-17 00:09:43 core 契约：types.ts（ToolCall/Snapshot/Budget/Policy/DriftSignal/SteeringEffect/DriftSensor/CoursePlanner）+ schema.ts（zod discriminatedUnion + serialize/parseEffects roundtrip）
- 2026-11-17 00:09:43 完成 #4 [P1] core 传感器 ×4：SchemaSensor（zod 校验 + 键名近似重命名/类型强转补丁）、LoopHashSensor（history 滑动窗口指纹）、SemanticSensor（可注入 Embedder + 余弦相似度，默认哈希词袋）、PolicySensor（保护路径 glob + 高危命令），含预算内可选跳过
- 2026-11-17 00:09:43 4 传感器：PolicySensor(保护路径 glob+高危命令正则)、LoopHashSensor(history 尾部连续指纹)、SchemaSensor(键名编辑距离≤2 重命名+原始类型强转)、SemanticSensor(可注入 Embedder+HashingEmbedder 默认)；可选传感器预算内跳过
- 2026-11-17 00:09:43 完成 #5 [P1] core 规划与引擎：RuleBasedPlanner（policy>semantic>loop>schema 优先级、Suspend 独立末位、redirectMap 改道、PatchArgs 生成）+ createArcsEngine（fail-open 组装、预算控制 35/10ms）
- 2026-11-17 00:09:43 RuleBasedPlanner(priority L4>L3>L2>L1、redirectMap 改道、Suspend 独立末位 sanitizeEffects)+createArcsEngine(fail-open 逐级兜底、sense/plan 预算 35/10ms 超限降级)
- 2026-11-17 00:09:43 完成 #6 [P1] core 单测：L1-L4 映射、效果列表顺序、Suspend 约束、序列化 roundtrip、传感器异常跳过与整体降级
- 2026-11-17 00:09:43 core 单测 30 例：L1-L4 映射、Suspend 约束、roundtrip、传感器异常跳过、plan 异常/超预算降级、senseMs=0 跳过可选——vitest 全绿
- 2026-11-17 00:09:43 完成 #7 [P1] telemetry：AuditEvent zod schema + buildAuditEvent、TelemetrySink 接口 + InMemorySink、偏移曲线 severity 时序聚合 + 单测
- 2026-11-17 00:09:43 telemetry：auditEventSchema+buildAuditEvent、TelemetrySink/InMemorySink、buildOffsetCurves 偏移曲线聚合；单测 7 例全绿
- 2026-11-17 00:09:53 完成 #8 [P1] plugin-kit 契约与配置：RawEvent/HostAdapter(+setup)/MaterializeResult/HitlTransport 类型、ConfigSchema（zod）三级优先级合并（内置<Policy<宿主）
- 2026-11-17 00:09:53 kit 契约：RawEvent(zod 校验)/HostAdapter(+setup 注入 hitl/config)/MaterializeResult/HitlTransport/KitHandles；configSchema 14 项含 TTL/预算/窗口默认值；resolveConfig 三级合并（undefined 不覆盖）
- 2026-11-17 00:09:53 完成 #9 [P1] PluginRuntime：SessionState（TTL/环形缓冲/loop 窗口）、run 编排（归一→状态注入→engine.run→按序 materialize→emit AuditEvent）、fail-open 逐级兜底
- 2026-11-17 00:09:53 PluginRuntime：SessionStore(TTL 惰性清扫以事件时钟为基准/环形缓冲/指纹窗口)、run 编排（校验→normalize→快照注入→engine.run→按序 materialize→emit AuditEvent）、修复检测前入史的双重复计数缺陷
- 2026-11-17 00:09:53 完成 #10 [P1] 测试导出物：MockHostAdapter（可编程注入 + 调用记录）、MockHitlTransport（approve/reject/timeout 脚本）、ReplayHarness（JSONL 解析 + 顺序回放）
- 2026-11-17 00:09:53 测试导出物：MockHitlTransport(脚本 approve/reject/timeout/自定义、耗尽默认超时拒绝)、MockHostAdapter(可编程 normalize/onMaterialize、Suspend 按真实契约调 hitl)、ReplayHarness(JSONL+顺序回放)
- 2026-11-17 00:09:53 完成 #11 [P1] kit 单测与回放仿真：全链 capture→sense→plan→apply、HITL 三分支、degraded 审计、TTL 清理、预算断言、四类对抗轨迹（参数幻觉/死循环/任务发散/高危越权）
- 2026-11-17 00:09:53 kit 单测 20 例：全链 L1-L4、HITL 三分支、4 类 fail-open 兜底、TTL 回收、缓冲截断、effectLevel、setup 注入、预算断言——vitest 全绿
- 2026-11-17 00:09:53 完成 #12 [P2] 全量验证：pnpm build/test/scan 全绿、tsc --noEmit 0 错、三包可独立 import
- 2026-11-17 00:09:53 全量验证：pnpm build 3 包成功、tsc --noEmit 0 错、vitest 57/57 通过（≥40 达标）、scan 21 文件 0 违规、三包 exports dist 可独立 import
- 2026-11-17 00:10:22 完成 #13 [P2] 文档一致性终检：实现与 docs 契约差异回改（HostAdapter.setup、PatchArgs 语义补注），README 快速开始与本地开发命令核对
- 2026-11-17 00:10:22 文档一致性回改 3 处：core.md PatchArgs 补整体替换语义注释；plugin-kit.md HostAdapter 增 setup?(KitHandles) 与 KitHandles 定义；状态所有权节补快照注入/检测后入史/事件时钟 TTL 说明。README 快速开始（pnpm 命令、enablePatchArgs）与本地开发段核对一致
- 2026-11-17 00:10:22 完成 #14 code: 13/13 实施任务勾选；`pnpm build` 全绿；core/telemetry/plugin-kit 三包可独立 import；无占位残留
- 2026-11-17 00:10:22 13/13 任务完成；build 3 包全绿；三包 exports(dist) 可独立 import；无占位符残留（新增代码均为实现非 stub）
- 2026-11-17 00:10:23 完成 #15 linter_result: `pnpm lint`（tsc --noEmit）0 错；`pnpm scan` 断言通过（core 零 fs/net/child_process 导入，plugin-kit 零宿主 SDK）
- 2026-11-17 00:10:23 pnpm lint（tsc --noEmit×3 包）0 错；pnpm scan 白名单制扫描 21 文件 0 违规（core 零节点模块、kit 零宿主 SDK）
- 2026-11-17 00:10:23 完成 #16 unit_test_result: `pnpm test` 全绿，用例数 ≥40（覆盖传感器映射/效果顺序/降级/HITL 三分支/TTL/回放）
- 2026-11-17 00:10:23 pnpm test 57/57 全绿（core 30 + telemetry 7 + kit 20），覆盖传感器映射/效果顺序/降级/HITL 三分支/TTL/回放/预算
- 2026-11-17 00:10:23 完成 #17 func_test_result: ReplayHarness 四类对抗轨迹（参数幻觉→PatchArgs、死循环→InjectMessage、任务发散→RedirectTool+InjectMessage、高危越权→Suspend）效果列表断言全部通过
- 2026-11-17 00:10:23 ReplayHarness 四类对抗轨迹断言全部通过：参数幻觉→[PatchArgs]、死循环第3次→[InjectMessage]、任务发散→[RedirectTool,InjectMessage]、高危越权→[Suspend]（approve 后 applied=true）
- 2026-11-17 00:10:55 完成 #18 status: 状态、剩余风险和回滚方式已记录
- 2026-11-17 00:10:55 状态=全部完成；剩余风险与回滚方式已写入计划（git init 建议、zod v3 锁定、词袋嵌入精度、时间戳单调性、P2-P5 待实现）
- 2026-11-17 00:10:55 归档：任务与完成标准全部满足
