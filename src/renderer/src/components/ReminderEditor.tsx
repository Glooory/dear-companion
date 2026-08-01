import type { CreateReminderInput, CursorTolerance, Weekday } from '@shared/contracts'

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

const WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' },
  { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' },
  { value: 0, label: '日' }
]

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
        <label><span>休息分钟（1–120）</span><input type="number" min={1} max={120} value={value.restDurationMinutes} onChange={(event) => {
          const next = Number(event.currentTarget.value)
          if (Number.isInteger(next)) onChange({ ...value, restDurationMinutes: Math.min(Math.max(next, 1), 120) })
        }} /></label>
        <label><span>鼠标移动容差</span><select value={value.cursorTolerance} onChange={(event) => onChange({ ...value, cursorTolerance: event.currentTarget.value as CursorTolerance })}>
          <option value="sensitive">灵敏</option><option value="standard">标准</option><option value="relaxed">宽松</option>
        </select></label>
      </div>
      <fieldset className="weekday-picker"><legend>重复星期</legend>{WEEKDAYS.map((day) => (
        <label key={day.value}><input type="checkbox" checked={value.weekdays.includes(day.value)} onChange={(event) => onChange({
          ...value,
          weekdays: event.currentTarget.checked
            ? [...value.weekdays, day.value].sort()
            : value.weekdays.filter((candidate) => candidate !== day.value)
        })} />{day.label}</label>
      ))}</fieldset>
      <label className="message-field"><span>提示文案（1–200 字）</span><textarea maxLength={200} value={value.message} onChange={(event) => onChange({ ...value, message: event.currentTarget.value })} /></label>
      <div className="reminder-toggles">
        <label><input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })} />启用提醒</label>
        <label><input type="checkbox" checked={value.sounds.reminder} onChange={(event) => onChange({ ...value, sounds: { ...value.sounds, reminder: event.currentTarget.checked } })} />播放提醒音</label>
        <label><input type="checkbox" checked={value.sounds.crying} onChange={(event) => onChange({ ...value, sounds: { ...value.sounds, crying: event.currentTarget.checked } })} />播放哭闹音</label>
      </div>
      <div className="editor-actions">
        {onDelete && <button type="button" className="danger-button" disabled={disabled} onClick={onDelete}>删除</button>}
        <button type="button" className="secondary-button" disabled={disabled} onClick={onCancel}>取消</button>
        <button type="button" className="primary-button" disabled={disabled || !valid} onClick={onSave}>保存提醒</button>
      </div>
    </div>
  )
}
