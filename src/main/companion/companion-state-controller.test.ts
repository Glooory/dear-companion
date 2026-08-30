import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ACTION_TEMPLATES,
  DEFAULT_APP_SETTINGS,
  EMPTY_ACTION_SLOTS,
  type AppSettings,
  type PetConfig
} from '../../shared/contracts'
import { MINIMUM_AWAKE_MS } from '../../shared/companion-rhythm'
import { CompanionStateController } from './companion-state-controller'

function pet(): PetConfig {
  const asset = (id: string) => ({
    id, fileName: `${id}.png`, format: 'png' as const, byteSize: 1, width: 10, height: 20,
    alphaBounds: { x: 0, y: 0, width: 10, height: 20 },
    normalization: { scale: 1, offsetX: 0, offsetY: 0, baselineOffset: 0 }, headHotspot: null
  })
  return {
    id: 'pet-1', name: 'Mochi', targetHeight: 180,
    assets: [asset('daily'), asset('drowsy'), asset('sleeping')],
    actionSlots: { ...EMPTY_ACTION_SLOTS, idle: ['daily'] },
    actionTemplates: { ...DEFAULT_ACTION_TEMPLATES },
    lifeStates: {
      drowsy: { enabled: true, assetIds: ['drowsy'] },
      sleeping: { enabled: true, assetIds: ['sleeping'] }, workingAssetIds: []
    },
    companionPace: 'natural', interactionBubblesEnabled: true,
    dialogueSettings: { address: '', categories: {} }
  }
}

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, activePetId: 'pet-1', pets: [pet()], ...overrides }
}

function harness(initial = settings()) {
  let current = initial
  let now = new Date('2026-08-05T10:00:00').getTime()
  let monotonicNow = 0
  let timezoneOffset = 0
  const timers: Array<{ callback: () => void; delay: number; cleared: boolean }> = []
  const changes: ReturnType<CompanionStateController['getSnapshot']>[] = []
  const controller = new CompanionStateController({
    loadSettings: async () => current,
    onChanged: (snapshot) => changes.push(snapshot), now: () => now,
    monotonicNow: () => monotonicNow, timezoneOffset: () => timezoneOffset, random: () => 0,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, cleared: false }
      timers.push(timer)
      return timer as unknown as ReturnType<typeof setTimeout>
    },
    clearTimer: (timer) => { (timer as unknown as { cleared: boolean }).cleared = true }
  })
  return {
    controller, timers, changes,
    setSettings(value: AppSettings) { current = value },
    setNow(value: number) { now = value },
    advance(ms: number) { now += ms; monotonicNow += ms },
    advanceWall(ms: number) { now += ms },
    setTimezoneOffset(value: number) { timezoneOffset = value }
  }
}

