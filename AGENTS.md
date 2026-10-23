# Agent Guidelines — Skydiver

This document defines rules and patterns for AI agents (Claude Code, GitHub Copilot, etc.)
working on this codebase. Read it in full before making any change.

## Tech Stack

| Tool | Version | Notes |
|------|---------|-------|
| Angular | 22 | Zoneless, standalone components, no NgModules |
| `@angular/aria` | 22 | Headless accessible primitives (listbox, dialog semantics). **Not Angular Material.** |
| `@angular/cdk` | 22 | Low-level utilities |
| In-house pixel-art UI kit | — | `src/app/ui/pixel-*` — use these, not third-party components |
| @jsverse/transloco | ~8.3 | i18n — all user-facing strings go through Transloco |
| TypeScript | ~6.0 | Strict mode — all flags enabled |
| Vitest | ~4 | Unit test runner (via `@angular/build:unit-test`) |
| Playwright | ~1.60 | E2E tests in `e2e/` |
| ESLint + angular-eslint | 10 / 21 | Enforced via `ng lint` |
| Prettier | ~3 | 100-char line width, single quotes |

> ⚠️ **There is no Angular Material.** The UI is a bespoke pixel-art kit. Never import
> `@angular/material` or reference `--mat-sys-*` tokens.

## Architecture Overview

Skydiver is a **client-side-only** web game. There is no backend. All game logic runs in the
browser.

Key patterns:
- Signal-based state (Angular native signals, no NgRx)
- The game simulation is a **pure, framework-agnostic engine** (no Angular/DOM/rAF inside it)
- The only "I/O" is `localStorage` (settings & high scores) and the statically bundled i18n JSON
- A fixed-timestep `requestAnimationFrame` loop drives the simulation; rendering goes to a `<canvas>`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture and
[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) for the UI kit.

## Folder Structure

```
src/app/
├── app.ts / app.config.ts / app.routes.ts   # Shell, providers, routes
├── transloco.loader.ts                        # Static (bundled) i18n loader
├── features/                                  # Routed screens (lazy-loaded)
│   ├── title/                                  #   menu
│   ├── game/                                   #   game screen
│   │   └── engine/                              #     pure engine: types, config, physics,
│   │                                            #     camera, ground(-texture) + loop, input,
│   │                                            #     sprites, raster, font, renderer (Mode 7),
│   │                                            #     baked-sprites (generated), events,
│   │                                            #     autopilot, sound-cues, bindings, gamepad
│   ├── circuit/                                 #   the Grand Tour (event select)
│   ├── gazette/                                 #   the Sky Gazette: 1920s paper, read
│   │                                            #     issue by issue (data + issue + blocks;
│   │                                            #     text in the lazy `gazette` i18n scope,
│   │                                            #     plates baked by tools/gazette-plates.mjs)
│   ├── settings/
│   └── records/
├── ui/                                        # Pixel-art UI kit + index.ts barrel
└── shared/                                    # Signal stores (settings, records, progress),
                                               # transition & motion services, audio/ (Web
                                               # Audio synth), controls/ (key labels, gamepad nav)

src/assets/i18n/en.json                        # Translations (imported, not fetched)
src/assets/i18n/gazette/*.json                 # The Gazette's text (lazy Transloco scope)
src/styles/                                    # Global SCSS: tokens, mixins, reset, type
```

When adding a routed screen, create `src/app/features/<feature>/`. Reusable presentational
components go in `src/app/ui/`. Cross-feature state goes in a store under `src/app/shared/`.

## Critical Rules

### 1. Standalone components — no NgModules

```typescript
// CORRECT (standalone is implicit in Angular 22)
@Component({
  imports: [TranslocoPipe, PixelButton],
  ...
})

// FORBIDDEN
@NgModule({ ... })
```

### 2. `OnPush` on every component

Every component **must** declare `changeDetection: ChangeDetectionStrategy.OnPush`.
This is enforced by ESLint (`@angular-eslint/prefer-on-push-component-change-detection`).

### 3. Use `inject()` — no constructor injection

```typescript
// CORRECT
private readonly router = inject(Router);

// FORBIDDEN
constructor(private router: Router) {}
```

A `constructor` is fine for wiring effects / lifecycle (`afterNextRender`, `DestroyRef`), just
don't use it for DI.

### 4. Use Angular signals for state

```typescript
// CORRECT
protected readonly score = signal(0);
protected readonly isRunning = computed(() => this.phase() === 'running');
```

Use RxJS only for genuine time/event streams; prefer signals for component and store state.

### 5. All user-facing strings through Transloco

```html
<!-- CORRECT -->
<span>{{ 'game.score' | transloco }}</span>

<!-- FORBIDDEN -->
<span>Score</span>
```

```typescript
// In TS, when you need a value (e.g. building menu items):
private readonly transloco = inject(TranslocoService);
label = this.transloco.translate('menu.play');
```

Add every new key to **both** [src/assets/i18n/en.json](src/assets/i18n/en.json) and
[src/assets/i18n/fr.json](src/assets/i18n/fr.json) — the two files must stay key-for-key in sync.

Never write a key's name into a string ("Space", "←", "Esc"): players rebind keys and use
gamepads. Use the key tokens `[action]`, `[left]`, `[right]`, `[up]`, `[down]`, `[pause]`,
`[back]` and fill them — `| keys` in templates, `ControlsService.fill()` in code (the canvas HUD
gets them filled by the `Game` component). Interpolation is plain `{{param}}`: there is no ICU /
MessageFormat.

### 6. Use the pixel-art UI kit, not raw HTML controls

Compose screens from `src/app/ui` (`PixelButton`, `PixelPanel`, `PixelSlider`, `PixelDialog`,
`PixelMenuList`), imported via the `../../ui` barrel. Don't reach for `<button class="...">`
when a kit component exists. See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

