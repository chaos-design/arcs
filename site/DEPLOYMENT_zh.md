[English](./DEPLOYMENT.md) · 中文

# 站点部署与预览验证

ARCS 文档站点是基于 Vite + React 的单页应用。构建时所有 `docs/**/*.md` 会被内嵌为虚拟模块，因此产物完全自包含（无运行时 fetch、无外部资源），可托管在任意子路径下。

视觉设计参考 [`chaos-design/memx`](https://github.com/chaos-design/memx) 的 `site/`：四层暗色 surface 色阶、condensed 标题 + 等宽 kicker 双轨排版、一屏固定外壳 + 独立滚动内容列、6 色卡片色条、hero 径向光晕。memx 独有的重型组件（产物画廊、全屏 iframe 查看器、Mermaid 手势放大引擎）**刻意不移植**。

## 三种部署形态

| 形态 | 触发 | 位置 | 是否影响生产？ |
|---|---|---|---|
| **本地开发** | `corepack pnpm site:dev` | `http://127.0.0.1:5175` | 否 |
| **Vercel 预览** | 任何改动 docs/site 的 PR | Vercel Git 集成为每个 PR 自动分配的 URL（配置：根目录 [`vercel.json`](../vercel.json)） | 否——隔离的预览 URL |
| **GitHub Pages 生产** | 推送到 `main` | `.github/workflows/site.yml` → `github-pages` 环境 | 是——这是生产部署 |

**保证**：本分支不修改 `.github/workflows/site.yml`，`main` 分支现有的 GitHub Pages 生产部署保持原样。Vercel 预览与 PR 验证工作流都不会部署到 Pages，因此不可能覆盖生产站点。

## Vercel

仓库根目录的 [`vercel.json`](../vercel.json)：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "installCommand": "corepack pnpm install --frozen-lockfile",
  "buildCommand": "corepack pnpm site:build",
  "outputDirectory": "site/dist",
  "rewrites": [{ "source": "/((?!.*\\..*).*)", "destination": "/index.html" }]
}
```

- 安装在仓库根执行，以便找到 `pnpm-lock.yaml` 与 `pnpm-workspace.yaml`。
- `site:build` 通过 workspace filter 运行站点的 `tsc --noEmit && vite build`。
- `base: "./"` 配合 hash 路由，无需服务端 rewrite；`rewrites` 规则只是无害的兜底。
- Vercel Git 集成为每个 PR 自动分配独立 Preview URL，本仓库无需配置 token 或额外 Action。

## GitHub Pages

生产部署仅由 `main` 上的 `.github/workflows/site.yml` 负责（含 paths 过滤与 `concurrency: pages`），需在仓库 **Settings → Pages → Source: GitHub Actions** 开启。

PR 上由 `.github/workflows/site-preview.yml` 只做验证：

1. 校验 `vercel.json`。
2. 构建 Pages/Vercel 将提供的同一份产物（`pnpm site:build`）。
3. 断言 `site/dist/index.html` 与 `site/dist/assets/` 存在。
4. 用 `vite preview` + `curl` 对构建产物做冒烟测试。
5. 上传产物为 `site-preview-pr-<number>`（保留 14 天）供人工查看。

它**刻意不含** `actions/deploy-pages` 步骤，因此 PR 运行不可能覆盖 Pages 生产站点。

## 本地命令

```bash
corepack pnpm site:dev       # 开发服务器 127.0.0.1:5175
corepack pnpm site:build     # 类型检查 + 生产构建 → site/dist
corepack pnpm site:preview   # 本地托管已构建产物
```

## 预览中应检查的点

- 侧栏分组与当前项高亮；≤ 860px 移动端抽屉（汉堡按钮、Esc、遮罩点击）。
- Hero 渐变按钮 / 径向光晕与 4 项统计块。
- 文档矩阵卡片的色条与 hover 抬升。
- Mermaid 图使用新的暗色 themeVariables 渲染，并显示"点击放大"提示。
- 站内 `.md` 链接改写为 `#/doc/...` hash 路由，且在子路径部署下仍可解析。
