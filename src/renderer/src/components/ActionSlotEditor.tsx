import type { ActionSlot, PetActionSlots, PetAsset } from '@shared/contracts'
import { AssetChoice } from './AssetChoice'

type ConfigurableActionSlot = Exclude<ActionSlot, 'petting'>

const CONFIGURABLE_ACTION_SLOTS = [
  'idle', 'cute', 'angry', 'crying', 'resting', 'blink'
] as const satisfies readonly ConfigurableActionSlot[]

const SLOT_LABELS: Record<ConfigurableActionSlot, string> = {
  idle: '平时陪伴（至少一张）',
  cute: '卖萌',
  angry: '生气',
  crying: '哭闹',
  resting: '休息',
  blink: '闭眼 / 眨眼'
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
          <legend>{SLOT_LABELS[slot]}</legend>
          {assets.length === 0 ? (
            <p className="supporting-copy">先导入图片</p>
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
