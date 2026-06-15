# 🪂 Skydiver

A browser skydiving game set in the roaring-twenties era of barnstorming aerobatics —
free-fall, pop the canopy, ride the wind and stick the landing on the bullseye.
Built with Angular 21, a hand-rolled retro pixel-art UI, and Transloco.

## ✨ Features

- 🎮 **Plays in the browser** — no install, no backend, runs fully client-side
- 🕹️ **Custom skydiving engine** — deterministic physics (free fall, canopy, wind drift, flare/stall, scored landings)
- 🎨 **Retro pixel-art UI** — a small in-house component kit built on Angular Aria primitives (no Material)
- 🏆 **Local high scores & difficulty** — Rookie / Ace / Barnstormer, persisted in `localStorage`
- 🌐 **i18n-ready** via Transloco (English today, more languages drop-in)
- ♿ **Keyboard-first & accessible** — Angular Aria listbox/dialog semantics
- ⚡ **Zoneless** change detection, standalone components, `OnPush` everywhere

## 🎯 How to Play

| Action | Keys |
|--------|------|
| Steer left / right | `← →` or `A D` |
| Free fall: lean forward (**track** — dive faster, surge ahead) | `↑` or `W` |
| Free fall: arch back (**flatten** — fall slower, weaker steering) | `↓` or `S` |
| Canopy: steer up / down | `↑ ↓` or `W S` |
| Open the parachute | `Space` |
| Skip the plane intro / outro | `Space` or `Enter` |
| Flare (slow the canopy near the ground) | `Shift` |
| Pause | `Esc` |

The biplane crosses the drop zone and your diver bails out. Track or arch to manage the fall,
deploy in time (the canopy takes a moment to open!), fight the wind drift, and flare for a
gentle touchdown. Land inside the rings to score — the bullseye is worth the most. A crash
(never deploying, deploying too low, or stalling into the ground) costs a life. You get three.

## 🚀 Tech Stack

### Core

