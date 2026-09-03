import type { CompanionPace } from "./contracts";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const PRESENCE_PROFILES = Object.freeze({
  quiet: {
    ambientRangeMs: [12 * SECOND, 20 * SECOND],
    motionRangeMs: [2 * MINUTE, 4 * MINUTE],
  },
  natural: {
    ambientRangeMs: [8 * SECOND, 14 * SECOND],
    motionRangeMs: [45 * SECOND, 2 * MINUTE],
  },
  lively: {
    ambientRangeMs: [5 * SECOND, 10 * SECOND],
    motionRangeMs: [25 * SECOND, 70 * SECOND],
  },
}) satisfies Record<
  CompanionPace,
  {
    ambientRangeMs: readonly [number, number];
    motionRangeMs: readonly [number, number];
  }
>;

export function nextAmbientDelay(pace: CompanionPace, random: () => number): number {
  return randomDuration(PRESENCE_PROFILES[pace].ambientRangeMs, random);
}

export function nextMotionDelay(pace: CompanionPace, random: () => number): number {
  return randomDuration(PRESENCE_PROFILES[pace].motionRangeMs, random);
}

export class PresenceDeadline {
  dueAt: number | null = null;

  arm(now: number, delay: number): void {
    if (this.dueAt !== null) return;
    this.dueAt = finiteTime(now) + finiteDelay(delay);
  }

  isDue(now: number): boolean {
    return this.dueAt !== null && finiteTime(now) >= this.dueAt;
  }

  consume(now: number, nextDelay: number): void {
    this.dueAt = finiteTime(now) + finiteDelay(nextDelay);
  }

  clear(): void {
    this.dueAt = null;
  }
}

function randomDuration(range: readonly [number, number], random: () => number): number {
  const value = random();
  const normalized = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return Math.round(range[0] + (range[1] - range[0]) * normalized);
}

function finiteTime(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteDelay(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
