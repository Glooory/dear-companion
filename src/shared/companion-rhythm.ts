import type { CompanionLifeState, CompanionPace } from "./contracts";

const MINUTE = 60_000;
export const MINIMUM_AWAKE_MS = 20 * MINUTE;
export const DROWSY_RANGE_MS = [20_000, 45_000] as const;
export const SLEEP_RANGE_MS = [3 * MINUTE, 8 * MINUTE] as const;

export const COMPANION_PACE_PROFILES = Object.freeze({
  quiet: {
    calmRangeMs: [12 * MINUTE, 24 * MINUTE],
    playfulRangeMs: [30_000, 60_000],
    autoCuteRangeMs: [8 * MINUTE, 16 * MINUTE],
    sleepOpportunity: 0.12,
  },
  natural: {
    calmRangeMs: [6 * MINUTE, 15 * MINUTE],
    playfulRangeMs: [45_000, 120_000],
    autoCuteRangeMs: [4 * MINUTE, 10 * MINUTE],
    sleepOpportunity: 0.16,
  },
  lively: {
    calmRangeMs: [3 * MINUTE, 8 * MINUTE],
    playfulRangeMs: [60_000, 180_000],
    autoCuteRangeMs: [2 * MINUTE, 6 * MINUTE],
    sleepOpportunity: 0.1,
  },
}) satisfies Record<
  CompanionPace,
  {
    calmRangeMs: readonly [number, number];
    playfulRangeMs: readonly [number, number];
    autoCuteRangeMs: readonly [number, number];
    sleepOpportunity: number;
  }
>;

export function nextRhythmStep(
  input: {
    state: CompanionLifeState;
    pace: CompanionPace;
    available: { drowsy: boolean; sleeping: boolean };
    now: number;
    awakeUntil: number;
  },
  random: () => number
): { state: CompanionLifeState; dueAt: number } {
  const now = Number.isFinite(input.now) ? input.now : 0;
  const profile = COMPANION_PACE_PROFILES[input.pace];
  if (input.state === "working") {
    return { state: "working", dueAt: now + randomDuration(profile.calmRangeMs, random) };
  }
  if (input.state === "sleeping") {
    return { state: "daily-calm", dueAt: now + randomDuration(SLEEP_RANGE_MS, random) };
  }
  if (input.state === "drowsy") {
    return {
      state: input.available.sleeping ? "sleeping" : "daily-calm",
      dueAt: now + randomDuration(DROWSY_RANGE_MS, random),
    };
  }
  if (input.state === "daily-playful") {
    return {
      state: "daily-calm",
      dueAt: now + randomDuration(profile.playfulRangeMs, random),
    };
  }

  const canSleep = now >= input.awakeUntil && (input.available.drowsy || input.available.sleeping);
  const opportunityRoll = finiteRandom(random);
  const state =
    canSleep && opportunityRoll < profile.sleepOpportunity
      ? input.available.drowsy
        ? "drowsy"
        : "sleeping"
      : "daily-playful";
  return { state, dueAt: now + randomDuration(profile.calmRangeMs, random) };
}

export function nextAutoCuteDelay(pace: CompanionPace, random: () => number): number {
  return randomDuration(COMPANION_PACE_PROFILES[pace].autoCuteRangeMs, random);
}

export interface ApproachStep {
  deltaX: number;
  atMs: number;
}

export interface ApproachPlan {
  durationMs: number;
  steps: readonly [ApproachStep, ApproachStep];
}

export const APPROACH_DURATION_MS = 800;
export const APPROACH_STEP_TIMES_MS = [260, 580] as const;

export function createApproachPlan(
  random: () => number,
  initialDirection?: -1 | 1
): ApproachPlan {
  const direction = initialDirection ?? (finiteRandom(random) < 0.5 ? -1 : 1);
  const deltas = createSteps(direction, 12, 18, random, 2);
  return {
    durationMs: APPROACH_DURATION_MS,
    steps: [
      { deltaX: deltas[0]!, atMs: APPROACH_STEP_TIMES_MS[0] },
      { deltaX: deltas[1]!, atMs: APPROACH_STEP_TIMES_MS[1] },
    ],
  };
}

export function createBodyPushSteps(direction: -1 | 1, random: () => number): number[] {
  return createSteps(direction, 6, 10, random);
}

function createSteps(
  direction: -1 | 1,
  minimum: number,
  maximum: number,
  random: () => number,
  fixedStepCount?: number
): number[] {
  const distance = Math.round(minimum + (maximum - minimum) * finiteRandom(random));
  const stepCount = fixedStepCount ?? 4 + Math.round(2 * finiteRandom(random));
  const baseStep = Math.floor(distance / stepCount);
  const remainder = distance - baseStep * stepCount;

  return Array.from(
    { length: stepCount },
    (_, index) => direction * (baseStep + (index >= stepCount - remainder ? 1 : 0))
  );
}

function randomDuration(range: readonly [number, number], random: () => number): number {
  return Math.round(range[0] + (range[1] - range[0]) * finiteRandom(random));
}

function finiteRandom(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
