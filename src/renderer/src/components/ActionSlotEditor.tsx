import type { PetActionSlots, PetAsset } from '@shared/contracts'
import { AssetChoice } from './AssetChoice'
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
  idle: '日常陪伴漫步时展示的照片，支持勾选多张轮换。',
  resting: '提醒休息期间展示的照片。未选时沿用平时姿态。'
}

interface ActionSlotEditorProps {
  petId: string
  assets: readonly PetAsset[]
  slots: PetActionSlots
  onChange(slots: PetActionSlots): void
}

export function ActionSlotEditor({ petId, assets, slots, onChange }: ActionSlotEditorProps): React.JSX.Element {
  const toggle = (slot: ConfigurableActionSlot, assetId: string): void => {
    const current = slots[slot]
    const next = current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId]
    onChange({ ...slots, [slot]: next })
  }

  return (
    <div className="action-slot-grid">
      {CONFIGURABLE_ACTION_SLOTS.map((slot) => (
        <fieldset key={slot}>
          <legend className="fieldset-legend-row">
            <span>{SLOT_LABELS[slot]}</span>
            <InfoTooltip text={SLOT_HINTS[slot]} />
          </legend>
          {assets.length === 0 ? (
            <p className="supporting-copy">请先导入照片</p>
          ) : assets.map((asset) => (
            <AssetChoice
              key={asset.id}
              petId={petId}
              asset={asset}
              checked={slots[slot].includes(asset.id)}
              onChange={() => toggle(slot, asset.id)}
            />
          ))}
        </fieldset>
      ))}
    </div>
  )
}

