import { describe, expect, it, vi } from 'vitest'
import type { ReminderSchedule } from '../../shared/contracts'
import { ReminderScheduler } from './reminder-scheduler'

function schedule(id = 'reminder-a', overrides: Partial<ReminderSchedule> = {}): ReminderSchedule {
  const target = new Date(2026, 0, 5, 9, 30)
  return {
    id, enabled: true, hour: target.getHours(), minute: target.getMinutes(),
    weekdays: [target.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6], restDurationMinutes: 10,
    cursorTolerance: 'standard', message: id, sounds: { reminder: false, crying: false }, ...overrides
  }
}

describe('ReminderScheduler', () => {
  it('owns one timer and queues simultaneous prompts deterministically', async () => {
    let now = new Date(2026, 0, 5, 9, 29).getTime()
    let monotonic = 0
    const timers: Array<() => void> = []
    const cleared: unknown[] = []
    const prompts = vi.fn()
    const scheduler = new ReminderScheduler({
      loadSchedules: async () => [schedule('reminder-b'), schedule('reminder-a')],
      now: () => now, monotonicNow: () => monotonic, timezoneOffset: () => 0,
      setTimeout: (callback) => { timers.splice(0, timers.length, callback); return 1 as unknown as ReturnType<typeof setTimeout> },
      clearTimeout: (timer) => { cleared.push(timer); timers.splice(0) },
      isRestActive: () => false, onPrompt: prompts
    })
    await scheduler.start()
    expect(timers).toHaveLength(1)
    now = new Date(2026, 0, 5, 9, 30).getTime(); monotonic = 60_000
    timers.shift()!()
    expect(prompts.mock.calls[0]?.[0].scheduleId).toBe('reminder-a')
    scheduler.resolvePrompt(prompts.mock.calls[0]![0].occurrenceId)
    expect(prompts.mock.calls[1]?.[0].scheduleId).toBe('reminder-b')
    scheduler.dispose(); scheduler.dispose()
    expect(cleared.length).toBeGreaterThan(0)
  })

  it('keeps snooze in memory and prevents duplicate firing', async () => {
    let now = new Date(2026, 0, 5, 9, 29).getTime()
    let timer: (() => void) | null = null
    const prompts = vi.fn()
    const scheduler = new ReminderScheduler({
      loadSchedules: async () => [schedule()], now: () => now, monotonicNow: () => now,
      timezoneOffset: () => 0, setTimeout: (callback) => { timer = callback; return 1 as unknown as ReturnType<typeof setTimeout> },
      clearTimeout: () => { timer = null }, isRestActive: () => false, onPrompt: prompts
    })
    await scheduler.start()
    now = new Date(2026, 0, 5, 9, 30).getTime(); timer!()
    const id = prompts.mock.calls[0]![0].occurrenceId
    scheduler.snooze(id, 5)
    now += 5 * 60_000; timer!()
    expect(prompts).toHaveBeenCalledTimes(2)
    scheduler.resolvePrompt(id)
    timer!()
    expect(prompts).toHaveBeenCalledTimes(2)
  })

  it('skips due occurrences during rest and on resume, and reports refresh failure once', async () => {
    let now = new Date(2026, 0, 5, 9, 29).getTime()
    let timer: (() => void) | null = null
    let resting = true
    const prompts = vi.fn(); const errors = vi.fn()
    let fail = false
    const scheduler = new ReminderScheduler({
      loadSchedules: async () => { if (fail) throw new Error('private path'); return [schedule()] },
      now: () => now, monotonicNow: () => now, timezoneOffset: () => 0,
      setTimeout: (callback) => { timer = callback; return 1 as unknown as ReturnType<typeof setTimeout> }, clearTimeout: () => { timer = null },
      isRestActive: () => resting, onPrompt: prompts, onError: errors
    })
    await scheduler.start()
    now = new Date(2026, 0, 5, 9, 30).getTime(); timer!()
    resting = false; scheduler.handleResume(now + 10_000)
    expect(prompts).not.toHaveBeenCalled()
    fail = true; await scheduler.refresh(); await scheduler.refresh()
    expect(errors).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(errors.mock.calls)).not.toContain('private path')
  })
})
