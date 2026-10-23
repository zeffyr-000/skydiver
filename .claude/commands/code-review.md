---
description: Review code changes against Skydiver project conventions
---

# Code Review

Review code changes against Skydiver project conventions.

`AGENTS.md` is the single source of truth; this checklist distils it. For the areas the diff
touches, the detailed rules live in the docs — they hold rules not fully repeated here:
`docs/ARCHITECTURE.md` (engine, game loop, stores, i18n, controls/gamepad, motion, audio),
`docs/DESIGN_SYSTEM.md` (tokens, mixins, UI kit, voxel sprites, Gazette plates) and
`docs/TESTING.md` (spec patterns, calibration specs, e2e).

## Checklist

### Components

- [ ] Standalone — no `@NgModule`, no explicit `standalone: true`
- [ ] `changeDetection: ChangeDetectionStrategy.OnPush` declared (required here, ESLint-enforced)
- [ ] `inject()` — no constructor injection (a constructor only wires effects / lifecycle)
- [ ] `readonly` on injected dependencies and signals
- [ ] `styleUrl` (singular); class names unsuffixed (`Game`, not `GameComponent`)
- [ ] No `ChangeDetectorRef` / `markForCheck()` — zoneless + signals never need it
- [ ] Listeners, timers, `requestAnimationFrame` loops and audio nodes released via `DestroyRef`

### State

- [ ] Signals (`signal` / `computed` / `effect`) for state; RxJS only for genuine time/event streams
- [ ] Cross-feature state in a store under `src/app/shared/`, not in a component
- [ ] Store hydration tolerates missing / corrupt / older `localStorage` payloads — a shape change
      must not wipe a player's settings, records or progress

### Game engine (`src/app/features/game/engine/`)

- [ ] `types`, `config`, `physics`, `ground`, `ground-texture`, `camera` import no Angular, touch
      no DOM, read no clock (`Date.now`, `performance.now`)
- [ ] `integrate()` stays pure: returns a new state, never mutates its input
- [ ] Randomness is injected (`rng`) — no bare `Math.random()` call inside simulation code
- [ ] The renderer draws a pure function of `(state, config)` — no wall clock
- [ ] New scenery in `generateTerrain()` draws from `deco`, never from the main `rng` (an extra
      draw reshuffles every fixed-seed drop zone)
- [ ] Sounds decided in `sound-cues.ts` (`cuesBetween` / `ambienceFor`, with a spec) — no ad-hoc
      `play()` in physics or a component
- [ ] Retunes in `config.ts` / `events.ts` keep `balance.spec.ts` / `events.spec.ts` meaningful —
      never loosen a threshold or drop a scripted pilot to make a change pass
- [ ] Canvas size (`viewport.ts`, 640×360) and voxel `DENSITY` (`tools/bake-voxels.mjs`) change
      together
- [ ] Generated files change only with their generator: a model edit in `tools/*.mjs` ships the
      regenerated `baked-sprites.ts` / `gazette-plates.ts` and PNGs; those are never hand-edited
- [ ] Per-frame paths (`integrate`, renderer, raster) don't allocate per pixel or per frame without
      need

### Templates

- [ ] Modern control flow: `@if`, `@for`, `@switch` — not `*ngIf`, `*ngFor`
- [ ] Built from the pixel UI kit (`PixelButton`, `PixelPanel`, `PixelSlider`, `PixelDialog`,
      `PixelMenuList`) via the `../../ui` barrel — no raw `<button>` / `<input type="range">` where
      a kit component exists
- [ ] Every control is a real focusable element so `GamepadNavService` can reach it (A presses,
      B backs out)
- [ ] No `innerHTML` / `bypassSecurityTrust*` on untrusted content

### i18n

- [ ] All user-facing text through Transloco (`| transloco`, `TranslocoService`), canvas HUD
      included
- [ ] Every new key in **both** `en.json` and `fr.json` (and `gazette/en.json` + `gazette/fr.json`
      for the Gazette scope) — key-for-key in sync
- [ ] No key names in strings ("Space", "Esc", "←") — key tokens `[action]`, `[left]`, `[right]`,
      `[up]`, `[down]`, `[pause]`, `[back]`, filled by `| keys` / `ControlsService.fill()`
- [ ] Plain `{{param}}` interpolation — no ICU / MessageFormat

### Styles

- [ ] Design tokens from `src/styles/_tokens.scss` (`var(--brass)`, `var(--sp-2)`, …) — no
      hard-coded colours or sizes
- [ ] Raised / sunken surfaces via the `pixel-bevel` / `pixel-inset` mixins
- [ ] No rounded corners (`--radius: 0`); no `@angular/material`, no `--mat-sys-*`
- [ ] Component styles stay inside the host; globals only in `src/styles/*`
- [ ] No component-level `@media (prefers-reduced-motion)` — the global
      `:root[data-motion='reduced']` rule cuts CSS animation; TS uses `reducedMotion()` (kit),
      `MotionService` (app) or `renderer.reducedMotion` (canvas)

### Audio

- [ ] Sounds synthesized in `synth.ts` and played through `AudioService` — no audio files
- [ ] UI kit components use the optional `UI_SOUNDS` token, never `AudioService`

### Code Quality

- [ ] No `any`; a non-null `!` only with a comment explaining why it is safe
- [ ] No dead code (unused imports, variables, methods)
- [ ] English-only comments
- [ ] Routed screens lazy-loaded (initial bundle: 500 kB warning / 1 MB error)

### Testing

- [ ] Vitest spec next to the source (`<name>.spec.ts`)
- [ ] Engine tests deterministic: `createInitialState(cfg, () => 0.5)` and a fixed `dt`
- [ ] Transloco stub loader / `provideRouter([])` where needed; effects flushed with
      `TestBed.tick()`
- [ ] No `.only` / `.skip` left behind
