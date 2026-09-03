import { describe, expect, it, vi } from "vitest";
import { PettingTracker } from "./petting-tracker";

function harness() {
  const points = [
    { x: 80, y: 100 },
    { x: 105, y: 100 },
    { x: 80, y: 100 },
    { x: 105, y: 100 },
  ];
  let pointIndex = 0;
  let now = 0;
  const intervals: Array<{ callback: () => void; cleared: boolean }> = [];
  const timeouts: Array<{ callback: () => void; cleared: boolean }> = [];
  const detected = vi.fn();
  const tracker = new PettingTracker({
    getCursorScreenPoint: () => points[Math.min(pointIndex++, points.length - 1)]!,
    onDetected: detected,
    now: () => now,
    setInterval: (callback) => {
      const timer = { callback, cleared: false };
      intervals.push(timer);
      return timer as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: (timer) => {
      (timer as unknown as { cleared: boolean }).cleared = true;
    },
    setTimeout: (callback) => {
      const timer = { callback, cleared: false };
      timeouts.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer) => {
      (timer as unknown as { cleared: boolean }).cleared = true;
    },
  });
  return {
    tracker,
    intervals,
    timeouts,
    detected,
    advance(ms = 100) {
      now += ms;
    },
  };
}

describe("PettingTracker", () => {
  it("samples only while armed and emits once", () => {
    const h = harness();
    h.tracker.begin({ centerX: 100, centerY: 100, radiusX: 80, radiusY: 40 });
    const timer = h.intervals[0]!;
    for (let count = 0; count < 3; count += 1) {
      h.advance();
      timer.callback();
    }
    expect(h.detected).toHaveBeenCalledTimes(1);
    expect(timer.cleared).toBe(true);
    timer.callback();
    expect(h.detected).toHaveBeenCalledTimes(1);
  });

  it("cancels on timeout, system flow and disposal", () => {
    const h = harness();
    h.tracker.begin({ centerX: 100, centerY: 100, radiusX: 80, radiusY: 40 });
    h.timeouts[0]!.callback();
    expect(h.intervals[0]!.cleared).toBe(true);
    h.tracker.begin({ centerX: 100, centerY: 100, radiusX: 80, radiusY: 40 });
    h.tracker.setSystemSuspended(true);
    expect(h.intervals[1]!.cleared).toBe(true);
    h.tracker.begin({ centerX: 100, centerY: 100, radiusX: 80, radiusY: 40 });
    expect(h.intervals).toHaveLength(2);
    h.tracker.setSystemSuspended(false);
    h.tracker.begin({ centerX: 100, centerY: 100, radiusX: 80, radiusY: 40 });
    h.tracker.dispose();
    expect(h.intervals[2]!.cleared).toBe(true);
    h.tracker.begin({ centerX: 100, centerY: 100, radiusX: 80, radiusY: 40 });
    expect(h.intervals).toHaveLength(3);
  });
});
