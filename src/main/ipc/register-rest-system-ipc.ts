import { randomUUID } from "node:crypto";
import { dialog, ipcMain, type IpcMainEvent } from "electron";
import {
  createRestSystemSnapshot,
  isSafeIdentifier,
  parseCreateReminderInput,
  parsePetIdentifier,
  parseUpdateReminderInput,
  type RestRuntimeSnapshot,
  type RestSystemSnapshot,
} from "../../shared/contracts";
import { IPC_CHANNELS } from "../../shared/ipc-channels";
import type { AudioService } from "../audio/audio-service";
import type { ReminderScheduler } from "../reminders/reminder-scheduler";
import type { RestSessionController } from "../rest/rest-session-controller";
import type { SettingsStore } from "../settings/settings-store";
import type { WindowManager } from "../windows/window-manager";

interface Dependencies {
  settingsStore: Pick<SettingsStore, "load" | "update">;
  scheduler: Pick<ReminderScheduler, "refresh" | "getActivePrompt" | "resolvePrompt" | "snooze">;
  restController: Pick<RestSessionController, "startFromPrompt" | "endManually" | "getSnapshot">;
  audioService: Pick<AudioService, "importAssets" | "updateSources" | "reportPlaybackFailure">;
  windowManager: Pick<WindowManager, "getWindowKind" | "getOwnedWindow" | "broadcastRestSystemChanged">;
  getRuntimeSnapshot(): RestRuntimeSnapshot;
  idFactory?: () => string;
}

