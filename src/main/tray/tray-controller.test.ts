import type { MenuItemConstructorOptions } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../shared/contracts'
import type { SettingsStore } from '../settings/settings-store'
import type { WindowManager } from '../windows/window-manager'
import { TrayController } from './tray-controller'

interface FakeMenu {
  readonly template: readonly MenuItemConstructorOptions[]
}

interface FakeTray {
  contextMenu: FakeMenu | null
  destroyed: boolean
  tooltip: string | null
  emit(eventName: string): boolean
  listenerCount(eventName: string): number
}

const trayHarness = vi.hoisted(() => ({
  trays: [] as FakeTray[],
  createFromDataURL: vi.fn(),
  setTemplateImage: vi.fn(),
  buildFromTemplate: vi.fn()
}))

vi.mock('electron', async () => {
  const { EventEmitter: TestEventEmitter } = await import('node:events')

  class TestTray extends TestEventEmitter implements FakeTray {
    contextMenu: FakeMenu | null = null
    destroyed = false
    tooltip: string | null = null

    constructor() {
      super()
      trayHarness.trays.push(this)
    }

    setContextMenu(menu: FakeMenu): void {
      this.contextMenu = menu
    }

    setToolTip(tooltip: string): void {
      this.tooltip = tooltip
    }

    isDestroyed(): boolean {
      return this.destroyed
    }

    destroy(): void {
      this.destroyed = true
    }
  }

  return {
    Menu: { buildFromTemplate: trayHarness.buildFromTemplate },
    Tray: TestTray,
    nativeImage: { createFromDataURL: trayHarness.createFromDataURL }
  }
})

class FakeSettingsStore {
  settings: AppSettings
  readonly events: string[]

  constructor(events: string[], visible: boolean) {
    this.events = events
    this.settings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, visible }
    }
  }

  async update(mutator: (current: AppSettings) => AppSettings): Promise<AppSettings> {
    this.events.push('persist')
    this.settings = mutator(this.settings)
    return this.settings
  }
}

function createDependencies(visible = true): {
  events: string[]
  settingsStore: Pick<SettingsStore, 'update'> & FakeSettingsStore
  windowManager: Pick<WindowManager, 'hidePet' | 'showPet' | 'openSettings'>
  requestQuit: ReturnType<typeof vi.fn<() => void>>
} {
  const events: string[] = []
  return {
    events,
    settingsStore: new FakeSettingsStore(events, visible),
    windowManager: {
      hidePet: vi.fn(() => events.push('hide')),
      showPet: vi.fn(async () => {
        events.push('show')
      }),
      openSettings: vi.fn(async () => undefined)
    },
    requestQuit: vi.fn<() => void>()
  }
}

function getTray(index = 0): FakeTray {
  const tray = trayHarness.trays[index]
  if (!tray) throw new Error(`Expected tray at index ${index}`)
  return tray
}

function getMenuItem(tray: FakeTray, index: number): MenuItemConstructorOptions {
  const item = tray.contextMenu?.template[index]
  if (!item) throw new Error(`Expected menu item at index ${index}`)
  return item
}

function clickMenuItem(tray: FakeTray, index: number): void {
  const click = getMenuItem(tray, index).click as (() => void) | undefined
  click?.()
}

beforeEach(() => {
  trayHarness.trays.length = 0
  trayHarness.createFromDataURL.mockReset()
  trayHarness.setTemplateImage.mockReset()
  trayHarness.createFromDataURL.mockReturnValue({
    setTemplateImage: trayHarness.setTemplateImage
  })
  trayHarness.buildFromTemplate.mockReset()
  trayHarness.buildFromTemplate.mockImplementation(
    (template: readonly MenuItemConstructorOptions[]) => ({ template })
  )
})

