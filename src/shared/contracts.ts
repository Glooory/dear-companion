export type WindowKind = 'pet' | 'settings'

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type CursorTolerance = 'sensitive' | 'standard' | 'relaxed'
export type AudioAssetFormat = 'mp3' | 'wav' | 'ogg'
export type BuiltInSoundId = 'gentle-chime' | 'soft-whimper'

export interface ReminderSounds {
  reminder: boolean
  crying: boolean
}

export interface ReminderSchedule {
  id: string
  enabled: boolean
  hour: number
  minute: number
  weekdays: readonly Weekday[]
  restDurationMinutes: number
  cursorTolerance: CursorTolerance
  message: string
  sounds: ReminderSounds
}

export interface AudioAsset {
  id: string
  fileName: string
  format: AudioAssetFormat
  byteSize: number
  available: boolean
}

export type AudioSource =
  | { kind: 'builtin'; id: BuiltInSoundId }
  | { kind: 'imported'; assetId: string }

export interface AudioSettingsV3 {
  reminderSource: AudioSource
  cryingSource: AudioSource
  assets: readonly AudioAsset[]
}

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
export const MAX_PET_PACK_BYTES = 250 * 1024 * 1024

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

export interface AppSettingsV3 {
  schemaVersion: 3
  activePetId: string | null
  petWindow: PetWindowSettings
  autostartEnabled: boolean
  audio: AudioSettingsV3
  reminders: readonly ReminderSchedule[]
  pets: readonly PetConfig[]
}

export type AppSettings = AppSettingsV3

export interface ReminderOccurrence {
  occurrenceId: string
  scheduleId: string
  scheduledFor: number
  restDurationMinutes: number
  cursorTolerance: CursorTolerance
  message: string
  sounds: ReminderSounds
}

export interface ReminderPrompt extends ReminderOccurrence {
  triggeredAt: number
}

export type RestSessionState = 'resting' | 'crying' | 'celebrating'

export interface RestSessionSnapshot {
  sessionId: string
  scheduleId: string | null
  startedAt: number
  endsAt: number
  state: RestSessionState
  cryingUntil: number | null
  cursorTolerance: CursorTolerance
  message: string
  sounds: ReminderSounds
}

export interface RestRuntimeSnapshot {
  serviceStatus: 'healthy' | 'error'
  serviceError?: { code: string; message: string }
  prompt: ReminderPrompt | null
  session: RestSessionSnapshot | null
}

export interface RestSystemSnapshot {
  reminders: readonly ReminderSchedule[]
  audio: AudioSettingsV3
  runtime: RestRuntimeSnapshot
}

export type CreateReminderInput = Omit<ReminderSchedule, 'id'>
export type UpdateReminderInput = ReminderSchedule
export interface AudioSourceInput {
  reminderSource: AudioSource
  cryingSource: AudioSource
}

export type AudioImportErrorCode =
  | 'unsupported-type'
  | 'empty-file'
  | 'file-too-large'
  | 'read-failed'
  | 'copy-failed'

export interface AudioImportFailure {
  index: number
  code: AudioImportErrorCode
  message: string
}

export interface AudioImportResult {
  imported: readonly AudioAsset[]
  failures: readonly AudioImportFailure[]
}

export interface AudioPlaybackRequest {
  requestId: string
  cue: 'reminder' | 'crying'
  source: AudioSource
  maxDurationMs: 30_000
}

export interface FoundationApi {
  getSettings(): Promise<AppSettings>
  setPetVisibility(visible: boolean): Promise<AppSettings>
  openSettings(): Promise<void>
  getWindowKind(): WindowKind
}

export type AutostartErrorCode =
  | 'os-read-failed'
  | 'os-write-failed'
  | 'readback-mismatch'
  | 'settings-save-failed'
  | 'rollback-failed'

export interface AutostartStatus {
  supported: boolean
  requested: boolean
  effective: boolean
  errorCode?: AutostartErrorCode
}

