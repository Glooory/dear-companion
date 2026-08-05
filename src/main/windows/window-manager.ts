import { BrowserWindow, screen, type Event as ElectronEvent } from 'electron'
import type {
  AudioPlaybackRequest,
  CompanionSystemSnapshot,
  PetRendererStatus,
  PetSystemSnapshot,
  RestSystemSnapshot,
  WindowKind
} from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { CrashRecoveryBudget } from '../app/crash-recovery'
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
  isPackaged: boolean
}

export class WindowManager {
  private disposed = false
  private petWindow: BrowserWindow | null = null
  private settingsWindow: BrowserWindow | null = null
  private petWindowReady = false
  private petWindowPlaced = false
  private petVisibilityRequested = false
  private settingsWindowReady = false
  private readonly crashRecoveryBudget = new CrashRecoveryBudget()
  private petRendererStatus: PetRendererStatus = { state: 'healthy' }
  private readonly settingsStore: WindowSettingsStore
  private readonly preloadPath: string
  private readonly isPackaged: boolean
  private readonly windowListenerDisposers = new Map<BrowserWindow, Array<() => void>>()

  constructor({ settingsStore, preloadPath, isPackaged }: WindowManagerOptions) {
    this.settingsStore = settingsStore
    this.preloadPath = preloadPath
    this.isPackaged = isPackaged
  }

  async showPet(): Promise<void> {
    if (this.disposed) return
    if (this.crashRecoveryBudget.getState() === 'safe-mode') return
    this.petVisibilityRequested = true
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      if (this.petWindowReady && this.petWindowPlaced) this.showPetWindow(this.petWindow)
      return
    }

    const petWindow = new BrowserWindow(createPetWindowOptions(this.preloadPath))
    petWindow.setHasShadow(false)
    this.petWindow = petWindow
    this.petWindowReady = false
    this.petWindowPlaced = false
    this.secureWindow(petWindow)

