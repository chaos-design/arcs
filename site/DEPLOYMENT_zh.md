[English](./DEPLOYMENT.md) · 中文

# 站点部署与预览验证

ARCS 文档站点是配置驱动的多页静态站点。`site/scripts/docs_site.py` 读取 `docs/*.md` 与 `docs/en/*.md`，为每篇文档的中英两种语言各产出一个自包含 HTML 到 `site/dist/`。文档内容没有运行时 fetch；唯一的本地资源是用于把图表渲染为真实 SVG 的 Mermaid 运行时 JS（无 CDN）。

视觉设计：零依赖的响应式文档布局——桌面为 280px 侧栏 + 流式内容列，860px 断点切换为顶栏 + 全屏导航面板；包含明暗主题切换、中/EN 切换（同时切换正文与界面文案）、图表放大弹层，以及固定在侧栏底部的 GitHub 链接（移动端另有顶栏图标）。

## 三种部署形态

| 形态 | 触发 | 位置 | 是否影响生产？ |
|---|---|---|---|
| **本地开发** | `corepack pnpm site:dev` | `http://127.0.0.1:5175` | 否 |
| **Vercel 预览** | 任何改动 docs/site 的 PR | Vercel Git 集成为每个 PR 自动分配的 URL（配置：[`site/vercel.json`](./vercel.json)） | 否——隔离的预览 URL |
| **GitHub Pages 生产** | 推送到 `main` | `.github/workflows/site.yml` → `github-pages` 环境 | 是——这是生产部署 |

**保证**：本分支不修改 `.github/workflows/site.yml`，`main` 分支现有的 GitHub Pages 生产部署保持原样。Vercel 预览与 PR 验证工作流都不会部署到 Pages，因此不可能覆盖生产站点。

## Vercel

Vercel 项目为 `arcs-site`，其 **Root Directory 设为 `site/`**。配置为 [`site/vercel.json`](./vercel.json)，与 `main` 保持一致：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "installCommand": "corepack pnpm install --frozen-lockfile",
  "buildCommand": "corepack pnpm build",
  "outputDirectory": "dist"
}
```

- `buildCommand` 运行站点包的 `build` 脚本，即 `scripts/build.mjs`：把 Mermaid 运行时复制进 `dist/assets`，由 `site.config.json` 生成中英两套页面，并做结构校验。
- `site/package.json` 另外声明了指向同一构建的 `site:build` 别名。它不可省略：Vercel 可能在 `site/` 这个 Root Directory 下执行 `pnpm site:build`，此时仓库根的同名脚本不可见，缺少别名会以 `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` 失败。
- 站内链接均为相对静态路径（`./page.html`、`../page.html`），子路径部署无需服务端 rewrite。
- 没有根目录的 `vercel.json`：`arcs-site` 是本仓库唯一的 Vercel 部署，本 PR 有意不改动其部署配置。
- Vercel Git 集成为每个 PR 自动分配独立 Preview URL，本仓库无需配置 token 或额外 Action。

## GitHub Pages

生产部署仅由 `main` 上的 `.github/workflows/site.yml` 负责（含 paths 过滤与 `concurrency: pages`），需在仓库 **Settings → Pages → Source: GitHub Actions** 开启。

PR 上由 `.github/workflows/site-preview.yml` 只做验证：

1. 校验 `site/vercel.json`。
2. 构建 Pages/Vercel 将提供的同一份产物（`pnpm site:build`）。
3. 断言 `site/dist/index.html` 与 `site/dist/assets/` 存在。
4. 用 `vite preview` + `curl` 对构建产物做冒烟测试。
5. 上传产物为 `site-preview-pr-<number>`（保留 14 天）供人工查看。

它**刻意不含** `actions/deploy-pages` 步骤，因此 PR 运行不可能覆盖 Pages 生产站点。

## 本地命令

```bash
corepack pnpm site:dev       # 构建并在 127.0.0.1:5175 提供预览
corepack pnpm site:build     # 生成 + 结构校验 site/dist
corepack pnpm site:preview   # 本地托管已构建产物
```

## 预览中应检查的点

- 侧栏分组与当前项高亮；≤ 860px 移动端顶栏 / 全屏导航面板（汉堡按钮、Esc、遮罩点击）。
- Hero 渐变与 4 项统计块；文档矩阵卡片网格。
- 中/EN 切换同时改变正文与界面文案，且两种语言的链接都能正确解析。
- Mermaid 图渲染为真实 SVG，且点击放大弹层可用。
- 站内 `.md` 链接改写为带语言的静态页面链接，且在子路径部署下仍可解析。
- 侧栏底部与移动端顶栏均可访问 GitHub 链接。
