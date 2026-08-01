import { ipcMain } from 'electron'
import {
  parseAutostartEnabledInput,
  parseAutostartStatus,
  parsePetRendererStatus
} from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { AutostartService } from '../autostart/autostart-service'
import type { WindowManager } from '../windows/window-manager'

interface ReleaseHardeningIpcDependencies {
  autostartService: Pick<AutostartService, 'getStatus' | 'setEnabled'>
  windowManager: Pick<
    WindowManager,
    'getWindowKind' | 'getPetRendererStatus' | 'retryPetRenderer'
  >
}

export function registerReleaseHardeningIpc({
  autostartService,
  windowManager
}: ReleaseHardeningIpcDependencies): () => void {
  ipcMain.handle(IPC_CHANNELS.getAutostartStatus, async (event) => {
    windowManager.getWindowKind(event.sender.id)
    return parseAutostartStatus(await autostartService.getStatus())
  })
  ipcMain.handle(IPC_CHANNELS.setAutostartEnabled, async (event, enabled: unknown) => {
    if (windowManager.getWindowKind(event.sender.id) !== 'settings') {
      throw new Error('Autostart settings require the settings window')
    }
    return parseAutostartStatus(
      await autostartService.setEnabled(parseAutostartEnabledInput(enabled))
    )
  })
  ipcMain.handle(IPC_CHANNELS.getPetRendererStatus, (event) => {
    windowManager.getWindowKind(event.sender.id)
    return parsePetRendererStatus(windowManager.getPetRendererStatus())
  })
  ipcMain.handle(IPC_CHANNELS.retryPetRenderer, async (event) => {
    if (windowManager.getWindowKind(event.sender.id) !== 'settings') {
      throw new Error('Pet renderer retry requires the settings window')
    }
    return parsePetRendererStatus(await windowManager.retryPetRenderer())
  })

  let active = true
  return () => {
    if (!active) return
    active = false
    ipcMain.removeHandler(IPC_CHANNELS.getAutostartStatus)
    ipcMain.removeHandler(IPC_CHANNELS.setAutostartEnabled)
    ipcMain.removeHandler(IPC_CHANNELS.getPetRendererStatus)
    ipcMain.removeHandler(IPC_CHANNELS.retryPetRenderer)
  }
}
