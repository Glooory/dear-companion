import type { ScreenEllipse } from "../../shared/contracts";
import { PETTING_CANDIDATE_MS, PettingGestureDetector } from "../../shared/petting-gesture";

interface Point {
  x: number;
  y: number;
}
interface Dependencies {
  getCursorScreenPoint(): Point;
  onDetected(): void;
  now?: () => number;
  setInterval?: (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}

export class PettingTracker {
  private detector: PettingGestureDetector | null = null;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private systemSuspended = false;
  private readonly now: () => number;
  private readonly startInterval: NonNullable<Dependencies["setInterval"]>;
  private readonly stopInterval: NonNullable<Dependencies["clearInterval"]>;
  private readonly startTimeout: NonNullable<Dependencies["setTimeout"]>;
  private readonly stopTimeout: NonNullable<Dependencies["clearTimeout"]>;

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now;
    this.startInterval = dependencies.setInterval ?? setInterval;
    this.stopInterval = dependencies.clearInterval ?? clearInterval;
    this.startTimeout = dependencies.setTimeout ?? setTimeout;
    this.stopTimeout = dependencies.clearTimeout ?? clearTimeout;
  }

  begin(region: ScreenEllipse): void {
    if (this.disposed || this.systemSuspended) return;
    this.cancel();
    this.detector = new PettingGestureDetector(region);
    this.sample();
    if (!this.detector) return;
    this.sampleTimer = this.startInterval(() => this.sample(), 40);
    this.expiryTimer = this.startTimeout(() => this.cancel(), PETTING_CANDIDATE_MS);
  }

  cancel(): void {
    this.detector = null;
    if (this.sampleTimer) this.stopInterval(this.sampleTimer);
    if (this.expiryTimer) this.stopTimeout(this.expiryTimer);
    this.sampleTimer = null;
    this.expiryTimer = null;
  }

  setSystemSuspended(suspended: boolean): void {
    this.systemSuspended = suspended;
    if (suspended) this.cancel();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
  }

  private sample(): void {
    const detector = this.detector;
    if (!detector || this.disposed) return;
    const point = this.dependencies.getCursorScreenPoint();
    if (detector.addSample({ x: point.x, y: point.y, at: this.now() })) {
      this.cancel();
      this.dependencies.onDetected();
    } else if (detector.isEnded) {
      this.cancel();
    }
  }
}
