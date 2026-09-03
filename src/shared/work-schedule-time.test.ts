import { describe, expect, it } from "vitest";
import type { WorkSchedule } from "./contracts";
import { isWorkScheduleActive, nextWorkBoundary } from "./work-schedule-time";

const weekday = (date: string) => new Date(date).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
const schedule = (overrides: Partial<WorkSchedule> = {}): WorkSchedule => ({
  id: "work-1",
  enabled: true,
  startHour: 9,
  startMinute: 0,
  endHour: 17,
  endMinute: 0,
  weekdays: [weekday("2026-08-05T12:00:00")],
  ...overrides,
});

describe("work schedule time", () => {
  it("uses inclusive start and exclusive end boundaries", () => {
    expect(isWorkScheduleActive(schedule(), new Date("2026-08-05T09:00:00").getTime())).toBe(true);
    expect(isWorkScheduleActive(schedule(), new Date("2026-08-05T16:59:00").getTime())).toBe(true);
    expect(isWorkScheduleActive(schedule(), new Date("2026-08-05T17:00:00").getTime())).toBe(false);
  });

  it("treats overnight weekdays as the start day", () => {
    const overnight = schedule({ startHour: 22, endHour: 6 });
    expect(isWorkScheduleActive(overnight, new Date("2026-08-05T23:00:00").getTime())).toBe(true);
    expect(isWorkScheduleActive(overnight, new Date("2026-08-06T05:59:00").getTime())).toBe(true);
    expect(isWorkScheduleActive(overnight, new Date("2026-08-06T06:00:00").getTime())).toBe(false);
  });

  it("keeps overlapping schedules active and finds the combined boundary", () => {
    const now = new Date("2026-08-05T10:00:30").getTime();
    const boundary = nextWorkBoundary([schedule(), schedule({ id: "work-2", startHour: 16, endHour: 18 })], now);
    expect(boundary).toBe(new Date("2026-08-05T18:00:00").getTime());
  });

  it("rejects disabled and invalid finite inputs safely", () => {
    expect(isWorkScheduleActive(schedule({ enabled: false }), Date.now())).toBe(false);
    expect(isWorkScheduleActive(schedule(), Number.NaN)).toBe(false);
    expect(nextWorkBoundary([schedule()], Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("uses only the first occurrence of a repeated local interval during a DST fold", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const folded = schedule({
        startHour: 1,
        startMinute: 30,
        endHour: 1,
        endMinute: 45,
        weekdays: [0],
      });
      expect(isWorkScheduleActive(folded, Date.parse("2026-11-01T05:30:00Z"))).toBe(true);
      expect(isWorkScheduleActive(folded, Date.parse("2026-11-01T06:30:00Z"))).toBe(false);
      expect(nextWorkBoundary([folded], Date.parse("2026-11-01T05:45:00Z"))).toBe(Date.parse("2026-11-08T06:30:00Z"));
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
});
