import type { AudioImportResult, AudioSettingsV3, AudioSource, AudioSourceInput } from '@shared/contracts'
import { InfoTooltip } from './Tooltip'

interface Props {
  audio: AudioSettingsV3
  report: AudioImportResult | null
  disabled: boolean
  onImport(): void
  onChange(input: AudioSourceInput): void
}

export function AudioSettings({ audio, report, disabled, onImport, onChange }: Props): React.JSX.Element {
  const update = (cue: 'reminder' | 'crying', value: string): void => {
    const source: AudioSource = value === 'builtin'
      ? { kind: 'builtin', id: cue === 'reminder' ? 'gentle-chime' : 'soft-whimper' }
      : { kind: 'imported', assetId: value }
    onChange({
      reminderSource: cue === 'reminder' ? source : audio.reminderSource,
      cryingSource: cue === 'crying' ? source : audio.cryingSource
    })
  }
  return (
    <article className="settings-card audio-settings">
      <div className="editor-heading-row">
        <div className="heading-with-tooltip">
          <h2>提醒声音</h2>
          <InfoTooltip text="声音默认保持静音。每条休息提醒可单独开启提示音。" />
        </div>
        <button type="button" className="secondary-button" disabled={disabled} onClick={onImport}>导入声音</button>
      </div>

      {(['reminder', 'crying'] as const).map((cue) => {
        const source = cue === 'reminder' ? audio.reminderSource : audio.cryingSource
        return <label className="audio-source" key={cue}><span>{cue === 'reminder' ? '休息提醒提示音' : '督促继续休息提示音'}</span><select disabled={disabled} value={source.kind === 'builtin' ? 'builtin' : source.assetId} onChange={(event) => update(cue, event.currentTarget.value)}>
          <option value="builtin">{cue === 'reminder' ? '轻柔提示音' : '轻声督促'}</option>
          {audio.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}{asset.available ? '' : '（无法播放，将使用内置声音）'}</option>)}
        </select></label>
      })}
      {report && <div className="import-report" role="status"><strong>已导入 {report.imported.length} 个声音</strong>{report.failures.map((failure) => <p key={`${failure.index}-${failure.code}`}>第 {failure.index + 1} 个：{failure.message}</p>)}</div>}
    </article>
  )
}
