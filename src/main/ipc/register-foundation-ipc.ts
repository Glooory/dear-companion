import { ipcMain, type IpcMainEvent } from "electron";
import { parseSettingsNavigationTarget, type AppSettings } from "../../shared/contracts";
import { IPC_CHANNELS } from "../../shared/ipc-channels";
import type { SettingsStore } from "../settings/settings-store";
import type { WindowManager } from "../windows/window-manager";

interface FoundationIpcDependencies {
  settingsStore: Pick<SettingsStore, "load" | "update">;
  windowManager: Pick<
    WindowManager,
    "getWindowKind" | "hidePet" | "showPet" | "openSettings" | "getPendingSettingsTarget"
  >;
  onSettingsChanged?: (settings: AppSettings) => void;
}

export function registerFoundationIpc({
  settingsStore,
  windowManager,
  onSettingsChanged = () => undefined,
}: FoundationIpcDependencies): () => void {
  let getSettingsRegistered = false;
  let setPetVisibilityRegistered = false;
  let openSettingsRegistered = false;
  let getWindowKindRegistered = false;
  let getSettingsNavigationTargetRegistered = false;
  let active = true;
  const getWindowKindListener = (event: IpcMainEvent): void => {
    event.returnValue = windowManager.getWindowKind(event.sender.id);
  };

  const cleanup = (): void => {
    if (!active) return;
    active = false;
    if (getSettingsRegistered) ipcMain.removeHandler(IPC_CHANNELS.getSettings);
    if (setPetVisibilityRegistered) ipcMain.removeHandler(IPC_CHANNELS.setPetVisibility);
    if (openSettingsRegistered) ipcMain.removeHandler(IPC_CHANNELS.openSettings);
    if (getSettingsNavigationTargetRegistered) {
      ipcMain.removeHandler(IPC_CHANNELS.getSettingsNavigationTarget);
    }
    if (getWindowKindRegistered) {
      ipcMain.removeListener(IPC_CHANNELS.getWindowKind, getWindowKindListener);
    }
  };

  try {
    ipcMain.handle(IPC_CHANNELS.getSettings, (event) => {
      windowManager.getWindowKind(event.sender.id);
      return settingsStore.load();
    });
    getSettingsRegistered = true;

    ipcMain.handle(IPC_CHANNELS.setPetVisibility, async (event, visible: unknown) => {
      windowManager.getWindowKind(event.sender.id);
      if (typeof visible !== "boolean") throw new TypeError("visible must be a boolean");

      const settings = await settingsStore.update((current) => ({
        ...current,
        petWindow: { ...current.petWindow, visible },
      }));
      if (!active) return settings;

      onSettingsChanged(settings);
      if (visible) await windowManager.showPet();
      else windowManager.hidePet();

      return settings;
    });
    setPetVisibilityRegistered = true;

    ipcMain.handle(IPC_CHANNELS.openSettings, async (event, target: unknown) => {
      windowManager.getWindowKind(event.sender.id);
      await windowManager.openSettings(parseSettingsNavigationTarget(target) ?? undefined);
    });
    openSettingsRegistered = true;

    ipcMain.handle(IPC_CHANNELS.getSettingsNavigationTarget, (event) => {
      windowManager.getWindowKind(event.sender.id);
      return windowManager.getPendingSettingsTarget();
    });
    getSettingsNavigationTargetRegistered = true;

    ipcMain.on(IPC_CHANNELS.getWindowKind, getWindowKindListener);
    getWindowKindRegistered = true;
  } catch (error) {
    cleanup();
    throw error;
  }

  return cleanup;
}
