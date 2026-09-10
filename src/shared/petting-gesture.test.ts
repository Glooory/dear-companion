import { describe, expect, it } from "vitest";
import { PettingGestureDetector } from "./petting-gesture";

const ellipse = { centerX: 100, centerY: 100, radiusX: 80, radiusY: 40 };

describe("PettingGestureDetector", () => {
  it("detects a reasonably paced back-and-forth path", () => {
    const detector = new PettingGestureDetector(ellipse);
    expect(detector.addSample({ x: 70, y: 100, at: 0 })).toBeNull();
    expect(detector.addSample({ x: 130, y: 100, at: 100 })).toBeNull();
    expect(detector.addSample({ x: 70, y: 100, at: 200 })).toBeNull();
    expect(detector.addSample({ x: 130, y: 100, at: 300 })).toEqual({ leanDirection: 1 });
  });

  it("reports the side where a gesture completes with a neutral center fallback", () => {
    const left = new PettingGestureDetector(ellipse);
    left.addSample({ x: 130, y: 100, at: 0 });
    left.addSample({ x: 70, y: 100, at: 100 });
    left.addSample({ x: 130, y: 100, at: 200 });
    expect(left.addSample({ x: 70, y: 100, at: 300 })).toEqual({ leanDirection: -1 });

    const centered = new PettingGestureDetector(ellipse);
    centered.addSample({ x: 70, y: 100, at: 0 });
    centered.addSample({ x: 130, y: 100, at: 100 });
    centered.addSample({ x: 70, y: 100, at: 200 });
    expect(centered.addSample({ x: 104, y: 100, at: 300 })).toEqual({ leanDirection: 0 });
  });

  it("rejects jitter, one-way passes and teleport-like movement", () => {
    const jitter = new PettingGestureDetector(ellipse);
    jitter.addSample({ x: 100, y: 100, at: 0 });
    jitter.addSample({ x: 101, y: 100, at: 100 });
    expect(jitter.isEnded).toBe(false);
    const oneWay = new PettingGestureDetector(ellipse);
    [80, 95, 110, 125].forEach((x, index) => oneWay.addSample({ x, y: 100, at: index * 100 }));
    expect(oneWay.isEnded).toBe(false);
    const teleport = new PettingGestureDetector(ellipse);
    teleport.addSample({ x: 100, y: 100, at: 0 });
    expect(teleport.addSample({ x: 300, y: 100, at: 40 })).toBeNull();
    expect(teleport.isEnded).toBe(true);
  });

  it("allows only a brief near-region exit and rejects invalid time", () => {
    const detector = new PettingGestureDetector(ellipse);
    detector.addSample({ x: 100, y: 100, at: 0 });
    detector.addSample({ x: 185, y: 100, at: 100 });
    detector.addSample({ x: 185, y: 100, at: 500 });
    expect(detector.isEnded).toBe(true);
    expect(new PettingGestureDetector(ellipse).addSample({ x: 1, y: 1, at: Number.NaN })).toBeNull();
  });
});
