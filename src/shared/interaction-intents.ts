export interface IntentTimer {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

const systemTimer: IntentTimer = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class ClickIntentArbiter {
  private pendingSingle: unknown = null;

  constructor(
    private readonly delayMs = 220,
    private readonly timer: IntentTimer = systemTimer
  ) {
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError("Click delay must be non-negative");
  }

  singleClick(callback: () => void): void {
    this.cancelPendingSingle();
    const handle = this.timer.set(() => {
      if (this.pendingSingle !== handle) return;
      this.pendingSingle = null;
      callback();
    }, this.delayMs);
    this.pendingSingle = handle;
  }

  doubleClick(callback: () => void): void {
    this.cancelPendingSingle();
    callback();
  }

  dispose(): void {
    this.cancelPendingSingle();
  }

  private cancelPendingSingle(): void {
    if (this.pendingSingle === null) return;
    this.timer.clear(this.pendingSingle);
    this.pendingSingle = null;
  }
}
