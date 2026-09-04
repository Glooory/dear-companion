import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  createPetSystemSnapshot,
  DEFAULT_ACTION_TEMPLATES,
  DEFAULT_ASSET_NORMALIZATION,
  DEFAULT_PET_LIFE_STATES,
  EMPTY_ACTION_SLOTS,
  isSafeIdentifier,
  parsePetIdentifier,
  parsePetName,
  parsePetUpdateInput,
  type AppSettings,
  type ImageImportFailure,
  type ImageImportResult,
  type PetAsset,
  type PetConfig,
  type PetSystemSnapshot,
} from "../../shared/contracts";
import { clonePetDialogueSettings, EMPTY_PET_DIALOGUE_SETTINGS } from "../../shared/dialogue-settings";
import {
  detectVoiceAudioFormat,
  validateVoiceAudioFileSize,
  VoiceAudioInputError,
  type VoiceAudioFormat,
} from "../audio/voice-audio-input";
import type { ImageDecoder } from "../images/image-decoder";
import { detectImageFormat, ImageInputError, validateImageFileSize, validatePetPackSize } from "../images/image-input";
import type { SettingsStore } from "../settings/settings-store";

type PetSettingsStore = Pick<SettingsStore, "load" | "update">;

const ALLOWED_VOICE_EXTENSIONS = new Set<VoiceAudioFormat>(["webm", "ogg", "wav", "mp3", "m4a"]);
const DELETING_DIRECTORY_PATTERN = /^\.deleting-[a-z0-9][a-z0-9-]{0,63}-[a-z0-9-]+$/;

