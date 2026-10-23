# Architecture — Skydiver

## Overview

Skydiver is a **client-side-only** web game. There is no backend server. All game state,
logic, and rendering happen entirely in the browser.

```
Browser
  └── Angular 22 SPA (zoneless, standalone, signals)
        ├── App shell (router outlet, screen-wipe overlay, global pixel-art theme, i18n)
        ├── Feature screens (title · circuit · game · records · gazette · settings)
        ├── Game engine (pure simulation + loop + input + canvas renderer)
        └── Audio (Web Audio synth: chiptune + effects, all generated — no sample files)
```

## Key Decisions

### No backend

The game runs fully offline after the initial page load. There is intentionally no API, no
authentication, and no server-side state.

Consequences:
- No `HttpClient`. Even translations are **imported at build time**, not fetched.
- Settings and high scores are stored in `localStorage`.
- No service worker / PWA today — it's a plain static SPA. (Deliberate current scope, not a TODO.)

### Angular 22 — modern patterns only

- **Zoneless** (`provideZonelessChangeDetection()`) — no Zone.js in the bundle
- **Standalone components** — no NgModules
- **`OnPush` everywhere** — components update only on signal/input change
- **`inject()`** — functional DI throughout

### State management — Angular signals

State is held in `signal` / `computed` / `effect`. No external state library.

Three root stores under `src/app/shared/`:

