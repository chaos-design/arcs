[中文版](./DEPLOYMENT_zh.md) · English

# Site Deployment & Preview Verification

The ARCS docs site is a Vite + React single-page app. It embeds all `docs/**/*.md` at build time into a virtual module, so the production output is fully self-contained (no runtime fetches, no external assets) and can be hosted at any path.

Visual design is modeled on [`chaos-design/memx`](https://github.com/chaos-design/memx) `site/`: a four-layer dark surface palette, condensed display headings plus monospace kickers, a fixed one-screen shell with an independently scrolling content column, six-color accent card strips, and a radial hero glow. Heavy memx-only components (artifact gallery, full-screen iframe viewer, mermaid lightbox gesture engine) are intentionally **not** ported.

## Three deployment modes

| Mode | Trigger | Where | Does it touch production? |
|---|---|---|---|
| **Local dev** | `corepack pnpm site:dev` | `http://127.0.0.1:5175` | No |
| **Vercel Preview** | Every PR touching docs/site | Automatic per-PR URL from Vercel Git integration (config: root [`vercel.json`](../vercel.json)) | No — isolated preview URL |
| **GitHub Pages Production** | Push to `main` | `.github/workflows/site.yml` → `github-pages` environment | Yes — this is the production deployment |

**Guarantee:** this branch does not modify `.github/workflows/site.yml`. The `main` branch's GitHub Pages production deployment is left exactly as-is. Vercel previews and the PR verification workflow never deploy to Pages, so they cannot overwrite production.

## Vercel

[`vercel.json`](../vercel.json) at the repository root:

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

- Install runs at the repository root so `pnpm-lock.yaml` and `pnpm-workspace.yaml` are found.
- `site:build` runs the site's `tsc --noEmit && vite build` through the workspace filter.
- `base: "./"` plus hash routing means no server-side rewrite is required; the `rewrites` rule is a harmless safety net.
- Vercel's Git integration assigns each PR its own Preview URL automatically. No token or custom Action is needed in this repository.

## GitHub Pages

Production deployment is owned solely by `.github/workflows/site.yml` on `main` (paths filter + `concurrency: pages`). It requires **Settings → Pages → Source: GitHub Actions**.

For PRs, `.github/workflows/site-preview.yml` performs verification only:

1. Validate `vercel.json`.
2. Build the exact artifact Pages/Vercel will serve (`pnpm site:build`).
3. Assert `site/dist/index.html` and `site/dist/assets/` exist.
4. Smoke-test the built site with `vite preview` + `curl`.
5. Upload the artifact as `site-preview-pr-<number>` (14-day retention) for manual inspection.

It deliberately contains **no** `actions/deploy-pages` step, so PR runs cannot overwrite the Pages production site.

## Local commands

```bash
corepack pnpm site:dev       # dev server on 127.0.0.1:5175
corepack pnpm site:build     # type-check + production build → site/dist
corepack pnpm site:preview   # serve the built dist locally
```

## What to check in a preview

- Sidebar groups and the active item; mobile drawer at ≤ 860px (hamburger, Esc, backdrop click).
- Hero gradient button / radial glow and the 4-stat strip.
- Card accent strips and hover lift on the doc matrix.
- Mermaid diagrams render with the new dark theme variables and show the "click to enlarge" hint.
- Internal `.md` links rewrite to `#/doc/...` hash routes and still resolve on a subpath deployment.
