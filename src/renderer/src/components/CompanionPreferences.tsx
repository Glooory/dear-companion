import type { CompanionPace } from '@shared/contracts'

const PACE_OPTIONS = [
  { value: 'quiet', label: '🌱 安静模式', description: '偶尔轻微呼吸，几乎不打扰，适合需要深度专注时。' },
  { value: 'natural', label: '🍃 惬意模式', description: '偶尔轻微走动或变换姿势，日常最舒心的自然节奏。' },
  { value: 'lively', label: '✨ 活跃模式', description: '更爱走动踱步与主动卖萌，充满生气与互动感。' }
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
        <legend>活动节奏</legend>
        {PACE_OPTIONS.map((option) => (
          <div className={`pace-option${pace === option.value ? ' selected' : ''}`} key={option.value}>
            <label>
              <input type="radio" name="companion-pace" value={option.value} checked={pace === option.value} onChange={() => onPaceChange(option.value)} />
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
            </label>
            <button type="button" className="preview-button" onClick={() => onPreview(option.value)}>试看动作</button>
          </div>
        ))}
      </fieldset>
      <label className="toggle-control">
        <input type="checkbox" checked={bubblesEnabled} onChange={(event) => onBubblesChange(event.currentTarget.checked)} />
        <span>偶尔冒出对话气泡</span>
      </label>
      <p className="supporting-copy">关闭后，仅在休息提醒或状态提示时显示气泡。</p>
    </div>
  )
}
