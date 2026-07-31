import { BrowserWindow, screen, type Event as ElectronEvent } from 'electron'
import type { WindowKind } from '../../shared/contracts'
import type { SettingsStore } from '../settings/settings-store'
import {
  resolvePetWindowBounds,
  type DisplaySnapshot,
  type Point,
  type Rect
} from './display-placement'
import { createPetWindowOptions, createSettingsWindowOptions } from './window-options'

type WindowSettingsStore = Pick<SettingsStore, 'load' | 'update'>

interface WindowManagerOptions {
  settingsStore: WindowSettingsStore
  preloadPath: string
  rendererRoot: string
}

export class WindowManager {
  private petWindow: BrowserWindow | null = null
  private settingsWindow: BrowserWindow | null = null
  private petWindowReady = false
  private petWindowPlaced = false
  private petVisibilityRequested = false
  private settingsWindowReady = false
  private readonly settingsStore: WindowSettingsStore
  private readonly preloadPath: string
  private readonly windowListenerDisposers = new Map<BrowserWindow, Array<() => void>>()

  constructor({ settingsStore, preloadPath }: WindowManagerOptions) {
    this.settingsStore = settingsStore
    this.preloadPath = preloadPath
  }

  async showPet(): Promise<void> {
    this.petVisibilityRequested = true
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      if (this.petWindowReady && this.petWindowPlaced) this.petWindow.show()
      return
    }

    const petWindow = new BrowserWindow(createPetWindowOptions(this.preloadPath))
    this.petWindow = petWindow
    this.petWindowReady = false
    this.petWindowPlaced = false
    this.secureWindow(petWindow)

