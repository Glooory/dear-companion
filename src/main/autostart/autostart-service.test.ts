import type { App, LoginItemSettings } from "electron";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../../shared/contracts";
import { AutostartService } from "./autostart-service";

function settingsStore(settings: AppSettings = DEFAULT_APP_SETTINGS) {
  return {
    load: async () => settings,
    update: async (mutator: (current: AppSettings) => AppSettings) => mutator(settings),
  };
}

function electronApp(
  loginItemSettings: LoginItemSettings
): Pick<App, "getLoginItemSettings" | "setLoginItemSettings" | "isPackaged"> {
  return {
    isPackaged: true,
    getLoginItemSettings: vi.fn(() => loginItemSettings),
    setLoginItemSettings: vi.fn(),
  };
}

function loginSettings(overrides: Partial<LoginItemSettings>): LoginItemSettings {
  return {
    openAtLogin: false,
    openAsHidden: false,
    wasOpenedAtLogin: false,
    wasOpenedAsHidden: false,
    restoreState: false,
    status: "not-registered",
    executableWillLaunchAtLogin: false,
    launchItems: [],
    ...overrides,
  };
}

describe("AutostartService effective state", () => {
  it("treats a matching Windows launch item disabled by the OS as ineffective", async () => {
    const executablePath = "C:\\Program Files\\Dear Companion\\Dear Companion.exe";
    const service = new AutostartService({
      app: electronApp(
        loginSettings({
          openAtLogin: true,
          launchItems: [
            {
              name: "Dear Companion",
              path: executablePath,
              args: ["--autostart"],
              scope: "user",
              enabled: false,
            },
          ],
        })
      ),
      settingsStore: settingsStore(),
      platform: "win32",
      executablePath,
    });

    await expect(service.getStatus()).resolves.toMatchObject({ effective: false });
  });

  it("requires an exact enabled Windows path and argument match", async () => {
    const executablePath = "C:\\Program Files\\Dear Companion\\Dear Companion.exe";
    const service = new AutostartService({
      app: electronApp(
        loginSettings({
          openAtLogin: true,
          launchItems: [
            {
              name: "Unrelated",
              path: executablePath,
              args: ["--different"],
              scope: "user",
              enabled: true,
            },
            {
              name: "Dear Companion",
              path: executablePath.toUpperCase(),
              args: ["--autostart"],
              scope: "user",
              enabled: true,
            },
          ],
        })
      ),
      settingsStore: settingsStore(),
      platform: "win32",
      executablePath,
    });

    await expect(service.getStatus()).resolves.toMatchObject({ effective: true });
  });

  it("persists an external Windows disable without re-registering the app", async () => {
    const executablePath = "C:\\Program Files\\Dear Companion\\Dear Companion.exe";
    let stored: AppSettings = { ...DEFAULT_APP_SETTINGS, autostartEnabled: true };
    const app = electronApp(
      loginSettings({
        openAtLogin: true,
        launchItems: [
          {
            name: "Dear Companion",
            path: executablePath,
            args: ["--autostart"],
            scope: "user",
            enabled: false,
          },
        ],
      })
    );
    const service = new AutostartService({
      app,
      settingsStore: {
        load: async () => stored,
        update: async (mutator) => {
          stored = mutator(stored);
          return stored;
        },
      },
      platform: "win32",
      executablePath,
    });

    await expect(service.reconcilePersistedPreference()).resolves.toEqual({
      supported: true,
      requested: false,
      effective: false,
    });
    expect(stored.autostartEnabled).toBe(false);
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it("treats a macOS login item awaiting approval as ineffective", async () => {
    const service = new AutostartService({
      app: electronApp(loginSettings({ openAtLogin: true, status: "requires-approval" })),
      settingsStore: settingsStore(),
      platform: "darwin",
    });

    await expect(service.getStatus()).resolves.toMatchObject({ effective: false });
  });
});
