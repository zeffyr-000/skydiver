# Deployment — Skydiver

Skydiver is a **static single-page app** with no backend. Deploying it means building it and
serving the resulting folder from any static host (Netlify, Vercel, GitHub Pages, Nginx, S3 +
CloudFront, …).

## Build

```bash
npm ci
npm run build        # production config by default
```

Output: **`dist/skydiver/browser/`** (the `@angular/build:application` builder emits a `browser/`
subfolder). That folder is the entire deployable artifact — static HTML/JS/CSS plus the hashed
assets and the bundled i18n JSON.

The production build is tree-shaken and output-hashed, and fails if it exceeds the budgets
(initial bundle 1 MB, any component style 16 kB — see `angular.json`).

## Hosting requirements

1. **SPA fallback.** Because the app uses the Angular Router (HTML5 history mode), the server
   must serve `index.html` for unknown paths so deep links like `/records` work on reload.
   - Netlify: `/* /index.html 200`
   - Nginx: `try_files $uri $uri/ /index.html;`
   - Vercel / Cloudflare Pages: enable SPA fallback
2. **`base href`.** If you serve from a sub-path (e.g. GitHub Pages `/<repo>/`), build with
   `npm run build -- --base-href=/<repo>/`. At the domain root, the default `/` is fine.
3. **No env/runtime config.** There are no API keys or environment variables to set — everything
   ships in the bundle.

## Caching

Filenames are content-hashed, so the static assets are safe to cache aggressively
(`Cache-Control: max-age=31536000, immutable`). Serve `index.html` with a short/no-cache policy so
clients pick up new deploys.

## Example: Netlify

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist/skydiver/browser"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## CI

`.github/workflows/pr-check.yml` lints, runs unit tests (with coverage) and builds the production
bundle on every PR to `main`, so a merge to `main` is known to build.

## Continuous deployment (GitHub Pages)

`.github/workflows/deploy.yml` builds and publishes to **GitHub Pages** automatically on every push
to `main` (and on manual `workflow_dispatch`). The site is served at
**https://zeffyr-000.github.io/skydiver/**.

How it works:

1. Builds the production bundle with `--base-href=/skydiver/` (project page lives under a sub-path).
2. Copies `index.html` to `404.html` so deep links resolve to the Angular router on reload (Pages
   has no built-in SPA fallback).
3. Uploads `dist/skydiver/browser/` as a Pages artifact and deploys it with `actions/deploy-pages`.

No secrets are needed — it uses the repo's built-in `GITHUB_TOKEN` and OIDC.

### One-time setup

In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. After that,
every merge to `main` deploys on its own. (Custom domain: set it in the same Pages settings, add a
`public/CNAME` file, and change the build to `--base-href=/`.)
