import { describe, expect, it } from "vitest";
import { CursorMovementAccumulator } from "./cursor-movement";

describe("CursorMovementAccumulator", () => {
  it("initializes from the first sample and ignores at-most-two-DIP jitter", () => {
    const accumulator = new CursorMovementAccumulator("sensitive");
    expect(accumulator.add({ x: -10, y: -10, timestamp: 1 })).toBe(false);
    expect(accumulator.add({ x: -8, y: -10, timestamp: 2 })).toBe(false);
    expect(accumulator.distance).toBe(0);
  });

  it("accumulates path distance and resets after crossing each tolerance threshold", () => {
    for (const [tolerance, step] of [
      ["sensitive", 12],
      ["standard", 24],
      ["relaxed", 48],
    ] as const) {
      const accumulator = new CursorMovementAccumulator(tolerance);
      accumulator.add({ x: 0, y: 0, timestamp: 0 });
      expect(accumulator.add({ x: step, y: 0, timestamp: 100 })).toBe(true);
      expect(accumulator.distance).toBe(0);
    }
  });

  it("expires old movement after two seconds", () => {
    const accumulator = new CursorMovementAccumulator("standard");
    accumulator.add({ x: 0, y: 0, timestamp: 0 });
    accumulator.add({ x: 10, y: 0, timestamp: 100 });
    accumulator.add({ x: 20, y: 0, timestamp: 2_101 });
    expect(accumulator.distance).toBe(10);
  });

  it("rejects non-finite and retrograde samples without corrupting the baseline", () => {
    const accumulator = new CursorMovementAccumulator("sensitive");
    accumulator.add({ x: -20, y: 4, timestamp: 100 });
    expect(accumulator.add({ x: Number.NaN, y: 4, timestamp: 200 })).toBe(false);
    expect(accumulator.add({ x: 100, y: 4, timestamp: 99 })).toBe(false);
    expect(accumulator.add({ x: -8, y: 4, timestamp: 300 })).toBe(true);
  });
});
