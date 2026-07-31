import { describe, expect, it } from 'vitest'
import { createPetWindowOptions, createSettingsWindowOptions } from './window-options'

describe('secure window options', () => {
  it('creates the transparent pet window with hardened renderer preferences', () => {
    const pet = createPetWindowOptions('/app/out/preload/index.js')

    expect(pet).toMatchObject({
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
      focusable: true
    })
    expect(pet.webPreferences).toMatchObject({
      preload: '/app/out/preload/index.js',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    })
    expect(pet.webPreferences?.allowRunningInsecureContent).not.toBe(true)
    expect(pet.webPreferences?.experimentalFeatures).not.toBe(true)
  })

  it('creates the settings window with its minimum size and hardened renderer preferences', () => {
    const settings = createSettingsWindowOptions('/app/out/preload/index.js')

    expect(settings).toMatchObject({
      width: 800,
      height: 640,
      minWidth: 680,
      minHeight: 520,
      show: false
    })
    expect(settings.webPreferences).toMatchObject({
      preload: '/app/out/preload/index.js',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false
    })
    expect(settings.webPreferences?.allowRunningInsecureContent).not.toBe(true)
    expect(settings.webPreferences?.experimentalFeatures).not.toBe(true)
  })

  it('returns fresh option and web-preference objects', () => {
    const first = createPetWindowOptions('/first/preload.js')
    const second = createPetWindowOptions('/second/preload.js')

    expect(first).not.toBe(second)
    expect(first.webPreferences).not.toBe(second.webPreferences)
    expect(first.webPreferences?.preload).toBe('/first/preload.js')
    expect(second.webPreferences?.preload).toBe('/second/preload.js')
  })
})
