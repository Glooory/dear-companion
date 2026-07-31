import { contextBridge, ipcRenderer } from 'electron'
import type { FoundationApi } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc-channels'

const api: FoundationApi = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setPetVisibility: (visible) => ipcRenderer.invoke(IPC_CHANNELS.setPetVisibility, visible),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings),
  getWindowKind: () => ipcRenderer.sendSync(IPC_CHANNELS.getWindowKind)
}

contextBridge.exposeInMainWorld('dearCompanion', api)
