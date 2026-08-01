import { describe, expect, it } from 'vitest'
import type { ReminderSchedule } from './contracts'
import {
  dueReminderOccurrences,
  nextEnabledOccurrence,
  nextReminderOccurrence,
  type LocalCalendarAdapter
} from './reminder-time'

const calendar: LocalCalendarAdapter = {
  toLocalParts(epochMs) {
    const value = new Date(epochMs)
    return {
      year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate(),
      weekday: value.getUTCDay(), hour: value.getUTCHours(), minute: value.getUTCMinutes()
    }
  },
  addCalendarDays(parts, days) {
    const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12))
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() }
  },
  fromLocalParts(parts) {
    if (parts.year === 2026 && parts.month === 3 && parts.day === 8 && parts.hour === 2) return null
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  }
}

function schedule(overrides: Partial<ReminderSchedule> = {}): ReminderSchedule {
  return {
    id: 'reminder-a', enabled: true, hour: 9, minute: 30,
    weekdays: [0, 1, 2, 3, 4, 5, 6], restDurationMinutes: 10,
    cursorTolerance: 'standard', message: '休息一下',
    sounds: { reminder: false, crying: false }, ...overrides
  }
}

describe('reminder calendar calculations', () => {
  it('finds same-day future time and advances past same-day occurrences', () => {
    expect(nextReminderOccurrence(schedule(), Date.UTC(2026, 0, 1, 9), calendar)?.scheduledFor)
      .toBe(Date.UTC(2026, 0, 1, 9, 30))
    expect(nextReminderOccurrence(schedule(), Date.UTC(2026, 0, 1, 10), calendar)?.scheduledFor)
      .toBe(Date.UTC(2026, 0, 2, 9, 30))
  })

  it('supports every weekday and month/year boundaries', () => {
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const result = nextReminderOccurrence(
        schedule({ weekdays: [weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6] }),
        Date.UTC(2026, 11, 28), calendar
      )
      expect(result).not.toBeNull()
      expect(calendar.toLocalParts(result!.scheduledFor).weekday).toBe(weekday)
    }
  })

  it('skips disabled schedules and nonexistent spring-forward times', () => {
    expect(nextReminderOccurrence(schedule({ enabled: false }), 0, calendar)).toBeNull()
    const result = nextReminderOccurrence(
      schedule({ hour: 2, minute: 30, weekdays: [0] }),
      Date.UTC(2026, 2, 7), calendar
    )
    expect(result?.scheduledFor).toBe(Date.UTC(2026, 2, 15, 2, 30))
  })

  it('orders simultaneous schedules deterministically and returns every due item once', () => {
    const schedules = [schedule({ id: 'reminder-b' }), schedule({ id: 'reminder-a' })]
    expect(nextEnabledOccurrence(schedules, Date.UTC(2026, 0, 1, 9), calendar)?.scheduleId).toBe('reminder-a')
    const due = dueReminderOccurrences(schedules, Date.UTC(2026, 0, 1, 9), Date.UTC(2026, 0, 1, 10), new Set(), calendar)
    expect(due.map((value) => value.scheduleId)).toEqual(['reminder-a', 'reminder-b'])
    expect(dueReminderOccurrences(schedules, Date.UTC(2026, 0, 1, 9), Date.UTC(2026, 0, 1, 10), new Set([due[0]!.occurrenceId, due[1]!.occurrenceId]), calendar)).toEqual([])
  })

  it('uses a local-date occurrence key independent of repeated clock offsets', () => {
    const result = nextReminderOccurrence(schedule({ weekdays: [0], hour: 1 }), Date.UTC(2026, 10, 1), calendar)
    expect(result?.occurrenceId).toBe('reminder-a-2026-11-01-01-30')
  })
})
