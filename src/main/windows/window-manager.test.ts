import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../shared/contracts'
import type { Rect } from './display-placement'
import { WindowManager } from './window-manager'

interface FakeDisplay {
  readonly id: number
  readonly bounds: Rect
  readonly workArea: Rect
}

interface FakeScreen {
  emit(eventName: string, ...args: unknown[]): boolean
  listenerCount(eventName: string): number
}

interface FakeWebContents {
  readonly id: number
  windowOpenHandler: (() => { action: 'deny' }) | undefined
  isDestroyed(): boolean
}

interface FakeBrowserWindow {
  readonly webContents: FakeWebContents
  readonly options: unknown
  bounds: Rect
  visible: boolean
  focused: boolean
  ready: boolean
  loadedUrl: string | null
  getBounds(): Rect
  getPosition(): [number, number]
  setBounds(bounds: Rect): void
  moveTo(x: number, y: number): void
  resizeTo(width: number, height: number): void
  listenerCount(eventName: string): number
  isDestroyed(): boolean
  signalReady(): void
  finishLoading(): void
  failLoading(error: Error): void
  close(): void
  destroy(): void
}

const windowHarness = vi.hoisted(() => ({
  windows: [] as FakeBrowserWindow[],
  nextWebContentsId: 100,
  displays: [] as FakeDisplay[],
  primaryDisplayId: 1,
  screen: undefined as FakeScreen | undefined
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
    bounds: Rect
    private destroyed = false
    private finishLoad: { resolve: () => void; reject: (error: Error) => void } | undefined

    constructor(options: unknown) {
      super()
      this.options = options
      const { width = 0, height = 0 } = options as { width?: number; height?: number }
      this.bounds = { x: 0, y: 0, width, height }
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

    getBounds(): Rect {
      return { ...this.bounds }
    }

    getPosition(): [number, number] {
      return [this.bounds.x, this.bounds.y]
    }

    setBounds(bounds: Rect): void {
      this.bounds = { ...bounds }
    }

    moveTo(x: number, y: number): void {
      this.bounds = { ...this.bounds, x, y }
      this.emit('moved')
    }

    resizeTo(width: number, height: number): void {
      this.bounds = { ...this.bounds, width, height }
      this.emit('resized')
    }

    destroy(): void {
      if (this.destroyed) return
      this.destroyed = true
      this.webContents.destroy()
      this.emit('closed')
    }

    close(): void {
      let defaultPrevented = false
      this.emit('close', {
        preventDefault: () => {
          defaultPrevented = true
        }
      })
      if (!defaultPrevented) this.destroy()
    }

    loadURL(url: string): Promise<void> {
      this.loadedUrl = url
      return new Promise((resolve, reject) => {
        this.finishLoad = { resolve, reject }
      })
    }

    signalReady(): void {
      this.ready = true
      this.emit('ready-to-show')
    }

    finishLoading(): void {
      this.finishLoad?.resolve()
      this.finishLoad = undefined
    }

    failLoading(error: Error): void {
      this.finishLoad?.reject(error)
      this.finishLoad = undefined
    }
  }

  const testScreen = new EventEmitter() as InstanceType<typeof EventEmitter> & {
    getAllDisplays(): readonly FakeDisplay[]
    getPrimaryDisplay(): FakeDisplay
    getDisplayNearestPoint(point: { x: number; y: number }): FakeDisplay
  }
  testScreen.getAllDisplays = () => windowHarness.displays
  testScreen.getPrimaryDisplay = () => {
    const primary = windowHarness.displays.find(
      (display) => display.id === windowHarness.primaryDisplayId
    )
    if (!primary) throw new Error('Expected a primary display fixture')
    return primary
  }
  testScreen.getDisplayNearestPoint = (point: { x: number; y: number }) =>
    windowHarness.displays.find(
      (display) =>
        point.x >= display.bounds.x &&
        point.x < display.bounds.x + display.bounds.width &&
        point.y >= display.bounds.y &&
        point.y < display.bounds.y + display.bounds.height
    ) ?? testScreen.getPrimaryDisplay()
  windowHarness.screen = testScreen

  return { BrowserWindow: TestBrowserWindow, screen: testScreen }
})

const managers: WindowManager[] = []

class FakeSettingsStore {
  settings: AppSettings

  constructor(petWindow: Partial<AppSettings['petWindow']> = {}) {
    this.settings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, ...petWindow }
    }
  }

  async load(): Promise<AppSettings> {
    return this.settings
  }

  async update(mutator: (current: AppSettings) => AppSettings): Promise<AppSettings> {
    this.settings = mutator(this.settings)
    return this.settings
  }
}

