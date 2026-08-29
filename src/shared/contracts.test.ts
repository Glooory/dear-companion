import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ACTION_TEMPLATES,
  DEFAULT_APP_SETTINGS,
  DEFAULT_ASSET_NORMALIZATION,
  DEFAULT_PET_LIFE_STATES,
  EMPTY_ACTION_SLOTS,
  migrateAppSettings,
  createCompanionSystemSnapshot,
  parseCreateWorkScheduleInput,
  parseManualLifeSelection,
  parseScreenEllipse,
  parseUpdateWorkScheduleInput,
  parseAutostartEnabledInput,
  parseAutostartStatus,
  parsePetRendererStatus,
  parseAppSettings,
  parsePetUpdateInput,
  type AppSettingsV1,
  type AppSettingsV2,
  type AppSettingsV3,
  type LegacyPetConfig,
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
        normalization: { ...DEFAULT_ASSET_NORMALIZATION },
        headHotspot: null
      }
    ],
    actionSlots: { ...EMPTY_ACTION_SLOTS, idle: ['asset-1'] },
    actionTemplates: { ...DEFAULT_ACTION_TEMPLATES },
    lifeStates: {
      drowsy: { enabled: false, assetIds: [] },
      sleeping: { enabled: false, assetIds: [] },
      workingAssetIds: []
    },
    companionPace: 'natural',
    interactionBubblesEnabled: true
  }
}

