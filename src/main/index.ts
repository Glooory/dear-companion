import { app, dialog } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPetSystemSnapshot, type AppSettings } from '../shared/contracts'
import {
  StartupIntentQueue,
  prepareTray,
  runStartup,
  terminateFailedStartup
} from './app/startup'
import { registerFoundationIpc } from './ipc/register-foundation-ipc'
import { registerPetSystemIpc } from './ipc/register-pet-system-ipc'
import { SharpImageDecoder } from './images/image-decoder'
import { PetPackService } from './pets/pet-pack-service'
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
let disposePetSystemIpc: (() => void) | null = null
let disposePendingStartup: (() => void) | null = null
let isQuitting = false
let startupReady = false

const startupIntents = new StartupIntentQueue({
  secondInstance: () => activateSecondInstance(),
  activate: () => {
    void activateApplication().catch(() => undefined)
  }
})

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
  startupReady = false
  startupIntents.reset()
  const ownedTray = trayController
  const ownedWindowManager = windowManager
  const disposers = [
    disposePendingStartup,
    disposeFoundationIpc,
    disposePetSystemIpc,
    ownedTray ? () => ownedTray.dispose() : null,
    ownedWindowManager ? () => ownedWindowManager.dispose() : null
  ]
  disposePendingStartup = null
  disposeFoundationIpc = null
  disposePetSystemIpc = null
  trayController = null
  windowManager = null
  settingsStore = null

  for (const dispose of disposers) {
    try {
      dispose?.()
    } catch {
      // Cleanup is best-effort; startup failure still must request terminal quit.
    }
  }
}

function handleStartupFailure(): void {
  terminateFailedStartup({
    cleanup: disposeApplication,
    report: () => {
      dialog.showErrorBox(
        'Dear Companion 无法启动',
        '读取本地设置或创建桌面窗口失败。请重新启动应用。'
      )
    },
    quit: requestQuit
  })
}

if (!hasSingleInstanceLock) {
  requestQuit()
} else {
  app.on('second-instance', () => {
    if (isQuitting) return
    if (!startupReady) {
      startupIntents.request('second-instance')
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
    if (process.platform !== 'darwin' || isQuitting) return
    if (!startupReady) {
      startupIntents.request('activate')
      return
    }
    void activateApplication().catch(() => undefined)
  })

  void runStartup(async () => {
    await app.whenReady()
    const mainDirectory = dirname(fileURLToPath(import.meta.url))
    const preloadPath = join(mainDirectory, '../preload/index.js')
    const rendererRoot = join(mainDirectory, '../renderer')

    if (process.env.DEAR_COMPANION_BUILD_SMOKE === '1') {
      await registerAppProtocol(rendererRoot)
      app.quit()
      return
    }

    const store = new SettingsStore(app.getPath('userData'))
    const petPackService = new PetPackService(
      app.getPath('userData'),
      store,
      new SharpImageDecoder()
    )
    await registerAppProtocol(
      rendererRoot,
      (petId, assetId) => petPackService.resolveAssetPath(petId, assetId)
    )
    if (isQuitting) return

    const manager = new WindowManager({
      settingsStore: store,
      preloadPath,
      rendererRoot,
      isPackaged: app.isPackaged
    })
    const tray = new TrayController({ settingsStore: store, windowManager: manager, requestQuit })
    disposePendingStartup = () => {
      for (const dispose of [() => tray.dispose(), () => manager.dispose()]) {
        try {
          dispose()
        } catch {
          // Continue releasing the remaining startup-owned resources.
        }
      }
    }
    const settings = await prepareTray({
      settingsStore: store,
      tray,
      isQuitting: () => isQuitting
    })
    if (!settings) {
      disposePendingStartup?.()
      disposePendingStartup = null
      return
    }

    settingsStore = store
    windowManager = manager
    trayController = tray
    disposePendingStartup = null

    const onSettingsChanged = (nextSettings: AppSettings): void => {
      trayController?.refresh(nextSettings)
      manager.broadcastPetSystemChanged(createPetSystemSnapshot(nextSettings))
    }
    disposeFoundationIpc = registerFoundationIpc({
      settingsStore: store,
      windowManager: manager,
      onSettingsChanged
    })
    disposePetSystemIpc = registerPetSystemIpc({
      petPackService,
      settingsStore: store,
      windowManager: manager,
      onSettingsChanged,
      requestQuit
    })
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
    startupReady = true
    startupIntents.markReady()
  }, handleStartupFailure)
}