export interface PetRendererStatus {
  state: 'healthy' | 'recovering' | 'safe-mode'
  errorCode?: 'pet-renderer-failed'
}

export interface PetAssetAdjustment {
  id: string
  normalization: AssetNormalization
}

export interface PetUpdateInput {
  id: string
  name: string
  targetHeight: number
  assets: readonly PetAssetAdjustment[]
  actionSlots: PetActionSlots
  actionTemplates: PetActionTemplates
}

export type ImageImportErrorCode =
  | 'unsupported-type'
  | 'empty-file'
  | 'file-too-large'
  | 'read-failed'
  | 'decode-failed'
  | 'dimensions-too-large'
  | 'no-transparency'
  | 'fully-transparent'
  | 'pack-too-large'
  | 'copy-failed'

export interface ImageImportFailure {
  index: number
  code: ImageImportErrorCode
  message: string
}

export interface ImageImportResult {
  imported: readonly PetAsset[]
  failures: readonly ImageImportFailure[]
}

export interface PetSystemSnapshot {
  activePetId: string | null
  petWindow: PetWindowSettings
  pets: readonly PetConfig[]
}

export interface PetSystemApi extends FoundationApi {
  getPetSystemSnapshot(): Promise<PetSystemSnapshot>
  createPet(name: string): Promise<PetSystemSnapshot>
  chooseAndImportPetAssets(petId: string): Promise<ImageImportResult>
  updatePet(input: PetUpdateInput): Promise<PetSystemSnapshot>
  setActivePet(petId: string): Promise<PetSystemSnapshot>
  movePetBy(deltaX: number, deltaY: number): void
  showPetContextMenu(): void
  onPetSystemChanged(listener: (snapshot: PetSystemSnapshot) => void): () => void
}

export interface RestSystemApi extends PetSystemApi {
  getRestSystemSnapshot(): Promise<RestSystemSnapshot>
  createReminder(input: CreateReminderInput): Promise<RestSystemSnapshot>
  updateReminder(input: UpdateReminderInput): Promise<RestSystemSnapshot>
  deleteReminder(reminderId: string): Promise<RestSystemSnapshot>
  setReminderEnabled(reminderId: string, enabled: boolean): Promise<RestSystemSnapshot>
  retryReminderService(): Promise<RestSystemSnapshot>
  startPromptedRest(occurrenceId: string): Promise<RestSystemSnapshot>
  snoozePrompt(occurrenceId: string, minutes: 5 | 10 | 15): Promise<RestSystemSnapshot>
  endRestSession(): Promise<RestSystemSnapshot>
  chooseAndImportAudio(): Promise<AudioImportResult>
  updateAudioSources(input: AudioSourceInput): Promise<RestSystemSnapshot>
  reportAudioPlaybackFailure(requestId: string, assetId: string | null): void
  onRestSystemChanged(listener: (snapshot: RestSystemSnapshot) => void): () => void
  onAudioPlaybackRequested(listener: (request: AudioPlaybackRequest) => void): () => void
}

export interface ReleaseHardeningApi extends RestSystemApi {
  getAutostartStatus(): Promise<AutostartStatus>
  setAutostartEnabled(enabled: boolean): Promise<AutostartStatus>
  getPetRendererStatus(): Promise<PetRendererStatus>
  retryPetRenderer(): Promise<PetRendererStatus>
  onPetRendererStatusChanged(listener: (status: PetRendererStatus) => void): () => void
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
  schemaVersion: 3,
  activePetId: null,
  petWindow: Object.freeze({
    x: null,
    y: null,
    displayId: null,
    height: 180,
    visible: true
  }),
  autostartEnabled: false,
  audio: Object.freeze({
    reminderSource: Object.freeze({ kind: 'builtin', id: 'gentle-chime' }),
    cryingSource: Object.freeze({ kind: 'builtin', id: 'soft-whimper' }),
    assets: Object.freeze([]) as readonly AudioAsset[]
  }),
  reminders: Object.freeze([]) as readonly ReminderSchedule[],
  pets: Object.freeze([]) as readonly PetConfig[]
}) satisfies AppSettings

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const INTERNAL_FILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}\.(png|webp)$/
const INTERNAL_AUDIO_FILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}\.(mp3|wav|ogg)$/

