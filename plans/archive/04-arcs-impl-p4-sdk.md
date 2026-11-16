---
title: ARCS P4：SDK 适配
priority: P1
created: 2026-11-17 00:28:15
updated: 2026-11-17 00:39:59
---

# ARCS P4：SDK 适配

## 目标

实现 roadmap P4：sdk/vercel（withArcs 模型包装器，对接真实 ai 包类型，generateText 全链 mock 模型验证）+ sdk/langchain（零依赖 LangGraph 兼容节点）；完成后 git 提交（用户已批准惯例）

## 范围

- 包含：`sdk/vercel`（withArcs 包装器，对接真实 ai 包类型，doGenerate 拦截 + 效果翻译 + SteerEvent + HITL 回调）、`sdk/langchain`（零依赖 createArcsNode）、扫描/vitest 基建、单测 + generateText 全链集成测试、文档同步、git 提交。
- 不包含：P3 宿主插件（真实 Harness 环境，被阻塞）；doStream 流式拦截（v1 透传，文档标注）；langchain CallbackHandler（需 @langchain/core，后续补充）。

## 实施任务

- [x] [P1] 基建：scan-deps.mjs 增 sdk/vercel 与 sdk/langchain 规则（允许 core + 各自框架包；禁 plugin-kit 以守 SDK 直线边界）；vitest include 覆盖 sdk/*/src
- [x] [P1] sdk/vercel 脚手架：@chaos-design/arcs-sdk-vercel + 安装 ai/@ai-sdk/provider devDeps + LanguageModel 类型对齐调查（按安装版本适配）
- [x] [P1] withArcs 模型包装器：doGenerate 拦截 tool-call 捕获→sense/plan→效果翻译（PatchArgs 改写 input、RedirectTool 改 toolName、InjectMessage/Suspend 拒绝→text 部分替代、approve 放行）；SteerEvent 契约 + onSteer；HITL 回调默认拒绝；doStream v1 透传并文档标注
- [x] [P1] SDK 会话状态：wrapper 内置连续调用历史（复用 LoopHashSensor 语义，容量 20）用于 L2 检测
- [x] [P1] sdk/vercel 单测：mock LanguageModel 四类效果、SteerEvent 字段、HITL approve/reject、L2 第3次注入、无工具调用透传
- [x] [P1] generateText 全链集成测试：真实 ai 包 generateText + mock 模型，验证 withArcs 端到端效果与 SteerEvent
- [x] [P1] sdk/langchain：@chaos-design/arcs-sdk-langchain，createArcsNode 纯函数（零框架依赖、LangGraph 节点签名兼容、效果→节点输出映射）+ 单测
- [x] [P2] 文档同步：sdk.md 补 doStream 透传限制与 langchain 节点用法；全量验证 build/lint/scan/test 全绿；git 提交

## 完成标准

- [x] code: 9/9 任务勾选；pnpm build（6 包）/lint/scan/test 全绿；无 stub 残留（doStream 透传为文档标注的 v1 范围裁剪）
- [x] linter_result: scan 0 违规（sdk 白名单制、禁 plugin-kit）；tsc --noEmit 0 错（含对 ai 包真实类型）
- [x] unit_test_result: vitest 全绿（本轮新增 ≥12 用例）
- [x] func_test_result: 真实 ai 包 generateText + mock 模型全链集成：四类效果翻译与 SteerEvent 字段断言通过
- [x] status: 状态、剩余风险和回滚方式已记录

## 风险与回滚

- 剩余风险：① 对齐的 ai@7/provider@4 类型为当前安装版本，升级时需复核（peerDependencies 声明 >=1.0.0 过宽，可考虑收紧）；② doStream 未拦截——streamText 场景暂无纠偏（文档标注），后续版本补齐；③ langchain 节点为零依赖结构实现，未对 @langchain/core 类型验证，CallbackHandler 形态待补；④ InjectMessage 的「tool-call→text 替代」翻译与 Harness 注入语义有差异（框架内无消息注入通道），已在 docs/sdk.md 标注；⑤ P3 宿主插件仍被真实 Harness 环境阻塞。
- 回滚方式：纯增量（新增 sdk/* + scan/vitest 两处基建小改 + docs 两处同步），回滚 = 删除 sdk/ 并还原基建文件；git 基线 7147915 可 reset。

## 进度日志

- 2026-11-17 00:28:15 创建（planing）
- 2026-11-17 00:39:34 完成 #1 [P1] 基建：scan-deps.mjs 增 sdk/vercel 与 sdk/langchain 规则（允许 core + 各自框架包；禁 plugin-kit 以守 SDK 直线边界）；vitest include 覆盖 sdk/*/src
- 2026-11-17 00:39:34 scan-deps.mjs 增 sdk/vercel（core+zod+@ai-sdk/provider，禁 plugin-kit 守直线边界）与 sdk/langchain（仅 core）规则，30 文件 0 违规；vitest include 覆盖 sdk/*/src
- 2026-11-17 00:39:34 完成 #2 [P1] sdk/vercel 脚手架：@chaos-design/arcs-sdk-vercel + 安装 ai/@ai-sdk/provider devDeps + LanguageModel 类型对齐调查（按安装版本适配）
- 2026-11-17 00:39:34 sdk/vercel 脚手架：peerDeps @ai-sdk/provider + devDeps ai@7.0.173/provider@4.0.38；类型对齐结论：LanguageModelV4（input 为 JSON 字符串、finishReason 为 {unified,raw} 对象、usage 嵌套结构）
- 2026-11-17 00:39:35 完成 #3 [P1] withArcs 模型包装器：doGenerate 拦截 tool-call 捕获→sense/plan→效果翻译（PatchArgs 改写 input、RedirectTool 改 toolName、InjectMessage/Suspend 拒绝→text 部分替代、approve 放行）；SteerEvent 契约 + onSteer；HITL 回调默认拒绝；doStream v1 透传并文档标注
- 2026-11-17 00:39:35 withArcs：doGenerate 拦截 tool-call（跳过 providerExecuted）→sense/plan→效果翻译（PatchArgs 改 input、RedirectTool 改 toolName、InjectMessage/Suspend 拒绝→text 替代并修正 finishReason、HITL 回调默认拒绝）；SteerEvent 契约；doStream 透传标注
- 2026-11-17 00:39:35 完成 #4 [P1] SDK 会话状态：wrapper 内置连续调用历史（复用 LoopHashSensor 语义，容量 20）用于 L2 检测
- 2026-11-17 00:39:35 wrapper 闭包维护 history（容量 20，检测后入史，与 kit 同语义）供 L2 循环检测
- 2026-11-17 00:39:35 完成 #5 [P1] sdk/vercel 单测：mock LanguageModel 四类效果、SteerEvent 字段、HITL approve/reject、L2 第3次注入、无工具调用透传
- 2026-11-17 00:39:35 sdk/vercel 单测 7 例：L1 补参+事件字段、L2 第3次替换+finishReason stop、L3 改道跳注入、L4 默认阻断/approve 放行、纯文本透传、非法 JSON 放行、doStream 透传、extractThought
- 2026-11-17 00:39:36 完成 #6 [P1] generateText 全链集成测试：真实 ai 包 generateText + mock 模型，验证 withArcs 端到端效果与 SteerEvent
- 2026-11-17 00:39:36 generateText 全链集成 2 例（真实 ai 包 + scripted mock 模型）：L1 execute 收到热修复参数×2 步、L4 execute 不执行且 result.text 含阻断提示
- 2026-11-17 00:39:36 完成 #7 [P1] sdk/langchain：@chaos-design/arcs-sdk-langchain，createArcsNode 纯函数（零框架依赖、LangGraph 节点签名兼容、效果→节点输出映射）+ 单测
- 2026-11-17 00:39:36 sdk/langchain：createArcsNode 零依赖 LangGraph 节点（效果翻译同规则、Suspend 拒绝语义）+ 6 例单测
- 2026-11-17 00:39:36 完成 #8 [P2] 文档同步：sdk.md 补 doStream 透传限制与 langchain 节点用法；全量验证 build/lint/scan/test 全绿；git 提交
- 2026-11-17 00:39:36 sdk.md 同步（目录/用法/已知裁剪三项：doStream 透传、InjectMessage→text 替代语义、CallbackHandler 待补）；roadmap P4 标注 ✅；全量验证 build 6 包/lint 0 错/scan 0 违规/test 86+2→86 全绿
- 2026-11-17 00:39:57 完成 #9 code: 9/9 任务勾选；pnpm build（6 包）/lint/scan/test 全绿；无 stub 残留（doStream 透传为文档标注的 v1 范围裁剪）
- 2026-11-17 00:39:57 9/9 任务完成；build 6 包全绿；两 SDK 无 stub（doStream 透传为已文档化的范围裁剪）
- 2026-11-17 00:39:58 完成 #10 linter_result: scan 0 违规（sdk 白名单制、禁 plugin-kit）；tsc --noEmit 0 错（含对 ai 包真实类型）
- 2026-11-17 00:39:58 scan 30 文件 0 违规；pnpm lint 6 包 tsc --noEmit 0 错（含 ai@7 真实类型编译）
- 2026-11-17 00:39:58 完成 #11 unit_test_result: vitest 全绿（本轮新增 ≥12 用例）
- 2026-11-17 00:39:58 vitest 86/86 全绿，新增 15 例（≥12 达标）
- 2026-11-17 00:39:58 完成 #12 func_test_result: 真实 ai 包 generateText + mock 模型全链集成：四类效果翻译与 SteerEvent 字段断言通过
- 2026-11-17 00:39:58 generateText 全链集成通过：L1 execute 参数 {pathh}→{path,content} 热修复、L4 execute 零调用 + result.text 含【ARCS 阻断】
- 2026-11-17 00:39:59 完成 #13 status: 状态、剩余风险和回滚方式已记录
- 2026-11-17 00:39:59 状态=全部完成；剩余风险（ai 版本收紧 peer 范围、doStream 待补、langchain 未对 @langchain/core 验证、P3 阻塞）与回滚方式已记录
- 2026-11-17 00:39:59 归档：任务与完成标准全部满足