export class PetPackService {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly userDataPath: string,
    private readonly settingsStore: PetSettingsStore,
    private readonly imageDecoder: ImageDecoder,
    private readonly idFactory: () => string = randomUUID
  ) {}

  async getSnapshot(): Promise<PetSystemSnapshot> {
    return createPetSystemSnapshot(await this.settingsStore.load());
  }

  createPet(nameValue: unknown): Promise<PetSystemSnapshot> {
    const name = parsePetName(nameValue);
    return this.enqueue(async () => {
      const settings = await this.settingsStore.update((current) => {
        const id = this.createUniqueId(new Set(current.pets.map((pet) => pet.id)));
        const pet: PetConfig = {
          id,
          name,
          targetHeight: 180,
          assets: [],
          actionSlots: cloneEmptySlots(),
          actionTemplates: { ...DEFAULT_ACTION_TEMPLATES },
          lifeStates: cloneLifeStates(DEFAULT_PET_LIFE_STATES),
          companionPace: "natural",
          interactionBubblesEnabled: true,
          dialogueSettings: clonePetDialogueSettings(EMPTY_PET_DIALOGUE_SETTINGS),
        };
        return { ...current, pets: [...current.pets, pet] };
      });
      return createPetSystemSnapshot(settings);
    });
  }

  deletePet(petIdValue: unknown): Promise<PetSystemSnapshot> {
    const petId = parsePetIdentifier(petIdValue);
    return this.enqueue(async () => {
      const current = await this.settingsStore.load();
      requirePet(current, petId);
      const petsRoot = resolve(this.userDataPath, "pets");
      const petDirectory = resolve(petsRoot, petId);
      const stagedDirectory = resolve(petsRoot, `.deleting-${petId}-${randomUUID()}`);
      let staged = false;

      try {
        await mkdir(petsRoot, { recursive: true, mode: 0o700 });
        await rename(petDirectory, stagedDirectory);
        staged = true;
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw new Error("Pet assets could not be prepared for deletion", { cause: error });
        }
      }

      let settings: AppSettings;
      try {
        settings = await this.settingsStore.update((latest) => {
          requirePet(latest, petId);
          return {
            ...latest,
            activePetId: latest.activePetId === petId ? null : latest.activePetId,
            pets: latest.pets.filter((pet) => pet.id !== petId),
          };
        });
      } catch {
        if (staged) {
          await rename(stagedDirectory, petDirectory).catch(() => undefined);
        }
        throw new Error("Pet could not be deleted");
      }

      if (staged) {
        await rm(stagedDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      return createPetSystemSnapshot(settings);
    });
  }

  importAssets(petIdValue: unknown, sourcePaths: readonly string[]): Promise<ImageImportResult> {
    const petId = parsePetIdentifier(petIdValue);
    return this.enqueue(() => this.importAssetsExclusive(petId, sourcePaths));
  }

  deleteAsset(petIdValue: unknown, assetIdValue: unknown): Promise<PetSystemSnapshot> {
    const petId = parsePetIdentifier(petIdValue);
    const assetId = parsePetIdentifier(assetIdValue);
    return this.enqueue(async () => {
      const current = await this.settingsStore.load();
      const existing = requirePet(current, petId);
      const targetAsset = existing.assets.find((asset) => asset.id === assetId);
      if (!targetAsset) {
        throw new Error(`Asset ${assetId} does not exist on pet ${petId}`);
      }

      if (current.activePetId === petId && existing.assets.length <= 1) {
        throw new Error("使用中的伙伴需至少保留一张照片");
      }

      const assetPath = join(this.userDataPath, "pets", petId, "assets", targetAsset.fileName);
      await rm(assetPath, { force: true }).catch(() => undefined);

      const settings = await this.settingsStore.update((latest) => {
        const pet = requirePet(latest, petId);
        const updatedAssets = pet.assets.filter((asset) => asset.id !== assetId);
        const remainingIdle = pet.actionSlots.idle.filter((id) => id !== assetId);
        const updatedIdle =
          remainingIdle.length === 0 && updatedAssets.length > 0 ? [updatedAssets[0]!.id] : remainingIdle;
        const updatedResting = pet.actionSlots.resting.filter((id) => id !== assetId);

        const updatedDrowsyAssets = pet.lifeStates.drowsy.assetIds.filter((id) => id !== assetId);
        const updatedSleepingAssets = pet.lifeStates.sleeping.assetIds.filter((id) => id !== assetId);
        const updatedWorkingAssets = pet.lifeStates.workingAssetIds.filter((id) => id !== assetId);

        const updatedPet: PetConfig = {
          ...pet,
          assets: updatedAssets,
          actionSlots: {
            idle: updatedIdle,
            resting: updatedResting,
          },
          lifeStates: {
            drowsy: {
              enabled: updatedDrowsyAssets.length > 0 && pet.lifeStates.drowsy.enabled,
              assetIds: updatedDrowsyAssets,
            },
            sleeping: {
              enabled: updatedSleepingAssets.length > 0 && pet.lifeStates.sleeping.enabled,
              assetIds: updatedSleepingAssets,
            },
            workingAssetIds: updatedWorkingAssets,
          },
          dialogueSettings: clonePetDialogueSettings(pet.dialogueSettings),
        };

        return {
          ...latest,
          pets: latest.pets.map((candidate) => (candidate.id === petId ? updatedPet : candidate)),
        };
      });

      return createPetSystemSnapshot(settings);
    });
  }

  updatePet(inputValue: unknown): Promise<PetSystemSnapshot> {
    return this.enqueue(async () => {
      const current = await this.settingsStore.load();
      const requestedId = isRecordWithId(inputValue)
        ? parsePetIdentifier(inputValue.id)
        : parsePetIdentifier(undefined);
      const existing = requirePet(current, requestedId);
      const input = parsePetUpdateInput(
        inputValue,
        existing.assets.map((asset) => asset.id)
      );
      const voiceIds = collectVoiceAssetIds(input.dialogueSettings);
      for (const voiceId of voiceIds) {
        if (!(await this.resolveOwnedVoiceFilePath(input.id, voiceId))) {
          throw new Error("对白声音不可用，请更换或删除后再保存");
        }
      }
      const settings = await this.settingsStore.update((latest) => {
        const pet = requirePet(latest, input.id);
        const latestAssetIds = pet.assets.map((asset) => asset.id);
        const validated = parsePetUpdateInput(input, latestAssetIds);
        const adjustments = new Map(validated.assets.map((asset) => [asset.id, asset]));
        const updatedPet: PetConfig = {
          ...pet,
          name: validated.name,
          targetHeight: validated.targetHeight,
          assets: pet.assets.map((asset) => ({
            ...asset,
            normalization: { ...adjustments.get(asset.id)!.normalization },
            headHotspot: adjustments.get(asset.id)!.headHotspot ? { ...adjustments.get(asset.id)!.headHotspot! } : null,
          })),
          actionSlots: cloneSlots(validated.actionSlots),
          actionTemplates: { ...validated.actionTemplates },
          lifeStates: cloneLifeStates(validated.lifeStates),
          companionPace: validated.companionPace,
          interactionBubblesEnabled: validated.interactionBubblesEnabled,
          dialogueSettings: clonePetDialogueSettings(validated.dialogueSettings),
        };
        return { ...latest, pets: latest.pets.map((candidate) => (candidate.id === pet.id ? updatedPet : candidate)) };
      });
      await this.cleanupUnreferencedVoiceAssetsExclusive(input.id, settings);
      return createPetSystemSnapshot(settings);
    });
  }

  setActivePet(petIdValue: unknown): Promise<PetSystemSnapshot> {
    const petId = parsePetIdentifier(petIdValue);
    return this.enqueue(async () => {
      const settings = await this.settingsStore.update((current) => {
        const pet = requirePet(current, petId);
        if (pet.actionSlots.idle.length === 0) {
          throw new Error("Active pet requires at least one idle asset");
        }
        return { ...current, activePetId: petId };
      });
      return createPetSystemSnapshot(settings);
    });
  }

  async resolveAssetPath(petIdValue: unknown, assetIdValue: unknown): Promise<string | null> {
    const petId = parsePetIdentifier(petIdValue);
    const assetId = parsePetIdentifier(assetIdValue);
    const pet = (await this.settingsStore.load()).pets.find((candidate) => candidate.id === petId);
    const asset = pet?.assets.find((candidate) => candidate.id === assetId);
    if (!pet || !asset) return null;

    const assetRoot = resolve(this.userDataPath, "pets", pet.id, "assets");
    const candidate = resolve(assetRoot, asset.fileName);
    if (!isPathInside(assetRoot, candidate)) return null;

    try {
      const [canonicalRoot, canonicalCandidate, candidateStat] = await Promise.all([
        realpath(assetRoot),
        realpath(candidate),
        stat(candidate),
      ]);
      return candidateStat.isFile() && isPathInside(canonicalRoot, canonicalCandidate) ? canonicalCandidate : null;
    } catch {
      return null;
    }
  }

  async resolveVoiceAssetPath(petIdValue: unknown, voiceIdValue: unknown): Promise<string | null> {
    const petId = parsePetIdentifier(petIdValue);
    const voiceId = parsePetIdentifier(voiceIdValue);
    const pet = (await this.settingsStore.load()).pets.find((candidate) => candidate.id === petId);
    if (!pet) return null;

    return this.resolveOwnedVoiceFilePath(pet.id, voiceId);
  }

  async getVoiceAssetAvailability(
    petIdValue: unknown,
    voiceIdValues: readonly unknown[]
  ): Promise<Record<string, boolean>> {
    const petId = parsePetIdentifier(petIdValue);
    const voiceIds = voiceIdValues.map(parsePetIdentifier);
    const current = await this.settingsStore.load();
    requirePet(current, petId);
    const result: Record<string, boolean> = {};
    for (const voiceId of voiceIds) {
      result[voiceId] = Boolean(await this.resolveOwnedVoiceFilePath(petId, voiceId));
    }
    return result;
  }

  async saveVoiceAsset(petIdValue: unknown, buffer: Buffer, extensionValue: string): Promise<{ voiceId: string }> {
    const petId = parsePetIdentifier(petIdValue);
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
      const current = await this.settingsStore.load();
      requirePet(current, petId);

      const voiceId = await this.createUniqueVoiceId(petId);
      const fileName = `${voiceId}.${ext}`;
      const voicesDir = join(this.userDataPath, "pets", petId, "voices");
      await mkdir(voicesDir, { recursive: true, mode: 0o700 });
      const dest = join(voicesDir, fileName);
      await writeFile(dest, buffer, { flag: "wx", mode: 0o600 });
      return { voiceId };
    });
  }

  async importVoiceAsset(petIdValue: unknown, sourcePath: string): Promise<{ voiceId: string }> {
    const petId = parsePetIdentifier(petIdValue);
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

    return this.enqueue(async () => {
      const current = await this.settingsStore.load();
      requirePet(current, petId);

      const voiceId = await this.createUniqueVoiceId(petId);
      const fileName = `${voiceId}.${ext}`;
      const voicesDir = join(this.userDataPath, "pets", petId, "voices");
      await mkdir(voicesDir, { recursive: true, mode: 0o700 });
      const dest = join(voicesDir, fileName);
      await writeFile(dest, bytes, { flag: "wx", mode: 0o600 });
      return { voiceId };
    });
  }

  async deleteVoiceAsset(petIdValue: unknown, voiceIdValue: unknown): Promise<void> {
    const petId = parsePetIdentifier(petIdValue);
    const voiceId = parsePetIdentifier(voiceIdValue);

    return this.enqueue(async () => {
      const current = await this.settingsStore.load();
      requirePet(current, petId);

      const voicesDir = join(this.userDataPath, "pets", petId, "voices");
      for (const ext of ALLOWED_VOICE_EXTENSIONS) {
        const target = join(voicesDir, `${voiceId}.${ext}`);
        await rm(target, { force: true }).catch(() => undefined);
      }
    });
  }

  cleanupUnreferencedVoiceAssets(petIdValue?: unknown): Promise<void> {
    const petId = petIdValue === undefined ? undefined : parsePetIdentifier(petIdValue);
    return this.enqueue(async () => {
      const settings = await this.settingsStore.load();
      if (petId) requirePet(settings, petId);
      const targets = petId ? [petId] : settings.pets.map((pet) => pet.id);
      for (const targetPetId of targets) {
        await this.cleanupUnreferencedVoiceAssetsExclusive(targetPetId, settings);
      }
    });
  }

  async cleanupOrphanedPetDirectories(): Promise<void> {
    const petsRoot = resolve(this.userDataPath, "pets");
    const entries = await readdir(petsRoot, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && DELETING_DIRECTORY_PATTERN.test(entry.name))
        .map((entry) => rm(resolve(petsRoot, entry.name), { recursive: true, force: true }).catch(() => undefined))
    );
  }

  private async cleanupUnreferencedVoiceAssetsExclusive(petId: string, settings: AppSettings): Promise<void> {
    const pet = settings.pets.find((candidate) => candidate.id === petId);
    if (!pet) return;
    const referenced = collectVoiceAssetIds(pet.dialogueSettings);
    const voicesDir = resolve(this.userDataPath, "pets", petId, "voices");
    const entries = await readdir(voicesDir, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries.map(async (entry) => {
        const match = /^([a-z0-9][a-z0-9-]{0,63})\.(mp3|wav|ogg|webm|m4a)$/.exec(entry.name);
        if (entry.isFile() && match && referenced.has(match[1]!)) return;
        await rm(resolve(voicesDir, entry.name), { recursive: entry.isDirectory(), force: true }).catch(
          () => undefined
        );
      })
    );
  }

  private async resolveOwnedVoiceFilePath(petId: string, voiceId: string): Promise<string | null> {
    const voicesRoot = resolve(this.userDataPath, "pets", petId, "voices");
    for (const ext of ALLOWED_VOICE_EXTENSIONS) {
      const candidate = resolve(voicesRoot, `${voiceId}.${ext}`);
      if (!isPathInside(voicesRoot, candidate)) continue;
      try {
        const [canonicalRoot, canonicalCandidate, candidateStat] = await Promise.all([
          realpath(voicesRoot),
          realpath(candidate),
          stat(candidate),
        ]);
        if (candidateStat.isFile() && isPathInside(canonicalRoot, canonicalCandidate)) return canonicalCandidate;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async createUniqueVoiceId(petId: string): Promise<string> {
    const voicesDir = resolve(this.userDataPath, "pets", petId, "voices");
    const entries = await readdir(voicesDir).catch(() => []);
    const usedIds = new Set(entries.map((entry) => entry.split(".", 1)[0]!).filter(isSafeIdentifier));
    return this.createUniqueId(usedIds);
  }

  private async importAssetsExclusive(petId: string, sourcePaths: readonly string[]): Promise<ImageImportResult> {
    const initialSettings = await this.settingsStore.load();
    const pet = requirePet(initialSettings, petId);
    let currentBytes = sumAssetBytes(pet.assets);
    const usedIds = new Set(initialSettings.pets.flatMap((candidate) => candidate.assets.map((asset) => asset.id)));
    const imported: PetAsset[] = [];
    const failures: ImageImportFailure[] = [];
    const writtenPaths: string[] = [];
    const assetDirectory = join(this.userDataPath, "pets", pet.id, "assets");

    for (const [index, sourcePath] of sourcePaths.entries()) {
      try {
        const bytes = await readSourceFile(sourcePath);
        const format = detectImageFormat(bytes);
        if (!format) throw new ImageInputError("unsupported-type", "只支持透明 PNG 或 WebP 图片");
        validatePetPackSize(currentBytes, bytes.byteLength);
        const decoded = await this.imageDecoder.decode(bytes, format);

        const id = this.createUniqueId(usedIds);
        usedIds.add(id);
        const fileName = `${id}.${format}`;
        const destination = join(assetDirectory, fileName);
        await mkdir(assetDirectory, { recursive: true, mode: 0o700 });
        try {
          await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
        } catch {
          throw new ImageInputError("copy-failed", "无法保存图片副本");
        }

        writtenPaths.push(destination);
        imported.push({
          id,
          fileName,
          format,
          byteSize: bytes.byteLength,
          width: decoded.width,
          height: decoded.height,
          alphaBounds: decoded.alphaBounds,
          normalization: { ...DEFAULT_ASSET_NORMALIZATION },
          headHotspot: null,
        });
        currentBytes += bytes.byteLength;
      } catch (error) {
        failures.push(toImportFailure(index, error));
      }
    }

    if (imported.length === 0) return { imported, failures };

    try {
      await this.settingsStore.update((current) => {
        const latestPet = requirePet(current, petId);
        validatePetPackSize(sumAssetBytes(latestPet.assets), sumAssetBytes(imported));
        const actionSlots =
          latestPet.actionSlots.idle.length === 0
            ? { ...cloneSlots(latestPet.actionSlots), idle: [imported[0]!.id] }
            : cloneSlots(latestPet.actionSlots);
        const updatedPet = { ...latestPet, assets: [...latestPet.assets, ...imported], actionSlots };
        return {
          ...current,
          pets: current.pets.map((candidate) => (candidate.id === petId ? updatedPet : candidate)),
        };
      });
    } catch {
      await Promise.all(writtenPaths.map((path) => rm(path, { force: true }).catch(() => undefined)));
      throw new Error("Imported assets could not be saved");
    }

    return { imported, failures };
  }

  private createUniqueId(usedIds: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const id = this.idFactory().toLowerCase();
      if (isSafeIdentifier(id) && !usedIds.has(id)) return id;
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
}

async function readSourceFile(sourcePath: string): Promise<Buffer> {
  let file;
  try {
    file = await open(sourcePath, "r");
    const fileStat = await file.stat();
    if (!fileStat.isFile()) throw new ImageInputError("read-failed", "无法读取所选图片");
    validateImageFileSize(fileStat.size);
    const bytes = await file.readFile();
    validateImageFileSize(bytes.byteLength);
    return bytes;
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("read-failed", "无法读取所选图片");
  } finally {
    await file?.close().catch(() => undefined);
  }
}

async function readVoiceSourceFile(sourcePath: string): Promise<Buffer> {
  let file;
  try {
    file = await open(sourcePath, "r");
    const fileStat = await file.stat();
    if (!fileStat.isFile()) throw new VoiceAudioInputError("read-failed", "无法读取所选音频");
    validateVoiceAudioFileSize(fileStat.size);
    const bytes = await file.readFile();
    validateVoiceAudioFileSize(bytes.byteLength);
    return bytes;
  } catch (error) {
    if (error instanceof VoiceAudioInputError) throw error;
    throw new VoiceAudioInputError("read-failed", "无法读取所选音频");
  } finally {
    await file?.close().catch(() => undefined);
  }
}

function collectVoiceAssetIds(settings: PetConfig["dialogueSettings"]): Set<string> {
  const ids = new Set<string>();
  for (const category of Object.values(settings.categories)) {
    if (!category) continue;
    for (const override of category.builtInOverrides) {
      if (override.voiceAssetId) ids.add(override.voiceAssetId);
    }
    for (const line of category.customLines) {
      if (line.voiceAssetId) ids.add(line.voiceAssetId);
    }
  }
  return ids;
}

function requirePet(settings: AppSettings, petId: string): PetConfig {
  const pet = settings.pets.find((candidate) => candidate.id === petId);
  if (!pet) throw new Error("Pet does not exist");
  return pet;
}

function sumAssetBytes(assets: readonly Pick<PetAsset, "byteSize">[]): number {
  return assets.reduce((total, asset) => total + asset.byteSize, 0);
}

function cloneEmptySlots(): PetConfig["actionSlots"] {
  return cloneSlots(EMPTY_ACTION_SLOTS);
}

function cloneSlots(slots: PetConfig["actionSlots"]): PetConfig["actionSlots"] {
  return {
    idle: [...slots.idle],
    resting: [...slots.resting],
  };
}

function cloneLifeStates(lifeStates: PetConfig["lifeStates"]): PetConfig["lifeStates"] {
  return {
    drowsy: { enabled: lifeStates.drowsy.enabled, assetIds: [...lifeStates.drowsy.assetIds] },
    sleeping: { enabled: lifeStates.sleeping.enabled, assetIds: [...lifeStates.sleeping.assetIds] },
    workingAssetIds: [...lifeStates.workingAssetIds],
  };
}

function toImportFailure(index: number, error: unknown): ImageImportFailure {
  if (error instanceof ImageInputError) {
    return { index, code: error.code, message: error.message };
  }
  return { index, code: "decode-failed", message: "图片无法解码" };
}

function isPathInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
}

function isRecordWithId(value: unknown): value is { id: unknown } {
  return typeof value === "object" && value !== null && "id" in value;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
