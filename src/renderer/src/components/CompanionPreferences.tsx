import type { CompanionPace } from '@shared/contracts'

const PACE_OPTIONS = [
  { value: 'quiet', label: '🌱 安静陪伴', description: '偶尔轻微呼吸或点头，极少打扰，适合专注工作。' },
  { value: 'natural', label: '🍃 自然节奏', description: '时不时走动或变换姿态，最舒心的日常桌伴。' },
  { value: 'lively', label: '✨ 活泼爱玩', description: '更常踱步与主动卖萌，充满朝气与互动感。' }
] as const

export function CompanionPreferences({ pace, bubblesEnabled, onPaceChange, onBubblesChange, onPreview }: {
  pace: CompanionPace
  bubblesEnabled: boolean
  onPaceChange(value: CompanionPace): void
  onBubblesChange(value: boolean): void
  onPreview(value: CompanionPace): void
}): React.JSX.Element {
  return (
    <div className="companion-preferences">
      <fieldset className="pace-options">
        <legend>陪伴方式</legend>
        {PACE_OPTIONS.map((option) => (
          <div className={`pace-option${pace === option.value ? ' selected' : ''}`} key={option.value}>
            <label>
              <input type="radio" name="companion-pace" value={option.value} checked={pace === option.value} onChange={() => onPaceChange(option.value)} />
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
            </label>
            <button type="button" className="preview-button" onClick={() => onPreview(option.value)}>试试看</button>
          </div>
        ))}
      </fieldset>
      <label className="toggle-control">
        <input type="checkbox" checked={bubblesEnabled} onChange={(event) => onBubblesChange(event.currentTarget.checked)} />
        <span>让它偶尔说句话</span>
      </label>
      <p className="supporting-copy">关闭后，休息提醒和错误提示仍会正常显示。</p>
    </div>
  )
}
