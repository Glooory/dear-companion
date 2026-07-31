import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_SETTINGS, parseAppSettings } from './contracts'

describe('parseAppSettings', () => {
  it('uses privacy-preserving first-run defaults', () => {
    expect(DEFAULT_APP_SETTINGS).toEqual({
      schemaVersion: 1,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: { reminderEnabled: false, cryingEnabled: false },
      reminders: []
    })
  })

  it('rejects settings with a non-empty unknown reminder payload', () => {
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{}] })).toThrow(
      'Unsupported reminder data in schema version 1'
    )
  })
})
