import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import writeFileAtomic from 'write-file-atomic'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppSettingsV1
} from '../../shared/contracts'
import { SettingsRecoveryError, SettingsStore } from './settings-store'

const ioFaults = vi.hoisted(() => ({
  unreadablePaths: new Set<string>(),
  failedAtomicWritePaths: new Set<string>()
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()

  return {
    ...actual,
    readFile: vi.fn(async (...args: unknown[]) => {
      const path = args[0]
      if (typeof path === 'string' && ioFaults.unreadablePaths.has(path)) {
        throw Object.assign(new Error('Injected read failure'), { code: 'EIO' })
      }
      return Reflect.apply(actual.readFile, actual, args)
    })
  }
})

vi.mock('write-file-atomic', async (importOriginal) => {
  const actual = await importOriginal<{ default: (...args: unknown[]) => Promise<void> }>()

  return {
    ...actual,
    default: vi.fn(async (...args: unknown[]) => {
      const path = args[0]
      if (typeof path === 'string' && ioFaults.failedAtomicWritePaths.has(path)) {
        throw new Error('Injected atomic write failure')
      }
      return Reflect.apply(actual.default, undefined, args)
    })
  }
})

const temporaryDirectories: string[] = []

async function createUserDataPath(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dear-companion-settings-'))
  temporaryDirectories.push(path)
  return path
}

afterEach(async () => {
  ioFaults.unreadablePaths.clear()
  ioFaults.failedAtomicWritePaths.clear()
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('SettingsStore', () => {
  it('returns defaults without writing on first load', async () => {
    const userDataPath = await createUserDataPath()
    const settings = await new SettingsStore(userDataPath).load()

    expect(settings).toEqual(DEFAULT_APP_SETTINGS)
    expect(settings).not.toBe(DEFAULT_APP_SETTINGS)
    expect(settings.petWindow).not.toBe(DEFAULT_APP_SETTINGS.petWindow)
    expect(settings.audio).not.toBe(DEFAULT_APP_SETTINGS.audio)
    expect(settings.reminders).not.toBe(DEFAULT_APP_SETTINGS.reminders)
    expect(settings.pets).not.toBe(DEFAULT_APP_SETTINGS.pets)
    expect(await readdir(userDataPath)).toEqual([])
  })

  it('saves and reloads validated settings', async () => {
    const userDataPath = await createUserDataPath()
    const expected: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      activePetId: null,
      petWindow: {
        ...DEFAULT_APP_SETTINGS.petWindow,
        x: 120,
        y: 80,
        displayId: 'display-1',
        height: 220,
        visible: false
      }
    }

    await new SettingsStore(userDataPath).save(expected)

    const settingsPath = join(userDataPath, 'settings.json')
    expect(await new SettingsStore(userDataPath).load()).toEqual(expected)
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual(expected)
    expect(vi.mocked(writeFileAtomic)).toHaveBeenCalledWith(settingsPath, expect.any(String), {
      encoding: 'utf8',
      mode: 0o600
    })
    if (process.platform !== 'win32') {
      expect((await stat(settingsPath)).mode & 0o777).toBe(0o600)
    }
  })

  it('restores the backup when settings.json is corrupt', async () => {
    const userDataPath = await createUserDataPath()
    const store = new SettingsStore(userDataPath)
    const previous: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, height: 200 }
    }
    const current: AppSettings = {
      ...previous,
      petWindow: { ...previous.petWindow, visible: false }
    }

    await store.save(previous)
    await store.save(current)
    await writeFile(join(userDataPath, 'settings.json'), '{corrupt primary')

    expect(await store.load()).toEqual(previous)
    expect(JSON.parse(await readFile(join(userDataPath, 'settings.json'), 'utf8'))).toEqual(previous)
    if (process.platform !== 'win32') {
      expect((await stat(join(userDataPath, 'settings.json'))).mode & 0o777).toBe(0o600)
    }
  })

  it('throws when both primary and backup files are corrupt', async () => {
    const userDataPath = await createUserDataPath()
    const primarySecret = 'primary-private-contents'
    const backupSecret = 'backup-private-contents'
    await writeFile(join(userDataPath, 'settings.json'), `{${primarySecret}`)
    await writeFile(join(userDataPath, 'settings.backup.json'), `{${backupSecret}`)

    const error = await new SettingsStore(userDataPath).load().catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(SettingsRecoveryError)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain(primarySecret)
    expect((error as Error).message).not.toContain(backupSecret)
  })

  it('preserves existing valid settings when a save payload is invalid', async () => {
    const userDataPath = await createUserDataPath()
    const store = new SettingsStore(userDataPath)
    const existing: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, height: 210 }
    }
    await store.save(existing)

    const invalid = {
      ...existing,
      petWindow: { ...existing.petWindow, height: 999 }
    } as AppSettings

    await expect(store.save(invalid)).rejects.toThrow('Invalid pet window settings')
    expect(await store.load()).toEqual(existing)
  })

  it('does not overwrite an unreadable primary with an older backup', async () => {
    const userDataPath = await createUserDataPath()
    const store = new SettingsStore(userDataPath)
    const previous: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, height: 200 }
    }
    const current: AppSettings = {
      ...previous,
      petWindow: { ...previous.petWindow, height: 230 }
    }
    await store.save(previous)
    await store.save(current)

    const settingsPath = join(userDataPath, 'settings.json')
    ioFaults.unreadablePaths.add(settingsPath)

    await expect(store.load()).rejects.toBeInstanceOf(SettingsRecoveryError)
    ioFaults.unreadablePaths.clear()
    expect(await store.load()).toEqual(current)
  })

  it('leaves the primary untouched when the backup write fails', async () => {
    const userDataPath = await createUserDataPath()
    const store = new SettingsStore(userDataPath)
    const existing: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, height: 200 }
    }
    await store.save(existing)

    ioFaults.failedAtomicWritePaths.add(join(userDataPath, 'settings.backup.json'))
    await expect(
      store.save({
        ...existing,
        petWindow: { ...existing.petWindow, height: 230 }
      })
    ).rejects.toThrow('Injected atomic write failure')

    ioFaults.failedAtomicWritePaths.clear()
    expect(await store.load()).toEqual(existing)
  })

  it('leaves the primary untouched when its atomic replacement fails', async () => {
    const userDataPath = await createUserDataPath()
    const store = new SettingsStore(userDataPath)
    const existing: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, height: 200 }
    }
    await store.save(existing)

    ioFaults.failedAtomicWritePaths.add(join(userDataPath, 'settings.json'))
    await expect(
      store.save({
        ...existing,
        petWindow: { ...existing.petWindow, height: 230 }
      })
    ).rejects.toThrow('Injected atomic write failure')

    ioFaults.failedAtomicWritePaths.clear()
    expect(await store.load()).toEqual(existing)
    expect(JSON.parse(await readFile(join(userDataPath, 'settings.backup.json'), 'utf8'))).toEqual(
      existing
    )
  })

  it('leaves recovery files untouched when restoring the backup fails', async () => {
    const userDataPath = await createUserDataPath()
    const store = new SettingsStore(userDataPath)
    const previous: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      petWindow: { ...DEFAULT_APP_SETTINGS.petWindow, height: 200 }
    }
    await store.save(previous)
    await store.save({
      ...previous,
      petWindow: { ...previous.petWindow, height: 230 }
    })

    const settingsPath = join(userDataPath, 'settings.json')
    const corruptPrimary = '{corrupt primary'
    await writeFile(settingsPath, corruptPrimary)
    ioFaults.failedAtomicWritePaths.add(settingsPath)

    await expect(store.load()).rejects.toBeInstanceOf(SettingsRecoveryError)
    ioFaults.failedAtomicWritePaths.clear()
    expect(await readFile(settingsPath, 'utf8')).toBe(corruptPrimary)
    expect(JSON.parse(await readFile(join(userDataPath, 'settings.backup.json'), 'utf8'))).toEqual(
      previous
    )
  })

  it('serializes concurrent updates so neither mutation is lost', async () => {
    const userDataPath = await createUserDataPath()
    const store = new SettingsStore(userDataPath)

    const visibilityUpdate = store.update((current) => ({
      ...current,
      petWindow: { ...current.petWindow, visible: false }
    }))
    const heightUpdate = store.update((current) => ({
      ...current,
      petWindow: { ...current.petWindow, height: 240 }
    }))

    const [, committedHeight] = await Promise.all([visibilityUpdate, heightUpdate])

    expect(committedHeight.petWindow).toMatchObject({ visible: false, height: 240 })
    expect((await store.load()).petWindow).toMatchObject({ visible: false, height: 240 })
  })

  it('continues serialized updates after a rejected mutation', async () => {
    const userDataPath = await createUserDataPath()
    const store = new SettingsStore(userDataPath)

    const rejected = store.update((current) => ({
      ...current,
      petWindow: { ...current.petWindow, height: 999 }
    }))
    const committed = store.update((current) => ({
      ...current,
      petWindow: { ...current.petWindow, visible: false }
    }))

    await expect(rejected).rejects.toThrow('Invalid pet window settings')
    await expect(committed).resolves.toMatchObject({ petWindow: { visible: false } })
  })

  it('migrates a valid v1 primary and preserves the original as backup', async () => {
    const userDataPath = await createUserDataPath()
    const legacy: AppSettingsV1 = {
      schemaVersion: 1,
      activePetId: 'legacy-pet',
      petWindow: { x: 20, y: 40, displayId: '1', height: 220, visible: false },
      autostartEnabled: false,
      audio: { reminderEnabled: false, cryingEnabled: false },
      reminders: []
    }
    await writeFile(join(userDataPath, 'settings.json'), JSON.stringify(legacy))

    const migrated = await new SettingsStore(userDataPath).load()

    expect(migrated).toEqual({ ...legacy, schemaVersion: 2, activePetId: null, pets: [] })
    expect(JSON.parse(await readFile(join(userDataPath, 'settings.json'), 'utf8'))).toEqual(migrated)
    expect(JSON.parse(await readFile(join(userDataPath, 'settings.backup.json'), 'utf8'))).toEqual(legacy)
  })

  it('recovers a corrupt primary from a valid v1 backup as schema v2', async () => {
    const userDataPath = await createUserDataPath()
    const legacy: AppSettingsV1 = {
      schemaVersion: 1,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: { reminderEnabled: false, cryingEnabled: false },
      reminders: []
    }
    await writeFile(join(userDataPath, 'settings.json'), '{broken')
    await writeFile(join(userDataPath, 'settings.backup.json'), JSON.stringify(legacy))

    await expect(new SettingsStore(userDataPath).load()).resolves.toEqual({
      ...legacy,
      schemaVersion: 2,
      pets: []
    })
  })

  it('leaves a v1 primary intact when migration backup write fails', async () => {
    const userDataPath = await createUserDataPath()
    const legacy: AppSettingsV1 = {
      schemaVersion: 1,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: { reminderEnabled: false, cryingEnabled: false },
      reminders: []
    }
    const settingsPath = join(userDataPath, 'settings.json')
    await writeFile(settingsPath, JSON.stringify(legacy))
    ioFaults.failedAtomicWritePaths.add(join(userDataPath, 'settings.backup.json'))

    await expect(new SettingsStore(userDataPath).load()).rejects.toBeInstanceOf(SettingsRecoveryError)
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual(legacy)
  })

  it('leaves a v1 primary intact when migration replacement fails', async () => {
    const userDataPath = await createUserDataPath()
    const legacy: AppSettingsV1 = {
      schemaVersion: 1,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: { reminderEnabled: false, cryingEnabled: false },
      reminders: []
    }
    const settingsPath = join(userDataPath, 'settings.json')
    await writeFile(settingsPath, JSON.stringify(legacy))
    ioFaults.failedAtomicWritePaths.add(settingsPath)

    await expect(new SettingsStore(userDataPath).load()).rejects.toBeInstanceOf(SettingsRecoveryError)
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual(legacy)
    expect(JSON.parse(await readFile(join(userDataPath, 'settings.backup.json'), 'utf8'))).toEqual(legacy)
  })
})
