export type WakeStage = 'murmur' | 'stirring' | 'awake'
export const WAKE_SEQUENCE_EXPIRY_MS = 4_000

export class WakeSequence {
  private clickCount = 0
  private lastClickAt: number | null = null

  registerClick(at: number): WakeStage {
    if (!Number.isFinite(at) || (this.lastClickAt !== null && at < this.lastClickAt)) {
      this.reset()
      return 'murmur'
    }
    if (this.lastClickAt === null || at - this.lastClickAt > WAKE_SEQUENCE_EXPIRY_MS) {
      this.clickCount = 0
    }
    this.clickCount += 1
    this.lastClickAt = at
    if (this.clickCount >= 3) {
      this.reset()
      return 'awake'
    }
    return this.clickCount === 1 ? 'murmur' : 'stirring'
  }

  reset(): void {
    this.clickCount = 0
    this.lastClickAt = null
  }
}
