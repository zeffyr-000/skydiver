# Contributing — Skydiver

Thanks for working on Skydiver! This is a small, opinionated codebase — consistency matters more
than personal preference. Read [AGENTS.md](../AGENTS.md) for the full set of code rules; this doc
covers the workflow.

## Before you start

```bash
nvm use && npm install
```

## Branches

- `feat/<description>` — a new feature
- `fix/<description>` — a bug fix
- `chore/<description>` — tooling, docs, deps, refactors

Branch off `main`.

## Commits

- Imperative present tense, ≤ 72 chars: `add high-score table`, not `added` / `adds`.
- One logical change per commit.

## Code style (enforced)

- **Prettier** — 100-col, single quotes. Run `npm run format` (CI runs `npm run format:check`).
- **ESLint** — `npm run lint`. Notable enforced rules: `OnPush` on every component, standalone
  components, no `any`, Angular selector prefixes (`app-` / `appCamelCase`).
- **TypeScript strict** — all strict flags on. Type things; don't reach for `any` or `!`.

See AGENTS.md for the component template and the "use signals / `inject()` / the pixel UI kit"
rules. New user-facing text **must** go through Transloco
([src/assets/i18n/en.json](../src/assets/i18n/en.json)).

## Tests

- Add/extend `<name>.spec.ts` next to what you change.
- Keep the **engine** (`src/app/features/game/engine/`) pure and deterministic so it stays
  unit-testable. See [TESTING.md](./TESTING.md).

## PR checklist

Before opening a PR, all of these must pass locally (CI re-runs them on the PR):

```bash
npm run lint
npm run format:check
npm run test:run
npm run build
npm run e2e        # if you touched gameplay/UI flows
```

- [ ] Lint, format, unit tests and production build are green
- [ ] New strings are in `en.json` and used via Transloco
- [ ] New components are standalone, `OnPush`, and use the design tokens / pixel UI kit
- [ ] Docs updated if behaviour, structure, or the UI kit changed
- [ ] No `@angular/material` import and no `--mat-sys-*` reference crept in

## Project conventions worth repeating

- No backend, no `HttpClient`. Persisted state goes through the signal stores in `src/app/shared/`.
- Class names are unsuffixed (`Game`, `Settings`, `PixelButton`).
- Lazy-load routed screens to protect the initial-bundle budget.
