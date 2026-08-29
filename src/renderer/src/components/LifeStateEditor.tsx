import { useState } from 'react'
import type { PetAsset, PetLifeStates } from '@shared/contracts'
import { InfoTooltip } from './Tooltip'

interface LifeStateEditorProps {
  petId: string
  assets: readonly PetAsset[]
  value: PetLifeStates
  onChange(value: PetLifeStates): void
}

type LifeGroupKey = 'drowsy' | 'sleeping' | 'workingAssetIds'

export function LifeStateEditor({ petId, assets, value, onChange }: LifeStateEditorProps): React.JSX.Element {
  const [activePickingGroup, setActivePickingGroup] = useState<LifeGroupKey | null>(null)

  const toggleAsset = (group: LifeGroupKey, assetId: string): void => {
    if (group === 'workingAssetIds') {
      const next = toggle(value.workingAssetIds, assetId)
      onChange({ ...value, workingAssetIds: next })
      return
    }
    const current = value[group]
    const assetIds = toggle(current.assetIds, assetId)
    onChange({
      ...value,
      [group]: {
        enabled: assetIds.length > 0 ? (current.enabled || assetIds.length === 1) : false,
        assetIds
      }
    })
  }

  const removeAsset = (group: LifeGroupKey, assetId: string): void => {
    if (group === 'workingAssetIds') {
      onChange({ ...value, workingAssetIds: value.workingAssetIds.filter((id) => id !== assetId) })
      return
    }
    const current = value[group]
    const assetIds = current.assetIds.filter((id) => id !== assetId)
    onChange({
      ...value,
      [group]: {
        enabled: assetIds.length > 0 ? current.enabled : false,
        assetIds
      }
    })
  }

  return (
    <div className="life-state-grid">
      <LifeGroupCard
        title="困倦打瞌睡"
        description="建议选用揉眼或打哈欠照片。平时空闲时会自然打瞌睡。"
        petId={petId}
        assets={assets}
        selectedIds={value.drowsy.assetIds}
        enabled={value.drowsy.enabled}
        isPicking={activePickingGroup === 'drowsy'}
        onTogglePicking={() => setActivePickingGroup(activePickingGroup === 'drowsy' ? null : 'drowsy')}
        onToggleAsset={(assetId) => toggleAsset('drowsy', assetId)}
        onRemoveAsset={(assetId) => removeAsset('drowsy', assetId)}
        onEnabled={(enabled) => onChange({ ...value, drowsy: { ...value.drowsy, enabled } })}
      />

      <LifeGroupCard
        title="安睡打盹"
        description="建议选用闭眼或趴卧照片。在安静时段或长时休息时小憩。"
        petId={petId}
        assets={assets}
        selectedIds={value.sleeping.assetIds}
        enabled={value.sleeping.enabled}
        isPicking={activePickingGroup === 'sleeping'}
        onTogglePicking={() => setActivePickingGroup(activePickingGroup === 'sleeping' ? null : 'sleeping')}
        onToggleAsset={(assetId) => toggleAsset('sleeping', assetId)}
        onRemoveAsset={(assetId) => removeAsset('sleeping', assetId)}
        onEnabled={(enabled) => onChange({ ...value, sleeping: { ...value.sleeping, enabled } })}
      />

      <LifeGroupCard
        title="专注工作"
        description="进入工作时段时展示。未指定时沿用平时照片。"
        petId={petId}
        assets={assets}
        selectedIds={value.workingAssetIds}
        isPicking={activePickingGroup === 'workingAssetIds'}
        onTogglePicking={() => setActivePickingGroup(activePickingGroup === 'workingAssetIds' ? null : 'workingAssetIds')}
        onToggleAsset={(assetId) => toggleAsset('workingAssetIds', assetId)}
        onRemoveAsset={(assetId) => removeAsset('workingAssetIds', assetId)}
      />
    </div>
  )
}

function LifeGroupCard({
  title,
  description,
  petId,
  assets,
  selectedIds,
  enabled,
  isPicking,
  onTogglePicking,
  onToggleAsset,
  onRemoveAsset,
  onEnabled
}: {
  title: string
  description: string
  petId: string
  assets: readonly PetAsset[]
  selectedIds: readonly string[]
  enabled?: boolean
  isPicking: boolean
  onTogglePicking(): void
  onToggleAsset(assetId: string): void
  onRemoveAsset(assetId: string): void
  onEnabled?: (enabled: boolean) => void
}): React.JSX.Element {
  const selectedAssets = assets.filter((asset) => selectedIds.includes(asset.id))

  return (
    <fieldset className="life-state-card">
      <legend className="fieldset-legend-row">
        <span>{title}</span>
        <InfoTooltip text={description} />
      </legend>

      {onEnabled && (
        <div className="life-card-control-row">
          <label className="toggle-control compact-toggle">
            <input
              type="checkbox"
              checked={Boolean(enabled)}
              disabled={selectedIds.length === 0}
              onChange={(event) => onEnabled(event.currentTarget.checked)}
            />
            <span>启用此状态</span>
          </label>
        </div>
      )}

      <div className="slot-selected-stage">
        <div className="slot-chips-wrap">
          {selectedAssets.map((asset) => {
            const assetIndex = assets.findIndex((a) => a.id === asset.id) + 1
            return (
              <div key={asset.id} className="slot-asset-tile">
                <img
                  src={petAssetUrl(petId, asset.id)}
                  alt=""
                  className="slot-tile-img"
                  draggable={false}
                />
                <span className="slot-tile-caption">照片 {assetIndex}</span>
                <button
                  type="button"
                  className="slot-tile-remove-btn"
                  title="从该状态中移除"
                  onClick={() => onRemoveAsset(asset.id)}
                >
                  ×
                </button>
              </div>
            )
          })}

          {selectedAssets.length === 0 && (
            <span className="slot-fallback-text">沿用平时陪伴照片</span>
          )}
        </div>
      </div>

      {assets.length > 0 && (
        <div className="slot-action-bar">
          <button
            type="button"
            className={`slot-action-btn ${isPicking ? 'is-active' : ''}`}
            onClick={onTogglePicking}
            title={isPicking ? '收起选图' : '选择照片'}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {isPicking ? (
                <path d="M3 8h10" />
              ) : (
                <>
                  <line x1="8" y1="3" x2="8" y2="13" />
                  <line x1="3" y1="8" x2="13" y2="8" />
                </>
              )}
            </svg>
            <span>{isPicking ? '完成' : (selectedAssets.length > 0 ? '更换或添加照片' : '选择照片')}</span>
          </button>
        </div>
      )}

      {isPicking && assets.length > 0 && (
        <div className="slot-picker-popover" role="listbox" aria-label={`选择${title}照片`}>
          <div className="picker-popover-grid">
            {assets.map((asset, index) => {
              const isSelected = selectedIds.includes(asset.id)
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={`picker-popover-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onToggleAsset(asset.id)}
                >
                  <div className="picker-thumb-box">
                    <img
                      src={petAssetUrl(petId, asset.id)}
                      alt=""
                      draggable={false}
                      className="picker-thumb-img"
                    />
                    <span className="picker-item-caption">照片 {index + 1}</span>
                    {isSelected && (
                      <span className="picker-check-badge">✓</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </fieldset>
  )
}

function toggle(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