export function parseAppSettings(value: unknown): AppSettings {
  return migrateAppSettings(value).settings
}

export function parseAutostartEnabledInput(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new TypeError('enabled must be a boolean')
  return value
}

export function parseAutostartStatus(value: unknown): AutostartStatus {
  if (!isRecord(value)) throw new Error('Invalid autostart status')
  assertExactKeys(
    value,
    value.errorCode === undefined
      ? ['supported', 'requested', 'effective']
      : ['supported', 'requested', 'effective', 'errorCode'],
    'Invalid autostart status'
  )
  if (
    typeof value.supported !== 'boolean' ||
    typeof value.requested !== 'boolean' ||
    typeof value.effective !== 'boolean' ||
    (value.errorCode !== undefined && !isAutostartErrorCode(value.errorCode))
  ) {
    throw new Error('Invalid autostart status')
  }
  return {
    supported: value.supported,
    requested: value.requested,
    effective: value.effective,
    ...(value.errorCode ? { errorCode: value.errorCode } : {})
  }
}

export function parsePetRendererStatus(value: unknown): PetRendererStatus {
  if (!isRecord(value)) throw new Error('Invalid pet renderer status')
  assertExactKeys(
    value,
    value.errorCode === undefined ? ['state'] : ['state', 'errorCode'],
    'Invalid pet renderer status'
  )
  if (
    value.state !== 'healthy' &&
    value.state !== 'recovering' &&
    value.state !== 'safe-mode'
  ) {
    throw new Error('Invalid pet renderer status')
  }
  if (value.errorCode !== undefined && value.errorCode !== 'pet-renderer-failed') {
    throw new Error('Invalid pet renderer status')
  }
  return {
    state: value.state,
    ...(value.errorCode ? { errorCode: value.errorCode } : {})
  }
}

export function migrateAppSettings(value: unknown): SettingsMigrationResult {
  if (!isRecord(value)) throw new Error('Unsupported settings schema version')

  if (value.schemaVersion === 1) {
    const legacy = parseAppSettingsV1(value)
    return {
      migrated: true,
      settings: {
        schemaVersion: 3,
        activePetId: null,
        petWindow: legacy.petWindow,
        autostartEnabled: legacy.autostartEnabled,
        audio: createDefaultAudioSettings(),
        reminders: [],
        pets: []
      }
    }
  }

  if (value.schemaVersion === 2) {
    const legacy = parseAppSettingsV2(value)
    return {
      migrated: true,
      settings: {
        schemaVersion: 3,
        activePetId: legacy.activePetId,
        petWindow: legacy.petWindow,
        autostartEnabled: legacy.autostartEnabled,
        audio: createDefaultAudioSettings(),
        reminders: [],
        pets: legacy.pets
      }
    }
  }

  if (value.schemaVersion === 3) {
    return { migrated: false, settings: parseAppSettingsV3(value) }
  }

  throw new Error('Unsupported settings schema version')
}

export function parseCreateReminderInput(value: unknown): CreateReminderInput {
  if (!isRecord(value)) throw new Error('Invalid reminder input')
  assertExactKeys(value, [
    'enabled', 'hour', 'minute', 'weekdays', 'restDurationMinutes',
    'cursorTolerance', 'message', 'sounds'
  ], 'Invalid reminder input')
  return parseReminderFields(value)
}

