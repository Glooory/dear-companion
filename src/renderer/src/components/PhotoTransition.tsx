import { useEffect, useMemo, useRef, useState } from 'react'
import type { PetAsset } from '@shared/contracts'
import { computeAssetGeometry } from '@shared/image-normalization'

export type PhotoVeil = 'bubbles' | 'stars' | 'clouds'

export function PhotoTransition({ petId, asset, targetHeight, veil }: {
  petId: string
  asset: PetAsset
  targetHeight: number
  veil: PhotoVeil
}): React.JSX.Element {
  const [current, setCurrent] = useState(asset)
  const [phase, setPhase] = useState<'idle' | 'covering' | 'revealing'>('idle')
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const desiredUrl = useMemo(() => petAssetUrl(petId, asset.id), [asset.id, petId])

  useEffect(() => {
    if (asset.id === current.id) return
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      setPhase('covering')
      timers.current.push(
        setTimeout(() => {
          if (!cancelled) {
            setCurrent(asset)
            setPhase('revealing')
          }
        }, 220),
        setTimeout(() => { if (!cancelled) setPhase('idle') }, 500)
      )
    }
    image.onerror = () => {
      // Preserve the last successfully loaded photo.
    }
    image.src = desiredUrl
    return () => {
      cancelled = true
      timers.current.forEach(clearTimeout)
      timers.current = []
      image.onload = null
      image.onerror = null
    }
  }, [asset, current.id, desiredUrl])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const geometry = computeAssetGeometry(current, targetHeight, { width: 320, height: 320 })
  return (
    <>
      <span
        className={`pet-image-frame ${phase === 'covering' ? 'photo-outgoing' : 'photo-incoming'}`}
        style={{ left: geometry.left, top: geometry.top, width: geometry.renderedWidth, height: geometry.renderedHeight }}
      >
        <img className="pet-image" draggable={false} src={petAssetUrl(petId, current.id)} alt="" />
      </span>
      {phase !== 'idle' && <span className={`photo-veil veil-${veil}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>}
    </>
  )
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
