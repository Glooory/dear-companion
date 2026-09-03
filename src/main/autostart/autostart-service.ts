import { win32 } from "node:path";
import type { App } from "electron";
import type { AutostartErrorCode, AutostartStatus } from "../../shared/contracts";
import type { SettingsStore } from "../settings/settings-store";

interface AutostartServiceOptions {
  app: Pick<App, "getLoginItemSettings" | "setLoginItemSettings" | "isPackaged">;
  settingsStore: Pick<SettingsStore, "load" | "update">;
  platform?: NodeJS.Platform;
  executablePath?: string;
}

export class AutostartService {
  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly app: AutostartServiceOptions["app"];
  private readonly settingsStore: AutostartServiceOptions["settingsStore"];
  private readonly platform: NodeJS.Platform;
  private readonly executablePath: string;

  constructor({
    app,
    settingsStore,
    platform = process.platform,
    executablePath = process.execPath,
  }: AutostartServiceOptions) {
    this.app = app;
    this.settingsStore = settingsStore;
    this.platform = platform;
    this.executablePath = executablePath;
  }

  async getStatus(): Promise<AutostartStatus> {
    const settings = await this.settingsStore.load();
    if (!this.isSupported()) {
      return { supported: false, requested: settings.autostartEnabled, effective: false };
    }

    try {
      return {
        supported: true,
        requested: settings.autostartEnabled,
        effective: this.readEffective(),
      };
    } catch {
      return {
        supported: true,
        requested: settings.autostartEnabled,
        effective: false,
        errorCode: "os-read-failed",
      };
    }
  }

  reconcilePersistedPreference(): Promise<AutostartStatus> {
    return this.enqueue(async () => {
      const settings = await this.settingsStore.load();
      if (!this.isSupported()) {
        return { supported: false, requested: settings.autostartEnabled, effective: false };
      }

      let effective: boolean;
      try {
        effective = this.readEffective();
      } catch {
        return this.failure(settings.autostartEnabled, false, "os-read-failed");
      }

      if (effective === settings.autostartEnabled) {
        return { supported: true, requested: effective, effective };
      }

      try {
        await this.settingsStore.update((current) => ({
          ...current,
          autostartEnabled: effective,
        }));
      } catch {
        return this.failure(settings.autostartEnabled, effective, "settings-save-failed");
      }
      return { supported: true, requested: effective, effective };
    });
  }

  setEnabled(enabled: boolean): Promise<AutostartStatus> {
    return this.enqueue(async () => {
      const settings = await this.settingsStore.load();
      if (!this.isSupported()) {
        return { supported: false, requested: settings.autostartEnabled, effective: false };
      }

      let previousEffective: boolean;
      try {
        previousEffective = this.readEffective();
      } catch {
        return this.failure(settings.autostartEnabled, false, "os-read-failed");
      }

      try {
        this.writeEffective(enabled);
      } catch {
        return this.failure(settings.autostartEnabled, previousEffective, "os-write-failed");
      }

      let effective: boolean;
      try {
        effective = this.readEffective();
      } catch {
        const rolledBack = this.rollback(previousEffective);
        return this.failure(
          settings.autostartEnabled,
          previousEffective,
          rolledBack ? "os-read-failed" : "rollback-failed"
        );
      }

      if (effective !== enabled) {
        const rolledBack = this.rollback(previousEffective);
        return this.failure(
          settings.autostartEnabled,
          rolledBack ? previousEffective : effective,
          rolledBack ? "readback-mismatch" : "rollback-failed"
        );
      }

      try {
        await this.settingsStore.update((current) => ({
          ...current,
          autostartEnabled: enabled,
        }));
      } catch {
        const rolledBack = this.rollback(previousEffective);
        return this.failure(
          settings.autostartEnabled,
          rolledBack ? previousEffective : enabled,
          rolledBack ? "settings-save-failed" : "rollback-failed"
        );
      }

      return { supported: true, requested: enabled, effective: enabled };
    });
  }

  private isSupported(): boolean {
    return this.app.isPackaged && (this.platform === "darwin" || this.platform === "win32");
  }

  private readEffective(): boolean {
    const settings =
      this.platform === "win32"
        ? this.app.getLoginItemSettings({ path: this.executablePath, args: ["--autostart"] })
        : this.app.getLoginItemSettings();
    if (this.platform === "win32") {
      const executablePath = normalizeWindowsPath(this.executablePath);
      return settings.launchItems.some(
        (item) =>
          item.enabled &&
          normalizeWindowsPath(item.path) === executablePath &&
          item.args.length === 1 &&
          item.args[0] === "--autostart"
      );
    }
    return settings.status === "enabled";
  }

  private writeEffective(enabled: boolean): void {
    if (this.platform === "win32") {
      this.app.setLoginItemSettings({
        openAtLogin: enabled,
        path: this.executablePath,
        args: ["--autostart"],
      });
      return;
    }
    this.app.setLoginItemSettings({ openAtLogin: enabled });
  }

  private rollback(previousEffective: boolean): boolean {
    try {
      this.writeEffective(previousEffective);
      return this.readEffective() === previousEffective;
    } catch {
      return false;
    }
  }

  private failure(requested: boolean, effective: boolean, errorCode: AutostartErrorCode): AutostartStatus {
    return { supported: true, requested, effective, errorCode };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function normalizeWindowsPath(path: string): string {
  return win32.normalize(path).toLowerCase();
}
