import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_ACTION_TEMPLATES,
  DEFAULT_PET_LIFE_STATES,
  EMPTY_ACTION_SLOTS,
  type PetUpdateInput
} from '../../shared/contracts'
import type { ImageDecoder } from '../images/image-decoder'
import { ImageInputError } from '../images/image-input'
import { SettingsStore } from '../settings/settings-store'
import { PetPackService } from './pet-pack-service'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const temporaryDirectories: string[] = []

async function createHarness(decoder: ImageDecoder = validDecoder()) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'dear-companion-pets-'))
  temporaryDirectories.push(userDataPath)
  const ids = ['pet-1', 'asset-1', 'asset-2', 'asset-3'][Symbol.iterator]()
  const settingsStore = new SettingsStore(userDataPath)
  const service = new PetPackService(userDataPath, settingsStore, decoder, () => ids.next().value ?? 'fallback-id')
  return { userDataPath, settingsStore, service }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('PetPackService', () => {
  it('creates a safe draft pet with empty optional slots', async () => {
    const { service } = await createHarness()
    const snapshot = await service.createPet('  Mochi  ')

    expect(snapshot.pets).toEqual([{
      id: 'pet-1',
      name: 'Mochi',
      targetHeight: 180,
      assets: [],
      actionSlots: EMPTY_ACTION_SLOTS,
      actionTemplates: DEFAULT_ACTION_TEMPLATES,
      lifeStates: DEFAULT_PET_LIFE_STATES,
      companionPace: 'natural',
      interactionBubblesEnabled: true
    }])
    expect(snapshot.activePetId).toBeNull()
  })

  it('imports successful siblings with generated names and reports invalid files without paths', async () => {
    const { userDataPath, service } = await createHarness()
    const goodPath = join(userDataPath, 'private family photo.PNG')
    const badPath = join(userDataPath, 'looks-like.png')
    await writeFile(goodPath, pngBytes)
    await writeFile(badPath, 'not an image')
    await service.createPet('Mochi')

    const result = await service.importAssets('pet-1', [goodPath, badPath])

    expect(result.imported).toHaveLength(1)
    expect(result.imported[0]).toMatchObject({
      id: 'asset-1',
      fileName: 'asset-1.png',
      format: 'png',
      byteSize: pngBytes.length,
      width: 2,
      height: 2,
      alphaBounds: { x: 0, y: 0, width: 2, height: 2 },
      headHotspot: null
    })
    expect(result.failures).toEqual([{
      index: 1,
      code: 'unsupported-type',
      message: '只支持透明 PNG 或 WebP 图片'
    }])
    expect(JSON.stringify(result)).not.toContain(goodPath)
    expect(await readFile(join(userDataPath, 'pets/pet-1/assets/asset-1.png'))).toEqual(pngBytes)
  })

  it('does not mutate settings when image decoding fails', async () => {
    const decoder: ImageDecoder = {
      decode: async () => { throw new ImageInputError('no-transparency', '图片必须包含透明背景') }
    }
    const { userDataPath, service } = await createHarness(decoder)
    const sourcePath = join(userDataPath, 'opaque.png')
    await writeFile(sourcePath, pngBytes)
    await service.createPet('Mochi')

    await expect(service.importAssets('pet-1', [sourcePath])).resolves.toEqual({
      imported: [],
      failures: [{ index: 0, code: 'no-transparency', message: '图片必须包含透明背景' }]
    })
    expect((await service.getSnapshot()).pets[0]?.assets).toEqual([])
  })

  it('updates only metadata, activates a configured pet, and resolves owned copied assets', async () => {
    const { userDataPath, service } = await createHarness()
    const sourcePath = join(userDataPath, 'source.png')
    await writeFile(sourcePath, pngBytes)
    await service.createPet('Mochi')
    const imported = await service.importAssets('pet-1', [sourcePath])
    const asset = imported.imported[0]!
    const update: PetUpdateInput = {
      id: 'pet-1',
      name: 'Mochi II',
      targetHeight: 200,
      assets: [{ id: asset.id, normalization: { scale: 1.2, offsetX: 4, offsetY: -3, baselineOffset: 2 }, headHotspot: { centerX: 0.5, centerY: 0.2, radiusX: 0.18, radiusY: 0.18 } }],
      actionSlots: { ...EMPTY_ACTION_SLOTS, idle: [asset.id] },
      actionTemplates: { ...DEFAULT_ACTION_TEMPLATES, angryDurationMs: 2_000 },
      lifeStates: { drowsy: { enabled: false, assetIds: [] }, sleeping: { enabled: false, assetIds: [] }, workingAssetIds: [] },
      companionPace: 'lively',
      interactionBubblesEnabled: false
    }

    const updated = await service.updatePet(update)
    const active = await service.setActivePet('pet-1')
    const copiedPath = await service.resolveAssetPath('pet-1', asset.id)

    expect(updated.pets[0]).toMatchObject({ name: 'Mochi II', targetHeight: 200 })
    expect(active.activePetId).toBe('pet-1')
    expect(copiedPath).toContain('pets/pet-1/assets/asset-1.png')
    expect(await readFile(sourcePath)).toEqual(pngBytes)
    expect(await readFile(copiedPath!)).toEqual(pngBytes)
    expect(await service.resolveAssetPath('pet-1', 'asset-2')).toBeNull()
  })

  it('refuses to activate a draft pet without idle', async () => {
    const { service } = await createHarness()
    await service.createPet('Mochi')
    await expect(service.setActivePet('pet-1')).rejects.toThrow('at least one idle asset')
  })

  it('deletes an active pet and its copied assets without affecting other pets', async () => {
    const { userDataPath, service } = await createHarness()
    const first = await service.createPet('Mochi')
    const second = await service.createPet('Yuki')
    const firstPetId = first.pets[0]!.id
    const secondPetId = second.pets.find((pet) => pet.id !== firstPetId)!.id
    const sourcePath = join(userDataPath, 'source.png')
    await writeFile(sourcePath, pngBytes)
    const imported = await service.importAssets(firstPetId, [sourcePath])
    const asset = imported.imported[0]!
    await service.updatePet({
      id: firstPetId,
      name: 'Mochi',
      targetHeight: 180,
      assets: [{ id: asset.id, normalization: { ...asset.normalization }, headHotspot: null }],
      actionSlots: { ...EMPTY_ACTION_SLOTS, idle: [asset.id] },
      actionTemplates: { ...DEFAULT_ACTION_TEMPLATES },
      lifeStates: { drowsy: { enabled: false, assetIds: [] }, sleeping: { enabled: false, assetIds: [] }, workingAssetIds: [] },
      companionPace: 'natural',
      interactionBubblesEnabled: true
    })
    await service.setActivePet(firstPetId)

    const deleted = await service.deletePet(firstPetId)

    expect(deleted.activePetId).toBeNull()
    expect(deleted.pets.map((pet) => pet.id)).toEqual([secondPetId])
    await expect(readFile(join(userDataPath, 'pets', firstPetId, 'assets', asset.fileName)))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })
})

function validDecoder(): ImageDecoder {
  return {
    decode: async () => ({
      width: 2,
      height: 2,
      alphaBounds: { x: 0, y: 0, width: 2, height: 2 }
    })
  }
}
