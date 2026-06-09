export type StepFn = (dt: number) => void;
export type RenderFn = () => void;

/**
 * requestAnimationFrame driver with a fixed-timestep accumulator: physics steps
 * at a constant dt (stable, deterministic) while rendering runs once per frame.
 * Framework-agnostic; the Game component owns its lifecycle.
 */
export class GameLoop {
  private rafId = 0;
  private last = 0;
  private accumulator = 0;
  private running = false;

  private readonly fixedDt = 1 / 60;
  // Clamp huge gaps (e.g. a backgrounded tab) so we never spiral into a flood of
  // catch-up steps.
  private readonly maxFrame = 0.25;

  constructor(
    private readonly step: StepFn,
    private readonly render: RenderFn,
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private readonly tick = (now: number): void => {
    if (!this.running) {
      return;
    }
    let frame = (now - this.last) / 1000;
    this.last = now;
    if (frame > this.maxFrame) {
      frame = this.maxFrame;
    }
    this.accumulator += frame;
    while (this.accumulator >= this.fixedDt) {
      this.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }
    this.render();
    this.rafId = requestAnimationFrame(this.tick);
  };
}
