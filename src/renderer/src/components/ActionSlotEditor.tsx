import type { PetActionSlots, PetAsset } from '@shared/contracts'
import { AssetChoice } from './AssetChoice'

type ConfigurableActionSlot = 'idle' | 'resting'

const CONFIGURABLE_ACTION_SLOTS = [
  'idle', 'resting'
] as const satisfies readonly ConfigurableActionSlot[]

const SLOT_LABELS: Record<ConfigurableActionSlot, string> = {
  idle: '☀️ 平时陪伴照片',
  resting: '🌙 休息模式照片'
}

const SLOT_HINTS: Record<ConfigurableActionSlot, string> = {
  idle: '日常在桌面上陪伴你的照片，支持选择多张在漫步时轮换',
  resting: '可选，在番茄钟或久坐提醒进入休息时显示'
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
          <p className="supporting-copy" style={{ margin: '0 0 8px 0', fontSize: '12px' }}>{SLOT_HINTS[slot]}</p>
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
