# Setup — Skydiver

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | **22+** (24.x also supported; see `.nvmrc`) |
| npm | **10+** |

The versions are pinned in `package.json` (`engines`) and `.nvmrc`. With `nvm`:

```bash
nvm use   # picks up .nvmrc (Node 22)
```

## Install

```bash
npm install
```

No environment variables, secrets, or services are required — Skydiver is a fully client-side
SPA with no backend.

## Run the dev server

```bash
npm start          # http://localhost:4200, live reload
```

## Common scripts

| Script | What it does |
|--------|--------------|
| `npm start` | Dev server on :4200 |
| `npm run build` | Production build → `dist/skydiver/` |
| `npm run watch` | Development build, rebuild on change |
| `npm test` | Unit tests (Vitest) in watch mode |
| `npm run test:run` | Unit tests, single run |
| `npm run test:coverage` | Unit tests + coverage report |
| `npm run e2e` | Playwright E2E (boots the dev server automatically) |
| `npm run e2e:ui` / `e2e:headed` / `e2e:report` | Interactive / headed / last HTML report |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier write / verify |

## First-time E2E

Playwright needs its browser binaries once:

```bash
npx playwright install --with-deps chromium
npm run e2e
```

## Project layout

See the [README](../README.md#-project-structure) for the folder map and
[ARCHITECTURE.md](./ARCHITECTURE.md) for how it fits together.
