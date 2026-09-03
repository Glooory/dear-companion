import { describe, expect, it } from "vitest";
import { resolveCompanionState, type CompanionStateInputs } from "./companion-state";

const base: CompanionStateInputs = {
  current: "daily-calm",
  automaticState: "daily-playful",
  manualSelection: "auto",
  manualWorkActive: false,
  scheduledWorkActive: false,
  systemSuspended: false,
  available: { drowsy: true, sleeping: true },
};

describe("resolveCompanionState", () => {
  it("applies system, work, manual and automatic priority", () => {
    expect(resolveCompanionState({ ...base, current: "sleeping", systemSuspended: true, manualWorkActive: true })).toBe(
      "sleeping"
    );
    expect(resolveCompanionState({ ...base, manualWorkActive: true, manualSelection: "sleeping" })).toBe("working");
    expect(resolveCompanionState({ ...base, scheduledWorkActive: true })).toBe("working");
    expect(resolveCompanionState({ ...base, manualSelection: "drowsy" })).toBe("drowsy");
    expect(resolveCompanionState(base)).toBe("daily-playful");
  });

  it("falls back safely when an optional state is unavailable", () => {
    expect(
      resolveCompanionState({ ...base, manualSelection: "sleeping", available: { drowsy: true, sleeping: false } })
    ).toBe("daily-calm");
    expect(
      resolveCompanionState({ ...base, automaticState: "drowsy", available: { drowsy: false, sleeping: true } })
    ).toBe("daily-calm");
  });
});
