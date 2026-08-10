import type { AlphaBounds, HeadHotspot, PetAsset, ScreenEllipse } from './contracts'
import { computeAssetGeometry, type AssetViewport } from './image-normalization'

export function defaultHeadHotspot(alphaBounds: AlphaBounds): HeadHotspot {
  if (alphaBounds.width <= 0 || alphaBounds.height <= 0) {
    throw new RangeError('Alpha bounds must be positive')
  }
  return { centerX: 0.5, centerY: 0.22, radiusX: 0.18, radiusY: 0.18 }
}

export function clampHeadHotspot(hotspot: HeadHotspot): HeadHotspot {
  return {
    centerX: clamp(hotspot.centerX, 0, 1),
    centerY: clamp(hotspot.centerY, 0, 1),
    radiusX: clamp(hotspot.radiusX, 0.03, 0.5),
    radiusY: clamp(hotspot.radiusY, 0.03, 0.5)
  }
}

export function computeHeadHotspotGeometry(
  asset: Pick<PetAsset, 'width' | 'height' | 'alphaBounds' | 'normalization' | 'headHotspot'>,
  targetHeight: number,
  viewport: AssetViewport
): ScreenEllipse | null {
  const geometry = computeAssetGeometry(asset, targetHeight, viewport)
  const hotspot = clampHeadHotspot(asset.headHotspot ?? defaultHeadHotspot(asset.alphaBounds))
  return {
    centerX: geometry.left + (asset.alphaBounds.x + hotspot.centerX * asset.alphaBounds.width) * geometry.scale,
    centerY: geometry.top + (asset.alphaBounds.y + hotspot.centerY * asset.alphaBounds.height) * geometry.scale,
    radiusX: hotspot.radiusX * asset.alphaBounds.width * geometry.scale,
    radiusY: hotspot.radiusY * asset.alphaBounds.height * geometry.scale
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}
