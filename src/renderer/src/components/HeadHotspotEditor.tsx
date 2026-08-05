import { useRef } from 'react'
import type { AssetNormalization, HeadHotspot, PetAsset } from '@shared/contracts'
import { clampHeadHotspot, defaultHeadHotspot } from '@shared/head-hotspot'
import { computeAssetGeometry } from '@shared/image-normalization'

type DragKind = 'center' | 'left' | 'right' | 'top' | 'bottom'

export function HeadHotspotEditor({ asset, targetHeight, normalization, value, onChange }: {
  asset: PetAsset
  targetHeight: number
  normalization: AssetNormalization
  value: HeadHotspot | null
  onChange(value: HeadHotspot | null): void
}): React.JSX.Element {
  const drag = useRef<{ kind: DragKind; x: number; y: number; start: HeadHotspot } | null>(null)
  const geometry = computeAssetGeometry({ ...asset, normalization }, targetHeight, { width: 220, height: 260, baselineY: 242 })
  const visibleWidth = asset.alphaBounds.width * geometry.scale
  const visibleHeight = asset.alphaBounds.height * geometry.scale
  const visibleLeft = geometry.left + asset.alphaBounds.x * geometry.scale
  const visibleTop = geometry.top + asset.alphaBounds.y * geometry.scale

  if (!value) {
    return <button type="button" className="hotspot-enable" onClick={() => onChange(defaultHeadHotspot(asset.alphaBounds))}>设置头部区域</button>
  }

  const begin = (event: React.PointerEvent<HTMLElement>, kind: DragKind): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { kind, x: event.clientX, y: event.clientY, start: { ...value } }
  }
  const move = (event: React.PointerEvent<HTMLElement>): void => {
    const current = drag.current
    if (!current) return
    const dx = (event.clientX - current.x) / visibleWidth
    const dy = (event.clientY - current.y) / visibleHeight
    const next = { ...current.start }
    if (current.kind === 'center') { next.centerX += dx; next.centerY += dy }
    if (current.kind === 'left' || current.kind === 'right') next.radiusX += (current.kind === 'right' ? dx : -dx)
    if (current.kind === 'top' || current.kind === 'bottom') next.radiusY += (current.kind === 'bottom' ? dy : -dy)
    onChange(clampHeadHotspot(next))
  }

  return (
    <>
      <div
        className="head-hotspot"
        style={{
          left: visibleLeft + (value.centerX - value.radiusX) * visibleWidth,
          top: visibleTop + (value.centerY - value.radiusY) * visibleHeight,
          width: value.radiusX * 2 * visibleWidth,
          height: value.radiusY * 2 * visibleHeight
        }}
        onPointerDown={(event) => begin(event, 'center')}
        onPointerMove={move}
        onPointerUp={() => { drag.current = null }}
      >
        {(['left', 'right', 'top', 'bottom'] as const).map((kind) => (
          <span key={kind} className={`hotspot-handle ${kind}`} onPointerDown={(event) => {
            event.stopPropagation()
            begin(event, kind)
          }} />
        ))}
      </div>
      <button type="button" className="hotspot-disable" onClick={() => onChange(null)}>关闭摸头区域</button>
    </>
  )
}
