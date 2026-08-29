import type { CreateReminderInput, CursorTolerance } from '@shared/contracts'
import { WeekdayPicker } from './WeekdayPicker'

export interface ReminderDraft extends Omit<CreateReminderInput, 'hour' | 'minute'> {
  id?: string
  hour: number | null
  minute: number | null
}

interface Props {
  value: ReminderDraft
  disabled: boolean
  onChange(value: ReminderDraft): void
  onSave(): void
  onCancel(): void
  onDelete?: () => void
}

export function ReminderEditor({ value, disabled, onChange, onSave, onCancel, onDelete }: Props): React.JSX.Element {
  const timeValue = value.hour === null || value.minute === null
    ? '' : `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`
  const valid = value.hour !== null && value.minute !== null && value.weekdays.length > 0 &&
    value.message.trim().length >= 1 && value.message.trim().length <= 200

  return (
    <div className="reminder-editor">
      <div className="reminder-fields">
        <label><span>提醒时间</span><input type="time" value={timeValue} onChange={(event) => {
          const [hour, minute] = event.currentTarget.value.split(':').map(Number)
          onChange({ ...value, hour: Number.isInteger(hour) ? hour! : null, minute: Number.isInteger(minute) ? minute! : null })
        }} /></label>
        <label><span>休息时长（分钟）</span><input type="number" min={1} max={120} value={value.restDurationMinutes} onChange={(event) => {
          const next = Number(event.currentTarget.value)
          if (Number.isInteger(next)) onChange({ ...value, restDurationMinutes: Math.min(Math.max(next, 1), 120) })
        }} /></label>
        <label><span>鼠标移动灵敏度</span><select value={value.cursorTolerance} onChange={(event) => onChange({ ...value, cursorTolerance: event.currentTarget.value as CursorTolerance })}>
          <option value="sensitive">轻微移动即提醒</option><option value="standard">适度移动后提醒</option><option value="relaxed">明显移动才提醒</option>
        </select></label>
      </div>
      <WeekdayPicker value={value.weekdays} disabled={disabled} onChange={(weekdays) => onChange({ ...value, weekdays })} />
      <label className="message-field"><span>提醒内容</span><textarea maxLength={200} value={value.message} onChange={(event) => onChange({ ...value, message: event.currentTarget.value })} /></label>
      <div className="reminder-toggles">
        <label className="toggle-control"><input type="checkbox" checked={value.enabled} disabled={!value.id || disabled} onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })} /><span>启用此条提醒</span></label>
        <label className="toggle-control"><input type="checkbox" checked={value.sounds.reminder} onChange={(event) => onChange({ ...value, sounds: { ...value.sounds, reminder: event.currentTarget.checked } })} /><span>播放提醒提示音</span></label>
        <label className="toggle-control"><input type="checkbox" checked={value.sounds.crying} onChange={(event) => onChange({ ...value, sounds: { ...value.sounds, crying: event.currentTarget.checked } })} /><span>离开休息时轻声提醒</span></label>
      </div>
      <div className="editor-actions">
        {onDelete && <button type="button" className="danger-button" disabled={disabled} onClick={onDelete}>删除</button>}
        <button type="button" className="secondary-button" disabled={disabled} onClick={onCancel}>取消</button>
        <button type="button" className="primary-button" disabled={disabled || !valid} onClick={onSave}>保存提醒</button>
      </div>
    </div>
  )
}
