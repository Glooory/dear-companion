import { useState } from 'react'
import type { PetActionSlots, PetAsset } from '@shared/contracts'
import { InfoTooltip } from './Tooltip'

type ConfigurableActionSlot = 'idle' | 'resting'

const CONFIGURABLE_ACTION_SLOTS = [
  'idle', 'resting'
] as const satisfies readonly ConfigurableActionSlot[]

const SLOT_LABELS: Record<ConfigurableActionSlot, string> = {
  idle: '平时陪伴',
  resting: '休息模式'
}

const SLOT_HINTS: Record<ConfigurableActionSlot, string> = {
  idle: '日常陪伴漫步时展示的照片，可选择多张轮换展示。',
  resting: '定时休息期间展示的照片。未指定时沿用平时陪伴照片。'
}

const SLOT_FALLBACK_TEXTS: Record<ConfigurableActionSlot, string> = {
  idle: '请选择平时陪伴的照片',
  resting: '沿用平时陪伴照片'
}

interface ActionSlotEditorProps {
  petId: string
  assets: readonly PetAsset[]
  slots: PetActionSlots
  onChange(slots: PetActionSlots): void
}

export function ActionSlotEditor({ petId, assets, slots, onChange }: ActionSlotEditorProps): React.JSX.Element {
  const [activePickingSlot, setActivePickingSlot] = useState<ConfigurableActionSlot | null>(null)

  const toggle = (slot: ConfigurableActionSlot, assetId: string): void => {
    const current = slots[slot]
    const next = current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId]
    onChange({ ...slots, [slot]: next })
  }

  const remove = (slot: ConfigurableActionSlot, assetId: string): void => {
    onChange({ ...slots, [slot]: slots[slot].filter((id) => id !== assetId) })
  }

  return (
    <div className="action-slot-grid">
      {CONFIGURABLE_ACTION_SLOTS.map((slot) => {
        const selectedIds = slots[slot]
        const selectedAssets = assets.filter((asset) => selectedIds.includes(asset.id))
        const isPicking = activePickingSlot === slot

        return (
          <fieldset key={slot} className="slot-card">
            <legend className="fieldset-legend-row">
              <span>{SLOT_LABELS[slot]}</span>
              <InfoTooltip text={SLOT_HINTS[slot]} />
            </legend>

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
                        title="从该场景中移除"
                        onClick={() => remove(slot, asset.id)}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}

                {selectedAssets.length === 0 && (
                  <span className="slot-fallback-text">{SLOT_FALLBACK_TEXTS[slot]}</span>
                )}
              </div>
            </div>

            {assets.length > 0 && (
              <div className="slot-action-bar">
                <button
                  type="button"
                  className={`slot-action-btn ${isPicking ? 'is-active' : ''}`}
                  onClick={() => setActivePickingSlot(isPicking ? null : slot)}
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
              <div className="slot-picker-popover" role="listbox" aria-label={`选择${SLOT_LABELS[slot]}照片`}>
                <div className="picker-popover-grid">
                  {assets.map((asset, index) => {
                    const isSelected = selectedIds.includes(asset.id)
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={`picker-popover-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => toggle(slot, asset.id)}
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
      })}
    </div>
  )
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
