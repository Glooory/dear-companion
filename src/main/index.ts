import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, dialog, nativeImage, powerMonitor, screen, session } from "electron";
import {
  createCompanionSystemSnapshot,
  createPetSystemSnapshot,
  createRestSystemSnapshot,
  type AppSettings,
  type RestRuntimeSnapshot,
} from "../shared/contracts";
import { parseLaunchIntent } from "./app/launch-intent";
import { prepareTray, runStartup, StartupIntentQueue, terminateFailedStartup } from "./app/startup";
import { AudioService } from "./audio/audio-service";
import { AutostartService } from "./autostart/autostart-service";
import { CompanionStateController } from "./companion/companion-state-controller";
import { SharpImageDecoder } from "./images/image-decoder";
import { PettingTracker } from "./interactions/petting-tracker";
import { registerCompanionSystemIpc } from "./ipc/register-companion-system-ipc";
import { registerFoundationIpc } from "./ipc/register-foundation-ipc";
import { registerPetSystemIpc } from "./ipc/register-pet-system-ipc";
import { registerReleaseHardeningIpc } from "./ipc/register-release-hardening-ipc";
import { registerRestSystemIpc } from "./ipc/register-rest-system-ipc";
import { PetPackService } from "./pets/pet-pack-service";
import { ReminderScheduler } from "./reminders/reminder-scheduler";
import { RestSessionController } from "./rest/rest-session-controller";
import { registerAppProtocol, registerAppScheme } from "./security/app-protocol";
import { registerNetworkPolicy } from "./security/network-policy";
import { SettingsStore } from "./settings/settings-store";
import { TrayController } from "./tray/tray-controller";
import { WindowManager } from "./windows/window-manager";

registerAppScheme();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
let windowManager: WindowManager | null = null;
let settingsStore: SettingsStore | null = null;
let trayController: TrayController | null = null;
let disposeFoundationIpc: (() => void) | null = null;
let disposePetSystemIpc: (() => void) | null = null;
let disposeCompanionSystemIpc: (() => void) | null = null;
let disposeRestSystemIpc: (() => void) | null = null;
let disposeReleaseHardeningIpc: (() => void) | null = null;
let disposeNetworkPolicy: (() => void) | null = null;
let disposePowerResume: (() => void) | null = null;
let reminderScheduler: ReminderScheduler | null = null;
let restSessionController: RestSessionController | null = null;
let companionStateController: CompanionStateController | null = null;
let pettingTracker: PettingTracker | null = null;
let disposePendingStartup: (() => void) | null = null;
let isQuitting = false;
let startupReady = false;

const startupIntents = new StartupIntentQueue({
  secondInstance: () => activateSecondInstance(),
  activate: () => {
    void activateApplication().catch(() => undefined);
  },
});

function requestQuit(): void {
  if (isQuitting) return;
  isQuitting = true;
  app.quit();
}

async function persistAndShowPet(): Promise<AppSettings | null> {
  const store = settingsStore;
  const manager = windowManager;
  if (!store || !manager || isQuitting) return null;

  const settings = await store.update((current) => ({
    ...current,
    petWindow: { ...current.petWindow, visible: true },
  }));
  if (manager !== windowManager || isQuitting) return null;

  notifySettingsChanged(settings);
  await manager.showPet();
  if (manager !== windowManager || isQuitting) return null;
  return settings;
}

function notifySettingsChanged(settings: AppSettings): void {
  trayController?.refresh(settings);
  windowManager?.broadcastPetSystemChanged(createPetSystemSnapshot(settings));
  void companionStateController?.refresh().catch(() => undefined);
}

function activateSecondInstance(): void {
  const manager = windowManager;
  if (!manager) return;
  manager.focusSettingsIfOpen();
  void persistAndShowPet().catch(() => undefined);
}

async function activateApplication(): Promise<void> {
  const manager = windowManager;
  if (!manager) return;

  const settings = await persistAndShowPet();
  if (settings?.activePetId === null) await manager.openSettings();
}

