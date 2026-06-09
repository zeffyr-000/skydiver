# Architecture — Skydiver

## Overview

Skydiver is a **client-side-only** web game. There is no backend server. All game state,
logic, and rendering happen entirely in the browser.

```
Browser
  └── Angular 21 SPA (zoneless, standalone, signals)
        ├── App shell (router outlet, global pixel-art theme, i18n)
        ├── Feature screens (title · game · settings · records)
        └── Game engine (pure simulation + loop + input + canvas renderer)
```

## Key Decisions

### No backend

The game runs fully offline after the initial page load. There is intentionally no API, no
authentication, and no server-side state.

Consequences:
- No `HttpClient`. Even translations are **imported at build time**, not fetched.
- Settings and high scores are stored in `localStorage`.
- No service worker / PWA today — it's a plain static SPA. (Deliberate current scope, not a TODO.)

### Angular 21 — modern patterns only

- **Zoneless** (`provideZonelessChangeDetection()`) — no Zone.js in the bundle
- **Standalone components** — no NgModules
- **`OnPush` everywhere** — components update only on signal/input change
- **`inject()`** — functional DI throughout

### State management — Angular signals

State is held in `signal` / `computed` / `effect`. No external state library.

Two root stores under `src/app/shared/`:

| Store | State | Persistence |
|-------|-------|-------------|
| [`SettingsStore`](../src/app/shared/settings.store.ts) | `volume`, `language`, `difficulty` | `localStorage` key `skydiver.settings` via an `effect` |
| [`RecordsStore`](../src/app/shared/records.store.ts) | high scores (`records` computed: sorted desc, top 10) | `localStorage` key `skydiver.records` via an `effect` |

Both **hydrate** from `localStorage` in their constructor (tolerating missing/corrupt payloads)
and **persist** via an `effect` that re-serialises on any change.

### Routing

Angular Router with lazy-loaded standalone components and `PreloadAllModules`:

```typescript
// app.routes.ts
{ path: '',         loadComponent: () => import('./features/title/title').then(m => m.Title) }
{ path: 'game',     loadComponent: () => import('./features/game/game').then(m => m.Game) }
{ path: 'settings', loadComponent: () => import('./features/settings/settings').then(m => m.Settings) }
{ path: 'records',  loadComponent: () => import('./features/records/records').then(m => m.Records) }
{ path: '**', redirectTo: '' }
```

### i18n — Transloco (statically bundled)

All user-facing strings live in `src/assets/i18n/*.json`. [`TranslocoStaticLoader`](../src/app/transloco.loader.ts)
**imports** the JSON at build time and returns it from a lookup map — there is no HTTP request.
Configured with default language `en`, `reRenderOnLangChange: true`, and MessageFormat for ICU
plural/select. Adding a language is documented in the [README](../README.md#-internationalisation).

### Styling — bespoke pixel-art design system

No Angular Material. The look is an in-house 8/16-bit pixel theme:

- **Tokens** in [`_tokens.scss`](../src/styles/_tokens.scss) — a limited retro palette
  (`--biplane-red`, `--brass`, `--parchment`, `--sky-bg`, …), a 4px spacing grid (`--sp-*`),
  a bitmap type scale, and `--radius: 0`. Exposed as CSS custom properties so components consume
  them without `@use`.
- **Surface mixins** in [`_pixel-ui.scss`](../src/styles/_pixel-ui.scss) — `pixel-bevel` /
  `pixel-inset` build raised/sunken borders from multi-layer **zero-blur** box-shadows, so edges
  stay crisp at any resolution with **no image assets**.
- **Fonts** — Press Start 2P (headings) and VT323 (body), self-hosted in `public/assets/fonts`.

Full reference: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## The Game Engine

Everything under [`src/app/features/game/engine/`](../src/app/features/game/engine/) is plain
TypeScript with **no Angular dependency**, split by concern:

| File | Role | DOM/clock? |
|------|------|-----------|
| `types.ts` | `Phase`, `InputState`, `GameConfig`, `GameState`, `JumpResult` | pure |
| `config.ts` | `BASE_CONFIG` + `configForDifficulty()` tuning | pure |
| `physics.ts` | `createInitialState()`, `integrate()`, `resolveLanding()`, `computeScore()` | **pure** |
| `loop.ts` | `GameLoop` — fixed-timestep `requestAnimationFrame` driver | rAF + `performance.now` |
| `input.ts` | `InputController` — keyboard → `InputState` | DOM events |
| `renderer.ts` | `SkyDiverRenderer` — top-down `<canvas>` drawing | canvas 2D |

**Determinism.** `integrate(state, input, dt, cfg)` is a pure function that returns a *new*
state. Wind gusts are a function of elapsed time (not `Math.random`), and `createInitialState`
takes an injectable `rng`, so a fixed seed + input sequence reproduces exactly — see
[physics.spec.ts](../src/app/features/game/engine/physics.spec.ts).

**Fixed timestep.** `GameLoop` accumulates real frame time and steps physics at a constant
`dt = 1/60` (stable, deterministic), rendering once per animation frame. Huge gaps (backgrounded
tab) are clamped so it never floods with catch-up steps.

**Renderer as camera.** The diver is always screen-centre; the ground (target, grid) is drawn
relative to it, and pixels-per-metre grows as altitude shrinks so the bullseye visibly swells on
the way down. Canvas colours mirror the SCSS tokens (a canvas can't cheaply read CSS variables
each frame), so keep them in sync.

### The `Game` component — the Angular ↔ engine bridge

[`Game`](../src/app/features/game/game.ts) owns the engine lifecycle and exposes only HUD-facing
signals to the template:

```
afterNextRender → boot(): build config (from difficulty) · create input/renderer/loop · start
GameLoop.step(dt) → integrate state · on resolve update lives/score · push HUD (throttled ~10Hz)
GameLoop.render() → renderer.draw(state)
DestroyRef.onDestroy → stop loop · dispose input
```

HUD signals (`score`, `lives`, `altitude`, …) are written at most ~10 Hz, decoupled from the
60 Hz simulation, to keep change detection off the hot loop. The raw `GameState` is a plain
field, never read in the template.

## Data Flow

```
Keyboard ──► InputController.read() ──► InputState
                                          │
                  GameLoop (60Hz fixed) ──┤
                                          ▼
                              physics.integrate()  ──►  new GameState
                                          │                  │
                        (throttled ~10Hz) │                  │ every frame
                                          ▼                  ▼
                               HUD signals (OnPush)   SkyDiverRenderer → <canvas>
                                          │
                            on game over: RecordsStore.add() → localStorage
```

## Build

Angular CLI 21 with `@angular/build:application` (esbuild). Production builds are tree-shaken and
output-hashed to `dist/skydiver/`.

Performance budgets (enforced at build time):
- Initial bundle: 500 kB warning / 1 MB error
- Any component stylesheet: 8 kB warning / 16 kB error

## Testing

- **Unit**: Vitest via `@angular/build:unit-test` — `npm run test:run` (coverage:
  `npm run test:coverage`). The pure engine and the stores are the most heavily covered.
- **E2E**: Playwright against `http://localhost:4200` — `npm run e2e`. The `Game` component's
  canvas/`rAF` path (not exercisable under jsdom) is covered here; `?fast=1` shrinks a jump so a
  full landing resolves in seconds.

Details: [TESTING.md](./TESTING.md).
