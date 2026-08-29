import { useState } from 'react'
import type { CreateWorkScheduleInput, WorkSchedule } from '@shared/contracts'
import { WeekdayPicker } from './WeekdayPicker'
import { InfoTooltip } from './Tooltip'

interface Draft extends CreateWorkScheduleInput { id?: string }
const freshDraft = (): Draft => ({ enabled: true, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0, weekdays: [1, 2, 3, 4, 5] })

export function WorkScheduleEditor({ schedules, disabled, onCreate, onUpdate, onDelete, onToggle }: {
  schedules: readonly WorkSchedule[]
  disabled: boolean
  onCreate(value: CreateWorkScheduleInput): void
  onUpdate(value: WorkSchedule): void
  onDelete(id: string): void
  onToggle(id: string, enabled: boolean): void
}): React.JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null)
  const invalidEqual = Boolean(draft && draft.startHour === draft.endHour && draft.startMinute === draft.endMinute)
  const valid = Boolean(draft && draft.weekdays.length > 0 && !invalidEqual)
  return (
    <article className="settings-card work-schedule-card">
      <div className="editor-heading-row">
        <div className="heading-with-tooltip">
          <h2>专注时段</h2>
          <InfoTooltip text="在专注时段内，伙伴将保持安静，不主动走动或展示气泡。" />
        </div>
        {!draft && <button type="button" className="primary-button" disabled={disabled} onClick={() => setDraft(freshDraft())}>添加专注时段</button>}
      </div>

      {draft ? (
        <div className="work-schedule-editor">
          <div className="work-time-fields">
            <TimeField label="开始" hour={draft.startHour} minute={draft.startMinute} onChange={(hour, minute) => setDraft({ ...draft, startHour: hour, startMinute: minute })} />
            <TimeField label="结束" hour={draft.endHour} minute={draft.endMinute} onChange={(hour, minute) => setDraft({ ...draft, endHour: hour, endMinute: minute })} />
          </div>
          <WeekdayPicker value={draft.weekdays} disabled={disabled} onChange={(weekdays) => setDraft({ ...draft, weekdays })} />
          {invalidEqual && <p className="inline-status-error">开始和结束时间不能相同。</p>}
          <label className="toggle-control">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.currentTarget.checked })} />
            <span>启用这个专注时段</span>
          </label>
          <div className="editor-actions">
            {draft.id && <button type="button" className="danger-button" disabled={disabled} onClick={() => { onDelete(draft.id!); setDraft(null) }}>删除</button>}
            <button type="button" className="secondary-button" disabled={disabled} onClick={() => setDraft(null)}>取消</button>
            <button type="button" className="primary-button" disabled={disabled || !valid} onClick={() => {
              const value = { ...draft, weekdays: [...draft.weekdays] }
              if (value.id) onUpdate(value as WorkSchedule)
              else onCreate(value)
              setDraft(null)
            }}>保存专注时段</button>
          </div>
        </div>
      ) : (
        <div className="work-schedule-list">
          {schedules.length === 0 && <p className="empty-editor-state">暂无专注时段。设定后伙伴会在此时段内静静陪伴；也可以随时通过右键菜单手动开启。</p>}
          {schedules.map((schedule) => (
            <div className="work-schedule-row" key={schedule.id}>
              <button type="button" className="reminder-summary" onClick={() => setDraft({ ...schedule, weekdays: [...schedule.weekdays] })}>
                <strong>{formatTime(schedule.startHour, schedule.startMinute)}–{formatTime(schedule.endHour, schedule.endMinute)}</strong>
                <span>{schedule.endHour * 60 + schedule.endMinute < schedule.startHour * 60 + schedule.startMinute ? '跨日 · ' : ''}每周 {schedule.weekdays.length} 天</span>
              </button>
              <label className="toggle-control" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={schedule.enabled} disabled={disabled} onChange={() => onToggle(schedule.id, !schedule.enabled)} />
                <span>启用</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function TimeField({ label, hour, minute, onChange }: { label: string; hour: number; minute: number; onChange(hour: number, minute: number): void }): React.JSX.Element {
  return <label><span>{label}</span><input type="time" value={formatTime(hour, minute)} onChange={(event) => {
    const [nextHour, nextMinute] = event.currentTarget.value.split(':').map(Number)
    if (Number.isInteger(nextHour) && Number.isInteger(nextMinute)) onChange(nextHour!, nextMinute!)
  }} /></label>
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