describe('CompanionStateController', () => {
  it('starts calm, replaces timers, and respects manual state availability', async () => {
    const h = harness()
    await h.controller.start()
    expect(h.controller.getSnapshot()).toMatchObject({ lifeState: 'daily-calm', available: { drowsy: true, sleeping: true } })
    const firstTimer = h.timers[0]!
    h.controller.selectManualState('sleeping')
    expect(firstTimer.cleared).toBe(true)
    expect(h.controller.getSnapshot().lifeState).toBe('sleeping')
    h.setSettings(settings({ pets: [{ ...pet(), lifeStates: { ...pet().lifeStates, sleeping: { enabled: false, assetIds: ['sleeping'] } } }] }))
    await h.controller.refresh()
    expect(h.controller.getSnapshot()).toMatchObject({ lifeState: 'daily-calm', manualSelection: 'auto' })
  })

  it('combines scheduled and manual work and restores scheduled work', async () => {
    const now = new Date('2026-08-05T10:00:00')
    const h = harness(settings({ workSchedules: [{
      id: 'work-1', enabled: true, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0,
      weekdays: [now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6]
    }] }))
    h.setNow(now.getTime())
    await h.controller.start()
    expect(h.controller.getSnapshot()).toMatchObject({ lifeState: 'working', scheduledWorkActive: true })
    h.controller.setManualWork(true)
    h.controller.setManualWork(false)
    expect(h.controller.getSnapshot().lifeState).toBe('working')
    h.setSettings(settings({ workSchedules: [] }))
    await h.controller.refresh()
    expect(h.controller.getSnapshot()).toMatchObject({ lifeState: 'daily-calm', scheduledWorkActive: false })
  })

  it('suspends timers, preserves manual work, and resets flags on resume', async () => {
    const h = harness()
    await h.controller.start()
    h.controller.setManualWork(true)
    h.controller.setSystemSuspended(true)
    expect(h.controller.getSnapshot()).toMatchObject({ lifeState: 'working', manualWorkActive: true, systemSuspended: true, nextTransitionAt: null })
    h.controller.setSystemSuspended(false)
    expect(h.controller.getSnapshot().lifeState).toBe('working')
    h.controller.handleResume()
    expect(h.controller.getSnapshot()).toMatchObject({ lifeState: 'daily-calm', manualWorkActive: false, manualSelection: 'auto' })
  })

  it('returns from a completed system flow to work or daily calm instead of stale sleep', async () => {
    const h = harness()
    await h.controller.start()
    h.controller.selectManualState('sleeping')
    h.controller.setSystemSuspended(true)
    h.controller.setSystemSuspended(false)
    expect(h.controller.getSnapshot()).toMatchObject({ lifeState: 'daily-calm', manualSelection: 'auto' })
  })

  it('wakes only from effective sleep and applies the awake cooldown', async () => {
    const h = harness()
    await h.controller.start()
    h.controller.selectManualState('sleeping')
    h.controller.wakeFromSleep()
    expect(h.controller.getSnapshot()).toMatchObject({ lifeState: 'daily-calm', manualSelection: 'auto' })
    const transition = h.controller.getSnapshot().nextTransitionAt!
    expect(transition).toBeGreaterThan(0)
    h.advance(MINIMUM_AWAKE_MS - 1)
    h.controller.wakeFromSleep()
    expect(h.controller.getSnapshot().lifeState).toBe('daily-calm')
  })

  it('pauses when hidden, refreshes active pets, and disposes owned timers', async () => {
    const h = harness(settings({ petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, visible: false } }))
    await h.controller.start()
    expect(h.controller.getSnapshot().nextTransitionAt).toBeNull()
    h.setSettings(settings())
    await h.controller.refresh()
    expect(h.controller.getSnapshot().nextTransitionAt).not.toBeNull()
    const last = h.timers.at(-1)!
    h.controller.dispose()
    expect(last.cleared).toBe(true)
    const before = h.changes.length
    await h.controller.refresh()
    expect(h.changes).toHaveLength(before)
  })

  it('publishes once for harmless stale wake requests', async () => {
    const h = harness()
    await h.controller.start()
    const before = h.changes.length
    h.controller.wakeFromSleep()
    expect(h.changes).toHaveLength(before)
    expect(vi.isMockFunction(h.controller.wakeFromSleep)).toBe(false)
  })

  it('checks for wall-clock changes while scheduled work is active instead of waiting for the stale boundary', async () => {
    const start = new Date('2026-08-05T10:00:00')
    const h = harness(settings({ workSchedules: [{
      id: 'work-1', enabled: true, startHour: 9, startMinute: 0,
      endHour: 17, endMinute: 0,
      weekdays: [start.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6]
    }] }))
    h.setNow(start.getTime())
    await h.controller.start()
    expect(h.controller.getSnapshot().scheduledWorkActive).toBe(true)
    expect(h.timers.at(-1)!.delay).toBeLessThanOrEqual(30_000)

    h.advanceWall(8 * 60 * 60_000)
    h.timers.at(-1)!.callback()

    expect(h.controller.getSnapshot()).toMatchObject({
      lifeState: 'daily-calm',
      scheduledWorkActive: false
    })
  })
})
