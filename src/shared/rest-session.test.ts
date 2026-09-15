import { describe, expect, it } from "vitest";
import type { RestSessionSnapshot } from "./contracts";
import { remainingRestMilliseconds, transitionRestSession } from "./rest-session";

function session(): RestSessionSnapshot {
  return {
    sessionId: "session-1",
    scheduleId: "reminder-1",
    startedAt: 1_000,
    endsAt: 11_000,
    state: "resting",
    cryingUntil: null,
    cursorTolerance: "standard",
    message: "休息",
    sounds: { reminder: false, crying: true },
  };
}

describe("rest session calculations", () => {
  it("derives a clamped countdown from the absolute end time", () => {
    expect(remainingRestMilliseconds(11_000, 1_000, 1_000)).toBe(10_000);
    expect(remainingRestMilliseconds(11_000, 4_500, 1_000)).toBe(6_500);
    expect(remainingRestMilliseconds(11_000, 12_000, 1_000)).toBe(0);
  });

  it("cries for three seconds without changing the end time", () => {
    const crying = transitionRestSession(session(), { type: "movement" }, 2_000)!;
    expect(crying).toMatchObject({ state: "crying", cryingUntil: 5_000, endsAt: 11_000 });
    expect(transitionRestSession(crying, { type: "tick" }, 4_999)?.state).toBe("crying");
    expect(transitionRestSession(crying, { type: "tick" }, 5_000)).toMatchObject({ state: "resting", endsAt: 11_000 });
  });

  it("extends crying when movement occurs during an active crying state", () => {
    const crying = transitionRestSession(session(), { type: "movement" }, 2_000)!;
    expect(crying).toMatchObject({ state: "crying", cryingUntil: 5_000 });
    const extended = transitionRestSession(crying, { type: "movement" }, 3_500)!;
    expect(extended).toMatchObject({ state: "crying", cryingUntil: 6_500, endsAt: 11_000 });
    expect(transitionRestSession(extended, { type: "tick" }, 6_499)?.state).toBe("crying");
    expect(transitionRestSession(extended, { type: "tick" }, 6_500)).toMatchObject({
      state: "resting",
      endsAt: 11_000,
    });
  });

  it("completes late ticks and resumes according to endsAt", () => {
    expect(transitionRestSession(session(), { type: "tick" }, 20_000)?.state).toBe("celebrating");
    expect(transitionRestSession(session(), { type: "resume" }, 5_000)).toMatchObject({
      state: "resting",
      endsAt: 11_000,
    });
    expect(transitionRestSession(session(), { type: "resume" }, 11_001)?.state).toBe("celebrating");
  });

  it("ends manually and clears after celebration", () => {
    expect(transitionRestSession(session(), { type: "manual-end" }, 2_000)).toBeNull();
    expect(
      transitionRestSession({ ...session(), state: "celebrating" }, { type: "celebration-complete" }, 12_000)
    ).toBeNull();
  });
});
