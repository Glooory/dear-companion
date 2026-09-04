import { dialog, ipcMain, Menu, type IpcMainEvent } from "electron";
import {
  parseCompanionPace,
  parsePetIdentifier,
  type AppSettings,
  type PetSystemSnapshot,
} from "../../shared/contracts";
import { IPC_CHANNELS } from "../../shared/ipc-channels";
import type { CompanionStateController } from "../companion/companion-state-controller";
import type { PetPackService } from "../pets/pet-pack-service";
import type { SettingsStore } from "../settings/settings-store";
import type { WindowManager } from "../windows/window-manager";

interface PetSystemIpcDependencies {
  petPackService: Pick<
    PetPackService,
    | "getSnapshot"
    | "createPet"
    | "deletePet"
    | "deleteAsset"
    | "importAssets"
    | "updatePet"
    | "setActivePet"
    | "saveVoiceAsset"
    | "importVoiceAsset"
    | "cleanupUnreferencedVoiceAssets"
    | "getVoiceAssetAvailability"
  >;
  settingsStore: Pick<SettingsStore, "update">;
  windowManager: Pick<
    WindowManager,
    | "getWindowKind"
    | "getOwnedWindow"
    | "movePetBy"
    | "nudgePetBy"
    | "setPetIgnoreMouseEvents"
    | "getBubbleSystemSnapshot"
    | "setBubbleDialogue"
    | "setBubbleIgnoreMouseEvents"
    | "broadcastPetSystemChanged"
    | "isPetVisible"
    | "showPet"
    | "hidePet"
    | "openSettings"
    | "requestPetInteraction"
  >;
  onSettingsChanged?: (settings: AppSettings) => void;
  requestQuit: () => void;
  isRestSessionActive?: () => boolean;
  endRestSession?: () => void;
  companionController?: Pick<
    CompanionStateController,
    "getSnapshot" | "selectManualState" | "setManualWork" | "refresh"
  >;
}

