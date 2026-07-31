import { ipcMain, type IpcMainEvent } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { SettingsStore } from '../settings/settings-store'
import type { WindowManager } from '../windows/window-manager'

interface FoundationIpcDependencies {
  settingsStore: Pick<SettingsStore, 'load' | 'update'>
  windowManager: Pick<
    WindowManager,
    'getWindowKind' | 'hidePet' | 'showPet' | 'openSettings'
  >
}

export function registerFoundationIpc({
  settingsStore,
  windowManager
}: FoundationIpcDependencies): () => void {
  ipcMain.handle(IPC_CHANNELS.getSettings, (event) => {
    windowManager.getWindowKind(event.sender.id)
    return settingsStore.load()
  })

  ipcMain.handle(IPC_CHANNELS.setPetVisibility, async (event, visible: unknown) => {
    windowManager.getWindowKind(event.sender.id)
    if (typeof visible !== 'boolean') throw new TypeError('visible must be a boolean')

    const settings = await settingsStore.update((current) => ({
      ...current,
      petWindow: { ...current.petWindow, visible }
    }))

    if (visible) await windowManager.showPet()
    else windowManager.hidePet()

    return settings
  })

  ipcMain.handle(IPC_CHANNELS.openSettings, async (event) => {
    windowManager.getWindowKind(event.sender.id)
    await windowManager.openSettings()
  })

  const getWindowKindListener = (event: IpcMainEvent): void => {
    event.returnValue = windowManager.getWindowKind(event.sender.id)
  }
  ipcMain.on(IPC_CHANNELS.getWindowKind, getWindowKindListener)

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.getSettings)
    ipcMain.removeHandler(IPC_CHANNELS.setPetVisibility)
    ipcMain.removeHandler(IPC_CHANNELS.openSettings)
    ipcMain.removeListener(IPC_CHANNELS.getWindowKind, getWindowKindListener)
  }
}
