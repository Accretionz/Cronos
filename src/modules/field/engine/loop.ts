/** Simulation steps per second. A fixed step keeps behavior identical on 60 Hz and 144 Hz screens. */
export const STEP = 1 / 60;
/** After a long pause (tab in background, slow frame), don't try to catch up more than this. */
const MAX_CATCH_UP = 0.25;

/**
 * Runs `step(dt)` at a fixed rate and `render()` once per animation frame.
 * Pauses itself while the page is hidden and when `setVisible(false)` (e.g. scrolled off screen).
 */
export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private visible = true;

  constructor(
    private step: (dt: number) => void,
    private render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.schedule();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.schedule();
  }

  private onVisibility = () => {
    if (!document.hidden) this.schedule();
  };

  private schedule() {
    if (!this.running || this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.running || document.hidden || !this.visible) return; // resumes via schedule()
    this.acc += Math.min(MAX_CATCH_UP, (now - this.last) / 1000);
    this.last = now;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };
}
