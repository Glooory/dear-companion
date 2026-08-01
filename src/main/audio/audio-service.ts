import { randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  createRestSystemSnapshot,
  isSafeIdentifier,
  parseAudioSourceInput,
  type AppSettings,
  type AudioAsset,
  type AudioImportFailure,
  type AudioImportResult,
  type AudioPlaybackRequest,
  type AudioSource,
  type RestRuntimeSnapshot,
  type RestSystemSnapshot
} from '../../shared/contracts'
import type { SettingsStore } from '../settings/settings-store'
import { AudioInputError, detectAudioFormat, validateAudioFileSize } from './audio-input'

type AudioSettingsStore = Pick<SettingsStore, 'load' | 'update'>

export interface AudioServiceOptions {
  userDataPath: string
  settingsStore: AudioSettingsStore
  onPlaybackRequested(request: AudioPlaybackRequest): void
  getRuntimeSnapshot?: () => RestRuntimeSnapshot
  idFactory?: () => string
}

export class AudioService {
  private mutationQueue: Promise<void> = Promise.resolve()
  private readonly pendingRequests = new Map<string, string | null>()
  private readonly idFactory: () => string

  constructor(private readonly options: AudioServiceOptions) {
    this.idFactory = options.idFactory ?? randomUUID
  }

  importAssets(sourcePaths: readonly string[]): Promise<AudioImportResult> {
    return this.enqueue(() => this.importAssetsExclusive(sourcePaths))
  }

  updateSources(inputValue: unknown): Promise<RestSystemSnapshot> {
    return this.enqueue(async () => {
      const current = await this.options.settingsStore.load()
      const input = parseAudioSourceInput(inputValue, current.audio.assets.map((asset) => asset.id))
      const settings = await this.options.settingsStore.update((latest) => {
        const validated = parseAudioSourceInput(input, latest.audio.assets.map((asset) => asset.id))
        return { ...latest, audio: { ...latest.audio, ...validated } }
      })
      return createRestSystemSnapshot(settings, this.runtime())
    })
  }

  async resolveAssetPath(assetIdValue: unknown): Promise<string | null> {
    if (!isSafeIdentifier(assetIdValue)) return null
    const settings = await this.options.settingsStore.load()
    const asset = settings.audio.assets.find((candidate) => candidate.id === assetIdValue)
    if (!asset) return null
    const root = resolve(this.options.userDataPath, 'audio', 'assets')
    const candidate = resolve(root, asset.fileName)
    if (!isPathInside(root, candidate)) return null
    try {
      const [canonicalRoot, canonicalCandidate, candidateStat] = await Promise.all([
        realpath(root), realpath(candidate), stat(candidate)
      ])
      return candidateStat.isFile() && isPathInside(canonicalRoot, canonicalCandidate)
        ? canonicalCandidate : null
    } catch {
      return null
    }
  }

  async requestPlayback(cue: 'reminder' | 'crying', enabled: boolean): Promise<AudioPlaybackRequest | null> {
    if (!enabled) return null
    const settings = await this.options.settingsStore.load()
    const configured = cue === 'reminder' ? settings.audio.reminderSource : settings.audio.cryingSource
    const source = resolveAvailableSource(configured, settings, cue)
    const request: AudioPlaybackRequest = {
      requestId: this.createUniqueId(new Set(this.pendingRequests.keys())),
      cue,
      source,
      maxDurationMs: 30_000
    }
    this.pendingRequests.set(request.requestId, source.kind === 'imported' ? source.assetId : null)
    this.options.onPlaybackRequested(request)
    return request
  }

  async reportPlaybackFailure(requestId: string, assetId: string | null): Promise<void> {
    if (!isSafeIdentifier(requestId)) return
    const expected = this.pendingRequests.get(requestId)
    this.pendingRequests.delete(requestId)
    if (expected === undefined || expected === null || expected !== assetId) return
    await this.enqueue(async () => {
      await this.options.settingsStore.update((current) => ({
        ...current,
        audio: {
          ...current.audio,
          assets: current.audio.assets.map((asset) => asset.id === expected ? { ...asset, available: false } : asset)
        }
      }))
    })
  }

  private async importAssetsExclusive(sourcePaths: readonly string[]): Promise<AudioImportResult> {
    const current = await this.options.settingsStore.load()
    const usedIds = new Set(current.audio.assets.map((asset) => asset.id))
    const imported: AudioAsset[] = []
    const failures: AudioImportFailure[] = []
    const writtenPaths: string[] = []
    const directory = join(this.options.userDataPath, 'audio', 'assets')

    for (const [index, sourcePath] of sourcePaths.entries()) {
      try {
        const bytes = await readAudioFile(sourcePath)
        const format = detectAudioFormat(bytes)
        if (!format) throw new AudioInputError('unsupported-type', '只支持 MP3、WAV 或 OGG 音频')
        const id = this.createUniqueId(usedIds)
        usedIds.add(id)
        const fileName = `${id}.${format}`
        const destination = join(directory, fileName)
        await mkdir(directory, { recursive: true, mode: 0o700 })
        try {
          await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
        } catch {
          throw new AudioInputError('copy-failed', '无法保存音频副本')
        }
        writtenPaths.push(destination)
        imported.push({ id, fileName, format, byteSize: bytes.byteLength, available: true })
      } catch (error) {
        failures.push(toFailure(index, error))
      }
    }

    if (imported.length > 0) {
      try {
        await this.options.settingsStore.update((latest) => ({
          ...latest,
          audio: { ...latest.audio, assets: [...latest.audio.assets, ...imported] }
        }))
      } catch {
        await Promise.all(writtenPaths.map((path) => rm(path, { force: true }).catch(() => undefined)))
        throw new Error('Imported audio could not be saved')
      }
    }
    return { imported: imported.map((asset) => ({ ...asset })), failures }
  }

  private createUniqueId(usedIds: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const id = this.idFactory().toLowerCase()
      if (isSafeIdentifier(id) && !usedIds.has(id)) return id
    }
    throw new Error('Could not generate a safe unique identifier')
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation)
    this.mutationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  private runtime(): RestRuntimeSnapshot {
    return this.options.getRuntimeSnapshot?.() ?? { serviceStatus: 'healthy', prompt: null, session: null }
  }
}

async function readAudioFile(sourcePath: string): Promise<Buffer> {
  let file
  try {
    file = await open(sourcePath, 'r')
    const fileStat = await file.stat()
    if (!fileStat.isFile()) throw new AudioInputError('read-failed', '无法读取所选音频')
    validateAudioFileSize(fileStat.size)
    const bytes = await file.readFile()
    validateAudioFileSize(bytes.byteLength)
    return bytes
  } catch (error) {
    if (error instanceof AudioInputError) throw error
    throw new AudioInputError('read-failed', '无法读取所选音频')
  } finally {
    await file?.close().catch(() => undefined)
  }
}

function resolveAvailableSource(source: AudioSource, settings: AppSettings, cue: 'reminder' | 'crying'): AudioSource {
  if (source.kind === 'builtin') return { ...source }
  const asset = settings.audio.assets.find((candidate) => candidate.id === source.assetId)
  return asset?.available
    ? { ...source }
    : { kind: 'builtin', id: cue === 'reminder' ? 'gentle-chime' : 'soft-whimper' }
}

function toFailure(index: number, error: unknown): AudioImportFailure {
  if (error instanceof AudioInputError) return { index, code: error.code, message: error.message }
  return { index, code: 'read-failed', message: '无法读取所选音频' }
}

function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate)
  return pathFromRoot === '' || (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
}
