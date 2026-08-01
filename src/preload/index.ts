import { contextBridge, ipcRenderer } from 'electron'
import type {
  AudioPlaybackRequest,
  PetSystemSnapshot,
  RestSystemApi,
  RestSystemSnapshot
} from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc-channels'

const api: RestSystemApi = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setPetVisibility: (visible) => ipcRenderer.invoke(IPC_CHANNELS.setPetVisibility, visible),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings),
  getWindowKind: () => ipcRenderer.sendSync(IPC_CHANNELS.getWindowKind),
  getPetSystemSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getPetSystemSnapshot),
  createPet: (name) => ipcRenderer.invoke(IPC_CHANNELS.createPet, name),
  chooseAndImportPetAssets: (petId) => ipcRenderer.invoke(IPC_CHANNELS.importPetAssets, petId),
  updatePet: (input) => ipcRenderer.invoke(IPC_CHANNELS.updatePet, input),
  setActivePet: (petId) => ipcRenderer.invoke(IPC_CHANNELS.setActivePet, petId),
  movePetBy: (deltaX, deltaY) => ipcRenderer.send(IPC_CHANNELS.movePetBy, deltaX, deltaY),
  showPetContextMenu: () => ipcRenderer.send(IPC_CHANNELS.showPetContextMenu),
  onPetSystemChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: PetSystemSnapshot): void => {
      listener(snapshot)
    }
    ipcRenderer.on(IPC_CHANNELS.petSystemChanged, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.petSystemChanged, wrapped)
  },
  getRestSystemSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getRestSystemSnapshot),
  createReminder: (input) => ipcRenderer.invoke(IPC_CHANNELS.createReminder, input),
  updateReminder: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateReminder, input),
  deleteReminder: (reminderId) => ipcRenderer.invoke(IPC_CHANNELS.deleteReminder, reminderId),
  setReminderEnabled: (reminderId, enabled) => ipcRenderer.invoke(IPC_CHANNELS.setReminderEnabled, reminderId, enabled),
  retryReminderService: () => ipcRenderer.invoke(IPC_CHANNELS.retryReminderService),
  startPromptedRest: (occurrenceId) => ipcRenderer.invoke(IPC_CHANNELS.startPromptedRest, occurrenceId),
  snoozePrompt: (occurrenceId, minutes) => ipcRenderer.invoke(IPC_CHANNELS.snoozePrompt, occurrenceId, minutes),
  endRestSession: () => ipcRenderer.invoke(IPC_CHANNELS.endRestSession),
  chooseAndImportAudio: () => ipcRenderer.invoke(IPC_CHANNELS.importAudio),
  updateAudioSources: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateAudioSources, input),
  reportAudioPlaybackFailure: (requestId, assetId) => ipcRenderer.send(IPC_CHANNELS.reportAudioPlaybackFailure, requestId, assetId),
  onRestSystemChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: RestSystemSnapshot): void => listener(snapshot)
    ipcRenderer.on(IPC_CHANNELS.restSystemChanged, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.restSystemChanged, wrapped)
  },
  onAudioPlaybackRequested: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, request: AudioPlaybackRequest): void => listener(request)
    ipcRenderer.on(IPC_CHANNELS.audioPlaybackRequested, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.audioPlaybackRequested, wrapped)
  }
}

contextBridge.exposeInMainWorld('dearCompanion', api)
