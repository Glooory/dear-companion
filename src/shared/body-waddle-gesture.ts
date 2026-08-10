import type { ScreenEllipse } from './contracts'

export interface BodyWaddleRegion {
  visibleRect: { x: number; y: number; width: number; height: number }
  headEllipse: ScreenEllipse
}

export interface BodyPointerSample {
  x: number
  y: number
  at: number
}

export type HorizontalDirection = -1 | 0 | 1

export class BodyWaddleGesture {
  private previous: BodyPointerSample | null = null
  private accumulatedX = 0
  private accumulatedY = 0
  private lastTriggeredAt: number | null = null

  constructor(
    private readonly threshold = 30,
    private readonly cooldownMs = 1_000
  ) {}

  register(sample: BodyPointerSample, region: BodyWaddleRegion): HorizontalDirection {
    if (!isFiniteSample(sample) || !isInBodyRegion(sample, region)) {
      this.reset()
      return 0
    }

    if (this.lastTriggeredAt !== null && sample.at - this.lastTriggeredAt < this.cooldownMs) {
      this.resetMotion(sample)
      return 0
    }

    if (!this.previous) {
      this.previous = sample
      return 0
    }

    const deltaX = sample.x - this.previous.x
    const deltaY = sample.y - this.previous.y
    this.previous = sample

    if (deltaX !== 0 && this.accumulatedX !== 0 && Math.sign(deltaX) !== Math.sign(this.accumulatedX)) {
      this.accumulatedX = deltaX
      this.accumulatedY = deltaY
    } else {
      this.accumulatedX += deltaX
      this.accumulatedY += deltaY
    }

    if (
      Math.abs(this.accumulatedX) < this.threshold ||
      Math.abs(this.accumulatedX) < Math.abs(this.accumulatedY)
    ) {
      return 0
    }

    const direction = Math.sign(this.accumulatedX) as -1 | 1
    this.lastTriggeredAt = sample.at
    this.resetMotion(sample)
    return direction
  }

  reset(): void {
    this.previous = null
    this.accumulatedX = 0
    this.accumulatedY = 0
  }

  private resetMotion(sample: BodyPointerSample): void {
    this.previous = sample
    this.accumulatedX = 0
    this.accumulatedY = 0
  }
}

function isInBodyRegion(sample: BodyPointerSample, region: BodyWaddleRegion): boolean {
  const { visibleRect, headEllipse } = region
  if (
    visibleRect.width <= 0 || visibleRect.height <= 0 ||
    sample.x < visibleRect.x || sample.x > visibleRect.x + visibleRect.width ||
    sample.y < visibleRect.y || sample.y > visibleRect.y + visibleRect.height
  ) {
    return false
  }
  if (headEllipse.radiusX <= 0 || headEllipse.radiusY <= 0) return true
  const normalizedX = (sample.x - headEllipse.centerX) / headEllipse.radiusX
  const normalizedY = (sample.y - headEllipse.centerY) / headEllipse.radiusY
  return normalizedX * normalizedX + normalizedY * normalizedY > 1
}

function isFiniteSample(sample: BodyPointerSample): boolean {
  return Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.at)
}
