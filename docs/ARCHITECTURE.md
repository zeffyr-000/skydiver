# Architecture — Skydiver

## Overview

Skydiver is a **client-side-only** web game. There is no backend server. All game state,
logic, and rendering happen entirely in the browser.

```
Browser
  └── Angular 21 SPA (zoneless, standalone, signals)
        ├── App shell (router outlet, screen-wipe overlay, global pixel-art theme, i18n)
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

### Screen transitions — SNES checkerboard wipe

Route changes play a retro checkerboard wipe, driven by
[`TransitionService`](../src/app/shared/transition.service.ts) and rendered by the
[`ScreenWipe`](../src/app/ui/screen-wipe/screen-wipe.ts) overlay mounted once in the app shell:

- `transition.navigate(url)` covers the screen (diagonal wave of cells, `steps()` timing, ~520 ms),
  then routes; calls made mid-wipe are ignored (double-click guard).
- The **reveal half runs off router events**, so navigations that bypass the service (the game
  screen's quit button, browser back/forward) still get a clean wipe-in. The very first navigation
  (initial load) is skipped, and `NavigationCancel`/`Error` resets to idle so the cover never
  strands.
- Timing constants live in the service and are bound into the CSS as custom properties — one
  source of truth for both the `setTimeout`s and the cell animations.
- `prefers-reduced-motion` turns the wipe into an instant cut, and a global media query in
  `styles.scss` collapses every other animation to a static end state.
- After each navigation, focus moves to the `#app-shell` element for keyboard/screen-reader users.

### i18n — Transloco (statically bundled)