export function parseUpdateReminderInput(value: unknown): UpdateReminderInput {
  if (!isRecord(value)) throw new Error('Invalid reminder input')
  assertExactKeys(value, [
    'id', 'enabled', 'hour', 'minute', 'weekdays', 'restDurationMinutes',
    'cursorTolerance', 'message', 'sounds'
  ], 'Invalid reminder input')
  return { id: parsePetIdentifier(value.id), ...parseReminderFields(value) }
}

export function parseAudioSourceInput(
  value: unknown,
  availableAssetIds: readonly string[]
): AudioSourceInput {
  if (!isRecord(value)) throw new Error('Invalid audio source input')
  assertExactKeys(value, ['reminderSource', 'cryingSource'], 'Invalid audio source input')
  const assets = new Set(availableAssetIds)
  return {
    reminderSource: parseAudioSource(value.reminderSource, assets, 'gentle-chime'),
    cryingSource: parseAudioSource(value.cryingSource, assets, 'soft-whimper')
  }
}

export function createRestSystemSnapshot(
  settings: AppSettings,
  runtime: RestRuntimeSnapshot
): RestSystemSnapshot {
  return {
    reminders: settings.reminders.map(cloneReminder),
    audio: cloneAudioSettings(settings.audio),
    runtime: cloneRuntime(runtime)
  }
}

export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value)
}

export function parsePetIdentifier(value: unknown): string {
  if (!isSafeIdentifier(value)) throw new Error('Invalid pet identifier')
  return value
}

export function parsePetName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid pet name')
  const name = value.trim()
  if (name.length < 1 || name.length > 80) throw new Error('Invalid pet name')
  return name
}

export function parsePetUpdateInput(
  value: unknown,
  availableAssetIds: readonly string[]
): PetUpdateInput {
  if (!isRecord(value)) throw new Error('Invalid pet update')
  const id = parsePetIdentifier(value.id)
  const name = parsePetName(value.name)
  if (!isFiniteNumberInRange(value.targetHeight, 80, 260)) {
    throw new Error('Invalid pet target height')
  }
  if (!Array.isArray(value.assets)) throw new Error('Invalid pet asset adjustments')
  const assets = value.assets.map((entry) => {
    if (!isRecord(entry)) throw new Error('Invalid pet asset adjustment')
    return {
      id: parsePetIdentifier(entry.id),
      normalization: parseNormalization(entry.normalization)
    }
  })
  assertUnique(assets.map((asset) => asset.id), 'Duplicate pet asset adjustment')
  const expected = new Set(availableAssetIds)
  if (assets.length !== expected.size || assets.some((asset) => !expected.has(asset.id))) {
    throw new Error('Pet update must contain every current asset exactly once')
  }

  return {
    id,
    name,
    targetHeight: value.targetHeight,
    assets,
    actionSlots: parseActionSlots(value.actionSlots, expected),
    actionTemplates: parseActionTemplates(value.actionTemplates)
  }
}

export function createPetSystemSnapshot(settings: AppSettings): PetSystemSnapshot {
  return {
    activePetId: settings.activePetId,
    petWindow: { ...settings.petWindow },
    pets: settings.pets.map((pet) => parsePetConfig(pet, 0))
  }
}

function parseAppSettingsV1(value: Record<string, unknown>): AppSettingsV1 {
  assertExactKeys(value, ['schemaVersion', 'activePetId', 'petWindow', 'autostartEnabled', 'audio', 'reminders'], 'Invalid schema v1 settings')
  const base = parseFoundationFields(value)
  return {
    schemaVersion: 1,
    activePetId: parseNullableIdentifier(value.activePetId, 'active pet identifier'),
    ...base
  }
}