| Store | State | Persistence |
|-------|-------|-------------|
| [`SettingsStore`](../src/app/shared/settings.store.ts) | `musicVolume`, `sfxVolume`, `language`, `difficulty`, `motion`, `keys` (bindings) | `localStorage` key `skydiver.settings` via an `effect` |
| [`RecordsStore`](../src/app/shared/records.store.ts) | arcade boards, one top 10 per difficulty | `localStorage` key `skydiver.records.v2` via an `effect` |
| [`ProgressStore`](../src/app/shared/progress.store.ts) | circuit bests + medals (and what's unlocked), daily-jump bests | `localStorage` key `skydiver.progress` via an `effect` |

All **hydrate** from `localStorage` in their constructor (tolerating missing/corrupt payloads)
and **persist** via an `effect` that re-serialises on any change.

### Routing

Angular Router with lazy-loaded standalone components and `PreloadAllModules`:

```typescript
// app.routes.ts
{ path: '',         loadComponent: () => import('./features/title/title').then(m => m.Title) }
{ path: 'game',     loadComponent: () => import('./features/game/game').then(m => m.Game) }       // ?mode=circuit&event=… | daily | arcade
{ path: 'circuit',  loadComponent: () => import('./features/circuit/circuit').then(m => m.Circuit) }
{ path: 'settings', loadComponent: () => import('./features/settings/settings').then(m => m.Settings) }
{ path: 'records',  loadComponent: () => import('./features/records/records').then(m => m.Records) }
{ path: 'gazette',  loadComponent: () => import('./features/gazette/gazette').then(m => m.Gazette) } // ?issue=<id> opens an issue
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
- Reduced motion (see [Motion](#motion--reduced-is-a-setting-not-just-a-media-query)) turns the
  wipe into an instant cut, and a global rule in `styles.scss` collapses every other animation to
  a static end state.
- After each navigation, focus moves to the `#app-shell` element for keyboard/screen-reader users.

### Audio — a synthesizer, not a sound bank

Every sound is **generated live with the Web Audio API** — there are no audio files to load.
Three layers, from pure to impure:

| Layer | File | Role |
|-------|------|------|
| Cues (pure) | [`engine/sound-cues.ts`](../src/app/features/game/engine/sound-cues.ts) | `cuesBetween(prev, next, cfg)` → the one-shots a step triggered (green light, jump, pull, canopy, flare, stall, hoop pass/miss, hard-deck beeps, landing quality, bullseye, crowd); `ambienceFor(state, cfg)` → continuous levels (wind rush & brightness, biplane engine, music duck, the crowd's murmur as you come down over the field) |
| Score (pure) | [`shared/audio/music.ts`](../src/app/shared/audio/music.ts) | the two chiptune loops (menu rag, flight theme) as compact text scores: one token per sixteenth (`E5` note, `.` hold, `-` rest; drums `k s h x`) |
| Synth (Web Audio) | [`shared/audio/synth.ts`](../src/app/shared/audio/synth.ts) | `Synth` — music and SFX buses, pulse waves (cached `PeriodicWave` per duty), filtered noise, a lookahead step sequencer (25 ms tick, 120 ms ahead, swing), one recipe per `SoundName` |
| Service | [`shared/audio/audio.service.ts`](../src/app/shared/audio/audio.service.ts) | `AudioService` (root) — creates the `AudioContext` on the **first pointer/key gesture** (autoplay policy), applies the two volume settings (squared curve), exposes `play()`, `music()`, `setAmbience()` |

Who calls it:

- [`App`](../src/app/app.ts) picks the track on every `NavigationEnd`: `flight` on `/game`, `menu`
  elsewhere.
- [`Game`](../src/app/features/game/game.ts) plays `cuesBetween()` after each `integrate()`
  (+ a splash when the touchdown is in water), pushes `ambienceFor()` with the HUD (~10 Hz),
  silences the air during the briefing, the pause and the result, and plays the result's tally →
  verdict jingle (medal / new best / fail) in time with the medal stamp.
- [`TransitionService`](../src/app/shared/transition.service.ts) plays the wipe's swoosh.
- The UI kit stays audio-agnostic: `PixelButton` and `PixelMenuList` inject the optional
  [`UI_SOUNDS`](../src/app/ui/ui-sounds.ts) token (`move()`, `select()`), which
  [`app.config.ts`](../src/app/app.config.ts) binds to `AudioService`. In specs nothing is
  provided, so the kit is silent.

Without Web Audio (jsdom, very old browsers) the service never creates a synth and every call is a
no-op.

### i18n — Transloco (statically bundled)

All user-facing strings live in `src/assets/i18n/*.json`. [`TranslocoStaticLoader`](../src/app/transloco.loader.ts)
**imports** the JSON at build time and returns it from a lookup map — there is no HTTP request.
Configured with default language `en` (also ships `fr`) and `reRenderOnLangChange: true`; plain
`{{param}}` interpolation only (no ICU — the MessageFormat transpiler was 72 kB of the initial
bundle for nothing). Strings that name a control use **key tokens** — `[action]`, `[left]`,
`[right]`, `[up]`, `[down]`, `[pause]`, `[back]` — filled with the player's keys or pad buttons
(see [Controls](#controls--keyboard-bindings-and-gamepads)). The active language is driven from the persisted
[`SettingsStore`](../src/app/shared/settings.store.ts) choice by the root
[`App`](../src/app/app.ts). Adding a language is documented in the
[README](../README.md#-internationalisation).

**The Gazette's text is a lazy scope.** Its ~90 kB per language would double the main
translations, so it lives in `src/assets/i18n/gazette/{en,fr}.json` and the `Gazette` screen
provides it with `provideTranslocoScope({ scope: 'gazette', loader: { en: () => import(…) } })`:
each language becomes its own lazy chunk, fetched when the screen opens; keys read
`'gazette.issues.<issue>.text.<id>.head' | transloco`. The *structure* — eight issues read in
order plus a supplement, each a run of typed blocks (prose, plates, pull quotes, asides,
folding "for the buffs" sidebars, legend-or-fact cards, documents, the drift and figures toys)
followed by its dates, a game tie-in and a quiz — is data in
[`gazette.data.ts`](../src/app/features/gazette/gazette.data.ts);
[`gazette.spec.ts`](../src/app/features/gazette/gazette.spec.ts) fails if a block lacks its
text, a text has no block, a date is told twice or out of order, or the two languages drift
apart. Paragraphs are blank-line separated in one string and split by the `paragraphs` pipe.
Reading position (last issue, issues read, best quiz scores) persists in
[`GazetteStore`](../src/app/shared/gazette.store.ts). Prose blocks carry the `appReading`
directive: focusable, the arrows (or a pad) scroll the page through the block, then hand focus
to the next block — so the paper reads top to bottom on a gamepad too.

### Controls — keyboard bindings and gamepads

Keys are bound by **physical position** (`KeyboardEvent.code`), so the default W/A/S/D cluster is
Z/Q/S/D on an AZERTY keyboard with no per-layout table; only the *labels* depend on the layout.

| Piece | File | Role |
|-------|------|------|
| Bindings (pure) | [`engine/bindings.ts`](../src/app/features/game/engine/bindings.ts) | `KeyBindings` (two keys per control: left, right, up, down, action), defaults, `bindKey()` (a key taken from another control **swaps**, so nothing goes keyless), `sanitizeBindings()` for stored data, `keyName()`. Escape, Tab and OS keys can't be bound |
| Pad (pure) | [`engine/gamepad.ts`](../src/app/features/game/engine/gamepad.ts) | `readPad()` — standard-layout snapshot → intent: stick (analog, deadzone 0.22) or d-pad to fly, A action, B back, Start pause |
| Input | [`engine/input.ts`](../src/app/features/game/engine/input.ts) | `InputController` — bound keys + pads polled on `read()` → `InputState`; held key beats the stick; A is edge-triggered like the action key; `device` = the one that moved last |
| Labels | [`shared/controls/controls.service.ts`](../src/app/shared/controls/controls.service.ts) | `ControlsService` — key names on the player's layout (Keyboard Map API where available, learned from real key presses, AZERTY first guess for fr-FR/fr-BE), the device in use, `fill()` for `[tokens]`; the impure [`keys`](../src/app/shared/controls/keys.pipe.ts) pipe does it in templates (`'brief.keys' \| transloco \| keys`) |
| Menus | [`shared/controls/gamepad-nav.service.ts`](../src/app/shared/controls/gamepad-nav.service.ts) | `GamepadNavService` — a pad drives the DOM like a keyboard: arrows to the focused element (listbox, initials, sliders), else **spatial focus** to the nearest control that way; A = Enter/click, B = Escape (closing the open dialog if nobody did), Start = select (pause on the game screen). While a jump is flown (`flying`) only Start is translated — the pad belongs to the `InputController` |

Remapping lives in Settings (click a key cap, press the new key — captured on `window` in the
capture phase, so Escape cancels instead of leaving the screen). The HUD, the briefing and the
pause card show the bound keys, or the pad's buttons as soon as the pad is used.

### Motion — reduced is a setting, not just a media query

`SettingsStore.motion` is `system` (default: the OS "reduce motion" switch), `reduced` or `full`.
[`MotionService`](../src/app/shared/motion.service.ts) resolves it to `reduced()` and publishes
`<html data-motion="reduced|full">`:

- global CSS keys its animation kill-switch on `[data-motion='reduced']`; the UI kit reads the
  attribute through [`ui/motion.ts`](../src/app/ui/motion.ts) (`CountUp` tallies instantly);
- `TransitionService` cuts instead of wiping; `WorldBackdrop` holds a still frame;
- the canvas renderer's `reducedMotion` drops the camera shake, speed lines and blinking prompts,
  and softens the cloud whiteout and the confetti.

### Styling — bespoke pixel-art design system

No Angular Material. The look is an in-house 8/16-bit pixel theme:

- **Tokens** in [`_tokens.scss`](../src/styles/_tokens.scss) — a limited retro palette
  (`--biplane-red`, `--brass`, `--parchment`, `--sky-bg`, …), a 4px spacing grid (`--sp-*`),
  a bitmap type scale, and `--radius: 0`. Exposed as CSS custom properties so components consume
  them without `@use`.
- **Surface mixins** in [`_pixel-ui.scss`](../src/styles/_pixel-ui.scss) — `pixel-bevel` /
  `pixel-inset` build raised/sunken borders from multi-layer **zero-blur** box-shadows, so edges
  stay crisp at any resolution with **no image assets**.
- **Fonts** — two true bitmap faces, self-hosted in `public/assets/fonts` (both OFL): Silkscreen
  (8px grid) for headings, labels and the HUD, Departure Mono (11px grid) for running text —
  always at whole multiples of their grid (16/24/32/48 and 22px) so every glyph pixel lands on a
  screen pixel.
- **The menus live in the game world** — the title, Grand Tour, Records and Settings render the
  [`WorldBackdrop`](../src/app/features/game/backdrop/world-backdrop.ts): the game's own Mode 7
  renderer (HUD off) and engine flown by the autopilot (`engine/demo.ts`). `attract` on the title
  plays whole jumps back to back across the venues, like an arcade cabinet's demo; `calm` circles
  a canopy over a drop zone behind the other screens, under a darker wash. With reduced motion
  it holds one still frame (and follows the setting live). Decorative UI art (logo, medals, paper,
  rivets) is **CSS crops** of the generated sheets via
  [`_sprites.scss`](../src/styles/_sprites.scss).

Full reference: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## The Game Engine

Everything under [`src/app/features/game/engine/`](../src/app/features/game/engine/) is plain
TypeScript with **no Angular dependency**, split by concern:

| File | Role | DOM/clock? |
|------|------|-----------|
| `types.ts` | `Phase`, `InputState`, `GameConfig`, `GameState`, `JumpResult`, `ScoreBreakdown` | pure |
| `config.ts` | `BASE_CONFIG` + `configForDifficulty()` tuning | pure |
| `physics.ts` | `createJump()`, `integrate()`, landing judge, `scoreJump()` | **pure** |
| `ground.ts` | `generateTerrain()` — seeded drop zone: fields, road, river, landmark, props, sky | **pure** |
| `ground-texture.ts` | `buildGroundTexture()` — the drop zone rasterised into a texel pyramid | **pure** |
| `camera.ts` | `cameraFor()` chase camera, `project()`, Mode 7 `floorRow()` | **pure** |
| `events.ts` | the Grand Tour's events, daily jump, arcade → `RunPlan`; medals | **pure** |
| `autopilot.ts` | scripted pilots (balance/medal specs, attract mode) | **pure** |
| `demo.ts` | `DemoFlight` — the menus' backdrop flight (attract / calm) | **pure** (rng) |
| `minimap.ts` | the briefing's top-down drop-zone map | **pure** (Raster) |
| `sound-cues.ts` | `cuesBetween()` / `ambienceFor()` — what a step sounds like | **pure** |
| `loop.ts` | `GameLoop` — fixed-timestep `requestAnimationFrame` driver | rAF + `performance.now` |
| `bindings.ts` | key bindings: defaults, `bindKey()` (swap), `sanitizeBindings()`, `keyName()` | **pure** |
| `gamepad.ts` | `readPad()` / `readPads()` — standard-layout pad → intent | **pure** |
| `input.ts` | `InputController` — bound keys + gamepads → `InputState` | DOM events, Gamepad API |
| `baked-sprites.ts` | `BAKED_SPECS` — layout of the voxel-baked sheets (**generated**) | pure |
| `sprites.ts` | `loadBaked()`, `bakedFrame()`, `drawBaked()` | Image API |
| `horizon.ts` | sky gradient, sunset glow, sun and ridges, painted into the world raster | pure (pixel buffers) |
| `raster.ts` | `Raster` — crisp pixel shapes over an `ImageData` | `ImageData` |
| `font.ts` | `PixelFont` — thresholded bitmap glyphs for the canvas HUD | canvas 2D |
| `renderer.ts` | `SkyDiverRenderer` — Mode 7 view + HUD | canvas 2D |

**A jump, phase by phase** (all engine state, deterministic, shortened by `?fast=1`):

| Phase | The player… | Skill tested |
|-------|-------------|--------------|
| `Plane` (jump run) | rides the biplane — or hangs under a **balloon** (`jumpShip: 'balloon'`) drifting downwind at the wind's speed, rising at first, no exit throw — and jumps on the **green light** | spotting: the ideal exit sits upwind of the target, the run line passes off to the side |
| `Freefall` (~30 s from 1500 m) | turns (←/→), tracks (↑) or arches (↓) through a slalom of **hoops**, one every ~4–5 s | positioning; the hoops lead toward the target |
| `Deploying` | pulled (Space): the canopy opens over ~1.2 s | **pull late**: the bonus peaks at the hard deck (150 m), nothing below it — and below ~65 m it won't open in time |
| `Canopy` (~20–40 s) | flies a nimble wing with forward airspeed: turns, brakes (↓), front risers (↑) | the wind really matters (into it you crawl, downwind you race); a held turn spirals down |
| **double drop** (`canopies: 2`) | under the first canopy, above 80 m, Space **cuts it away** (`canCutAway`): back to `Freefall`, then a second pull | the longer the re-fall before the second pull, the bigger the stunt bonus — and the less room left |
| touchdown | flares (Space) a few metres up | timing: too early stalls, too late slams in; stand-up needs low descent *and* ground speed |

Controls are unified: ←/→ always turn, ↑/↓ always drive/brake, Space/Enter is the one context
action (jump → pull → flare, and skip the outro). A jump scores **accuracy** (to the bullseye),
**hoops**, **pull altitude**, **landing quality** (stand-up / slide / tumble), **exit timing** and,
on a double drop, a **stunt** bonus (400 + 40 per second of re-fall, capped), times the difficulty
multiplier; a crash scores 0. A run is three jumps.

**Balance guard.** [balance.spec.ts](../src/app/features/game/engine/balance.spec.ts) plays whole
jumps with scripted pilots (naive, casual, skilled, reckless) through the real engine and
asserts that skill pays — e.g. a do-nothing pilot rarely hits the bullseye, a skilled one scores
well over twice as much, pulling far below the hard deck is fatal — and the **pacing** the
October 2026 playtest asked for: ~25 s+ of free fall, a hoop every ~4 s or more, 15 s+ under
canopy even for a pull at the deck, about a minute per jump. It exists because the v1 tuning let a
do-nothing bot hit 100% bullseyes; any retune must keep it green.

**Determinism.** `integrate(state, input, dt, cfg)` is a pure function that returns a *new*
state. Wind gusts are a function of elapsed time, and `createJump` takes an injectable `rng`
(draw order is a contract guarded by a fixed-seed spec — only ever append new draws), so a
fixed seed + input sequence reproduces exactly. Each jump re-rolls its wind (direction and a
0.5–1.3 weather multiplier), the run heading and side offset, the hoops and the terrain seed;
`generateTerrain` then rolls a biome, clustered groves and one landmark (lake, airstrip or
forest).

**Fixed timestep.** `GameLoop` accumulates real frame time and steps physics at a constant
`dt = 1/60`, rendering once per animation frame; huge gaps are clamped.

**Mode 7 renderer.** The view is a pseudo-3D chase camera over a perspective-mapped ground, like
16-bit Mode 7 games, rendered at an "HD pixel art" internal resolution — **640×360**, widened up
to 852×480 to fill odd windows ([`viewport.ts`](../src/app/features/game/viewport.ts)) — and
scaled up by a **whole number** with nearest-neighbour (×2 at 720p, ×3 at 1080p, ×4 at 1440p):
every pixel the same size, HUD included. (It was 384×216 until the October 2026 "grain" pass; the
camera keeps a constant field of view, so the framing didn't change — only the detail.)

- `camera.ts` orbits behind and above the diver along his heading. Pitch blends per phase: a
  shallow look over the plane's nose on the run, a steep look down the column in free fall (the
  hoops are below), a low chase behind the canopy that flattens toward the horizon near the
  ground.
- The ground is drawn row by row: each screen row hits the ground at one forward distance, then
  steps sideways per pixel (`floorRow`). Texels come from a **pyramid** built once per jump by
  `ground-texture.ts` (~0.3 s, behind the briefing card) — 0.25 m texels around the target,
  0.5 m over the canopy approach, 1 m over the drop zone, 4 m and 16 m out to the horizon —
  picked per row by pixel footprint (no shimmer far away). The countryside is an endless
  **patchwork** laid in a brick bond (rows shifted so hedges never form a grid), most cells split
  into two fields, the odd one a copse of sunlit crowns, hedgerow trees along the borders and a
  slow brightness swell so no two fields match. Close to the ground a fine world-space grain
  keeps texels from turning into flat blocks. The row loop samples its level inline (the hottest
  code in the game) with integer haze/grain maths.
- A distance haze (ordered-dithered) fades the ground into the horizon colour of the golden-hour
  sky. The sky, the sun and the hills are painted **procedurally at native resolution** by
  [`horizon.ts`](../src/app/features/game/engine/horizon.ts): a 7-stop gradient dithered across
  each whole band, a sunset glow around the sun's azimuth, a banded sun with a dithered corona,
  and two ridges (far and hazy, near with a tree line) rim-lit toward the sun.
- Layers, back to front: world raster (sky, sun and hills, ground with glinting water, the
  diver's shadow) → depth-sorted world sprites (props, balloons, clouds; far ones collapse to
  single pixels) → the air raster (hoops, sparks, speed lines) → plane and diver → touchdown
  effects (dust, splash, confetti) and the cloud whiteout → the HUD raster (brass altimeter,
  wind, jump light, edge arrows) → HUD text. Shapes are plotted pixel by
  pixel in `Raster`s (the altimeter's numerals in a built-in 3×5 digit face) and text uses
  `PixelFont`: each glyph is rasterised once at ×8 and read at its pixels' centres, which is
  immune to the browser's sub-pixel placement — canvas paths and `fillText` would anti-alias into
  soft fringes once scaled up. The HUD is all Departure Mono (11 px, 22 px for banners): its
  glyphs sit exactly on their grid, where Silkscreen's half-pixel diagonals broke M/N/W.
- HUD strings are translated by the `Game` component (Transloco) and handed to the renderer.
- Everything drawn is a pure function of `(state, config)` — animation frames, shakes and
  flashes derive from `elapsed` and the state timers, never `performance.now()`. Canvas colours
  mirror the SCSS tokens, so keep them in sync (the sprite generator shares the palette).

**The world.** `generateTerrain` lays out each drop zone from its seed: crop fields with
hedgerows, a road, sometimes a meandering river, one landmark (lake, airstrip with its hangar,
or forest), biome-weighted scenery in groves, two or three farmsteads (barn, house, hay bales),
often a village strung along the road with its windmill, and the drop-zone dressing at the ring
(marquee, grandstand, a cheering crowd, a windsock). Flat things are painted into the ground
texture — including long golden-hour **shadows** cast away from the low sun by every prop —
while standing things are **props** drawn as sprites. The sky holds a few hot-air balloons and a
cumulus layer in the free-fall band; both drift with the wind, and falling through a cloud
washes the view out.

**Sprites — voxel pre-renders.** Everything in the world is a sprite *baked from a voxel model*
by `tools/bake-voxels.mjs` (the 90s "pre-rendered" trick): the biplane at 16 headings, the
canopy rig at 5 banks (plus flare, stall and opening stages), the diver's free-fall poses, landing
and crash, and every prop at the yaw steps it needs, each at a few camera elevations. Sheets
live in `public/assets/sprites/baked/` and their layout (frame size, anchor, pixels-per-metre,
yaw/elevation steps) in the generated `baked-sprites.ts`; `bakedFrame()` picks the frame from
an object's heading relative to the camera and the camera's elevation, and `drawBaked()` scales
it by depth (pixels-per-metre ÷ the sheet's own). Sheets are baked at a density matched to the
640×360 canvas (`DENSITY` in the tool), so a sprite seen at its usual distance is drawn close to
1:1. The baked sheets and the HUD fonts are optional late-bound properties of the renderer: it
draws stand-ins until they load, so unit tests and first paint never depend on a fetch. See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md#voxel-baked-sprites)
for how to add or change a model.

### Game modes — the Grand Tour, the daily jump, arcade

[`engine/events.ts`](../src/app/features/game/engine/events.ts) holds the game's content as pure
data and turns a request into a **`RunPlan`** (a list of jumps, each a full `GameConfig` and a
seed):

| Mode | Route | Plan |
|------|-------|------|
| **Grand Tour** (circuit) | `/circuit` → `/game?mode=circuit&event=<id>` | one event: fixed conditions, a **fixed seed** (the same drop zone every attempt, so it can be learned), plain points, bronze/silver/gold thresholds. Ten events over five venues, then three **period acts** (`group: 'heritage'`, their own panel on the Grand Tour screen): the professor's balloon ascension, the double drop, and the grand act (both at once, over the beach). Any medal unlocks the next. The first one shows coaching tips. |
| **Daily jump** | `/game?mode=daily` | one jump derived from the local date (seed = hash of the day): everyone gets the same conditions with no backend; the day's best is kept |
| **Arcade** | `/game?mode=arcade` (or plain `/game`) | three random jumps at three venues, at the Settings difficulty (score multiplier); boards per difficulty |

Each **venue** reshapes the drop zone (`GameConfig.venue` → `generateTerrain`): the county fair
(farmland, villages, a Ferris wheel and a circus big top), the seaside (sea, beach, lighthouse and
bathing huts), the mountain lake (a lake beside the target, pines), the airfield (strip, hangars, a
canvas Bessonneau, parked Jennys, a water tower) and the Grand Meet (stands all round, balloons,
air-race pylons, a flight line of Jennys). Everywhere the crowd's Model Ts are parked past the
stands and villages get a church. This **period dressing draws from its own random stream**
(`mulberry32(seed ^ 0x51ed270b)`), appended after everything else: adding to it never moves the
older layout, so the fixed-seed events keep their drop zones. An
event can also make the **target move** (`targetSpeed`): a horse-drawn float drives down a road
through the drop zone and `targetAt(cfg, elapsed)` gives its position for scoring, the HUD and the
autopilot.

**Medal calibration.** Thresholds were set by flying every event with the scripted pilots of
[`engine/autopilot.ts`](../src/app/features/game/engine/autopilot.ts);
[events.spec.ts](../src/app/features/game/engine/events.spec.ts) keeps them honest (a do-nothing
pilot never earns better than bronze, a decent one medals almost everywhere, a skilled one gets at
least silver everywhere and gold on most). Retune an event → re-run it.

### The `Game` component — the Angular ↔ engine bridge

[`Game`](../src/app/features/game/game.ts) owns the engine lifecycle and the run's flow:

```
constructor → planFromQuery(route) → prepareJump(0): config + seeded createJump, stage 'briefing'
afterNextRender → boot(): fit canvas · create input (the player's bindings)/renderer/loop
                  (the world renders behind the card)
briefing → BriefingCard (goal, conditions, drop-zone map, medals) · Jump! → stage 'playing'
          → a silent-film title card holds the run for TITLE_CARD_S (venue over event; the
            renderer draws it from `titleCard`, its age; the action key cuts it; phase
            announced as 'title'; skipped under ?fast=1)
GameLoop.step(dt) → integrate state · on touchdown bank the score (ProgressStore / RecordsStore),
                    freeze a beat (hit-stop), then stage 'result' after the outro
result → takePhoto(): one HUD-less frame → gazettePhoto() (sepia ordered dither) · ResultCard as
         a Sky Gazette front page: headlineFor(result, splashed), byline, press photo, a short
         report, the count-up tally, medal stamp / day's best / run total + initials · actions:
         retry · next event · next jump · play again · back to the Grand Tour / menu
window:resize → viewportFor() → canvas size (whole-number scale)
effects → GamepadNavService.flying while playing & not paused · HUD prompts re-filled when the
          keys / device / language change · renderer.reducedMotion from MotionService
DestroyRef.onDestroy → stop loop · dispose input · silence the ambience · hand the pad back
```

The HUD is drawn in the canvas; the template only holds the cards (briefing, result, pause with
the controls — all `PixelDialog`s, so focus is trapped and Escape backs out) and a visually hidden
`aria-live` phase announcement. The briefing's map is painted by the pure
[`engine/minimap.ts`](../src/app/features/game/engine/minimap.ts) from the jump's own ground
texture. The raw `GameState` is a plain field, never read in the template. `?fast=1` (e2e) shrinks
every jump and never writes progress. Sound follows the same bridge: the component diffs
consecutive states through the pure `sound-cues.ts` and hands the result to `AudioService` (see
[Audio](#audio--a-synthesizer-not-a-sound-bank)).

The renderer **skips a frame identical to the last** (same state object, config, size, assets,
labels and flags): the briefing, the pause, the result and the touchdown freeze cost nothing after
their first frame, and so does the menus' still backdrop.

## Data Flow

```
Keyboard (bindings) ─┐
Gamepad (polled) ────┴─► InputController.read() ──► InputState
                                                        │
                                  GameLoop (60Hz fixed) ┤
                                                        ▼
                                            physics.integrate() ──► new GameState
                                                        │                │
                                           on touchdown │                ├─ every frame ─► SkyDiverRenderer → <canvas>
                                                        ▼                │
                                         score + result dialog           └─ cuesBetween / ambienceFor ─► AudioService
                                                        │
                                  end of run: RecordsStore.add() → localStorage
```

## Build

Angular CLI 22 with `@angular/build:application` (esbuild). Production builds are tree-shaken and
output-hashed to `dist/skydiver/`.

Performance budgets (enforced at build time):
- Initial bundle: 500 kB warning / 1 MB error (≈346 kB / 94 kB transferred today; Angular core +
  router are most of it)
- Any component stylesheet: 8 kB warning / 16 kB error

Runtime: on the heaviest event (Grand Prix) at 1920×1080 (640×360 internal) with the CPU
throttled ×4 in Chrome, every phase holds 60 fps (free fall 120) — about 2–3 ms a frame
unthrottled. The Mode 7 ground pass (`paintSkyAndGround`) is most of it; the world texture is
built once per jump (~0.3 s), behind the briefing card.

## Testing

- **Unit**: Vitest via `@angular/build:unit-test` — `npm run test:run` (coverage:
  `npm run test:coverage`). The pure engine and the stores are the most heavily covered.
- **E2E**: Playwright against `http://localhost:4200` — `npm run e2e`. The `Game` component's
  canvas/`rAF` path (not exercisable under jsdom) is covered here; `?fast=1` shrinks a jump so a
  full landing resolves in seconds. `navigation.spec.ts` covers the screen-wipe flow between the
  menu screens.

Details: [TESTING.md](./TESTING.md).
