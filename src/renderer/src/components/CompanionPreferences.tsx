import type { CompanionPace } from '@shared/contracts'
import { InfoTooltip } from './Tooltip'

const PACE_OPTIONS = [
  {
    value: 'quiet',
    label: '安静',
    tagline: '偶尔呼吸 · 几乎不走动',
    description: '保持安静，不分散视线，适合需要专注的工作时段。'
  },
  {
    value: 'natural',
    label: '惬意',
    tagline: '间歇走动 · 自然陪伴',
    description: '偶尔走动或变换姿势，最舒服的日常节奏。'
  },
  {
    value: 'lively',
    label: '活跃',
    tagline: '动作丰富 · 互动频繁',
    description: '走动更频繁，更常主动做动作和小表情。'
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
          <InfoTooltip text="调整伙伴在桌面的活动与走动频率。" />
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
          <span>日常对话气泡</span>
        </label>
        <InfoTooltip text="漫步与互动时冒出轻量气泡；关闭后仅保留休息提醒。" />
      </div>
    </div>
  )
}