export function registerRestSystemIpc(dependencies: Dependencies): () => void {
  const handled: string[] = [];
  let active = true;
  const idFactory = dependencies.idFactory ?? randomUUID;

  const requireSettings = (senderId: number): void => {
    if (dependencies.windowManager.getWindowKind(senderId) !== "settings")
      throw new Error("This operation is available only from settings");
  };
  const requirePet = (senderId: number): void => {
    if (dependencies.windowManager.getWindowKind(senderId) !== "pet")
      throw new Error("This operation is available only from the pet window");
  };
  const snapshot = async (): Promise<RestSystemSnapshot> =>
    createRestSystemSnapshot(await dependencies.settingsStore.load(), dependencies.getRuntimeSnapshot());
  const broadcast = async (): Promise<RestSystemSnapshot> => {
    const result = await snapshot();
    if (active) dependencies.windowManager.broadcastRestSystemChanged(result);
    return result;
  };
  const refreshAndBroadcast = async (): Promise<RestSystemSnapshot> => {
    await dependencies.scheduler.refresh();
    return broadcast();
  };
  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void => {
    ipcMain.handle(channel, listener);
    handled.push(channel);
  };

  const playbackFailureListener = (event: IpcMainEvent, requestId: unknown, assetId: unknown): void => {
    try {
      requirePet(event.sender.id);
      if (!isSafeIdentifier(requestId) || (assetId !== null && !isSafeIdentifier(assetId))) return;
      void dependencies.audioService
        .reportPlaybackFailure(requestId, assetId)
        .then(() => broadcast())
        .catch(() => undefined);
    } catch {
      // Stale and unowned renderers receive no privileged operation.
    }
  };

  try {
    handle(IPC_CHANNELS.getRestSystemSnapshot, (event) => {
      dependencies.windowManager.getWindowKind(event.sender.id);
      return snapshot();
    });
    handle(IPC_CHANNELS.createReminder, async (event, value: unknown) => {
      requireSettings(event.sender.id);
      const input = parseCreateReminderInput(value);
      await dependencies.settingsStore.update((current) => {
        const used = new Set(current.reminders.map((item) => item.id));
        const id = createUniqueId(idFactory, used);
        return { ...current, reminders: [...current.reminders, { id, ...input, enabled: true }] };
      });
      return refreshAndBroadcast();
    });
    handle(IPC_CHANNELS.updateReminder, async (event, value: unknown) => {
      requireSettings(event.sender.id);
      const input = parseUpdateReminderInput(value);
      await dependencies.settingsStore.update((current) => {
        if (!current.reminders.some((item) => item.id === input.id)) throw new Error("Reminder does not exist");
        return { ...current, reminders: current.reminders.map((item) => (item.id === input.id ? input : item)) };
      });
      return refreshAndBroadcast();
    });
    handle(IPC_CHANNELS.deleteReminder, async (event, idValue: unknown) => {
      requireSettings(event.sender.id);
      const id = parsePetIdentifier(idValue);
      await dependencies.settingsStore.update((current) => {
        if (!current.reminders.some((item) => item.id === id)) throw new Error("Reminder does not exist");
        return { ...current, reminders: current.reminders.filter((item) => item.id !== id) };
      });
      return refreshAndBroadcast();
    });
    handle(IPC_CHANNELS.setReminderEnabled, async (event, idValue: unknown, enabled: unknown) => {
      requireSettings(event.sender.id);
      const id = parsePetIdentifier(idValue);
      if (typeof enabled !== "boolean") throw new Error("Invalid reminder enabled state");
      await dependencies.settingsStore.update((current) => {
        if (!current.reminders.some((item) => item.id === id)) throw new Error("Reminder does not exist");
        return {
          ...current,
          reminders: current.reminders.map((item) => (item.id === id ? { ...item, enabled } : item)),
        };
      });
      return refreshAndBroadcast();
    });
    handle(IPC_CHANNELS.retryReminderService, async (event) => {
      requireSettings(event.sender.id);
      return refreshAndBroadcast();
    });
    handle(IPC_CHANNELS.startPromptedRest, async (event, occurrenceIdValue: unknown) => {
      requirePet(event.sender.id);
      const occurrenceId = parseOccurrenceId(occurrenceIdValue);
      const prompt = dependencies.scheduler.getActivePrompt();
      if (!prompt || prompt.occurrenceId !== occurrenceId) throw new Error("Reminder prompt is not active");
      dependencies.restController.startFromPrompt(prompt);
      return broadcast();
    });
    handle(IPC_CHANNELS.snoozePrompt, async (event, occurrenceIdValue: unknown, minutes: unknown) => {
      requirePet(event.sender.id);
      const occurrenceId = parseOccurrenceId(occurrenceIdValue);
      if (minutes !== 5 && minutes !== 10 && minutes !== 15) throw new Error("Invalid snooze duration");
      dependencies.scheduler.snooze(occurrenceId, minutes);
      return broadcast();
    });
    handle(IPC_CHANNELS.skipPrompt, async (event, occurrenceIdValue: unknown) => {
      requirePet(event.sender.id);
      const occurrenceId = parseOccurrenceId(occurrenceIdValue);
      dependencies.scheduler.resolvePrompt(occurrenceId);
      return broadcast();
    });
    handle(IPC_CHANNELS.endRestSession, async (event) => {
      requirePet(event.sender.id);
      if (!dependencies.restController.getSnapshot().session) throw new Error("No rest session is active");
      dependencies.restController.endManually();
      return broadcast();
    });
    handle(IPC_CHANNELS.importAudio, async (event) => {
      requireSettings(event.sender.id);
      const owner = dependencies.windowManager.getOwnedWindow(event.sender.id);
      const selection = await dialog.showOpenDialog(owner, {
        title: "导入本地音频",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "音频", extensions: ["mp3", "wav", "ogg"] }],
      });
      if (selection.canceled || selection.filePaths.length === 0) return { imported: [], failures: [] };
      const result = await dependencies.audioService.importAssets(selection.filePaths);
      if (result.imported.length > 0) await broadcast();
      return result;
    });
    handle(IPC_CHANNELS.updateAudioSources, async (event, value: unknown) => {
      requireSettings(event.sender.id);
      await dependencies.audioService.updateSources(value);
      return broadcast();
    });
    ipcMain.on(IPC_CHANNELS.reportAudioPlaybackFailure, playbackFailureListener);
  } catch (error) {
    for (const channel of handled) ipcMain.removeHandler(channel);
    ipcMain.removeListener(IPC_CHANNELS.reportAudioPlaybackFailure, playbackFailureListener);
    throw error;
  }

  return () => {
    if (!active) return;
    active = false;
    for (const channel of handled) ipcMain.removeHandler(channel);
    ipcMain.removeListener(IPC_CHANNELS.reportAudioPlaybackFailure, playbackFailureListener);
  };
}

function createUniqueId(factory: () => string, used: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = factory().toLowerCase();
    if (isSafeIdentifier(id) && !used.has(id)) return id;
  }
  throw new Error("Could not generate a safe unique identifier");
}

function parseOccurrenceId(value: unknown): string {
  if (typeof value !== "string" || value.length > 96 || !/^[a-z0-9-]+$/.test(value)) {
    throw new Error("Invalid reminder occurrence identifier");
  }
  return value;
}