describe('settings contracts', () => {
  it('uses privacy-preserving schema v4 first-run defaults', () => {
    expect(DEFAULT_APP_SETTINGS).toEqual({
      schemaVersion: 4,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: {
        reminderSource: { kind: 'builtin', id: 'gentle-chime' },
        cryingSource: { kind: 'builtin', id: 'soft-whimper' },
        assets: []
      },
      reminders: [],
      workSchedules: [],
      pets: []
    })
  })

  it('migrates v1 in memory and clears an unverifiable active pet', () => {
    expect(migrateAppSettings(legacySettings)).toEqual({
      migrated: true,
      settings: {
        ...legacySettings,
        schemaVersion: 4,
        activePetId: null,
        audio: {
          reminderSource: { kind: 'builtin', id: 'gentle-chime' },
          cryingSource: { kind: 'builtin', id: 'soft-whimper' },
          assets: []
        },
        reminders: [],
        workSchedules: [],
        pets: []
      }
    })
  })

  it('round-trips v4 into newly allocated nested values', () => {
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
        pets: [{ ...pet, actionSlots: { ...pet.actionSlots, resting: ['missing'] } }]
      })
    ).toThrow('Unknown asset in resting action slot')
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

  it('rejects unknown fields in pet update payloads', () => {
    const pet = createPet()
    const input = {
      id: pet.id,
      name: pet.name,
      targetHeight: pet.targetHeight,
      assets: pet.assets.map((asset) => ({
        id: asset.id,
        normalization: asset.normalization,
        headHotspot: asset.headHotspot
      })),
      actionSlots: pet.actionSlots,
      actionTemplates: pet.actionTemplates,
      lifeStates: pet.lifeStates,
      companionPace: pet.companionPace,
      interactionBubblesEnabled: pet.interactionBubblesEnabled
    }

    expect(() => parsePetUpdateInput({ ...input, unexpected: true }, ['asset-1']))
      .toThrow('Invalid pet update')
    expect(() => parsePetUpdateInput({
      ...input,
      assets: [{ ...input.assets[0], unexpected: true }]
    }, ['asset-1'])).toThrow('Invalid pet asset adjustment')
  })

  it('rejects a configured pet pack above 250 MB', () => {
    const pet = createPet()
    const template = pet.assets[0]!
    const assets = Array.from({ length: 13 }, (_, index) => ({
      ...template,
      id: `asset-${index}`,
      fileName: `asset-${index}.png`,
      byteSize: 20 * 1024 * 1024
    }))
    expect(() => parseAppSettings({
      ...DEFAULT_APP_SETTINGS,
      pets: [{ ...pet, assets, actionSlots: { ...pet.actionSlots, idle: ['asset-0'] } }]
    })).toThrow('exceeds 250 MB')
  })

  it('migrates v2 with every pet field and zero reminders', () => {
    const pet = createPet()
    const legacyPet = toLegacyPet(pet)
    const legacy: AppSettingsV2 = {
      schemaVersion: 2,
      activePetId: pet.id,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow },
      autostartEnabled: false,
      audio: { reminderEnabled: true, cryingEnabled: true },
      reminders: [],
      pets: [legacyPet]
    }
    const result = migrateAppSettings(legacy)
    expect(result.migrated).toBe(true)
    expect(result.settings.pets[0]).toMatchObject({
      ...legacyPet,
      lifeStates: DEFAULT_PET_LIFE_STATES,
      companionPace: 'natural',
      interactionBubblesEnabled: true
    })
    expect(result.settings.reminders).toEqual([])
    expect(result.settings.audio.assets).toEqual([])
  })

  it('migrates schema v3 pets and global settings to strict v4 defaults', () => {
    const pet = createPet()
    const legacy: AppSettingsV3 = {
      schemaVersion: 3,
      activePetId: pet.id,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow },
      autostartEnabled: false,
      audio: { ...DEFAULT_APP_SETTINGS.audio, assets: [] },
      reminders: [],
      pets: [toLegacyPet(pet)]
    }
    const result = migrateAppSettings(legacy)
    expect(result).toMatchObject({
      migrated: true,
      settings: {
        schemaVersion: 4,
        activePetId: pet.id,
        workSchedules: [],
        pets: [{
          lifeStates: DEFAULT_PET_LIFE_STATES,
          companionPace: 'natural',
          interactionBubblesEnabled: true
        }]
      }
    })
    expect(result.settings.pets[0]!.assets[0]!.headHotspot).toBeNull()
  })

  it('validates reminder and audio ownership strictly', () => {
    const reminder = {
      id: 'reminder-1', enabled: true, hour: 9, minute: 30,
      weekdays: [1, 2, 3, 4, 5], restDurationMinutes: 10,
      cursorTolerance: 'standard', message: '  休息一下  ',
      sounds: { reminder: false, crying: false }
    }
    const parsed = parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [reminder] })
    expect(parsed.reminders[0]?.message).toBe('休息一下')
    expect(parsed.reminders[0]).not.toBe(reminder)
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{ ...reminder, weekdays: [1, 1] }] })).toThrow('Duplicate reminder weekday')
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [reminder, reminder] })).toThrow('Duplicate reminder identifier')
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{ ...reminder, hour: Number.NaN }] })).toThrow('Invalid reminder time')
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{ ...reminder, unknown: true }] })).toThrow('Invalid reminder schedule')
    expect(() => parseAppSettings({
      ...DEFAULT_APP_SETTINGS,
      audio: { ...DEFAULT_APP_SETTINGS.audio, reminderSource: { kind: 'imported', assetId: 'missing' } }
    })).toThrow('Stale imported audio source')
  })

  it('rejects malformed audio assets and unknown sound sources', () => {
    const asset = { id: 'sound-1', fileName: 'sound-1.mp3', format: 'mp3', byteSize: 10, available: true }
    expect(parseAppSettings({
      ...DEFAULT_APP_SETTINGS,
      audio: { ...DEFAULT_APP_SETTINGS.audio, assets: [asset], reminderSource: { kind: 'imported', assetId: 'sound-1' } }
    }).audio.assets).toEqual([asset])
    expect(() => parseAppSettings({
      ...DEFAULT_APP_SETTINGS,
      audio: { ...DEFAULT_APP_SETTINGS.audio, assets: [asset, asset] }
    })).toThrow('Duplicate audio asset identifier')
    expect(() => parseAppSettings({
      ...DEFAULT_APP_SETTINGS,
      audio: { ...DEFAULT_APP_SETTINGS.audio, reminderSource: { kind: 'builtin', id: 'soft-whimper' } }
    })).toThrow('Unknown built-in audio source')
  })

  it('validates and clones sanitized release-hardening statuses', () => {
    const autostart = {
      supported: true,
      requested: false,
      effective: true,
      errorCode: 'readback-mismatch'
    } as const
    const parsedAutostart = parseAutostartStatus(autostart)
    expect(parsedAutostart).toEqual(autostart)
    expect(parsedAutostart).not.toBe(autostart)

    const recovery = { state: 'safe-mode', errorCode: 'pet-renderer-failed' } as const
    const parsedRecovery = parsePetRendererStatus(recovery)
    expect(parsedRecovery).toEqual(recovery)
    expect(parsedRecovery).not.toBe(recovery)
  })

  it('rejects invalid autostart payloads and unsanitized status errors', () => {
    expect(parseAutostartEnabledInput(true)).toBe(true)
    expect(() => parseAutostartEnabledInput('true')).toThrow('enabled must be a boolean')
    expect(() => parseAutostartStatus({
      supported: true,
      requested: true,
      effective: false,
      errorCode: '/Users/private/login-item-error'
    })).toThrow('Invalid autostart status')
    expect(() => parsePetRendererStatus({
      state: 'safe-mode',
      errorCode: 'render-process-gone: crashed'
    })).toThrow('Invalid pet renderer status')
  })

  it('validates work schedules and narrow companion inputs', () => {
    const input = {
      enabled: true, startHour: 9, startMinute: 0, endHour: 17, endMinute: 30,
      weekdays: [1, 2, 3, 4, 5]
    }
    expect(parseCreateWorkScheduleInput(input)).toEqual(input)
    expect(parseUpdateWorkScheduleInput({ id: 'work-1', ...input })).toEqual({ id: 'work-1', ...input })
    expect(() => parseCreateWorkScheduleInput({ ...input, endHour: 9, endMinute: 0 })).toThrow('must differ')
    expect(() => parseCreateWorkScheduleInput({ ...input, weekdays: [1, 1] })).toThrow('Duplicate')
    expect(parseManualLifeSelection('sleeping')).toBe('sleeping')
    expect(() => parseManualLifeSelection('working')).toThrow('Invalid manual')
    expect(parseScreenEllipse({ centerX: -20, centerY: 10, radiusX: 6, radiusY: 200 })).toEqual({
      centerX: -20, centerY: 10, radiusX: 6, radiusY: 200
    })
    expect(() => parseScreenEllipse({ centerX: 0, centerY: 0, radiusX: 5, radiusY: 10 })).toThrow('Invalid screen')
  })

  it('clones companion snapshots without exposing mutable settings values', () => {
    const work = { id: 'work-1', enabled: true, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0, weekdays: [1] as const }
    const runtime = {
      lifeState: 'daily-calm' as const, pace: 'natural' as const, manualSelection: 'auto' as const,
      manualWorkActive: false, scheduledWorkActive: false, systemSuspended: false,
      nextTransitionAt: null, available: { drowsy: false, sleeping: false }
    }
    const snapshot = createCompanionSystemSnapshot({ ...DEFAULT_APP_SETTINGS, workSchedules: [work] }, runtime)
    expect(snapshot).toEqual({ workSchedules: [work], runtime })
    expect(snapshot.workSchedules).not.toBe(DEFAULT_APP_SETTINGS.workSchedules)
    expect(snapshot.runtime).not.toBe(runtime)
    expect(snapshot.runtime.available).not.toBe(runtime.available)
  })
})

function toLegacyPet(pet: PetConfig): LegacyPetConfig {
  return {
    id: pet.id,
    name: pet.name,
    targetHeight: pet.targetHeight,
    assets: pet.assets.map((asset) => ({
      id: asset.id,
      fileName: asset.fileName,
      format: asset.format,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      alphaBounds: { ...asset.alphaBounds },
      normalization: { ...asset.normalization }
    })),
    actionSlots: pet.actionSlots,
    actionTemplates: pet.actionTemplates
  }
}
