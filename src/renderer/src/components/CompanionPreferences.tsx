import type { CompanionPace } from '@shared/contracts'
import { InfoTooltip } from './Tooltip'

const PACE_OPTIONS = [
  {
    value: 'quiet',
    label: '安静',
    tagline: '极少走动 · 深度专注',
    description: '偶尔轻微呼吸，几乎不打扰，适合需要深度专注的工作时段。'
  },
  {
    value: 'natural',
    label: '惬意',
    tagline: '轻微踱步 · 舒心陪伴',
    description: '偶尔轻微走动或变换姿势，日常最舒心的自然陪伴节奏。'
  },
  {
    value: 'lively',
    label: '活跃',
    tagline: '更爱卖萌 · 生机互动',
    description: '更爱走动踱步与主动卖萌，充满生气与日常陪伴感。'
  }
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
        <legend className="fieldset-legend-row">
          <span>陪伴节奏</span>
          <InfoTooltip text="控制伙伴在桌面的活动频率。可随时切换不同节奏或点击试看动作。" />
        </legend>
        <div className="pace-options-grid">
          {PACE_OPTIONS.map((option) => (
            <div className={`pace-option${pace === option.value ? ' selected' : ''}`} key={option.value}>
              <label className="pace-option-header">
                <input
                  type="radio"
                  name="companion-pace"
                  value={option.value}
                  checked={pace === option.value}
                  onChange={() => onPaceChange(option.value)}
                />
                <div className="pace-option-meta">
                  <div className="pace-option-title-row">
                    <strong>{option.label}</strong>
                    <InfoTooltip text={option.description} />
                  </div>
                  <small>{option.tagline}</small>
                </div>
              </label>
              <button
                type="button"
                className="preview-button"
                onClick={() => onPreview(option.value)}
              >
                试看动作
              </button>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="bubbles-toggle-row">
        <label className="toggle-control" style={{ marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={bubblesEnabled}
            onChange={(event) => onBubblesChange(event.currentTarget.checked)}
          />
          <span>偶尔冒出对话气泡</span>
        </label>
        <InfoTooltip text="开启后在日常漫步互动中显示轻量小气泡；关闭后仅保留设定的休息提醒。" />
      </div>
    </div>
  )
}

