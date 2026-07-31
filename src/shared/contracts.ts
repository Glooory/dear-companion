export type WindowKind = 'pet' | 'settings'

export interface PetWindowSettings {
  x: number | null
  y: number | null
  displayId: string | null
  height: number
  visible: boolean
}

export interface AppSettingsV1 {
  schemaVersion: 1
  activePetId: string | null
  petWindow: PetWindowSettings
  autostartEnabled: boolean
  audio: { reminderEnabled: boolean; cryingEnabled: boolean }
  reminders: readonly []
}

export type AppSettings = AppSettingsV1

export interface FoundationApi {
  getSettings(): Promise<AppSettings>
  setPetVisibility(visible: boolean): Promise<AppSettings>
  openSettings(): Promise<void>
  getWindowKind(): WindowKind
}

export const DEFAULT_APP_SETTINGS = Object.freeze({
  schemaVersion: 1,
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
  reminders: Object.freeze([]) as readonly []
}) satisfies AppSettings

export function parseAppSettings(value: unknown): AppSettings {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Unsupported settings schema version')
  }

  if (!isNullableString(value.activePetId)) {
    throw new Error('Invalid active pet identifier')
  }

  const petWindow = value.petWindow
  if (!isRecord(petWindow)) {
    throw new Error('Invalid pet window settings')
  }

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
    throw new Error('Unsupported reminder data in schema version 1')
  }

  return {
    schemaVersion: 1,
    activePetId: value.activePetId,
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
