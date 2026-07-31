import { app } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAppProtocol, registerAppScheme } from './security/app-protocol'
import { SettingsStore } from './settings/settings-store'
import { WindowManager } from './windows/window-manager'

registerAppScheme()

const hasSingleInstanceLock = app.requestSingleInstanceLock()
let windowManager: WindowManager | null = null

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('before-quit', () => {
    windowManager?.dispose()
    windowManager = null
  })

  void app.whenReady().then(async () => {
    const mainDirectory = dirname(fileURLToPath(import.meta.url))
    const preloadPath = join(mainDirectory, '../preload/index.js')
    const rendererRoot = join(mainDirectory, '../renderer')

    await registerAppProtocol(rendererRoot)

    if (process.env.DEAR_COMPANION_BUILD_SMOKE === '1') {
      app.quit()
      return
    }

    const settingsStore = new SettingsStore(app.getPath('userData'))
    windowManager = new WindowManager({ settingsStore, preloadPath, rendererRoot })
    const settings = await settingsStore.load()
    if (settings.petWindow.visible) await windowManager.showPet()
    if (settings.activePetId === null) await windowManager.openSettings()
  })
}
