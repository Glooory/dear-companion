import { app, BrowserWindow, screen, type Event as ElectronEvent } from "electron";
import {
  BUBBLE_DIALOGUE_WINDOW_HEIGHT,
  BUBBLE_REST_WINDOW_HEIGHT,
  BUBBLE_WINDOW_WIDTH,
  resolvePetWindowSize,
  type AudioPlaybackRequest,
  type BubbleSystemSnapshot,
  type CompanionSystemSnapshot,
  type PetInteractionRequest,
  type PetRendererStatus,
  type PetSystemSnapshot,
  type RestSystemSnapshot,
  type SettingsNavigationTarget,
  type WindowKind,
} from "../../shared/contracts";
import { IPC_CHANNELS } from "../../shared/ipc-channels";
import { CrashRecoveryBudget } from "../app/crash-recovery";
import type { SettingsStore } from "../settings/settings-store";
import {
  clampRectToWorkArea,
  moveRectWithinWorkArea,
  resolveBubbleWindowBounds,
  resolvePetWindowBounds,
  resolveSettingsWindowBounds,
  type DisplaySnapshot,
  type Point,
  type Rect,
  type SettingsWindowBounds,
} from "./display-placement";
import { PetPresenceTransitionController } from "./pet-presence-transition";
import { loadSettingsWindowState, saveSettingsWindowState } from "./settings-window-state";
import { createBubbleWindowOptions, createPetWindowOptions, createSettingsWindowOptions } from "./window-options";

type WindowSettingsStore = Pick<SettingsStore, "load" | "update">;

interface WindowManagerOptions {
  settingsStore: WindowSettingsStore;
  preloadPath: string;
  rendererRoot: string;
  isPackaged: boolean;
  userDataPath?: string;
}

export class WindowManager {
  private disposed = false;
  private petWindow: BrowserWindow | null = null;
  private bubbleWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private petWindowReady = false;
  private petWindowPlaced = false;
  private petVisibilityRequested = false;
  private bubbleWindowReady = false;
  private settingsWindowReady = false;
  private readonly crashRecoveryBudget = new CrashRecoveryBudget();
  private petRendererStatus: PetRendererStatus = { state: "healthy" };
  private readonly settingsStore: WindowSettingsStore;
  private readonly preloadPath: string;
  private readonly isPackaged: boolean;
  private readonly userDataPath?: string;
  private lastSettingsBounds: SettingsWindowBounds | null = null;
  private settingsBoundsLoaded = false;
  private readonly windowListenerDisposers = new Map<BrowserWindow, Array<() => void>>();
  private pendingSettingsTarget: SettingsNavigationTarget | null = null;
  private petIgnoreMouseEvents: boolean | null = null;
  private bubbleIgnoreMouseEvents: boolean | null = null;
  private bubbleDialogue: string | null = null;
  private lastRestSnapshot: RestSystemSnapshot | null = null;
  private currentPetTargetHeight = 180;
  private pendingPetShowAnimation = true;
  private pendingPetShowCompletion: Promise<void> | null = null;
  private readonly petPresenceTransition = new PetPresenceTransitionController({
    send: (request) => {
      const petWindow = this.petWindow;
      if (!petWindow || petWindow.isDestroyed() || petWindow.webContents.isDestroyed()) return;
      petWindow.webContents.send(IPC_CHANNELS.petPresenceTransitionRequested, request);
    },
    hide: () => {
      const petWindow = this.petWindow;
      if (!this.petVisibilityRequested && petWindow && !petWindow.isDestroyed()) petWindow.hide();
    },
    reveal: () => {
      const petWindow = this.petWindow;
      if (!petWindow || petWindow.isDestroyed()) return;
      try {
        petWindow.setOpacity(1);
      } catch {
        // The renderer may acknowledge while the native window is being destroyed.
      }
    },
    settle: () => this.syncBubblePlacement(),
  });

  constructor({ settingsStore, preloadPath, isPackaged, userDataPath }: WindowManagerOptions) {
    this.settingsStore = settingsStore;
    this.preloadPath = preloadPath;
    this.isPackaged = isPackaged;
    this.userDataPath = userDataPath;
  }

  getPendingSettingsTarget(): SettingsNavigationTarget | null {
    const target = this.pendingSettingsTarget;
    this.pendingSettingsTarget = null;
    return target;
  }

