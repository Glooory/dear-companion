import { describe, expect, it } from "vitest";
import {
  ACTION_PHOTO_HOLD_MS,
  ASSET_SWAP_DURATION_MS,
  computeHoverPose,
  determineAssetSwapStep,
  getInitialActionTimeout,
  getWeightShiftAmplitude,
  motionRequiresDirection,
  PHOTO_TRANSITION_MS,
  REDUCED_ASSET_SWAP_DURATION_MS,
  REDUCED_PHOTO_TRANSITION_MS,
  resolveMotion,
  resolveNextMotionDirection,
  scaleMotionDip,
  selectAmbientMotion,
  selectClickMotion,
  selectMotionDirection,
  selectNonRepeating,
  selectPersonalityMotion,
  shouldSwapPersonalityPhoto,
  unionMotionRect,
} from "./companion-motion";
import { APPROACH_DURATION_MS } from "./companion-rhythm";

describe("companion motion", () => {
  it("uses one canonical duration and semantic reduced-motion fallback", () => {
    expect(resolveMotion("playful-hop", false)).toMatchObject({ durationMs: 620, template: "playful-hop" });
    expect(resolveMotion("playful-hop", true)).toMatchObject({ durationMs: 160, template: "reduced-pulse" });
    expect(resolveMotion("gentle-breathe", true)).toMatchObject({
      durationMs: 1_800,
      template: "gentle-breathe",
    });
    expect(resolveMotion("two-step-approach", false)).toMatchObject({
      movesWindow: true,
      durationMs: APPROACH_DURATION_MS,
    });
    expect(resolveMotion("body-step", true)).toMatchObject({
      movesWindow: false,
      durationMs: 160,
      template: "reduced-pulse",
    });
  });

  it("synchronizes asset-swap visual transition and business occupancy durations", () => {
    expect(ASSET_SWAP_DURATION_MS).toBe(PHOTO_TRANSITION_MS + ACTION_PHOTO_HOLD_MS);
    expect(REDUCED_ASSET_SWAP_DURATION_MS).toBe(REDUCED_PHOTO_TRANSITION_MS);
    expect(resolveMotion("asset-swap", false)).toMatchObject({
      durationMs: 1_400,
      template: "asset-swap",
    });
    expect(resolveMotion("asset-swap", true)).toMatchObject({
      durationMs: 120,
      template: "asset-swap",
    });
  });

  it("defers asset-swap hold and return timing until first transition completion", () => {
    // Initial action request does not start premature timeout for asset-swap
    expect(getInitialActionTimeout("asset-swap", 1_400)).toBeNull();
    expect(getInitialActionTimeout("playful-hop", 620)).toBe(620);
    expect(getInitialActionTimeout("weight-shift", 1_500)).toBe(1_500);

    // Normal motion: on first transition completion, start hold-then-return if temporary photo
    expect(determineAssetSwapStep("active", false, true)).toEqual({
      action: "hold-then-return",
      holdMs: ACTION_PHOTO_HOLD_MS,
    });
    // Permanent personality photo change finishes immediately without 1000ms hold
    expect(determineAssetSwapStep("active", false, false)).toEqual({
      action: "finish",
    });

    // Returning phase: always completes on transition complete
    expect(determineAssetSwapStep("returning", false, true)).toEqual({ action: "finish" });
    expect(determineAssetSwapStep("returning", true, true)).toEqual({ action: "finish" });

    // Reduced motion: enters returning immediately when temporary photo needs return
    expect(determineAssetSwapStep("active", true, true)).toEqual({ action: "return-immediately" });
    // Reduced motion: finishes immediately when no return needed
    expect(determineAssetSwapStep("active", true, false)).toEqual({ action: "finish" });

    // Slow preload simulation (e.g. 800 ms image load):
    // At t=0 ms (action triggered): no timeout scheduled
    const initialTimeout = getInitialActionTimeout("asset-swap", 1_400);
    expect(initialTimeout).toBeNull();
    // At t=800 ms (preload finished) + 400 ms (fade finished) = 1200 ms:
    // First completion event fires. Hold timer starts for full 1000 ms, unreduced by the 800 ms preload.
    const stepNormal = determineAssetSwapStep("active", false, true);
    expect(stepNormal).toEqual({ action: "hold-then-return", holdMs: 1_000 });
    // In reduced motion with return needed, after 800 ms preload + 120 ms fade = 920 ms:
    // Transition enters return immediately so actionState remains active during return crossfade
    const stepReduced = determineAssetSwapStep("active", true, true);
    expect(stepReduced).toEqual({ action: "return-immediately" });
    // When return crossfade completes:
    expect(determineAssetSwapStep("returning", true, true)).toEqual({ action: "finish" });
  });

  it("uses restrained working-shift in working state and keeps normal weight-shift at ~1 DIP", () => {
    expect(resolveMotion("working-shift", false)).toMatchObject({
      durationMs: 1_500,
      template: "working-shift",
    });
    expect(resolveMotion("working-shift", true)).toMatchObject({
      durationMs: 1_800,
      template: "gentle-breathe",
    });

    expect(selectAmbientMotion("working", "quiet", "gentle-breathe", () => 0)).toBe("working-shift");
    expect(selectAmbientMotion("daily-calm", "quiet", "gentle-breathe", () => 0)).toBe("weight-shift");

    const normal180 = getWeightShiftAmplitude("weight-shift", 180);
    const working180 = getWeightShiftAmplitude("working-shift", 180);
    expect(normal180).toEqual({ horizontalDip: 1, rotationDeg: 0.7 });
    expect(working180).toEqual({ horizontalDip: 0.5, rotationDeg: 0.35 });
    expect(working180.horizontalDip).toBeLessThan(normal180.horizontalDip);
    expect(working180.rotationDeg).toBeLessThan(normal180.rotationDeg);

    for (const height of [80, 180, 260]) {
      const normal = getWeightShiftAmplitude("weight-shift", height);
      const working = getWeightShiftAmplitude("working-shift", height);
      expect(working.horizontalDip).toBeLessThan(normal.horizontalDip);
    }
  });

  it("avoids immediately repeating a motion when an alternative exists", () => {
    expect(selectNonRepeating(["gentle-breathe", "weight-shift"], "gentle-breathe", () => 0)).toBe(
      "weight-shift"
    );
    expect(selectNonRepeating(["gentle-breathe"], "gentle-breathe", () => 1)).toBe("gentle-breathe");
  });

  it("alternates directional motions instead of leaning to the same side twice", () => {
    expect(selectMotionDirection(null, () => 0)).toBe(-1);
    expect(selectMotionDirection(-1, () => 0)).toBe(1);
    expect(selectMotionDirection(1, () => 1)).toBe(-1);
  });

  it("identifies directional motions including working-shift and ensures non-zero alternating directions", () => {
    expect(motionRequiresDirection("working-shift")).toBe(true);
    expect(motionRequiresDirection("weight-shift")).toBe(true);
    expect(motionRequiresDirection("drowsy-dip")).toBe(true);
    expect(motionRequiresDirection("calm-lean")).toBe(true);
    expect(motionRequiresDirection("observe-lean")).toBe(true);
    expect(motionRequiresDirection("gentle-breathe")).toBe(false);
    expect(motionRequiresDirection("toe-rise")).toBe(false);
    expect(motionRequiresDirection("playful-hop")).toBe(false);
    expect(motionRequiresDirection("playful-double-hop")).toBe(false);
    expect(motionRequiresDirection("still")).toBe(false);

    // Verify directional selection for working-shift:
    // It must always produce non-zero direction (-1 or 1) and alternate
    let dir: -1 | 0 | 1 = 0;
    for (let i = 0; i < 6; i++) {
      const nextDir: -1 | 0 | 1 = motionRequiresDirection("working-shift")
        ? selectMotionDirection(dir === 0 ? null : dir, () => 0)
        : 0;
      expect(nextDir).not.toBe(0);
      if (dir !== 0) {
        expect(nextDir).toBe(dir === -1 ? 1 : -1);
      }
      dir = nextDir;
    }
  });

  it("preserves direction history across non-directional motions in directional -> non-directional -> directional sequences", () => {
    // 1. Initial directional motion: weight-shift
    const first = resolveNextMotionDirection("weight-shift", null, () => 0);
    expect(first.direction).toBe(-1);
    expect(first.nextHistory).toBe(-1);

    // 2. Interleaving non-directional motions (soft-lift, toe-rise, playful-hop, playful-double-hop)
    // These must return 0 direction and preserve history without consuming alternation state
    const nonDirectionals = ["soft-lift", "toe-rise", "playful-hop", "playful-double-hop"] as const;
    let history = first.nextHistory;
    for (const nonDirectional of nonDirectionals) {
      const step = resolveNextMotionDirection(nonDirectional, history, () => 0);
      expect(step.direction).toBe(0);
      expect(step.nextHistory).toBe(-1);
      history = step.nextHistory;
    }

    // 3. Second directional motion: observe-lean
    // Should alternate from -1 to 1 rather than repeating the visible -1 direction
    const second = resolveNextMotionDirection("observe-lean", history, () => 0);
    expect(second.direction).toBe(1);
    expect(second.nextHistory).toBe(1);
  });

  it("computes union bounding box for simultaneous photos during crossfade", () => {
    expect(unionMotionRect(null, null)).toBeNull();

    const rectA = { x: 10, y: 20, width: 100, height: 200 };
    const rectB = { x: 30, y: 10, width: 120, height: 180 };

    expect(unionMotionRect(rectA, null)).toEqual(rectA);
    expect(unionMotionRect(null, rectB)).toEqual(rectB);

    // rectA bounds: [10, 20] to [110, 220]
    // rectB bounds: [30, 10] to [150, 190]
    // union bounds: [10, 10] to [150, 220] -> x=10, y=10, width=140, height=210
    const union = unionMotionRect(rectA, rectB);
    expect(union).toEqual({
      x: 10,
      y: 10,
      width: 140,
      height: 210,
    });
  });

  it("selects state-appropriate ambient and click motions", () => {
    expect(selectAmbientMotion("working", "lively", null, () => 0)).toBe("gentle-breathe");
    expect(selectAmbientMotion("drowsy", "natural", "gentle-breathe", () => 0)).toBe("drowsy-dip");
    expect(selectClickMotion("daily-playful", null, () => 0)).toBe("playful-hop");
    expect(selectClickMotion("working", null, () => 0)).toBe("calm-lean");
  });

  it("selects personality motions by pace and life state", () => {
    expect(selectPersonalityMotion("daily-calm", "quiet", null, () => 0)).toBe("observe-lean");
    expect(selectPersonalityMotion("daily-calm", "natural", null, () => 0)).toBe("observe-lean");
    expect(selectPersonalityMotion("daily-calm", "lively", null, () => 0)).toBe("playful-hop");
    expect(selectPersonalityMotion("daily-playful", "quiet", null, () => 0)).toBe("observe-lean");
    expect(selectPersonalityMotion("working", "lively", null, () => 0)).toBe("gentle-breathe");
    expect(selectPersonalityMotion("drowsy", "quiet", null, () => 0)).toBe("gentle-breathe");
    expect(selectPersonalityMotion("sleeping", "natural", null, () => 0)).toBe("gentle-breathe");
  });

  it("determines deterministic photo-swap eligibility by pace", () => {
    expect(shouldSwapPersonalityPhoto("quiet", true, () => 0)).toBe(false);
    expect(shouldSwapPersonalityPhoto("natural", true, () => 0.11)).toBe(true);
    expect(shouldSwapPersonalityPhoto("natural", true, () => 0.12)).toBe(false);
    expect(shouldSwapPersonalityPhoto("lively", true, () => 0.17)).toBe(true);
    expect(shouldSwapPersonalityPhoto("lively", false, () => 0)).toBe(false);
    expect(shouldSwapPersonalityPhoto("lively", true, () => Number.NaN)).toBe(true);
  });

  it("computes a bounded 2D hover pose from the visible person rectangle", () => {
    expect(computeHoverPose({ x: 200, y: 100 }, { x: 100, y: 50, width: 100, height: 200 })).toEqual({
      translateX: 2,
      translateY: -0.5,
      rotate: 1.6,
    });
    expect(computeHoverPose({ x: 0, y: 0 }, null)).toEqual({ translateX: 0, translateY: 0, rotate: 0 });
  });

  it("returns neutral pose for non-finite points or invalid rects", () => {
    const validRect = { x: 100, y: 50, width: 100, height: 200 };
    const neutral = { translateX: 0, translateY: 0, rotate: 0 };

    expect(computeHoverPose({ x: Number.NaN, y: 100 }, validRect)).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: Number.NaN }, validRect)).toEqual(neutral);
    expect(computeHoverPose({ x: Number.POSITIVE_INFINITY, y: 100 }, validRect)).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: Number.NEGATIVE_INFINITY }, validRect)).toEqual(neutral);

    expect(computeHoverPose({ x: 100, y: 100 }, null)).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: 100 }, { x: Number.NaN, y: 50, width: 100, height: 200 })).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: 100 }, { x: 100, y: Number.POSITIVE_INFINITY, width: 100, height: 200 })).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: 100 }, { x: 100, y: 50, width: Number.NaN, height: 200 })).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: 100 }, { x: 100, y: 50, width: 100, height: Number.NEGATIVE_INFINITY })).toEqual(neutral);

    expect(computeHoverPose({ x: 100, y: 100 }, { x: 100, y: 50, width: 0, height: 200 })).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: 100 }, { x: 100, y: 50, width: -100, height: 200 })).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: 100 }, { x: 100, y: 50, width: 100, height: 0 })).toEqual(neutral);
    expect(computeHoverPose({ x: 100, y: 100 }, { x: 100, y: 50, width: 100, height: -200 })).toEqual(neutral);
  });

  it("scales displacement for small and large companions within fixed bounds", () => {
    expect(scaleMotionDip(6, 80)).toBe(3);
    expect(scaleMotionDip(6, 180)).toBe(6);
    expect(scaleMotionDip(6, 260)).toBe(8);
    expect(scaleMotionDip(6, Number.NaN)).toBe(6);
  });
});