All user-facing strings live in `src/assets/i18n/*.json`. [`TranslocoStaticLoader`](../src/app/transloco.loader.ts)
**imports** the JSON at build time and returns it from a lookup map — there is no HTTP request.
Configured with default language `en` (also ships `fr`), `reRenderOnLangChange: true`, and
MessageFormat for ICU plural/select. The active language is driven from the persisted
[`SettingsStore`](../src/app/shared/settings.store.ts) choice by the root
[`App`](../src/app/app.ts). Adding a language is documented in the
[README](../README.md#-internationalisation).

### Styling — bespoke pixel-art design system

No Angular Material. The look is an in-house 8/16-bit pixel theme:

- **Tokens** in [`_tokens.scss`](../src/styles/_tokens.scss) — a limited retro palette
  (`--biplane-red`, `--brass`, `--parchment`, `--sky-bg`, …), a 4px spacing grid (`--sp-*`),
  a bitmap type scale, and `--radius: 0`. Exposed as CSS custom properties so components consume
  them without `@use`.
- **Surface mixins** in [`_pixel-ui.scss`](../src/styles/_pixel-ui.scss) — `pixel-bevel` /
  `pixel-inset` build raised/sunken borders from multi-layer **zero-blur** box-shadows, so edges
  stay crisp at any resolution with **no image assets**.
- **Fonts** — Pixelify Sans (headings/UI chrome, variable 400–700) and VT323 (body), self-hosted
  in `public/assets/fonts`.
- **Shared backdrop** — the non-game screens render the same animated
  [`SkyScene`](../src/app/ui/sky-scene/sky-scene.ts) world behind their content (`full` attract
  mode on the title; `calm` behind Settings/Records panels): a generated golden-hour sky strip
  (banded + dithered `sky.png`), a low sun and silhouetted hills on the horizon. Decorative
  sprites are **CSS crops** of the generated sheets via
  [`_sprites.scss`](../src/styles/_sprites.scss) — the UI never imports engine code. The in-game
  renderer follows the same grade (its altitude haze mirrors `--sky-twilight`).

Full reference: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## The Game Engine

Everything under [`src/app/features/game/engine/`](../src/app/features/game/engine/) is plain
TypeScript with **no Angular dependency**, split by concern:

| File | Role | DOM/clock? |
|------|------|-----------|
| `types.ts` | `Phase`, `InputState`, `GameConfig`, `GameState`, `JumpResult` | pure |
| `config.ts` | `BASE_CONFIG` + `configForDifficulty()` tuning | pure |
| `physics.ts` | `createInitialState()`, `integrate()`, `resolveLanding()`, `computeScore()` | **pure** |
| `ground.ts` | `generateTerrain()` — seeded per-jump scenery layout (`mulberry32`) | **pure** |
| `loop.ts` | `GameLoop` — fixed-timestep `requestAnimationFrame` driver | rAF + `performance.now` |
| `input.ts` | `InputController` — keyboard → `InputState` | DOM events |
| `sprites.ts` | `loadAtlas()` / `drawSprite()` — pixel-art sprite sheets | Image API |
| `renderer.ts` | `SkyDiverRenderer` — top-down `<canvas>` drawing | canvas 2D |

**Phases & cinematics.** A jump runs `PlaneApproach → Freefall → Deploying → Canopy →
Landed/Crashed`. The intro (biplane crossing), the canopy opening and the landing/crash outro
are all **engine state** (timers in `GameState`, durations in `GameConfig`) rather than a
presentation-layer animation: they are deterministic, unit-tested, shortened by the `?fast=1`
test config, and pausing the loop pauses them for free. In free fall, up/down drive body
**pitch** (track dives faster and surges forward; arch falls slower with weaker steering)
instead of direct Y movement.

**Sprites.** Pixel-art sheets in `public/assets/sprites/` are generated by
`tools/generate-sprites.mjs` (pure Node, committed PNGs, a few kB total — served at runtime, so
no bundle-budget impact). Sheets ship at **2x source resolution** with a baked hi-bit shading
pass; `SHEET_SPECS` carries a `res` field and `drawSprite` divides the destination size by it,
so the renderer keeps reasoning in logical art pixels. The renderer takes the atlas as an
optional late-bound property and falls back to procedural shapes until it loads (or if it never
does), so unit tests and first paint never depend on an image fetch.

**Determinism.** `integrate(state, input, dt, cfg)` is a pure function that returns a *new*
state. Wind gusts are a function of elapsed time (not `Math.random`), and `createInitialState`
takes an injectable `rng`, so a fixed seed + input sequence reproduces exactly — see
[physics.spec.ts](../src/app/features/game/engine/physics.spec.ts).

**Per-jump variety.** Every jump re-rolls its challenge from that rng: wind direction AND
strength (a 0.4–1.4 weather multiplier on the difficulty's base wind and gusts, stored as
`windGustScale`), the exit offset (up to `startSpread` metres from the target — far exits make
tracking matter), the plane's approach heading, and the terrain seed. `generateTerrain` then
rolls a biome (meadow / woodland / wetland / farmstead scenery weights), scatters part of the
scenery into clustered groves, and places **one landmark per jump** — a lake, an airstrip (with
a parked biplane: that's where the jump ship takes off from) or a dense forest — so consecutive
drop zones read as different places. New rng draws are only ever APPENDED in
`createInitialState` — the draw order is a frozen contract guarded by a fixed-seed spec.

**Fixed timestep.** `GameLoop` accumulates real frame time and steps physics at a constant
`dt = 1/60` (stable, deterministic), rendering once per animation frame. Huge gaps (backgrounded
tab) are clamped so it never floods with catch-up steps.

**Renderer as camera.** The diver is always screen-centre; the ground (terrain patchwork, road,
target, seeded decorations) is drawn relative to it. Pixels-per-metre follows true perspective —
`ppm = groundPpm · H / (altitude + H)` with a virtual eye height `H` — so the target stays small
for most of the fall and rushes up over the last hundred metres (real "ground rush"), instead of
the front-loaded growth a linear blend gives. The plane is drawn **after** the diver: he falls
away below it, so it occludes him right after exit. When the atlas is loaded, the `ground`
sheet is overlaid as a low-alpha screen-space `createPattern` texture (grass grain over the flat
field colours); without it — or without `createPattern`, as in the jsdom mock — the renderer
keeps its flat-colour fallback. An atmospheric-haze overlay fades the
ground toward the sky colour at altitude, and the diver's drop shadow converges beneath him as
he descends. Everything the renderer draws is a pure function of `(state, config)` — animation
frames derive from `elapsed` and the state timers, never `performance.now()`. Canvas colours
mirror the SCSS tokens (a canvas can't cheaply read CSS variables each frame), so keep them in
sync — the sprite generator shares the same palette.

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
  full landing resolves in seconds. `navigation.spec.ts` covers the screen-wipe flow between the
  menu screens.

Details: [TESTING.md](./TESTING.md).