describe('TrayController', () => {
  it('creates one tray and rebuilds its Chinese menu from persisted visibility', () => {
    const dependencies = createDependencies()
    const controller = new TrayController({ ...dependencies, platform: 'win32' })

    controller.create()
    controller.create()
    controller.refresh(dependencies.settingsStore.settings)

    expect(trayHarness.trays).toHaveLength(1)
    expect(getTray().tooltip).toBe('Dear Companion')
    expect(getTray().contextMenu?.template.map((item) => item.label ?? item.type)).toEqual([
      '隐藏宠物',
      '设置…',
      'separator',
      '退出 Dear Companion'
    ])

    controller.refresh({
      ...dependencies.settingsStore.settings,
      petWindow: { ...dependencies.settingsStore.settings.petWindow, visible: false }
    })
    expect(getMenuItem(getTray(), 0).label).toBe('显示宠物')
  })

  it('persists a menu visibility change before changing the window', async () => {
    const dependencies = createDependencies(true)
    const controller = new TrayController({ ...dependencies, platform: 'win32' })
    controller.create()
    controller.refresh(dependencies.settingsStore.settings)

    clickMenuItem(getTray(), 0)
    await vi.waitFor(() => expect(dependencies.windowManager.hidePet).toHaveBeenCalledOnce())

    expect(dependencies.events).toEqual(['persist', 'hide'])
    expect(dependencies.settingsStore.settings.petWindow.visible).toBe(false)
    expect(getMenuItem(getTray(), 0).label).toBe('显示宠物')
  })

  it('does not change the window when persisting visibility fails', async () => {
    const dependencies = createDependencies(true)
    vi.spyOn(dependencies.settingsStore, 'update').mockRejectedValueOnce(new Error('save failed'))
    const controller = new TrayController({ ...dependencies, platform: 'win32' })
    controller.create()
    controller.refresh(dependencies.settingsStore.settings)

    clickMenuItem(getTray(), 0)
    await vi.waitFor(() => expect(dependencies.settingsStore.update).toHaveBeenCalledOnce())

    expect(dependencies.windowManager.hidePet).not.toHaveBeenCalled()
    expect(getMenuItem(getTray(), 0).label).toBe('隐藏宠物')
  })

  it('does not finish a pending visibility action after disposal', async () => {
    const dependencies = createDependencies(true)
    let resolveUpdate: ((settings: AppSettings) => void) | undefined
    vi.spyOn(dependencies.settingsStore, 'update').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve
        })
    )
    const controller = new TrayController({ ...dependencies, platform: 'win32' })
    controller.create()
    controller.refresh(dependencies.settingsStore.settings)

    clickMenuItem(getTray(), 0)
    await vi.waitFor(() => expect(dependencies.settingsStore.update).toHaveBeenCalledOnce())
    controller.dispose()
    resolveUpdate?.({
      ...dependencies.settingsStore.settings,
      petWindow: { ...dependencies.settingsStore.settings.petWindow, visible: false }
    })
    await Promise.resolve()

    expect(dependencies.windowManager.hidePet).not.toHaveBeenCalled()
  })

  it('shows and persists the pet on Windows click while macOS uses its assigned menu', async () => {
    const windowsDependencies = createDependencies(false)
    const windowsController = new TrayController({
      ...windowsDependencies,
      platform: 'win32'
    })
    windowsController.create()
    getTray(0).emit('click')
    await vi.waitFor(() => expect(windowsDependencies.windowManager.showPet).toHaveBeenCalledOnce())
    expect(windowsDependencies.events).toEqual(['persist', 'show'])

    const macDependencies = createDependencies(false)
    const macController = new TrayController({ ...macDependencies, platform: 'darwin' })
    macController.create()
    macController.refresh(macDependencies.settingsStore.settings)
    getTray(1).emit('click')

    expect(getTray(1).contextMenu).not.toBeNull()
    expect(getTray(1).listenerCount('click')).toBe(0)
    expect(macDependencies.settingsStore.settings.petWindow.visible).toBe(false)
    expect(trayHarness.setTemplateImage).toHaveBeenCalledWith(true)
  })

  it('opens settings, requests quit, and disposes its owned tray', async () => {
    const dependencies = createDependencies()
    const controller = new TrayController({ ...dependencies, platform: 'win32' })
    controller.create()
    controller.refresh(dependencies.settingsStore.settings)

    clickMenuItem(getTray(), 1)
    await vi.waitFor(() => expect(dependencies.windowManager.openSettings).toHaveBeenCalledOnce())
    clickMenuItem(getTray(), 3)
    expect(dependencies.requestQuit).toHaveBeenCalledOnce()

    const tray = getTray()
    expect(tray.listenerCount('click')).toBe(1)
    controller.dispose()
    expect(tray.listenerCount('click')).toBe(0)
    expect(tray.destroyed).toBe(true)
  })
})
