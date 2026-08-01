export type WindowKind = 'pet' | 'settings'

export const ACTION_SLOTS = [
  'idle',
  'cute',
  'petting',
  'angry',
  'crying',
  'resting',
  'blink'
] as const

export type ActionSlot = (typeof ACTION_SLOTS)[number]
export type PetAssetFormat = 'png' | 'webp'

export interface PetWindowSettings {
  x: number | null
  y: number | null
  displayId: string | null
  height: number
  visible: boolean
}

export interface AlphaBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface AssetNormalization {
  scale: number
  offsetX: number
  offsetY: number
  baselineOffset: number
}

export interface PetAsset {
  id: string
  fileName: string
  format: PetAssetFormat
  byteSize: number
  width: number
  height: number
  alphaBounds: AlphaBounds
  normalization: AssetNormalization
}

export type PetActionSlots = Record<ActionSlot, readonly string[]>

export interface PetActionTemplates {
  idleIntervalMs: number
  blinkIntervalMs: number
  cuteDurationMs: number
  pettingDurationMs: number
  angryDurationMs: number
  dragAngryVelocity: number
}

export interface PetConfig {
  id: string
  name: string
  targetHeight: number
  assets: readonly PetAsset[]
  actionSlots: PetActionSlots
  actionTemplates: PetActionTemplates
}

export interface AppSettingsV1 {
  schemaVersion: 1
  activePetId: string | null
  petWindow: PetWindowSettings
  autostartEnabled: boolean
  audio: { reminderEnabled: boolean; cryingEnabled: boolean }
  reminders: readonly []
}

export interface AppSettingsV2 {
  schemaVersion: 2
  activePetId: string | null
  petWindow: PetWindowSettings
  autostartEnabled: boolean
  audio: { reminderEnabled: boolean; cryingEnabled: boolean }
  reminders: readonly []
  pets: readonly PetConfig[]
}

export type AppSettings = AppSettingsV2

export interface FoundationApi {
  getSettings(): Promise<AppSettings>
  setPetVisibility(visible: boolean): Promise<AppSettings>
  openSettings(): Promise<void>
  getWindowKind(): WindowKind
}

export interface SettingsMigrationResult {
  settings: AppSettings
  migrated: boolean
}

export const DEFAULT_ASSET_NORMALIZATION: Readonly<AssetNormalization> = Object.freeze({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  baselineOffset: 0
})

export const DEFAULT_ACTION_TEMPLATES: Readonly<PetActionTemplates> = Object.freeze({
  idleIntervalMs: 12_000,
  blinkIntervalMs: 8_000,
  cuteDurationMs: 900,
  pettingDurationMs: 1_000,
  angryDurationMs: 1_500,
  dragAngryVelocity: 1_200
})

export const EMPTY_ACTION_SLOTS: Readonly<PetActionSlots> = Object.freeze({
  idle: Object.freeze([]),
  cute: Object.freeze([]),
  petting: Object.freeze([]),
  angry: Object.freeze([]),
  crying: Object.freeze([]),
  resting: Object.freeze([]),
  blink: Object.freeze([])
})

export const DEFAULT_APP_SETTINGS = Object.freeze({
  schemaVersion: 2,
  activePetId: null,
  petWindow: Object.freeze({
    x: null,
    y: null,
    displayId: null,
    height: 180,
    visible: true
  }),
  autostartEnabled: false,
  audio: Object.freeze({ reminderEnabled: false, cryingEnabled: false }),
  reminders: Object.freeze([]) as readonly [],
  pets: Object.freeze([]) as readonly PetConfig[]
}) satisfies AppSettings

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const INTERNAL_FILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}\.(png|webp)$/

export function parseAppSettings(value: unknown): AppSettings {
  return migrateAppSettings(value).settings
}

export function migrateAppSettings(value: unknown): SettingsMigrationResult {
  if (!isRecord(value)) throw new Error('Unsupported settings schema version')

  if (value.schemaVersion === 1) {
    const legacy = parseAppSettingsV1(value)
    return {
      migrated: true,
      settings: {
        schemaVersion: 2,
        activePetId: null,
        petWindow: legacy.petWindow,
        autostartEnabled: legacy.autostartEnabled,
        audio: legacy.audio,
        reminders: [],
        pets: []
      }
    }
  }

  if (value.schemaVersion === 2) {
    return { migrated: false, settings: parseAppSettingsV2(value) }
  }

  throw new Error('Unsupported settings schema version')
}

