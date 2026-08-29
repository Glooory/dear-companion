import type { PetAsset, PetLifeStates } from '@shared/contracts'
import { AssetChoice } from './AssetChoice'
import { InfoTooltip } from './Tooltip'

export function LifeStateEditor({ petId, assets, value, onChange }: {
  petId: string
  assets: readonly PetAsset[]
  value: PetLifeStates
  onChange(value: PetLifeStates): void
}): React.JSX.Element {
  const toggleAsset = (group: 'drowsy' | 'sleeping' | 'workingAssetIds', assetId: string): void => {
    if (group === 'workingAssetIds') {
      const next = toggle(value.workingAssetIds, assetId)
      onChange({ ...value, workingAssetIds: next })
      return
    }
    const current = value[group]
    const assetIds = toggle(current.assetIds, assetId)
    onChange({ ...value, [group]: { enabled: assetIds.length > 0 && current.enabled, assetIds } })
  }

  return (
    <div className="life-state-grid">
      <LifeGroup
        title="困倦打瞌睡"
        description="建议选用打哈欠或揉眼照片。空闲时会自然打瞌睡。"
        petId={petId}
        assets={assets}
        selected={value.drowsy.assetIds}
        enabled={value.drowsy.enabled}
        onToggle={(assetId) => toggleAsset('drowsy', assetId)}
        onEnabled={(enabled) => onChange({ ...value, drowsy: { ...value.drowsy, enabled } })}
      />
      <LifeGroup
        title="安睡打盹"
        description="建议选用闭眼或趴卧照片。在安静或休息时段小憩。"
        petId={petId}
        assets={assets}
        selected={value.sleeping.assetIds}
        enabled={value.sleeping.enabled}
        onToggle={(assetId) => toggleAsset('sleeping', assetId)}
        onEnabled={(enabled) => onChange({ ...value, sleeping: { ...value.sleeping, enabled } })}
      />
      <LifeGroup
        title="专注工作"
        description="进入专注时段时展示。未指定时沿用平时照片。"
        petId={petId}
        assets={assets}
        selected={value.workingAssetIds}
        onToggle={(assetId) => toggleAsset('workingAssetIds', assetId)}
      />
    </div>
  )
}

function LifeGroup({ title, description, petId, assets, selected, enabled, onToggle, onEnabled }: {
  title: string
  description: string
  petId: string
  assets: readonly PetAsset[]
  selected: readonly string[]
  enabled?: boolean
  onToggle(assetId: string): void
  onEnabled?: (enabled: boolean) => void
}): React.JSX.Element {
  return (
    <fieldset className="life-state-group">
      <legend className="fieldset-legend-row">
        <span>{title}</span>
        <InfoTooltip text={description} />
      </legend>
      {onEnabled && (
        <label className="toggle-control compact-toggle">
          <input type="checkbox" checked={Boolean(enabled)} disabled={selected.length === 0} onChange={(event) => onEnabled(event.currentTarget.checked)} />
          <span>启用此状态</span>
        </label>
      )}
      <div className="asset-choice-list">
        {assets.map((asset) => (
          <AssetChoice
            key={asset.id}
            petId={petId}
            asset={asset}
            checked={selected.includes(asset.id)}
            onChange={() => onToggle(asset.id)}
          />
        ))}
        {assets.length === 0 && <span className="supporting-copy">请先导入照片</span>}
      </div>
    </fieldset>
  )
}

function toggle(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