function parseAppSettingsV2(value: Record<string, unknown>): AppSettingsV2 {
  assertExactKeys(value, ['schemaVersion', 'activePetId', 'petWindow', 'autostartEnabled', 'audio', 'reminders', 'pets'], 'Invalid schema v2 settings')
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

function parseAppSettingsV3(value: Record<string, unknown>): AppSettingsV3 {
  assertExactKeys(value, [
    'schemaVersion', 'activePetId', 'petWindow', 'autostartEnabled', 'audio', 'reminders', 'pets'
  ], 'Invalid schema v3 settings')
  const foundation = parseCommonFoundationFields(value)
  if (!Array.isArray(value.pets)) throw new Error('Invalid pet collection')
  const pets = value.pets.map(parsePetConfig)
  assertUnique(pets.map((pet) => pet.id), 'Duplicate pet identifier')
  const activePetId = parseNullableIdentifier(value.activePetId, 'active pet identifier')
  validateActivePet(activePetId, pets)
  if (!Array.isArray(value.reminders)) throw new Error('Invalid reminder collection')
  const reminders = value.reminders.map(parseReminderSchedule)
  assertUnique(reminders.map((reminder) => reminder.id), 'Duplicate reminder identifier')
  const audio = parseAudioSettings(value.audio)
  return { schemaVersion: 3, activePetId, ...foundation, audio, reminders, pets }
}

function parseFoundationFields(value: Record<string, unknown>): Omit<
  AppSettingsV1,
  'schemaVersion' | 'activePetId'
> {
  const petWindow = value.petWindow
  if (!isRecord(petWindow)) throw new Error('Invalid pet window settings')
  assertExactKeys(petWindow, ['x', 'y', 'displayId', 'height', 'visible'], 'Invalid pet window settings')
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
  if (isRecord(audio)) assertExactKeys(audio, ['reminderEnabled', 'cryingEnabled'], 'Invalid audio settings')
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

function parseCommonFoundationFields(value: Record<string, unknown>): Pick<
  AppSettingsV3,
  'petWindow' | 'autostartEnabled'
> {
  const petWindow = value.petWindow
  if (!isRecord(petWindow)) throw new Error('Invalid pet window settings')
  assertExactKeys(petWindow, ['x', 'y', 'displayId', 'height', 'visible'], 'Invalid pet window settings')
  if (
    !isNullableFiniteNumber(petWindow.x) || !isNullableFiniteNumber(petWindow.y) ||
    !isNullableString(petWindow.displayId) ||
    !isFiniteNumberInRange(petWindow.height, 80, 260) ||
    typeof petWindow.visible !== 'boolean'
  ) throw new Error('Invalid pet window settings')
  if (typeof value.autostartEnabled !== 'boolean') throw new Error('Invalid autostart setting')
  return {
    petWindow: {
      x: petWindow.x, y: petWindow.y, displayId: petWindow.displayId,
      height: petWindow.height, visible: petWindow.visible
    },
    autostartEnabled: value.autostartEnabled
  }
}

function validateActivePet(activePetId: string | null, pets: readonly PetConfig[]): void {
  if (activePetId === null) return
  const activePet = pets.find((pet) => pet.id === activePetId)
  if (!activePet || activePet.actionSlots.idle.length === 0) {
    throw new Error('Active pet must reference a configured idle asset')
  }
}

function parseReminderSchedule(value: unknown): ReminderSchedule {
  if (!isRecord(value)) throw new Error('Invalid reminder schedule')
  assertExactKeys(value, [
    'id', 'enabled', 'hour', 'minute', 'weekdays', 'restDurationMinutes',
    'cursorTolerance', 'message', 'sounds'
  ], 'Invalid reminder schedule')
  return { id: parsePetIdentifier(value.id), ...parseReminderFields(value) }
}

function parseReminderFields(value: Record<string, unknown>): CreateReminderInput {
  if (typeof value.enabled !== 'boolean') throw new Error('Invalid reminder enabled state')
  if (!isIntegerInRange(value.hour, 0, 23) || !isIntegerInRange(value.minute, 0, 59)) {
    throw new Error('Invalid reminder time')
  }
  if (!Array.isArray(value.weekdays) || value.weekdays.length === 0 ||
      !value.weekdays.every((day) => isIntegerInRange(day, 0, 6))) {
    throw new Error('Invalid reminder weekdays')
  }
  const weekdays = value.weekdays as Weekday[]
  if (new Set(weekdays).size !== weekdays.length) throw new Error('Duplicate reminder weekday')
  if (!isIntegerInRange(value.restDurationMinutes, 1, 120)) {
    throw new Error('Invalid reminder duration')
  }
  if (value.cursorTolerance !== 'sensitive' && value.cursorTolerance !== 'standard' &&
      value.cursorTolerance !== 'relaxed') throw new Error('Invalid cursor tolerance')
  if (typeof value.message !== 'string') throw new Error('Invalid reminder message')
  const message = value.message.trim()
  if (message.length < 1 || message.length > 200) throw new Error('Invalid reminder message')
  if (!isRecord(value.sounds)) throw new Error('Invalid reminder sounds')
  assertExactKeys(value.sounds, ['reminder', 'crying'], 'Invalid reminder sounds')
  if (typeof value.sounds.reminder !== 'boolean' || typeof value.sounds.crying !== 'boolean') {
    throw new Error('Invalid reminder sounds')
  }
  return {
    enabled: value.enabled,
    hour: value.hour,
    minute: value.minute,
    weekdays: [...weekdays],
    restDurationMinutes: value.restDurationMinutes,
    cursorTolerance: value.cursorTolerance,
    message,
    sounds: { reminder: value.sounds.reminder, crying: value.sounds.crying }
  }
}

function parseAudioSettings(value: unknown): AudioSettingsV3 {
  if (!isRecord(value)) throw new Error('Invalid audio settings')
  assertExactKeys(value, ['reminderSource', 'cryingSource', 'assets'], 'Invalid audio settings')
  if (!Array.isArray(value.assets)) throw new Error('Invalid audio asset collection')
  const assets = value.assets.map(parseAudioAsset)
  assertUnique(assets.map((asset) => asset.id), 'Duplicate audio asset identifier')
  assertUnique(assets.map((asset) => asset.fileName), 'Duplicate audio asset filename')
  const assetIds = new Set(assets.map((asset) => asset.id))
  return {
    reminderSource: parseAudioSource(value.reminderSource, assetIds, 'gentle-chime'),
    cryingSource: parseAudioSource(value.cryingSource, assetIds, 'soft-whimper'),
    assets
  }
}

function parseAudioAsset(value: unknown): AudioAsset {
  if (!isRecord(value) || !isSafeIdentifier(value.id)) throw new Error('Invalid audio asset identifier')
  assertExactKeys(value, ['id', 'fileName', 'format', 'byteSize', 'available'], 'Invalid audio asset')
  if (value.format !== 'mp3' && value.format !== 'wav' && value.format !== 'ogg') {
    throw new Error('Invalid audio asset format')
  }
  if (typeof value.fileName !== 'string' || !INTERNAL_AUDIO_FILE_PATTERN.test(value.fileName) ||
      value.fileName !== `${value.id}.${value.format}`) throw new Error('Invalid audio asset filename')
  if (!isIntegerInRange(value.byteSize, 1, 20 * 1024 * 1024)) throw new Error('Invalid audio asset byte size')
  if (typeof value.available !== 'boolean') throw new Error('Invalid audio asset availability')
  return { id: value.id, fileName: value.fileName, format: value.format, byteSize: value.byteSize, available: value.available }
}

function parseAudioSource(
  value: unknown,
  assetIds: ReadonlySet<string>,
  allowedBuiltIn: BuiltInSoundId
): AudioSource {
  if (!isRecord(value) || typeof value.kind !== 'string') throw new Error('Invalid audio source')
  if (value.kind === 'builtin') {
    assertExactKeys(value, ['kind', 'id'], 'Invalid audio source')
    if (value.id !== allowedBuiltIn) throw new Error('Unknown built-in audio source')
    return { kind: 'builtin', id: allowedBuiltIn }
  }
  if (value.kind === 'imported') {
    assertExactKeys(value, ['kind', 'assetId'], 'Invalid audio source')
    const assetId = parsePetIdentifier(value.assetId)
    if (!assetIds.has(assetId)) throw new Error('Stale imported audio source')
    return { kind: 'imported', assetId }
  }
  throw new Error('Unknown audio source')
}

function createDefaultAudioSettings(): AudioSettingsV3 {
  return {
    reminderSource: { kind: 'builtin', id: 'gentle-chime' },
    cryingSource: { kind: 'builtin', id: 'soft-whimper' },
    assets: []
  }
}

function cloneReminder(reminder: ReminderSchedule): ReminderSchedule {
  return { ...reminder, weekdays: [...reminder.weekdays], sounds: { ...reminder.sounds } }
}

function cloneAudioSettings(audio: AudioSettingsV3): AudioSettingsV3 {
  return {
    reminderSource: { ...audio.reminderSource },
    cryingSource: { ...audio.cryingSource },
    assets: audio.assets.map((asset) => ({ ...asset }))
  }
}

function cloneRuntime(runtime: RestRuntimeSnapshot): RestRuntimeSnapshot {
  return {
    serviceStatus: runtime.serviceStatus,
    ...(runtime.serviceError ? { serviceError: { ...runtime.serviceError } } : {}),
    prompt: runtime.prompt ? { ...runtime.prompt, sounds: { ...runtime.prompt.sounds } } : null,
    session: runtime.session ? { ...runtime.session, sounds: { ...runtime.session.sounds } } : null
  }
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], message: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(message)
  }
}