### 7. Strict TypeScript — no `any`

`any` is banned by ESLint (`@typescript-eslint/no-explicit-any`). Type things properly.
Non-null assertions (`!`) are allowed only with a comment explaining why they're safe.

### 8. SCSS — use the design tokens, component-scoped styles

- Global theme/resets/tokens live in `src/styles/*` only.
- Each component's SCSS must not leak outside its host.
- Use the design tokens from [src/styles/_tokens.scss](src/styles/_tokens.scss)
  (`var(--biplane-red)`, `var(--brass)`, `var(--parchment)`, spacing `var(--sp-2)`, …) instead
  of hardcoded colours/sizes. Build raised/sunken surfaces with the mixins in
  [src/styles/_pixel-ui.scss](src/styles/_pixel-ui.scss) (`pixel-bevel`, `pixel-inset`).
- Keep `--radius: 0` — pixel art never rounds corners.

### 9. Keep the game engine pure

Code under `src/app/features/game/engine/` (`types`, `config`, `physics`, `ground`,
`ground-texture`, `camera`) must not import Angular, touch the DOM, or read the clock.
`integrate()` is a pure function returning a new state. This is what keeps the simulation
deterministic and unit-testable — see
[physics.spec.ts](src/app/features/game/engine/physics.spec.ts). Only `loop`, `input`,
`sprites`, `raster`, `font` and `renderer` may touch the DOM/canvas/`rAF`/`performance` — and
the renderer still draws a pure function of `(state, config)` (no wall clock).

The game canvas is 640×360 ([viewport.ts](src/app/features/game/viewport.ts), scaled by whole
numbers) and the voxel sprites are baked for that density (`DENSITY` in `tools/bake-voxels.mjs`):
change one, change the other. The sky, sun and hills are painted in code (`engine/horizon.ts`),
not sprites; HUD text on the canvas is Departure Mono only.

In-game sprites are voxel pre-renders: change a model in `tools/bake-voxels.mjs`, run
`node tools/bake-voxels.mjs`, and commit the PNGs together with the regenerated
`engine/baked-sprites.ts` (never edited by hand) — see
[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md#voxel-baked-sprites).

New scenery in `generateTerrain()` (`engine/ground.ts`) draws from the period-dressing stream
(`deco`), never from the main `rng`: an extra draw there would reshuffle every fixed-seed drop zone.

Game content (the Grand Tour's events, the daily jump, arcade runs) lives in `engine/events.ts`
as pure data. Changing an event's conditions means re-checking its medal thresholds:
[events.spec.ts](src/app/features/game/engine/events.spec.ts) flies every event with the
scripted pilots and must stay green.

Gameplay tuning lives in `engine/config.ts`. Any retune must keep
[balance.spec.ts](src/app/features/game/engine/balance.spec.ts) green: scripted pilots prove
that skill still pays (it exists because the old tuning let a do-nothing bot hit 100% bullseyes).

### 10. Motion and gamepads are first-class

Respect the player's Motion setting, not just the OS: CSS animations are cut by the global
`:root[data-motion='reduced']` rule (never add a component-level
`@media (prefers-reduced-motion)`), kit TS uses `reducedMotion()` from `src/app/ui/motion.ts`, app
code injects `MotionService`, the canvas reads `renderer.reducedMotion`. Every screen must be
usable with a gamepad: real focusable controls (the kit's), so `GamepadNavService` can move focus
spatially, press with A and back out with B.

### 11. Sound is derived, never sprinkled

What the game sounds like is decided by the pure
[`sound-cues.ts`](src/app/features/game/engine/sound-cues.ts) (`cuesBetween(prev, next)`,
`ambienceFor(state)`) — add a cue there (with a spec), not as an ad-hoc `play()` inside physics
or a component. Sounds are synthesized in [`synth.ts`](src/app/shared/audio/synth.ts) (no audio
files); call them through `AudioService`. UI kit components use the optional `UI_SOUNDS` token,
never `AudioService` directly, so the kit stays audio-agnostic.

## Component Template

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PixelButton, PixelPanel } from '../../ui';

@Component({
  selector: 'app-my-feature',
  imports: [TranslocoPipe, PixelButton, PixelPanel],
  templateUrl: './my-feature.html',
  styleUrl: './my-feature.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyFeature {
  private readonly someService = inject(SomeService);
  protected readonly value = signal(0);
}
```

Class names are unsuffixed (`Game`, `Settings`, `PixelButton`) — match the existing files.

## Testing Guidelines

- Test file `<name>.spec.ts` next to the source. Runner: Vitest — `npm run test:run`.
- Provide `provideRouter([])` when a component uses router directives.
- For components that use Transloco, provide a stub loader (see the pattern in
  [game.spec.ts](src/app/features/game/game.spec.ts)).
- Test the engine deterministically by seeding `createInitialState(cfg, () => 0.5)` and stepping
  with a fixed `dt` (see the `run()` helper in
  [physics.spec.ts](src/app/features/game/engine/physics.spec.ts)).
- Flush signal effects in tests with `TestBed.tick()`.

Full guidance: [docs/TESTING.md](docs/TESTING.md).

## Git Conventions

- Branches: `feat/<description>`, `fix/<description>`, `chore/<description>`
- Commits: imperative present tense, ≤ 72 chars (e.g. `add high-score table`)
- One logical change per commit
- Run `npm run lint` and `npm run test:run` before committing

## Performance Targets (enforced at build)

| Metric | Warning | Error |
|--------|---------|-------|
| Initial bundle | 500 kB | 1 MB |
| Any component style | 8 kB | 16 kB |

Routes are lazy-loaded to keep the initial bundle small.