  async showPet(animate = true): Promise<void> {
    if (this.disposed) return;
    if (this.crashRecoveryBudget.getState() === "safe-mode") return;
    this.petVisibilityRequested = true;
    this.pendingPetShowAnimation = animate;
    if (this.petWindow && !this.petWindow.isDestroyed()) {
      if (this.petWindowReady && this.petWindowPlaced) await this.showPetWindow(this.petWindow, animate);
      else if (this.pendingPetShowCompletion) await this.pendingPetShowCompletion;
      return;
    }

    const petWindow = new BrowserWindow(createPetWindowOptions(this.preloadPath));
    petWindow.setHasShadow(false);
    this.petWindow = petWindow;
    this.petIgnoreMouseEvents = null;
    this.petWindowReady = false;
    this.petWindowPlaced = false;
    this.secureWindow(petWindow);

    let initialShowStarted = false;
    let resolveInitialShow = (): void => undefined;
    let rejectInitialShow: (error: unknown) => void = () => undefined;
    const initialShowCompleted = new Promise<void>((resolve, reject) => {
      resolveInitialShow = resolve;
      rejectInitialShow = reject;
    });
    void initialShowCompleted.catch(() => undefined);
    this.pendingPetShowCompletion = initialShowCompleted;
    const startInitialShow = (): void => {
      if (initialShowStarted || !this.petWindowReady || !this.petWindowPlaced) return;
      initialShowStarted = true;
      if (!this.petVisibilityRequested) {
        resolveInitialShow();
        return;
      }
      void this.showPetWindow(petWindow, this.pendingPetShowAnimation).then(resolveInitialShow, rejectInitialShow);
    };
    const showWhenReady = (): void => {
      if (this.petWindow !== petWindow || petWindow.isDestroyed()) return;
      this.petWindowReady = true;
      this.markPetRendererReady();
      startInitialShow();
    };
    petWindow.once("ready-to-show", showWhenReady);
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener("ready-to-show", showWhenReady);
    });

    const preventPetClose = (event: ElectronEvent): void => {
      event.preventDefault();
    };
    petWindow.on("close", preventPetClose);
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener("close", preventPetClose);
    });

    const clearPetWindow = (): void => {
      resolveInitialShow();
      if (this.petWindow === petWindow) {
        this.petPresenceTransition.reset(false);
        this.petWindow = null;
        this.petWindowReady = false;
        this.petWindowPlaced = false;
        this.pendingPetShowCompletion = null;
        this.petVisibilityRequested = false;
      }
      this.releaseWindowListeners(petWindow);
    };
    petWindow.once("closed", clearPetWindow);
    this.addListenerDisposer(petWindow, () => {
      petWindow.removeListener("closed", clearPetWindow);
    });

    const handleRendererGone = (): void => {
      this.handlePetRendererFailure(petWindow);
    };
    petWindow.webContents.on("render-process-gone", handleRendererGone);
    this.addListenerDisposer(petWindow, () => {
      if (!petWindow.webContents.isDestroyed()) {
        petWindow.webContents.removeListener("render-process-gone", handleRendererGone);
      }
    });

    try {
      const placementCompleted = await this.initializePetPlacement(petWindow);
      if (!placementCompleted) return;
      this.petWindowPlaced = true;
      startInitialShow();

      await petWindow.loadURL(this.rendererUrl("pet"));
      void this.ensureBubbleWindow().catch(() => undefined);
      await initialShowCompleted;
      if (this.pendingPetShowCompletion === initialShowCompleted) this.pendingPetShowCompletion = null;
    } catch (error) {
      rejectInitialShow(error);
      if (this.pendingPetShowCompletion === initialShowCompleted) this.pendingPetShowCompletion = null;
      this.discardFailedPetWindow(petWindow);
      throw error;
    }
  }

  async hidePet(animate = true): Promise<void> {
    if (this.disposed) return;
    this.petVisibilityRequested = false;
    this.bubbleWindow?.hide();
    const petWindow = this.petWindow;
    if (!petWindow || petWindow.isDestroyed() || petWindow.webContents.isDestroyed() || !petWindow.isVisible()) {
      this.petPresenceTransition.reset(false);
      if (petWindow && !petWindow.isDestroyed()) petWindow.hide();
      return;
    }
    this.setPetIgnoreMouseEvents(true);
    await this.petPresenceTransition.exit(animate);
  }

  private async showPetWindow(petWindow: BrowserWindow, animate: boolean): Promise<void> {
    petWindow.setHasShadow(false);
    const wasVisible = petWindow.isVisible();
    if (!wasVisible) this.petPresenceTransition.reset(false);
    if (animate) this.setPetIgnoreMouseEvents(true);
    if (!wasVisible && animate) petWindow.setOpacity(0);
    const completed = this.petPresenceTransition.enter(animate);
    petWindow.show();
    if (!animate) this.syncBubblePlacement();
    await completed;
  }

  readyPetPresenceTransition(id: number): void {
    this.petPresenceTransition.ready(id);
  }

  completePetPresenceTransition(id: number): void {
    this.petPresenceTransition.complete(id);
  }

  private async ensureBubbleWindow(): Promise<void> {
    if (this.disposed) return;
    if (this.bubbleWindow && !this.bubbleWindow.isDestroyed()) return;

    const bubbleWindow = new BrowserWindow(createBubbleWindowOptions(this.preloadPath));
    bubbleWindow.setHasShadow(false);
    this.bubbleWindow = bubbleWindow;
    this.bubbleWindowReady = false;
    this.bubbleIgnoreMouseEvents = null;
    this.secureWindow(bubbleWindow);

    const onReady = (): void => {
      if (this.bubbleWindow !== bubbleWindow || bubbleWindow.isDestroyed()) return;
      this.bubbleWindowReady = true;
      this.syncBubblePlacement();
    };
    bubbleWindow.once("ready-to-show", onReady);
    this.addListenerDisposer(bubbleWindow, () => {
      bubbleWindow.removeListener("ready-to-show", onReady);
    });

    const preventClose = (event: ElectronEvent): void => {
      event.preventDefault();
    };
    bubbleWindow.on("close", preventClose);
    this.addListenerDisposer(bubbleWindow, () => {
      bubbleWindow.removeListener("close", preventClose);
    });

    const onClosed = (): void => {
      if (this.bubbleWindow === bubbleWindow) {
        this.bubbleWindow = null;
        this.bubbleWindowReady = false;
      }
      this.releaseWindowListeners(bubbleWindow);
    };
    bubbleWindow.once("closed", onClosed);
    this.addListenerDisposer(bubbleWindow, () => {
      bubbleWindow.removeListener("closed", onClosed);
    });

    const handleRendererGone = (): void => {
      if (this.disposed || this.bubbleWindow !== bubbleWindow) return;
      this.bubbleWindow = null;
      this.bubbleWindowReady = false;
      this.releaseWindowListeners(bubbleWindow);
      if (!bubbleWindow.isDestroyed()) bubbleWindow.destroy();
      if (this.petVisibilityRequested) {
        void this.ensureBubbleWindow().catch(() => undefined);
      }
    };
    bubbleWindow.webContents.on("render-process-gone", handleRendererGone);
    this.addListenerDisposer(bubbleWindow, () => {
      if (!bubbleWindow.webContents.isDestroyed()) {
        bubbleWindow.webContents.removeListener("render-process-gone", handleRendererGone);
      }
    });

    try {
      await bubbleWindow.loadURL(this.rendererUrl("bubble"));
    } catch {
      if (this.bubbleWindow === bubbleWindow) {
        this.bubbleWindow = null;
        this.bubbleWindowReady = false;
      }
      this.releaseWindowListeners(bubbleWindow);
      if (!bubbleWindow.isDestroyed()) bubbleWindow.destroy();
    }
  }

  syncBubblePlacement(): void {
    if (
      this.disposed ||
      !this.petWindow ||
      this.petWindow.isDestroyed() ||
      !this.petWindow.isVisible() ||
      !this.petVisibilityRequested ||
      this.petPresenceTransition.isActive()
    ) {
      if (this.bubbleWindow && !this.bubbleWindow.isDestroyed() && this.bubbleWindow.isVisible()) {
        this.bubbleWindow.hide();
      }
      return;
    }

    const isRestActive = Boolean(this.lastRestSnapshot?.runtime.prompt || this.lastRestSnapshot?.runtime.session);
    const shouldShow = Boolean(this.bubbleDialogue) || isRestActive;

    if (!shouldShow) {
      if (this.bubbleWindow && !this.bubbleWindow.isDestroyed() && this.bubbleWindow.isVisible()) {
        this.bubbleWindow.hide();
      }
      return;
    }

    if (!this.bubbleWindow || this.bubbleWindow.isDestroyed()) {
      void this.ensureBubbleWindow().catch(() => undefined);
      return;
    }

    const petBounds = this.petWindow.getBounds();
    const display = screen.getDisplayMatching(petBounds);
    const targetHeight = isRestActive ? BUBBLE_REST_WINDOW_HEIGHT : BUBBLE_DIALOGUE_WINDOW_HEIGHT;
    const bubbleBounds = resolveBubbleWindowBounds(petBounds, display.workArea, {
      width: BUBBLE_WINDOW_WIDTH,
      height: targetHeight,
    });

    this.bubbleWindow.setBounds({
      x: bubbleBounds.x,
      y: bubbleBounds.y,
      width: bubbleBounds.width,
      height: bubbleBounds.height,
    });

    const snapshot: BubbleSystemSnapshot = {
      dialogue: this.bubbleDialogue,
      placement: bubbleBounds.placement,
      tailOffsetX: bubbleBounds.tailOffsetX,
    };

    if (!this.bubbleWindow.webContents.isDestroyed()) {
      this.bubbleWindow.webContents.send(IPC_CHANNELS.bubbleSystemChanged, snapshot);
    }

    if (this.bubbleWindowReady && !this.bubbleWindow.isVisible()) {
      this.bubbleWindow.setHasShadow(false);
      this.bubbleWindow.showInactive();
    }
  }

  setBubbleDialogue(dialogue: string | null): void {
    if (this.disposed) return;
    this.bubbleDialogue = dialogue;
    this.syncBubblePlacement();
  }

  setBubbleIgnoreMouseEvents(ignore: boolean): void {
    if (this.disposed) return;
    const bubbleWindow = this.bubbleWindow;
    if (!bubbleWindow || bubbleWindow.isDestroyed()) return;
    const normalized = Boolean(ignore);
    if (this.bubbleIgnoreMouseEvents === normalized) return;
    this.bubbleIgnoreMouseEvents = normalized;
    try {
      bubbleWindow.setIgnoreMouseEvents(normalized, { forward: true });
    } catch {
      // Ignore errors during window destruction or invalid native handles
    }
  }

  getBubbleSystemSnapshot(): BubbleSystemSnapshot {
    const petBounds = this.petWindow && !this.petWindow.isDestroyed() ? this.petWindow.getBounds() : null;
    const display = petBounds ? screen.getDisplayMatching(petBounds) : null;
    const isRestActive = Boolean(this.lastRestSnapshot?.runtime.prompt || this.lastRestSnapshot?.runtime.session);
    const targetHeight = isRestActive ? BUBBLE_REST_WINDOW_HEIGHT : BUBBLE_DIALOGUE_WINDOW_HEIGHT;
    const bubbleBounds =
      petBounds && display
        ? resolveBubbleWindowBounds(petBounds, display.workArea, {
            width: BUBBLE_WINDOW_WIDTH,
            height: targetHeight,
          })
        : null;
    return {
      dialogue: this.bubbleDialogue,
      placement: bubbleBounds?.placement ?? "top",
      tailOffsetX: bubbleBounds?.tailOffsetX ?? 160,
    };
  }

  async openSettings(target?: SettingsNavigationTarget): Promise<void> {
    if (this.disposed) return;
    if (target) {
      this.pendingSettingsTarget = target;
    }
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      if (this.settingsWindowReady) {
        if (this.settingsWindow.isMinimized()) this.settingsWindow.restore();
        this.settingsWindow.show();
        this.settingsWindow.focus();
        if (process.platform === "darwin") {
          app.focus({ steal: true });
        }
        if (target) {
          this.settingsWindow.webContents.send(IPC_CHANNELS.settingsNavigationRequested, target);
          this.pendingSettingsTarget = null;
        }
      }
      return;
    }

    if (!this.settingsBoundsLoaded && this.userDataPath) {
      this.settingsBoundsLoaded = true;
      const loaded = await loadSettingsWindowState(this.userDataPath);
      if (loaded) this.lastSettingsBounds = loaded;
    }

    const initialBounds = resolveSettingsWindowBounds(this.displaySnapshots(), this.lastSettingsBounds);
    const settingsWindow = new BrowserWindow(createSettingsWindowOptions(this.preloadPath, initialBounds));
    this.settingsWindow = settingsWindow;
    this.settingsWindowReady = false;
    this.secureWindow(settingsWindow);

    let boundsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const recordBounds = (): void => {
      if (this.settingsWindow !== settingsWindow || settingsWindow.isDestroyed()) return;
      const [width, height] = settingsWindow.getSize();
      const [x, y] = settingsWindow.getPosition();
      if (width && height) {
        this.lastSettingsBounds = { width, height, x, y };
        if (this.userDataPath) {
          void saveSettingsWindowState(this.userDataPath, this.lastSettingsBounds).catch(() => undefined);
        }
      }
    };

    const onBoundsChanged = (): void => {
      if (boundsDebounceTimer) clearTimeout(boundsDebounceTimer);
      boundsDebounceTimer = setTimeout(recordBounds, 250);
    };

    settingsWindow.on("resize", onBoundsChanged);
    settingsWindow.on("move", onBoundsChanged);
    this.addListenerDisposer(settingsWindow, () => {
      if (boundsDebounceTimer) clearTimeout(boundsDebounceTimer);
      boundsDebounceTimer = null;
      settingsWindow.removeListener("resize", onBoundsChanged);
      settingsWindow.removeListener("move", onBoundsChanged);
    });

    const onSettingsClose = (): void => {
      recordBounds();
    };
    settingsWindow.on("close", onSettingsClose);
    this.addListenerDisposer(settingsWindow, () => {
      settingsWindow.removeListener("close", onSettingsClose);
    });

    const showWhenReady = (): void => {
      if (this.settingsWindow !== settingsWindow || settingsWindow.isDestroyed()) return;
      this.settingsWindowReady = true;
      settingsWindow.show();
      settingsWindow.focus();
      if (process.platform === "darwin") {
        app.focus({ steal: true });
      }
      if (this.pendingSettingsTarget) {
        settingsWindow.webContents.send(IPC_CHANNELS.settingsNavigationRequested, this.pendingSettingsTarget);
        this.pendingSettingsTarget = null;
      }
    };
    settingsWindow.once("ready-to-show", showWhenReady);
    this.addListenerDisposer(settingsWindow, () => {
      settingsWindow.removeListener("ready-to-show", showWhenReady);
    });

    const clearSettingsWindow = (): void => {
      if (boundsDebounceTimer) {
        clearTimeout(boundsDebounceTimer);
        boundsDebounceTimer = null;
      }
      if (this.settingsWindow === settingsWindow) {
        this.settingsWindow = null;
        this.settingsWindowReady = false;
        this.pendingSettingsTarget = null;
      }
      this.releaseWindowListeners(settingsWindow);
    };
    settingsWindow.once("closed", clearSettingsWindow);
    this.addListenerDisposer(settingsWindow, () => {
      settingsWindow.removeListener("closed", clearSettingsWindow);
    });

    try {
      await settingsWindow.loadURL(this.rendererUrl("settings"));
    } catch (error) {
      this.discardFailedSettingsWindow(settingsWindow);
      throw error;
    }
  }

  focusSettingsIfOpen(): void {
    if (this.disposed) return;
    if (!this.settingsWindow || this.settingsWindow.isDestroyed() || !this.settingsWindowReady) return;
    this.settingsWindow.show();
    this.settingsWindow.focus();
    if (process.platform === "darwin") {
      app.focus({ steal: true });
    }
  }

  getWindowKind(webContentsId: number): WindowKind {
    if (this.petWindow && !this.petWindow.isDestroyed() && this.petWindow.webContents.id === webContentsId) {
      return "pet";
    }
    if (this.bubbleWindow && !this.bubbleWindow.isDestroyed() && this.bubbleWindow.webContents.id === webContentsId) {
      return "bubble";
    }
    if (
      this.settingsWindow &&
      !this.settingsWindow.isDestroyed() &&
      this.settingsWindow.webContents.id === webContentsId
    ) {
      return "settings";
    }
    throw new Error("Unrecognized renderer sender");
  }

  getOwnedWindow(webContentsId: number): BrowserWindow {
    const kind = this.getWindowKind(webContentsId);
    const window = kind === "pet" ? this.petWindow : kind === "bubble" ? this.bubbleWindow : this.settingsWindow;
    if (!window || window.isDestroyed()) throw new Error("Unrecognized renderer sender");
    return window;
  }

  movePetBy(deltaX: number, deltaY: number): void {
    if (
      this.disposed ||
      !Number.isFinite(deltaX) ||
      !Number.isFinite(deltaY) ||
      Math.abs(deltaX) > 256 ||
      Math.abs(deltaY) > 256
    ) {
      return;
    }
    const petWindow = this.petWindow;
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    if (x === undefined || y === undefined) return;
    petWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY));
    this.syncBubblePlacement();
  }

  nudgePetBy(deltaX: number, deltaY: number): void {
    if (
      this.disposed ||
      !Number.isFinite(deltaX) ||
      !Number.isFinite(deltaY) ||
      Math.abs(deltaX) > 64 ||
      Math.abs(deltaY) > 64
    ) {
      return;
    }
    const petWindow = this.petWindow;
    if (!petWindow || petWindow.isDestroyed()) return;
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const next = moveRectWithinWorkArea(bounds, display.workArea, deltaX, deltaY);
    petWindow.setPosition(Math.round(next.x), Math.round(next.y));
    this.syncBubblePlacement();
  }

  setPetIgnoreMouseEvents(ignore: boolean): void {
    if (this.disposed) return;
    const petWindow = this.petWindow;
    if (!petWindow || petWindow.isDestroyed()) return;
    const normalized = Boolean(ignore);
    if (this.petIgnoreMouseEvents === normalized) return;
    this.petIgnoreMouseEvents = normalized;
    try {
      petWindow.setIgnoreMouseEvents(normalized, { forward: true });
    } catch {
      // Ignore errors during window destruction or invalid native handles
    }
  }

  broadcastPetSystemChanged(snapshot: PetSystemSnapshot): void {
    for (const window of [this.petWindow, this.bubbleWindow, this.settingsWindow]) {
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send(IPC_CHANNELS.petSystemChanged, snapshot);
    }
    this.adjustPetWindowSizeForActivePet(snapshot);
  }

  private adjustPetWindowSizeForActivePet(snapshot: PetSystemSnapshot): void {
    const activePet = snapshot.pets.find((p) => p.id === snapshot.activePetId);
    const targetHeight = activePet?.targetHeight ?? 180;
    if (targetHeight === this.currentPetTargetHeight) return;
    this.currentPetTargetHeight = targetHeight;
    if (!this.petWindow || this.petWindow.isDestroyed()) return;
    const newSize = resolvePetWindowSize(targetHeight);
    const bounds = this.petWindow.getBounds();
    if (bounds.width === newSize.width && bounds.height === newSize.height) return;
    const newY = bounds.y + (bounds.height - newSize.height);
    const display = screen.getDisplayMatching(bounds);
    const nextBounds = clampRectToWorkArea(
      { x: bounds.x, y: newY, width: newSize.width, height: newSize.height },
      display.workArea
    );
    this.petWindow.setBounds(nextBounds);
    this.syncBubblePlacement();
  }

  broadcastRestSystemChanged(snapshot: RestSystemSnapshot): void {
    this.lastRestSnapshot = snapshot;
    this.broadcast(IPC_CHANNELS.restSystemChanged, snapshot);
    this.syncBubblePlacement();
  }

  broadcastCompanionSystemChanged(snapshot: CompanionSystemSnapshot): void {
    this.broadcast(IPC_CHANNELS.companionSystemChanged, snapshot);
  }

  broadcastPettingGestureDetected(): void {
    const window = this.petWindow;
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(IPC_CHANNELS.pettingGestureDetected);
  }

  requestPetInteraction(request: PetInteractionRequest): void {
    const window = this.petWindow;
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(IPC_CHANNELS.petInteractionRequested, request);
  }

  broadcastAudioPlaybackRequested(request: AudioPlaybackRequest): void {
    const window = this.petWindow;
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(IPC_CHANNELS.audioPlaybackRequested, request);
  }

  async showPetForRuntime(): Promise<void> {
    await this.showPet();
  }

  async restorePersistedPetVisibility(): Promise<void> {
    const settings = await this.settingsStore.load();
    if (!settings.petWindow.visible) await this.hidePet(false);
  }

  isPetVisible(): boolean {
    return Boolean(this.petWindow && !this.petWindow.isDestroyed() && this.petWindow.isVisible());
  }

  getPetRendererStatus(): PetRendererStatus {
    return { ...this.petRendererStatus };
  }

  async retryPetRenderer(): Promise<PetRendererStatus> {
    if (this.disposed || !this.crashRecoveryBudget.retry()) {
      return this.getPetRendererStatus();
    }
    this.setPetRendererStatus({ state: "recovering" });
    try {
      const settings = await this.settingsStore.load();
      await this.rebuildPetWindow(settings.petWindow.visible);
    } catch {
      this.crashRecoveryBudget.rendererFailed();
      this.setPetRendererStatus({ state: "safe-mode", errorCode: "pet-renderer-failed" });
    }
    return this.getPetRendererStatus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.petPresenceTransition.reset(false);
    const ownedWindows = [this.petWindow, this.bubbleWindow, this.settingsWindow];
    this.petWindow = null;
    this.bubbleWindow = null;
    this.settingsWindow = null;
    this.petWindowReady = false;
    this.petWindowPlaced = false;
    this.pendingPetShowCompletion = null;
    this.petVisibilityRequested = false;
    this.bubbleWindowReady = false;
    this.settingsWindowReady = false;

    for (const window of ownedWindows) {
      if (!window) continue;
      this.releaseWindowListeners(window);
      if (!window.isDestroyed()) window.destroy();
    }
  }

  private secureWindow(window: BrowserWindow): void {
    const denyNavigation = (event: ElectronEvent): void => {
      event.preventDefault();
    };
    window.webContents.on("will-navigate", denyNavigation);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.addListenerDisposer(window, () => {
      if (!window.webContents.isDestroyed()) {
        window.webContents.removeListener("will-navigate", denyNavigation);
      }
    });
  }

  private handlePetRendererFailure(petWindow: BrowserWindow): void {
    if (this.disposed || this.petWindow !== petWindow) return;
    const shouldShow = this.petVisibilityRequested;
    this.petPresenceTransition.reset(false);
    this.petWindow = null;
    this.petWindowReady = false;
    this.petWindowPlaced = false;
    this.pendingPetShowCompletion = null;
    this.releaseWindowListeners(petWindow);
    if (!petWindow.isDestroyed()) petWindow.destroy();

    if (this.crashRecoveryBudget.rendererFailed() === "safe-mode") {
      this.petVisibilityRequested = false;
      this.setPetRendererStatus({ state: "safe-mode", errorCode: "pet-renderer-failed" });
      return;
    }

    this.setPetRendererStatus({ state: "recovering" });
    void this.rebuildPetWindow(shouldShow);
  }

  private async rebuildPetWindow(shouldShow: boolean): Promise<void> {
    try {
      const rebuilding = this.showPet(false);
      if (!shouldShow) void this.hidePet(false);
      await rebuilding;
    } catch {
      if (this.crashRecoveryBudget.rendererFailed() === "safe-mode") {
        this.petVisibilityRequested = false;
        this.setPetRendererStatus({ state: "safe-mode", errorCode: "pet-renderer-failed" });
      }
    }
  }

  private markPetRendererReady(): void {
    if (this.crashRecoveryBudget.getState() !== "rebuilding") return;
    this.crashRecoveryBudget.rendererReady();
    this.setPetRendererStatus({ state: "healthy" });
  }

  private setPetRendererStatus(status: PetRendererStatus): void {
    if (this.petRendererStatus.state === status.state && this.petRendererStatus.errorCode === status.errorCode) return;
    this.petRendererStatus = { ...status };
    this.broadcast(IPC_CHANNELS.petRendererStatusChanged, this.getPetRendererStatus());
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const window of [this.petWindow, this.bubbleWindow, this.settingsWindow]) {
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send(channel, payload);
    }
  }

  private async initializePetPlacement(petWindow: BrowserWindow): Promise<boolean> {
    const settings = await this.settingsStore.load();
    if (this.petWindow !== petWindow || petWindow.isDestroyed()) return false;

    const activePet = settings.pets.find((p) => p.id === settings.activePetId);
    const targetHeight = activePet?.targetHeight ?? 180;
    this.currentPetTargetHeight = targetHeight;
    const desiredSize = resolvePetWindowSize(targetHeight);

    const savedPoint = toSavedPoint(settings.petWindow.x, settings.petWindow.y);
    petWindow.setBounds(
      resolvePetWindowBounds(this.displaySnapshots(), settings.petWindow.displayId, savedPoint, desiredSize)
    );
    this.listenForPetPlacementChanges(petWindow);
    return true;
  }

  private listenForPetPlacementChanges(petWindow: BrowserWindow): void {
    let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const persistBounds = (): void => {
      persistenceTimer = null;
      if (disposed || this.petWindow !== petWindow || petWindow.isDestroyed()) return;

      const position = petWindow.getPosition();
      const x = position[0];
      const y = position[1];
      if (x === undefined || y === undefined) return;
      const nearestDisplay = screen.getDisplayNearestPoint({ x, y });
      void this.settingsStore
        .update((current) => ({
          ...current,
          petWindow: {
            ...current.petWindow,
            x,
            y,
            displayId: String(nearestDisplay.id),
          },
        }))
        .catch(() => undefined);
    };

    const schedulePersistence = (): void => {
      if (persistenceTimer) clearTimeout(persistenceTimer);
      persistenceTimer = setTimeout(persistBounds, 250);
      this.syncBubblePlacement();
    };

    const reclamp = (): void => {
      if (disposed || this.petWindow !== petWindow || petWindow.isDestroyed()) return;
      const bounds = petWindow.getBounds();
      const desiredSize = resolvePetWindowSize(this.currentPetTargetHeight);
      petWindow.setBounds(
        resolvePetWindowBounds(this.displaySnapshots(), null, { x: bounds.x, y: bounds.y }, desiredSize)
      );
      this.syncBubblePlacement();
    };

    petWindow.on("moved", schedulePersistence);
    petWindow.on("resized", schedulePersistence);
    screen.on("display-removed", reclamp);
    screen.on("display-metrics-changed", reclamp);
    this.addListenerDisposer(petWindow, () => {
      disposed = true;
      if (persistenceTimer) clearTimeout(persistenceTimer);
      persistenceTimer = null;
      petWindow.removeListener("moved", schedulePersistence);
      petWindow.removeListener("resized", schedulePersistence);
      screen.removeListener("display-removed", reclamp);
      screen.removeListener("display-metrics-changed", reclamp);
    });
  }

  private discardFailedPetWindow(petWindow: BrowserWindow): void {
    if (this.petWindow === petWindow) {
      this.petPresenceTransition.reset(false);
      this.petWindow = null;
      this.petWindowReady = false;
      this.petWindowPlaced = false;
      this.pendingPetShowCompletion = null;
      this.petVisibilityRequested = false;
    }
    this.releaseWindowListeners(petWindow);
    if (!petWindow.isDestroyed()) petWindow.destroy();
  }

  private discardFailedSettingsWindow(settingsWindow: BrowserWindow): void {
    if (this.settingsWindow === settingsWindow) {
      this.settingsWindow = null;
      this.settingsWindowReady = false;
    }
    this.releaseWindowListeners(settingsWindow);
    if (!settingsWindow.isDestroyed()) settingsWindow.destroy();
  }

  private displaySnapshots(): readonly DisplaySnapshot[] {
    const primaryDisplayId = String(screen.getPrimaryDisplay().id);
    return screen.getAllDisplays().map((display) => ({
      id: String(display.id),
      bounds: toRect(display.bounds),
      workArea: toRect(display.workArea),
      isPrimary: String(display.id) === primaryDisplayId,
    }));
  }

  private rendererUrl(kind: WindowKind): string {
    const developmentUrl = this.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
    return developmentUrl ? `${developmentUrl}?window=${kind}` : `app://renderer/index.html?window=${kind}`;
  }

  private addListenerDisposer(window: BrowserWindow, dispose: () => void): void {
    const disposers = this.windowListenerDisposers.get(window) ?? [];
    disposers.push(dispose);
    this.windowListenerDisposers.set(window, disposers);
  }

  private releaseWindowListeners(window: BrowserWindow): void {
    const disposers = this.windowListenerDisposers.get(window) ?? [];
    this.windowListenerDisposers.delete(window);
    for (const dispose of disposers) dispose();
  }
}

function toSavedPoint(x: number | null, y: number | null): Point | null {
  return x === null || y === null ? null : { x, y };
}

function toRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
