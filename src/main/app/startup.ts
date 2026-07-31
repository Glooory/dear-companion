import type { AppSettings } from '../../shared/contracts'

interface StartupSettingsStore {
  load(): Promise<AppSettings>
}

interface StartupTray {
  create(): void
  refresh(settings: AppSettings): void
}

interface PrepareTrayOptions {
  settingsStore: StartupSettingsStore
  tray: StartupTray
  isQuitting: () => boolean
}

export async function prepareTray({
  settingsStore,
  tray,
  isQuitting
}: PrepareTrayOptions): Promise<AppSettings | null> {
  const settings = await settingsStore.load()
  if (isQuitting()) return null

  tray.create()
  tray.refresh(settings)
  return settings
}

export async function runStartup(
  start: () => Promise<unknown>,
  onFailure: () => void
): Promise<void> {
  try {
    await start()
  } catch {
    try {
      onFailure()
    } catch {
      // Startup failure handling must not create another unhandled rejection.
    }
  }
}