function isAutostartErrorCode(value: unknown): value is AutostartErrorCode {
  return value === 'os-read-failed' || value === 'os-write-failed' ||
    value === 'readback-mismatch' || value === 'settings-save-failed' ||
    value === 'rollback-failed'
}

function parsePetConfig(value: unknown, index: number): PetConfig {
  if (!isRecord(value)) throw new Error(`Invalid pet at index ${index}`)
  assertExactKeys(value, ['id', 'name', 'targetHeight', 'assets', 'actionSlots', 'actionTemplates'], 'Invalid pet configuration')
  if (!isSafeIdentifier(value.id)) throw new Error('Invalid pet identifier')
  const name = parsePetName(value.name)
  if (name !== value.name) throw new Error('Invalid pet name')
  if (!isFiniteNumberInRange(value.targetHeight, 80, 260)) {
    throw new Error('Invalid pet target height')
  }
  if (!Array.isArray(value.assets)) throw new Error('Invalid pet asset collection')

  const assets = value.assets.map(parsePetAsset)
  assertUnique(assets.map((asset) => asset.id), 'Duplicate pet asset identifier')
  assertUnique(assets.map((asset) => asset.fileName), 'Duplicate pet asset filename')
  const assetIds = new Set(assets.map((asset) => asset.id))
  if (assets.reduce((total, asset) => total + asset.byteSize, 0) > MAX_PET_PACK_BYTES) {
    throw new Error('Pet pack exceeds 250 MB')
  }

  return {
    id: value.id,
    name,
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
  assertExactKeys(value, ['id', 'fileName', 'format', 'byteSize', 'width', 'height', 'alphaBounds', 'normalization'], 'Invalid pet asset')
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
  assertExactKeys(value, ['x', 'y', 'width', 'height'], 'Invalid alpha bounds')
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
  assertExactKeys(value, ['scale', 'offsetX', 'offsetY', 'baselineOffset'], 'Invalid asset normalization')
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
  assertExactKeys(value, ACTION_SLOTS, 'Invalid action slots')
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
  assertExactKeys(value, Object.keys(ranges), 'Invalid action templates')
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
