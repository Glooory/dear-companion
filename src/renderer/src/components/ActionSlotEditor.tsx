import { ACTION_SLOTS, type ActionSlot, type PetActionSlots, type PetAsset } from '@shared/contracts'

const SLOT_LABELS: Record<ActionSlot, string> = {
  idle: '平时陪伴（至少一张）',
  cute: '卖萌',
  petting: '摸头',
  angry: '生气',
  crying: '哭闹',
  resting: '休息',
  blink: '闭眼 / 眨眼'
}

interface ActionSlotEditorProps {
  assets: readonly PetAsset[]
  slots: PetActionSlots
  onChange(slots: PetActionSlots): void
}

export function ActionSlotEditor({ assets, slots, onChange }: ActionSlotEditorProps): React.JSX.Element {
  const toggle = (slot: ActionSlot, assetId: string): void => {
    const current = slots[slot]
    const next = current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId]
    onChange({ ...slots, [slot]: next })
  }

  return (
    <div className="action-slot-grid">
      {ACTION_SLOTS.map((slot) => (
        <fieldset key={slot}>
          <legend>{SLOT_LABELS[slot]}</legend>
          {assets.length === 0 ? (
            <p className="supporting-copy">先导入图片</p>
          ) : assets.map((asset) => (
            <label key={asset.id}>
              <input
                type="checkbox"
                checked={slots[slot].includes(asset.id)}
                onChange={() => toggle(slot, asset.id)}
              />
              <span>{asset.id.slice(0, 8)} · {asset.format.toUpperCase()}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  )
}
