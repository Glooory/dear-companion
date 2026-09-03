import { MAX_PET_TARGET_HEIGHT, MIN_PET_TARGET_HEIGHT, type PetAsset } from "./contracts";

export interface AssetViewport {
  width: number;
  height: number;
  baselineY?: number;
}

export interface AssetRenderGeometry {
  scale: number;
  left: number;
  top: number;
  renderedWidth: number;
  renderedHeight: number;
  visibleHeight: number;
}

export function computeAssetGeometry(
  asset: Pick<PetAsset, "width" | "height" | "alphaBounds" | "normalization">,
  targetHeight: number,
  viewport: AssetViewport
): AssetRenderGeometry {
  if (!Number.isFinite(targetHeight) || targetHeight < MIN_PET_TARGET_HEIGHT || targetHeight > MAX_PET_TARGET_HEIGHT) {
    throw new RangeError(`Target height must be between ${MIN_PET_TARGET_HEIGHT} and ${MAX_PET_TARGET_HEIGHT}`);
  }
  if (
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0 ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0
  ) {
    throw new RangeError("Viewport dimensions must be positive");
  }
  if (asset.width < 1 || asset.height < 1 || asset.alphaBounds.height < 1 || asset.alphaBounds.width < 1) {
    throw new RangeError("Asset dimensions must be positive");
  }

  const scale = (targetHeight / asset.alphaBounds.height) * asset.normalization.scale;
  const visibleCenterX = asset.alphaBounds.x + asset.alphaBounds.width / 2;
  const visibleBottomY = asset.alphaBounds.y + asset.alphaBounds.height;
  const baselineY = viewport.baselineY ?? viewport.height - 12;

  return {
    scale,
    left: viewport.width / 2 - visibleCenterX * scale + asset.normalization.offsetX,
    top: baselineY + asset.normalization.baselineOffset + asset.normalization.offsetY - visibleBottomY * scale,
    renderedWidth: asset.width * scale,
    renderedHeight: asset.height * scale,
    visibleHeight: asset.alphaBounds.height * scale,
  };
}
