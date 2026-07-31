import { app } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppSettings } from '../shared/contracts'
import { registerFoundationIpc } from './ipc/register-foundation-ipc'
import { registerAppProtocol, registerAppScheme } from './security/app-protocol'
import { SettingsStore } from './settings/settings-store'
import { TrayController } from './tray/tray-controller'
import { WindowManager } from './windows/window-manager'

registerAppScheme()

const hasSingleInstanceLock = app.requestSingleInstanceLock()
let windowManager: WindowManager | null = null
let settingsStore: SettingsStore | null = null
let trayController: TrayController | null = null
let disposeFoundationIpc: (() => void) | null = null
let secondInstanceActivated = false
let isQuitting = false

function requestQuit(): void {
  if (isQuitting) return
  isQuitting = true
  app.quit()
}

async function persistAndShowPet(): Promise<AppSettings | null> {
  const store = settingsStore
  const manager = windowManager
  if (!store || !manager || isQuitting) return null

  const settings = await store.update((current) => ({
    ...current,
    petWindow: { ...current.petWindow, visible: true }
  }))
  if (manager !== windowManager || isQuitting) return null

  trayController?.refresh(settings)
  await manager.showPet()
  if (manager !== windowManager || isQuitting) return null
  return settings
}

function activateSecondInstance(): void {
  const manager = windowManager
  if (!manager) return
  manager.focusSettingsIfOpen()
  void persistAndShowPet().catch(() => undefined)
}

async function activateApplication(): Promise<void> {
  const manager = windowManager
  if (!manager) return

  const settings = await persistAndShowPet()
  if (settings?.activePetId === null) await manager.openSettings()
}

function disposeApplication(): void {
  disposeFoundationIpc?.()
  disposeFoundationIpc = null
  trayController?.dispose()
  trayController = null
  windowManager?.dispose()
  windowManager = null
  settingsStore = null
}

if (!hasSingleInstanceLock) {
  requestQuit()
} else {
  app.on('second-instance', () => {
    if (!windowManager) {
      secondInstanceActivated = true
      return
    }
    activateSecondInstance()
  })

  app.on('before-quit', () => {
    isQuitting = true
    disposeApplication()
  })

  app.on('window-all-closed', () => {
    // The tray remains the application's control surface when both windows are hidden or closed.
  })

  app.on('activate', () => {
    if (process.platform !== 'darwin') return
    void activateApplication().catch(() => undefined)
  })

  void app.whenReady().then(async () => {
    const mainDirectory = dirname(fileURLToPath(import.meta.url))
    const preloadPath = join(mainDirectory, '../preload/index.js')
    const rendererRoot = join(mainDirectory, '../renderer')

    await registerAppProtocol(rendererRoot)
    if (isQuitting) return

    if (process.env.DEAR_COMPANION_BUILD_SMOKE === '1') {
      app.quit()
      return
    }

    const store = new SettingsStore(app.getPath('userData'))
    const manager = new WindowManager({
      settingsStore: store,
      preloadPath,
      rendererRoot,
      isQuitting: () => isQuitting
    })
    const tray = new TrayController({ settingsStore: store, windowManager: manager, requestQuit })
    settingsStore = store
    windowManager = manager
    trayController = tray
    tray.create()
    disposeFoundationIpc = registerFoundationIpc({
      settingsStore: store,
      windowManager: manager,
      onSettingsChanged: (nextSettings) => trayController?.refresh(nextSettings)
    })
    const settings = await store.load()
    if (
      isQuitting ||
      settingsStore !== store ||
      windowManager !== manager ||
      trayController !== tray
    ) {
      return
    }

    tray.refresh(settings)
    if (settings.petWindow.visible) await manager.showPet()
    if (isQuitting || windowManager !== manager) return
    if (settings.activePetId === null) await manager.openSettings()
    if (isQuitting || windowManager !== manager) return
    if (secondInstanceActivated) {
      secondInstanceActivated = false
      activateSecondInstance()
    }
  })
}
