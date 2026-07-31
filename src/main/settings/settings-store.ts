import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import { type AppSettings, parseAppSettings } from '../../shared/contracts'
import { DEFAULT_APP_SETTINGS } from './default-settings'

const SETTINGS_FILE_NAME = 'settings.json'
const BACKUP_FILE_NAME = 'settings.backup.json'
const SETTINGS_FILE_MODE = 0o600

type SettingsFileResult =
  | { status: 'valid'; settings: AppSettings }
  | { status: 'missing' | 'invalid' | 'unreadable' }

export class SettingsRecoveryError extends Error {
  constructor() {
    super('Settings could not be recovered from local storage')
    this.name = 'SettingsRecoveryError'
  }
}

export class SettingsStore {
  private updateQueue: Promise<void> = Promise.resolve()

  constructor(private readonly userDataPath: string) {}

  async load(): Promise<AppSettings> {
    const primary = await this.readSettingsFile(this.settingsPath)
    if (primary.status === 'valid') {
      return primary.settings
    }
    if (primary.status === 'unreadable') {
      throw new SettingsRecoveryError()
    }

    const backup = await this.readSettingsFile(this.backupPath)
    if (backup.status === 'valid') {
      try {
        await this.writeSettingsFile(this.settingsPath, backup.settings)
      } catch {
        throw new SettingsRecoveryError()
      }
      return backup.settings
    }

    if (primary.status === 'missing' && backup.status === 'missing') {
      return parseAppSettings(DEFAULT_APP_SETTINGS)
    }

    throw new SettingsRecoveryError()
  }

  async save(settings: AppSettings): Promise<void> {
    const validated = parseAppSettings(settings)
    const primary = await this.readSettingsFile(this.settingsPath)

    if (primary.status === 'unreadable') {
      throw new Error('Existing settings could not be read safely')
    }

    if (primary.status === 'valid') {
      await this.writeSettingsFile(this.backupPath, primary.settings)
    }

    await this.writeSettingsFile(this.settingsPath, validated)
  }

  update(mutator: (current: AppSettings) => AppSettings): Promise<AppSettings> {
    const operation = this.updateQueue.then(async () => {
      const next = parseAppSettings(mutator(await this.load()))
      await this.save(next)
      return next
    })

    this.updateQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private get settingsPath(): string {
    return join(this.userDataPath, SETTINGS_FILE_NAME)
  }

  private get backupPath(): string {
    return join(this.userDataPath, BACKUP_FILE_NAME)
  }

  private async readSettingsFile(path: string): Promise<SettingsFileResult> {
    let contents: string

    try {
      contents = await readFile(path, 'utf8')
    } catch (error) {
      return isMissingFileError(error) ? { status: 'missing' } : { status: 'unreadable' }
    }

    try {
      return { status: 'valid', settings: parseAppSettings(JSON.parse(contents)) }
    } catch {
      return { status: 'invalid' }
    }
  }

  private async writeSettingsFile(path: string, settings: AppSettings): Promise<void> {
    await writeFileAtomic(path, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: SETTINGS_FILE_MODE
    })
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
