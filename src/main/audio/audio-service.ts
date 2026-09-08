import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  createRestSystemSnapshot,
  isSafeIdentifier,
  parseAudioSourceInput,
  type AppSettings,
  type AudioAsset,
  type AudioImportFailure,
  type AudioImportResult,
  type AudioPlaybackRequest,
  type AudioPlaybackSource,
  type AudioSource,
  type RestRuntimeSnapshot,
  type RestSystemSnapshot,
} from "../../shared/contracts";
import type { SettingsStore } from "../settings/settings-store";
import { AudioInputError, detectAudioFormat, validateAudioFileSize } from "./audio-input";
import {
  ALLOWED_VOICE_EXTENSIONS,
  detectVoiceAudioFormat,
  readVoiceSourceFile,
  validateVoiceAudioFileSize,
  type VoiceAudioFormat,
} from "./voice-audio-input";

type AudioSettingsStore = Pick<SettingsStore, "load" | "update">;

export interface AudioServiceOptions {
  userDataPath: string;
  settingsStore: AudioSettingsStore;
  onPlaybackRequested(request: AudioPlaybackRequest): void;
  getRuntimeSnapshot?: () => RestRuntimeSnapshot;
  idFactory?: () => string;
}

export class AudioService {
  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly pendingRequests = new Map<string, string | null>();
  private readonly unusableReminderVoices = new Set<string>();
  private readonly idFactory: () => string;

  constructor(private readonly options: AudioServiceOptions) {
    this.idFactory = options.idFactory ?? randomUUID;
  }

  importAssets(sourcePaths: readonly string[]): Promise<AudioImportResult> {
    return this.enqueue(() => this.importAssetsExclusive(sourcePaths));
  }

  updateSources(inputValue: unknown): Promise<RestSystemSnapshot> {
    return this.enqueue(async () => {
      const current = await this.options.settingsStore.load();
      const input = parseAudioSourceInput(
        inputValue,
        current.audio.assets.map((asset) => asset.id)
      );
      const settings = await this.options.settingsStore.update((latest) => {
        const validated = parseAudioSourceInput(
          input,
          latest.audio.assets.map((asset) => asset.id)
        );
        return { ...latest, audio: { ...latest.audio, ...validated } };
      });
      return createRestSystemSnapshot(settings, this.runtime());
    });
  }

  async resolveAssetPath(assetIdValue: unknown): Promise<string | null> {
    if (!isSafeIdentifier(assetIdValue)) return null;
    const settings = await this.options.settingsStore.load();
    const asset = settings.audio.assets.find((candidate) => candidate.id === assetIdValue);
    if (!asset) return null;
    const root = resolve(this.options.userDataPath, "audio", "assets");
    const candidate = resolve(root, asset.fileName);
    if (!isPathInside(root, candidate)) return null;
    try {
      const [canonicalRoot, canonicalCandidate, candidateStat] = await Promise.all([
        realpath(root),
        realpath(candidate),
        stat(candidate),
      ]);
      return candidateStat.isFile() && isPathInside(canonicalRoot, canonicalCandidate) ? canonicalCandidate : null;
    } catch {
      return null;
    }
  }

  async resolveReminderVoicePath(voiceIdValue: unknown): Promise<string | null> {
    if (!isSafeIdentifier(voiceIdValue)) return null;
    const root = resolve(this.options.userDataPath, "audio", "reminder-voices");
    for (const ext of ALLOWED_VOICE_EXTENSIONS) {
      const candidate = resolve(root, `${voiceIdValue}.${ext}`);
      if (!isPathInside(root, candidate)) continue;
      try {
        const [canonicalRoot, canonicalCandidate, candidateStat] = await Promise.all([
          realpath(root),
          realpath(candidate),
          stat(candidate),
        ]);
        if (candidateStat.isFile() && isPathInside(canonicalRoot, canonicalCandidate)) {
          return canonicalCandidate;
        }
      } catch {
        // file does not exist with this ext, continue checking next
      }
    }
    return null;
  }

