import type { AssetNormalization, HeadHotspot, PetAsset } from '@shared/contracts'
import { computeAssetGeometry } from '@shared/image-normalization'
import { HeadHotspotEditor } from './HeadHotspotEditor'

interface PetAssetEditorProps {
  petId: string
  asset: PetAsset
  targetHeight: number
  normalization: AssetNormalization
  headHotspot: HeadHotspot | null
  onChange(normalization: AssetNormalization): void
  onHeadHotspotChange(headHotspot: HeadHotspot | null): void
}

export function PetAssetEditor({
  petId,
  asset,
  targetHeight,
  normalization,
  headHotspot,
  onChange,
  onHeadHotspotChange
}: PetAssetEditorProps): React.JSX.Element {
  const geometry = computeAssetGeometry({ ...asset, normalization }, targetHeight, {
    width: 220,
    height: 260,
    baselineY: 242
  })

  const update = (key: keyof AssetNormalization, value: number): void => {
    if (!Number.isFinite(value)) return
    const [minimum, maximum] = NORMALIZATION_RANGES[key]
    onChange({ ...normalization, [key]: clamp(value, minimum, maximum) })
  }

  const handleBaselinePointerDown = (event: React.PointerEvent<HTMLSpanElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startY = event.clientY
    const startOffset = normalization.baselineOffset

    const onPointerMove = (moveEvent: PointerEvent): void => {
      const deltaY = moveEvent.clientY - startY
      update('baselineOffset', Math.round(startOffset + deltaY))
    }

    const onPointerUp = (): void => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  return (
    <article className="asset-editor">
      <div className="asset-preview" aria-label="照片调整预览">
        <span
          className="asset-baseline"
          role="slider"
          aria-label="脚底对齐基准线"
          aria-valuenow={normalization.baselineOffset}
          title="按住上下拖拽调整脚底对齐"
          onPointerDown={handleBaselinePointerDown}
        />
        <img
          src={petAssetUrl(petId, asset.id)}
          alt=""
          draggable={false}
          style={{
            left: geometry.left,
            top: geometry.top,
            width: geometry.renderedWidth,
            height: geometry.renderedHeight
          }}
        />
        <HeadHotspotEditor
          asset={asset}
          targetHeight={targetHeight}
          normalization={normalization}
          value={headHotspot}
          onChange={onHeadHotspotChange}
        />
      </div>
      <div className="asset-editor-details">
        <h3>照片 {asset.id.slice(0, 8)}</h3>
        <p className="asset-metadata">
          {asset.format.toUpperCase()} · 原图 {asset.width}×{asset.height} px · 有效人物区域 {asset.alphaBounds.width}×{asset.alphaBounds.height} px
        </p>
        <div className="normalization-grid">
          <div className="slider-field">
            <div className="editor-heading-row" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#55514b' }}>缩放比例</span>
              <button
                type="button"
                className="secondary-button"
                style={{ padding: '2px 7px', fontSize: '0.75rem' }}
                onClick={() => update('scale', 1.0)}
              >
                重置 1.0×
              </button>
            </div>
            <div className="slider-row">
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.05}
                value={normalization.scale}
                onChange={(event) => update('scale', Number(event.currentTarget.value))}
              />
              <span className="slider-value">{normalization.scale.toFixed(2)}×</span>
            </div>
          </div>

          <NumberControl label="水平对齐 (X)" value={normalization.offsetX} min={-512} max={512} step={1} onChange={(val) => update('offsetX', val)} />
          <NumberControl label="垂直对齐 (Y)" value={normalization.offsetY} min={-512} max={512} step={1} onChange={(val) => update('offsetY', val)} />
          <NumberControl label="脚底基线高度" value={normalization.baselineOffset} min={-256} max={256} step={1} onChange={(val) => update('baselineOffset', val)} />
        </div>
      </div>
    </article>
  )
}

const NORMALIZATION_RANGES: Record<keyof AssetNormalization, readonly [number, number]> = {
  scale: [0.25, 4],
  offsetX: [-512, 512],
  offsetY: [-512, 512],
  baselineOffset: [-256, 256]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange(value: number): void
}): React.JSX.Element {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value)
          if (Number.isFinite(parsed)) onChange(parsed)
        }}
      />
    </label>
  )
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
