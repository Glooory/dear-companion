import type { AudioImportResult, AudioSettingsV3, AudioSource, AudioSourceInput } from '@shared/contracts'

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
      <div className="editor-heading-row"><div><h2>本地声音</h2><p className="supporting-copy">声音按每条提醒独立开关，默认关闭；播放最长 30 秒。</p></div>
        <button type="button" className="secondary-button" disabled={disabled} onClick={onImport}>导入 MP3 / WAV / OGG</button>
      </div>
      {(['reminder', 'crying'] as const).map((cue) => {
        const source = cue === 'reminder' ? audio.reminderSource : audio.cryingSource
        return <label className="audio-source" key={cue}><span>{cue === 'reminder' ? '提醒音来源' : '哭闹音来源'}</span><select disabled={disabled} value={source.kind === 'builtin' ? 'builtin' : source.assetId} onChange={(event) => update(cue, event.currentTarget.value)}>
          <option value="builtin">{cue === 'reminder' ? '内置轻柔提示音' : '内置轻声哭闹音'}</option>
          {audio.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}{asset.available ? '' : '（不可用，将回退）'}</option>)}
        </select></label>
      })}
      {report && <div className="import-report" role="status"><strong>已导入 {report.imported.length} 个音频</strong>{report.failures.map((failure) => <p key={`${failure.index}-${failure.code}`}>第 {failure.index + 1} 个：{failure.message}</p>)}</div>}
    </article>
  )
}
