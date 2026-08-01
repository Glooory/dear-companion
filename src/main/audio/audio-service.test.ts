import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsStore } from '../settings/settings-store'
import { AudioService } from './audio-service'

const directories: string[] = []

async function harness() {
  const userDataPath = await mkdtemp(join(tmpdir(), 'dear-companion-audio-'))
  directories.push(userDataPath)
  const settingsStore = new SettingsStore(userDataPath)
  const ids = ['sound-1', 'sound-2', 'request-1', 'request-2'][Symbol.iterator]()
  const onPlaybackRequested = vi.fn()
  const service = new AudioService({ userDataPath, settingsStore, onPlaybackRequested, idFactory: () => ids.next().value ?? 'fallback-id' })
  return { userDataPath, settingsStore, service, onPlaybackRequested }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('AudioService', () => {
  it('imports successful siblings with safe names and omits original paths', async () => {
    const { userDataPath, service } = await harness()
    const validPath = join(userDataPath, 'family voice.dat')
    const invalidPath = join(userDataPath, 'bad.mp3')
    await writeFile(validPath, Buffer.from('RIFFxxxxWAVEpayload'))
    await writeFile(invalidPath, Buffer.from('invalid'))
    const result = await service.importAssets([validPath, invalidPath])
    expect(result.imported).toEqual([{ id: 'sound-1', fileName: 'sound-1.wav', format: 'wav', byteSize: 19, available: true }])
    expect(result.failures[0]).toMatchObject({ index: 1, code: 'unsupported-type' })
    expect(JSON.stringify(result)).not.toContain(validPath)
    expect(await readFile(join(userDataPath, 'audio/assets/sound-1.wav'))).toEqual(Buffer.from('RIFFxxxxWAVEpayload'))
    expect(await service.resolveAssetPath('sound-1')).toContain('audio/assets/sound-1.wav')
    expect(await service.resolveAssetPath('../sound-1')).toBeNull()
  })

  it('validates source ownership, requests enabled playback, and falls back after failure', async () => {
    const { userDataPath, service, onPlaybackRequested } = await harness()
    const validPath = join(userDataPath, 'tone.ogg')
    await writeFile(validPath, Buffer.from('OggSpayload'))
    await service.importAssets([validPath])
    await service.updateSources({ reminderSource: { kind: 'imported', assetId: 'sound-1' }, cryingSource: { kind: 'builtin', id: 'soft-whimper' } })
    expect(await service.requestPlayback('reminder', false)).toBeNull()
    const request = await service.requestPlayback('reminder', true)
    expect(request?.source).toEqual({ kind: 'imported', assetId: 'sound-1' })
    await service.reportPlaybackFailure(request!.requestId, 'sound-1')
    const fallback = await service.requestPlayback('reminder', true)
    expect(fallback?.source).toEqual({ kind: 'builtin', id: 'gentle-chime' })
    expect(onPlaybackRequested).toHaveBeenCalledTimes(2)
    await expect(service.updateSources({ reminderSource: { kind: 'imported', assetId: 'missing' }, cryingSource: { kind: 'builtin', id: 'soft-whimper' } })).rejects.toThrow('Stale imported')
  })
})
