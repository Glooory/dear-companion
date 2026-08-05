import type { ScreenEllipse } from './contracts'

export interface CursorSample { x: number; y: number; at: number }

export const PETTING_SAMPLE_MIN_DISTANCE = 2
export const PETTING_REQUIRED_PATH = 48
export const PETTING_REQUIRED_REVERSALS = 2
export const PETTING_MIN_SPEED = 20
export const PETTING_MAX_SPEED = 1_600
export const PETTING_MAX_OUTSIDE_MS = 350
export const PETTING_MAX_OUTSIDE_DISTANCE = 40
export const PETTING_CANDIDATE_MS = 3_000

export class PettingGestureDetector {
  private first: CursorSample | null = null
  private previous: CursorSample | null = null
  private path = 0
  private reversals = 0
  private lastDirection = 0
  private dominantAxis: 'x' | 'y' | null = null
  private totalX = 0
  private totalY = 0
  private outsideSince: number | null = null
  private ended = false

  constructor(private readonly ellipse: ScreenEllipse) {}

  addSample(sample: CursorSample): boolean {
    if (this.ended || !isValidSample(sample) || !isValidEllipse(this.ellipse)) {
      this.ended = true
      return false
    }
    if (!this.first) {
      if (outsideDistance(sample, this.ellipse) > PETTING_MAX_OUTSIDE_DISTANCE) {
        this.ended = true
        return false
      }
      this.first = { ...sample }
      this.previous = { ...sample }
      this.outsideSince = outsideDistance(sample, this.ellipse) > 0 ? sample.at : null
      return false
    }
    if (sample.at < this.first.at || sample.at - this.first.at > PETTING_CANDIDATE_MS) {
      this.ended = true
      return false
    }
    const previous = this.previous!
    const elapsed = sample.at - previous.at
    if (elapsed <= 0) {
      this.ended = true
      return false
    }
    const dx = sample.x - previous.x
    const dy = sample.y - previous.y
    const distance = Math.hypot(dx, dy)
    const speed = distance / (elapsed / 1_000)
    if (distance >= PETTING_SAMPLE_MIN_DISTANCE) {
      if (speed < PETTING_MIN_SPEED || speed > PETTING_MAX_SPEED) {
        this.ended = true
        return false
      }
      this.path += distance
      this.totalX += Math.abs(dx)
      this.totalY += Math.abs(dy)
      this.dominantAxis = this.totalX >= this.totalY ? 'x' : 'y'
      const delta = this.dominantAxis === 'x' ? dx : dy
      const direction = Math.sign(delta)
      if (direction !== 0 && this.lastDirection !== 0 && direction !== this.lastDirection) {
        this.reversals += 1
      }
      if (direction !== 0) this.lastDirection = direction
    }
    const outside = outsideDistance(sample, this.ellipse)
    if (outside > PETTING_MAX_OUTSIDE_DISTANCE) {
      this.ended = true
      return false
    }
    if (outside > 0) {
      this.outsideSince ??= sample.at
      if (sample.at - this.outsideSince > PETTING_MAX_OUTSIDE_MS) {
        this.ended = true
        return false
      }
    } else {
      this.outsideSince = null
    }
    this.previous = { ...sample }
    if (this.path >= PETTING_REQUIRED_PATH && this.reversals >= PETTING_REQUIRED_REVERSALS) {
      this.ended = true
      return true
    }
    return false
  }

  get isEnded(): boolean { return this.ended }
}

function outsideDistance(point: CursorSample, ellipse: ScreenEllipse): number {
  const normalized = Math.hypot(
    (point.x - ellipse.centerX) / ellipse.radiusX,
    (point.y - ellipse.centerY) / ellipse.radiusY
  )
  return normalized <= 1 ? 0 : (normalized - 1) * Math.max(ellipse.radiusX, ellipse.radiusY)
}

function isValidSample(sample: CursorSample): boolean {
  return Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.at)
}

function isValidEllipse(ellipse: ScreenEllipse): boolean {
  return Number.isFinite(ellipse.centerX) && Number.isFinite(ellipse.centerY) &&
    Number.isFinite(ellipse.radiusX) && Number.isFinite(ellipse.radiusY) &&
    ellipse.radiusX > 0 && ellipse.radiusY > 0
}
