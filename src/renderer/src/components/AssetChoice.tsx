import type { PetAsset } from '@shared/contracts'

export function AssetChoice({ petId, asset, checked, onChange }: {
  petId: string
  asset: PetAsset
  checked: boolean
  onChange(): void
}): React.JSX.Element {
  return (
    <label className={`asset-choice${checked ? ' selected' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="asset-choice-thumbnail" aria-hidden="true">
        <img
          src={`app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(asset.id)}`}
          alt=""
          draggable={false}
        />
      </span>
      <span className="asset-choice-details">
        <strong>照片 {asset.id.slice(0, 8)}</strong>
        <small>{asset.format.toUpperCase()} · {asset.width}×{asset.height}</small>
      </span>
    </label>
  )
}
