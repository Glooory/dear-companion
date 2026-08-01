import type { AlphaBounds } from './contracts'

export interface AlphaAnalysis {
  bounds: AlphaBounds
  hasTransparency: boolean
}

export function analyzeAlphaChannel(
  pixels: Uint8Array,
  width: number,
  height: number,
  stride = 4,
  alphaOffset = 3
): AlphaAnalysis {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError('Image dimensions must be positive integers')
  }
  if (!Number.isInteger(stride) || stride < 1 || !Number.isInteger(alphaOffset) || alphaOffset < 0 || alphaOffset >= stride) {
    throw new RangeError('Invalid pixel layout')
  }
  if (pixels.byteLength !== width * height * stride) {
    throw new RangeError('Pixel buffer length does not match image dimensions')
  }

  let minimumX = width
  let minimumY = height
  let maximumX = -1
  let maximumY = -1
  let hasTransparency = false

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * stride + alphaOffset]!
      if (alpha < 255) hasTransparency = true
      if (alpha === 0) continue
      minimumX = Math.min(minimumX, x)
      minimumY = Math.min(minimumY, y)
      maximumX = Math.max(maximumX, x)
      maximumY = Math.max(maximumY, y)
    }
  }

  if (maximumX < minimumX || maximumY < minimumY) {
    throw new Error('Image is fully transparent')
  }

  return {
    bounds: {
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1
    },
    hasTransparency
  }
}

export function computeAlphaBounds(
  pixels: Uint8Array,
  width: number,
  height: number,
  stride = 4,
  alphaOffset = 3
): AlphaBounds {
  return analyzeAlphaChannel(pixels, width, height, stride, alphaOffset).bounds
}
