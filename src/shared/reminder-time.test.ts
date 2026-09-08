import { describe, expect, it } from "vitest";
import type { ReminderSchedule } from "./contracts";
import {
  dueReminderOccurrences,
  nextEnabledOccurrence,
  nextReminderOccurrence,
  type LocalCalendarAdapter,
} from "./reminder-time";

const calendar: LocalCalendarAdapter = {
  toLocalParts(epochMs) {
    const value = new Date(epochMs);
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      weekday: value.getUTCDay(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
    };
  },
  addCalendarDays(parts, days) {
    const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  },
  fromLocalParts(parts) {
    if (parts.year === 2026 && parts.month === 3 && parts.day === 8 && parts.hour === 2) return null;
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  },
};

function schedule(overrides: Partial<ReminderSchedule> = {}): ReminderSchedule {
  return {
    id: "reminder-a",
    mode: "fixed",
    enabled: true,
    hour: 9,
    minute: 30,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    restDurationMinutes: 10,
    cursorTolerance: "standard",
    message: "休息一下",
    sounds: { reminder: false, crying: false },
    ...overrides,
  } as ReminderSchedule;
}

function intervalSchedule(overrides: Partial<ReminderSchedule> = {}): ReminderSchedule {
  return {
    id: "reminder-interval",
    mode: "interval",
    enabled: true,
    windows: [
      { startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
      { startHour: 14, startMinute: 0, endHour: 18, endMinute: 0 },
    ],
    intervalMinutes: 60,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    restDurationMinutes: 10,
    cursorTolerance: "standard",
    message: "休息一下",
    sounds: { reminder: false, crying: false },
    ...overrides,
  } as ReminderSchedule;
}

describe("reminder calendar calculations", () => {
  it("finds same-day future time and advances past same-day occurrences", () => {
    expect(nextReminderOccurrence(schedule(), Date.UTC(2026, 0, 1, 9), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 1, 9, 30)
    );
    expect(nextReminderOccurrence(schedule(), Date.UTC(2026, 0, 1, 10), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 2, 9, 30)
    );
  });

  it("supports every weekday and month/year boundaries", () => {
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const result = nextReminderOccurrence(
        schedule({ weekdays: [weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6] }),
        Date.UTC(2026, 11, 28),
        calendar
      );
      expect(result).not.toBeNull();
      expect(calendar.toLocalParts(result!.scheduledFor).weekday).toBe(weekday);
    }
  });

  it("skips disabled schedules and nonexistent spring-forward times", () => {
    expect(nextReminderOccurrence(schedule({ enabled: false }), 0, calendar)).toBeNull();
    const result = nextReminderOccurrence(
      schedule({ hour: 2, minute: 30, weekdays: [0] }),
      Date.UTC(2026, 2, 7),
      calendar
    );
    expect(result?.scheduledFor).toBe(Date.UTC(2026, 2, 15, 2, 30));
  });

  it("orders simultaneous schedules deterministically and returns every due item once", () => {
    const schedules = [schedule({ id: "reminder-b" }), schedule({ id: "reminder-a" })];
    expect(nextEnabledOccurrence(schedules, Date.UTC(2026, 0, 1, 9), calendar)?.scheduleId).toBe("reminder-a");
    const due = dueReminderOccurrences(
      schedules,
      Date.UTC(2026, 0, 1, 9),
      Date.UTC(2026, 0, 1, 10),
      new Set(),
      calendar
    );
    expect(due.map((value) => value.scheduleId)).toEqual(["reminder-a", "reminder-b"]);
    expect(
      dueReminderOccurrences(
        schedules,
        Date.UTC(2026, 0, 1, 9),
        Date.UTC(2026, 0, 1, 10),
        new Set([due[0]!.occurrenceId, due[1]!.occurrenceId]),
        calendar
      )
    ).toEqual([]);
  });

  it("uses a local-date occurrence key independent of repeated clock offsets", () => {
    const result = nextReminderOccurrence(schedule({ weekdays: [0], hour: 1 }), Date.UTC(2026, 10, 1), calendar);
    expect(result?.occurrenceId).toBe("reminder-a-2026-11-01-01-30");
  });

  it("calculates interval occurrences for multi-window schedules", () => {
    const sched = intervalSchedule();
    // Start is included (9:00)
    expect(nextReminderOccurrence(sched, Date.UTC(2026, 0, 5, 8, 30), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 5, 9, 0)
    );

    // Within first window (10:01 -> 11:00)
    expect(nextReminderOccurrence(sched, Date.UTC(2026, 0, 5, 10, 1), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 5, 11, 0)
    );

    // Aligned end is included (11:00 -> 12:00)
    expect(nextReminderOccurrence(sched, Date.UTC(2026, 0, 5, 11, 0), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 5, 12, 0)
    );

    // Second window restarts at its own start; gap has no occurrences (12:00 -> 14:00)
    expect(nextReminderOccurrence(sched, Date.UTC(2026, 0, 5, 12, 0), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 5, 14, 0)
    );
    expect(nextReminderOccurrence(sched, Date.UTC(2026, 0, 5, 13, 0), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 5, 14, 0)
    );

    // Second window advances correctly (14:00 -> 15:00)
    expect(nextReminderOccurrence(sched, Date.UTC(2026, 0, 5, 14, 0), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 5, 15, 0)
    );

    // End of day advances to next day's first window (18:00 -> next day 09:00)
    expect(nextReminderOccurrence(sched, Date.UTC(2026, 0, 5, 18, 0), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 6, 9, 0)
    );

    // Occurrence ID format for interval mode
    expect(nextReminderOccurrence(sched, Date.UTC(2026, 0, 5, 8, 30), calendar)?.occurrenceId).toBe(
      "reminder-interval-2026-01-05-09-00"
    );
  });

  it("does not synthesize an unaligned end for interval windows", () => {
    const unaligned = intervalSchedule({
      windows: [{ startHour: 9, startMinute: 0, endHour: 11, endMinute: 30 }],
      intervalMinutes: 60,
    });
    // At 11:00, next occurrence is NOT 11:30 (unaligned), but next day 9:00
    expect(nextReminderOccurrence(unaligned, Date.UTC(2026, 0, 5, 11, 0), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 0, 6, 9, 0)
    );
  });

  it("skips disabled interval schedules and respects weekday filtering", () => {
    expect(nextReminderOccurrence(intervalSchedule({ enabled: false }), 0, calendar)).toBeNull();

    // 2026-01-09 is Friday (weekday 5), 2026-01-10 is Saturday (6), 2026-01-12 is Monday (1)
    const weekdaySched = intervalSchedule({ weekdays: [1, 2, 3, 4, 5] });
    expect(
      nextReminderOccurrence(weekdaySched, Date.UTC(2026, 0, 9, 18, 0), calendar)?.scheduledFor
    ).toBe(Date.UTC(2026, 0, 12, 9, 0));
  });

  it("sorts fixed and interval schedules deterministically together", () => {
    const fixed = schedule({ id: "rem-fixed", hour: 9, minute: 0 });
    const interval = intervalSchedule({ id: "rem-interval" });
    const due = dueReminderOccurrences(
      [interval, fixed],
      Date.UTC(2026, 0, 5, 8),
      Date.UTC(2026, 0, 5, 9),
      new Set(),
      calendar
    );
    expect(due.map((o) => o.scheduleId)).toEqual(["rem-fixed", "rem-interval"]);
  });

  it("skips nonexistent DST times and handles repeated local times for interval schedules", () => {
    // 2026-03-08 hour 2 is null in calendar
    const dstSched = intervalSchedule({
      windows: [{ startHour: 1, startMinute: 0, endHour: 4, endMinute: 0 }],
      intervalMinutes: 60,
    });
    // Candidate at 01:00 matches. At 01:00, 02:00 is null so it skips to 03:00
    expect(nextReminderOccurrence(dstSched, Date.UTC(2026, 2, 8, 1, 0), calendar)?.scheduledFor).toBe(
      Date.UTC(2026, 2, 8, 3, 0)
    );

    // Fallback repeated time adapter: 1:30 repeats, fromLocalParts returns earliest
    const calledParts: unknown[] = [];
    const fallbackCalendar: LocalCalendarAdapter = {
      ...calendar,
      fromLocalParts(parts) {
        calledParts.push(parts);
        return calendar.fromLocalParts(parts);
      },
    };
    const occurrence = nextReminderOccurrence(dstSched, Date.UTC(2026, 0, 5, 0), fallbackCalendar);
    expect(occurrence?.occurrenceId).toBe("reminder-interval-2026-01-05-01-00");
  });
});
