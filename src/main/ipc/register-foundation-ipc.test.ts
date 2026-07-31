import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS, type AppSettings, type WindowKind } from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { SettingsStore } from '../settings/settings-store'
import type { WindowManager } from '../windows/window-manager'
import { registerFoundationIpc } from './register-foundation-ipc'

const ipcHarness = vi.hoisted(() => ({
  handlers: new Map<string, (event: { sender: { id: number } }, ...args: unknown[]) => unknown>(),
  listeners: new Map<string, (event: { sender: { id: number }; returnValue?: unknown }) => void>(),
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcHarness.handle,
    on: ipcHarness.on,
    removeHandler: ipcHarness.removeHandler,
    removeListener: ipcHarness.removeListener
  }
}))

beforeEach(() => {
  ipcHarness.handlers.clear()
  ipcHarness.listeners.clear()
  ipcHarness.handle.mockReset()
  ipcHarness.on.mockReset()
  ipcHarness.removeHandler.mockReset()
  ipcHarness.removeListener.mockReset()
  ipcHarness.handle.mockImplementation(
    (
      channel: string,
      handler: (event: { sender: { id: number } }, ...args: unknown[]) => unknown
    ) => {
      ipcHarness.handlers.set(channel, handler)
    }
  )
  ipcHarness.on.mockImplementation(
    (channel: string, listener: (event: { sender: { id: number }; returnValue?: unknown }) => void) => {
      ipcHarness.listeners.set(channel, listener)
    }
  )
  ipcHarness.removeHandler.mockImplementation((channel: string) => {
    ipcHarness.handlers.delete(channel)
  })
  ipcHarness.removeListener.mockImplementation(
    (channel: string, listener: (event: { sender: { id: number }; returnValue?: unknown }) => void) => {
      if (ipcHarness.listeners.get(channel) === listener) ipcHarness.listeners.delete(channel)
    }
  )
})

function createSettingsStore(settings: AppSettings = DEFAULT_APP_SETTINGS): Pick<
  SettingsStore,
  'load' | 'update'
> & {
  update: ReturnType<typeof vi.fn>
} {
  let current = settings
  return {
    load: vi.fn(async () => current),
    update: vi.fn(async (mutator: (value: AppSettings) => AppSettings) => {
      current = mutator(current)
      return current
    })
  }
}

function createWindowManager(kind: WindowKind = 'pet'): Pick<
  WindowManager,
  'getWindowKind' | 'showPet' | 'hidePet' | 'openSettings'
> {
  return {
    getWindowKind: vi.fn(() => kind),
    showPet: vi.fn(async () => undefined),
    hidePet: vi.fn(),
    openSettings: vi.fn(async () => undefined)
  }
}

function getHandler(channel: string): (event: { sender: { id: number } }, ...args: unknown[]) => unknown {
  const handler = ipcHarness.handlers.get(channel)
  if (!handler) throw new Error(`Expected handler for ${channel}`)
  return handler
}

