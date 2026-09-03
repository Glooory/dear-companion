import { randomUUID } from "node:crypto";
import { ipcMain, type IpcMainEvent } from "electron";
import {
  createCompanionSystemSnapshot,
  isSafeIdentifier,
  parseCreateWorkScheduleInput,
  parsePetIdentifier,
  parseScreenEllipse,
  parseUpdateWorkScheduleInput,
  type CompanionSystemSnapshot,
} from "../../shared/contracts";
import { IPC_CHANNELS } from "../../shared/ipc-channels";
import type { CompanionStateController } from "../companion/companion-state-controller";
import type { PettingTracker } from "../interactions/petting-tracker";
import type { SettingsStore } from "../settings/settings-store";
import type { WindowManager } from "../windows/window-manager";

interface Dependencies {
  settingsStore: Pick<SettingsStore, "load" | "update">;
  controller: Pick<CompanionStateController, "getSnapshot" | "refresh" | "wakeFromSleep">;
  tracker: Pick<PettingTracker, "begin" | "cancel">;
  windowManager: Pick<WindowManager, "getWindowKind" | "getOwnedWindow">;
  idFactory?: () => string;
}

export function registerCompanionSystemIpc(dependencies: Dependencies): () => void {
  const handled: string[] = [];
  let active = true;
  const idFactory = dependencies.idFactory ?? randomUUID;
  const requireWindow = (senderId: number, kind: "pet" | "settings"): void => {
    if (dependencies.windowManager.getWindowKind(senderId) !== kind) {
      throw new Error(`This operation is available only from ${kind}`);
    }
  };
  const snapshot = async (): Promise<CompanionSystemSnapshot> =>
    createCompanionSystemSnapshot(await dependencies.settingsStore.load(), dependencies.controller.getSnapshot());
  const refreshAndSnapshot = async (): Promise<CompanionSystemSnapshot> => {
    await dependencies.controller.refresh();
    return snapshot();
  };
  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void => {
    ipcMain.handle(channel, listener);
    handled.push(channel);
  };
  const beginPetting = (event: IpcMainEvent, value: unknown): void => {
    try {
      requireWindow(event.sender.id, "pet");
      const region = parseScreenEllipse(value);
      const bounds = dependencies.windowManager.getOwnedWindow(event.sender.id).getBounds();
      if (
        region.centerX < bounds.x - 32 ||
        region.centerX > bounds.x + bounds.width + 32 ||
        region.centerY < bounds.y - 32 ||
        region.centerY > bounds.y + bounds.height + 32
      )
        return;
      dependencies.tracker.begin(region);
    } catch {
      // Stale senders and invalid regions never arm global cursor sampling.
    }
  };
  const cancelPetting = (event: IpcMainEvent): void => {
    try {
      requireWindow(event.sender.id, "pet");
      dependencies.tracker.cancel();
    } catch {
      // Stale senders cannot affect the tracker.
    }
  };

  try {
    handle(IPC_CHANNELS.getCompanionSystemSnapshot, (event) => {
      dependencies.windowManager.getWindowKind(event.sender.id);
      return snapshot();
    });
    handle(IPC_CHANNELS.createWorkSchedule, async (event, value: unknown) => {
      requireWindow(event.sender.id, "settings");
      const input = parseCreateWorkScheduleInput(value);
      await dependencies.settingsStore.update((current) => {
        const id = createUniqueId(idFactory, new Set(current.workSchedules.map((item) => item.id)));
        return { ...current, workSchedules: [...current.workSchedules, { id, ...input }] };
      });
      return refreshAndSnapshot();
    });
    handle(IPC_CHANNELS.updateWorkSchedule, async (event, value: unknown) => {
      requireWindow(event.sender.id, "settings");
      const input = parseUpdateWorkScheduleInput(value);
      await dependencies.settingsStore.update((current) => {
        if (!current.workSchedules.some((item) => item.id === input.id))
          throw new Error("Work schedule does not exist");
        return {
          ...current,
          workSchedules: current.workSchedules.map((item) => (item.id === input.id ? input : item)),
        };
      });
      return refreshAndSnapshot();
    });
    handle(IPC_CHANNELS.deleteWorkSchedule, async (event, value: unknown) => {
      requireWindow(event.sender.id, "settings");
      const id = parsePetIdentifier(value);
      await dependencies.settingsStore.update((current) => {
        if (!current.workSchedules.some((item) => item.id === id)) throw new Error("Work schedule does not exist");
        return { ...current, workSchedules: current.workSchedules.filter((item) => item.id !== id) };
      });
      return refreshAndSnapshot();
    });
    handle(IPC_CHANNELS.setWorkScheduleEnabled, async (event, value: unknown, enabled: unknown) => {
      requireWindow(event.sender.id, "settings");
      const id = parsePetIdentifier(value);
      if (typeof enabled !== "boolean") throw new Error("Invalid work schedule enabled state");
      await dependencies.settingsStore.update((current) => {
        if (!current.workSchedules.some((item) => item.id === id)) throw new Error("Work schedule does not exist");
        return {
          ...current,
          workSchedules: current.workSchedules.map((item) => (item.id === id ? { ...item, enabled } : item)),
        };
      });
      return refreshAndSnapshot();
    });
    handle(IPC_CHANNELS.wakeCompanion, async (event) => {
      requireWindow(event.sender.id, "pet");
      dependencies.controller.wakeFromSleep();
      return snapshot();
    });
    ipcMain.on(IPC_CHANNELS.beginPettingGesture, beginPetting);
    ipcMain.on(IPC_CHANNELS.cancelPettingGesture, cancelPetting);
  } catch (error) {
    for (const channel of handled) ipcMain.removeHandler(channel);
    ipcMain.removeListener(IPC_CHANNELS.beginPettingGesture, beginPetting);
    ipcMain.removeListener(IPC_CHANNELS.cancelPettingGesture, cancelPetting);
    throw error;
  }

  return () => {
    if (!active) return;
    active = false;
    for (const channel of handled) ipcMain.removeHandler(channel);
    ipcMain.removeListener(IPC_CHANNELS.beginPettingGesture, beginPetting);
    ipcMain.removeListener(IPC_CHANNELS.cancelPettingGesture, cancelPetting);
  };
}

function createUniqueId(factory: () => string, used: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = factory().toLowerCase();
    if (isSafeIdentifier(id) && !used.has(id)) return id;
  }
  throw new Error("Could not generate a safe unique identifier");
}
