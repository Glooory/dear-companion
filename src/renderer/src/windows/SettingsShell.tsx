import {
  MAX_PET_TARGET_HEIGHT,
  MIN_PET_TARGET_HEIGHT,
  type AppSettings,
  type AudioImportResult,
  type AudioSourceInput,
  type AutostartStatus,
  type CompanionSystemSnapshot,
  type CreateReminderInput,
  type CreateWorkScheduleInput,
  type ImageImportResult,
  type PetConfig,
  type PetRendererStatus,
  type PetSystemSnapshot,
  type PetUpdateInput,
  type ReleaseHardeningApi,
  type ReminderSchedule,
  type RestSystemSnapshot,
  type WorkSchedule,
} from "@shared/contracts";
import { useEffect, useMemo, useState } from "react";
import { ActionSlotEditor } from "../components/ActionSlotEditor";
import { AudioSettings } from "../components/AudioSettings";
import { CompanionPreferences } from "../components/CompanionPreferences";
import { LifeStateEditor } from "../components/LifeStateEditor";
import { PetAssetEditor } from "../components/PetAssetEditor";
import {
  ReminderEditor,
  type ReminderDraft,
} from "../components/ReminderEditor";
import { WorkScheduleEditor } from "../components/WorkScheduleEditor";

interface SettingsShellProps {
  api: ReleaseHardeningApi;
}

