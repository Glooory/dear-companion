import type { CursorTolerance } from './contracts'

export interface CursorSample {
  x: number
  y: number
  timestamp: number
}

export const CURSOR_THRESHOLDS: Readonly<Record<CursorTolerance, number>> = Object.freeze({
  sensitive: 12,
  standard: 24,
  relaxed: 48
})

const JITTER_DIP = 2
const WINDOW_MS = 2_000

export class CursorMovementAccumulator {
  private previous: CursorSample | null = null
  private segments: Array<{ timestamp: number; distance: number }> = []

  constructor(private readonly tolerance: CursorTolerance) {}

  add(sample: CursorSample): boolean {
    if (!isValidSample(sample)) return false
    if (this.previous === null || sample.timestamp <= this.previous.timestamp) {
      if (this.previous === null) this.previous = { ...sample }
      return false
    }
    const distance = Math.hypot(sample.x - this.previous.x, sample.y - this.previous.y)
    this.previous = { ...sample }
    this.segments = this.segments.filter((segment) => segment.timestamp > sample.timestamp - WINDOW_MS)
    if (distance > JITTER_DIP) this.segments.push({ timestamp: sample.timestamp, distance })
    if (this.distance >= CURSOR_THRESHOLDS[this.tolerance]) {
      this.reset(sample)
      return true
    }
    return false
  }

  reset(baseline?: CursorSample): void {
    this.segments = []
    this.previous = baseline && isValidSample(baseline) ? { ...baseline } : null
  }

  get distance(): number {
    return this.segments.reduce((total, segment) => total + segment.distance, 0)
  }
}

function isValidSample(sample: CursorSample): boolean {
  return Number.isFinite(sample.x) && Number.isFinite(sample.y) &&
    Number.isFinite(sample.timestamp) && sample.timestamp >= 0
}
