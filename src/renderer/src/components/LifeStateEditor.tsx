import type { PetAsset, PetLifeStates } from '@shared/contracts'

export function LifeStateEditor({ assets, value, onChange }: {
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
        title="有点困了"
        description="可选。至少分配一张照片后才能启用。"
        assets={assets}
        selected={value.drowsy.assetIds}
        enabled={value.drowsy.enabled}
        onToggle={(assetId) => toggleAsset('drowsy', assetId)}
        onEnabled={(enabled) => onChange({ ...value, drowsy: { ...value.drowsy, enabled } })}
      />
      <LifeGroup
        title="睡觉"
        description="可选。至少分配一张照片后才能启用。"
        assets={assets}
        selected={value.sleeping.assetIds}
        enabled={value.sleeping.enabled}
        onToggle={(assetId) => toggleAsset('sleeping', assetId)}
        onEnabled={(enabled) => onChange({ ...value, sleeping: { ...value.sleeping, enabled } })}
      />
      <LifeGroup
        title="陪伴工作"
        description="照片可选；没有专属照片时会使用平时陪伴照片。"
        assets={assets}
        selected={value.workingAssetIds}
        onToggle={(assetId) => toggleAsset('workingAssetIds', assetId)}
      />
    </div>
  )
}

function LifeGroup({ title, description, assets, selected, enabled, onToggle, onEnabled }: {
  title: string
  description: string
  assets: readonly PetAsset[]
  selected: readonly string[]
  enabled?: boolean
  onToggle(assetId: string): void
  onEnabled?: (enabled: boolean) => void
}): React.JSX.Element {
  return (
    <fieldset className="life-state-group">
      <legend>{title}</legend>
      <p className="supporting-copy">{description}</p>
      {onEnabled && (
        <label className="toggle-control compact-toggle">
          <input type="checkbox" checked={Boolean(enabled)} disabled={selected.length === 0} onChange={(event) => onEnabled(event.currentTarget.checked)} />
          <span>启用{title}</span>
        </label>
      )}
      <div className="asset-choice-list">
        {assets.map((asset) => (
          <label key={asset.id}>
            <input type="checkbox" checked={selected.includes(asset.id)} onChange={() => onToggle(asset.id)} />
            <span>{asset.id.slice(0, 8)} · {asset.format.toUpperCase()}</span>
          </label>
        ))}
        {assets.length === 0 && <span className="supporting-copy">先导入图片</span>}
      </div>
    </fieldset>
  )
}

function toggle(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}
