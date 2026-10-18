# Testing — Skydiver

Two layers: **Vitest** unit tests (fast, run under the Angular build runner) and **Playwright**
E2E tests (real browser).

## Unit tests (Vitest)

- Runner: `@angular/build:unit-test` with the `vitest` runner (configured in `angular.json`).
- Test files live next to the source as `<name>.spec.ts`.
- Globals (`describe`, `it`, `expect`, `vi`) are available via `vitest/globals`
  (`tsconfig.spec.json`); engine specs import them explicitly for clarity — either is fine.

```bash
npm test            # watch
npm run test:run    # single run (CI)
npm run test:coverage
```

### Where coverage focuses

Coverage is reported (v8) but **not gated** — we don't fail the build on a threshold. We aim for
~80% overall, concentrated where it matters most:

| Area | Target | Why |
|------|--------|-----|
| `engine/` (physics, input, loop, renderer) | ~95%+ | pure, deterministic, the heart of the game |
| `shared/` stores | ~100% | persistence/hydration logic is easy to break |
| `shared/audio/` | the pure parts | `music.ts` (scores parse, loops stay in whole bars) and `AudioService` (no-op without Web Audio, gesture unlock); `synth.ts` needs a real `AudioContext` — checked in the browser, not in jsdom |
| `ui/` kit | solid | small, reusable, worth locking down |
| `features/game/game.ts` | lower (≈35%) | the canvas/`rAF` orchestration can't run under jsdom — **covered by E2E instead** |

### Patterns

**Components that use the router:**

```typescript
TestBed.configureTestingModule({ imports: [MyCmp], providers: [provideRouter([])] });
```

**Components that use Transloco** — provide a stub loader (see
[game.spec.ts](../src/app/features/game/game.spec.ts)):

```typescript
class StubLoader implements TranslocoLoader {
  getTranslation() { return of<Translation>({}); }
}
// providers: [provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' }, loader: StubLoader })]
```

**Signal stores** — instantiate via `TestBed.inject(...)`, clear `localStorage` in `beforeEach`,
and flush the persistence `effect` with `TestBed.tick()`:

```typescript
beforeEach(() => localStorage.clear());
const store = TestBed.inject(SettingsStore);
store.volume.set(42);
TestBed.tick();                  // run the effect
expect(JSON.parse(localStorage.getItem('skydiver.settings')!)).toMatchObject({ volume: 42 });
```

**The pure engine** — seed the RNG and step with a fixed `dt`; see the `run()` helper and the
determinism test in [physics.spec.ts](../src/app/features/game/engine/physics.spec.ts):

```typescript
const cfg = { ...BASE_CONFIG, windBase: 0, windGust: 0, ringCount: 0 };
let s = createJump(cfg, () => 0.5);              // deterministic seed, aboard the plane
s = integrate(s, { turn: 0, drive: 0, action: true }, 1 / 60, cfg); // jump
for (let i = 0; i < 300; i++) s = integrate(s, NEUTRAL, 1 / 60, cfg);
```

**Balance** — [balance.spec.ts](../src/app/features/game/engine/balance.spec.ts) plays whole jumps
with scripted pilots (naive / casual / skilled / reckless) and asserts that skill pays. Run it
after any change to `engine/config.ts` or the physics; if it fails, the tuning made the game
trivial (or unfair) again.

**The Mode 7 renderer** — specs draw into a stub 2D context with a small ground-texture pyramid
(`renderer.textureLevels`) and inspect the world `ImageData` handed to `putImageData`.

**Sound** — test *what* plays, not the waveform: [sound-cues.spec.ts](../src/app/features/game/engine/sound-cues.spec.ts)
drives states through `integrate()` and asserts the cue list (`cuesBetween`) and the ambience
levels (`ambienceFor`). Kit components inject `UI_SOUNDS` optionally, so their specs need no stub;
provide a `{ move: vi.fn(), select: vi.fn() }` to assert a click sounds.

**Controls** — bindings and pads are pure: [bindings.spec.ts](../src/app/features/game/engine/bindings.spec.ts)
and [gamepad.spec.ts](../src/app/features/game/engine/gamepad.spec.ts) feed plain objects.
`InputController` takes a pad source as its third argument (`() => pads`), so
[input.spec.ts](../src/app/features/game/engine/input.spec.ts) swaps stub pads in and out between
`read()`s. `GamepadNavService` exposes `pads` and `poll(now)` for the same reason — see
[gamepad-nav.service.spec.ts](../src/app/shared/controls/gamepad-nav.service.spec.ts). Key events
need a `code` (physical key) as well as a `key`.

**Motion** — set `SettingsStore.motion` rather than stubbing `matchMedia` once a service is
created; [motion.service.spec.ts](../src/app/shared/motion.service.spec.ts) stubs `matchMedia` before
injecting to cover "Auto".

**`requestAnimationFrame` / `performance.now`** — stub them with `vi.stubGlobal` /
`vi.spyOn` and drive frames manually (see [loop.spec.ts](../src/app/features/game/engine/loop.spec.ts)).

## E2E tests (Playwright)

Config: [playwright.config.ts](../playwright.config.ts). The `webServer` block boots `npm start`
automatically, so you don't need a server running.

```bash
npm run e2e          # headless
npm run e2e:ui       # interactive
npm run e2e:headed   # headed browser
npm run e2e:report   # open the last HTML report
```

### Gamepads in e2e

Chromium exposes no virtual pad, so [e2e/controls.spec.ts](../e2e/controls.spec.ts) replaces
`navigator.getGamepads` in an init script with one standard-layout stub and presses its buttons
with `page.evaluate` (`plugGamepad()` / `tap()`), holding each for a few frames like a thumb. The
same spec covers remapping a key in Settings and the Reduced motion setting.

### The `?fast=1` trick

A real jump lasts about a minute. Loading `/game?fast=1` starts straight in free fall from a low
altitude (no jump run, no hoops, quick opening and outro) so a jump resolves in a few seconds — see
[e2e/game.spec.ts](../e2e/game.spec.ts) and `tuned()` in
[game.ts](../src/app/features/game/game.ts). It combines with the modes
(`/game?mode=circuit&event=fair-first&fast=1`, `?mode=daily&fast=1`, `?mode=arcade&fast=1`) and
**never writes progress**, so e2e runs don't unlock events. Every jump opens on its briefing card:
click **Jump!** first (see the `jump()` helper).

### Calibration specs

[balance.spec.ts](../src/app/features/game/engine/balance.spec.ts) and
[events.spec.ts](../src/app/features/game/engine/events.spec.ts) fly whole jumps with the scripted
pilots of `engine/autopilot.ts`. They guard game design, not code paths: if one fails after a
tuning change, the game got trivial (or unfair) — or an event's medal thresholds need re-setting.