describe('registerFoundationIpc', () => {
  it('validates senders before reading settings or opening settings', async () => {
    const settingsStore = createSettingsStore()
    const windowManager = createWindowManager()
    vi.mocked(windowManager.getWindowKind).mockImplementation(() => {
      throw new Error('Unrecognized renderer sender')
    })
    registerFoundationIpc({ settingsStore, windowManager })

    expect(() => getHandler(IPC_CHANNELS.getSettings)({ sender: { id: 9 } })).toThrow(
      'Unrecognized renderer sender'
    )
    await expect(getHandler(IPC_CHANNELS.openSettings)({ sender: { id: 9 } })).rejects.toThrow(
      'Unrecognized renderer sender'
    )

    expect(settingsStore.load).not.toHaveBeenCalled()
    expect(windowManager.openSettings).not.toHaveBeenCalled()
  })

  it('requires a boolean and persists visibility before changing the pet window', async () => {
    const settingsStore = createSettingsStore()
    const windowManager = createWindowManager()
    registerFoundationIpc({ settingsStore, windowManager })

    await expect(getHandler(IPC_CHANNELS.setPetVisibility)({ sender: { id: 9 } }, 'yes')).rejects.toThrow(
      'visible must be a boolean'
    )
    expect(settingsStore.update).not.toHaveBeenCalled()

    settingsStore.update.mockRejectedValueOnce(new Error('save failed'))
    await expect(getHandler(IPC_CHANNELS.setPetVisibility)({ sender: { id: 9 } }, false)).rejects.toThrow(
      'save failed'
    )
    expect(windowManager.hidePet).not.toHaveBeenCalled()

    const settings = await getHandler(IPC_CHANNELS.setPetVisibility)({ sender: { id: 9 } }, false)
    expect(settings).toMatchObject({ petWindow: { visible: false } })
    expect(windowManager.hidePet).toHaveBeenCalledOnce()
  })

  it('returns the owned window kind synchronously and removes only its registrations', () => {
    const settingsStore = createSettingsStore()
    const windowManager = createWindowManager('settings')
    const cleanup = registerFoundationIpc({ settingsStore, windowManager })
    const event: { sender: { id: number }; returnValue?: unknown } = { sender: { id: 9 } }

    ipcHarness.listeners.get(IPC_CHANNELS.getWindowKind)?.(event)
    expect(event.returnValue).toBe('settings')

    cleanup()

    expect(ipcHarness.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.getSettings)
    expect(ipcHarness.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.setPetVisibility)
    expect(ipcHarness.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.openSettings)
    expect(ipcHarness.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.getWindowKind,
      expect.any(Function)
    )
  })

  it('rolls back handlers registered before a later handler registration fails', () => {
    const settingsStore = createSettingsStore()
    const windowManager = createWindowManager()
    ipcHarness.handle.mockImplementation(
      (
        channel: string,
        handler: (event: { sender: { id: number } }, ...args: unknown[]) => unknown
      ) => {
        if (channel === IPC_CHANNELS.openSettings) throw new Error('open settings registration failed')
        ipcHarness.handlers.set(channel, handler)
      }
    )

    expect(() => registerFoundationIpc({ settingsStore, windowManager })).toThrow(
      'open settings registration failed'
    )
    expect(ipcHarness.handlers).toEqual(new Map())
    expect(ipcHarness.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.getSettings)
    expect(ipcHarness.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.setPetVisibility)
    expect(ipcHarness.removeHandler).not.toHaveBeenCalledWith(IPC_CHANNELS.openSettings)
    expect(ipcHarness.removeListener).not.toHaveBeenCalled()
  })

  it('rolls back all handlers when the synchronous listener registration fails', () => {
    const settingsStore = createSettingsStore()
    const windowManager = createWindowManager()
    ipcHarness.on.mockImplementation(() => {
      throw new Error('window kind registration failed')
    })

    expect(() => registerFoundationIpc({ settingsStore, windowManager })).toThrow(
      'window kind registration failed'
    )
    expect(ipcHarness.handlers).toEqual(new Map())
    expect(ipcHarness.removeHandler).toHaveBeenCalledTimes(3)
    expect(ipcHarness.removeListener).not.toHaveBeenCalled()
  })

  it('does not remove replacement registrations when cleanup is called twice', () => {
    const cleanup = registerFoundationIpc({
      settingsStore: createSettingsStore(),
      windowManager: createWindowManager()
    })
    cleanup()
    const replacementHandler = vi.fn()
    const replacementListener = vi.fn()
    ipcHarness.handlers.set(IPC_CHANNELS.getSettings, replacementHandler)
    ipcHarness.listeners.set(IPC_CHANNELS.getWindowKind, replacementListener)

    cleanup()

    expect(ipcHarness.handlers.get(IPC_CHANNELS.getSettings)).toBe(replacementHandler)
    expect(ipcHarness.listeners.get(IPC_CHANNELS.getWindowKind)).toBe(replacementListener)
    expect(ipcHarness.removeHandler).toHaveBeenCalledTimes(3)
    expect(ipcHarness.removeListener).toHaveBeenCalledTimes(1)
  })
})
