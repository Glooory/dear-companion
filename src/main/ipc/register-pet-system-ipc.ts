import { Menu, dialog, ipcMain, type IpcMainEvent } from 'electron'
import {
  parsePetIdentifier,
  type AppSettings,
  type PetSystemSnapshot
} from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { PetPackService } from '../pets/pet-pack-service'
import type { CompanionStateController } from '../companion/companion-state-controller'
import type { SettingsStore } from '../settings/settings-store'
import type { WindowManager } from '../windows/window-manager'

interface PetSystemIpcDependencies {
  petPackService: Pick<
    PetPackService,
    'getSnapshot' | 'createPet' | 'deletePet' | 'importAssets' | 'updatePet' | 'setActivePet'
  >
  settingsStore: Pick<SettingsStore, 'update'>
  windowManager: Pick<
    WindowManager,
    'getWindowKind' | 'getOwnedWindow' | 'movePetBy' | 'broadcastPetSystemChanged' |
    'isPetVisible' | 'showPet' | 'hidePet' | 'openSettings'
  >
  onSettingsChanged?: (settings: AppSettings) => void
  requestQuit: () => void
  isRestSessionActive?: () => boolean
  endRestSession?: () => void
  companionController?: Pick<CompanionStateController, 'getSnapshot' | 'selectManualState' | 'setManualWork' | 'refresh'>
}

