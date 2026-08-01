import { describe, expect, it, vi } from 'vitest'
import type { ReminderPrompt } from '../../shared/contracts'
import { RestSessionController } from './rest-session-controller'

function prompt(): ReminderPrompt {
  return {
    occurrenceId: 'reminder-1-2026-01-01-09-30', scheduleId: 'reminder-1', scheduledFor: 1_000,
    triggeredAt: 1_000, restDurationMinutes: 1, cursorTolerance: 'sensitive', message: '休息',
    sounds: { reminder: false, crying: true }
  }
}

describe('RestSessionController', () => {
  it('owns one 250 ms sampler, cries repeatedly without changing endsAt, and ends manually', () => {
    let now = 1_000
    let cursor = { x: 0, y: 0 }
    let interval: (() => void) | null = null
    const clearInterval = vi.fn(); const audio = vi.fn(); const changed = vi.fn(); const consumed = vi.fn()
    const controller = new RestSessionController({
      now: () => now, getCursorScreenPoint: () => cursor,
      setInterval: (callback, delay) => { expect(delay).toBe(250); interval = callback; return 1 as unknown as ReturnType<typeof setInterval> },
      clearInterval, setTimeout: () => 2 as unknown as ReturnType<typeof setTimeout>, clearTimeout: vi.fn(),
      idFactory: () => 'session-1', onPromptConsumed: consumed, onCryingAudio: audio, onChanged: changed
    })
    const started = controller.startFromPrompt(prompt())
    expect(started).toMatchObject({ startedAt: 1_000, endsAt: 61_000, state: 'resting' })
    expect(consumed).toHaveBeenCalledWith(prompt().occurrenceId)
    now = 1_250; cursor = { x: 12, y: 0 }; interval!()
    expect(controller.getSnapshot().session).toMatchObject({ state: 'crying', cryingUntil: 4_250, endsAt: 61_000 })
    expect(audio).toHaveBeenCalledWith(true)
    now = 4_250; interval!()
    expect(controller.getSnapshot().session?.state).toBe('resting')
    controller.endManually()
    expect(controller.getSnapshot().session).toBeNull()
    expect(clearInterval).toHaveBeenCalled()
  })

  it('completes on late resume, celebrates for two seconds, and disposes timers', () => {
    let now = 1_000
    let celebration: (() => void) | null = null
    const clearTimeout = vi.fn()
    const controller = new RestSessionController({
      now: () => now, getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      setInterval: () => 1 as unknown as ReturnType<typeof setInterval>, clearInterval: vi.fn(),
      setTimeout: (callback, delay) => { expect(delay).toBe(2_000); celebration = callback; return 2 as unknown as ReturnType<typeof setTimeout> },
      clearTimeout, idFactory: () => 'session-1', onPromptConsumed: vi.fn(), onCryingAudio: vi.fn(), onChanged: vi.fn()
    })
    controller.startFromPrompt(prompt())
    now = 70_000; controller.handleResume(now)
    expect(controller.getSnapshot().session?.state).toBe('celebrating')
    celebration!()
    expect(controller.getSnapshot().session).toBeNull()
    controller.dispose()
  })
})
