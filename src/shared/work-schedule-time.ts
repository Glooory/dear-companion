import type { Weekday, WorkSchedule } from './contracts'

export interface LocalCalendarParts {
  year: number
  month: number
  day: number
  weekday: Weekday
  hour: number
  minute: number
}

export interface LocalCalendarAdapter {
  parts(timestamp: number): LocalCalendarParts
}

const defaultCalendar: LocalCalendarAdapter = {
  parts(timestamp) {
    const date = new Date(timestamp)
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      weekday: date.getDay() as Weekday,
      hour: date.getHours(),
      minute: date.getMinutes()
    }
  }
}

export function isWorkScheduleActive(
  schedule: WorkSchedule,
  now: number,
  calendar: LocalCalendarAdapter = defaultCalendar
): boolean {
  if (!Number.isFinite(now) || !isValidSchedule(schedule) || !schedule.enabled) return false
  const current = calendar.parts(now)
  const minute = current.hour * 60 + current.minute
  const start = schedule.startHour * 60 + schedule.startMinute
  const end = schedule.endHour * 60 + schedule.endMinute
  const days = new Set(schedule.weekdays)
  if (start < end) return days.has(current.weekday) && minute >= start && minute < end
  if (minute >= start) return days.has(current.weekday)
  const previousDay = ((current.weekday + 6) % 7) as Weekday
  return minute < end && days.has(previousDay)
}

export function nextWorkBoundary(
  schedules: readonly WorkSchedule[],
  now: number,
  calendar: LocalCalendarAdapter = defaultCalendar
): number | null {
  if (!Number.isFinite(now)) return null
  const valid = schedules.filter((schedule) => schedule.enabled && isValidSchedule(schedule))
  if (valid.length === 0) return null
  const isAnyActive = (at: number): boolean => valid.some((schedule) =>
    isWorkScheduleActive(schedule, at, calendar)
  )
  let previous = isAnyActive(now)
  const firstMinute = Math.floor(now / 60_000) * 60_000 + 60_000
  const limit = firstMinute + 8 * 24 * 60 * 60_000
  for (let candidate = firstMinute; candidate <= limit; candidate += 60_000) {
    const current = isAnyActive(candidate)
    if (current !== previous) return candidate
    previous = current
  }
  return null
}

function isValidSchedule(schedule: WorkSchedule): boolean {
  const clockValues = [schedule.startHour, schedule.startMinute, schedule.endHour, schedule.endMinute]
  return typeof schedule.enabled === 'boolean' &&
    clockValues.every(Number.isInteger) &&
    schedule.startHour >= 0 && schedule.startHour <= 23 &&
    schedule.endHour >= 0 && schedule.endHour <= 23 &&
    schedule.startMinute >= 0 && schedule.startMinute <= 59 &&
    schedule.endMinute >= 0 && schedule.endMinute <= 59 &&
    (schedule.startHour !== schedule.endHour || schedule.startMinute !== schedule.endMinute) &&
    schedule.weekdays.length > 0 &&
    new Set(schedule.weekdays).size === schedule.weekdays.length &&
    schedule.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
}
