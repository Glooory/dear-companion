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
  type CursorTolerance,
  type ImageImportResult,
  type PetConfig,
  type PetRendererStatus,
  type PetSystemSnapshot,
  type PetUpdateInput,
  type ReleaseHardeningApi,
  type ReminderSchedule,
  type RestSystemSnapshot,
  type SettingsNavigationTarget,
  type Weekday,
  type WorkSchedule,
} from "@shared/contracts";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AudioSettings } from "../components/AudioSettings";
import { CompanionBehaviorEditor } from "../components/CompanionBehaviorEditor";
import { CompanionPreferences } from "../components/CompanionPreferences";
import { PetGalleryManager } from "../components/PetGalleryManager";
import {
  ReminderEditor,
  type ReminderDraft,
} from "../components/ReminderEditor";
import { WorkScheduleEditor } from "../components/WorkScheduleEditor";
import { InfoTooltip, Tooltip } from "../components/Tooltip";

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
  const [isCreatingPet, setIsCreatingPet] = useState(false);
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
      setIsCreatingPet(false);
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

  const deleteAsset = (assetId: string): void => {
    if (!selectedPet) return;
    if (selectedPet.id === snapshot?.activePetId && selectedPet.assets.length <= 1) {
      setError("使用中的伙伴需至少保留一张照片。");
      return;
    }
    const targetAssetIndex = selectedPet.assets.findIndex((a) => a.id === assetId);
    const label = targetAssetIndex >= 0 ? `照片 ${targetAssetIndex + 1}` : "这张照片";
    if (!window.confirm(`确定要删除“${selectedPet.name}”的${label}吗？`)) return;

    void runMutation(async () => {
      const next = await api.deletePetAsset(selectedPet.id, assetId);
      setSnapshot(next);
      const nextPet = next.pets.find((pet) => pet.id === selectedPet.id);
      if (nextPet) {
        setDraft(petToUpdateInput(nextPet));
      }
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
    if (!draft || !selectedPet) return;
    if (selectedPet.assets.length === 0) {
      setError("需先导入照片才可保存设置。");
      return;
    }
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

  useEffect(() => {
    if (!reminderDraft) return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setReminderDraft(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reminderDraft]);

  useEffect(() => {
    const handleTarget = (target: SettingsNavigationTarget | null): void => {
      if (!target) return;
      setActiveTab(target.tab);
      if (target.tab === "rest" && target.action === "new-reminder") {
        newReminder();
      }
    };

    void api.getSettingsNavigationTarget().then((target) => {
      handleTarget(target);
    });

    const unsubscribe = api.onSettingsNavigationRequested((target) => {
      handleTarget(target);
    });

    return () => {
      unsubscribe();
    };
  }, [api]);

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
      <header className="settings-topbar">
        <div className="settings-brand">
          <span className="brand-logo-mark" aria-hidden="true">✦</span>
          <span className="brand-title">Dear Companion</span>
          <span className="brand-badge">本地离线</span>
        </div>

        <nav className="settings-nav" aria-label="设置分类">
          <button
            type="button"
            className={`settings-nav-button ${activeTab === "pets" ? "active" : ""}`}
            onClick={() => setActiveTab("pets")}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 14c-2.5 0-4-1.5-4-3.5 0-1.8 1.5-3 4-3s4 1.2 4 3c0 2-1.5 3.5-4 3.5z" />
              <circle cx="6" cy="5.5" r="1.5" />
              <circle cx="14" cy="5.5" r="1.5" />
              <circle cx="3.5" cy="9.5" r="1.3" />
              <circle cx="16.5" cy="9.5" r="1.3" />
            </svg>
            <span>我的伙伴</span>
          </button>
          <button
            type="button"
            className={`settings-nav-button ${activeTab === "rest" ? "active" : ""}`}
            onClick={() => setActiveTab("rest")}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" />
              <polyline points="10,6 10,10 13,12" />
            </svg>
            <span>休息健康</span>
          </button>
          <button
            type="button"
            className={`settings-nav-button ${activeTab === "work" ? "active" : ""}`}
            onClick={() => setActiveTab("work")}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="6" width="14" height="11" rx="2" />
              <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6" />
              <path d="M3 11h14" />
            </svg>
            <span>专注时段</span>
          </button>
          <button
            type="button"
            className={`settings-nav-button ${activeTab === "system" ? "active" : ""}`}
            onClick={() => setActiveTab("system")}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="3" />
              <path d="M16.2 12.3a1 1 0 0 0 .2 1.1l.6.6a1.2 1.2 0 0 1-1.7 1.7l-.6-.6a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.9a1.2 1.2 0 0 1-2.4 0v-.9a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.6.6a1.2 1.2 0 0 1-1.7-1.7l.6-.6a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3.8a1.2 1.2 0 0 1 0-2.4h.9a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.6-.6a1.2 1.2 0 0 1 1.7-1.7l.6.6a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V3.8a1.2 1.2 0 0 1 2.4 0v.9a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.6-.6a1.2 1.2 0 0 1 1.7 1.7l-.6.6a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.9a1.2 1.2 0 0 1 0 2.4h-.9a1 1 0 0 0-.9.6z" />
            </svg>
            <span>通用设置</span>
          </button>
        </nav>
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

      {activeTab === "pets" && settings && snapshot && (
        <div className="settings-tab-content pet-settings-layout">
          <aside className="pet-list-panel" aria-label="伙伴列表">
            <div className="panel-header-row">
              <h2>伙伴列表</h2>
              <span className="count-pill">{snapshot.pets.length}</span>
            </div>

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
                  还没有添加伙伴。
                </p>
              )}
            </div>

            {isCreatingPet ? (
              <div className="new-pet-form">
                <input
                  autoFocus
                  value={newPetName}
                  maxLength={80}
                  placeholder="新伙伴名称"
                  onChange={(event) => setNewPetName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") createPet();
                    if (event.key === "Escape") {
                      setIsCreatingPet(false);
                      setNewPetName("");
                    }
                  }}
                />
                <div className="new-pet-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setIsCreatingPet(false);
                      setNewPetName("");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isBusy || !newPetName.trim()}
                    onClick={createPet}
                  >
                    添加
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="add-pet-trigger"
                disabled={isBusy}
                onClick={() => setIsCreatingPet(true)}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="8" y1="3" x2="8" y2="13" />
                  <line x1="3" y1="8" x2="13" y2="8" />
                </svg>
                <span>添加伙伴</span>
              </button>
            )}
          </aside>

          <section className="pet-editor-panel">
            {draft && selectedPet ? (
              <>
                <div className="editor-heading-row">
                  <div className="editor-title-wrap">
                    <div className="editor-title-line">
                      <h2>{selectedPet.name}</h2>
                      {snapshot.activePetId === selectedPet.id && (
                        <span className="pet-active-badge">当前使用</span>
                      )}
                    </div>
                  </div>
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
                    <span className="field-label-row">
                      <span>伙伴名称</span>
                    </span>
                    <input
                      value={draft.name}
                      maxLength={80}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.currentTarget.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="field-label-row">
                      <span>显示高度</span>
                      <InfoTooltip text={`桌面显示高度，建议 180–240 px（支持 ${MIN_PET_TARGET_HEIGHT}–${MAX_PET_TARGET_HEIGHT} px）。`} />
                    </span>
                    <div className="unit-input-wrap">
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
                      <span className="unit-suffix">px</span>
                    </div>
                  </label>
                </div>

                <section className="editor-section companion-section">
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

                <PetGalleryManager
                  petId={selectedPet.id}
                  assets={selectedPet.assets}
                  targetHeight={draft.targetHeight}
                  assetAdjustments={draft.assets}
                  isActivePet={selectedPet.id === snapshot?.activePetId}
                  onImport={importAssets}
                  onDeleteAsset={deleteAsset}
                  isBusy={isBusy}
                  onUpdateNormalization={(assetId, normalization) =>
                    setDraft({
                      ...draft,
                      assets: draft.assets.map((entry) =>
                        entry.id === assetId ? { ...entry, normalization } : entry,
                      ),
                    })
                  }
                  onUpdateHeadHotspot={(assetId, headHotspot) =>
                    setDraft({
                      ...draft,
                      assets: draft.assets.map((entry) =>
                        entry.id === assetId ? { ...entry, headHotspot } : entry,
                      ),
                    })
                  }
                />

                <section className="editor-section">
                  <div className="heading-with-tooltip" style={{ marginBottom: "12px" }}>
                    <h2>日常姿态与场景</h2>
                    <InfoTooltip text="为不同生活情境分配照片。未指定的项目会自动沿用平时陪伴照片。" />
                  </div>
                  <CompanionBehaviorEditor
                    petId={selectedPet.id}
                    assets={selectedPet.assets}
                    slots={draft.actionSlots}
                    lifeStates={draft.lifeStates}
                    onSlotsChange={(actionSlots) =>
                      setDraft({ ...draft, actionSlots })
                    }
                    onLifeStatesChange={(lifeStates) =>
                      setDraft({ ...draft, lifeStates })
                    }
                  />
                </section>

                <div className="editor-actions">
                  <button
                    type="button"
                    className="danger-button"
                    disabled={isBusy}
                    onClick={deletePet}
                  >
                    删除伙伴
                  </button>
                  <Tooltip
                    content="需先导入照片才可保存设置"
                    position="top-end"
                    disabled={selectedPet.assets.length > 0}
                  >
                    <button
                      type="button"
                      className={`primary-button ${saveSuccess ? "saved" : ""}`}
                      disabled={isBusy || selectedPet.assets.length === 0}
                      onClick={saveDraft}
                    >
                      {saveSuccess ? "已保存 ✓" : "保存设置"}
                    </button>
                  </Tooltip>
                </div>
              </>
            ) : (
              <div className="empty-editor-state">
                请选择或新建一个伙伴。
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "rest" && settings && restSnapshot && (
        <section className="settings-tab-content settings-sections">
          <article className="settings-card">
            <div className="editor-heading-row">
              <div className="heading-with-tooltip">
                <h2>休息提醒</h2>
                <InfoTooltip text="按设定时间提醒起身活动或喝水。默认保持静音，不打扰工作。" />
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={isBusy}
                onClick={newReminder}
              >
                添加休息提醒
              </button>
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
            <div className="reminder-list">
              {restSnapshot.reminders.length === 0 ? (
                <p className="empty-editor-state">
                  暂无休息提醒。
                </p>
              ) : (
                restSnapshot.reminders.map((reminder) => {
                  const soundBadge = formatSoundBadge(reminder.sounds);
                  return (
                    <div
                      className={`reminder-row ${reminder.enabled ? "" : "reminder-disabled"}`}
                      key={reminder.id}
                    >
                      <div
                        className="reminder-content"
                        role="button"
                        tabIndex={0}
                        onClick={() => editReminder(reminder)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            editReminder(reminder);
                          }
                        }}
                      >
                        <div className="reminder-primary-row">
                          <strong className="reminder-time">
                            {String(reminder.hour).padStart(2, "0")}:
                            {String(reminder.minute).padStart(2, "0")}
                          </strong>
                          <span className="reminder-message">{reminder.message}</span>
                        </div>
                        <div className="reminder-badges">
                          <span className="reminder-badge">{formatReminderWeekdays(reminder.weekdays)}</span>
                          <span className="reminder-badge">{reminder.restDurationMinutes} 分钟休息</span>
                          <span className={`reminder-badge ${soundBadge.enabled ? "badge-sound-on" : "badge-sound-off"}`}>
                            {soundBadge.label}
                          </span>
                          <span className="reminder-badge">{formatTolerance(reminder.cursorTolerance)}</span>
                        </div>
                      </div>
                      <div className="reminder-actions">
                        <button
                          type="button"
                          className="reminder-edit-button"
                          onClick={() => editReminder(reminder)}
                          title="编辑此条提醒"
                        >
                          编辑 ›
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
                    </div>
                  );
                })
              )}
            </div>
          </article>
          <AudioSettings
            audio={restSnapshot.audio}
            report={audioImportReport}
            disabled={isBusy}
            onImport={importAudio}
            onChange={updateAudioSources}
          />
          {reminderDraft &&
            createPortal(
              <div
                className="modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reminder-modal-title"
                onClick={(event) => {
                  if (event.target === event.currentTarget) setReminderDraft(null);
                }}
              >
                <div className="modal-card">
                  <div className="modal-header">
                    <h3 id="reminder-modal-title">
                      {reminderDraft.id
                        ? `编辑休息提醒 · ${String(reminderDraft.hour ?? 0).padStart(2, "0")}:${String(reminderDraft.minute ?? 0).padStart(2, "0")}`
                        : "添加休息提醒"}
                    </h3>
                    <button
                      type="button"
                      className="modal-close-button"
                      onClick={() => setReminderDraft(null)}
                      aria-label="关闭"
                    >
                      ✕
                    </button>
                  </div>
                  <ReminderEditor
                    value={reminderDraft}
                    disabled={isBusy}
                    onChange={setReminderDraft}
                    onSave={saveReminder}
                    onCancel={() => setReminderDraft(null)}
                    onDelete={reminderDraft.id ? deleteReminder : undefined}
                  />
                </div>
              </div>,
              document.body,
            )}
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
            <div className="settings-row-between">
              <div>
                <div className="heading-with-tooltip">
                  <h2>桌面显示</h2>
                  <InfoTooltip text="隐藏后伙伴暂时离开桌面，可随时从系统托盘唤出。" />
                </div>
                <p className="supporting-copy">在桌面上显示伙伴</p>
              </div>
              <label className="toggle-control" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={settings.petWindow.visible}
                  disabled={isBusy}
                  onChange={updatePetVisibility}
                />
                <span>显示伙伴</span>
              </label>
            </div>
          </article>
          <article className="settings-card">
            <div className="settings-row-between">
              <div>
                <div className="heading-with-tooltip">
                  <h2>开机自启动</h2>
                  <InfoTooltip text="电脑开机后自动在后台启动应用并常驻托盘。" />
                </div>
                {!autostartStatus?.supported && (
                  <p className="supporting-copy">
                    开发调试模式下不写入系统启动项，仅在安装版本中生效。
                  </p>
                )}
              </div>
              {autostartStatus ? (
                <label className="toggle-control" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={autostartStatus.requested}
                    disabled={isBusy || !autostartStatus.supported}
                    onChange={updateAutostart}
                  />
                  <span>开机启动</span>
                </label>
              ) : (
                <span className="supporting-copy">读取中…</span>
              )}
            </div>
            {autostartStatus?.errorCode && (
              <p className="inline-status-error" role="status">
                自启动设置失败（
                {autostartErrorMessage(autostartStatus.errorCode)}
                ）。原设置保持不变。
              </p>
            )}
          </article>
          {petRendererStatus?.state === "safe-mode" && (
            <article className="settings-card recovery-card">
              <h2>伙伴窗口恢复</h2>
              <p className="supporting-copy">
                受屏幕分辨率或系统渲染影响暂时停用，设置与提醒仍正常运行。
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={retryPetRenderer}
              >
                恢复伙伴窗口
              </button>
            </article>
          )}
        </section>
      )}

      <footer className="settings-footer">
        <span>全本地离线运行 · 数据安全保存在此设备</span>
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

function formatReminderWeekdays(weekdays: readonly Weekday[]): string {
  if (weekdays.length === 7) return "每天";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d as Weekday))) return "工作日";
  if (weekdays.length === 2 && [0, 6].every((d) => weekdays.includes(d as Weekday))) return "周末";
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return weekdays
    .slice()
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => names[d])
    .join("、");
}

function formatTolerance(tolerance: CursorTolerance): string {
  switch (tolerance) {
    case "sensitive":
      return "轻微移动即提醒";
    case "relaxed":
      return "明显移动才提醒";
    default:
      return "适度移动后提醒";
  }
}

function formatSoundBadge(sounds: { reminder: boolean; crying: boolean }): { label: string; enabled: boolean } {
  if (sounds.reminder && sounds.crying) return { label: "🔔 提示音+督促音", enabled: true };
  if (sounds.reminder) return { label: "🔔 提示音开启", enabled: true };
  if (sounds.crying) return { label: "🔔 督促音开启", enabled: true };
  return { label: "🔕 静音", enabled: false };
}