function disposeApplication(): void {
  startupReady = false;
  startupIntents.reset();
  const ownedTray = trayController;
  const ownedWindowManager = windowManager;
  const ownedScheduler = reminderScheduler;
  const ownedRestController = restSessionController;
  const ownedCompanionController = companionStateController;
  const ownedPettingTracker = pettingTracker;
  const disposers = [
    disposePendingStartup,
    disposeFoundationIpc,
    disposePetSystemIpc,
    disposeCompanionSystemIpc,
    disposeRestSystemIpc,
    disposeReleaseHardeningIpc,
    disposeNetworkPolicy,
    disposePowerResume,
    ownedScheduler ? () => ownedScheduler.dispose() : null,
    ownedRestController ? () => ownedRestController.dispose() : null,
    ownedCompanionController ? () => ownedCompanionController.dispose() : null,
    ownedPettingTracker ? () => ownedPettingTracker.dispose() : null,
    ownedTray ? () => ownedTray.dispose() : null,
    ownedWindowManager ? () => ownedWindowManager.dispose() : null,
  ];
  disposePendingStartup = null;
  disposeFoundationIpc = null;
  disposePetSystemIpc = null;
  disposeCompanionSystemIpc = null;
  disposeRestSystemIpc = null;
  disposeReleaseHardeningIpc = null;
  disposeNetworkPolicy = null;
  disposePowerResume = null;
  reminderScheduler = null;
  restSessionController = null;
  companionStateController = null;
  pettingTracker = null;
  trayController = null;
  windowManager = null;
  settingsStore = null;

  for (const dispose of disposers) {
    try {
      dispose?.();
    } catch {
      // Cleanup is best-effort; startup failure still must request terminal quit.
    }
  }
}

function handleStartupFailure(): void {
  terminateFailedStartup({
    cleanup: disposeApplication,
    report: () => {
      dialog.showErrorBox("Dear Companion 无法启动", "应用没有正常打开。请退出后再试一次。你的照片和设置不会丢失。");
    },
    quit: requestQuit,
  });
}

