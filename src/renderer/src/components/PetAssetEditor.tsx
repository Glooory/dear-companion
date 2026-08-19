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

  const update = (key: keyof AssetNormalization, value: string): void => {
    if (value.trim() === '') return
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    const [minimum, maximum] = NORMALIZATION_RANGES[key]
    onChange({ ...normalization, [key]: clamp(parsed, minimum, maximum) })
  }

  return (
    <article className="asset-editor">
      <div className="asset-preview" aria-label="照片调整预览">
        <span className="asset-baseline" aria-hidden="true" />
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
          {asset.format.toUpperCase()} · {asset.width}×{asset.height} · 可见边界 {asset.alphaBounds.width}×{asset.alphaBounds.height}
        </p>
        <div className="normalization-grid">
          <NumberControl label="大小" value={normalization.scale} min={0.25} max={4} step={0.05} onChange={(value) => update('scale', value)} />
          <NumberControl label="水平偏移" value={normalization.offsetX} min={-512} max={512} step={1} onChange={(value) => update('offsetX', value)} />
          <NumberControl label="上下位置" value={normalization.offsetY} min={-512} max={512} step={1} onChange={(value) => update('offsetY', value)} />
          <NumberControl label="脚底位置" value={normalization.baselineOffset} min={-256} max={256} step={1} onChange={(value) => update('baselineOffset', value)} />
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
  onChange(value: string): void
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
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  )
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
