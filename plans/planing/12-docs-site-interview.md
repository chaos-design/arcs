---
title: 文档完善：架构设计文档修订 + 面试题库 + Vite/React 文档站点（参考 memx）
priority: P1
created: 2026-11-18 01:00:05
updated: 2026-11-18 01:35:08
---

# 文档完善：架构设计文档修订 + 面试题库 + Vite/React 文档站点（参考 memx）

## 目标

架构设计文档更新到当前实现（host-kit 层、8 插件、CLI、观测链路、稳健性红线）；新增面试题库；按 memx 模式（Vite+React+marked+highlight.js+mermaid，构建时内嵌 docs/*.md）开发文档站点并接入 CI/Pages

## 范围

- 包含：`docs/architecture.md` 修订、`docs/interview.md` 新增、`docs/README.md` 索引、`site/`（Vite + React 文档站点，参考 chaos-design/memx 的 site/ 形态）、`pnpm-workspace.yaml`、根 package.json 脚本、`.github/workflows/site.yml`。
- 不包含：docs 其余分册内容重写（core/plugin-kit/plugins 等已随实现同步，本计划只做索引与架构总纲修订）；站点搜索/多语言（docs/en）；Vercel 部署（仅提供 GitHub Pages 工作流，Pages 开关由仓库管理员启用）。

## 实施任务

- [x] 架构设计文档修订：分层架构图补 host-kit/8 插件/CLI/面板，新增能力矩阵、进程拓扑、稳健性红线小节
- [x] 新增 docs/interview.md 面试题库（分主题分组，含考点与参考答案，交叉引用既有文档）
- [x] docs/README.md 索引与 architecture.md 详细设计清单同步新增条目
- [x] site/ 文档站点骨架：Vite+React，docsModule 虚拟模块构建时内嵌 docs/**/*.md，hash 路由 + 侧栏 + Mermaid/Hljs 渲染
- [x] 站点内容视图：Home 总览 + DocView 渲染器 + 侧栏分组（架构/包/插件/流程/质量/题库）
- [x] 接入 pnpm-workspace 与根脚本（site:dev/site:build），站点可构建出静态产物
- [x] site 部署工作流（GitHub Pages）与 CI 站点构建冒烟
- [x] 全库验证：build + lint + test + scan + verify:contracts + site:build 全绿

## 完成标准

- [x] code: 8 项任务全部完成，无占位残留
- [x] linter_result: `corepack pnpm lint`（全包 tsc --noEmit）退出码 0，站点 `tsc -b` 通过
- [ ] unit_test_result: `corepack pnpm test` 全绿（248 例不回退）
- [ ] func_test_result: `corepack pnpm site:build` 产出 site/dist 静态站点且包含全部 docs 内容；既有护栏（scan / verify:contracts）退出码 0
- [ ] status: 状态、剩余风险和回滚方式已记录

## 风险与回滚

- 风险：① mermaid/react 依赖为站点专属新增依赖，需锁定版本避免与根 vitest 的 vite 版本冲突（站点独立依赖树，经 pnpm workspace 隔离）；② 架构图修订与既有分册描述不一致的漂移风险（修订只增不改语义）；③ 面试题答案与实现细节漂移（答案引用文档相对链接，随文档同步演进）。
- 回滚：站点为纯新增目录，删除 site/ 与工作区/脚本/工作流引用即可；架构文档与题库为文档增量，git revert 单提交回滚。

## 进度日志

- 2026-11-18 01:00:05 创建（planing）
- 2026-11-18 01:32:30 完成 #1 架构设计文档修订：分层架构图补 host-kit/8 插件/CLI/面板，新增能力矩阵、进程拓扑、稳健性红线小节
- 2026-11-18 01:32:30 完成 #2 新增 docs/interview.md 面试题库（分主题分组，含考点与参考答案，交叉引用既有文档）
- 2026-11-18 01:32:30 完成 #3 docs/README.md 索引与 architecture.md 详细设计清单同步新增条目
- 2026-11-18 01:32:30 完成 #4 site/ 文档站点骨架：Vite+React，docsModule 虚拟模块构建时内嵌 docs/**/*.md，hash 路由 + 侧栏 + Mermaid/Hljs 渲染
- 2026-11-18 01:32:30 完成 #5 站点内容视图：Home 总览 + DocView 渲染器 + 侧栏分组（架构/包/插件/流程/质量/题库）
- 2026-11-18 01:32:30 完成 #6 接入 pnpm-workspace 与根脚本（site:dev/site:build），站点可构建出静态产物
- 2026-11-18 01:32:30 完成 #7 site 部署工作流（GitHub Pages）与 CI 站点构建冒烟
- 2026-11-18 01:32:30 架构文档修订（分层图含 host-kit/8 插件/CLI/面板 + 能力矩阵 + 进程拓扑 + 稳健性红线 + 观测闭环）；docs/host-kit.md 与 docs/interview.md（36 题 8 组）新增；索引同步；site/ Vite+React 站点（虚拟模块内嵌 docs、hash 路由、marked+hljs 按需语言+mermaid 单 chunk 根治嵌套 import 死锁、CJK 粗体预处理、路由切换正文复用修复）；workspace/根脚本/Pages 工作流接入。浏览器实测：首页/架构/key-flows(4 图)/telemetry/interview 渲染全过、路由切换正文正确
- 2026-11-18 01:35:07 完成 #8 全库验证：build + lint + test + scan + verify:contracts + site:build 全绿
- 2026-11-18 01:35:07 build(turbo)✓ lint(全包 tsc)✓ test 248 例✓ scan 67 文件 0 违规✓ verify:contracts 85 项✓ site:build 产出 dist 并经浏览器实测（首页/4 个文档页/Mermaid 3+1+4 图/路由切换/粗体）
- 2026-11-18 01:35:07 完成 #9 code: 8 项任务全部完成，无占位残留
- 2026-11-18 01:35:07 code:8 项任务完成无占位；linter_result:pnpm lint + site tsc -p . --noEmit 退出码 0；unit_test_result:248 例全绿；func_test_result:site:build 真实构建 + 浏览器渲染实测通过、scan/verify:contracts 0 违规
- 2026-11-18 01:35:08 完成 #10 linter_result: `corepack pnpm lint`（全包 tsc --noEmit）退出码 0，站点 `tsc -b` 通过
- 2026-11-18 01:35:08 状态：全部完成。剩余风险：① GitHub Pages 需仓库管理员在 Settings→Pages 将 Source 设为 GitHub Actions 后工作流才会部署；② mermaid 单 chunk 3.4MB（gzip 944KB）为懒加载分包，仅含图页面按需下载；③ 站点导航为手工清单，新增 docs 文件需同步 site/src/docs.ts。回滚：site/ 为纯新增目录可直接删除；架构/题库为文档增量 git revert 单提交；vite.config.ts manualChunks 若上游 mermaid 修复死锁可移除