export function registerPetSystemIpc({
  petPackService,
  settingsStore,
  windowManager,
  onSettingsChanged = () => undefined,
  requestQuit,
  isRestSessionActive = () => false,
  endRestSession = () => undefined,
  companionController
}: PetSystemIpcDependencies): () => void {
  let active = true
  const handledChannels: string[] = []

  const broadcast = async (snapshot: PetSystemSnapshot): Promise<PetSystemSnapshot> => {
    await companionController?.refresh()
    if (active) windowManager.broadcastPetSystemChanged(snapshot)
    return snapshot
  }

  const requireSettingsSender = (senderId: number): void => {
    if (windowManager.getWindowKind(senderId) !== 'settings') {
      throw new Error('This operation is available only from settings')
    }
  }

  const movePetListener = (event: IpcMainEvent, deltaX: unknown, deltaY: unknown): void => {
    try {
      if (windowManager.getWindowKind(event.sender.id) !== 'pet') return
      if (
        typeof deltaX !== 'number' ||
        typeof deltaY !== 'number' ||
        !Number.isFinite(deltaX) ||
        !Number.isFinite(deltaY) ||
        Math.abs(deltaX) > 256 ||
        Math.abs(deltaY) > 256
      ) return
      windowManager.movePetBy(deltaX, deltaY)
    } catch {
      // Unknown or stale renderer senders receive no privileged action.
    }
  }

  const showContextMenuListener = (event: IpcMainEvent): void => {
    try {
      if (windowManager.getWindowKind(event.sender.id) !== 'pet') return
      const owner = windowManager.getOwnedWindow(event.sender.id)
      const visible = windowManager.isPetVisible()
      const companion = companionController?.getSnapshot()
      const ordinaryEnabled = !companion?.systemSuspended
      const menu = Menu.buildFromTemplate([
        ...(companionController && companion ? [
          {
            label: '自动陪伴', enabled: ordinaryEnabled,
            click: () => companionController.selectManualState('auto')
          },
          {
            label: '安静待一会儿', enabled: ordinaryEnabled,
            click: () => companionController.selectManualState('daily-calm')
          },
          {
            label: '活泼一会儿', enabled: ordinaryEnabled,
            click: () => companionController.selectManualState('daily-playful')
          },
          ...(companion.available.drowsy ? [{
            label: '有点困了', enabled: ordinaryEnabled,
            click: () => companionController.selectManualState('drowsy')
          }] : []),
          ...(companion.available.sleeping ? [{
            label: '睡一会儿', enabled: ordinaryEnabled,
            click: () => companionController.selectManualState('sleeping')
          }] : []),
          {
            label: companion.manualWorkActive ? '结束工作' : '陪我工作',
            enabled: ordinaryEnabled,
            click: () => companionController.setManualWork(!companion.manualWorkActive)
          },
          { type: 'separator' as const }
        ] : []),
        {
          label: visible ? '隐藏宠物' : '显示宠物',
          click: () => { void setVisibility(!visible).catch(() => undefined) }
        },
        {
          label: '设置…',
          click: () => { void windowManager.openSettings().catch(() => undefined) }
        },
        ...(isRestSessionActive() ? [{ label: '结束本次休息', click: endRestSession }] : []),
        { type: 'separator' },
        { label: '退出 Dear Companion', click: requestQuit }
      ])
      menu.popup({ window: owner })
    } catch {
      // The menu is intentionally unavailable to unknown or stale senders.
    }
  }

  const setVisibility = async (visible: boolean): Promise<void> => {
    const settings = await settingsStore.update((current) => ({
      ...current,
      petWindow: { ...current.petWindow, visible }
    }))
    if (!active) return
    onSettingsChanged(settings)
    if (visible) await windowManager.showPet()
    else windowManager.hidePet()
  }

  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void => {
    ipcMain.handle(channel, listener)
    handledChannels.push(channel)
  }

  try {
    handle(IPC_CHANNELS.getPetSystemSnapshot, (event) => {
      windowManager.getWindowKind(event.sender.id)
      return petPackService.getSnapshot()
    })

    handle(IPC_CHANNELS.createPet, async (event, name: unknown) => {
      requireSettingsSender(event.sender.id)
      return broadcast(await petPackService.createPet(name))
    })

    handle(IPC_CHANNELS.deletePet, async (event, petId: unknown) => {
      requireSettingsSender(event.sender.id)
      return broadcast(await petPackService.deletePet(petId))
    })

    handle(IPC_CHANNELS.importPetAssets, async (event, petId: unknown) => {
      requireSettingsSender(event.sender.id)
      const validatedPetId = parsePetIdentifier(petId)
      const snapshot = await petPackService.getSnapshot()
      if (!snapshot.pets.some((pet) => pet.id === validatedPetId)) {
        throw new Error('Pet does not exist')
      }
      const owner = windowManager.getOwnedWindow(event.sender.id)
      const selection = await dialog.showOpenDialog(owner, {
        title: '导入透明宠物图片',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '透明图片', extensions: ['png', 'webp'] }]
      })
      if (selection.canceled || selection.filePaths.length === 0) {
        return { imported: [], failures: [] }
      }
      const result = await petPackService.importAssets(validatedPetId, selection.filePaths)
      if (result.imported.length > 0) await broadcast(await petPackService.getSnapshot())
      return result
    })

    handle(IPC_CHANNELS.updatePet, async (event, input: unknown) => {
      requireSettingsSender(event.sender.id)
      return broadcast(await petPackService.updatePet(input))
    })

    handle(IPC_CHANNELS.setActivePet, async (event, petId: unknown) => {
      requireSettingsSender(event.sender.id)
      return broadcast(await petPackService.setActivePet(petId))
    })

    ipcMain.on(IPC_CHANNELS.movePetBy, movePetListener)
    ipcMain.on(IPC_CHANNELS.showPetContextMenu, showContextMenuListener)
  } catch (error) {
    for (const channel of handledChannels) ipcMain.removeHandler(channel)
    ipcMain.removeListener(IPC_CHANNELS.movePetBy, movePetListener)
    ipcMain.removeListener(IPC_CHANNELS.showPetContextMenu, showContextMenuListener)
    throw error
  }

  return () => {
    if (!active) return
    active = false
    for (const channel of handledChannels) ipcMain.removeHandler(channel)
    ipcMain.removeListener(IPC_CHANNELS.movePetBy, movePetListener)
    ipcMain.removeListener(IPC_CHANNELS.showPetContextMenu, showContextMenuListener)
  }
}
