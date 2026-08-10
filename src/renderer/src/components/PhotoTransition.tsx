import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PetAsset } from '@shared/contracts'
import { computeAssetGeometry } from '@shared/image-normalization'

export type PhotoVeil = 'bubbles' | 'stars' | 'clouds'

export function PhotoTransition({ petId, asset, fallbackAsset, targetHeight, veil, onTransitionComplete }: {
  petId: string
  asset: PetAsset
  fallbackAsset: PetAsset
  targetHeight: number
  veil: PhotoVeil
  onTransitionComplete?: (assetId: string) => void
}): React.JSX.Element {
  const [current, setCurrent] = useState(asset)
  const currentRef = useRef(asset)
  const [phase, setPhase] = useState<'idle' | 'covering' | 'revealing'>('idle')
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const completionRef = useRef(onTransitionComplete)
  const desiredUrl = useMemo(() => petAssetUrl(petId, asset.id), [asset.id, petId])

  const clearTimers = useCallback((): void => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  useEffect(() => {
    currentRef.current = current
  }, [current])

  useEffect(() => {
    completionRef.current = onTransitionComplete
  }, [onTransitionComplete])

  useEffect(() => {
    clearTimers()
    if (asset.id === currentRef.current.id) {
      currentRef.current = asset
      setCurrent(asset)
      setPhase('idle')
      completionRef.current?.(asset.id)
      return
    }

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      setPhase('covering')
      timers.current.push(setTimeout(() => {
        if (cancelled) return
        currentRef.current = asset
        setCurrent(asset)
        setPhase('revealing')
        timers.current.push(setTimeout(() => {
          if (cancelled) return
          setPhase('idle')
          completionRef.current?.(asset.id)
        }, 280))
      }, 220))
    }
    image.onerror = () => {
      // Preserve the last successfully loaded photo.
      if (!cancelled) completionRef.current?.(currentRef.current.id)
    }
    image.src = desiredUrl
    return () => {
      cancelled = true
      clearTimers()
      image.onload = null
      image.onerror = null
    }
  }, [asset, clearTimers, desiredUrl])

  useEffect(() => () => clearTimers(), [clearTimers])

  const handleCurrentLoadFailure = (): void => {
    if (current.id === fallbackAsset.id) return
    clearTimers()
    currentRef.current = fallbackAsset
    setCurrent(fallbackAsset)
    setPhase('idle')
  }

  const geometry = computeAssetGeometry(current, targetHeight, { width: 320, height: 320 })
  return (
    <>
      <span
        className={`pet-image-frame photo-${phase === 'covering' ? 'outgoing' : phase === 'revealing' ? 'incoming' : 'idle'}`}
        style={{ left: geometry.left, top: geometry.top, width: geometry.renderedWidth, height: geometry.renderedHeight }}
      >
        <img
          className="pet-image"
          draggable={false}
          src={petAssetUrl(petId, current.id)}
          alt=""
          onError={handleCurrentLoadFailure}
        />
      </span>
      {phase !== 'idle' && <span className={`photo-veil veil-${veil}`} aria-hidden="true"><i /><i /><i /><i /><i /></span>}
    </>
  )
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
