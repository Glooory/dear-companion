import { describe, expect, it } from "vitest";
import { WAKE_SEQUENCE_EXPIRY_MS, WakeSequence } from "./wake-sequence";

describe("WakeSequence", () => {
  it("progresses across all three wake stages and preserves photo override during stirring", () => {
    const sequence = new WakeSequence();

    // Stage 1: murmur
    const step1 = sequence.registerClick(1_000, "drowsy-asset-1");
    expect(step1).toEqual({
      stage: "murmur",
      photoOverride: null,
      motion: "wake-sway",
      dialogueKey: "sleeping:murmur",
      transitionThenDip: false,
    });
    expect(sequence.getPhotoOverride(1_000)).toBeNull();

    // Stage 2: stirring with available drowsy photo
    const step2 = sequence.registerClick(2_000, "drowsy-asset-1");
    expect(step2).toEqual({
      stage: "stirring",
      photoOverride: "drowsy-asset-1",
      motion: "drowsy-dip",
      dialogueKey: "sleeping:stirring",
      transitionThenDip: true,
    });
    expect(sequence.getPhotoOverride(2_500)).toBe("drowsy-asset-1");

    // Stage 3: awake clears override and wakes companion
    const step3 = sequence.registerClick(3_000, "drowsy-asset-1");
    expect(step3).toEqual({
      stage: "awake",
      photoOverride: null,
      motion: "settle",
      dialogueKey: "sleeping:awake",
      transitionThenDip: false,
    });
    expect(sequence.getPhotoOverride(3_000)).toBeNull();

    // Subsequent click restarts at murmur
    const step4 = sequence.registerClick(3_500, "drowsy-asset-1");
    expect(step4.stage).toBe("murmur");
    expect(sequence.getPhotoOverride(3_500)).toBeNull();
  });

  it("handles missing drowsy-photo fallback without photo override", () => {
    const sequence = new WakeSequence();

    const step1 = sequence.registerClick(1_000, null);
    expect(step1.stage).toBe("murmur");
    expect(step1.photoOverride).toBeNull();

    // Stirring with no drowsy photo available:
    // Still performs drowsy-dip, but photoOverride is null and transitionThenDip is false
    const step2 = sequence.registerClick(2_000, null);
    expect(step2).toEqual({
      stage: "stirring",
      photoOverride: null,
      motion: "drowsy-dip",
      dialogueKey: "sleeping:stirring",
      transitionThenDip: false,
    });
    expect(sequence.getPhotoOverride(2_000)).toBeNull();

    const step3 = sequence.registerClick(3_000, undefined);
    expect(step3.stage).toBe("awake");
  });

  it("expires after timeout and clears active photo override", () => {
    const sequence = new WakeSequence();

    sequence.registerClick(1_000, "drowsy-asset-1");
    const step2 = sequence.registerClick(2_000, "drowsy-asset-1");
    expect(step2.stage).toBe("stirring");
    expect(sequence.getPhotoOverride(2_500)).toBe("drowsy-asset-1");

    // Before expiry (at 2000 + 3999)
    expect(sequence.isExpired(2_000 + WAKE_SEQUENCE_EXPIRY_MS - 1)).toBe(false);
    expect(sequence.getPhotoOverride(2_000 + WAKE_SEQUENCE_EXPIRY_MS - 1)).toBe("drowsy-asset-1");

    // After expiry (at 2000 + 4001)
    expect(sequence.isExpired(2_000 + WAKE_SEQUENCE_EXPIRY_MS + 1)).toBe(true);
    expect(sequence.getPhotoOverride(2_000 + WAKE_SEQUENCE_EXPIRY_MS + 1)).toBeNull();

    // Next click restarts from murmur
    const restarted = sequence.registerClick(2_000 + WAKE_SEQUENCE_EXPIRY_MS + 1, "drowsy-asset-1");
    expect(restarted.stage).toBe("murmur");
    expect(restarted.photoOverride).toBeNull();
  });

  it("resets manually and clears photo override", () => {
    const sequence = new WakeSequence();
    sequence.registerClick(1_000, "drowsy-asset-1");
    sequence.registerClick(2_000, "drowsy-asset-1");
    expect(sequence.getPhotoOverride(2_000)).toBe("drowsy-asset-1");

    sequence.reset();
    expect(sequence.getPhotoOverride(2_000)).toBeNull();
    expect(sequence.registerClick(2_500, "drowsy-asset-1").stage).toBe("murmur");
  });

  it("handles invalid or retrograde time without advancing", () => {
    const sequence = new WakeSequence();
    expect(sequence.registerClick(1_000).stage).toBe("murmur");
    expect(sequence.registerClick(6_000).stage).toBe("murmur");
    expect(sequence.registerClick(5_000).stage).toBe("murmur");
    expect(sequence.registerClick(Number.NaN).stage).toBe("murmur");
  });
});
