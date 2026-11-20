[中文版](./DEPLOYMENT_zh.md) · English

# Site Deployment & Preview Verification

The ARCS docs site is a config-driven, multi-page static site. `site/scripts/docs_site.py` reads `docs/*.md` and `docs/en/*.md` and emits one self-contained HTML per page per language into `site/dist/`. There is no runtime fetch of document content; the only local asset is the Mermaid runtime JS used to render diagrams as real SVG in the browser (no CDN).

Visual design: a dependency-free responsive documentation layout — 280px sidebar + fluid content on desktop, an 860px mobile breakpoint with a top bar and full-screen navigation panel, a light/dark theme switch, a 中文/EN toggle that switches both the whole document body and the UI labels, a diagram lightbox, and a GitHub link pinned at the sidebar footer (plus an icon button on mobile).

## Three deployment modes

| Mode | Trigger | Where | Does it touch production? |
|---|---|---|---|
| **Local dev** | `corepack pnpm site:dev` | `http://127.0.0.1:5175` | No |
| **Vercel Preview** | Every PR touching docs/site | Automatic per-PR URL from Vercel Git integration (config: [`site/vercel.json`](./vercel.json)) | No — isolated preview URL |
| **GitHub Pages Production** | Push to `main` | `.github/workflows/site.yml` → `github-pages` environment | Yes — this is the production deployment |

**Guarantee:** this branch does not modify `.github/workflows/site.yml`. The `main` branch's GitHub Pages production deployment is left exactly as-is. Vercel previews and the PR verification workflow never deploy to Pages, so they cannot overwrite production.

## Vercel

The Vercel project is `arcs-site`, with its **Root Directory set to `site/`**. Its configuration is [`site/vercel.json`](./vercel.json), kept identical to `main`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "installCommand": "corepack pnpm install --frozen-lockfile",
  "buildCommand": "corepack pnpm build",
  "outputDirectory": "dist"
}
```

- `buildCommand` runs the site package's `build` script, which executes `scripts/build.mjs`: copy the Mermaid runtime into `dist/assets`, generate both language variants from `site.config.json`, and run the structural check.
- `site/package.json` also declares a `site:build` alias pointing to the same build. It is needed because Vercel may invoke `pnpm site:build` from the `site/` Root Directory, where the repository-root script with the same name is not visible — without it the build fails with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`.
- All links are relative static paths (`./page.html`, `../page.html`), so no server-side rewrite is required on a subpath deployment.
- There is no root-level `vercel.json`: `arcs-site` is the only Vercel deployment for this repository, and this PR intentionally leaves its deployment configuration untouched.
- Vercel's Git integration assigns each PR its own Preview URL automatically. No token or custom Action is needed in this repository.

## GitHub Pages

Production deployment is owned solely by `.github/workflows/site.yml` on `main` (paths filter + `concurrency: pages`). It requires **Settings → Pages → Source: GitHub Actions**.

For PRs, `.github/workflows/site-preview.yml` performs verification only:

1. Validate `site/vercel.json`.
2. Build the exact artifact Pages/Vercel will serve (`pnpm site:build`).
3. Assert `site/dist/index.html` and `site/dist/assets/` exist.
4. Smoke-test the built site with `vite preview` + `curl`.
5. Upload the artifact as `site-preview-pr-<number>` (14-day retention) for manual inspection.

It deliberately contains **no** `actions/deploy-pages` step, so PR runs cannot overwrite the Pages production site.

## Local commands

```bash
corepack pnpm site:dev       # build, then serve on 127.0.0.1:5175
corepack pnpm site:build     # generate + structurally check site/dist
corepack pnpm site:preview   # serve the built dist locally
```

## What to check in a preview

- Sidebar groups and the active item; the 860px mobile top bar / full-screen nav panel (hamburger, Esc, backdrop click).
- Hero gradient and the 4-stat strip; card grid on the doc matrix.
- 中文/EN toggle switches the whole document body and the UI labels, and links resolve in both variants.
- Mermaid diagrams render as real SVG and the click-to-enlarge lightbox works.
- Internal `.md` links rewrite to language-aware static page links and still resolve on a subpath deployment.
- The GitHub link is reachable from the sidebar footer and the mobile top bar.
