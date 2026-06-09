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
const cfg = { ...BASE_CONFIG, windBase: 0, windGust: 0 };
let s = createInitialState(cfg, () => 0.5);   // deterministic seed
for (let i = 0; i < 300; i++) s = integrate(s, NEUTRAL, 1 / 60, cfg);
```

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

### The `?fast=1` trick

A real jump lasts 20–30s. Loading `/game?fast=1` shrinks the jump (lower altitude, gentler
landing window) so a full free-fall → canopy → landing resolves in a few seconds — see
[e2e/game.spec.ts](../e2e/game.spec.ts) and `buildConfig()` in
[game.ts](../src/app/features/game/game.ts). Use it for anything that needs a jump to complete.