class FailingOnceSettingsStore extends FakeSettingsStore {
  private shouldFail = true

  override async load(): Promise<AppSettings> {
    if (this.shouldFail) {
      this.shouldFail = false
      throw new Error('settings load failed')
    }
    return super.load()
  }
}

function createManager(
  settingsStore = new FakeSettingsStore(),
  isPackaged = false
): WindowManager {
  const manager = new WindowManager({
    settingsStore,
    preloadPath: '/app/out/preload/index.js',
    rendererRoot: '/app/out/renderer',
    isPackaged
  })
  managers.push(manager)
  return manager
}

function getWindow(index: number): FakeBrowserWindow {
  const window = windowHarness.windows[index]
  if (!window) throw new Error(`Expected window at index ${index}`)
  return window
}

async function finishWindowLoading(window: FakeBrowserWindow): Promise<void> {
  await vi.waitFor(() => expect(window.loadedUrl).not.toBeNull())
  window.finishLoading()
}

async function openPet(manager: WindowManager): Promise<FakeBrowserWindow> {
  const opening = manager.showPet()
  const petWindow = getWindow(windowHarness.windows.length - 1)
  await finishWindowLoading(petWindow)
  petWindow.signalReady()
  await opening
  return petWindow
}

beforeEach(() => {
  vi.stubEnv('ELECTRON_RENDERER_URL', '')
  windowHarness.displays = [
    {
      id: 2,
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: -1920, y: 0, width: 1920, height: 1040 }
    },
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    }
  ]
  windowHarness.primaryDisplayId = 1
})

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose()
  windowHarness.windows.length = 0
  windowHarness.nextWebContentsId = 100
  windowHarness.displays = []
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('WindowManager', () => {
  it('uses the development renderer URL only when explicitly unpackaged', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')

    const petWindow = await openPet(createManager(new FakeSettingsStore(), false))

    expect(petWindow.loadedUrl).toBe('http://localhost:5173?window=pet')
  })

  it('ignores an inherited development renderer URL when packaged', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'https://untrusted.example')

    const petWindow = await openPet(createManager(new FakeSettingsStore(), true))

    expect(petWindow.loadedUrl).toBe('app://renderer/index.html?window=pet')
  })

  it('does not undo a hide request when the pet window later becomes ready', async () => {
    const manager = createManager()
    const opening = manager.showPet()
    const petWindow = getWindow(0)

    manager.hidePet()
    petWindow.signalReady()

    expect(petWindow.visible).toBe(false)
    await finishWindowLoading(petWindow)
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
    await vi.waitFor(() => expect(petWindow.visible).toBe(true))
    await finishWindowLoading(petWindow)
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
    await finishWindowLoading(settingsWindow)
    await Promise.all([firstOpening, secondOpening])
  })

  it('destroys a settings window whose navigation failed so a later open can retry', async () => {
    const manager = createManager()
    const firstOpening = manager.openSettings()
    const failedWindow = getWindow(0)

    failedWindow.failLoading(new Error('settings navigation failed'))
    await expect(firstOpening).rejects.toThrow('settings navigation failed')
    expect(failedWindow.isDestroyed()).toBe(true)

    const retry = manager.openSettings()
    const replacementWindow = getWindow(1)
    replacementWindow.signalReady()
    await finishWindowLoading(replacementWindow)
    await retry

    expect(windowHarness.windows).toHaveLength(2)
    expect(replacementWindow.visible).toBe(true)
    expect(replacementWindow.focused).toBe(true)
  })

  it('shows an already-ready pet singleton only after a new show request', async () => {
    const manager = createManager()
    const opening = manager.showPet()
    const petWindow = getWindow(0)
    petWindow.signalReady()
    await finishWindowLoading(petWindow)
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
    await finishWindowLoading(petWindow)
    await petOpening

    const settingsOpening = manager.openSettings()
    const settingsWindow = getWindow(1)
    settingsWindow.signalReady()
    await finishWindowLoading(settingsWindow)
    await settingsOpening

    expect(manager.getWindowKind(petWindow.webContents.id)).toBe('pet')
    expect(manager.getWindowKind(settingsWindow.webContents.id)).toBe('settings')
    expect(() => manager.getWindowKind(999)).toThrow('Unrecognized renderer sender')

    settingsWindow.destroy()
    expect(() => manager.getWindowKind(settingsWindow.webContents.id)).toThrow(
      'Unrecognized renderer sender'
    )
  })

  it('prevents an ordinary pet close without hiding it but closes the settings window', async () => {
    const manager = createManager()
    const petWindow = await openPet(manager)
    const settingsOpening = manager.openSettings()
    const settingsWindow = getWindow(1)
    settingsWindow.signalReady()
    await finishWindowLoading(settingsWindow)
    await settingsOpening

    petWindow.close()
    expect(petWindow.isDestroyed()).toBe(false)
    expect(petWindow.visible).toBe(true)

    settingsWindow.close()
    expect(settingsWindow.isDestroyed()).toBe(true)
    expect(petWindow.isDestroyed()).toBe(false)
  })

  it('destroys the owned pet window during manager disposal', async () => {
    const manager = createManager()
    const petWindow = await openPet(manager)

    manager.dispose()

    expect(petWindow.isDestroyed()).toBe(true)
  })

  it('does not recreate windows after disposal', async () => {
    const manager = createManager()

    manager.dispose()
    await manager.showPet()
    await manager.openSettings()

    expect(windowHarness.windows).toHaveLength(0)
  })

  it('clamps saved bounds before making a ready pet window visible', async () => {
    const manager = createManager(
      new FakeSettingsStore({ x: -2200, y: 1000, displayId: '2' })
    )
    const opening = manager.showPet()
    const petWindow = getWindow(0)

    petWindow.signalReady()
    expect(petWindow.visible).toBe(false)
    await Promise.resolve()

    expect(petWindow.bounds).toEqual({ x: -1912, y: 712, width: 320, height: 320 })
    await vi.waitFor(() => expect(petWindow.visible).toBe(true))
    await finishWindowLoading(petWindow)
    await opening
  })

  it('debounces moved and resized persistence for 250 ms and saves the nearest display', async () => {
    const settingsStore = new FakeSettingsStore()
    const petWindow = await openPet(createManager(settingsStore))
    vi.useFakeTimers()

    petWindow.moveTo(-600, 200)
    await vi.advanceTimersByTimeAsync(200)
    petWindow.resizeTo(320, 320)
    await vi.advanceTimersByTimeAsync(249)
    expect(settingsStore.settings.petWindow).toMatchObject({
      x: null,
      y: null,
      displayId: null
    })

    await vi.advanceTimersByTimeAsync(1)
    expect(settingsStore.settings.petWindow).toMatchObject({ x: -600, y: 200, displayId: '2' })
  })

  it('consumes rejected placement persistence and keeps the live pet window safe', async () => {
    const settingsStore = new FakeSettingsStore()
    const petWindow = await openPet(createManager(settingsStore))
    let rejectUpdate!: (error: unknown) => void
    const failedUpdate = new Promise<AppSettings>((_resolve, reject) => {
      rejectUpdate = reject
    })
    const consumeRejection = vi.spyOn(failedUpdate, 'catch')
    const update = vi.spyOn(settingsStore, 'update').mockReturnValueOnce(failedUpdate)
    vi.useFakeTimers()

    petWindow.moveTo(240, 180)
    await vi.advanceTimersByTimeAsync(250)
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(consumeRejection).toHaveBeenCalledOnce()
    const consumedUpdate = consumeRejection.mock.results[0]?.value
    if (!(consumedUpdate instanceof Promise)) throw new Error('Expected a consumed update')
    rejectUpdate(new Error('save failed'))
    await expect(consumedUpdate).resolves.toBeUndefined()

    expect(petWindow.isDestroyed()).toBe(false)
    expect(petWindow.bounds).toEqual({ x: 240, y: 180, width: 320, height: 320 })
    expect(settingsStore.settings.petWindow).toMatchObject({ x: null, y: null, displayId: null })
  })

  it('re-clamps immediately to the primary display when a display is removed', async () => {
    const settingsStore = new FakeSettingsStore({ x: -500, y: 100, displayId: '2' })
    const petWindow = await openPet(createManager(settingsStore))

    windowHarness.displays = [windowHarness.displays[1]!]
    windowHarness.screen?.emit('display-removed', {}, { id: 2 })

    expect(petWindow.bounds).toEqual({ x: 8, y: 100, width: 320, height: 320 })
  })

  it('re-clamps immediately when display metrics change', async () => {
    const settingsStore = new FakeSettingsStore({ x: 1500, y: 700, displayId: '1' })
    const petWindow = await openPet(createManager(settingsStore))
    const leftDisplay = windowHarness.displays[0]!
    const primaryDisplay = windowHarness.displays[1]!
    windowHarness.displays = [
      leftDisplay,
      {
        ...primaryDisplay,
        bounds: { x: 0, y: 0, width: 800, height: 640 },
        workArea: { x: 0, y: 0, width: 800, height: 600 }
      }
    ]

    windowHarness.screen?.emit('display-metrics-changed', {}, windowHarness.displays[1], [
      'bounds',
      'workArea'
    ])

    expect(petWindow.bounds).toEqual({ x: 472, y: 272, width: 320, height: 320 })
  })

  it('cancels pending persistence and removes display and window listeners on disposal', async () => {
    const settingsStore = new FakeSettingsStore()
    const manager = createManager(settingsStore)
    const petWindow = await openPet(manager)
    vi.useFakeTimers()

    petWindow.moveTo(200, 200)
    expect(petWindow.listenerCount('moved')).toBe(1)
    expect(petWindow.listenerCount('resized')).toBe(1)
    expect(windowHarness.screen?.listenerCount('display-removed')).toBe(1)
    expect(windowHarness.screen?.listenerCount('display-metrics-changed')).toBe(1)

    manager.dispose()
    await vi.advanceTimersByTimeAsync(250)

    expect(settingsStore.settings.petWindow.x).toBeNull()
    expect(petWindow.listenerCount('moved')).toBe(0)
    expect(petWindow.listenerCount('resized')).toBe(0)
    expect(windowHarness.screen?.listenerCount('display-removed')).toBe(0)
    expect(windowHarness.screen?.listenerCount('display-metrics-changed')).toBe(0)
  })

  it('destroys a pet whose settings load failed so a later show can retry', async () => {
    const manager = createManager(new FailingOnceSettingsStore())

    await expect(manager.showPet()).rejects.toThrow('settings load failed')
    expect(getWindow(0).isDestroyed()).toBe(true)

    const retry = manager.showPet()
    expect(windowHarness.windows).toHaveLength(2)
    const petWindow = getWindow(1)
    await finishWindowLoading(petWindow)
    petWindow.signalReady()
    await retry

    expect(petWindow.visible).toBe(true)
  })

  it('destroys a pet whose placement failed so a later show can retry', async () => {
    const manager = createManager()
    const availableDisplays = windowHarness.displays
    windowHarness.displays = []

    await expect(manager.showPet()).rejects.toThrow('Expected a primary display fixture')
    expect(getWindow(0).isDestroyed()).toBe(true)

    windowHarness.displays = availableDisplays
    const retry = manager.showPet()
    expect(windowHarness.windows).toHaveLength(2)
    const petWindow = getWindow(1)
    await finishWindowLoading(petWindow)
    petWindow.signalReady()
    await retry

    expect(petWindow.visible).toBe(true)
  })

  it('restores the intended pet size after a compact display grows', async () => {
    const leftDisplay = windowHarness.displays[0]!
    const primaryDisplay = windowHarness.displays[1]!
    windowHarness.displays = [
      leftDisplay,
      {
        ...primaryDisplay,
        bounds: { x: 0, y: 0, width: 200, height: 200 },
        workArea: { x: 0, y: 0, width: 200, height: 180 }
      }
    ]
    const petWindow = await openPet(createManager())
    expect(petWindow.bounds).toEqual({ x: 8, y: 8, width: 184, height: 164 })

    windowHarness.displays = [leftDisplay, primaryDisplay]
    windowHarness.screen?.emit('display-metrics-changed', {}, primaryDisplay, [
      'bounds',
      'workArea'
    ])

    expect(petWindow.bounds).toEqual({ x: 8, y: 8, width: 320, height: 320 })
  })
})
