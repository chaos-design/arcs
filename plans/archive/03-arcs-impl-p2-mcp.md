---
title: ARCS P2：MCP 透明代理插件
priority: P1
created: 2026-11-17 00:16:47
updated: 2026-11-17 00:25:33
---

# ARCS P2：MCP 透明代理插件

## 目标

实现 roadmap P2：plugins/mcp 透明代理网关（STDIO，L1-L3 纠偏 + L4 按拒绝语义阻断），真实进程 e2e 可观测；完成后 git init 建立首个基线提交（用户已批准）

## 范围

- 包含：`plugins/mcp`（@chaos-design/arcs-plugin-mcp）：McpAdapter 效果物化、McpProxy STDIO 传输、CLI；扫描/vitest 基建扩展；单测 + 真实进程 e2e；plugins.md 文档同步；git 初始化与首次提交。
- 不包含：P3 宿主插件（需真实 Codex/DeepSeek/Claude Code Harness 验证，超出当前环境）；P4 SDK；P5 面板。

## 实施任务

- [x] [P1] 基建扩展：scan-deps.mjs 增 plugins/mcp 规则（允许 core/telemetry/plugin-kit/zod/相对 + node:child_process/node:process）；vitest.config.ts include 覆盖 plugins/*/src
- [x] [P1] 包脚手架：plugins/mcp package.json（@chaos-design/arcs-plugin-mcp，bin 入口）+ tsconfig
- [x] [P1] McpAdapter：HostAdapter 实现——normalize(tools/call→ExecutionContext)、materialize 效果映射（PatchArgs→改参转发、RedirectTool→改写目标转发、InjectMessage→合成 isError 响应、Suspend→拒绝语义阻断+注入提示）
- [x] [P1] McpProxy 传输层：spawn 下游 server、行分隔 JSON 双向转发、tools/call 拦截决策（纯函数 decideProxyAction）、顺序队列；CLI 参数解析（--goal/--target/--drift-threshold/--max-consecutive-loops/--protected-paths）
- [x] [P1] 单测：materialize 四类效果映射、decideProxyAction 决策矩阵（L3 改道优先、注入跳过）、非 tools/call 透传、CLI 参数解析
- [x] [P1] 真实进程 e2e：fake MCP server + proxy（真实 spawn 与 stdio 管道）四场景——L1 补参透传、L2 第3次虚拟报错、L4 阻断+提示、initialize/tools list 透传
- [x] [P2] 文档同步：plugins.md 增 MCP CLI 配置与代理落地语义（L3 改道后注入跳过的通道说明）；全量验证 build/test/scan/lint 全绿
- [x] [P2] git init + 首次基线提交（含全部文档、plans、三包与 MCP 插件）

## 完成标准

- [x] code: 9/9 任务勾选；pnpm build/test/scan/lint 全绿；插件 bin 可执行
- [x] linter_result: scan 0 违规（plugins/mcp 白名单：core/telemetry/plugin-kit/zod + node:child_process/node:process）；tsc --noEmit 0 错
- [x] unit_test_result: vitest 全绿（本轮新增 ≥10 用例）
- [x] func_test_result: 真实进程 e2e 四场景断言通过（真实 spawn fake MCP server + stdio 管道：L1 补参透传 / L2 第 3 次虚拟报错 / L4 阻断+提示 / initialize 透传）
- [x] status: 状态、剩余风险和回滚方式已记录

## 风险与回滚

- 剩余风险：① MCP 协议仅实现 STDIO 行分隔 JSON-RPC 主干，SSE 传输/流式进度/list_changed 等规范特性未覆盖——接入复杂 Server 时可能需补充透传白名单；② 拦截串行队列在高并发下游下有吞吐上限，必要时改为按 id 并发 + 有序回写；③ L1 的 toolSchemas 需按下游工具逐个注册（无 Schema 的工具不做参数校验），生产应通过 tools/list 自动发现 + 内置常用 Schema 库；④ P3 宿主插件需真实 Harness 环境，P4 SDK、P5 面板未实施。
- 回滚方式：git 基线已建立（e1d1075），后续误改可 `git restore`/`git reset` 回退；本轮纯增量（plugins/mcp + 两处基建小改 + docs 两处同步），删除 plugins/ 并还原基建文件即回到 P0+P1 状态。

## 进度日志

- 2026-11-17 00:16:47 创建（planing）
- 2026-11-17 00:24:20 完成 #1 [P1] 基建扩展：scan-deps.mjs 增 plugins/mcp 规则（允许 core/telemetry/plugin-kit/zod/相对 + node:child_process/node:process）；vitest.config.ts include 覆盖 plugins/*/src
- 2026-11-17 00:24:20 scan-deps.mjs 增 plugins/mcp 白名单（core/telemetry/plugin-kit/zod + node:child_process/process/url），25 文件 0 违规；vitest include 覆盖 plugins/*/src，testTimeout 15s
- 2026-11-17 00:24:20 完成 #2 [P1] 包脚手架：plugins/mcp package.json（@chaos-design/arcs-plugin-mcp，bin 入口）+ tsconfig
- 2026-11-17 00:24:20 plugins/mcp 脚手架：@chaos-design/arcs-plugin-mcp（bin: arcs-plugin-mcp → dist/cli.js）+ tsconfig + @types/node devDep；bin 冒烟通过（缺参用法提示 exit 2）
- 2026-11-17 00:24:20 完成 #3 [P1] McpAdapter：HostAdapter 实现——normalize(tools/call→ExecutionContext)、materialize 效果映射（PatchArgs→改参转发、RedirectTool→改写目标转发、InjectMessage→合成 isError 响应、Suspend→拒绝语义阻断+注入提示）
- 2026-11-17 00:24:20 McpAdapter：normalize（工具调用文本代 thought，代理无推理内容）、materialize 五类效果→ProxyAction 映射（含 Suspend 拒绝语义阻断+提示文本）
- 2026-11-17 00:24:21 完成 #4 [P1] McpProxy 传输层：spawn 下游 server、行分隔 JSON 双向转发、tools/call 拦截决策（纯函数 decideProxyAction）、顺序队列；CLI 参数解析（--goal/--target/--drift-threshold/--max-consecutive-loops/--protected-paths）
- 2026-11-17 00:24:21 McpProxy：spawn 下游 + 行分隔 JSON 双向透传 + tools/call 拦截串行队列 + decideProxyAction 决策矩阵（L3 改道优先/注入跳过）+ cli.ts（入口守卫防 import 副作用，--goal/--target 等 5 参数）
- 2026-11-17 00:24:21 完成 #5 [P1] 单测：materialize 四类效果映射、decideProxyAction 决策矩阵（L3 改道优先、注入跳过）、非 tools/call 透传、CLI 参数解析
- 2026-11-17 00:24:21 单测 9 例：paramsToToolCall、四类效果映射、decideProxyAction 三规则、parseCliArgs——全绿
- 2026-11-17 00:24:21 完成 #6 [P1] 真实进程 e2e：fake MCP server + proxy（真实 spawn 与 stdio 管道）四场景——L1 补参透传、L2 第3次虚拟报错、L4 阻断+提示、initialize/tools list 透传
- 2026-11-17 00:24:21 真实进程 e2e 5 例全绿：fake-mcp-server.mjs + PassThrough 管道，L1 补参透传（下游 echo 验证 pathh→path）、L2 第3次虚拟报错+第4次换命令恢复、L4 阻断+提示、initialize/tools/list 透传、审计 level 1/4 可观测
- 2026-11-17 00:24:22 完成 #7 [P2] 文档同步：plugins.md 增 MCP CLI 配置与代理落地语义（L3 改道后注入跳过的通道说明）；全量验证 build/test/scan/lint 全绿
- 2026-11-17 00:24:22 文档同步：plugins.md 增 MCP 代理落地语义表 + 决策规则 + CLI 配置示例；roadmap.md 增状态列（P0/P1/P2 ✅）；全量验证 build 4 包/lint 0 错/scan 0 违规/test 71+9=71→71 全绿（71 例含 MCP 14 例）
- 2026-11-17 00:25:09 完成 #8 [P2] git init + 首次基线提交（含全部文档、plans、三包与 MCP 插件）
- 2026-11-17 00:25:09 git init（空仓库已存在 .git，main 分支无历史）+ git add 66 文件 + 首次基线提交 e1d1075（Conventional Commits，5909 行；.zcode/.workbuddy/node_modules/dist 已被 .gitignore 排除）
- 2026-11-17 00:25:09 完成 #9 code: 9/9 任务勾选；pnpm build/test/scan/lint 全绿；插件 bin 可执行
- 2026-11-17 00:25:09 9/9 任务完成；pnpm build 4 包全绿；bin 入口冒烟通过（缺参 exit 2 用法提示）；无 stub/占位残留
- 2026-11-17 00:25:10 完成 #10 linter_result: scan 0 违规（plugins/mcp 白名单：core/telemetry/plugin-kit/zod + node:child_process/node:process）；tsc --noEmit 0 错
- 2026-11-17 00:25:10 scan 0 违规（25 文件，plugins/mcp 白名单含 node:child_process/process/url）；pnpm lint（tsc --noEmit×4 包）0 错
- 2026-11-17 00:25:10 完成 #11 unit_test_result: vitest 全绿（本轮新增 ≥10 用例）
- 2026-11-17 00:25:10 vitest 71/71 全绿（新增 MCP 14 例：单测 9 + 真实进程 e2e 5），满足 ≥10 新增
- 2026-11-17 00:25:10 完成 #12 func_test_result: 真实进程 e2e 四场景断言通过（真实 spawn fake MCP server + stdio 管道：L1 补参透传 / L2 第 3 次虚拟报错 / L4 阻断+提示 / initialize 透传）
- 2026-11-17 00:25:10 真实进程 e2e 四场景断言全部通过：L1 pathh→path 补参透传、L2 第3次虚拟报错(isError)+第4次恢复、L4 rm -rf 阻断+提示、initialize/tools/list 透传；审计事件 level 1/4 可查询
- 2026-11-17 00:25:33 完成 #13 status: 状态、剩余风险和回滚方式已记录
- 2026-11-17 00:25:33 状态=全部完成；剩余风险（协议主干简化/串行吞吐/Schema 注册方式/P3-P5 待实施）与回滚方式（git 基线 e1d1075）已记录
- 2026-11-17 00:25:33 归档：任务与完成标准全部满足
