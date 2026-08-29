import type { ActionSlot, PetActionSlots, PetAsset } from '@shared/contracts'
import { AssetChoice } from './AssetChoice'

type ConfigurableActionSlot = Exclude<ActionSlot, 'petting' | 'blink'>

const CONFIGURABLE_ACTION_SLOTS = [
  'idle', 'cute', 'angry', 'crying', 'resting'
] as const satisfies readonly ConfigurableActionSlot[]

const SLOT_LABELS: Record<ConfigurableActionSlot, string> = {
  idle: '🏠 平时陪伴照片',
  cute: '✨ 卖萌逗趣',
  angry: '💢 拖拽太快抗议',
  crying: '💧 休息偷看提醒',
  resting: '☕ 休息坐姿'
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
            <p className="supporting-copy">先导入照片</p>
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
