import type { BrowserWindowConstructorOptions, WebPreferences } from 'electron'

const secureWebPreferences = (preload: string): WebPreferences => ({
  preload,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  webviewTag: false
})

export function createPetWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 320,
    height: 320,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    focusable: true,
    webPreferences: secureWebPreferences(preloadPath)
  }
}

export function createSettingsWindowOptions(
  preloadPath: string
): BrowserWindowConstructorOptions {
  return {
    width: 800,
    height: 640,
    minWidth: 680,
    minHeight: 520,
    show: false,
    webPreferences: secureWebPreferences(preloadPath)
  }
}
