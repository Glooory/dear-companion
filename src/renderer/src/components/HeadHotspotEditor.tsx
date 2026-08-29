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
  const hotspot = value ?? defaultHeadHotspot(asset.alphaBounds)

  const begin = (event: React.PointerEvent<HTMLElement>, kind: DragKind): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { kind, x: event.clientX, y: event.clientY, start: { ...hotspot } }
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
        title="头部热区：桌面光标在此往返晃动将触发摸头互动"
        style={{
          left: visibleLeft + (hotspot.centerX - hotspot.radiusX) * visibleWidth,
          top: visibleTop + (hotspot.centerY - hotspot.radiusY) * visibleHeight,
          width: hotspot.radiusX * 2 * visibleWidth,
          height: hotspot.radiusY * 2 * visibleHeight
        }}
        onPointerDown={(event) => begin(event, 'center')}
        onPointerMove={move}
        onPointerUp={() => { drag.current = null }}
      >
        <span className="hotspot-guide-label">抚摸感应区</span>
        {(['left', 'right', 'top', 'bottom'] as const).map((kind) => (
          <span key={kind} className={`hotspot-handle ${kind}`} onPointerDown={(event) => {
            event.stopPropagation()
            begin(event, kind)
          }} />
        ))}
      </div>
      {value && <button type="button" className="hotspot-disable" onClick={() => onChange(null)}>恢复默认头部区域</button>}
    </>
  )
}