    const showWhenReady = (): void => {
      if (this.petWindow !== petWindow || petWindow.isDestroyed()) return
      this.petWindowReady = true
      if (this.petWindowPlaced && this.petVisibilityRequested) petWindow.show()
    }
    petWindow.once('ready-to-show', showWhenReady)
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener('ready-to-show', showWhenReady)
    })

    const hideInsteadOfClose = (event: ElectronEvent): void => {
      event.preventDefault()
      if (this.petWindow === petWindow) this.petVisibilityRequested = false
      petWindow.hide()
    }
    petWindow.on('close', hideInsteadOfClose)
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener('close', hideInsteadOfClose)
    })

    const clearPetWindow = (): void => {
      if (this.petWindow === petWindow) {
        this.petWindow = null
        this.petWindowReady = false
        this.petWindowPlaced = false
        this.petVisibilityRequested = false
      }
      this.releaseWindowListeners(petWindow)
    }
    petWindow.once('closed', clearPetWindow)
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener('closed', clearPetWindow)
    })

    const placementCompleted = await this.initializePetPlacement(petWindow)
    if (!placementCompleted) return
    this.petWindowPlaced = true
    if (this.petWindowReady && this.petVisibilityRequested) petWindow.show()

    await petWindow.loadURL(this.rendererUrl('pet'))
  }

  hidePet(): void {
    this.petVisibilityRequested = false
    this.petWindow?.hide()
  }

  async openSettings(): Promise<void> {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      if (this.settingsWindowReady) {
        this.settingsWindow.show()
        this.settingsWindow.focus()
      }
      return
    }

    const settingsWindow = new BrowserWindow(createSettingsWindowOptions(this.preloadPath))
    this.settingsWindow = settingsWindow
    this.settingsWindowReady = false
    this.secureWindow(settingsWindow)

    const showWhenReady = (): void => {
      if (this.settingsWindow !== settingsWindow || settingsWindow.isDestroyed()) return
      this.settingsWindowReady = true
      settingsWindow.show()
      settingsWindow.focus()
    }
    settingsWindow.once('ready-to-show', showWhenReady)
    this.addListenerDisposer(settingsWindow, () => {
      settingsWindow.removeListener('ready-to-show', showWhenReady)
    })

    const clearSettingsWindow = (): void => {
      if (this.settingsWindow === settingsWindow) {
        this.settingsWindow = null
        this.settingsWindowReady = false
      }
      this.releaseWindowListeners(settingsWindow)
    }
    settingsWindow.once('closed', clearSettingsWindow)
    this.addListenerDisposer(settingsWindow, () => {
      settingsWindow.removeListener('closed', clearSettingsWindow)
    })

    await settingsWindow.loadURL(this.rendererUrl('settings'))
  }

  getWindowKind(webContentsId: number): WindowKind {
    if (
      this.petWindow &&
      !this.petWindow.isDestroyed() &&
      this.petWindow.webContents.id === webContentsId
    ) {
      return 'pet'
    }
    if (
      this.settingsWindow &&
      !this.settingsWindow.isDestroyed() &&
      this.settingsWindow.webContents.id === webContentsId
    ) {
      return 'settings'
    }
    throw new Error('Unrecognized renderer sender')
  }

  dispose(): void {
    const ownedWindows = [this.petWindow, this.settingsWindow]
    this.petWindow = null
    this.settingsWindow = null
    this.petWindowReady = false
    this.petWindowPlaced = false
    this.petVisibilityRequested = false
    this.settingsWindowReady = false

    for (const window of ownedWindows) {
      if (!window) continue
      this.releaseWindowListeners(window)
      if (!window.isDestroyed()) window.destroy()
    }
  }

  private secureWindow(window: BrowserWindow): void {
    const denyNavigation = (event: ElectronEvent): void => {
      event.preventDefault()
    }
    window.webContents.on('will-navigate', denyNavigation)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.addListenerDisposer(window, () => {
      if (!window.webContents.isDestroyed()) {
        window.webContents.removeListener('will-navigate', denyNavigation)
      }
    })
  }

  private async initializePetPlacement(petWindow: BrowserWindow): Promise<boolean> {
    const settings = await this.settingsStore.load()
    if (this.petWindow !== petWindow || petWindow.isDestroyed()) return false

    const savedPoint = toSavedPoint(settings.petWindow.x, settings.petWindow.y)
    const currentBounds = petWindow.getBounds()
    petWindow.setBounds(
      resolvePetWindowBounds(
        this.displaySnapshots(),
        settings.petWindow.displayId,
        savedPoint,
        currentBounds
      )
    )
    this.listenForPetPlacementChanges(petWindow)
    return true
  }

  private listenForPetPlacementChanges(petWindow: BrowserWindow): void {
    let persistenceTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const persistBounds = (): void => {
      persistenceTimer = null
      if (disposed || this.petWindow !== petWindow || petWindow.isDestroyed()) return

      const position = petWindow.getPosition()
      const x = position[0]
      const y = position[1]
      if (x === undefined || y === undefined) return
      const nearestDisplay = screen.getDisplayNearestPoint({ x, y })
      void this.settingsStore
        .update((current) => ({
          ...current,
          petWindow: {
            ...current.petWindow,
            x,
            y,
            displayId: String(nearestDisplay.id)
          }
        }))
        .catch(() => undefined)
    }

    const schedulePersistence = (): void => {
      if (persistenceTimer) clearTimeout(persistenceTimer)
      persistenceTimer = setTimeout(persistBounds, 250)
    }

    const reclamp = (): void => {
      if (disposed || this.petWindow !== petWindow || petWindow.isDestroyed()) return
      const bounds = petWindow.getBounds()
      petWindow.setBounds(
        resolvePetWindowBounds(
          this.displaySnapshots(),
          null,
          { x: bounds.x, y: bounds.y },
          bounds
        )
      )
    }

    petWindow.on('moved', schedulePersistence)
    petWindow.on('resized', schedulePersistence)
    screen.on('display-removed', reclamp)
    screen.on('display-metrics-changed', reclamp)
    this.addListenerDisposer(petWindow, () => {
      disposed = true
      if (persistenceTimer) clearTimeout(persistenceTimer)
      persistenceTimer = null
      petWindow.removeListener('moved', schedulePersistence)
      petWindow.removeListener('resized', schedulePersistence)
      screen.removeListener('display-removed', reclamp)
      screen.removeListener('display-metrics-changed', reclamp)
    })
  }

  private displaySnapshots(): readonly DisplaySnapshot[] {
    const primaryDisplayId = String(screen.getPrimaryDisplay().id)
    return screen.getAllDisplays().map((display) => ({
      id: String(display.id),
      bounds: toRect(display.bounds),
      workArea: toRect(display.workArea),
      isPrimary: String(display.id) === primaryDisplayId
    }))
  }

  private rendererUrl(kind: WindowKind): string {
    const developmentUrl = process.env.ELECTRON_RENDERER_URL
    return developmentUrl
      ? `${developmentUrl}?window=${kind}`
      : `app://renderer/index.html?window=${kind}`
  }

  private addListenerDisposer(window: BrowserWindow, dispose: () => void): void {
    const disposers = this.windowListenerDisposers.get(window) ?? []
    disposers.push(dispose)
    this.windowListenerDisposers.set(window, disposers)
  }

  private releaseWindowListeners(window: BrowserWindow): void {
    const disposers = this.windowListenerDisposers.get(window) ?? []
    this.windowListenerDisposers.delete(window)
    for (const dispose of disposers) dispose()
  }
}

function toSavedPoint(x: number | null, y: number | null): Point | null {
  return x === null || y === null ? null : { x, y }
}

function toRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