export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value)
}

function parseAppSettingsV1(value: Record<string, unknown>): AppSettingsV1 {
  const base = parseFoundationFields(value)
  return {
    schemaVersion: 1,
    activePetId: parseNullableIdentifier(value.activePetId, 'active pet identifier'),
    ...base
  }
}

function parseAppSettingsV2(value: Record<string, unknown>): AppSettingsV2 {
  const base = parseFoundationFields(value)
  if (!Array.isArray(value.pets)) throw new Error('Invalid pet collection')

  const pets = value.pets.map(parsePetConfig)
  assertUnique(pets.map((pet) => pet.id), 'Duplicate pet identifier')
  const activePetId = parseNullableIdentifier(value.activePetId, 'active pet identifier')

  if (activePetId !== null) {
    const activePet = pets.find((pet) => pet.id === activePetId)
    if (!activePet || activePet.actionSlots.idle.length === 0) {
      throw new Error('Active pet must reference a configured idle asset')
    }
  }

  return { schemaVersion: 2, activePetId, ...base, pets }
}

function parseFoundationFields(value: Record<string, unknown>): Omit<
  AppSettingsV1,
  'schemaVersion' | 'activePetId'
> {
  const petWindow = value.petWindow
  if (!isRecord(petWindow)) throw new Error('Invalid pet window settings')
  if (
    !isNullableFiniteNumber(petWindow.x) ||
    !isNullableFiniteNumber(petWindow.y) ||
    !isNullableString(petWindow.displayId) ||
    !isFiniteNumberInRange(petWindow.height, 80, 260) ||
    typeof petWindow.visible !== 'boolean'
  ) {
    throw new Error('Invalid pet window settings')
  }

  if (typeof value.autostartEnabled !== 'boolean') {
    throw new Error('Invalid autostart setting')
  }

  const audio = value.audio
  if (
    !isRecord(audio) ||
    typeof audio.reminderEnabled !== 'boolean' ||
    typeof audio.cryingEnabled !== 'boolean'
  ) {
    throw new Error('Invalid audio settings')
  }

  if (!Array.isArray(value.reminders) || value.reminders.length !== 0) {
    throw new Error(`Unsupported reminder data in schema version ${String(value.schemaVersion)}`)
  }

  return {
    petWindow: {
      x: petWindow.x,
      y: petWindow.y,
      displayId: petWindow.displayId,
      height: petWindow.height,
      visible: petWindow.visible
    },
    autostartEnabled: value.autostartEnabled,
    audio: {
      reminderEnabled: audio.reminderEnabled,
      cryingEnabled: audio.cryingEnabled
    },
    reminders: []
  }
}

function parsePetConfig(value: unknown, index: number): PetConfig {
  if (!isRecord(value)) throw new Error(`Invalid pet at index ${index}`)
  if (!isSafeIdentifier(value.id)) throw new Error('Invalid pet identifier')
  if (typeof value.name !== 'string' || value.name.trim() !== value.name || value.name.length < 1 || value.name.length > 80) {
    throw new Error('Invalid pet name')
  }
  if (!isFiniteNumberInRange(value.targetHeight, 80, 260)) {
    throw new Error('Invalid pet target height')
  }
  if (!Array.isArray(value.assets)) throw new Error('Invalid pet asset collection')

  const assets = value.assets.map(parsePetAsset)
  assertUnique(assets.map((asset) => asset.id), 'Duplicate pet asset identifier')
  assertUnique(assets.map((asset) => asset.fileName), 'Duplicate pet asset filename')
  const assetIds = new Set(assets.map((asset) => asset.id))

  return {
    id: value.id,
    name: value.name,
    targetHeight: value.targetHeight,
    assets,
    actionSlots: parseActionSlots(value.actionSlots, assetIds),
    actionTemplates: parseActionTemplates(value.actionTemplates)
  }
}

