# 🪂 Skydiver

A browser skydiving game set in the roaring-twenties era of barnstorming aerobatics —
free-fall, pop the canopy, ride the wind and stick the landing on the bullseye.
Built with Angular 22, a hand-rolled retro pixel-art UI, and Transloco.

## ✨ Features

- 🎮 **Plays in the browser** — no install, no backend, runs fully client-side
- 🕹️ **Custom skydiving engine** — deterministic physics (spotting, free-fall hoops, late pulls, a flyable canopy in real wind, timed flares) with a Mode 7 chase camera
- 🏅 **The Grand Tour** — ten events over five venues (county fair, seaside, mountain lake, airfield, Grand Air Meet) with bronze/silver/gold medals, a coached first event and a moving target to land on
- 📅 **Daily jump** — the same conditions for everyone each day, no backend; plus a three-jump **Arcade** with boards per difficulty
- 🕹️ **Attract mode** — the title screen plays live demo jumps flown by the autopilot, and every menu sits over the living game world
- 🌄 **HD pixel art, 16-bit "pre-rendered" look** — a 640×360 canvas scaled by whole numbers; every plane, canopy, diver, barn and balloon is baked from a voxel model at the angles the camera needs, over a golden-hour Mode 7 countryside of hedged fields, copses and a procedurally painted sunset
- 🔊 **Synthesized sound** — a ragtime menu theme, an airy flight theme, wind that roars with your speed, the biplane's engine and every effect generated live with the Web Audio API (no audio files); separate Music / Effects volumes
- 🎨 **Retro pixel-art UI** — a small in-house component kit built on Angular Aria primitives (no Material)
- 🏆 **Local medals, bests & boards** — persisted in `localStorage`; Rookie / Ace / Barnstormer arcade difficulty
- 🌐 **English & French** via Transloco (more languages drop-in)
- 🎮 **Keyboard or gamepad** — every key can be rebound (by physical position, so WASD is ZQSD on AZERTY and the prompts say so); a standard gamepad flies the jumps and drives every menu
- ♿ **Accessible** — Angular Aria listbox/dialog semantics, keyboard-first, and a **Reduced motion** setting (Auto follows the OS) that calms both the menus and the canvas
- ⚡ **Zoneless** change detection, standalone components, `OnPush` everywhere

## 🎯 How to Play

| Action | Keys (default) | Gamepad |
|--------|----------------|---------|
| Turn left / right | `← →` or `A D` (`Q D` on AZERTY) | stick / d-pad ← → |
| Free fall: track (dive faster, glide forward) / arch (slow down) | `↑` / `↓` or `W S` (`Z S`) | stick / d-pad ↑ ↓ |
| Canopy: front risers (faster, steeper) / brakes (slower, softer) | `↑` / `↓` or `W S` (`Z S`) | stick / d-pad ↑ ↓ |
| Jump · open the chute · flare | `Space` or `Enter` | A |
| Pause (shows the controls) | `Esc` | Start |

Every key can be changed in **Settings → Controls** (two per control; Escape stays pause/back).
A gamepad in the standard layout (Xbox, PlayStation, Switch Pro…) also drives the menus: d-pad or
stick to move, A to choose, B to go back. Browsers only start sound after a key press or a click,
so a pad-only player hears nothing until they touch the keyboard or mouse once.

Ride the biplane along its jump run and leap on the **green light** — the ideal exit is upwind of
the target. In free fall, turn and track through the **hoops**, then pull as late as you dare:
the pull bonus peaks at the hard deck (red on the altimeter) and a pull below it won't open in
time. Under canopy the wind really counts — fly an approach, land into the wind, and **flare**
a few metres up for a stand-up landing. Each jump scores accuracy, hoops, pull altitude, landing
quality and exit timing. Each jump opens on a briefing with a map of the drop zone (the run line,
the green-light window, the hoops, the wind).

Modes: the **Grand Tour** (ten events; any medal opens the next), the **Daily Jump** (one jump,
the same for everyone today) and **Arcade** (three jumps at three venues, at the Settings
difficulty).

## 🚀 Tech Stack

### Core

| Package | Version | Purpose |
|---------|---------|---------|
| [Angular](https://angular.dev) | 22 | Framework (zoneless, standalone, signals) |
| [TypeScript](https://www.typescriptlang.org) | ~6.0 | Language (strict) |
| [RxJS](https://rxjs.dev) | ~7.8 | Reactive primitives (used sparingly) |

### UI & Styling

| Package | Version | Purpose |
|---------|---------|---------|
| [Angular Aria](https://angular.dev) (`@angular/aria`) | 22 | Headless accessible primitives (listbox, etc.) |
| [Angular CDK](https://material.angular.dev/cdk) | 22 | Low-level utilities |
| In-house pixel-art UI kit | — | `src/app/ui/pixel-*` components + SCSS design tokens |
| SCSS | — | Stylesheet preprocessor |

> ⚠️ **No Angular Material.** The look is a bespoke 8/16-bit pixel theme: chunky bevelled
> borders drawn with zero-blur box-shadows (no image assets) and bitmap fonts. See
> [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

### Internationalisation

| Package | Version | Purpose |
|---------|---------|---------|
| [@jsverse/transloco](https://jsverse.github.io/transloco/) | ~8.3 | i18n runtime |

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
- **Sound as data** — the pure `sound-cues.ts` diffs consecutive game states into cues, a small Web Audio synth plays them (and the chiptune scores in `music.ts`)
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
│   │   │   ├── circuit/                     #   the Grand Tour's event list
│   │   │   ├── game/                         #   the game screen + engine
│   │   │   │   └── engine/                    #     types, config, physics, camera,
│   │   │   │                                  #     ground(-texture), loop, input,
│   │   │   │                                  #     raster, font, renderer (Mode 7),
│   │   │   │                                  #     events, autopilot, sound-cues,
│   │   │   │                                  #     bindings, gamepad
│   │   │   ├── settings/                     #   difficulty, language, motion, volumes, key remapping
│   │   │   └── records/                      #   medals, daily bests, arcade boards
│   │   ├── ui/                              # Pixel-art UI kit (pixel-button,
│   │   │   │                                #   -panel, -slider, -dialog, -menu-list)
│   │   │   └── index.ts                      #   barrel export
│   │   └── shared/                          # Signal stores + services
│   │       ├── settings.store.ts
│   │       ├── records.store.ts
│   │       ├── progress.store.ts
│   │       ├── transition.service.ts
│   │       ├── motion.service.ts               #   Reduced motion → <html data-motion>
│   │       ├── controls/                       #   key labels, [token] filling, gamepad menu nav
│   │       └── audio/                         #   Web Audio synth, chiptune scores, AudioService
│   ├── styles/                             # Global SCSS
│   │   ├── _tokens.scss                      #   design tokens (palette, spacing, type)
│   │   ├── _pixel-ui.scss                    #   bevel mixins
│   │   ├── _typography.scss
│   │   └── _reset.scss
│   ├── styles.scss                         # Global entry
│   └── assets/i18n/en.json                 # Translations (statically imported)
├── public/                                 # Static assets (fonts, favicon)
├── tools/                                  # Asset generators (pure Node):
│   ├── bake-voxels.mjs                       #   voxel models → in-game sprites
│   └── generate-sprites.mjs                  #   menu pixel art (logo, medals, paper, rivets)
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
   (keep the `[action]`, `[left]`… key tokens as they are — they're replaced by the player's keys)
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