  async saveReminderVoice(buffer: Buffer, extensionValue: string): Promise<{ voiceId: string }> {
    const ext = extensionValue.toLowerCase().replace(/^\./, "") as VoiceAudioFormat;
    if (!ALLOWED_VOICE_EXTENSIONS.has(ext)) {
      throw new Error("只支持 webm、ogg、wav、mp3 或 m4a 音频格式");
    }
    validateVoiceAudioFileSize(buffer.byteLength);
    const detected = detectVoiceAudioFormat(buffer);
    if (!detected) {
      throw new Error("无法识别音频内容");
    }
    if (detected !== ext) {
      throw new Error("音频内容与扩展名不匹配");
    }

    return this.enqueue(async () => {
      const voiceId = this.createUniqueVoiceId();
      this.unusableReminderVoices.delete(voiceId);
      const fileName = `${voiceId}.${ext}`;
      const voicesDir = join(this.options.userDataPath, "audio", "reminder-voices");
      await mkdir(voicesDir, { recursive: true, mode: 0o700 });
      const dest = join(voicesDir, fileName);
      await writeFile(dest, buffer, { flag: "wx", mode: 0o600 });
      return { voiceId };
    });
  }

  async readReminderVoiceSource(sourcePath: string): Promise<{ buffer: Buffer; ext: VoiceAudioFormat }> {
    const ext = extname(sourcePath).toLowerCase().replace(/^\./, "") as VoiceAudioFormat;
    if (!ALLOWED_VOICE_EXTENSIONS.has(ext)) {
      throw new Error("只支持 webm、ogg、wav、mp3 或 m4a 音频格式");
    }
    const bytes = await readVoiceSourceFile(sourcePath);
    const detected = detectVoiceAudioFormat(bytes);
    if (!detected) {
      throw new Error("无法识别音频内容");
    }
    if (detected !== ext) {
      throw new Error("音频内容与扩展名不匹配");
    }
    return { buffer: bytes, ext: detected };
  }

  async readReminderVoice(voiceIdValue: unknown): Promise<{ data: Uint8Array; ext: string } | null> {
    if (!isSafeIdentifier(voiceIdValue)) return null;
    const path = await this.resolveReminderVoicePath(voiceIdValue);
    if (!path) return null;
    const ext = extname(path).replace(/^\./, "");
    const buffer = await readFile(path);
    return { data: new Uint8Array(buffer), ext };
  }

