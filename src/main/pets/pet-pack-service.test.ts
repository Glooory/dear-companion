import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ACTION_TEMPLATES,
  DEFAULT_PET_LIFE_STATES,
  EMPTY_ACTION_SLOTS,
  type PetUpdateInput,
} from "../../shared/contracts";
import type { ImageDecoder } from "../images/image-decoder";
import { ImageInputError } from "../images/image-input";
import { SettingsStore } from "../settings/settings-store";
import { PetPackService } from "./pet-pack-service";

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const wavBytes = Buffer.from("RIFFxxxxWAVEfmt ");
const temporaryDirectories: string[] = [];

async function createHarness(decoder: ImageDecoder = validDecoder()) {
  const userDataPath = await mkdtemp(join(tmpdir(), "dear-companion-pets-"));
  temporaryDirectories.push(userDataPath);
  const ids = ["pet-1", "asset-1", "asset-2", "asset-3"][Symbol.iterator]();
  const settingsStore = new SettingsStore(userDataPath);
  const service = new PetPackService(userDataPath, settingsStore, decoder, () => ids.next().value ?? "fallback-id");
  return { userDataPath, settingsStore, service };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("PetPackService", () => {
  it("creates a safe draft pet with empty optional slots", async () => {
    const { service } = await createHarness();
    const snapshot = await service.createPet("  Mochi  ");

    expect(snapshot.pets).toEqual([
      {
        id: "pet-1",
        name: "Mochi",
        targetHeight: 180,
        assets: [],
        actionSlots: EMPTY_ACTION_SLOTS,
        actionTemplates: DEFAULT_ACTION_TEMPLATES,
        lifeStates: DEFAULT_PET_LIFE_STATES,
        companionPace: "natural",
        interactionBubblesEnabled: true,
        dialogueSettings: { address: "", voiceEnabled: false, voiceVolume: 0.8, categories: {} },
      },
    ]);
    expect(snapshot.activePetId).toBeNull();
  });

  it("imports successful siblings with generated names and reports invalid files without paths", async () => {
    const { userDataPath, service } = await createHarness();
    const goodPath = join(userDataPath, "private family photo.PNG");
    const badPath = join(userDataPath, "looks-like.png");
    await writeFile(goodPath, pngBytes);
    await writeFile(badPath, "not an image");
    await service.createPet("Mochi");

    const result = await service.importAssets("pet-1", [goodPath, badPath]);

    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      id: "asset-1",
      fileName: "asset-1.png",
      format: "png",
      byteSize: pngBytes.length,
      width: 2,
      height: 2,
      alphaBounds: { x: 0, y: 0, width: 2, height: 2 },
      headHotspot: null,
    });
    expect(result.failures).toEqual([
      {
        index: 1,
        code: "unsupported-type",
        message: "只支持透明 PNG 或 WebP 图片",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(goodPath);
    expect(await readFile(join(userDataPath, "pets/pet-1/assets/asset-1.png"))).toEqual(pngBytes);
    expect((await service.getSnapshot()).pets[0]?.actionSlots.idle).toEqual(["asset-1"]);
  });

  it("keeps the existing daily photo when more photos are imported", async () => {
    const { userDataPath, service } = await createHarness();
    const firstPath = join(userDataPath, "first.png");
    const secondPath = join(userDataPath, "second.png");
    await Promise.all([writeFile(firstPath, pngBytes), writeFile(secondPath, pngBytes)]);
    await service.createPet("Mochi");

    await service.importAssets("pet-1", [firstPath]);
    await service.importAssets("pet-1", [secondPath]);

    const pet = (await service.getSnapshot()).pets[0]!;
    expect(pet.assets.map((asset) => asset.id)).toEqual(["asset-1", "asset-2"]);
    expect(pet.actionSlots.idle).toEqual(["asset-1"]);
  });

  it("does not mutate settings when image decoding fails", async () => {
    const decoder: ImageDecoder = {
      decode: async () => {
        throw new ImageInputError("no-transparency", "图片必须包含透明背景");
      },
    };
    const { userDataPath, service } = await createHarness(decoder);
    const sourcePath = join(userDataPath, "opaque.png");
    await writeFile(sourcePath, pngBytes);
    await service.createPet("Mochi");

    await expect(service.importAssets("pet-1", [sourcePath])).resolves.toEqual({
      imported: [],
      failures: [{ index: 0, code: "no-transparency", message: "图片必须包含透明背景" }],
    });
    expect((await service.getSnapshot()).pets[0]?.assets).toEqual([]);
  });

  it("updates only metadata, activates a configured pet, and resolves owned copied assets", async () => {
    const { userDataPath, service } = await createHarness();
    const sourcePath = join(userDataPath, "source.png");
    await writeFile(sourcePath, pngBytes);
    await service.createPet("Mochi");
    const imported = await service.importAssets("pet-1", [sourcePath]);
    const asset = imported.imported[0]!;
    const update: PetUpdateInput = {
      id: "pet-1",
      name: "Mochi II",
      targetHeight: 200,
      assets: [
        {
          id: asset.id,
          normalization: { scale: 1.2, offsetX: 4, offsetY: -3, baselineOffset: 2 },
          headHotspot: { centerX: 0.5, centerY: 0.2, radiusX: 0.18, radiusY: 0.18 },
        },
      ],
      actionSlots: { ...EMPTY_ACTION_SLOTS, idle: [asset.id] },
      actionTemplates: { ...DEFAULT_ACTION_TEMPLATES, angryDurationMs: 2_000 },
      lifeStates: {
        drowsy: { enabled: false, assetIds: [] },
        sleeping: { enabled: false, assetIds: [] },
        workingAssetIds: [],
      },
      companionPace: "lively",
      interactionBubblesEnabled: false,
      dialogueSettings: { address: "小葡萄", voiceEnabled: false, voiceVolume: 0.8, categories: {} },
    };

    const updated = await service.updatePet(update);
    const active = await service.setActivePet("pet-1");
    const copiedPath = await service.resolveAssetPath("pet-1", asset.id);

    expect(updated.pets[0]).toMatchObject({ name: "Mochi II", targetHeight: 200 });
    expect(active.activePetId).toBe("pet-1");
    expect(copiedPath).toContain("pets/pet-1/assets/asset-1.png");
    expect(await readFile(sourcePath)).toEqual(pngBytes);
    expect(await readFile(copiedPath!)).toEqual(pngBytes);
    expect(await service.resolveAssetPath("pet-1", "asset-2")).toBeNull();
  });

  it("refuses to activate a draft pet without idle", async () => {
    const { service } = await createHarness();
    await service.createPet("Mochi");
    await expect(service.setActivePet("pet-1")).rejects.toThrow("at least one idle asset");
  });

  it("deletes an active pet and its copied assets without affecting other pets", async () => {
    const { userDataPath, service } = await createHarness();
    const first = await service.createPet("Mochi");
    const second = await service.createPet("Yuki");
    const firstPetId = first.pets[0]!.id;
    const secondPetId = second.pets.find((pet) => pet.id !== firstPetId)!.id;
    const sourcePath = join(userDataPath, "source.png");
    await writeFile(sourcePath, pngBytes);
    const imported = await service.importAssets(firstPetId, [sourcePath]);
    const asset = imported.imported[0]!;
    await service.updatePet({
      id: firstPetId,
      name: "Mochi",
      targetHeight: 180,
      assets: [{ id: asset.id, normalization: { ...asset.normalization }, headHotspot: null }],
      actionSlots: { ...EMPTY_ACTION_SLOTS, idle: [asset.id] },
      actionTemplates: { ...DEFAULT_ACTION_TEMPLATES },
      lifeStates: {
        drowsy: { enabled: false, assetIds: [] },
        sleeping: { enabled: false, assetIds: [] },
        workingAssetIds: [],
      },
      companionPace: "natural",
      interactionBubblesEnabled: true,
      dialogueSettings: { address: "", categories: {} },
    });
    await service.setActivePet(firstPetId);

    const deleted = await service.deletePet(firstPetId);

    expect(deleted.activePetId).toBeNull();
    expect(deleted.pets.map((pet) => pet.id)).toEqual([secondPetId]);
    await expect(readFile(join(userDataPath, "pets", firstPetId, "assets", asset.fileName))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("deletes a single asset from a pet and removes it from slots and file system", async () => {
    const { service, userDataPath } = await createHarness();
    await service.createPet("豆豆");

    const sourcePath1 = join(userDataPath, "photo-1.png");
    const sourcePath2 = join(userDataPath, "photo-2.png");
    await writeFile(sourcePath1, pngBytes);
    await writeFile(sourcePath2, pngBytes);
    const { imported } = await service.importAssets("pet-1", [sourcePath1, sourcePath2]);

    const snapshotAfterImport = await service.getSnapshot();
    expect(snapshotAfterImport.pets[0]!.assets).toHaveLength(2);

    const assetToDelete = imported[0]!;
    const remainingAsset = imported[1]!;

    const snapshotAfterDelete = await service.deleteAsset("pet-1", assetToDelete.id);
    const pet = snapshotAfterDelete.pets[0]!;

    expect(pet.assets.map((a) => a.id)).toEqual([remainingAsset.id]);
    expect(pet.actionSlots.idle).not.toContain(assetToDelete.id);
    expect(pet.actionSlots.idle).toEqual([remainingAsset.id]);
    await expect(readFile(join(userDataPath, "pets", "pet-1", "assets", assetToDelete.fileName))).rejects.toMatchObject(
      { code: "ENOENT" }
    );
  });

  it("rejects deleting the last asset of an active pet", async () => {
    const { service, userDataPath } = await createHarness();
    await service.createPet("豆豆");

    const sourcePath = join(userDataPath, "photo.png");
    await writeFile(sourcePath, pngBytes);
    const { imported } = await service.importAssets("pet-1", [sourcePath]);
    await service.setActivePet("pet-1");

    await expect(service.deleteAsset("pet-1", imported[0]!.id)).rejects.toThrow("使用中的伙伴需至少保留一张照片");
  });

  it("updates dialogue settings for pet A without affecting pet B", async () => {
    const { userDataPath, service } = await createHarness();
    const first = await service.createPet("豆包");
    const second = await service.createPet("年糕");
    const firstPetId = first.pets[0]!.id;
    const secondPetId = second.pets.find((pet) => pet.id !== firstPetId)!.id;

    const sourcePath = join(userDataPath, "source.png");
    await writeFile(sourcePath, pngBytes);
    const imported = await service.importAssets(firstPetId, [sourcePath]);
    const asset = imported.imported[0]!;

    await service.updatePet({
      id: firstPetId,
      name: "豆包",
      targetHeight: 180,
      assets: [{ id: asset.id, normalization: { ...asset.normalization }, headHotspot: null }],
      actionSlots: { ...EMPTY_ACTION_SLOTS, idle: [asset.id] },
      actionTemplates: { ...DEFAULT_ACTION_TEMPLATES },
      lifeStates: {
        drowsy: { enabled: false, assetIds: [] },
        sleeping: { enabled: false, assetIds: [] },
        workingAssetIds: [],
      },
      companionPace: "natural",
      interactionBubblesEnabled: true,
      dialogueSettings: {
        address: "小葡萄",
        categories: {
          "daily:click": {
            builtInOverrides: [{ lineId: "daily-click-here", text: "豆包在呢" }],
            customLines: [{ id: "custom-1", automaticEnabled: true, text: "专属句子" }],
          },
        },
      },
    });

    const snapshot = await service.getSnapshot();
    const petA = snapshot.pets.find((p) => p.id === firstPetId)!;
    const petB = snapshot.pets.find((p) => p.id === secondPetId)!;

    expect(petA.dialogueSettings.address).toBe("小葡萄");
    expect(petA.dialogueSettings.categories["daily:click"]?.builtInOverrides[0]?.text).toBe("豆包在呢");
    expect(petA.dialogueSettings.categories["daily:click"]?.customLines[0]?.text).toBe("专属句子");

    expect(petB.dialogueSettings.address).toBe("");
    expect(petB.dialogueSettings.categories).toEqual({});
  });

  it("saves, resolves, and deletes voice assets for a pet", async () => {
    const { service } = await createHarness();
    const created = await service.createPet("Mochi");
    const petId = created.pets[0]!.id;

    const { voiceId } = await service.saveVoiceAsset(petId, wavBytes, "wav");
    expect(voiceId).toBeDefined();

    const resolved = await service.resolveVoiceAssetPath(petId, voiceId);
    expect(resolved).not.toBeNull();
    expect(resolved).toContain(`${voiceId}.wav`);

    await service.deleteVoiceAsset(petId, voiceId);
    const afterDelete = await service.resolveVoiceAssetPath(petId, voiceId);
    expect(afterDelete).toBeNull();
  });

  it("rejects renamed or mismatched voice content", async () => {
    const { service } = await createHarness();
    await service.createPet("Mochi");

    await expect(service.saveVoiceAsset("pet-1", Buffer.from("not audio"), "wav")).rejects.toThrow("无法识别");
    await expect(service.saveVoiceAsset("pet-1", wavBytes, "mp3")).rejects.toThrow("扩展名");
  });

  it("keeps referenced voices and removes draft voices after cleanup", async () => {
    const { service, userDataPath } = await createHarness();
    await service.createPet("Mochi");
    const referenced = await service.saveVoiceAsset("pet-1", wavBytes, "wav");
    const draft = await service.saveVoiceAsset("pet-1", wavBytes, "wav");
    const sourcePath = join(userDataPath, "source.png");
    await writeFile(sourcePath, pngBytes);
    const asset = (await service.importAssets("pet-1", [sourcePath])).imported[0]!;

    await service.updatePet({
      id: "pet-1",
      name: "Mochi",
      targetHeight: 180,
      assets: [{ id: asset.id, normalization: asset.normalization, headHotspot: null }],
      actionSlots: { ...EMPTY_ACTION_SLOTS, idle: [asset.id] },
      actionTemplates: DEFAULT_ACTION_TEMPLATES,
      lifeStates: DEFAULT_PET_LIFE_STATES,
      companionPace: "natural",
      interactionBubblesEnabled: true,
      dialogueSettings: {
        address: "",
        voiceEnabled: true,
        voiceVolume: 0.8,
        categories: {
          "daily:click": {
            builtInOverrides: [{ lineId: "daily-click-here", voiceAssetId: referenced.voiceId }],
            customLines: [],
          },
        },
      },
    });
    await service.cleanupUnreferencedVoiceAssets("pet-1");

    expect(await service.resolveVoiceAssetPath("pet-1", referenced.voiceId)).not.toBeNull();
    expect(await service.resolveVoiceAssetPath("pet-1", draft.voiceId)).toBeNull();
  });

  it("rejects missing voice references without changing persisted settings", async () => {
    const { service, userDataPath } = await createHarness();
    await service.createPet("Mochi");
    const sourcePath = join(userDataPath, "source.png");
    await writeFile(sourcePath, pngBytes);
    const asset = (await service.importAssets("pet-1", [sourcePath])).imported[0]!;
    const update: PetUpdateInput = {
      id: "pet-1",
      name: "Mochi",
      targetHeight: 180,
      assets: [{ id: asset.id, normalization: asset.normalization, headHotspot: null }],
      actionSlots: { ...EMPTY_ACTION_SLOTS, idle: [asset.id] },
      actionTemplates: DEFAULT_ACTION_TEMPLATES,
      lifeStates: DEFAULT_PET_LIFE_STATES,
      companionPace: "natural",
      interactionBubblesEnabled: true,
      dialogueSettings: {
        address: "",
        voiceEnabled: true,
        voiceVolume: 0.8,
        categories: {
          "daily:click": {
            builtInOverrides: [{ lineId: "daily-click-here", voiceAssetId: "missing-voice" }],
            customLines: [],
          },
        },
      },
    };

    await expect(service.updatePet(update)).rejects.toThrow("声音不可用");
    expect((await service.getSnapshot()).pets[0]?.dialogueSettings.categories).toEqual({});
  });

  it("removes the complete pet directory including voices", async () => {
    const { service, userDataPath } = await createHarness();
    await service.createPet("Mochi");
    await service.saveVoiceAsset("pet-1", wavBytes, "wav");

    await service.deletePet("pet-1");

    await expect(stat(join(userDataPath, "pets", "pet-1"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function validDecoder(): ImageDecoder {
  return {
    decode: async () => ({
      width: 2,
      height: 2,
      alphaBounds: { x: 0, y: 0, width: 2, height: 2 },
    }),
  };
}