    const showWhenReady = (): void => {
      if (this.petWindow !== petWindow || petWindow.isDestroyed()) return
      this.petWindowReady = true
      this.markPetRendererReady()
      if (this.petWindowPlaced && this.petVisibilityRequested) this.showPetWindow(petWindow)
    }
    petWindow.once('ready-to-show', showWhenReady)
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener('ready-to-show', showWhenReady)
    })

    const preventPetClose = (event: ElectronEvent): void => {
      event.preventDefault()
    }
    petWindow.on('close', preventPetClose)
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener('close', preventPetClose)
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

    const handleRendererGone = (): void => {
      this.handlePetRendererFailure(petWindow)
    }
    petWindow.webContents.on('render-process-gone', handleRendererGone)
    this.addListenerDisposer(petWindow, () => {
      if (!petWindow.webContents.isDestroyed()) {
        petWindow.webContents.removeListener('render-process-gone', handleRendererGone)
      }
    })

    try {
      const placementCompleted = await this.initializePetPlacement(petWindow)
      if (!placementCompleted) return
      this.petWindowPlaced = true
      if (this.petWindowReady && this.petVisibilityRequested) this.showPetWindow(petWindow)

      await petWindow.loadURL(this.rendererUrl('pet'))
    } catch (error) {
      this.discardFailedPetWindow(petWindow)
      throw error
    }
  }

  hidePet(): void {
    if (this.disposed) return
    this.petVisibilityRequested = false
    this.petWindow?.hide()
  }

  private showPetWindow(petWindow: BrowserWindow): void {
    petWindow.setHasShadow(false)
    petWindow.show()
  }

  async openSettings(): Promise<void> {
    if (this.disposed) return
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

    try {
      await settingsWindow.loadURL(this.rendererUrl('settings'))
    } catch (error) {
      this.discardFailedSettingsWindow(settingsWindow)
      throw error
    }
  }

  focusSettingsIfOpen(): void {
    if (this.disposed) return
    if (!this.settingsWindow || this.settingsWindow.isDestroyed() || !this.settingsWindowReady) return
    this.settingsWindow.show()
    this.settingsWindow.focus()
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

  getOwnedWindow(webContentsId: number): BrowserWindow {
    const kind = this.getWindowKind(webContentsId)
    const window = kind === 'pet' ? this.petWindow : this.settingsWindow
    if (!window || window.isDestroyed()) throw new Error('Unrecognized renderer sender')
    return window
  }

  movePetBy(deltaX: number, deltaY: number): void {
    if (
      this.disposed ||
      !Number.isFinite(deltaX) ||
      !Number.isFinite(deltaY) ||
      Math.abs(deltaX) > 256 ||
      Math.abs(deltaY) > 256
    ) {
      return
    }
    const petWindow = this.petWindow
    if (!petWindow || petWindow.isDestroyed()) return
    const [x, y] = petWindow.getPosition()
    if (x === undefined || y === undefined) return
    petWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY))
  }

  broadcastPetSystemChanged(snapshot: PetSystemSnapshot): void {
    for (const window of [this.petWindow, this.settingsWindow]) {
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) continue
      window.webContents.send(IPC_CHANNELS.petSystemChanged, snapshot)
    }
  }

  broadcastRestSystemChanged(snapshot: RestSystemSnapshot): void {
    this.broadcast(IPC_CHANNELS.restSystemChanged, snapshot)
  }

  broadcastCompanionSystemChanged(snapshot: CompanionSystemSnapshot): void {
    this.broadcast(IPC_CHANNELS.companionSystemChanged, snapshot)
  }

  broadcastPettingGestureDetected(): void {
    const window = this.petWindow
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(IPC_CHANNELS.pettingGestureDetected)
  }

  broadcastAudioPlaybackRequested(request: AudioPlaybackRequest): void {
    const window = this.petWindow
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(IPC_CHANNELS.audioPlaybackRequested, request)
  }

  async showPetForRuntime(): Promise<void> {
    await this.showPet()
  }

  async restorePersistedPetVisibility(): Promise<void> {
    const settings = await this.settingsStore.load()
    if (!settings.petWindow.visible) this.hidePet()
  }

  isPetVisible(): boolean {
    return Boolean(this.petWindow && !this.petWindow.isDestroyed() && this.petWindow.isVisible())
  }

  getPetRendererStatus(): PetRendererStatus {
    return { ...this.petRendererStatus }
  }

  async retryPetRenderer(): Promise<PetRendererStatus> {
    if (this.disposed || !this.crashRecoveryBudget.retry()) {
      return this.getPetRendererStatus()
    }
    this.setPetRendererStatus({ state: 'recovering' })
    try {
      const settings = await this.settingsStore.load()
      await this.rebuildPetWindow(settings.petWindow.visible)
    } catch {
      this.crashRecoveryBudget.rendererFailed()
      this.setPetRendererStatus({ state: 'safe-mode', errorCode: 'pet-renderer-failed' })
    }
    return this.getPetRendererStatus()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
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

  private handlePetRendererFailure(petWindow: BrowserWindow): void {
    if (this.disposed || this.petWindow !== petWindow) return
    const shouldShow = this.petVisibilityRequested
    this.petWindow = null
    this.petWindowReady = false
    this.petWindowPlaced = false
    this.releaseWindowListeners(petWindow)
    if (!petWindow.isDestroyed()) petWindow.destroy()

    if (this.crashRecoveryBudget.rendererFailed() === 'safe-mode') {
      this.petVisibilityRequested = false
      this.setPetRendererStatus({ state: 'safe-mode', errorCode: 'pet-renderer-failed' })
      return
    }

    this.setPetRendererStatus({ state: 'recovering' })
    void this.rebuildPetWindow(shouldShow)
  }

  private async rebuildPetWindow(shouldShow: boolean): Promise<void> {
    try {
      const rebuilding = this.showPet()
      if (!shouldShow) this.hidePet()
      await rebuilding
    } catch {
      if (this.crashRecoveryBudget.rendererFailed() === 'safe-mode') {
        this.petVisibilityRequested = false
        this.setPetRendererStatus({ state: 'safe-mode', errorCode: 'pet-renderer-failed' })
      }
    }
  }

  private markPetRendererReady(): void {
    if (this.crashRecoveryBudget.getState() !== 'rebuilding') return
    this.crashRecoveryBudget.rendererReady()
    this.setPetRendererStatus({ state: 'healthy' })
  }

  private setPetRendererStatus(status: PetRendererStatus): void {
    if (
      this.petRendererStatus.state === status.state &&
      this.petRendererStatus.errorCode === status.errorCode
    ) return
    this.petRendererStatus = { ...status }
    this.broadcast(IPC_CHANNELS.petRendererStatusChanged, this.getPetRendererStatus())
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const window of [this.petWindow, this.settingsWindow]) {
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) continue
      window.webContents.send(channel, payload)
    }
  }

  private async initializePetPlacement(petWindow: BrowserWindow): Promise<boolean> {
    const settings = await this.settingsStore.load()
    if (this.petWindow !== petWindow || petWindow.isDestroyed()) return false

    const savedPoint = toSavedPoint(settings.petWindow.x, settings.petWindow.y)
    const initialBounds = petWindow.getBounds()
    const desiredSize = { width: initialBounds.width, height: initialBounds.height }
    petWindow.setBounds(
      resolvePetWindowBounds(
        this.displaySnapshots(),
        settings.petWindow.displayId,
        savedPoint,
        desiredSize
      )
    )
    this.listenForPetPlacementChanges(petWindow, desiredSize)
    return true
  }

  private listenForPetPlacementChanges(
    petWindow: BrowserWindow,
    desiredSize: Pick<Rect, 'width' | 'height'>
  ): void {
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
          desiredSize
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

  private discardFailedPetWindow(petWindow: BrowserWindow): void {
    if (this.petWindow === petWindow) {
      this.petWindow = null
      this.petWindowReady = false
      this.petWindowPlaced = false
      this.petVisibilityRequested = false
    }
    this.releaseWindowListeners(petWindow)
    if (!petWindow.isDestroyed()) petWindow.destroy()
  }

  private discardFailedSettingsWindow(settingsWindow: BrowserWindow): void {
    if (this.settingsWindow === settingsWindow) {
      this.settingsWindow = null
      this.settingsWindowReady = false
    }
    this.releaseWindowListeners(settingsWindow)
    if (!settingsWindow.isDestroyed()) settingsWindow.destroy()
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
    const developmentUrl = this.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
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
