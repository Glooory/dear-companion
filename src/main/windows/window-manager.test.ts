import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsStore } from '../settings/settings-store'
import { WindowManager } from './window-manager'

interface FakeWebContents {
  readonly id: number
  windowOpenHandler: (() => { action: 'deny' }) | undefined
  isDestroyed(): boolean
}

interface FakeBrowserWindow {
  readonly webContents: FakeWebContents
  readonly options: unknown
  visible: boolean
  focused: boolean
  ready: boolean
  loadedUrl: string | null
  signalReady(): void
  finishLoading(): void
  destroy(): void
}

const windowHarness = vi.hoisted(() => ({
  windows: [] as FakeBrowserWindow[],
  nextWebContentsId: 100
}))

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')

  class TestWebContents extends EventEmitter {
    readonly id: number
    windowOpenHandler: (() => { action: 'deny' }) | undefined
    private destroyed = false

    constructor(id: number) {
      super()
      this.id = id
    }

    setWindowOpenHandler(handler: () => { action: 'deny' }): void {
      this.windowOpenHandler = handler
    }

    isDestroyed(): boolean {
      return this.destroyed
    }

    destroy(): void {
      this.destroyed = true
    }
  }

  class TestBrowserWindow extends EventEmitter implements FakeBrowserWindow {
    readonly webContents: TestWebContents
    readonly options: unknown
    visible = false
    focused = false
    ready = false
    loadedUrl: string | null = null
    private destroyed = false
    private finishLoad: (() => void) | undefined

    constructor(options: unknown) {
      super()
      this.options = options
      this.webContents = new TestWebContents(windowHarness.nextWebContentsId++)
      windowHarness.windows.push(this)
    }

    show(): void {
      this.visible = true
    }

    hide(): void {
      this.visible = false
    }

    focus(): void {
      this.focused = true
    }

    isDestroyed(): boolean {
      return this.destroyed
    }

    destroy(): void {
      if (this.destroyed) return
      this.destroyed = true
      this.webContents.destroy()
      this.emit('closed')
    }

    loadURL(url: string): Promise<void> {
      this.loadedUrl = url
      return new Promise((resolve) => {
        this.finishLoad = resolve
      })
    }

    signalReady(): void {
      this.ready = true
      this.emit('ready-to-show')
    }

    finishLoading(): void {
      this.finishLoad?.()
      this.finishLoad = undefined
    }
  }

  return { BrowserWindow: TestBrowserWindow }
})

const managers: WindowManager[] = []

function createManager(): WindowManager {
  const manager = new WindowManager({
    settingsStore: new SettingsStore('/unused-in-window-manager-tests'),
    preloadPath: '/app/out/preload/index.js',
    rendererRoot: '/app/out/renderer'
  })
  managers.push(manager)
  return manager
}

function getWindow(index: number): FakeBrowserWindow {
  const window = windowHarness.windows[index]
  if (!window) throw new Error(`Expected window at index ${index}`)
  return window
}

beforeEach(() => {
  vi.stubEnv('ELECTRON_RENDERER_URL', '')
})

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose()
  windowHarness.windows.length = 0
  windowHarness.nextWebContentsId = 100
  vi.unstubAllEnvs()
})

describe('WindowManager', () => {
  it('does not undo a hide request when the pet window later becomes ready', async () => {
    const manager = createManager()
    const opening = manager.showPet()
    const petWindow = getWindow(0)

    manager.hidePet()
    petWindow.signalReady()

    expect(petWindow.visible).toBe(false)
    petWindow.finishLoading()
    await opening
  })

  it('keeps concurrent pet show requests on one hidden window until it is ready', async () => {
    const manager = createManager()
    const firstOpening = manager.showPet()
    const secondOpening = manager.showPet()
    const petWindow = getWindow(0)

    expect(windowHarness.windows).toHaveLength(1)
    expect(petWindow.visible).toBe(false)

    petWindow.signalReady()
    expect(petWindow.visible).toBe(true)
    petWindow.finishLoading()
    await Promise.all([firstOpening, secondOpening])
  })

  it('keeps concurrent settings requests on one hidden window until it is ready', async () => {
    const manager = createManager()
    const firstOpening = manager.openSettings()
    const secondOpening = manager.openSettings()
    const settingsWindow = getWindow(0)

    expect(windowHarness.windows).toHaveLength(1)
    expect(settingsWindow.visible).toBe(false)
    expect(settingsWindow.focused).toBe(false)

    settingsWindow.signalReady()
    expect(settingsWindow.visible).toBe(true)
    expect(settingsWindow.focused).toBe(true)
    settingsWindow.finishLoading()
    await Promise.all([firstOpening, secondOpening])
  })

  it('shows an already-ready pet singleton only after a new show request', async () => {
    const manager = createManager()
    const opening = manager.showPet()
    const petWindow = getWindow(0)
    petWindow.signalReady()
    petWindow.finishLoading()
    await opening

    manager.hidePet()
    expect(petWindow.visible).toBe(false)

    await manager.showPet()
    expect(windowHarness.windows).toHaveLength(1)
    expect(petWindow.visible).toBe(true)
  })

  it('maps only currently owned live webContents IDs to window kinds', async () => {
    const manager = createManager()
    const petOpening = manager.showPet()
    const petWindow = getWindow(0)
    petWindow.signalReady()
    petWindow.finishLoading()
    await petOpening

    const settingsOpening = manager.openSettings()
    const settingsWindow = getWindow(1)
    settingsWindow.signalReady()
    settingsWindow.finishLoading()
    await settingsOpening

    expect(manager.getWindowKind(petWindow.webContents.id)).toBe('pet')
    expect(manager.getWindowKind(settingsWindow.webContents.id)).toBe('settings')
    expect(() => manager.getWindowKind(999)).toThrow('Unrecognized renderer sender')

    settingsWindow.destroy()
    expect(() => manager.getWindowKind(settingsWindow.webContents.id)).toThrow(
      'Unrecognized renderer sender'
    )
  })
})