if (!hasSingleInstanceLock) {
  requestQuit();
} else {
  app.on("second-instance", () => {
    if (isQuitting) return;
    if (!startupReady) {
      startupIntents.request("second-instance");
      return;
    }
    activateSecondInstance();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    disposeApplication();
  });

  app.on("window-all-closed", () => {
    // The tray remains the application's control surface when both windows are hidden or closed.
  });

  app.on("activate", () => {
    if (process.platform !== "darwin" || isQuitting) return;
    if (!startupReady) {
      startupIntents.request("activate");
      return;
    }
    void activateApplication().catch(() => undefined);
  });

  void runStartup(async () => {
    await app.whenReady();
    if (process.platform === "darwin" && app.dock) {
      const iconPath = app.isPackaged ? join(process.resourcesPath, "icon.png") : join(process.cwd(), "build/icon.png");
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
      app.dock.hide();
    }
    const mainDirectory = dirname(fileURLToPath(import.meta.url));
    const preloadPath = join(mainDirectory, "../preload/index.js");
    const rendererRoot = join(mainDirectory, "../renderer");
    const developmentOrigin = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
    disposeNetworkPolicy = registerNetworkPolicy(session.defaultSession, {
      ...(developmentOrigin ? { developmentOrigin } : {}),
      getWindowKind: (webContentsId) => {
        try {
          return windowManager?.getWindowKind(webContentsId) ?? null;
        } catch {
          return null;
        }
      },
    });

    if (process.env.DEAR_COMPANION_BUILD_SMOKE === "1") {
      await registerAppProtocol(rendererRoot);
      app.quit();
      return;
    }

    const store = new SettingsStore(app.getPath("userData"));
    await store.load();
    const autostartService = new AutostartService({ app, settingsStore: store });
    const loginItemSettings = process.platform === "darwin" && app.isPackaged ? app.getLoginItemSettings() : {};
    const launchIntent = app.isPackaged ? parseLaunchIntent(process.argv, loginItemSettings) : { autostart: false };
    if (!launchIntent.autostart) await autostartService.reconcilePersistedPreference();
    const petPackService = new PetPackService(app.getPath("userData"), store, new SharpImageDecoder());
    await petPackService.cleanupOrphanedPetDirectories();
    await petPackService.cleanupUnreferencedVoiceAssets();
    let runtimeManager: WindowManager | null = null;
    let runtimeTray: TrayController | null = null;
    let runtimeScheduler: ReminderScheduler | null = null;
    let runtimeRestController: RestSessionController | null = null;
    let runtimeCompanionController: CompanionStateController | null = null;
    let runtimePettingTracker: PettingTracker | null = null;
    let companionSnapshotGeneration = 0;
    let reminderServiceStatus: RestRuntimeSnapshot["serviceStatus"] = "healthy";
    let reminderServiceError: RestRuntimeSnapshot["serviceError"];

    const getRuntimeSnapshot = (): RestRuntimeSnapshot => ({
      serviceStatus: reminderServiceStatus,
      ...(reminderServiceError ? { serviceError: { ...reminderServiceError } } : {}),
      prompt: runtimeScheduler?.getActivePrompt() ?? null,
      session: runtimeRestController?.getSnapshot().session ?? null,
    });

    const broadcastRestRuntime = async (): Promise<void> => {
      const manager = runtimeManager;
      if (!manager || isQuitting) return;
      const runtime = getRuntimeSnapshot();
      const suspended = Boolean(runtime.prompt || runtime.session);
      runtimeCompanionController?.setSystemSuspended(suspended);
      runtimePettingTracker?.setSystemSuspended(suspended);
      const settings = await store.load();
      manager.broadcastRestSystemChanged(createRestSystemSnapshot(settings, runtime));
      runtimeTray?.setRestSessionActive(runtime.session !== null);
      if (!runtime.prompt && !runtime.session) await manager.restorePersistedPetVisibility();
    };

    const localAudioService = new AudioService({
      userDataPath: app.getPath("userData"),
      settingsStore: store,
      getRuntimeSnapshot,
      onPlaybackRequested: (request) => runtimeManager?.broadcastAudioPlaybackRequested(request),
    });
    await localAudioService.cleanupUnreferencedReminderVoices();
    await registerAppProtocol(
      rendererRoot,
      (petId, assetId) => petPackService.resolveAssetPath(petId, assetId),
      (assetId) => localAudioService.resolveAssetPath(assetId),
      (petId, voiceId) => petPackService.resolveVoiceAssetPath(petId, voiceId),
      (voiceId) => localAudioService.resolveReminderVoicePath(voiceId)
    );
    if (isQuitting) return;

    const manager = new WindowManager({
      settingsStore: store,
      userDataPath: app.getPath("userData"),
      preloadPath,
      rendererRoot,
      isPackaged: app.isPackaged,
    });
    runtimeManager = manager;
    const endRestSession = (): void => runtimeRestController?.endManually();
    const notifyRuntimeSettingsChanged = (nextSettings: AppSettings): void => {
      runtimeTray?.refresh(nextSettings);
      manager.broadcastPetSystemChanged(createPetSystemSnapshot(nextSettings));
      void runtimeCompanionController?.refresh().catch(() => undefined);
    };
    const tray = new TrayController({
      settingsStore: store,
      windowManager: manager,
      requestQuit,
      onSettingsChanged: notifyRuntimeSettingsChanged,
      endRestSession,
      isPackaged: app.isPackaged,
    });
    runtimeTray = tray;
    disposePendingStartup = () => {
      for (const dispose of [() => tray.dispose(), () => manager.dispose()]) {
        try {
          dispose();
        } catch {
          // Continue releasing the remaining startup-owned resources.
        }
      }
    };
    const settings = await prepareTray({
      settingsStore: store,
      tray,
      isQuitting: () => isQuitting,
    });
    if (!settings) {
      disposePendingStartup?.();
      disposePendingStartup = null;
      return;
    }

    settingsStore = store;
    windowManager = manager;
    trayController = tray;
    disposePendingStartup = null;

    const scheduler = new ReminderScheduler({
      loadSchedules: async () => (await store.load()).reminders,
      isRestActive: () => Boolean(runtimeRestController?.getSnapshot().session),
      onPrompt: async (prompt) => {
        await manager.showPetForRuntime();
        await broadcastRestRuntime();
        await localAudioService.requestPlayback(
          "reminder",
          prompt.sounds.reminder,
          prompt.voiceAssetId
            ? {
                voiceAssetId: prompt.voiceAssetId,
                voiceTrimStart: prompt.voiceTrimStart,
                voiceTrimEnd: prompt.voiceTrimEnd,
              }
            : undefined
        );
      },
      onPromptDismissed: () => {
        void broadcastRestRuntime().catch(() => undefined);
      },
      onError: (error) => {
        reminderServiceStatus = "error";
        reminderServiceError = error;
        void broadcastRestRuntime().catch(() => undefined);
      },
      onHealthy: () => {
        reminderServiceStatus = "healthy";
        reminderServiceError = undefined;
        void broadcastRestRuntime().catch(() => undefined);
      },
    });
    runtimeScheduler = scheduler;
    const restController = new RestSessionController({
      getCursorScreenPoint: () => screen.getCursorScreenPoint(),
      onPromptConsumed: (occurrenceId) => scheduler.resolvePrompt(occurrenceId),
      onCryingAudio: (enabled) => {
        void localAudioService.requestPlayback("crying", enabled).catch(() => undefined);
      },
      onChanged: () => {
        void broadcastRestRuntime().catch(() => undefined);
      },
    });
    runtimeRestController = restController;
    reminderScheduler = scheduler;
    restSessionController = restController;

    const companionController = new CompanionStateController({
      loadSettings: () => store.load(),
      onChanged: (runtime) => {
        const generation = ++companionSnapshotGeneration;
        void store
          .load()
          .then((current) => {
            if (!isQuitting && runtimeManager === manager && generation === companionSnapshotGeneration) {
              manager.broadcastCompanionSystemChanged(createCompanionSystemSnapshot(current, runtime));
            }
          })
          .catch(() => undefined);
      },
    });
    const tracker = new PettingTracker({
      getCursorScreenPoint: () => screen.getCursorScreenPoint(),
      onDetected: () => manager.broadcastPettingGestureDetected(),
    });
    runtimeCompanionController = companionController;
    runtimePettingTracker = tracker;
    companionStateController = companionController;
    pettingTracker = tracker;
    await companionController.start();

    const onSettingsChanged = (nextSettings: AppSettings): void => {
      notifySettingsChanged(nextSettings);
    };
    disposeFoundationIpc = registerFoundationIpc({
      settingsStore: store,
      windowManager: manager,
      onSettingsChanged,
    });
    disposePetSystemIpc = registerPetSystemIpc({
      petPackService,
      settingsStore: store,
      windowManager: manager,
      onSettingsChanged,
      requestQuit,
      isRestSessionActive: () => restController.getSnapshot().session !== null,
      endRestSession,
      companionController,
    });
    disposeCompanionSystemIpc = registerCompanionSystemIpc({
      settingsStore: store,
      controller: companionController,
      tracker,
      windowManager: manager,
    });
    disposeRestSystemIpc = registerRestSystemIpc({
      settingsStore: store,
      scheduler,
      restController,
      audioService: localAudioService,
      windowManager: manager,
      getRuntimeSnapshot,
    });
    disposeReleaseHardeningIpc = registerReleaseHardeningIpc({
      autostartService,
      windowManager: manager,
    });
    const handleResume = (): void => {
      scheduler.handleResume();
      restController.handleResume();
      companionController.handleResume();
      tracker.cancel();
      void broadcastRestRuntime().catch(() => undefined);
    };
    powerMonitor.on("resume", handleResume);
    disposePowerResume = () => powerMonitor.removeListener("resume", handleResume);
    await scheduler.start();
    if (isQuitting || settingsStore !== store || windowManager !== manager || trayController !== tray) {
      return;
    }

    tray.refresh(settings);
    if (settings.petWindow.visible && (!launchIntent.autostart || settings.activePetId !== null)) {
      await manager.showPet();
    }
    if (isQuitting || windowManager !== manager) return;
    if (!launchIntent.autostart && settings.activePetId === null) await manager.openSettings();
    if (isQuitting || windowManager !== manager) return;
    startupReady = true;
    startupIntents.markReady();
  }, handleStartupFailure);
}
