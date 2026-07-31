import { BrowserWindow, type Event as ElectronEvent } from 'electron'
import type { WindowKind } from '../../shared/contracts'
import type { SettingsStore } from '../settings/settings-store'
import { createPetWindowOptions, createSettingsWindowOptions } from './window-options'

interface WindowManagerOptions {
  settingsStore: SettingsStore
  preloadPath: string
  rendererRoot: string
}

export class WindowManager {
  private petWindow: BrowserWindow | null = null
  private settingsWindow: BrowserWindow | null = null
  private readonly settingsStore: SettingsStore
  private readonly preloadPath: string
  private readonly windowListenerDisposers = new Map<BrowserWindow, Array<() => void>>()

  constructor({ settingsStore, preloadPath }: WindowManagerOptions) {
    this.settingsStore = settingsStore
    this.preloadPath = preloadPath
  }

  async showPet(): Promise<void> {
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      this.petWindow.show()
      return
    }

    const petWindow = new BrowserWindow(createPetWindowOptions(this.preloadPath))
    this.petWindow = petWindow
    this.secureWindow(petWindow)

    const showWhenReady = (): void => {
      if (this.petWindow === petWindow && !petWindow.isDestroyed()) petWindow.show()
    }
    petWindow.once('ready-to-show', showWhenReady)
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener('ready-to-show', showWhenReady)
    })

    const hideInsteadOfClose = (event: ElectronEvent): void => {
      event.preventDefault()
      petWindow.hide()
    }
    petWindow.on('close', hideInsteadOfClose)
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener('close', hideInsteadOfClose)
    })

    const clearPetWindow = (): void => {
      if (this.petWindow === petWindow) this.petWindow = null
      this.releaseWindowListeners(petWindow)
    }
    petWindow.once('closed', clearPetWindow)
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener('closed', clearPetWindow)
    })

    await petWindow.loadURL(this.rendererUrl('pet'))
  }

  hidePet(): void {
    this.petWindow?.hide()
  }

  async openSettings(): Promise<void> {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.show()
      this.settingsWindow.focus()
      return
    }

    const settingsWindow = new BrowserWindow(createSettingsWindowOptions(this.preloadPath))
    this.settingsWindow = settingsWindow
    this.secureWindow(settingsWindow)

    const showWhenReady = (): void => {
      if (this.settingsWindow !== settingsWindow || settingsWindow.isDestroyed()) return
      settingsWindow.show()
      settingsWindow.focus()
    }
    settingsWindow.once('ready-to-show', showWhenReady)
    this.addListenerDisposer(settingsWindow, () => {
      settingsWindow.removeListener('ready-to-show', showWhenReady)
    })

    const clearSettingsWindow = (): void => {
      if (this.settingsWindow === settingsWindow) this.settingsWindow = null
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
