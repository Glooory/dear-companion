import { describe, expect, it } from 'vitest'
import {
  PRESENCE_PROFILES,
  PresenceDeadline,
  nextAmbientDelay,
  nextMotionDelay
} from './companion-presence'

describe('companion presence timing', () => {
  it('uses the approved ambient and motion ranges', () => {
    expect(nextAmbientDelay('quiet', () => 0)).toBe(12_000)
    expect(nextAmbientDelay('natural', () => 1)).toBe(14_000)
    expect(nextAmbientDelay('lively', () => 0)).toBe(5_000)
    expect(nextMotionDelay('quiet', () => 1)).toBe(240_000)
    expect(nextMotionDelay('natural', () => 0)).toBe(45_000)
    expect(nextMotionDelay('lively', () => 1)).toBe(70_000)
    expect(PRESENCE_PROFILES.natural.motionRangeMs).toEqual([45_000, 120_000])
  })

  it('clamps invalid random values', () => {
    expect(nextAmbientDelay('natural', () => Number.NaN)).toBe(8_000)
    expect(nextAmbientDelay('natural', () => -2)).toBe(8_000)
    expect(nextAmbientDelay('natural', () => 3)).toBe(14_000)
  })

  it('preserves an armed deadline until it is consumed or cleared', () => {
    const deadline = new PresenceDeadline()
    deadline.arm(1_000, 8_000)
    deadline.arm(4_000, 14_000)
    expect(deadline.dueAt).toBe(9_000)
    expect(deadline.isDue(8_999)).toBe(false)
    expect(deadline.isDue(9_000)).toBe(true)

    deadline.consume(10_000, 5_000)
    expect(deadline.dueAt).toBe(15_000)
    deadline.clear()
    expect(deadline.dueAt).toBeNull()
  })
})