| Package | Version | Purpose |
|---------|---------|---------|
| [Angular](https://angular.dev) | 21 | Framework (zoneless, standalone, signals) |
| [TypeScript](https://www.typescriptlang.org) | ~5.9 | Language (strict) |
| [RxJS](https://rxjs.dev) | ~7.8 | Reactive primitives (used sparingly) |

### UI & Styling

| Package | Version | Purpose |
|---------|---------|---------|
| [Angular Aria](https://angular.dev) (`@angular/aria`) | 21 | Headless accessible primitives (listbox, etc.) |
| [Angular CDK](https://material.angular.dev/cdk) | 21 | Low-level utilities |
| In-house pixel-art UI kit | — | `src/app/ui/pixel-*` components + SCSS design tokens |
| SCSS | — | Stylesheet preprocessor |

> ⚠️ **No Angular Material.** The look is a bespoke 8/16-bit pixel theme: chunky bevelled
> borders drawn with zero-blur box-shadows (no image assets) and bitmap fonts. See
> [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

### Internationalisation

| Package | Version | Purpose |
|---------|---------|---------|
| [@jsverse/transloco](https://jsverse.github.io/transloco/) | ~8.3 | i18n runtime |
| [@jsverse/transloco-messageformat](https://jsverse.github.io/transloco/) | ~8.3 | ICU plural/select support |

### Testing & Quality

| Package | Version | Purpose |
|---------|---------|---------|
| [Vitest](https://vitest.dev) | ~4 | Unit tests (via `@angular/build:unit-test`) |
| [Playwright](https://playwright.dev) | ~1.60 | E2E tests |
| [ESLint](https://eslint.org) + [angular-eslint](https://github.com/angular-eslint/angular-eslint) | 10 / 21 | Linting |
| [Prettier](https://prettier.io) | ~3 | Formatting (100-col, single quotes) |

## 🏗️ Architecture Highlights

- **Zoneless change detection** — `provideZonelessChangeDetection()`, no Zone.js
- **Standalone components** — no NgModules anywhere
- **`OnPush` everywhere** — explicit on every component
- **`inject()`** — functional DI, no constructor injection
- **Signals for state** — `signal` / `computed` / `effect`; no NgRx
- **Pure game engine** — physics is framework-agnostic and unit-tested in isolation
- **Strict TypeScript** — all strict flags on; `any` is banned by lint

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.

## 📁 Project Structure

```
skydiver/
├── src/
│   ├── app/
│   │   ├── app.ts / app.html / app.scss   # Root shell (router outlet)
│   │   ├── app.config.ts                   # Application providers
│   │   ├── app.routes.ts                   # Lazy routes
│   │   ├── transloco.loader.ts             # Static (bundled) translation loader
│   │   ├── features/                       # Routed screens
│   │   │   ├── title/                       #   main menu
│   │   │   ├── game/                         #   the game screen + engine
│   │   │   │   └── engine/                    #     types, config, physics,
│   │   │   │                                  #     loop, input, renderer
│   │   │   ├── settings/                     #   volume / difficulty / language
│   │   │   └── records/                      #   high-score table
│   │   ├── ui/                              # Pixel-art UI kit (pixel-button,
│   │   │   │                                #   -panel, -slider, -dialog, -menu-list)
│   │   │   └── index.ts                      #   barrel export
│   │   └── shared/                          # Signal stores
│   │       ├── settings.store.ts
│   │       └── records.store.ts
│   ├── styles/                             # Global SCSS
│   │   ├── _tokens.scss                      #   design tokens (palette, spacing, type)
│   │   ├── _pixel-ui.scss                    #   bevel mixins
│   │   ├── _typography.scss
│   │   └── _reset.scss
│   ├── styles.scss                         # Global entry
│   └── assets/i18n/en.json                 # Translations (statically imported)
├── public/                                 # Static assets (fonts, favicon)
├── e2e/                                    # Playwright E2E tests
├── docs/                                   # Documentation (see below)
├── .github/workflows/                      # CI
├── angular.json · playwright.config.ts · eslint.config.js
└── package.json
```

## 🛠️ Getting Started

### Prerequisites

- Node.js **22+**
- npm **10+**

### Installation

```bash
npm install
```

### Development

```bash
npm start          # http://localhost:4200
```

### Build

```bash
npm run build      # production build → dist/skydiver/
```

### Tests

```bash
npm test           # unit tests (watch)
npm run test:run   # unit tests (single run)
npm run test:coverage  # unit tests + coverage report
npm run e2e        # Playwright E2E (boots the dev server automatically)
npm run e2e:ui     # Playwright interactive UI
```

### Code Quality

```bash
npm run lint           # ESLint
npm run format         # Prettier (write)
npm run format:check   # Prettier (verify, used in CI)
```

## 🌍 Internationalisation

User-facing strings live in `src/assets/i18n/` and are **bundled at build time** (imported
statically by [`TranslocoStaticLoader`](src/app/transloco.loader.ts) — there is no HTTP call).
The app ships **English** (`en`) and **French** (`fr`), selectable in **Settings** and persisted
to `localStorage`. The root [`App`](src/app/app.ts) drives Transloco's active language from the
saved choice on startup.

To add a language:

1. Add `src/assets/i18n/<lang>.json` (copy `en.json`, translate every key)
2. Import it and add it to the map in [transloco.loader.ts](src/app/transloco.loader.ts)
3. Add the code to the `Language` union in [settings.store.ts](src/app/shared/settings.store.ts)
   and to `availableLangs` in [app.config.ts](src/app/app.config.ts)
4. Add an entry (with its autonym label) to `languages` in
   [settings.ts](src/app/features/settings/settings.ts) so it appears in the picker

## 🤖 AI Development

See [AGENTS.md](AGENTS.md) for the rules and patterns AI agents (Claude Code, Copilot, …)
must follow on this codebase.

## 📚 Documentation

- [Architecture](docs/ARCHITECTURE.md) — design decisions, the game engine, data flow
- [Design System](docs/DESIGN_SYSTEM.md) — the pixel-art tokens, mixins and UI kit
- [Setup](docs/SETUP.md) — prerequisites, install, scripts
- [Testing](docs/TESTING.md) — unit (Vitest) and E2E (Playwright) patterns
- [Contributing](docs/CONTRIBUTING.md) — branch/commit conventions, PR checklist
- [Deployment](docs/DEPLOYMENT.md) — building and hosting the static SPA
