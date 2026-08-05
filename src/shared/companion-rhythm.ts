import type { CompanionLifeState, CompanionPace } from './contracts'

const MINUTE = 60_000
export const MINIMUM_AWAKE_MS = 20 * MINUTE
export const DROWSY_RANGE_MS = [20_000, 45_000] as const
export const SLEEP_RANGE_MS = [3 * MINUTE, 8 * MINUTE] as const

export const COMPANION_PACE_PROFILES = Object.freeze({
  quiet: {
    calmRangeMs: [12 * MINUTE, 24 * MINUTE],
    playfulRangeMs: [30_000, 60_000],
    autoCuteRangeMs: [8 * MINUTE, 16 * MINUTE],
    sleepOpportunity: 0.12
  },
  natural: {
    calmRangeMs: [6 * MINUTE, 15 * MINUTE],
    playfulRangeMs: [45_000, 120_000],
    autoCuteRangeMs: [4 * MINUTE, 10 * MINUTE],
    sleepOpportunity: 0.16
  },
  lively: {
    calmRangeMs: [3 * MINUTE, 8 * MINUTE],
    playfulRangeMs: [60_000, 180_000],
    autoCuteRangeMs: [2 * MINUTE, 6 * MINUTE],
    sleepOpportunity: 0.1
  }
}) satisfies Record<CompanionPace, {
  calmRangeMs: readonly [number, number]
  playfulRangeMs: readonly [number, number]
  autoCuteRangeMs: readonly [number, number]
  sleepOpportunity: number
}>

export function nextRhythmStep(
  input: {
    state: CompanionLifeState
    pace: CompanionPace
    available: { drowsy: boolean; sleeping: boolean }
    now: number
    awakeUntil: number
  },
  random: () => number
): { state: CompanionLifeState; dueAt: number } {
  const now = Number.isFinite(input.now) ? input.now : 0
  const profile = COMPANION_PACE_PROFILES[input.pace]
  if (input.state === 'working') {
    return { state: 'working', dueAt: now + randomDuration(profile.calmRangeMs, random) }
  }
  if (input.state === 'sleeping') {
    return { state: 'daily-calm', dueAt: now + randomDuration(SLEEP_RANGE_MS, random) }
  }
  if (input.state === 'drowsy') {
    return {
      state: input.available.sleeping ? 'sleeping' : 'daily-calm',
      dueAt: now + randomDuration(DROWSY_RANGE_MS, random)
    }
  }
  if (input.state === 'daily-playful') {
    return {
      state: 'daily-calm',
      dueAt: now + randomDuration(profile.playfulRangeMs, random)
    }
  }

  const canSleep = now >= input.awakeUntil && (input.available.drowsy || input.available.sleeping)
  const opportunityRoll = finiteRandom(random)
  const state = canSleep && opportunityRoll < profile.sleepOpportunity
    ? (input.available.drowsy ? 'drowsy' : 'sleeping')
    : 'daily-playful'
  return { state, dueAt: now + randomDuration(profile.calmRangeMs, random) }
}

export function nextAutoCuteDelay(pace: CompanionPace, random: () => number): number {
  return randomDuration(COMPANION_PACE_PROFILES[pace].autoCuteRangeMs, random)
}

function randomDuration(range: readonly [number, number], random: () => number): number {
  return Math.round(range[0] + (range[1] - range[0]) * finiteRandom(random))
}

function finiteRandom(random: () => number): number {
  const value = random()
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}