export function registerPetSystemIpc({
  petPackService,
  settingsStore,
  windowManager,
  onSettingsChanged = () => undefined,
  requestQuit,
  isRestSessionActive = () => false,
  endRestSession = () => undefined,
  companionController,
}: PetSystemIpcDependencies): () => void {
  let active = true;
  const handledChannels: string[] = [];
  const voiceDraftOwners = new Set<number>();

  const broadcast = async (snapshot: PetSystemSnapshot): Promise<PetSystemSnapshot> => {
    await companionController?.refresh();
    if (active) windowManager.broadcastPetSystemChanged(snapshot);
    return snapshot;
  };

  const requireSettingsSender = (senderId: number): void => {
    if (windowManager.getWindowKind(senderId) !== "settings") {
      throw new Error("This operation is available only from settings");
    }
  };

  const trackVoiceDraftOwner = (sender: Electron.WebContents): void => {
    if (voiceDraftOwners.has(sender.id)) return;
    voiceDraftOwners.add(sender.id);
    sender.once("destroyed", () => {
      voiceDraftOwners.delete(sender.id);
      void petPackService.cleanupUnreferencedVoiceAssets().catch(() => undefined);
    });
  };

  const movePetListener = (event: IpcMainEvent, deltaX: unknown, deltaY: unknown): void => {
    try {
      if (windowManager.getWindowKind(event.sender.id) !== "pet") return;
      if (
        typeof deltaX !== "number" ||
        typeof deltaY !== "number" ||
        !Number.isFinite(deltaX) ||
        !Number.isFinite(deltaY) ||
        Math.abs(deltaX) > 256 ||
        Math.abs(deltaY) > 256
      )
        return;
      windowManager.movePetBy(deltaX, deltaY);
    } catch {
      // Unknown or stale renderer senders receive no privileged action.
    }
  };

  const nudgePetListener = (event: IpcMainEvent, deltaX: unknown, deltaY: unknown): void => {
    try {
      if (windowManager.getWindowKind(event.sender.id) !== "pet") return;
      if (
        typeof deltaX !== "number" ||
        typeof deltaY !== "number" ||
        !Number.isFinite(deltaX) ||
        !Number.isFinite(deltaY) ||
        Math.abs(deltaX) > 64 ||
        Math.abs(deltaY) > 64
      )
        return;
      windowManager.nudgePetBy(deltaX, deltaY);
    } catch {
      // Unknown or stale renderer senders receive no privileged action.
    }
  };

  const setIgnoreMouseEventsListener = (event: IpcMainEvent, ignore: unknown): void => {
    try {
      const kind = windowManager.getWindowKind(event.sender.id);
      if (kind === "pet") {
        windowManager.setPetIgnoreMouseEvents(Boolean(ignore));
      } else if (kind === "bubble") {
        windowManager.setBubbleIgnoreMouseEvents(Boolean(ignore));
      }
    } catch {
      // Unknown or stale renderer senders receive no privileged action.
    }
  };

  const setBubbleDialogueListener = (event: IpcMainEvent, dialogue: unknown): void => {
    try {
      if (windowManager.getWindowKind(event.sender.id) !== "pet") return;
      const validated = typeof dialogue === "string" ? dialogue : null;
      windowManager.setBubbleDialogue(validated);
    } catch {
      // Unknown or stale renderer senders receive no privileged action.
    }
  };

  const showContextMenuListener = (event: IpcMainEvent): void => {
    try {
      if (windowManager.getWindowKind(event.sender.id) !== "pet") return;
      const owner = windowManager.getOwnedWindow(event.sender.id);
      const visible = windowManager.isPetVisible();
      const companion = companionController?.getSnapshot();
      const ordinaryEnabled = !companion?.systemSuspended;
      const lifeStateSwitchEnabled = ordinaryEnabled && companion?.lifeState !== "working";
      const playEnabled =
        lifeStateSwitchEnabled && (companion?.lifeState === "daily-calm" || companion?.lifeState === "daily-playful");
      const menu = Menu.buildFromTemplate([
        ...(companionController && companion
          ? [
              {
                label: currentCompanionLabel(companion),
                enabled: false,
              },
              {
                label: "逗逗它",
                enabled: playEnabled,
                click: () => windowManager.requestPetInteraction({ type: "play-now" }),
              },
              {
                label: "安静待着",
                enabled: lifeStateSwitchEnabled,
                click: () => companionController.selectManualState("daily-calm"),
              },
              ...(companion.available.sleeping
                ? [
                    {
                      label: "让它打个盹",
                      enabled: lifeStateSwitchEnabled,
                      click: () => companionController.selectManualState("sleeping"),
                    },
                  ]
                : companion.available.drowsy
                  ? [
                      {
                        label: "让它歇一会儿",
                        enabled: lifeStateSwitchEnabled,
                        click: () => companionController.selectManualState("drowsy"),
                      },
                    ]
                  : []),
              {
                label: companion.manualWorkActive
                  ? companion.scheduledWorkActive
                    ? "结束手动专注"
                    : "结束专注"
                  : companion.scheduledWorkActive
                    ? "专注时段进行中"
                    : "开始专注",
                enabled: ordinaryEnabled && (!companion.scheduledWorkActive || companion.manualWorkActive),
                click: () => companionController.setManualWork(!companion.manualWorkActive),
              },
              ...(companion.manualSelection !== "auto"
                ? [
                    {
                      label: "恢复自动状态",
                      enabled: ordinaryEnabled,
                      click: () => companionController.selectManualState("auto"),
                    },
                  ]
                : []),
              { type: "separator" as const },
            ]
          : []),
        {
          label: visible ? "隐藏伙伴" : "显示伙伴",
          click: () => {
            void setVisibility(!visible).catch(() => undefined);
          },
        },
        {
          label: "添加休息提醒…",
          click: () => {
            void windowManager.openSettings({ tab: "rest", action: "new-reminder" }).catch(() => undefined);
          },
        },
        {
          label: "设置…",
          click: () => {
            void windowManager.openSettings().catch(() => undefined);
          },
        },
        ...(isRestSessionActive() ? [{ label: "结束休息", click: endRestSession }] : []),
        { type: "separator" },
        { label: "退出 Dear Companion", click: requestQuit },
      ]);
      menu.popup({ window: owner });
    } catch {
      // The menu is intentionally unavailable to unknown or stale senders.
    }
  };

  const setVisibility = async (visible: boolean): Promise<void> => {
    const settings = await settingsStore.update((current) => ({
      ...current,
      petWindow: { ...current.petWindow, visible },
    }));
    if (!active) return;
    onSettingsChanged(settings);
    if (visible) await windowManager.showPet();
    else windowManager.hidePet();
  };

  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void => {
    ipcMain.handle(channel, listener);
    handledChannels.push(channel);
  };

  try {
    handle(IPC_CHANNELS.getPetSystemSnapshot, (event) => {
      windowManager.getWindowKind(event.sender.id);
      return petPackService.getSnapshot();
    });
    handle(IPC_CHANNELS.previewCompanionPace, (event, value: unknown) => {
      requireSettingsSender(event.sender.id);
      const pace = parseCompanionPace(value);
      windowManager.requestPetInteraction({ type: "preview-pace", pace });
    });

    handle(IPC_CHANNELS.createPet, async (event, name: unknown) => {
      requireSettingsSender(event.sender.id);
      return broadcast(await petPackService.createPet(name));
    });

    handle(IPC_CHANNELS.deletePet, async (event, petId: unknown) => {
      requireSettingsSender(event.sender.id);
      return broadcast(await petPackService.deletePet(petId));
    });

    handle(IPC_CHANNELS.deletePetAsset, async (event, petId: unknown, assetId: unknown) => {
      requireSettingsSender(event.sender.id);
      return broadcast(await petPackService.deleteAsset(petId, assetId));
    });

    handle(IPC_CHANNELS.importPetAssets, async (event, petId: unknown) => {
      requireSettingsSender(event.sender.id);
      const validatedPetId = parsePetIdentifier(petId);
      const snapshot = await petPackService.getSnapshot();
      if (!snapshot.pets.some((pet) => pet.id === validatedPetId)) {
        throw new Error("Pet does not exist");
      }
      const owner = windowManager.getOwnedWindow(event.sender.id);
      const selection = await dialog.showOpenDialog(owner, {
        title: "导入透明照片",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "透明图片", extensions: ["png", "webp"] }],
      });
      if (selection.canceled || selection.filePaths.length === 0) {
        return { imported: [], failures: [] };
      }
      const result = await petPackService.importAssets(validatedPetId, selection.filePaths);
      if (result.imported.length > 0) await broadcast(await petPackService.getSnapshot());
      return result;
    });

    handle(IPC_CHANNELS.savePetVoice, async (event, petId: unknown, data: unknown, extension: unknown) => {
      requireSettingsSender(event.sender.id);
      if (!(data instanceof Uint8Array)) {
        throw new Error("Invalid audio buffer");
      }
      if (typeof extension !== "string") {
        throw new Error("Invalid extension");
      }
      trackVoiceDraftOwner(event.sender);
      return petPackService.saveVoiceAsset(petId, Buffer.from(data), extension);
    });

    handle(IPC_CHANNELS.importPetVoice, async (event, petId: unknown) => {
      requireSettingsSender(event.sender.id);
      const validatedPetId = parsePetIdentifier(petId);
      const snapshot = await petPackService.getSnapshot();
      if (!snapshot.pets.some((pet) => pet.id === validatedPetId)) {
        throw new Error("Pet does not exist");
      }
      const owner = windowManager.getOwnedWindow(event.sender.id);
      const selection = await dialog.showOpenDialog(owner, {
        title: "导入对白声音",
        properties: ["openFile"],
        filters: [{ name: "音频文件", extensions: ["mp3", "wav", "m4a", "ogg", "webm"] }],
      });
      if (selection.canceled || selection.filePaths.length === 0) {
        return null;
      }
      trackVoiceDraftOwner(event.sender);
      return petPackService.importVoiceAsset(validatedPetId, selection.filePaths[0]!);
    });

    handle(IPC_CHANNELS.cleanupPetVoiceDrafts, async (event, petId: unknown) => {
      requireSettingsSender(event.sender.id);
      await petPackService.cleanupUnreferencedVoiceAssets(petId);
    });

    handle(IPC_CHANNELS.getPetVoiceAvailability, async (event, petId: unknown, voiceIds: unknown) => {
      requireSettingsSender(event.sender.id);
      if (!Array.isArray(voiceIds) || voiceIds.length > 128) throw new Error("Invalid voice identifiers");
      return petPackService.getVoiceAssetAvailability(petId, voiceIds);
    });

    handle(IPC_CHANNELS.updatePet, async (event, input: unknown) => {
      requireSettingsSender(event.sender.id);
      return broadcast(await petPackService.updatePet(input));
    });

    handle(IPC_CHANNELS.setActivePet, async (event, petId: unknown) => {
      requireSettingsSender(event.sender.id);
      return broadcast(await petPackService.setActivePet(petId));
    });

    handle(IPC_CHANNELS.getBubbleSystemSnapshot, async () => {
      return windowManager.getBubbleSystemSnapshot();
    });

    ipcMain.on(IPC_CHANNELS.movePetBy, movePetListener);
    ipcMain.on(IPC_CHANNELS.nudgePetBy, nudgePetListener);
    ipcMain.on(IPC_CHANNELS.setPetIgnoreMouseEvents, setIgnoreMouseEventsListener);
    ipcMain.on(IPC_CHANNELS.setBubbleDialogue, setBubbleDialogueListener);
    ipcMain.on(IPC_CHANNELS.showPetContextMenu, showContextMenuListener);
  } catch (error) {
    for (const channel of handledChannels) ipcMain.removeHandler(channel);
    ipcMain.removeListener(IPC_CHANNELS.movePetBy, movePetListener);
    ipcMain.removeListener(IPC_CHANNELS.nudgePetBy, nudgePetListener);
    ipcMain.removeListener(IPC_CHANNELS.setPetIgnoreMouseEvents, setIgnoreMouseEventsListener);
    ipcMain.removeListener(IPC_CHANNELS.setBubbleDialogue, setBubbleDialogueListener);
    ipcMain.removeListener(IPC_CHANNELS.showPetContextMenu, showContextMenuListener);
    throw error;
  }

  return () => {
    if (!active) return;
    active = false;
    for (const channel of handledChannels) ipcMain.removeHandler(channel);
    ipcMain.removeListener(IPC_CHANNELS.movePetBy, movePetListener);
    ipcMain.removeListener(IPC_CHANNELS.nudgePetBy, nudgePetListener);
    ipcMain.removeListener(IPC_CHANNELS.setPetIgnoreMouseEvents, setIgnoreMouseEventsListener);
    ipcMain.removeListener(IPC_CHANNELS.setBubbleDialogue, setBubbleDialogueListener);
    ipcMain.removeListener(IPC_CHANNELS.showPetContextMenu, showContextMenuListener);
  };
}

function currentCompanionLabel(
  companion: ReturnType<NonNullable<PetSystemIpcDependencies["companionController"]>["getSnapshot"]>
): string {
  if (companion.systemSuspended) return "当前状态：休息中";
  if (companion.lifeState === "working") return "当前状态：专注工作中";
  if (companion.lifeState === "sleeping") return "当前状态：打盹中";
  if (companion.lifeState === "drowsy") return "当前状态：闭目小憩";
  if (companion.manualSelection === "daily-calm") return "当前状态：安静模式";
  const paceLabel = companion.pace === "quiet" ? "安静" : companion.pace === "lively" ? "活跃" : "惬意";
  return `当前状态：自动 · ${paceLabel}`;
}
