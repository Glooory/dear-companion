import type { BrowserWindowConstructorOptions, WebPreferences } from "electron";
import { PET_WINDOW_HEIGHT, PET_WINDOW_WIDTH } from "../../shared/contracts";
import type { SettingsWindowBounds } from "./display-placement";

const secureWebPreferences = (preload: string): WebPreferences => ({
  preload,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  webviewTag: false,
});

export function createPetWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: PET_WINDOW_WIDTH,
    height: PET_WINDOW_HEIGHT,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    focusable: true,
    webPreferences: secureWebPreferences(preloadPath),
  };
}

export function createSettingsWindowOptions(
  preloadPath: string,
  initialBounds?: Partial<SettingsWindowBounds>
): BrowserWindowConstructorOptions {
  return {
    width: initialBounds?.width ?? 1000,
    height: initialBounds?.height ?? 720,
    minWidth: 680,
    minHeight: 520,
    ...(initialBounds?.x !== undefined && initialBounds?.y !== undefined
      ? { x: initialBounds.x, y: initialBounds.y }
      : {}),
    show: false,
    webPreferences: secureWebPreferences(preloadPath),
  };
}
