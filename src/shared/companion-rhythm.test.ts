import { describe, expect, it } from "vitest";
import { resolveMotion } from "./companion-motion";
import {
  APPROACH_DURATION_MS,
  COMPANION_PACE_PROFILES,
  createApproachPlan,
  createBodyPushSteps,
  MINIMUM_AWAKE_MS,
  nextAutoCuteDelay,
  nextRhythmStep,
} from "./companion-rhythm";

describe("companion rhythm", () => {
  it("uses deterministic pace ranges", () => {
    expect(nextAutoCuteDelay("quiet", () => 0)).toBe(COMPANION_PACE_PROFILES.quiet.autoCuteRangeMs[0]);
    expect(nextAutoCuteDelay("lively", () => 1)).toBe(COMPANION_PACE_PROFILES.lively.autoCuteRangeMs[1]);
  });

  it("creates two approach steps that synchronize timing and keep their new position", () => {
    expect(createApproachPlan(() => 0, -1)).toEqual({
      durationMs: 800,
      steps: [
        { deltaX: -6, atMs: 260 },
        { deltaX: -6, atMs: 580 },
      ],
    });

    const maximum = createApproachPlan(() => 1, 1);
    expect(maximum.steps.map((step) => step.deltaX)).toEqual([9, 9]);
    expect(maximum.durationMs - maximum.steps[1].atMs).toBe(220);

    expect(createApproachPlan(() => Number.NaN, 1)).toEqual({
      durationMs: 800,
      steps: [
        { deltaX: 6, atMs: 260 },
        { deltaX: 6, atMs: 580 },
      ],
    });

    for (let r = 0; r <= 1; r += 0.1) {
      const plan = createApproachPlan(() => r, 1);
      expect(plan.steps).toHaveLength(2);
      expect(plan.durationMs).toBe(APPROACH_DURATION_MS);
      const totalDelta = plan.steps.reduce((sum, step) => sum + step.deltaX, 0);
      expect(totalDelta).toBeGreaterThanOrEqual(12);
      expect(totalDelta).toBeLessThanOrEqual(18);
    }

    expect(resolveMotion("two-step-approach", false).durationMs).toBe(APPROACH_DURATION_MS);
  });

  it("creates shorter body-push steps in the requested pointer direction", () => {
    expect(createBodyPushSteps(-1, () => 0)).toEqual([-1, -1, -2, -2]);
    expect(createBodyPushSteps(1, () => 1)).toEqual([1, 1, 2, 2, 2, 2]);
  });

  it("enters available sleep states only after the awake floor", () => {
    const input = {
      state: "daily-calm" as const,
      pace: "natural" as const,
      available: { drowsy: true, sleeping: true },
      now: 1_000,
      awakeUntil: 0,
    };
    expect(nextRhythmStep(input, () => 0).state).toBe("drowsy");
    expect(nextRhythmStep({ ...input, awakeUntil: input.now + MINIMUM_AWAKE_MS }, () => 0).state).toBe("daily-playful");
    expect(nextRhythmStep({ ...input, available: { drowsy: false, sleeping: true } }, () => 0).state).toBe("sleeping");
  });

  it("moves drowsy and sleeping states through their approved sequence", () => {
    const common = { pace: "natural" as const, available: { drowsy: true, sleeping: true }, now: 10, awakeUntil: 0 };
    expect(nextRhythmStep({ ...common, state: "drowsy" }, () => 0).state).toBe("sleeping");
    expect(nextRhythmStep({ ...common, state: "sleeping" }, () => 0).state).toBe("daily-calm");
  });
});
