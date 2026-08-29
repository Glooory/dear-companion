import { useCallback, useEffect, useRef, type PointerEvent } from 'react'
import { BodyWaddleGesture, type HorizontalDirection } from '@shared/body-waddle-gesture'
import { PET_WINDOW_HEIGHT, PET_WINDOW_WIDTH, type PetAsset } from '@shared/contracts'
import { computeHeadHotspotGeometry } from '@shared/head-hotspot'
import { computeAssetGeometry } from '@shared/image-normalization'

export function useBodyWaddleGesture({
  asset,
  targetHeight,
  active,
  dependencyKey,
  onDirection
}: {
  asset: PetAsset | null
  targetHeight: number
  active: boolean
  dependencyKey: string
  onDirection(direction: Exclude<HorizontalDirection, 0>): void
}): (event: PointerEvent<HTMLElement>, pettingCandidateActive: boolean) => void {
  const gesture = useRef(new BodyWaddleGesture())

  useEffect(() => {
    gesture.current.reset()
  }, [active, dependencyKey])

  return useCallback((event: PointerEvent<HTMLElement>, pettingCandidateActive: boolean): void => {
    if (!active || !asset) return
    const geometry = computeAssetGeometry(asset, targetHeight, { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT })
    const headEllipse = computeHeadHotspotGeometry(asset, targetHeight, { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT })
    const direction = gesture.current.register({
      x: event.clientX,
      y: event.clientY,
      at: event.timeStamp
    }, {
      visibleRect: {
        x: geometry.left + asset.alphaBounds.x * geometry.scale,
        y: geometry.top + asset.alphaBounds.y * geometry.scale,
        width: asset.alphaBounds.width * geometry.scale,
        height: asset.alphaBounds.height * geometry.scale
      },
      headEllipse
    }, pettingCandidateActive)
    if (direction !== 0) onDirection(direction)
  }, [active, asset, onDirection, targetHeight])
}
