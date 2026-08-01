import { contextBridge, ipcRenderer } from 'electron'
import type { PetSystemApi, PetSystemSnapshot } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc-channels'

const api: PetSystemApi = {
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
  }
}

contextBridge.exposeInMainWorld('dearCompanion', api)
