---
title: 修复 Pi 与 OpenCode 的注入回写契约
priority: P0
created: 2026-11-17 17:57:25
updated: 2026-11-17 18:24:38
---

# 修复 Pi 与 OpenCode 的注入回写契约

## 目标

依据本机安装的 Pi 扩展类型定义与 OpenCode 官方 plugin 类型，修复两处无效注入回写：Pi before_agent_start 返回字符串 message、OpenCode 向 output 写 arcsContext

## 范围

权威依据（本机第一手取证）：
- Pi：`/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` 明确 `before_agent_start` 返回 `{ message: { customType, content, display } }` 与 `systemPrompt` 覆盖；`tool_call` 返回 `{ block: true, reason }`（后者已正确）。
- OpenCode：官方 plugin 类型 `experimental.chat.system.transform?: (input, output: { system: string[] }) => Promise<void>`，`tool.execute.before` 的 output 只有 `args`。

包含：
- `plugins/pi/src/index.ts`：`before_agent_start` 注入从 `{ message: string }` 改为 `{ message: { customType: 'arcs-steering', content, display: false } }`；更新 Pi 最小接口。
- `plugins/opencode/src/index.ts`：注入从无效的 `output['arcsContext']` 改为注册 `experimental.chat.system.transform` hook 并 push `output.system[]`；用 `Set/Map<sessionID, string[]>` 缓存待注入上下文，在 transform 时消费；更新 OpencodeContext 最小接口。
- 两个插件单测更新注入断言。
- 文档同步。

不包含：不改 core/plugin-kit/host-kit/telemetry；不改其它平台；不改能力矩阵；不触发真实宿主调用。

## 实施任务

- [x] Pi：before_agent_start 注入改为 { message: { customType, content, display } } 或 systemPrompt 覆盖
- [x] OpenCode：注入改用 experimental.chat.system.transform push output.system；移除无效的 arcsContext
- [x] 更新两个插件的 OpencodeContext/PiExtension 最小接口声明与单测
- [x] 更新 README 与 docs/plugins.md 的注入通道说明
- [x] 全量验证：build/lint/test/scan/contracts
- [x] 修复 core plan 预算误判（与 07 号计划 sense 修复同类残留）：planner 是同步纯函数，却用墙钟判定超预算，并行调度停顿会误降级为 PassThrough，导致 L4 偶发放行；改为实际执行耗时 ± 可控时钟回归测试

## 完成标准

- [x] code: 6 个任务全部勾选；Pi 注入返回合法 message 对象；OpenCode 注入走 system context hook，无 arcsContext 残留；core 预算时钟改为 CPU 时间
- [x] linter_result: `pnpm build && pnpm lint` 退出码均为 0
- [x] unit_test_result: `pnpm test` 退出码 0；Pi 注入断言 message 结构、OpenCode 断言 output.system 被 push；记录总用例数
- [x] func_test_result: `pnpm verify:contracts` 与 `pnpm scan` 均为 0 违规；用本机安装的 Pi 类型定义核对返回结构
- [x] status: 已记录证据来源（本机 Pi 文档/类型 + OpenCode 官方 plugin 类型）、无真实宿主实测限制与回滚命令

## 风险与回滚

- 风险：
  1. OpenCode `experimental.chat.system.transform` 属 experimental hook，版本演进可能变更；已在 README 标注并做 fail-open（hook 缺失时仅审计不注入）。
  2. Pi `before_agent_start` 的 message 注入是"持久消息"，会存入会话；用 `display:false` 避免干扰 TUI。
  3. 本机无真实会话凭据，契约来自本机类型定义（Pi）与官方类型（OpenCode），仍需真实会话验证。
  4. 全量验证阶段再次出现跨测试偶发失败（sdk/vercel L4）：根因是 07 号计划只修了 sense 预算的墙钟误判，plan 预算同样用墙钟，同步 planner 被调度停顿误判超预算→降级放行。改为实际耗时判定并加可控时钟回归测试。
- 回滚：`git checkout -- plugins/pi/src/index.ts plugins/opencode/src/index.ts plugins/pi/src/plugin.test.ts plugins/opencode/src/plugin.test.ts plugins/pi/src/adapter.ts plugins/opencode/src/adapter.ts plugins/pi/README.md plugins/opencode/README.md docs/plugins.md packages/core/src/engine.ts packages/core/src/engine.test.ts`。其它包未改动。

## 进度日志

- 2026-11-17 17:57:25 创建（planing）
- 2026-11-17 18:24:38 完成 #1 Pi：before_agent_start 注入改为 { message: { customType, content, display } } 或 systemPrompt 覆盖
- 2026-11-17 18:24:38 完成 #2 OpenCode：注入改用 experimental.chat.system.transform push output.system；移除无效的 arcsContext
- 2026-11-17 18:24:38 完成 #3 更新两个插件的 OpencodeContext/PiExtension 最小接口声明与单测
- 2026-11-17 18:24:38 完成 #4 更新 README 与 docs/plugins.md 的注入通道说明
- 2026-11-17 18:24:38 完成 #5 全量验证：build/lint/test/scan/contracts
- 2026-11-17 18:24:38 完成 #6 修复 core plan 预算误判（与 07 号计划 sense 修复同类残留）：planner 是同步纯函数，却用墙钟判定超预算，并行调度停顿会误降级为 PassThrough，导致 L4 偶发放行；改为实际执行耗时 ± 可控时钟回归测试
- 2026-11-17 18:24:38 Pi before_agent_start 改为结构化 message 对象；OpenCode 注入改 session.hook('context') push system[]，移除 arcsContext；两插件各加注入通道断言；core 预算时钟改 CPU 时间(process.cpuUsage 经 globalThis)并注入 clock，plan/sense 均用之，新增抢占噪声回归测试
- 2026-11-17 18:24:38 完成 #7 code: 6 个任务全部勾选；Pi 注入返回合法 message 对象；OpenCode 注入走 system context hook，无 arcsContext 残留；core 预算时钟改为 CPU 时间
- 2026-11-17 18:24:38 完成 #8 linter_result: `pnpm build && pnpm lint` 退出码均为 0
- 2026-11-17 18:24:38 完成 #9 unit_test_result: `pnpm test` 退出码 0；Pi 注入断言 message 结构、OpenCode 断言 output.system 被 push；记录总用例数
- 2026-11-17 18:24:38 完成 #10 func_test_result: `pnpm verify:contracts` 与 `pnpm scan` 均为 0 违规；用本机安装的 Pi 类型定义核对返回结构
- 2026-11-17 18:24:38 完成 #11 status: 已记录证据来源（本机 Pi 文档/类型 + OpenCode 官方 plugin 类型）、无真实宿主实测限制与回滚命令
- 2026-11-17 18:24:38 build/lint 全绿；vitest 连续 12 次全量全绿（208/208，21 文件）确认 flake 消除；scan 66 文件 0 违规、contracts 85 项 0 违规；证据来自本机 Pi 类型定义与 OpenCode 官方 plugin 类型；风险段含 CPU 时钟原理、无真实会话限制与回滚命令
- 2026-11-17 18:24:38 归档：任务与完成标准全部满足