export function SettingsShell({ api }: SettingsShellProps): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [snapshot, setSnapshot] = useState<PetSystemSnapshot | null>(null);
  const [restSnapshot, setRestSnapshot] = useState<RestSystemSnapshot | null>(
    null,
  );
  const [companionSnapshot, setCompanionSnapshot] =
    useState<CompanionSystemSnapshot | null>(null);
  const [autostartStatus, setAutostartStatus] =
    useState<AutostartStatus | null>(null);
  const [petRendererStatus, setPetRendererStatus] =
    useState<PetRendererStatus | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PetUpdateInput | null>(null);
  const [newPetName, setNewPetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<ImageImportResult | null>(
    null,
  );
  const [audioImportReport, setAudioImportReport] =
    useState<AudioImportResult | null>(null);
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(
    null,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [targetHeightText, setTargetHeightText] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "pets" | "rest" | "work" | "system"
  >("pets");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.getSettings(),
      api.getPetSystemSnapshot(),
      api.getRestSystemSnapshot(),
      api.getCompanionSystemSnapshot(),
      api.getAutostartStatus(),
      api.getPetRendererStatus(),
    ]).then(
      ([
        loadedSettings,
        loadedSnapshot,
        loadedRestSnapshot,
        loadedCompanionSnapshot,
        loadedAutostart,
        loadedRenderer,
      ]) => {
        if (cancelled) return;
        const initialPet =
          loadedSnapshot.pets.find(
            (pet) => pet.id === loadedSnapshot.activePetId,
          ) ??
          loadedSnapshot.pets[0] ??
          null;
        setSettings(loadedSettings);
        setSnapshot(loadedSnapshot);
        setRestSnapshot(loadedRestSnapshot);
        setCompanionSnapshot(loadedCompanionSnapshot);
        setAutostartStatus(loadedAutostart);
        setPetRendererStatus(loadedRenderer);
        setSelectedPetId((current) => current ?? initialPet?.id ?? null);
        setDraft(
          (current) =>
            current ?? (initialPet ? petToUpdateInput(initialPet) : null),
        );
        setTargetHeightText(
          (current) =>
            current || (initialPet ? String(initialPet.targetHeight) : ""),
        );
      },
      () => {
        if (!cancelled) setError("设置没有读取成功。请再试一次。");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, loadAttempt]);

  useEffect(
    () =>
      api.onPetSystemChanged((next) => {
        setSnapshot(next);
        setSettings((current) =>
          current
            ? {
                ...current,
                activePetId: next.activePetId,
                petWindow: next.petWindow,
                pets: next.pets,
              }
            : current,
        );
      }),
    [api],
  );

  useEffect(
    () =>
      api.onRestSystemChanged((next) => {
        setRestSnapshot(next);
        setSettings((current) =>
          current
            ? { ...current, reminders: next.reminders, audio: next.audio }
            : current,
        );
      }),
    [api],
  );

  useEffect(
    () =>
      api.onCompanionSystemChanged((next) => {
        setCompanionSnapshot(next);
        setSettings((current) =>
          current ? { ...current, workSchedules: next.workSchedules } : current,
        );
      }),
    [api],
  );

  useEffect(() => api.onPetRendererStatusChanged(setPetRendererStatus), [api]);

  const selectedPet = useMemo(
    () => snapshot?.pets.find((pet) => pet.id === selectedPetId) ?? null,
    [selectedPetId, snapshot],
  );

  const runMutation = async (operation: () => Promise<void>): Promise<void> => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await operation();
    } catch {
      setError("没有保存成功。原来的设置还在，请再试一次。");
    } finally {
      setIsBusy(false);
    }
  };

  const createPet = (): void => {
    const name = newPetName.trim();
    if (!name || name.length > 80) {
      setError("请为伙伴起一个名字（最多 80 个字）。");
      return;
    }
    void runMutation(async () => {
      const next = await api.createPet(name);
      const created = next.pets.at(-1);
      setSnapshot(next);
      setSelectedPetId(created?.id ?? null);
      setDraft(created ? petToUpdateInput(created) : null);
      setTargetHeightText(created ? String(created.targetHeight) : "");
      setNewPetName("");
    });
  };

  const importAssets = (): void => {
    if (!selectedPetId) return;
    void runMutation(async () => {
      const report = await api.chooseAndImportPetAssets(selectedPetId);
      setImportReport(report);
      const next = await api.getPetSystemSnapshot();
      setSnapshot(next);
      const nextPet = next.pets.find((pet) => pet.id === selectedPetId);
      if (nextPet) {
        setDraft((current) => mergeImportedAssetsIntoDraft(current, nextPet));
        if (!draft || draft.id !== nextPet.id)
          setTargetHeightText(String(nextPet.targetHeight));
      }
    });
  };

  const deletePet = (): void => {
    if (
      !selectedPet ||
      !window.confirm(
        `删除“${selectedPet.name}”后，它的照片也会从这台电脑中移除。继续删除吗？`,
      )
    )
      return;
    void runMutation(async () => {
      const next = await api.deletePet(selectedPet.id);
      const replacement =
        next.pets.find((pet) => pet.id === next.activePetId) ??
        next.pets[0] ??
        null;
      setSnapshot(next);
      setSelectedPetId(replacement?.id ?? null);
      setDraft(replacement ? petToUpdateInput(replacement) : null);
      setTargetHeightText(replacement ? String(replacement.targetHeight) : "");
      setImportReport(null);
      setSettings((current) =>
        current
          ? {
              ...current,
              activePetId: next.activePetId,
              pets: next.pets,
            }
          : current,
      );
    });
  };

  const selectPet = (pet: PetConfig): void => {
    if (pet.id === selectedPetId) return;
    setSelectedPetId(pet.id);
    setDraft(petToUpdateInput(pet));
    setTargetHeightText(String(pet.targetHeight));
    setImportReport(null);
  };

  const saveDraft = (): void => {
    if (!draft) return;
    const targetHeight = normalizeTargetHeight(targetHeightText);
    if (targetHeight === null) {
      setError(
        `桌面上的大小需要在 ${MIN_PET_TARGET_HEIGHT}–${MAX_PET_TARGET_HEIGHT} 之间。`,
      );
      return;
    }
    const input = { ...draft, targetHeight };
    setDraft(input);
    setTargetHeightText(String(targetHeight));
    void runMutation(async () => {
      const next = await api.updatePet(input);
      setSnapshot(next);
      const nextPet = next.pets.find((pet) => pet.id === input.id);
      if (nextPet) {
        setDraft(petToUpdateInput(nextPet));
        setTargetHeightText(String(nextPet.targetHeight));
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    });
  };

  const switchActivePet = (petId: string): void => {
    void runMutation(async () => {
      if (draft && draft.id === petId) {
        const targetHeight = normalizeTargetHeight(targetHeightText);
        if (targetHeight === null) {
          setError(
            `桌面上的大小需要在 ${MIN_PET_TARGET_HEIGHT}–${MAX_PET_TARGET_HEIGHT} 之间。`,
          );
          return;
        }
        const input = { ...draft, targetHeight };
        setDraft(input);
        setTargetHeightText(String(targetHeight));
        await api.updatePet(input);
      }
      const next = await api.setActivePet(petId);
      setSnapshot(next);
      const targetPet = next.pets.find((pet) => pet.id === petId);
      if (targetPet) {
        setSelectedPetId(targetPet.id);
        setDraft(petToUpdateInput(targetPet));
        setTargetHeightText(String(targetPet.targetHeight));
      }
      setSettings((current) =>
        current
          ? { ...current, activePetId: next.activePetId, pets: next.pets }
          : current,
      );
    });
  };

  const updatePetVisibility = (): void => {
    if (!settings) return;
    void runMutation(async () => {
      const next = await api.setPetVisibility(!settings.petWindow.visible);
      setSettings(next);
    });
  };

  const updateAutostart = (): void => {
    if (!autostartStatus) return;
    void runMutation(async () => {
      setAutostartStatus(
        await api.setAutostartEnabled(!autostartStatus.requested),
      );
    });
  };

  const retryPetRenderer = (): void => {
    void runMutation(async () => {
      setPetRendererStatus(await api.retryPetRenderer());
    });
  };

  const applyRestSnapshot = (next: RestSystemSnapshot): void => {
    setRestSnapshot(next);
    setSettings((current) =>
      current
        ? { ...current, reminders: next.reminders, audio: next.audio }
        : current,
    );
  };

  const applyCompanionSnapshot = (next: CompanionSystemSnapshot): void => {
    setCompanionSnapshot(next);
    setSettings((current) =>
      current ? { ...current, workSchedules: next.workSchedules } : current,
    );
  };

  const createWorkSchedule = (input: CreateWorkScheduleInput): void => {
    void runMutation(async () =>
      applyCompanionSnapshot(await api.createWorkSchedule(input)),
    );
  };

  const updateWorkSchedule = (input: WorkSchedule): void => {
    void runMutation(async () =>
      applyCompanionSnapshot(await api.updateWorkSchedule(input)),
    );
  };

  const deleteWorkSchedule = (id: string): void => {
    void runMutation(async () =>
      applyCompanionSnapshot(await api.deleteWorkSchedule(id)),
    );
  };

  const setWorkScheduleEnabled = (id: string, enabled: boolean): void => {
    void runMutation(async () =>
      applyCompanionSnapshot(await api.setWorkScheduleEnabled(id, enabled)),
    );
  };

  const newReminder = (): void =>
    setReminderDraft({
      hour: null,
      minute: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      restDurationMinutes: 10,
      cursorTolerance: "standard",
      message: "休息一会儿吧。",
      sounds: { reminder: false, crying: false },
      enabled: true,
    });

  const editReminder = (reminder: ReminderSchedule): void =>
    setReminderDraft({
      ...reminder,
      weekdays: [...reminder.weekdays],
      sounds: { ...reminder.sounds },
    });

  const saveReminder = (): void => {
    const draftValue = reminderDraft;
    if (!draftValue || draftValue.hour === null || draftValue.minute === null)
      return;
    const input: CreateReminderInput = {
      enabled: draftValue.enabled,
      hour: draftValue.hour,
      minute: draftValue.minute,
      weekdays: [...draftValue.weekdays],
      restDurationMinutes: draftValue.restDurationMinutes,
      cursorTolerance: draftValue.cursorTolerance,
      message: draftValue.message,
      sounds: { ...draftValue.sounds },
    };
    void runMutation(async () => {
      const next = draftValue.id
        ? await api.updateReminder({ id: draftValue.id, ...input })
        : await api.createReminder(input);
      applyRestSnapshot(next);
      setReminderDraft(null);
    });
  };

  const deleteReminder = (): void => {
    if (!reminderDraft?.id) return;
    void runMutation(async () => {
      applyRestSnapshot(await api.deleteReminder(reminderDraft.id!));
      setReminderDraft(null);
    });
  };

  const setReminderEnabled = (reminder: ReminderSchedule): void => {
    void runMutation(async () =>
      applyRestSnapshot(
        await api.setReminderEnabled(reminder.id, !reminder.enabled),
      ),
    );
  };

  const importAudio = (): void => {
    void runMutation(async () => {
      const report = await api.chooseAndImportAudio();
      setAudioImportReport(report);
      applyRestSnapshot(await api.getRestSystemSnapshot());
    });
  };

  const updateAudioSources = (input: AudioSourceInput): void => {
    void runMutation(async () =>
      applyRestSnapshot(await api.updateAudioSources(input)),
    );
  };

  return (
    <main
      className="settings-shell pet-settings-shell"
      aria-busy={
        isBusy || !settings || !snapshot || !restSnapshot || !companionSnapshot
      }
    >
      <header className="settings-header">
        <p className="eyebrow">
          <span aria-hidden="true">✦</span>
          <span>桌面伙伴</span>
        </p>
        <h1>Dear Companion</h1>
        <p className="supporting-copy">
          导入透明背景照片，让它在桌角静静陪伴你。
        </p>
      </header>

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          {!settings && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoadAttempt((value) => value + 1);
              }}
            >
              重试
            </button>
          )}
        </div>
      )}

      <nav className="settings-nav" aria-label="设置分类">
        <button
          type="button"
          className={`settings-nav-button ${activeTab === "pets" ? "active" : ""}`}
          onClick={() => setActiveTab("pets")}
        >
          <span className="settings-nav-icon" aria-hidden="true">
            🐾
          </span>
          <span>我的伙伴</span>
        </button>
        <button
          type="button"
          className={`settings-nav-button ${activeTab === "rest" ? "active" : ""}`}
          onClick={() => setActiveTab("rest")}
        >
          <span className="settings-nav-icon" aria-hidden="true">
            ⏰
          </span>
          <span>休息健康</span>
        </button>
        <button
          type="button"
          className={`settings-nav-button ${activeTab === "work" ? "active" : ""}`}
          onClick={() => setActiveTab("work")}
        >
          <span className="settings-nav-icon" aria-hidden="true">
            💼
          </span>
          <span>专注时段</span>
        </button>
        <button
          type="button"
          className={`settings-nav-button ${activeTab === "system" ? "active" : ""}`}
          onClick={() => setActiveTab("system")}
        >
          <span className="settings-nav-icon" aria-hidden="true">
            ⚙️
          </span>
          <span>通用设置</span>
        </button>
      </nav>

      {activeTab === "pets" && settings && snapshot && (
        <div className="settings-tab-content pet-settings-layout">
          <aside className="pet-list-panel" aria-label="伙伴列表">
            <h2>伙伴列表</h2>
            <div className="pet-list">
              {snapshot.pets.map((pet) => (
                <div
                  key={pet.id}
                  className={`pet-list-item ${pet.id === selectedPetId ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectPet(pet)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      selectPet(pet);
                    }
                  }}
                >
                  <span className="pet-list-item-name">{pet.name}</span>
                  <div className="pet-list-item-actions">
                    {pet.id === snapshot.activePetId ? (
                      <span className="pet-active-badge">使用中</span>
                    ) : (
                      <button
                        type="button"
                        className="pet-quick-switch-button"
                        disabled={isBusy || pet.actionSlots.idle.length === 0}
                        title={
                          pet.actionSlots.idle.length === 0
                            ? "需先导入照片才可设为桌面伙伴"
                            : "设为桌面伙伴"
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          switchActivePet(pet.id);
                        }}
                      >
                        使用
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {snapshot.pets.length === 0 && (
                <p className="supporting-copy">
                  起个名字，然后导入第一张照片吧。
                </p>
              )}
            </div>
            <label className="new-pet-control">
              <span>新伙伴名称</span>
              <input
                value={newPetName}
                maxLength={80}
                placeholder="例如：宝贝"
                onChange={(event) => setNewPetName(event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={isBusy}
              onClick={createPet}
            >
              添加伙伴
            </button>
          </aside>

          <section className="pet-editor-panel">
            {draft && selectedPet ? (
              <>
                <div className="editor-heading-row">
                  <div className="editor-title-wrap">
                    <p className="eyebrow">正在编辑</p>
                    <div className="editor-title-line">
                      <h2>{selectedPet.name}</h2>
                      {snapshot.activePetId === selectedPet.id && (
                        <span className="pet-active-badge">使用中</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isBusy}
                    onClick={importAssets}
                  >
                    导入照片
                  </button>
                </div>

                {importReport && (
                  <div className="import-report" role="status">
                    <strong>
                      已成功导入 {importReport.imported.length} 张照片
                    </strong>
                    {importReport.failures.map((failure) => (
                      <p key={`${failure.index}-${failure.code}`}>
                        第 {failure.index + 1} 张：{failure.message}
                      </p>
                    ))}
                  </div>
                )}

                <div className="pet-basic-fields">
                  <label>
                    <span>伙伴名称</span>
                    <input
                      value={draft.name}
                      maxLength={80}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.currentTarget.value })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      显示高度 ({MIN_PET_TARGET_HEIGHT}–{MAX_PET_TARGET_HEIGHT}{" "}
                      像素)
                    </span>
                    <input
                      type="number"
                      min={MIN_PET_TARGET_HEIGHT}
                      max={MAX_PET_TARGET_HEIGHT}
                      step={1}
                      inputMode="numeric"
                      value={targetHeightText}
                      onChange={(event) => {
                        const text = event.currentTarget.value;
                        setTargetHeightText(text);
                        const value = parseTargetHeight(text);
                        if (value !== null)
                          setDraft({ ...draft, targetHeight: value });
                      }}
                      onBlur={() => {
                        const value = normalizeTargetHeight(targetHeightText);
                        if (value === null) return;
                        setTargetHeightText(String(value));
                        setDraft({ ...draft, targetHeight: value });
                      }}
                    />
                  </label>
                </div>

                <section className="editor-section companion-section">
                  <h2>陪伴节奏与气泡</h2>
                  <CompanionPreferences
                    pace={draft.companionPace}
                    bubblesEnabled={draft.interactionBubblesEnabled}
                    onPaceChange={(companionPace) =>
                      setDraft({ ...draft, companionPace })
                    }
                    onBubblesChange={(interactionBubblesEnabled) =>
                      setDraft({ ...draft, interactionBubblesEnabled })
                    }
                    onPreview={(pace) => {
                      void api
                        .previewCompanionPace(pace)
                        .catch(() => setError("暂时无法预览，请稍后再试。"));
                    }}
                  />
                </section>

                <section className="editor-section">
                  <h2>日常状态与照片</h2>
                  <p className="supporting-copy">
                    首张照片已作为默认常驻姿态。更多状态可按需添加。
                  </p>
                  <LifeStateEditor
                    petId={selectedPet.id}
                    assets={selectedPet.assets}
                    value={draft.lifeStates}
                    onChange={(lifeStates) =>
                      setDraft({ ...draft, lifeStates })
                    }
                  />
                </section>

                <section className="editor-section">
                  <h2>情境照片分配</h2>
                  <p className="supporting-copy">为平时陪伴和休息设置照片。</p>
                  <ActionSlotEditor
                    petId={selectedPet.id}
                    assets={selectedPet.assets}
                    slots={draft.actionSlots}
                    onChange={(actionSlots) =>
                      setDraft({ ...draft, actionSlots })
                    }
                  />
                </section>

                <details className="editor-disclosure">
                  <summary>精细调整（尺寸、位置与抚摸感应区）</summary>
                  <p className="supporting-copy">
                    微调大小、站立脚底线和头部感应区。不会修改原图。
                  </p>
                  <div className="asset-editor-list">
                    {selectedPet.assets.map((asset) => {
                      const adjustment = draft.assets.find(
                        (entry) => entry.id === asset.id,
                      );
                      if (!adjustment) return null;
                      return (
                        <PetAssetEditor
                          key={asset.id}
                          petId={selectedPet.id}
                          asset={asset}
                          targetHeight={draft.targetHeight}
                          normalization={adjustment.normalization}
                          headHotspot={adjustment.headHotspot}
                          onChange={(normalization) =>
                            setDraft({
                              ...draft,
                              assets: draft.assets.map((entry) =>
                                entry.id === asset.id
                                  ? { ...entry, normalization }
                                  : entry,
                              ),
                            })
                          }
                          onHeadHotspotChange={(headHotspot) =>
                            setDraft({
                              ...draft,
                              assets: draft.assets.map((entry) =>
                                entry.id === asset.id
                                  ? { ...entry, headHotspot }
                                  : entry,
                              ),
                            })
                          }
                        />
                      );
                    })}
                    {selectedPet.assets.length === 0 && (
                      <p className="empty-editor-state">
                        暂无照片。点击上方“导入照片”开始。
                      </p>
                    )}
                  </div>
                </details>

                <div className="editor-actions">
                  <button
                    type="button"
                    className="danger-button"
                    disabled={isBusy}
                    onClick={deletePet}
                  >
                    删除伙伴
                  </button>
                  <button
                    type="button"
                    className={`primary-button ${saveSuccess ? "saved" : ""}`}
                    disabled={isBusy}
                    onClick={saveDraft}
                  >
                    {saveSuccess ? "已保存 ✓" : "保存设置"}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-editor-state">
                请在左侧选择一个伙伴，或点击下方添加新伙伴。
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "rest" && settings && restSnapshot && (
        <section className="settings-tab-content settings-sections">
          <article className="settings-card">
            <div className="editor-heading-row">
              <div>
                <h2>休息提醒</h2>
                <p className="supporting-copy">
                  按设定的时间提醒起身活动或喝水。默认保持静音，不打扰工作。
                </p>
              </div>
              {!reminderDraft && (
                <button
                  type="button"
                  className="primary-button"
                  disabled={isBusy}
                  onClick={newReminder}
                >
                  添加休息提醒
                </button>
              )}
            </div>
            {restSnapshot.runtime.serviceStatus === "error" && (
              <div className="service-error" role="alert">
                <span>
                  {restSnapshot.runtime.serviceError?.message ??
                    "休息提醒暂时不可用。"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void runMutation(async () =>
                      applyRestSnapshot(await api.retryReminderService()),
                    )
                  }
                >
                  再试一次
                </button>
              </div>
            )}
            {reminderDraft ? (
              <ReminderEditor
                value={reminderDraft}
                disabled={isBusy}
                onChange={setReminderDraft}
                onSave={saveReminder}
                onCancel={() => setReminderDraft(null)}
                onDelete={reminderDraft.id ? deleteReminder : undefined}
              />
            ) : (
              <div className="reminder-list">
                {restSnapshot.reminders.length === 0 ? (
                  <p className="empty-editor-state">
                    暂无休息提醒。需要养成规律作息时点击右上角添加。
                  </p>
                ) : (
                  restSnapshot.reminders.map((reminder) => (
                    <div className="reminder-row" key={reminder.id}>
                      <button
                        type="button"
                        className="reminder-summary"
                        onClick={() => editReminder(reminder)}
                      >
                        <strong>
                          {String(reminder.hour).padStart(2, "0")}:
                          {String(reminder.minute).padStart(2, "0")}
                        </strong>
                        <span>{reminder.message}</span>
                      </button>
                      <label
                        className="toggle-control"
                        style={{ marginBottom: 0 }}
                      >
                        <input
                          type="checkbox"
                          checked={reminder.enabled}
                          disabled={isBusy}
                          onChange={() => setReminderEnabled(reminder)}
                        />
                        <span>启用</span>
                      </label>
                    </div>
                  ))
                )}
              </div>
            )}
          </article>
          <AudioSettings
            audio={restSnapshot.audio}
            report={audioImportReport}
            disabled={isBusy}
            onImport={importAudio}
            onChange={updateAudioSources}
          />
        </section>
      )}

      {activeTab === "work" && companionSnapshot && (
        <section className="settings-tab-content settings-sections">
          <WorkScheduleEditor
            schedules={companionSnapshot.workSchedules}
            disabled={isBusy}
            onCreate={createWorkSchedule}
            onUpdate={updateWorkSchedule}
            onDelete={deleteWorkSchedule}
            onToggle={setWorkScheduleEnabled}
          />
        </section>
      )}

      {activeTab === "system" && settings && (
        <section className="settings-tab-content settings-sections">
          <article className="settings-card">
            <h2>桌面显示</h2>
            <p className="supporting-copy">
              隐藏后视窗将暂停渲染与动效，可随时从系统托盘唤出。
            </p>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={settings.petWindow.visible}
                disabled={isBusy}
                onChange={updatePetVisibility}
              />
              <span>在桌面上显示伙伴</span>
            </label>
          </article>
          <article className="settings-card">
            <h2>开机自启动</h2>
            {autostartStatus ? (
              <>
                <label className="toggle-control">
                  <input
                    type="checkbox"
                    checked={autostartStatus.requested}
                    disabled={isBusy || !autostartStatus.supported}
                    onChange={updateAutostart}
                  />
                  <span>开机时自动启动应用</span>
                </label>
                {!autostartStatus.supported && (
                  <p className="supporting-copy">
                    仅在安装后的正式版本中生效；开发调试模式不会写入系统启动项。
                  </p>
                )}
                {autostartStatus.errorCode && (
                  <p className="inline-status-error" role="status">
                    自启动设置失败（
                    {autostartErrorMessage(autostartStatus.errorCode)}
                    ）。原设置保持不变。
                  </p>
                )}
              </>
            ) : (
              <p className="supporting-copy">正在读取自启动状态…</p>
            )}
          </article>
          {petRendererStatus?.state === "safe-mode" && (
            <article className="settings-card recovery-card">
              <h2>伙伴视窗恢复</h2>
              <p className="supporting-copy">
                伙伴视窗因屏幕分辨率调整或系统渲染异常暂停重试。设置与提醒仍正常运行。
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={retryPetRenderer}
              >
                重新唤醒伙伴视窗
              </button>
            </article>
          )}
        </section>
      )}

      <footer className="privacy-note">
        🔒 所有照片、声音及设置均仅保存在本地设备，完全离线运行，保护隐私。
      </footer>
    </main>
  );
}

function autostartErrorMessage(
  errorCode: NonNullable<AutostartStatus["errorCode"]>,
): string {
  switch (errorCode) {
    case "os-read-failed":
      return "无法读取系统状态";
    case "os-write-failed":
      return "系统拒绝写入";
    case "readback-mismatch":
      return "系统读回状态不一致";
    case "settings-save-failed":
      return "本地偏好保存失败";
    case "rollback-failed":
      return "系统状态恢复失败";
  }
}

function petToUpdateInput(pet: PetConfig): PetUpdateInput {
  return {
    id: pet.id,
    name: pet.name,
    targetHeight: pet.targetHeight,
    assets: pet.assets.map((asset) => ({
      id: asset.id,
      normalization: { ...asset.normalization },
      headHotspot: asset.headHotspot ? { ...asset.headHotspot } : null,
    })),
    actionSlots: {
      idle: [...pet.actionSlots.idle],
      resting: [...pet.actionSlots.resting],
    },
    actionTemplates: { ...pet.actionTemplates },
    lifeStates: {
      drowsy: {
        enabled: pet.lifeStates.drowsy.enabled,
        assetIds: [...pet.lifeStates.drowsy.assetIds],
      },
      sleeping: {
        enabled: pet.lifeStates.sleeping.enabled,
        assetIds: [...pet.lifeStates.sleeping.assetIds],
      },
      workingAssetIds: [...pet.lifeStates.workingAssetIds],
    },
    companionPace: pet.companionPace,
    interactionBubblesEnabled: pet.interactionBubblesEnabled,
  };
}

function mergeImportedAssetsIntoDraft(
  current: PetUpdateInput | null,
  persistedPet: PetConfig,
): PetUpdateInput {
  const persisted = petToUpdateInput(persistedPet);
  if (!current || current.id !== persistedPet.id) return persisted;
  const existingAdjustments = new Map(
    current.assets.map((asset) => [asset.id, asset]),
  );
  return {
    ...current,
    actionSlots:
      current.actionSlots.idle.length === 0 &&
      persisted.actionSlots.idle.length > 0
        ? { ...current.actionSlots, idle: [...persisted.actionSlots.idle] }
        : current.actionSlots,
    assets: persisted.assets.map((asset) => {
      const existing = existingAdjustments.get(asset.id);
      return existing
        ? {
            id: existing.id,
            normalization: { ...existing.normalization },
            headHotspot: existing.headHotspot
              ? { ...existing.headHotspot }
              : null,
          }
        : asset;
    }),
  };
}

function parseTargetHeight(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    parsed >= MIN_PET_TARGET_HEIGHT &&
    parsed <= MAX_PET_TARGET_HEIGHT
    ? Math.round(parsed)
    : null;
}

function normalizeTargetHeight(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(
    Math.min(Math.max(parsed, MIN_PET_TARGET_HEIGHT), MAX_PET_TARGET_HEIGHT),
  );
}
