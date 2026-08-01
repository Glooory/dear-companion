import { analyzeAlphaChannel } from '../../shared/alpha-bounds'
import {
  MAX_PET_PACK_BYTES,
  type AlphaBounds,
  type ImageImportErrorCode,
  type PetAssetFormat
} from '../../shared/contracts'

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 8192
export { MAX_PET_PACK_BYTES }

export interface DecodedImageInput {
  width: number
  height: number
  bitmap: Uint8Array
  stride?: number
  alphaOffset?: number
}

export interface ValidatedDecodedImage {
  width: number
  height: number
  alphaBounds: AlphaBounds
}

export class ImageInputError extends Error {
  constructor(
    readonly code: ImageImportErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ImageInputError'
  }
}

export function detectImageFormat(bytes: Uint8Array): PetAssetFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

export function validateImageFileSize(byteSize: number): void {
  if (!Number.isSafeInteger(byteSize) || byteSize < 1) {
    throw new ImageInputError('empty-file', '图片文件为空')
  }
  if (byteSize > MAX_IMAGE_BYTES) {
    throw new ImageInputError('file-too-large', '单张图片不能超过 20 MB')
  }
}

export function validateDecodedImage(input: DecodedImageInput): ValidatedDecodedImage {
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1) {
    throw new ImageInputError('decode-failed', '图片无法解码')
  }
  if (input.width > MAX_IMAGE_DIMENSION || input.height > MAX_IMAGE_DIMENSION) {
    throw new ImageInputError('dimensions-too-large', '图片宽高不能超过 8192 px')
  }

  let analysis
  try {
    analysis = analyzeAlphaChannel(
      input.bitmap,
      input.width,
      input.height,
      input.stride ?? 4,
      input.alphaOffset ?? 3
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('fully transparent')) {
      throw new ImageInputError('fully-transparent', '图片内容完全透明')
    }
    throw new ImageInputError('decode-failed', '图片解码结果无效')
  }

  if (!analysis.hasTransparency) {
    throw new ImageInputError('no-transparency', '图片必须包含透明背景')
  }
  return { width: input.width, height: input.height, alphaBounds: analysis.bounds }
}

export function validatePetPackSize(currentBytes: number, incomingBytes: number): void {
  if (
    !Number.isSafeInteger(currentBytes) ||
    currentBytes < 0 ||
    !Number.isSafeInteger(incomingBytes) ||
    incomingBytes < 0 ||
    currentBytes + incomingBytes > MAX_PET_PACK_BYTES
  ) {
    throw new ImageInputError('pack-too-large', '单个宠物包不能超过 250 MB')
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end))
}
