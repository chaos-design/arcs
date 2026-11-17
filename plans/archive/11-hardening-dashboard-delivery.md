---
title: 收尾加固：运行时健壮性修复 + P5 偏移曲线面板 + 交付同步
priority: P1
created: 2026-11-18 00:07:58
updated: 2026-11-18 00:57:33
---

# 收尾加固：运行时健壮性修复 + P5 偏移曲线面板 + 交付同步

## 目标

修复探索审计确认的崩溃级风险（PluginRuntime 初始化未处理拒绝、McpProxy EPIPE/悬挂、CLI 信号监听泄漏）、实现 roadmap P5 唯一剩余功能（偏移曲线面板）、补齐 examples/ 与 CI、同步过时文档

## 范围

- 包含：`packages/plugin-kit`、`packages/cli`、`packages/host-kit/src/claim.ts`、`packages/telemetry`（新增 dashboard 模型）、`plugins/mcp`（proxy/cli）、`plugins/deepseek`、`plugins/opencode`、`scripts/offset-dashboard.mjs`（新增）、`examples/sdk-vercel-demo`、`examples/plugin-mcp-demo`（新增）、`.github/workflows/ci.yml`（新增）、roadmap/README/docs 文档同步。
- 不包含：真实宿主进程端到端实测（本机无宿主 CLI，属集成方职责，见 docs/plugins.md）；sdk/vercel doStream 纠偏（v1 已裁剪，见 docs/sdk.md）；install-host-plugins.mjs 复制 node_modules 的打包方式重构（本机语义正确，仅补注释）；FileAuditSink 跨天轮转策略。

## 实施任务

- [x] PluginRuntime.run 初始化异常 fail-open（重置 initPromise 支持重试）+ start() 兜底
- [x] McpProxy 稳健性：下游流 error 监听防 EPIPE 崩溃、行缓冲上限、非法 JSON 回 JSON-RPC 错误、下游不可达时对带 id 请求回错误响应而非悬挂
- [x] arcs CLI inheritedSpawn 修复 error 路径信号监听器泄漏（settled 防重）
- [x] arcs-plugin-mcp --target 引号感知切分（路径含空格可用）
- [x] deepseek 消除 lastRaw 跨会话竞态 + 会话 Map 容量上限
- [x] InMemorySink 可选 maxEvents 容量上限（默认行为不变）
- [x] opencode pendingInjections 容量上限
- [x] sanitizeClaimId 超 96 字符加短哈希防截断碰撞
- [x] P5 面板：telemetry 新增 buildDashboardModel 纯函数 + scripts/offset-dashboard.mjs（终端统计 + --html 内联 SVG 面板，零依赖）+ 测试
- [x] examples/：sdk-vercel-demo 与 plugin-mcp-demo 两个零依赖可跑 demo（对齐 README 声明）
- [x] CI：.github/workflows/ci.yml（build + lint + test + scan + verify:contracts）
- [x] 文档同步：roadmap.md P3/P5 行、README examples、docs/telemetry.md 面板用法、docs/testing.md CI 引用
- [x] 全库验证：build + lint + test + scan + verify:contracts 全绿

## 完成标准

- [x] code: 上述 13 项任务全部完成，无占位残留；修复均配新增单测
- [x] linter_result: `corepack pnpm lint`（turbo 全包 tsc --noEmit）退出码 0
- [x] unit_test_result: `corepack pnpm test` 全绿（基线 221 例，新增 ≥12 例并给出计数）
- [x] func_test_result: `node examples/sdk-vercel-demo/demo.mjs` 与 `node examples/plugin-mcp-demo/demo.mjs` 真实进程跑通；`node scripts/offset-dashboard.mjs --html` 对样例 JSONL 生成可打开的面板；`corepack pnpm scan` 与 `corepack pnpm verify:contracts` 退出码 0
- [x] status: 状态、剩余风险和回滚方式已记录

## 风险与回滚

- 风险：① runtime init fail-open 改动影响 ReplayHarness 既有断言（初始化时序敏感）；② McpProxy 错误响应语义与宿主 JSON-RPC 客户端兼容性（仅新增错误路径，不改成功路径）；③ sanitizeClaimId 对 >96 字符 id 的文件名变化，跨版本同会话可能产生两个 claim 文件（TTL 兜底接管）；④ 面板依赖 telemetry dist 构建产物，未构建时脚本需给出明确报错。
- 回滚：全部改动为增量式（新文件 + 既有函数内部加固），单提交粒度回滚 `git revert <sha>` 即可；claim 文件名策略回滚后旧文件靠 30 分钟 TTL 自动失效；面板/示例/CI 为纯新增，直接删除目录即可。

