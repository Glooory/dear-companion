import type { CompanionPace } from '@shared/contracts'

const PACE_OPTIONS = [
  { value: 'quiet', label: '安静', description: '偶尔轻轻动一下，很少走动或说话。' },
  { value: 'natural', label: '自然', description: '时不时自己活动，适合日常陪伴。' },
  { value: 'lively', label: '爱玩', description: '更常走动和卖萌，但不会频繁说话。' }
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