function parsePetAsset(value: unknown): PetAsset {
  if (!isRecord(value) || !isSafeIdentifier(value.id)) {
    throw new Error('Invalid pet asset identifier')
  }
  if (value.format !== 'png' && value.format !== 'webp') {
    throw new Error('Invalid pet asset format')
  }
  if (
    typeof value.fileName !== 'string' ||
    !INTERNAL_FILE_PATTERN.test(value.fileName) ||
    value.fileName !== `${value.id}.${value.format}`
  ) {
    throw new Error('Invalid pet asset filename')
  }
  if (!isIntegerInRange(value.byteSize, 1, 20 * 1024 * 1024)) {
    throw new Error('Invalid pet asset byte size')
  }
  if (!isIntegerInRange(value.width, 1, 8192) || !isIntegerInRange(value.height, 1, 8192)) {
    throw new Error('Invalid pet asset dimensions')
  }

  const alphaBounds = parseAlphaBounds(value.alphaBounds, value.width, value.height)
  const normalization = parseNormalization(value.normalization)
  return {
    id: value.id,
    fileName: value.fileName,
    format: value.format,
    byteSize: value.byteSize,
    width: value.width,
    height: value.height,
    alphaBounds,
    normalization
  }
}

function parseAlphaBounds(value: unknown, imageWidth: number, imageHeight: number): AlphaBounds {
  if (!isRecord(value)) throw new Error('Invalid alpha bounds')
  if (
    !isIntegerInRange(value.x, 0, imageWidth - 1) ||
    !isIntegerInRange(value.y, 0, imageHeight - 1) ||
    !isIntegerInRange(value.width, 1, imageWidth) ||
    !isIntegerInRange(value.height, 1, imageHeight) ||
    value.x + value.width > imageWidth ||
    value.y + value.height > imageHeight
  ) {
    throw new Error('Invalid alpha bounds')
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height }
}

function parseNormalization(value: unknown): AssetNormalization {
  if (!isRecord(value)) throw new Error('Invalid asset normalization')
  if (
    !isFiniteNumberInRange(value.scale, 0.25, 4) ||
    !isFiniteNumberInRange(value.offsetX, -512, 512) ||
    !isFiniteNumberInRange(value.offsetY, -512, 512) ||
    !isFiniteNumberInRange(value.baselineOffset, -256, 256)
  ) {
    throw new Error('Invalid asset normalization')
  }
  return {
    scale: value.scale,
    offsetX: value.offsetX,
    offsetY: value.offsetY,
    baselineOffset: value.baselineOffset
  }
}

function parseActionSlots(value: unknown, assetIds: ReadonlySet<string>): PetActionSlots {
  if (!isRecord(value)) throw new Error('Invalid action slots')
  const result = {} as Record<ActionSlot, readonly string[]>

  for (const slot of ACTION_SLOTS) {
    const assignments = value[slot]
    if (!Array.isArray(assignments) || !assignments.every(isSafeIdentifier)) {
      throw new Error(`Invalid ${slot} action slot`)
    }
    assertUnique(assignments, `Duplicate ${slot} action asset`)
    if (assignments.some((assetId) => !assetIds.has(assetId))) {
      throw new Error(`Unknown asset in ${slot} action slot`)
    }
    result[slot] = [...assignments]
  }

  return result
}

function parseActionTemplates(value: unknown): PetActionTemplates {
  if (!isRecord(value)) throw new Error('Invalid action templates')
  const ranges = {
    idleIntervalMs: [3_000, 60_000],
    blinkIntervalMs: [2_000, 60_000],
    cuteDurationMs: [200, 5_000],
    pettingDurationMs: [200, 5_000],
    angryDurationMs: [300, 8_000],
    dragAngryVelocity: [200, 5_000]
  } as const
  const result = {} as Record<keyof PetActionTemplates, number>

  for (const key of Object.keys(ranges) as Array<keyof PetActionTemplates>) {
    const [minimum, maximum] = ranges[key]
    if (!isFiniteNumberInRange(value[key], minimum, maximum)) {
      throw new Error(`Invalid action template parameter: ${key}`)
    }
    result[key] = value[key]
  }
  return result
}

function parseNullableIdentifier(value: unknown, label: string): string | null {
  if (value === null) return null
  if (!isSafeIdentifier(value)) throw new Error(`Invalid ${label}`)
  return value
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= minimum && value <= maximum
}
