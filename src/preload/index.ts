import { contextBridge, ipcRenderer } from "electron";
import type {
  AudioPlaybackRequest,
  BubbleSystemSnapshot,
  CompanionSystemSnapshot,
  PetInteractionRequest,
  PetPresenceTransitionRequest,
  PetRendererStatus,
  PetSystemSnapshot,
  ReleaseHardeningApi,
  RestSystemSnapshot,
  SettingsNavigationTarget,
} from "@shared/contracts";
import { IPC_CHANNELS } from "@shared/ipc-channels";

const presenceTransitionListeners = new Set<(request: PetPresenceTransitionRequest) => void>();
let pendingPresenceTransition: PetPresenceTransitionRequest | null = null;

ipcRenderer.on(
  IPC_CHANNELS.petPresenceTransitionRequested,
  (_event: Electron.IpcRendererEvent, request: PetPresenceTransitionRequest) => {
    pendingPresenceTransition = request;
    presenceTransitionListeners.forEach((listener) => listener(request));
  }
);

const api: ReleaseHardeningApi = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setPetVisibility: (visible) => ipcRenderer.invoke(IPC_CHANNELS.setPetVisibility, visible),
  openSettings: (target) => ipcRenderer.invoke(IPC_CHANNELS.openSettings, target),
  getWindowKind: () => ipcRenderer.sendSync(IPC_CHANNELS.getWindowKind),
  getPetSystemSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getPetSystemSnapshot),
  createPet: (name) => ipcRenderer.invoke(IPC_CHANNELS.createPet, name),
  deletePet: (petId) => ipcRenderer.invoke(IPC_CHANNELS.deletePet, petId),
  deletePetAsset: (petId, assetId) => ipcRenderer.invoke(IPC_CHANNELS.deletePetAsset, petId, assetId),
  chooseAndImportPetAssets: (petId) => ipcRenderer.invoke(IPC_CHANNELS.importPetAssets, petId),
  updatePet: (input) => ipcRenderer.invoke(IPC_CHANNELS.updatePet, input),
  savePetVoice: (petId, data, extension) => ipcRenderer.invoke(IPC_CHANNELS.savePetVoice, petId, data, extension),
  chooseAndImportPetVoice: (petId) => ipcRenderer.invoke(IPC_CHANNELS.importPetVoice, petId),
  pickPetVoiceSource: (petId) => ipcRenderer.invoke(IPC_CHANNELS.pickPetVoiceSource, petId),
  getPetVoice: (petId, voiceId) => ipcRenderer.invoke(IPC_CHANNELS.getPetVoice, petId, voiceId),
  cleanupPetVoiceDrafts: (petId) => ipcRenderer.invoke(IPC_CHANNELS.cleanupPetVoiceDrafts, petId),
  getPetVoiceAvailability: (petId, voiceIds) =>
    ipcRenderer.invoke(IPC_CHANNELS.getPetVoiceAvailability, petId, voiceIds),
  setActivePet: (petId) => ipcRenderer.invoke(IPC_CHANNELS.setActivePet, petId),
  movePetBy: (deltaX, deltaY) => ipcRenderer.send(IPC_CHANNELS.movePetBy, deltaX, deltaY),
  nudgePetBy: (deltaX, deltaY) => ipcRenderer.send(IPC_CHANNELS.nudgePetBy, deltaX, deltaY),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send(IPC_CHANNELS.setPetIgnoreMouseEvents, Boolean(ignore)),
  showPetContextMenu: () => ipcRenderer.send(IPC_CHANNELS.showPetContextMenu),
  previewCompanionPace: (pace) => ipcRenderer.invoke(IPC_CHANNELS.previewCompanionPace, pace),
  previewDialogue: (preview) => ipcRenderer.invoke(IPC_CHANNELS.previewDialogue, preview),
  getBubbleSystemSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getBubbleSystemSnapshot),
  setBubbleDialogue: (dialogue) => ipcRenderer.send(IPC_CHANNELS.setBubbleDialogue, dialogue),
  onPetSystemChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: PetSystemSnapshot): void => {
      listener(snapshot);
    };
    ipcRenderer.on(IPC_CHANNELS.petSystemChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.petSystemChanged, wrapped);
  },
  onPetInteractionRequested: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, request: PetInteractionRequest): void => listener(request);
    ipcRenderer.on(IPC_CHANNELS.petInteractionRequested, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.petInteractionRequested, wrapped);
  },
  reportPetPresenceTransitionReady: (id) => {
    ipcRenderer.send(IPC_CHANNELS.petPresenceTransitionReady, id);
  },
  reportPetPresenceTransitionComplete: (id) => {
    if (pendingPresenceTransition?.id === id) pendingPresenceTransition = null;
    ipcRenderer.send(IPC_CHANNELS.petPresenceTransitionCompleted, id);
  },
  onPetPresenceTransitionRequested: (listener) => {
    presenceTransitionListeners.add(listener);
    const pending = pendingPresenceTransition;
    if (pending) queueMicrotask(() => presenceTransitionListeners.has(listener) && listener(pending));
    return () => presenceTransitionListeners.delete(listener);
  },
  onBubbleSystemChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: BubbleSystemSnapshot): void => listener(snapshot);
    ipcRenderer.on(IPC_CHANNELS.bubbleSystemChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.bubbleSystemChanged, wrapped);
  },
  getCompanionSystemSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getCompanionSystemSnapshot),
  createWorkSchedule: (input) => ipcRenderer.invoke(IPC_CHANNELS.createWorkSchedule, input),
  updateWorkSchedule: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateWorkSchedule, input),
  deleteWorkSchedule: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteWorkSchedule, id),
  setWorkScheduleEnabled: (id, enabled) => ipcRenderer.invoke(IPC_CHANNELS.setWorkScheduleEnabled, id, enabled),
  wakeCompanion: () => ipcRenderer.invoke(IPC_CHANNELS.wakeCompanion),
  beginPettingGesture: (region) => ipcRenderer.send(IPC_CHANNELS.beginPettingGesture, region),
  cancelPettingGesture: () => ipcRenderer.send(IPC_CHANNELS.cancelPettingGesture),
  onCompanionSystemChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: CompanionSystemSnapshot): void => listener(snapshot);
    ipcRenderer.on(IPC_CHANNELS.companionSystemChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.companionSystemChanged, wrapped);
  },
  onPettingGestureDetected: (listener) => {
    const wrapped = (): void => listener();
    ipcRenderer.on(IPC_CHANNELS.pettingGestureDetected, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.pettingGestureDetected, wrapped);
  },
  getRestSystemSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getRestSystemSnapshot),
  createReminder: (input) => ipcRenderer.invoke(IPC_CHANNELS.createReminder, input),
  updateReminder: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateReminder, input),
  deleteReminder: (reminderId) => ipcRenderer.invoke(IPC_CHANNELS.deleteReminder, reminderId),
  setReminderEnabled: (reminderId, enabled) => ipcRenderer.invoke(IPC_CHANNELS.setReminderEnabled, reminderId, enabled),
  retryReminderService: () => ipcRenderer.invoke(IPC_CHANNELS.retryReminderService),
  startPromptedRest: (occurrenceId) => ipcRenderer.invoke(IPC_CHANNELS.startPromptedRest, occurrenceId),
  snoozePrompt: (occurrenceId, minutes) => ipcRenderer.invoke(IPC_CHANNELS.snoozePrompt, occurrenceId, minutes),
  skipPrompt: (occurrenceId) => ipcRenderer.invoke(IPC_CHANNELS.skipPrompt, occurrenceId),
  endRestSession: () => ipcRenderer.invoke(IPC_CHANNELS.endRestSession),
  chooseAndImportAudio: () => ipcRenderer.invoke(IPC_CHANNELS.importAudio),
  updateAudioSources: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateAudioSources, input),
  reportAudioPlaybackFailure: (requestId, assetId) =>
    ipcRenderer.send(IPC_CHANNELS.reportAudioPlaybackFailure, requestId, assetId),
  saveReminderVoice: (data, extension) => ipcRenderer.invoke(IPC_CHANNELS.saveReminderVoice, data, extension),
  pickReminderVoiceSource: () => ipcRenderer.invoke(IPC_CHANNELS.pickReminderVoiceSource),
  getReminderVoice: (voiceId) => ipcRenderer.invoke(IPC_CHANNELS.getReminderVoice, voiceId),
  getReminderVoiceAvailability: (voiceIds) => ipcRenderer.invoke(IPC_CHANNELS.getReminderVoiceAvailability, voiceIds),
  onRestSystemChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: RestSystemSnapshot): void => listener(snapshot);
    ipcRenderer.on(IPC_CHANNELS.restSystemChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.restSystemChanged, wrapped);
  },
  onAudioPlaybackRequested: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, request: AudioPlaybackRequest): void => listener(request);
    ipcRenderer.on(IPC_CHANNELS.audioPlaybackRequested, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.audioPlaybackRequested, wrapped);
  },
  getAutostartStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getAutostartStatus),
  setAutostartEnabled: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.setAutostartEnabled, enabled),
  getPetRendererStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getPetRendererStatus),
  retryPetRenderer: () => ipcRenderer.invoke(IPC_CHANNELS.retryPetRenderer),
  onPetRendererStatusChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: PetRendererStatus): void => {
      listener(status);
    };
    ipcRenderer.on(IPC_CHANNELS.petRendererStatusChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.petRendererStatusChanged, wrapped);
  },
  getSettingsNavigationTarget: () => ipcRenderer.invoke(IPC_CHANNELS.getSettingsNavigationTarget),
  onSettingsNavigationRequested: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, target: SettingsNavigationTarget): void => {
      listener(target);
    };
    ipcRenderer.on(IPC_CHANNELS.settingsNavigationRequested, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.settingsNavigationRequested, wrapped);
  },
};

contextBridge.exposeInMainWorld("dearCompanion", api);