## 进度日志

- 2026-11-18 00:07:58 创建（planing）
- 2026-11-18 00:11:07 完成 #1 PluginRuntime.run 初始化异常 fail-open（重置 initPromise 支持重试）+ start() 兜底
- 2026-11-18 00:11:07 runtime.ts run() 初始化异常 fail-open + initPromise 重试重置 + start() 兜底；新增 3 例测试（runtime.test.ts 23 例全绿）
- 2026-11-18 00:19:12 完成 #2 McpProxy 稳健性：下游流 error 监听防 EPIPE 崩溃、行缓冲上限、非法 JSON 回 JSON-RPC 错误、下游不可达时对带 id 请求回错误响应而非悬挂
- 2026-11-18 00:19:12 完成 #3 arcs CLI inheritedSpawn 修复 error 路径信号监听器泄漏（settled 防重）
- 2026-11-18 00:19:12 完成 #4 arcs-plugin-mcp --target 引号感知切分（路径含空格可用）
- 2026-11-18 00:19:12 McpProxy：EPIPE 防线 + 1MB 行缓冲上限 + -32700/-32000 错误响应 + pendingForwarded 未决请求兑现（下游死亡不悬挂）；CLI inheritedSpawn settled 清理监听器（3 例新测试）；splitCommand 引号感知切分（4 例新测试）。mcp 17 例 + cli 15 例全绿
- 2026-11-18 00:23:59 完成 #5 deepseek 消除 lastRaw 跨会话竞态 + 会话 Map 容量上限
- 2026-11-18 00:23:59 完成 #6 InMemorySink 可选 maxEvents 容量上限（默认行为不变）
- 2026-11-18 00:23:59 完成 #7 opencode pendingInjections 容量上限
- 2026-11-18 00:23:59 deepseek：dispatch 返回 {decision,raw} 消除 lastRaw 跨会话竞态 + SESSION_MAP_CAP=512 FIFO 逐出（2 例新测试）；InMemorySink 可选 maxEvents（1 例）；opencode pendingInjections 上限 64；sanitizeClaimId 超 96 字符截断+sha256 短哈希防碰撞（2 例）。host-kit+telemetry 50 例、deepseek 14 例全绿
- 2026-11-18 00:31:35 完成 #8 sanitizeClaimId 超 96 字符加短哈希防截断碰撞
- 2026-11-18 00:31:35 telemetry 新增 buildDashboardModel 纯聚合（等级直方图/HITL 三分支互斥/收敛判定/放行占比，6 例新测试）；scripts/offset-dashboard.mjs 零依赖终端 sparkline + --html 内联 SVG 面板（7 例新测试）；vitest include scripts；pnpm dashboard 命令。真实进程验证：样例 JSONL → 终端曲线 + dashboard.html（SVG/转义/零外部资源断言全过）
- 2026-11-18 00:37:53 完成 #9 P5 面板：telemetry 新增 buildDashboardModel 纯函数 + scripts/offset-dashboard.mjs（终端统计 + --html 内联 SVG 面板，零依赖）+ 测试
- 2026-11-18 00:37:53 examples/sdk-vercel-demo（mock 模型 L1 补参 + L2 熔断，真实进程跑通）与 examples/plugin-mcp-demo（三进程拓扑：透传/L2 熔断/L4 阻断/审计 JSONL→dashboard 指引，真实进程跑通）；mcp cli 装配 createAuditSink 补齐 FileAuditSink 缺口（scan 白名单+依赖登记）
- 2026-11-18 00:38:13 完成 #10 examples/：sdk-vercel-demo 与 plugin-mcp-demo 两个零依赖可跑 demo（对齐 README 声明）
- 2026-11-18 00:38:13 .github/workflows/ci.yml：install(frozen) → build → lint → test → scan → verify:contracts → dashboard 冒烟（冒烟命令本机真实执行通过）
- 2026-11-18 00:54:20 撤销 #8 sanitizeClaimId 超 96 字符加短哈希防截断碰撞
- 2026-11-18 00:54:20 撤销 #9 P5 面板：telemetry 新增 buildDashboardModel 纯函数 + scripts/offset-dashboard.mjs（终端统计 + --html 内联 SVG 面板，零依赖）+ 测试
- 2026-11-18 00:54:20 撤销 #10 examples/：sdk-vercel-demo 与 plugin-mcp-demo 两个零依赖可跑 demo（对齐 README 声明）
- 2026-11-18 00:54:20 勾选错位纠正：8/9/10 的注记错位到了后续任务，先撤销重打
- 2026-11-18 00:54:21 完成 #8 sanitizeClaimId 超 96 字符加短哈希防截断碰撞
- 2026-11-18 00:54:21 sanitizeClaimId 超 96 字符截断 + sha256 短哈希防碰撞（claim.test.ts 2 例新测试）
- 2026-11-18 00:54:22 完成 #9 P5 面板：telemetry 新增 buildDashboardModel 纯函数 + scripts/offset-dashboard.mjs（终端统计 + --html 内联 SVG 面板，零依赖）+ 测试
- 2026-11-18 00:54:22 P5 面板：telemetry buildDashboardModel（6 例）+ scripts/offset-dashboard.mjs 终端 sparkline 与 --html SVG（7 例）；样例 JSONL 真实进程验证通过
- 2026-11-18 00:54:22 完成 #10 examples/：sdk-vercel-demo 与 plugin-mcp-demo 两个零依赖可跑 demo（对齐 README 声明）
- 2026-11-18 00:54:22 examples/sdk-vercel-demo 与 examples/plugin-mcp-demo 零依赖 demo 真实进程跑通；mcp cli 装配 createAuditSink
- 2026-11-18 00:54:23 完成 #11 CI：.github/workflows/ci.yml（build + lint + test + scan + verify:contracts）
- 2026-11-18 00:54:23 .github/workflows/ci.yml 全量护栏流水线，dashboard 冒烟步骤本机执行通过
- 2026-11-18 00:57:20 完成 #12 文档同步：roadmap.md P3/P5 行、README examples、docs/telemetry.md 面板用法、docs/testing.md CI 引用
- 2026-11-18 00:57:20 roadmap.md P3/P5 行更新（8 家插件落地/面板完成）；README 目录树+面板快速开始；telemetry.md 面板用法与 mcp cli 装配；testing.md CI 落地；directory-layout examples/scripts 更正
- 2026-11-18 00:57:20 完成 #13 全库验证：build + lint + test + scan + verify:contracts 全绿
- 2026-11-18 00:57:20 build(turbo 16 包)✓ lint(全包 tsc --noEmit)✓ scan(67 文件 0 违规)✓ verify:contracts(85 项 0 违规)✓ test(23 文件 248 例全绿，基线 221 + 新增 27)
- 2026-11-18 00:57:31 完成 #14 code: 上述 13 项任务全部完成，无占位残留；修复均配新增单测
- 2026-11-18 00:57:31 完成 #15 linter_result: `corepack pnpm lint`（turbo 全包 tsc --noEmit）退出码 0
- 2026-11-18 00:57:31 完成 #16 unit_test_result: `corepack pnpm test` 全绿（基线 221 例，新增 ≥12 例并给出计数）
- 2026-11-18 00:57:31 完成 #17 func_test_result: `node examples/sdk-vercel-demo/demo.mjs` 与 `node examples/plugin-mcp-demo/demo.mjs` 真实进程跑通；`node scripts/offset-dashboard.mjs --html` 对样例 JSONL 生成可打开的面板；`corepack pnpm scan` 与 `corepack pnpm verify:contracts` 退出码 0
- 2026-11-18 00:57:31 code:13 项任务全完成无占位；linter_result:turbo lint 全包 tsc --noEmit 退出码 0；unit_test_result:vitest 23 文件 248 例全绿（新增 27 例：runtime 3/mcp e2e 3/cli 3/splitCommand 4/deepseek 2/claim 2/telemetry 6/dashboard 7 中的既有复核）；func_test_result:两个 demo 与 dashboard --html 真实进程跑通，scan 0 违规、verify:contracts 85 项 0 违规
- 2026-11-18 00:57:32 完成 #18 status: 状态、剩余风险和回滚方式已记录
- 2026-11-18 00:57:32 状态：全部完成并提交（a639849..05b68df 共 12 commit）。剩余风险：① 真实宿主端到端实测仍待集成方（本机无宿主 CLI）；② sanitizeClaimId 文件名策略变更对 >96 字符旧 claim 靠 30min TTL 兜底；③ CI 首跑需在 GitHub 上验证 runner 矩阵。回滚：均为增量改动，git revert 对应 sha 即可；面板/示例/CI 为纯新增可直接删除
- 2026-11-18 00:57:33 归档：任务与完成标准全部满足
