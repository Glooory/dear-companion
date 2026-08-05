import { describe, expect, it } from 'vitest'
import { COMPANION_PACE_PROFILES, MINIMUM_AWAKE_MS, nextAutoCuteDelay, nextRhythmStep } from './companion-rhythm'

describe('companion rhythm', () => {
  it('uses deterministic pace ranges', () => {
    expect(nextAutoCuteDelay('quiet', () => 0)).toBe(COMPANION_PACE_PROFILES.quiet.autoCuteRangeMs[0])
    expect(nextAutoCuteDelay('lively', () => 1)).toBe(COMPANION_PACE_PROFILES.lively.autoCuteRangeMs[1])
  })

  it('enters available sleep states only after the awake floor', () => {
    const input = { state: 'daily-calm' as const, pace: 'natural' as const, available: { drowsy: true, sleeping: true }, now: 1_000, awakeUntil: 0 }
    expect(nextRhythmStep(input, () => 0).state).toBe('drowsy')
    expect(nextRhythmStep({ ...input, awakeUntil: input.now + MINIMUM_AWAKE_MS }, () => 0).state).toBe('daily-playful')
    expect(nextRhythmStep({ ...input, available: { drowsy: false, sleeping: true } }, () => 0).state).toBe('sleeping')
  })

  it('moves drowsy and sleeping states through their approved sequence', () => {
    const common = { pace: 'natural' as const, available: { drowsy: true, sleeping: true }, now: 10, awakeUntil: 0 }
    expect(nextRhythmStep({ ...common, state: 'drowsy' }, () => 0).state).toBe('sleeping')
    expect(nextRhythmStep({ ...common, state: 'sleeping' }, () => 0).state).toBe('daily-calm')
  })
})
