import type { ReminderOccurrence, ReminderSchedule } from './contracts'

export interface LocalDateParts {
  year: number
  month: number
  day: number
  weekday: number
  hour: number
  minute: number
}

export interface LocalCalendarAdapter {
  toLocalParts(epochMs: number): LocalDateParts
  addCalendarDays(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>, days: number): Pick<LocalDateParts, 'year' | 'month' | 'day'>
  fromLocalParts(parts: Pick<LocalDateParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>): number | null
}

export const SYSTEM_LOCAL_CALENDAR: LocalCalendarAdapter = {
  toLocalParts(epochMs) {
    const date = new Date(epochMs)
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      weekday: date.getDay(),
      hour: date.getHours(),
      minute: date.getMinutes()
    }
  },
  addCalendarDays(parts, days) {
    const date = new Date(parts.year, parts.month - 1, parts.day + days, 12)
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
  },
  fromLocalParts(parts) {
    const guess = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0)
    if (!matchesLocalParts(guess, parts)) return null
    let earliest = guess.getTime()
    for (let candidate = earliest - 3 * 60 * 60 * 1000; candidate < earliest; candidate += 60_000) {
      if (matchesLocalParts(new Date(candidate), parts)) earliest = candidate
    }
    return earliest
  }
}

export function nextReminderOccurrence(
  schedule: ReminderSchedule,
  afterMs: number,
  calendar: LocalCalendarAdapter = SYSTEM_LOCAL_CALENDAR
): ReminderOccurrence | null {
  if (!schedule.enabled || !Number.isFinite(afterMs)) return null
  const start = calendar.toLocalParts(afterMs)
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = calendar.addCalendarDays(start, offset)
    const noon = calendar.fromLocalParts({ ...date, hour: 12, minute: 0 })
    if (noon === null) continue
    const weekday = calendar.toLocalParts(noon).weekday
    if (!schedule.weekdays.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6)) continue
    const scheduledFor = calendar.fromLocalParts({
      ...date,
      hour: schedule.hour,
      minute: schedule.minute
    })
    if (scheduledFor === null || scheduledFor <= afterMs) continue
    return createOccurrence(schedule, scheduledFor, date)
  }
  return null
}

export function nextEnabledOccurrence(
  schedules: readonly ReminderSchedule[],
  afterMs: number,
  calendar: LocalCalendarAdapter = SYSTEM_LOCAL_CALENDAR
): ReminderOccurrence | null {
  return schedules
    .map((schedule) => nextReminderOccurrence(schedule, afterMs, calendar))
    .filter((value): value is ReminderOccurrence => value !== null)
    .sort(compareOccurrences)[0] ?? null
}

export function dueReminderOccurrences(
  schedules: readonly ReminderSchedule[],
  startExclusiveMs: number,
  endInclusiveMs: number,
  excludedOccurrenceIds: ReadonlySet<string> = new Set(),
  calendar: LocalCalendarAdapter = SYSTEM_LOCAL_CALENDAR
): ReminderOccurrence[] {
  if (!Number.isFinite(startExclusiveMs) || !Number.isFinite(endInclusiveMs) || endInclusiveMs <= startExclusiveMs) return []
  const due: ReminderOccurrence[] = []
  for (const schedule of schedules) {
    let cursor = startExclusiveMs
    for (let guard = 0; guard < 400; guard += 1) {
      const occurrence = nextReminderOccurrence(schedule, cursor, calendar)
      if (!occurrence || occurrence.scheduledFor > endInclusiveMs) break
      if (!excludedOccurrenceIds.has(occurrence.occurrenceId)) due.push(occurrence)
      cursor = occurrence.scheduledFor
    }
  }
  return due.sort(compareOccurrences)
}

function createOccurrence(
  schedule: ReminderSchedule,
  scheduledFor: number,
  date: Pick<LocalDateParts, 'year' | 'month' | 'day'>
): ReminderOccurrence {
  const occurrenceId = [
    schedule.id,
    String(date.year).padStart(4, '0'),
    String(date.month).padStart(2, '0'),
    String(date.day).padStart(2, '0'),
    String(schedule.hour).padStart(2, '0'),
    String(schedule.minute).padStart(2, '0')
  ].join('-')
  return {
    occurrenceId,
    scheduleId: schedule.id,
    scheduledFor,
    restDurationMinutes: schedule.restDurationMinutes,
    cursorTolerance: schedule.cursorTolerance,
    message: schedule.message,
    sounds: { ...schedule.sounds }
  }
}

function compareOccurrences(left: ReminderOccurrence, right: ReminderOccurrence): number {
  return left.scheduledFor - right.scheduledFor || left.scheduleId.localeCompare(right.scheduleId)
}

function matchesLocalParts(
  date: Date,
  parts: Pick<LocalDateParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>
): boolean {
  return date.getFullYear() === parts.year && date.getMonth() + 1 === parts.month &&
    date.getDate() === parts.day && date.getHours() === parts.hour &&
    date.getMinutes() === parts.minute
}
