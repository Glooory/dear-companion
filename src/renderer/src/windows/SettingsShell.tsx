import { useEffect, useMemo, useState } from 'react'
import type {
  AppSettings,
  AutostartStatus,
  AudioImportResult,
  AudioSourceInput,
  CreateReminderInput,
  ImageImportResult,
  PetConfig,
  PetRendererStatus,
  ReminderSchedule,
  ReleaseHardeningApi,
  RestSystemSnapshot,
  PetSystemSnapshot,
  PetUpdateInput
} from '@shared/contracts'
import { ActionSlotEditor } from '../components/ActionSlotEditor'
import { PetAssetEditor } from '../components/PetAssetEditor'
import { AudioSettings } from '../components/AudioSettings'
import { ReminderEditor, type ReminderDraft } from '../components/ReminderEditor'

interface SettingsShellProps {
  api: ReleaseHardeningApi
}

export function SettingsShell({ api }: SettingsShellProps): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [snapshot, setSnapshot] = useState<PetSystemSnapshot | null>(null)
  const [restSnapshot, setRestSnapshot] = useState<RestSystemSnapshot | null>(null)
  const [autostartStatus, setAutostartStatus] = useState<AutostartStatus | null>(null)
  const [petRendererStatus, setPetRendererStatus] = useState<PetRendererStatus | null>(null)
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PetUpdateInput | null>(null)
  const [newPetName, setNewPetName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importReport, setImportReport] = useState<ImageImportResult | null>(null)
  const [audioImportReport, setAudioImportReport] = useState<AudioImportResult | null>(null)
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      api.getSettings(),
      api.getPetSystemSnapshot(),
      api.getRestSystemSnapshot(),
      api.getAutostartStatus(),
      api.getPetRendererStatus()
    ]).then(
      ([loadedSettings, loadedSnapshot, loadedRestSnapshot, loadedAutostart, loadedRenderer]) => {
        if (cancelled) return
        const initialPet = loadedSnapshot.pets.find((pet) => pet.id === loadedSnapshot.activePetId) ?? loadedSnapshot.pets[0] ?? null
        setSettings(loadedSettings)
        setSnapshot(loadedSnapshot)
        setRestSnapshot(loadedRestSnapshot)
        setAutostartStatus(loadedAutostart)
        setPetRendererStatus(loadedRenderer)
        setSelectedPetId((current) => current ?? initialPet?.id ?? null)
        setDraft((current) => current ?? (initialPet ? petToUpdateInput(initialPet) : null))
      },
      () => { if (!cancelled) setError('无法读取本地设置，请重试') }
    )
    return () => { cancelled = true }
  }, [api, loadAttempt])

  useEffect(() => api.onPetSystemChanged((next) => {
    setSnapshot(next)
    setSettings((current) => current ? {
      ...current,
      activePetId: next.activePetId,
      petWindow: next.petWindow,
      pets: next.pets
    } : current)
  }), [api])

  useEffect(() => api.onRestSystemChanged((next) => {
    setRestSnapshot(next)
    setSettings((current) => current ? { ...current, reminders: next.reminders, audio: next.audio } : current)
  }), [api])

  useEffect(
    () => api.onPetRendererStatusChanged(setPetRendererStatus),
    [api]
  )

  const selectedPet = useMemo(
    () => snapshot?.pets.find((pet) => pet.id === selectedPetId) ?? null,
    [selectedPetId, snapshot]
  )

  const runMutation = async (operation: () => Promise<void>): Promise<void> => {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await operation()
    } catch {
      setError('操作未能保存，本地旧配置保持不变，请重试')
    } finally {
      setIsBusy(false)
    }
  }

  const createPet = (): void => {
    const name = newPetName.trim()
    if (!name || name.length > 80) {
      setError('宠物名称需为 1–80 个字符')
      return
    }
    void runMutation(async () => {
      const next = await api.createPet(name)
      const created = next.pets.at(-1)
      setSnapshot(next)
      setSelectedPetId(created?.id ?? null)
      setDraft(created ? petToUpdateInput(created) : null)
      setNewPetName('')
    })
  }

  const importAssets = (): void => {
    if (!selectedPetId) return
    void runMutation(async () => {
      const report = await api.chooseAndImportPetAssets(selectedPetId)
      setImportReport(report)
      const next = await api.getPetSystemSnapshot()
      setSnapshot(next)
      const nextPet = next.pets.find((pet) => pet.id === selectedPetId)
      if (nextPet) setDraft(petToUpdateInput(nextPet))
    })
  }

  const saveDraft = (): void => {
    if (!draft) return
    void runMutation(async () => {
      const next = await api.updatePet(draft)
      setSnapshot(next)
      const nextPet = next.pets.find((pet) => pet.id === draft.id)
      if (nextPet) setDraft(petToUpdateInput(nextPet))
    })
  }

  const activateDraft = (): void => {
    if (!draft || draft.actionSlots.idle.length === 0) return
    void runMutation(async () => {
      await api.updatePet(draft)
      const next = await api.setActivePet(draft.id)
      setSnapshot(next)
      const nextPet = next.pets.find((pet) => pet.id === draft.id)
      if (nextPet) setDraft(petToUpdateInput(nextPet))
      setSettings((current) => current ? { ...current, activePetId: next.activePetId, pets: next.pets } : current)
    })
  }

  const updatePetVisibility = (): void => {
    if (!settings) return
    void runMutation(async () => {
      const next = await api.setPetVisibility(!settings.petWindow.visible)
      setSettings(next)
    })
  }

  const updateAutostart = (): void => {
    if (!autostartStatus) return
    void runMutation(async () => {
      setAutostartStatus(await api.setAutostartEnabled(!autostartStatus.requested))
    })
  }

  const retryPetRenderer = (): void => {
    void runMutation(async () => {
      setPetRendererStatus(await api.retryPetRenderer())
    })
  }

  const applyRestSnapshot = (next: RestSystemSnapshot): void => {
    setRestSnapshot(next)
    setSettings((current) => current ? { ...current, reminders: next.reminders, audio: next.audio } : current)
  }

  const newReminder = (): void => setReminderDraft({
    hour: null,
    minute: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    restDurationMinutes: 10,
    cursorTolerance: 'standard',
    message: '该休息一下啦，陪我安静待一会儿吧。',
    sounds: { reminder: false, crying: false },
    enabled: true
  })

  const editReminder = (reminder: ReminderSchedule): void => setReminderDraft({
    ...reminder,
    weekdays: [...reminder.weekdays],
    sounds: { ...reminder.sounds }
  })

  const saveReminder = (): void => {
    const draftValue = reminderDraft
    if (!draftValue || draftValue.hour === null || draftValue.minute === null) return
    const input: CreateReminderInput = {
      enabled: draftValue.enabled,
      hour: draftValue.hour,
      minute: draftValue.minute,
      weekdays: [...draftValue.weekdays],
      restDurationMinutes: draftValue.restDurationMinutes,
      cursorTolerance: draftValue.cursorTolerance,
      message: draftValue.message,
      sounds: { ...draftValue.sounds }
    }
    void runMutation(async () => {
      const next = draftValue.id
        ? await api.updateReminder({ id: draftValue.id, ...input })
        : await api.createReminder(input)
      applyRestSnapshot(next)
      setReminderDraft(null)
    })
  }

  const deleteReminder = (): void => {
    if (!reminderDraft?.id) return
    void runMutation(async () => {
      applyRestSnapshot(await api.deleteReminder(reminderDraft.id!))
      setReminderDraft(null)
    })
  }

  const setReminderEnabled = (reminder: ReminderSchedule): void => {
    void runMutation(async () => applyRestSnapshot(await api.setReminderEnabled(reminder.id, !reminder.enabled)))
  }

  const importAudio = (): void => {
    void runMutation(async () => {
      const report = await api.chooseAndImportAudio()
      setAudioImportReport(report)
      applyRestSnapshot(await api.getRestSystemSnapshot())
    })
  }

  const updateAudioSources = (input: AudioSourceInput): void => {
    void runMutation(async () => applyRestSnapshot(await api.updateAudioSources(input)))
  }

  return (
    <main className="settings-shell pet-settings-shell" aria-busy={isBusy || !settings || !snapshot || !restSnapshot}>
      <header className="settings-header">
        <p className="eyebrow">本地离线桌面伙伴</p>
        <h1>Dear Companion</h1>
        <p className="supporting-copy">创建宠物、导入已抠好的透明图片，并用非破坏性参数统一视觉尺寸。</p>
      </header>

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          {!settings && <button type="button" onClick={() => {
            setError(null)
            setLoadAttempt((value) => value + 1)
          }}>重试</button>}
        </div>
      )}

      {settings && snapshot && (
        <div className="pet-settings-layout">
          <aside className="pet-list-panel" aria-label="宠物列表">
            <h2>宠物</h2>
            <div className="pet-list">
              {snapshot.pets.map((pet) => (
                <button
                  type="button"
                  key={pet.id}
                  className={pet.id === selectedPetId ? 'selected' : ''}
                  onClick={() => {
                    setSelectedPetId(pet.id)
                    setDraft(petToUpdateInput(pet))
                    setImportReport(null)
                  }}
                >
                  <span>{pet.name}</span>
                  {pet.id === snapshot.activePetId && <small>当前</small>}
                </button>
              ))}
              {snapshot.pets.length === 0 && <p className="supporting-copy">还没有宠物，先创建一个。</p>}
            </div>
            <label className="new-pet-control">
              <span>宠物名称</span>
              <input
                value={newPetName}
                maxLength={80}
                placeholder="例如：小桃"
                onChange={(event) => setNewPetName(event.currentTarget.value)}
              />
            </label>
            <button type="button" className="primary-button" disabled={isBusy} onClick={createPet}>创建宠物</button>
          </aside>

          <section className="pet-editor-panel">
            {draft && selectedPet ? (
              <>
                <div className="editor-heading-row">
                  <div>
                    <p className="eyebrow">宠物配置</p>
                    <h2>{selectedPet.name}</h2>
                  </div>
                  <button type="button" className="secondary-button" disabled={isBusy} onClick={importAssets}>
                    导入透明 PNG / WebP
                  </button>
                </div>

                {importReport && (
                  <div className="import-report" role="status">
                    <strong>已导入 {importReport.imported.length} 张</strong>
                    {importReport.failures.map((failure) => (
                      <p key={`${failure.index}-${failure.code}`}>第 {failure.index + 1} 张：{failure.message}</p>
                    ))}
                  </div>
                )}

                <div className="pet-basic-fields">
                  <label>
                    <span>名称</span>
                    <input
                      value={draft.name}
                      maxLength={80}
                      onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                    />
                  </label>
                  <label>
                    <span>默认人物高度（80–260 px）</span>
                    <input
                      type="number"
                      min={80}
                      max={260}
                      value={draft.targetHeight}
                      onChange={(event) => {
                        if (event.currentTarget.value.trim() === '') return
                        const value = Number(event.currentTarget.value)
                        if (Number.isFinite(value)) {
                          setDraft({ ...draft, targetHeight: Math.min(Math.max(value, 80), 260) })
                        }
                      }}
                    />
                  </label>
                </div>

                <section className="editor-section">
                  <h2>素材归一化</h2>
                  <p className="supporting-copy">虚线为统一脚底基线；所有调整只保存为元数据，原始副本不会改变。</p>
                  <div className="asset-editor-list">
                    {selectedPet.assets.map((asset) => {
                      const adjustment = draft.assets.find((entry) => entry.id === asset.id)
                      if (!adjustment) return null
                      return (
                        <PetAssetEditor
                          key={asset.id}
                          petId={selectedPet.id}
                          asset={asset}
                          targetHeight={draft.targetHeight}
                          normalization={adjustment.normalization}
                          onChange={(normalization) => setDraft({
                            ...draft,
                            assets: draft.assets.map((entry) => entry.id === asset.id ? { ...entry, normalization } : entry)
                          })}
                        />
                      )
                    })}
                    {selectedPet.assets.length === 0 && <p className="empty-editor-state">请通过系统文件选择框导入透明图片。</p>}
                  </div>
                </section>

                <section className="editor-section">
                  <h2>动作槽</h2>
                  <p className="supporting-copy">除空闲外均可不分配；缺失动作会使用内置安全回退。</p>
                  <ActionSlotEditor
                    assets={selectedPet.assets}
                    slots={draft.actionSlots}
                    onChange={(actionSlots) => setDraft({ ...draft, actionSlots })}
                  />
                </section>

                <div className="editor-actions">
                  <button type="button" className="secondary-button" disabled={isBusy} onClick={saveDraft}>保存配置</button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isBusy || draft.actionSlots.idle.length === 0}
                    title={draft.actionSlots.idle.length === 0 ? '请先为宠物分配至少一张空闲素材' : undefined}
                    onClick={activateDraft}
                  >
                    {snapshot.activePetId === draft.id ? '保存并保持当前宠物' : '保存并设为当前宠物'}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-editor-state">创建或选择一个宠物后开始配置。</div>
            )}
          </section>
        </div>
      )}

      {settings && restSnapshot && (
        <section className="settings-sections phase-two-foundation phase-three-settings">
          <article className="settings-card">
            <h2>桌面显示</h2>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={settings.petWindow.visible}
                disabled={isBusy}
                onChange={updatePetVisibility}
              />
              <span>显示桌面宠物</span>
            </label>
          </article>
          <article className="settings-card">
            <h2>随系统登录启动</h2>
            {autostartStatus ? (
              <>
                <label className="toggle-control">
                  <input
                    type="checkbox"
                    checked={autostartStatus.requested}
                    disabled={isBusy || !autostartStatus.supported}
                    onChange={updateAutostart}
                  />
                  <span>开机后自动运行 Dear Companion</span>
                </label>
                {!autostartStatus.supported && (
                  <p className="supporting-copy">仅安装后的 Windows 与 macOS 应用支持；开发模式不会写入系统启动项。</p>
                )}
                {autostartStatus.errorCode && (
                  <p className="inline-status-error" role="status">
                    开机启动设置未能完成（{autostartErrorMessage(autostartStatus.errorCode)}）。原设置已尽量保留。
                  </p>
                )}
              </>
            ) : <p className="supporting-copy">正在读取系统状态…</p>}
          </article>
          {petRendererStatus?.state === 'safe-mode' && (
            <article className="settings-card recovery-card">
              <h2>宠物窗口已进入安全模式</h2>
              <p className="supporting-copy">宠物渲染连续失败，应用已停止自动重建；提醒、设置和托盘仍然可用。</p>
              <button type="button" className="secondary-button" disabled={isBusy} onClick={retryPetRenderer}>
                重试宠物窗口
              </button>
            </article>
          )}
          <article className="settings-card">
            <div className="editor-heading-row"><div><h2>提醒</h2><p className="supporting-copy">首次安装不会自动创建提醒。</p></div>
              {!reminderDraft && <button type="button" className="primary-button" disabled={isBusy} onClick={newReminder}>添加提醒</button>}
            </div>
            {restSnapshot.runtime.serviceStatus === 'error' && <div className="service-error" role="alert"><span>{restSnapshot.runtime.serviceError?.message ?? '提醒服务暂时不可用'}</span><button type="button" onClick={() => void runMutation(async () => applyRestSnapshot(await api.retryReminderService()))}>重试</button></div>}
            {reminderDraft ? <ReminderEditor value={reminderDraft} disabled={isBusy} onChange={setReminderDraft} onSave={saveReminder} onCancel={() => setReminderDraft(null)} onDelete={reminderDraft.id ? deleteReminder : undefined} /> :
              <div className="reminder-list">{restSnapshot.reminders.length === 0 ? <p className="empty-editor-state">尚未设置提醒。点击“添加提醒”后，只会创建本地草稿；保存后才会写入。</p> : restSnapshot.reminders.map((reminder) => <div className="reminder-row" key={reminder.id}><button type="button" className="reminder-summary" onClick={() => editReminder(reminder)}><strong>{String(reminder.hour).padStart(2, '0')}:{String(reminder.minute).padStart(2, '0')}</strong><span>{reminder.message}</span></button><label><input type="checkbox" checked={reminder.enabled} disabled={isBusy} onChange={() => setReminderEnabled(reminder)} />启用</label></div>)}</div>}
          </article>
          <AudioSettings audio={restSnapshot.audio} report={audioImportReport} disabled={isBusy} onImport={importAudio} onChange={updateAudioSources} />
        </section>
      )}

      <footer className="privacy-note">照片、音频和设置只保存在这台电脑上；应用不会上传素材。</footer>
    </main>
  )
}

function autostartErrorMessage(errorCode: NonNullable<AutostartStatus['errorCode']>): string {
  switch (errorCode) {
    case 'os-read-failed': return '无法读取系统状态'
    case 'os-write-failed': return '系统拒绝写入'
    case 'readback-mismatch': return '系统读回状态不一致'
    case 'settings-save-failed': return '本地偏好保存失败'
    case 'rollback-failed': return '系统状态恢复失败'
  }
}

function petToUpdateInput(pet: PetConfig): PetUpdateInput {
  return {
    id: pet.id,
    name: pet.name,
    targetHeight: pet.targetHeight,
    assets: pet.assets.map((asset) => ({
      id: asset.id,
      normalization: { ...asset.normalization }
    })),
    actionSlots: {
      idle: [...pet.actionSlots.idle],
      cute: [...pet.actionSlots.cute],
      petting: [...pet.actionSlots.petting],
      angry: [...pet.actionSlots.angry],
      crying: [...pet.actionSlots.crying],
      resting: [...pet.actionSlots.resting],
      blink: [...pet.actionSlots.blink]
    },
    actionTemplates: { ...pet.actionTemplates }
  }
}
