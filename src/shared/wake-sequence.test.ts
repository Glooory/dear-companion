import { describe, expect, it } from "vitest";
import { WakeSequence } from "./wake-sequence";

describe("WakeSequence", () => {
  it("wakes on the third timely click and resets", () => {
    const sequence = new WakeSequence();
    expect(sequence.registerClick(1_000)).toBe("murmur");
    expect(sequence.registerClick(2_000)).toBe("stirring");
    expect(sequence.registerClick(3_000)).toBe("awake");
    expect(sequence.registerClick(3_500)).toBe("murmur");
  });

  it("expires and handles invalid or retrograde time without advancing", () => {
    const sequence = new WakeSequence();
    expect(sequence.registerClick(1_000)).toBe("murmur");
    expect(sequence.registerClick(6_000)).toBe("murmur");
    expect(sequence.registerClick(5_000)).toBe("murmur");
    expect(sequence.registerClick(Number.NaN)).toBe("murmur");
  });
});
