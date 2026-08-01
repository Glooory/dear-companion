import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACTION_TEMPLATES,
  DEFAULT_APP_SETTINGS,
  DEFAULT_ASSET_NORMALIZATION,
  EMPTY_ACTION_SLOTS,
  migrateAppSettings,
  parseAppSettings,
  type AppSettingsV1,
  type PetConfig
} from './contracts'

const legacySettings: AppSettingsV1 = {
  schemaVersion: 1,
  activePetId: 'legacy-pet',
  petWindow: { x: 12, y: 34, displayId: '1', height: 210, visible: false },
  autostartEnabled: false,
  audio: { reminderEnabled: false, cryingEnabled: false },
  reminders: []
}

function createPet(): PetConfig {
  return {
    id: 'pet-1',
    name: 'Mochi',
    targetHeight: 180,
    assets: [
      {
        id: 'asset-1',
        fileName: 'asset-1.png',
        format: 'png',
        byteSize: 100,
        width: 100,
        height: 200,
        alphaBounds: { x: 10, y: 20, width: 80, height: 170 },
        normalization: { ...DEFAULT_ASSET_NORMALIZATION }
      }
    ],
    actionSlots: { ...EMPTY_ACTION_SLOTS, idle: ['asset-1'] },
    actionTemplates: { ...DEFAULT_ACTION_TEMPLATES }
  }
}

describe('settings contracts', () => {
  it('uses privacy-preserving schema v2 first-run defaults', () => {
    expect(DEFAULT_APP_SETTINGS).toEqual({
      schemaVersion: 2,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: { reminderEnabled: false, cryingEnabled: false },
      reminders: [],
      pets: []
    })
  })

  it('migrates v1 in memory and clears an unverifiable active pet', () => {
    expect(migrateAppSettings(legacySettings)).toEqual({
      migrated: true,
      settings: {
        ...legacySettings,
        schemaVersion: 2,
        activePetId: null,
        pets: []
      }
    })
  })

  it('round-trips v2 into newly allocated nested values', () => {
    const pet = createPet()
    const input = { ...DEFAULT_APP_SETTINGS, activePetId: pet.id, pets: [pet] }
    const parsed = parseAppSettings(input)

    expect(parsed).toEqual(input)
    expect(parsed).not.toBe(input)
    expect(parsed.pets).not.toBe(input.pets)
    expect(parsed.pets[0]?.assets).not.toBe(pet.assets)
    expect(parsed.pets[0]?.actionSlots).not.toBe(pet.actionSlots)
  })

  it('rejects a stale active pet or active pet without idle', () => {
    const pet = createPet()
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, activePetId: 'missing' })).toThrow(
      'Active pet must reference a configured idle asset'
    )
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        activePetId: pet.id,
        pets: [{ ...pet, actionSlots: { ...pet.actionSlots, idle: [] } }]
      })
    ).toThrow('Active pet must reference a configured idle asset')
  })

  it('rejects duplicate IDs and stale action references', () => {
    const pet = createPet()
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, pets: [pet, pet] })).toThrow(
      'Duplicate pet identifier'
    )
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        pets: [{ ...pet, actionSlots: { ...pet.actionSlots, cute: ['missing'] } }]
      })
    ).toThrow('Unknown asset in cute action slot')
  })

  it('rejects invalid immutable metadata and normalization values', () => {
    const pet = createPet()
    const asset = pet.assets[0]!
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        pets: [{ ...pet, assets: [{ ...asset, fileName: '../photo.png' }] }]
      })
    ).toThrow('Invalid pet asset filename')
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        pets: [{ ...pet, assets: [{ ...asset, normalization: { ...asset.normalization, scale: 9 } }] }]
      })
    ).toThrow('Invalid asset normalization')
  })

  it('rejects settings with unsupported reminder payloads', () => {
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{}] })).toThrow(
      'Unsupported reminder data in schema version 2'
    )
  })
})
