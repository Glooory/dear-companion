import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PET_WINDOW_HEIGHT, PET_WINDOW_WIDTH, type PetAsset } from '@shared/contracts'
import { computeAssetGeometry } from '@shared/image-normalization'

export function PhotoTransition({ petId, asset, fallbackAsset, targetHeight, onTransitionComplete }: {
  petId: string
  asset: PetAsset
  fallbackAsset: PetAsset
  targetHeight: number
  onTransitionComplete?: (assetId: string) => void
}): React.JSX.Element {
  const [current, setCurrent] = useState(asset)
  const currentRef = useRef(asset)
  const [outgoing, setOutgoing] = useState<PetAsset | null>(null)
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
      setOutgoing(null)
      completionRef.current?.(asset.id)
      return
    }

    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      const previous = currentRef.current
      setOutgoing(previous)
      currentRef.current = asset
      setCurrent(asset)
      timers.current.push(setTimeout(() => {
        if (cancelled) return
        setOutgoing(null)
        completionRef.current?.(asset.id)
      }, 400))
    }
    image.onerror = () => {
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
    setOutgoing(null)
  }

  const currentGeometry = computeAssetGeometry(current, targetHeight, { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT })
  const outgoingGeometry = outgoing
    ? computeAssetGeometry(outgoing, targetHeight, { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT })
    : null

  return (
    <>
      {outgoing && outgoingGeometry && (
        <span
          className="pet-image-frame photo-cross-outgoing"
          style={{
            left: outgoingGeometry.left,
            top: outgoingGeometry.top,
            width: outgoingGeometry.renderedWidth,
            height: outgoingGeometry.renderedHeight,
            zIndex: 1
          }}
          aria-hidden="true"
        >
          <img
            className="pet-image"
            draggable={false}
            src={petAssetUrl(petId, outgoing.id)}
            alt=""
          />
        </span>
      )}
      <span
        className={`pet-image-frame ${outgoing ? 'photo-cross-incoming' : 'photo-idle'}`}
        style={{
          left: currentGeometry.left,
          top: currentGeometry.top,
          width: currentGeometry.renderedWidth,
          height: currentGeometry.renderedHeight,
          zIndex: 2
        }}
      >
        <img
          className="pet-image"
          draggable={false}
          src={petAssetUrl(petId, current.id)}
          alt=""
          onError={handleCurrentLoadFailure}
        />
      </span>
    </>
  )
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
