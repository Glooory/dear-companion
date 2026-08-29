import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type { SettingsWindowBounds } from './display-placement'

export const SETTINGS_WINDOW_STATE_FILE = 'settings-window-state.json'

export function parseSettingsWindowState(value: unknown): SettingsWindowBounds | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const width = record.width
  const height = record.height

  if (
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width < 680 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height < 520
  ) {
    return null
  }

  const result: SettingsWindowBounds = {
    width: Math.round(width),
    height: Math.round(height)
  }

  if (
    typeof record.x === 'number' &&
    Number.isFinite(record.x) &&
    typeof record.y === 'number' &&
    Number.isFinite(record.y)
  ) {
    result.x = Math.round(record.x)
    result.y = Math.round(record.y)
  }

  return result
}

export async function loadSettingsWindowState(
  userDataPath?: string
): Promise<SettingsWindowBounds | null> {
  if (!userDataPath) return null
  try {
    const raw = await readFile(join(userDataPath, SETTINGS_WINDOW_STATE_FILE), 'utf8')
    return parseSettingsWindowState(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function saveSettingsWindowState(
  userDataPath: string | undefined,
  bounds: SettingsWindowBounds
): Promise<void> {
  if (!userDataPath) return
  const validated = parseSettingsWindowState(bounds)
  if (!validated) return
  try {
    await writeFileAtomic(
      join(userDataPath, SETTINGS_WINDOW_STATE_FILE),
      JSON.stringify(validated, null, 2),
      { mode: 0o600 }
    )
  } catch {
    // Gracefully ignore filesystem errors during window state caching
  }
}
