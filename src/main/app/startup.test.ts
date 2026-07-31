import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../shared/contracts'
import {
  StartupIntentQueue,
  prepareTray,
  runStartup,
  terminateFailedStartup
} from './startup'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('startup', () => {
  it('requests terminal quit even when startup cleanup throws', () => {
    const report = vi.fn()
    const quit = vi.fn()

    expect(() =>
      terminateFailedStartup({
        cleanup: () => {
          throw new Error('cleanup failed')
        },
        report,
        quit
      })
    ).not.toThrow()

    expect(report).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('handles a rejected startup without exposing a headless tray or rejecting', async () => {
    const load = deferred<AppSettings>()
    const tray = { create: vi.fn(), refresh: vi.fn() }
    const onFailure = vi.fn()
    const startup = runStartup(
      () => prepareTray({ settingsStore: { load: () => load.promise }, tray, isQuitting: () => false }),
      onFailure
    )

    load.reject(new Error('settings unavailable'))

    await expect(startup).resolves.toBeUndefined()
    expect(onFailure).toHaveBeenCalledOnce()
    expect(tray.create).not.toHaveBeenCalled()
    expect(tray.refresh).not.toHaveBeenCalled()
  })

  it('does not expose tray actions until the initial settings snapshot has loaded', async () => {
    const load = deferred<AppSettings>()
    const tray = { create: vi.fn(), refresh: vi.fn() }
    const preparing = prepareTray({
      settingsStore: { load: () => load.promise },
      tray,
      isQuitting: () => false
    })

    await Promise.resolve()
    expect(tray.create).not.toHaveBeenCalled()

    const settings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, visible: false }
    }
    load.resolve(settings)

    await expect(preparing).resolves.toBe(settings)
    expect(tray.create).toHaveBeenCalledOnce()
    expect(tray.refresh).toHaveBeenCalledWith(settings)
    expect(tray.create).toHaveBeenCalledBefore(tray.refresh)
  })

  it('drains early second-instance and activate intents once after the initial menu', async () => {
    const load = deferred<AppSettings>()
    const tray = { create: vi.fn(), refresh: vi.fn() }
    let persisted = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, visible: false }
    }
    const showFromFreshSettings = vi.fn(() => {
      persisted = {
        ...persisted,
        petWindow: { ...persisted.petWindow, visible: true }
      }
      tray.refresh(persisted)
    })
    const queue = new StartupIntentQueue({
      secondInstance: showFromFreshSettings,
      activate: showFromFreshSettings
    })
    const preparing = prepareTray({
      settingsStore: { load: () => load.promise },
      tray,
      isQuitting: () => false
    })

    queue.request('second-instance')
    queue.request('activate')
    expect(showFromFreshSettings).not.toHaveBeenCalled()

    load.resolve(persisted)
    await preparing
    queue.markReady()
    queue.markReady()

    expect(showFromFreshSettings).toHaveBeenCalledTimes(2)
    expect(tray.refresh).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ petWindow: expect.objectContaining({ visible: false }) })
    )
    expect(tray.refresh).toHaveBeenLastCalledWith(
      expect.objectContaining({ petWindow: expect.objectContaining({ visible: true }) })
    )
  })
})