  async getReminderVoiceAvailability(voiceIds: readonly string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const voiceId of voiceIds) {
      result[voiceId] = Boolean(await this.resolveReminderVoicePath(voiceId));
    }
    return result;
  }

  async cleanupUnreferencedReminderVoices(): Promise<void> {
    return this.enqueue(async () => {
      const settings = await this.options.settingsStore.load();
      const referenced = new Set<string>();
      for (const reminder of settings.reminders) {
        if (reminder.voiceAssetId) referenced.add(reminder.voiceAssetId);
      }
      const root = resolve(this.options.userDataPath, "audio", "reminder-voices");
      const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const id = entry.name.replace(/\.[^.]+$/, "");
        if (!referenced.has(id)) {
          await rm(resolve(root, entry.name), { force: true }).catch(() => undefined);
        }
      }
    });
  }

  async requestPlayback(
    cue: "reminder" | "crying",
    enabled: boolean,
    customVoice?: { voiceAssetId: string; voiceTrimStart?: number; voiceTrimEnd?: number }
  ): Promise<AudioPlaybackRequest | null> {
    if (!enabled) return null;
    const settings = await this.options.settingsStore.load();
    let source: AudioPlaybackSource;
    if (cue === "reminder" && customVoice) {
      const voicePath = await this.resolveReminderVoicePath(customVoice.voiceAssetId);
      if (voicePath && !this.unusableReminderVoices.has(customVoice.voiceAssetId)) {
        source = {
          kind: "reminder-voice",
          voiceAssetId: customVoice.voiceAssetId,
          voiceTrimStart: customVoice.voiceTrimStart,
          voiceTrimEnd: customVoice.voiceTrimEnd,
        };
      } else {
        source = resolveAvailableSource(settings.audio.reminderSource, settings, cue);
      }
    } else {
      const configured = cue === "reminder" ? settings.audio.reminderSource : settings.audio.cryingSource;
      source = resolveAvailableSource(configured, settings, cue);
    }
    const request: AudioPlaybackRequest = {
      requestId: this.createUniqueId(new Set(this.pendingRequests.keys())),
      cue,
      source,
      maxDurationMs: 30_000,
    };
    while (this.pendingRequests.size >= 64) {
      const oldestRequestId = this.pendingRequests.keys().next().value;
      if (oldestRequestId === undefined) break;
      this.pendingRequests.delete(oldestRequestId);
    }
    this.pendingRequests.set(
      request.requestId,
      source.kind === "imported" ? source.assetId : source.kind === "reminder-voice" ? source.voiceAssetId : null
    );
    this.options.onPlaybackRequested(request);
    return request;
  }

  async reportPlaybackFailure(requestId: string, assetId: string | null): Promise<boolean> {
    if (!isSafeIdentifier(requestId)) return false;
    const expected = this.pendingRequests.get(requestId);
    this.pendingRequests.delete(requestId);
    if (expected === undefined || expected === null || expected !== assetId) return false;
    if (expected.startsWith("voice-")) {
      this.unusableReminderVoices.add(expected);
      return false;
    }
    return this.enqueue(async () => {
      const settings = await this.options.settingsStore.load();
      if (!settings.audio.assets.some((asset) => asset.id === expected && asset.available)) return false;
      await this.options.settingsStore.update((current) => ({
        ...current,
        audio: {
          ...current.audio,
          assets: current.audio.assets.map((asset) => (asset.id === expected ? { ...asset, available: false } : asset)),
        },
      }));
      return true;
    });
  }

  private async importAssetsExclusive(sourcePaths: readonly string[]): Promise<AudioImportResult> {
    const current = await this.options.settingsStore.load();
    const usedIds = new Set(current.audio.assets.map((asset) => asset.id));
    const imported: AudioAsset[] = [];
    const failures: AudioImportFailure[] = [];
    const writtenPaths: string[] = [];
    const directory = join(this.options.userDataPath, "audio", "assets");

    for (const [index, sourcePath] of sourcePaths.entries()) {
      try {
        const bytes = await readAudioFile(sourcePath);
        const format = detectAudioFormat(bytes);
        if (!format) throw new AudioInputError("unsupported-type", "只支持 MP3、WAV 或 OGG 音频");
        const id = this.createUniqueId(usedIds);
        usedIds.add(id);
        const fileName = `${id}.${format}`;
        const destination = join(directory, fileName);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        try {
          await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
        } catch {
          await rm(destination, { force: true }).catch(() => undefined);
          throw new AudioInputError("copy-failed", "无法保存音频副本");
        }
        writtenPaths.push(destination);
        imported.push({ id, fileName, format, byteSize: bytes.byteLength, available: true });
      } catch (error) {
        failures.push(toFailure(index, error));
      }
    }

    if (imported.length > 0) {
      try {
        await this.options.settingsStore.update((latest) => ({
          ...latest,
          audio: { ...latest.audio, assets: [...latest.audio.assets, ...imported] },
        }));
      } catch {
        await Promise.all(writtenPaths.map((path) => rm(path, { force: true }).catch(() => undefined)));
        throw new Error("Imported audio could not be saved");
      }
    }
    return { imported: imported.map((asset) => ({ ...asset })), failures };
  }

  private createUniqueId(usedIds: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const id = this.idFactory().toLowerCase();
      if (isSafeIdentifier(id) && !usedIds.has(id)) return id;
    }
    throw new Error("Could not generate a safe unique identifier");
  }

  private createUniqueVoiceId(): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const id = `voice-${this.idFactory().toLowerCase()}`;
      if (isSafeIdentifier(id)) return id;
    }
    throw new Error("Could not generate a safe unique identifier");
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private runtime(): RestRuntimeSnapshot {
    return this.options.getRuntimeSnapshot?.() ?? { serviceStatus: "healthy", prompt: null, session: null };
  }
}

async function readAudioFile(sourcePath: string): Promise<Buffer> {
  let file;
  try {
    file = await open(sourcePath, "r");
    const fileStat = await file.stat();
    if (!fileStat.isFile()) throw new AudioInputError("read-failed", "无法读取所选音频");
    validateAudioFileSize(fileStat.size);
    const bytes = await file.readFile();
    validateAudioFileSize(bytes.byteLength);
    return bytes;
  } catch (error) {
    if (error instanceof AudioInputError) throw error;
    throw new AudioInputError("read-failed", "无法读取所选音频");
  } finally {
    await file?.close().catch(() => undefined);
  }
}

function resolveAvailableSource(source: AudioSource, settings: AppSettings, cue: "reminder" | "crying"): AudioSource {
  if (source.kind === "builtin") return { ...source };
  const asset = settings.audio.assets.find((candidate) => candidate.id === source.assetId);
  return asset?.available
    ? { ...source }
    : { kind: "builtin", id: cue === "reminder" ? "gentle-chime" : "soft-whimper" };
}

function toFailure(index: number, error: unknown): AudioImportFailure {
  if (error instanceof AudioInputError) return { index, code: error.code, message: error.message };
  return { index, code: "read-failed", message: "无法读取所选音频" };
}

function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
}
