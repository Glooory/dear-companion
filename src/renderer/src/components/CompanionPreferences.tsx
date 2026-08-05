import type { CompanionPace } from '@shared/contracts'

export function CompanionPreferences({ pace, bubblesEnabled, onPaceChange, onBubblesChange }: {
  pace: CompanionPace
  bubblesEnabled: boolean
  onPaceChange(value: CompanionPace): void
  onBubblesChange(value: boolean): void
}): React.JSX.Element {
  return (
    <div className="companion-preferences">
      <fieldset>
        <legend>陪伴节奏</legend>
        {([['quiet', '安静'], ['natural', '自然'], ['lively', '活泼']] as const).map(([value, label]) => (
          <label key={value}><input type="radio" name="companion-pace" value={value} checked={pace === value} onChange={() => onPaceChange(value)} />{label}</label>
        ))}
      </fieldset>
      <label className="toggle-control">
        <input type="checkbox" checked={bubblesEnabled} onChange={(event) => onBubblesChange(event.currentTarget.checked)} />
        <span>显示互动气泡</span>
      </label>
      <p className="supporting-copy">关闭后仍会显示提醒、倒计时、错误等必要信息。</p>
    </div>
  )
}
