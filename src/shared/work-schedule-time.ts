import type { WorkSchedule } from "./contracts";
import { SYSTEM_LOCAL_CALENDAR, type LocalCalendarAdapter, type LocalDateParts } from "./reminder-time";

export type { LocalCalendarAdapter } from "./reminder-time";

interface WorkInterval {
  startAt: number;
  endAt: number;
}

export function isWorkScheduleActive(
  schedule: WorkSchedule,
  now: number,
  calendar: LocalCalendarAdapter = SYSTEM_LOCAL_CALENDAR
): boolean {
  if (!Number.isFinite(now) || !isValidSchedule(schedule) || !schedule.enabled) return false;
  const current = calendar.toLocalParts(now);
  return [-1, 0].some((offset) => {
    const date = calendar.addCalendarDays(current, offset);
    const interval = workIntervalForDate(schedule, date, calendar);
    return interval !== null && now >= interval.startAt && now < interval.endAt;
  });
}

export function nextWorkBoundary(
  schedules: readonly WorkSchedule[],
  now: number,
  calendar: LocalCalendarAdapter = SYSTEM_LOCAL_CALENDAR
): number | null {
  if (!Number.isFinite(now)) return null;
  const valid = schedules.filter((schedule) => schedule.enabled && isValidSchedule(schedule));
  if (valid.length === 0) return null;

  const current = calendar.toLocalParts(now);
  const candidates = new Set<number>();
  for (const schedule of valid) {
    for (let offset = -1; offset <= 8; offset += 1) {
      const date = calendar.addCalendarDays(current, offset);
      const interval = workIntervalForDate(schedule, date, calendar);
      if (!interval) continue;
      if (interval.startAt > now) candidates.add(interval.startAt);
      if (interval.endAt > now) candidates.add(interval.endAt);
    }
  }

  const isAnyActive = (at: number): boolean => valid.some((schedule) => isWorkScheduleActive(schedule, at, calendar));
  for (const candidate of [...candidates].sort((left, right) => left - right)) {
    if (isAnyActive(candidate - 1) !== isAnyActive(candidate)) return candidate;
  }
  return null;
}

function workIntervalForDate(
  schedule: WorkSchedule,
  date: Pick<LocalDateParts, "year" | "month" | "day">,
  calendar: LocalCalendarAdapter
): WorkInterval | null {
  const noon = calendar.fromLocalParts({ ...date, hour: 12, minute: 0 });
  if (noon === null) return null;
  const weekday = calendar.toLocalParts(noon).weekday;
  if (!schedule.weekdays.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6)) return null;

  const startAt = calendar.fromLocalParts({
    ...date,
    hour: schedule.startHour,
    minute: schedule.startMinute,
  });
  const startMinutes = schedule.startHour * 60 + schedule.startMinute;
  const endMinutes = schedule.endHour * 60 + schedule.endMinute;
  const endDate = calendar.addCalendarDays(date, startMinutes > endMinutes ? 1 : 0);
  const endAt = calendar.fromLocalParts({
    ...endDate,
    hour: schedule.endHour,
    minute: schedule.endMinute,
  });
  if (startAt === null || endAt === null || endAt <= startAt) return null;
  return { startAt, endAt };
}

function isValidSchedule(schedule: WorkSchedule): boolean {
  const clockValues = [schedule.startHour, schedule.startMinute, schedule.endHour, schedule.endMinute];
  return (
    typeof schedule.enabled === "boolean" &&
    clockValues.every(Number.isInteger) &&
    schedule.startHour >= 0 &&
    schedule.startHour <= 23 &&
    schedule.endHour >= 0 &&
    schedule.endHour <= 23 &&
    schedule.startMinute >= 0 &&
    schedule.startMinute <= 59 &&
    schedule.endMinute >= 0 &&
    schedule.endMinute <= 59 &&
    (schedule.startHour !== schedule.endHour || schedule.startMinute !== schedule.endMinute) &&
    schedule.weekdays.length > 0 &&
    new Set(schedule.weekdays).size === schedule.weekdays.length &&
    schedule.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  );
}
