# Agent Guidelines — Skydiver

This document defines rules and patterns for AI agents (Claude Code, GitHub Copilot, etc.)
working on this codebase. Read it in full before making any change.

## Tech Stack

| Tool | Version | Notes |
|------|---------|-------|
| Angular | 21 | Zoneless, standalone components, no NgModules |
| `@angular/aria` | 21 | Headless accessible primitives (listbox, dialog semantics). **Not Angular Material.** |
| `@angular/cdk` | 21 | Low-level utilities |
| In-house pixel-art UI kit | — | `src/app/ui/pixel-*` — use these, not third-party components |
| @jsverse/transloco | ~8.3 | i18n — all user-facing strings go through Transloco |
| TypeScript | ~5.9 | Strict mode — all flags enabled |
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
│   │   └── engine/                              #     pure engine: types, config,
│   │                                            #     physics, loop, input, renderer
│   ├── settings/
│   └── records/
├── ui/                                        # Pixel-art UI kit + index.ts barrel
└── shared/                                    # Signal stores (settings, records)

src/assets/i18n/en.json                        # Translations (imported, not fetched)
src/styles/                                    # Global SCSS: tokens, mixins, reset, type
```

When adding a routed screen, create `src/app/features/<feature>/`. Reusable presentational
components go in `src/app/ui/`. Cross-feature state goes in a store under `src/app/shared/`.

## Critical Rules

### 1. Standalone components — no NgModules

```typescript
// CORRECT (standalone is implicit in Angular 21)
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

Add every new key to [src/assets/i18n/en.json](src/assets/i18n/en.json).

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

Code under `src/app/features/game/engine/` (`types`, `config`, `physics`) must not import
Angular, touch the DOM, or read the clock. `integrate()` is a pure function returning a new
state. This is what keeps the simulation deterministic and unit-testable — see
[physics.spec.ts](src/app/features/game/engine/physics.spec.ts). The `loop`, `input` and
`renderer` are the only engine files allowed DOM/`rAF`/`performance` access.

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
