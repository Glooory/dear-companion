import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import {
  MAX_PET_TARGET_HEIGHT,
  MIN_PET_TARGET_HEIGHT,
  type AppSettings,
  type AudioSourceInput,
  type AutostartStatus,
  type CompanionSystemSnapshot,
  type CreateReminderInput,
  type CreateWorkScheduleInput,
  type CursorTolerance,
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
import type { DialogueGroupId } from "@shared/dialogue-catalog";
import { ADDRESS_PLACEHOLDER, clonePetDialogueSettings, getDialogueValidationIssues } from "@shared/dialogue-settings";
import { AudioSettings } from "../components/AudioSettings";
import { CompanionBehaviorEditor } from "../components/CompanionBehaviorEditor";
import { CompanionPreferences } from "../components/CompanionPreferences";
import { DialogueSettingsEditor } from "../components/DialogueSettingsEditor";
import { PetGalleryManager } from "../components/PetGalleryManager";
import { createDraftWindow, ReminderEditor, type ReminderDraft } from "../components/ReminderEditor";
import { useToast } from "../components/Toast";
import { InfoTooltip, Tooltip } from "../components/Tooltip";
import { UserGuide } from "../components/UserGuide";
import { WorkScheduleEditor } from "../components/WorkScheduleEditor";
import styles from "./SettingsShell.module.css";

interface SettingsShellProps {
  api: ReleaseHardeningApi;
}

export function SettingsShell({ api }: SettingsShellProps): React.JSX.Element {
  const toast = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [snapshot, setSnapshot] = useState<PetSystemSnapshot | null>(null);
  const [restSnapshot, setRestSnapshot] = useState<RestSystemSnapshot | null>(null);
  const [companionSnapshot, setCompanionSnapshot] = useState<CompanionSystemSnapshot | null>(null);
  const [autostartStatus, setAutostartStatus] = useState<AutostartStatus | null>(null);
  const [petRendererStatus, setPetRendererStatus] = useState<PetRendererStatus | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PetUpdateInput | null>(null);
  const [newPetName, setNewPetName] = useState("");
  const [isCreatingPet, setIsCreatingPet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [targetHeightText, setTargetHeightText] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"pets" | "rest" | "work" | "system" | "guide">("pets");
  const [petSubTab, setPetSubTab] = useState<"appearance" | "dialogues">("appearance");
  const [petDialogueGroupId, setPetDialogueGroupId] = useState<DialogueGroupId>("daily");
  const [dialogueValidationAttempt, setDialogueValidationAttempt] = useState(0);

  const selectedPet = useMemo(
    () => snapshot?.pets.find((pet) => pet.id === selectedPetId) ?? null,
    [snapshot, selectedPetId]
  );
  const activePet = useMemo(() => snapshot?.pets.find((pet) => pet.id === snapshot.activePetId) ?? null, [snapshot]);
  const hasUnsavedPetChanges = useMemo(
    () => Boolean(selectedPet && draft && JSON.stringify(petToUpdateInput(selectedPet)) !== JSON.stringify(draft)),
    [draft, selectedPet]
  );

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
          loadedSnapshot.pets.find((pet) => pet.id === loadedSnapshot.activePetId) ?? loadedSnapshot.pets[0] ?? null;
        setSettings(loadedSettings);
        setSnapshot(loadedSnapshot);
        setRestSnapshot(loadedRestSnapshot);
        setCompanionSnapshot(loadedCompanionSnapshot);
        setAutostartStatus(loadedAutostart);
        setPetRendererStatus(loadedRenderer);
        setSelectedPetId((current) => current ?? initialPet?.id ?? null);
        setDraft((current) => current ?? (initialPet ? petToUpdateInput(initialPet) : null));
        setTargetHeightText((current) => current || (initialPet ? String(initialPet.targetHeight) : ""));
      },
      () => {
        if (!cancelled) setError("设置没有读取成功。请再试一次。");
      }
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
            : current
        );
      }),
    [api]
  );

  useEffect(
    () =>
      api.onRestSystemChanged((next) => {
        setRestSnapshot(next);
        setSettings((current) => (current ? { ...current, reminders: next.reminders, audio: next.audio } : current));
      }),
    [api]
  );

  useEffect(
    () =>
      api.onCompanionSystemChanged((next) => {
        setCompanionSnapshot(next);
        setSettings((current) => (current ? { ...current, workSchedules: next.workSchedules } : current));
      }),
    [api]
  );

  useEffect(() => api.onPetRendererStatusChanged(setPetRendererStatus), [api]);

  const runMutation = async (operation: () => Promise<void>): Promise<void> => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await operation();
    } catch (err) {
      console.error("Mutation failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setIsBusy(false);
    }
  };

  const createPet = (): void => {
    const name = newPetName.trim();
    if (!name || name.length > 80) {
      toast.warning("请输入伙伴名称，最多 80 个字。");
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
      setPetSubTab("appearance");
      toast.success(`已添加伙伴“${name}”`);
    });
  };

  const importAssets = (): void => {
    if (!selectedPetId) return;
    void runMutation(async () => {
      const report = await api.chooseAndImportPetAssets(selectedPetId);
      if (report.failures.length === 0) {
        toast.success(`已导入 ${report.imported.length} 张照片`);
      } else if (report.imported.length === 0) {
        const firstFailure = report.failures[0];
        toast.error(
          report.failures.length === 1 && firstFailure
            ? `照片导入失败：${firstFailure.message}`
            : `照片导入失败（共 ${report.failures.length} 张失败）`,
          {
            details:
              report.failures.length > 1 ? report.failures.map((f) => `第 ${f.index + 1} 张：${f.message}`) : undefined,
          }
        );
      } else {
        toast.warning(`已导入 ${report.imported.length} 张照片，${report.failures.length} 张导入失败`, {
          details: report.failures.map((f) => `第 ${f.index + 1} 张：${f.message}`),
        });
      }
      const next = await api.getPetSystemSnapshot();
      setSnapshot(next);
      const nextPet = next.pets.find((pet) => pet.id === selectedPetId);
      if (nextPet) {
        setDraft((current) => mergeImportedAssetsIntoDraft(current, nextPet));
        if (!draft || draft.id !== nextPet.id) setTargetHeightText(String(nextPet.targetHeight));
      }
    });
  };

  const deletePet = (): void => {
    if (!selectedPet || !window.confirm(`删除“${selectedPet.name}”后，它的照片也会从这台电脑中移除。继续删除吗？`))
      return;
    void runMutation(async () => {
      const next = await api.deletePet(selectedPet.id);
      const replacement = next.pets.find((pet) => pet.id === next.activePetId) ?? next.pets[0] ?? null;
      setSnapshot(next);
      setSelectedPetId(replacement?.id ?? null);
      setDraft(replacement ? petToUpdateInput(replacement) : null);
      setTargetHeightText(replacement ? String(replacement.targetHeight) : "");
      setPetSubTab("appearance");
      setSettings((current) =>
        current
          ? {
              ...current,
              activePetId: next.activePetId,
              pets: next.pets,
            }
          : current
      );
      toast.success("已删除伙伴");
    });
  };

  const deleteAsset = (assetId: string): void => {
    if (!selectedPet) return;
    if (selectedPet.id === snapshot?.activePetId && selectedPet.assets.length <= 1) {
      toast.warning("使用中的伙伴需至少保留一张照片。");
      return;
    }
    const targetAssetIndex = selectedPet.assets.findIndex((a) => a.id === assetId);
    const label = targetAssetIndex >= 0 ? `照片 ${targetAssetIndex + 1}` : "这张照片";
    if (!window.confirm(`删除“${selectedPet.name}”的${label}后无法恢复。继续删除吗？`)) return;

    void runMutation(async () => {
      const next = await api.deletePetAsset(selectedPet.id, assetId);
      setSnapshot(next);
      const nextPet = next.pets.find((pet) => pet.id === selectedPet.id);
      if (nextPet) {
        setDraft(petToUpdateInput(nextPet));
      }
      toast.success("已删除照片");
    });
  };

  const selectPet = (pet: PetConfig): void => {
    if (pet.id === selectedPetId) return;
    if (selectedPetId) {
      void api.cleanupPetVoiceDrafts(selectedPetId).catch(() => undefined);
    }
    setSelectedPetId(pet.id);
    setDraft(petToUpdateInput(pet));
    setTargetHeightText(String(pet.targetHeight));
    setPetSubTab("appearance");
  };

  const saveDraft = (): void => {
    if (!draft || !selectedPet) return;
    if (selectedPet.assets.length === 0) {
      toast.warning("需先导入照片才可保存设置。");
      return;
    }
    const issues = getDialogueValidationIssues(draft.dialogueSettings);
    if (issues.length > 0) {
      setPetSubTab("dialogues");
      setDialogueValidationAttempt((prev) => prev + 1);
      toast.warning("对白设置中有需要处理的内容，请检查后再保存。");
      return;
    }
    const targetHeight = normalizeTargetHeight(targetHeightText);
    if (targetHeight === null) {
      toast.warning(`桌面上的大小需要在 ${MIN_PET_TARGET_HEIGHT}–${MAX_PET_TARGET_HEIGHT} 之间。`);
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
      toast.success("伙伴设置已保存");
    });
  };

  const handlePreviewDialogue = (line: {
    text: string;
    voiceAssetId?: string;
    voiceTrimStart?: number;
    voiceTrimEnd?: number;
  }): void => {
    if (!selectedPet || !draft) return;
    if (selectedPet.id !== snapshot?.activePetId) {
      toast.warning("当前桌面伙伴不是正在编辑的伙伴。");
      return;
    }
    if (!snapshot?.petWindow.visible) {
      toast.warning("桌面伙伴处于隐藏状态。");
      return;
    }
    if (restSnapshot?.runtime.session || restSnapshot?.runtime.prompt) {
      toast.warning("伙伴正在休息中。");
      return;
    }
    const rawText = line.text.trim();
    if (!rawText) {
      toast.warning("对白内容不能为空。");
      return;
    }
    const address = draft.dialogueSettings.address.trim();
    if (rawText.includes(ADDRESS_PLACEHOLDER) && !address) {
      toast.warning("请先在上方设置称呼，再预览包含称呼的对白。");
      return;
    }
    const resolvedText = rawText.replaceAll(ADDRESS_PLACEHOLDER, address);
    void api
      .previewDialogue({
        petId: selectedPet.id,
        text: resolvedText,
        voiceAssetId: line.voiceAssetId,
        voiceTrimStart: line.voiceTrimStart,
        voiceTrimEnd: line.voiceTrimEnd,
        voiceVolume: draft.dialogueSettings.voiceVolume,
      })
      .catch(() => toast.error("暂时无法预览，请稍后再试。"));
  };

  const switchActivePet = (petId: string): void => {
    void runMutation(async () => {
      if (draft && draft.id === petId) {
        const targetHeight = normalizeTargetHeight(targetHeightText);
        if (targetHeight === null) {
          toast.warning(`桌面上的大小需要在 ${MIN_PET_TARGET_HEIGHT}–${MAX_PET_TARGET_HEIGHT} 之间。`);
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
      setSettings((current) => (current ? { ...current, activePetId: next.activePetId, pets: next.pets } : current));
      toast.success("已切换当前伙伴");
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
    const target = !autostartStatus.requested;
    void runMutation(async () => {
      const next = await api.setAutostartEnabled(target);
      setAutostartStatus(next);
      if (next.errorCode) {
        toast.error("开机启动没有设置成功。请检查系统设置后再试一次。");
      } else {
        toast.success(target ? "已开启开机启动" : "已关闭开机启动");
      }
    });
  };

  const retryPetRenderer = (): void => {
    void runMutation(async () => {
      setPetRendererStatus(await api.retryPetRenderer());
    });
  };

  const applyRestSnapshot = (next: RestSystemSnapshot): void => {
    setRestSnapshot(next);
    setSettings((current) => (current ? { ...current, reminders: next.reminders, audio: next.audio } : current));
  };

  const applyCompanionSnapshot = (next: CompanionSystemSnapshot): void => {
    setCompanionSnapshot(next);
    setSettings((current) => (current ? { ...current, workSchedules: next.workSchedules } : current));
  };

  const createWorkSchedule = (input: CreateWorkScheduleInput): void => {
    void runMutation(async () => {
      applyCompanionSnapshot(await api.createWorkSchedule(input));
      toast.success("专注时段已添加");
    });
  };

  const updateWorkSchedule = (input: WorkSchedule): void => {
    void runMutation(async () => {
      applyCompanionSnapshot(await api.updateWorkSchedule(input));
      toast.success("专注时段已更新");
    });
  };

  const deleteWorkSchedule = (id: string): void => {
    void runMutation(async () => {
      applyCompanionSnapshot(await api.deleteWorkSchedule(id));
      toast.success("专注时段已删除");
    });
  };

  const setWorkScheduleEnabled = (id: string, enabled: boolean): void => {
    void runMutation(async () => applyCompanionSnapshot(await api.setWorkScheduleEnabled(id, enabled)));
  };

  const newReminder = (): void =>
    setReminderDraft({
      mode: "fixed",
      hour: null,
      minute: null,
      windows: [createDraftWindow()],
      intervalMinutes: 60,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      restDurationMinutes: 10,
      cursorTolerance: "standard",
      message: "休息一会儿吧。",
      sounds: { reminder: false, crying: false },
      enabled: true,
    });

  const editReminder = (reminder: ReminderSchedule): void =>
    setReminderDraft({
      id: reminder.id,
      mode: reminder.mode,
      hour: reminder.mode === "fixed" ? reminder.hour : null,
      minute: reminder.mode === "fixed" ? reminder.minute : null,
      windows: reminder.mode === "interval" ? reminder.windows.map((w) => createDraftWindow(w)) : [createDraftWindow()],
      intervalMinutes: reminder.mode === "interval" ? reminder.intervalMinutes : 60,
      weekdays: [...reminder.weekdays],
      restDurationMinutes: reminder.restDurationMinutes,
      cursorTolerance: reminder.cursorTolerance,
      message: reminder.message,
      sounds: { ...reminder.sounds },
      voiceAssetId: reminder.voiceAssetId,
      voiceTrimStart: reminder.voiceTrimStart,
      voiceTrimEnd: reminder.voiceTrimEnd,
      enabled: reminder.enabled,
    });

  const handleReminderValidationError = (): void => {
    toast.warning("请检查提醒设置中的填写项。");
  };

  const saveReminder = (): void => {
    const draftValue = reminderDraft;
    if (!draftValue) return;

    let timingInput:
      | { mode: "fixed"; hour: number; minute: number }
      | {
          mode: "interval";
          windows: { startHour: number; startMinute: number; endHour: number; endMinute: number }[];
          intervalMinutes: number;
        };

    if (draftValue.mode === "fixed") {
      if (draftValue.hour === null || draftValue.minute === null) return;
      timingInput = {
        mode: "fixed",
        hour: draftValue.hour,
        minute: draftValue.minute,
      };
    } else {
      if (
        draftValue.windows.length === 0 ||
        draftValue.windows.some(
          (w) => w.startHour === null || w.startMinute === null || w.endHour === null || w.endMinute === null
        )
      ) {
        return;
      }
      timingInput = {
        mode: "interval",
        windows: draftValue.windows.map(({ startHour, startMinute, endHour, endMinute }) => ({
          startHour: startHour!,
          startMinute: startMinute!,
          endHour: endHour!,
          endMinute: endMinute!,
        })),
        intervalMinutes: draftValue.intervalMinutes,
      };
    }

    const input: CreateReminderInput = {
      ...timingInput,
      enabled: draftValue.enabled,
      weekdays: [...draftValue.weekdays],
      restDurationMinutes: draftValue.restDurationMinutes,
      cursorTolerance: draftValue.cursorTolerance,
      message: draftValue.message,
      sounds: { ...draftValue.sounds },
      voiceAssetId: draftValue.voiceAssetId,
      voiceTrimStart: draftValue.voiceTrimStart,
      voiceTrimEnd: draftValue.voiceTrimEnd,
    };

    void runMutation(async () => {
      const isEditing = Boolean(draftValue.id);
      const next = draftValue.id
        ? await api.updateReminder({ id: draftValue.id, ...input })
        : await api.createReminder(input);
      applyRestSnapshot(next);
      setReminderDraft(null);
      toast.success(isEditing ? "休息提醒已更新" : "休息提醒已创建");
    });
  };

  const deleteReminder = (): void => {
    if (!reminderDraft?.id) return;
    void runMutation(async () => {
      applyRestSnapshot(await api.deleteReminder(reminderDraft.id!));
      setReminderDraft(null);
      toast.success("休息提醒已删除");
    });
  };

  const setReminderEnabled = (reminder: ReminderSchedule): void => {
    void runMutation(async () => applyRestSnapshot(await api.setReminderEnabled(reminder.id, !reminder.enabled)));
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
      if (report.failures.length === 0) {
        toast.success(`已导入 ${report.imported.length} 个声音文件`);
      } else if (report.imported.length === 0) {
        const firstFailure = report.failures[0];
        toast.error(
          report.failures.length === 1 && firstFailure
            ? `声音导入失败：${firstFailure.message}`
            : `声音导入失败（共 ${report.failures.length} 个失败）`,
          {
            details:
              report.failures.length > 1 ? report.failures.map((f) => `第 ${f.index + 1} 个：${f.message}`) : undefined,
          }
        );
      } else {
        toast.warning(`已导入 ${report.imported.length} 个声音，${report.failures.length} 个导入失败`, {
          details: report.failures.map((f) => `第 ${f.index + 1} 个：${f.message}`),
        });
      }
      applyRestSnapshot(await api.getRestSystemSnapshot());
    });
  };

  const updateAudioSources = (input: AudioSourceInput): void => {
    void runMutation(async () => {
      applyRestSnapshot(await api.updateAudioSources(input));
      toast.success("声音设置已更新");
    });
  };

  return (
    <main className={styles.shell} aria-busy={isBusy || !settings || !snapshot || !restSnapshot || !companionSnapshot}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandTitle}>挚伴</span>
        </div>

        <nav className={styles.nav} aria-label="设置分类">
          <button
            type="button"
            className={clsx(styles.navButton, activeTab === "pets" && styles.active)}
            onClick={() => setActiveTab("pets")}
          >
            <svg viewBox="0 0 32 32" width="14" height="14" fill="none" aria-hidden="true">
              <circle cx="16" cy="13.5" r="11.3" stroke="currentColor" strokeWidth="2.5" />
              <ellipse cx="11.7" cy="14.4" rx="1.6" ry="2.2" fill="currentColor" />
              <ellipse cx="20.8" cy="13.1" rx="1.6" ry="2.2" fill="currentColor" />
              <path
                d="M13.4 18.8c1.5 1.5 3.7 1.4 5.2-.2"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path fill="currentColor" d="M2.5 26c8.8-3 18.2-3 27 0l-.7 2.8c-8.3-2.3-17.3-2.3-25.6 0L2.5 26Z" />
            </svg>
            <span>我的伙伴</span>
          </button>
          <button
            type="button"
            className={clsx(styles.navButton, activeTab === "rest" && styles.active)}
            onClick={() => setActiveTab("rest")}
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="7.5" />
              <polyline points="10,6 10,10 13,12" />
            </svg>
            <span>提醒与休息</span>
          </button>
          <button
            type="button"
            className={clsx(styles.navButton, activeTab === "work" && styles.active)}
            onClick={() => setActiveTab("work")}
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="6" width="14" height="11" rx="2" />
              <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6" />
              <path d="M3 11h14" />
            </svg>
            <span>专注时段</span>
          </button>
          <button
            type="button"
            className={clsx(styles.navButton, activeTab === "system" && styles.active)}
            onClick={() => setActiveTab("system")}
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="3" />
              <path d="M16.2 12.3a1 1 0 0 0 .2 1.1l.6.6a1.2 1.2 0 0 1-1.7 1.7l-.6-.6a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.9a1.2 1.2 0 0 1-2.4 0v-.9a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.6.6a1.2 1.2 0 0 1-1.7-1.7l.6-.6a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3.8a1.2 1.2 0 0 1 0-2.4h.9a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.6-.6a1.2 1.2 0 0 1 1.7-1.7l.6.6a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V3.8a1.2 1.2 0 0 1 2.4 0v.9a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.6-.6a1.2 1.2 0 0 1 1.7 1.7l-.6.6a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.9a1.2 1.2 0 0 1 0 2.4h-.9a1 1 0 0 0-.9.6z" />
            </svg>
            <span>通用设置</span>
          </button>
          <button
            type="button"
            className={clsx(styles.navButton, activeTab === "guide" && styles.active)}
            onClick={() => setActiveTab("guide")}
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.5a2.5 2.5 0 0 0-2.5 2.5z" />
              <path d="M6 6h7M6 10h7" />
            </svg>
            <span>使用说明</span>
          </button>
        </nav>
      </header>

      {error && !settings && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setLoadAttempt((value) => value + 1);
            }}
          >
            重试
          </button>
        </div>
      )}

      {activeTab === "pets" && settings && snapshot && (
        <div className={clsx(styles.tabContent, styles.layout)}>
          <aside className={styles.listPanel} aria-label="伙伴列表">
            <div className={styles.panelHeader}>
              <h2>伙伴列表</h2>
              <span className={styles.countPill}>{snapshot.pets.length}</span>
            </div>

            <div className={styles.petList}>
              {snapshot.pets.map((pet) => (
                <div
                  key={pet.id}
                  className={clsx(styles.petListItem, pet.id === selectedPetId && styles.selected)}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectPet(pet)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      selectPet(pet);
                    }
                  }}
                >
                  <span className={styles.petName}>{pet.name}</span>
                  <div className={styles.petItemActions}>
                    {pet.id === snapshot.activePetId ? (
                      <span className={styles.petActiveBadge}>当前伙伴</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.quickSwitchBtn}
                        disabled={isBusy || pet.actionSlots.idle.length === 0}
                        title={pet.actionSlots.idle.length === 0 ? "需先导入照片才可设为桌面伙伴" : "设为桌面伙伴"}
                        onClick={(event) => {
                          event.stopPropagation();
                          switchActivePet(pet.id);
                        }}
                      >
                        设为当前
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {snapshot.pets.length === 0 && <p className="supporting-copy">还没有添加伙伴。</p>}
            </div>

            {isCreatingPet ? (
              <div className={styles.newPetForm}>
                <label>
                  <span className={styles.newPetLabel}>伙伴名称</span>
                  <input
                    autoFocus
                    value={newPetName}
                    maxLength={80}
                    placeholder="例如：小宝"
                    onChange={(event) => setNewPetName(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") createPet();
                      if (event.key === "Escape") {
                        setIsCreatingPet(false);
                        setNewPetName("");
                      }
                    }}
                  />
                </label>
                <div className={styles.newPetActions}>
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
                className={styles.addPetTrigger}
                disabled={isBusy}
                onClick={() => setIsCreatingPet(true)}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="8" y1="3" x2="8" y2="13" />
                  <line x1="3" y1="8" x2="13" y2="8" />
                </svg>
                <span>添加伙伴</span>
              </button>
            )}
          </aside>

          <section className={styles.editorPanel}>
            {draft && selectedPet ? (
              <>
                <div className="editor-heading-row">
                  <div className={styles.titleWrap}>
                    <div className={styles.titleLine}>
                      <h2>{selectedPet.name}</h2>
                      {snapshot.activePetId === selectedPet.id && (
                        <span className={styles.petActiveBadge}>当前伙伴</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.petSubTabs} role="tablist" aria-label="伙伴设置分类">
                    <button
                      type="button"
                      id="pet-settings-tab-appearance"
                      role="tab"
                      aria-selected={petSubTab === "appearance"}
                      aria-controls="pet-settings-panel-appearance"
                      tabIndex={petSubTab === "appearance" ? 0 : -1}
                      className={clsx(styles.petSubTab, petSubTab === "appearance" && styles.petSubTabActive)}
                      onClick={() => setPetSubTab("appearance")}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                        event.preventDefault();
                        setPetSubTab("dialogues");
                        document.getElementById("pet-settings-tab-dialogues")?.focus();
                      }}
                    >
                      形象与动作
                    </button>
                    <button
                      type="button"
                      id="pet-settings-tab-dialogues"
                      role="tab"
                      aria-selected={petSubTab === "dialogues"}
                      aria-controls="pet-settings-panel-dialogues"
                      tabIndex={petSubTab === "dialogues" ? 0 : -1}
                      className={clsx(styles.petSubTab, petSubTab === "dialogues" && styles.petSubTabActive)}
                      onClick={() => setPetSubTab("dialogues")}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                        event.preventDefault();
                        setPetSubTab("appearance");
                        document.getElementById("pet-settings-tab-appearance")?.focus();
                      }}
                    >
                      对白与称呼
                    </button>
                  </div>
                </div>

                <div
                  id={`pet-settings-panel-${petSubTab}`}
                  className={styles.petSubTabPanel}
                  role="tabpanel"
                  aria-labelledby={`pet-settings-tab-${petSubTab}`}
                >
                  {petSubTab === "dialogues" ? (
                    <DialogueSettingsEditor
                      petId={selectedPet.id}
                      petName={selectedPet.name}
                      settings={draft.dialogueSettings}
                      bubblesEnabled={draft.interactionBubblesEnabled}
                      drowsyEnabled={draft.lifeStates.drowsy.enabled}
                      sleepingEnabled={draft.lifeStates.sleeping.enabled}
                      validationAttempt={dialogueValidationAttempt}
                      initialGroupId={petDialogueGroupId}
                      onGroupChange={setPetDialogueGroupId}
                      onChange={(dialogueSettings) => setDraft({ ...draft, dialogueSettings })}
                      onBubblesChange={(interactionBubblesEnabled) => setDraft({ ...draft, interactionBubblesEnabled })}
                      onPreviewDialogue={handlePreviewDialogue}
                      onSave={saveDraft}
                      isBusy={isBusy}
                      saveSuccess={saveSuccess}
                      hasUnsavedChanges={hasUnsavedPetChanges}
                    />
                  ) : (
                    <>
                      <div className={styles.basicFields}>
                        <label>
                          <span className="field-label-row">
                            <span>伙伴名称</span>
                          </span>
                          <input
                            value={draft.name}
                            maxLength={80}
                            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                          />
                        </label>
                        <label>
                          <span className="field-label-row">
                            <span>显示高度</span>
                            <InfoTooltip
                              text={`桌面显示高度，建议 180–240 px（支持 ${MIN_PET_TARGET_HEIGHT}–${MAX_PET_TARGET_HEIGHT} px）。`}
                            />
                          </span>
                          <div className={styles.unitWrap}>
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
                                if (value !== null) setDraft({ ...draft, targetHeight: value });
                              }}
                              onBlur={() => {
                                const value = normalizeTargetHeight(targetHeightText);
                                if (value === null) return;
                                setTargetHeightText(String(value));
                                setDraft({ ...draft, targetHeight: value });
                              }}
                            />
                            <span className={styles.unitSuffix}>px</span>
                          </div>
                        </label>
                      </div>

                      <section className="editor-section">
                        <CompanionPreferences
                          pace={draft.companionPace}
                          onPaceChange={(companionPace) => setDraft({ ...draft, companionPace })}
                          onPreview={(pace) => {
                            void api.previewCompanionPace(pace).catch(() => toast.error("暂时无法预览，请稍后再试。"));
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
                              entry.id === assetId ? { ...entry, normalization } : entry
                            ),
                          })
                        }
                        onUpdateHeadHotspot={(assetId, headHotspot) =>
                          setDraft({
                            ...draft,
                            assets: draft.assets.map((entry) =>
                              entry.id === assetId ? { ...entry, headHotspot } : entry
                            ),
                          })
                        }
                      />

                      <section className="editor-section">
                        <div className="heading-with-tooltip" style={{ marginBottom: "12px" }}>
                          <h2>生活场景照片</h2>
                        </div>
                        <CompanionBehaviorEditor
                          petId={selectedPet.id}
                          assets={selectedPet.assets}
                          slots={draft.actionSlots}
                          lifeStates={draft.lifeStates}
                          onSlotsChange={(actionSlots) => setDraft({ ...draft, actionSlots })}
                          onLifeStatesChange={(lifeStates) => setDraft({ ...draft, lifeStates })}
                        />
                      </section>

                      <div className={styles.saveBar}>
                        <button type="button" className="danger-button" disabled={isBusy} onClick={deletePet}>
                          删除伙伴
                        </button>
                        <div className={styles.saveBarRight}>
                          {saveSuccess && <span className={styles.saveNotice}>设置已保存</span>}
                          {!saveSuccess && hasUnsavedPetChanges && (
                            <span className={styles.unsavedNotice}>尚未保存</span>
                          )}
                          <Tooltip
                            content="需先导入照片才可保存设置"
                            position="top-end"
                            disabled={selectedPet.assets.length > 0}
                          >
                            <button
                              type="button"
                              className={clsx("primary-button", saveSuccess && "saved")}
                              disabled={isBusy || selectedPet.assets.length === 0}
                              onClick={saveDraft}
                            >
                              {isBusy ? "保存中…" : saveSuccess ? "已保存" : "保存设置"}
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>请选择或新建一个伙伴。</div>
            )}
          </section>
        </div>
      )}

      {activeTab === "rest" && settings && restSnapshot && (
        <section className={clsx(styles.tabContent, styles.sections)}>
          <article className={styles.card}>
            <div className="editor-heading-row">
              <div className="heading-with-tooltip">
                <h2>休息提醒</h2>
                <InfoTooltip text="按设定时间提醒起身活动或喝水；声音默认关闭。" />
              </div>
              <button type="button" className="primary-button" disabled={isBusy} onClick={newReminder}>
                添加休息提醒
              </button>
            </div>
            {restSnapshot.runtime.serviceStatus === "error" && (
              <div className={styles.serviceError} role="alert">
                <span>{restSnapshot.runtime.serviceError?.message ?? "休息提醒暂时不可用。"}</span>
                <button
                  type="button"
                  onClick={() => void runMutation(async () => applyRestSnapshot(await api.retryReminderService()))}
                >
                  再试一次
                </button>
              </div>
            )}
            <div className={styles.reminderList}>
              {restSnapshot.reminders.length === 0 ? (
                <p className={styles.emptyState}>还没有休息提醒。可以先添加一条适合自己的安排。</p>
              ) : (
                restSnapshot.reminders.map((reminder) => {
                  const soundBadge = formatSoundBadge(reminder);
                  return (
                    <div
                      className={clsx(styles.reminderRow, !reminder.enabled && styles.reminderDisabled)}
                      key={reminder.id}
                    >
                      <div
                        className={styles.reminderContent}
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
                        <div className={styles.reminderPrimaryRow}>
                          <strong className={styles.reminderTime}>{formatReminderTiming(reminder)}</strong>
                          <span className={styles.reminderMessage}>{reminder.message}</span>
                        </div>
                        <div className={styles.reminderBadges}>
                          <span className={styles.reminderBadge}>{formatReminderWeekdays(reminder.weekdays)}</span>
                          {reminder.mode === "interval" && (
                            <span className={styles.reminderBadge}>每 {reminder.intervalMinutes} 分钟</span>
                          )}
                          <span className={styles.reminderBadge}>{reminder.restDurationMinutes} 分钟休息</span>
                          <span
                            className={clsx(
                              styles.reminderBadge,
                              soundBadge.enabled ? styles.badgeSoundOn : styles.badgeSoundOff
                            )}
                          >
                            {soundBadge.label}
                          </span>
                          <span className={styles.reminderBadge}>{formatTolerance(reminder.cursorTolerance)}</span>
                        </div>
                      </div>
                      <div className={styles.reminderActions}>
                        <button
                          type="button"
                          className={styles.reminderEditBtn}
                          onClick={() => editReminder(reminder)}
                          title="编辑此条提醒"
                        >
                          编辑 ›
                        </button>
                        <label className="toggle-control" style={{ marginBottom: 0 }}>
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
            disabled={isBusy}
            onImport={importAudio}
            onChange={updateAudioSources}
          />
          {reminderDraft &&
            createPortal(
              <div
                className={styles.modalBackdrop}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reminder-modal-title"
                onClick={(event) => {
                  if (event.target === event.currentTarget) setReminderDraft(null);
                }}
              >
                <div className={styles.modalCard}>
                  <div className={styles.modalHeader}>
                    <h3 id="reminder-modal-title">{reminderDraft.id ? "编辑休息提醒" : "添加休息提醒"}</h3>
                    <button
                      type="button"
                      className={styles.modalCloseBtn}
                      onClick={() => setReminderDraft(null)}
                      aria-label="关闭"
                    >
                      ✕
                    </button>
                  </div>
                  <ReminderEditor
                    value={reminderDraft}
                    disabled={isBusy}
                    activePetName={activePet?.name}
                    onNavigateToPetDialogue={
                      activePet
                        ? () => {
                            if (selectedPetId !== activePet.id) {
                              if (selectedPetId) {
                                void api.cleanupPetVoiceDrafts(selectedPetId).catch(() => undefined);
                              }
                              setSelectedPetId(activePet.id);
                              setDraft(petToUpdateInput(activePet));
                              setTargetHeightText(String(activePet.targetHeight));
                            } else if (!draft) {
                              setDraft(petToUpdateInput(activePet));
                              setTargetHeightText(String(activePet.targetHeight));
                            }
                            setReminderDraft(null);
                            setActiveTab("pets");
                            setPetSubTab("dialogues");
                            setPetDialogueGroupId("rest");
                          }
                        : undefined
                    }
                    onChange={setReminderDraft}
                    onSave={saveReminder}
                    onValidationError={handleReminderValidationError}
                    onCancel={() => setReminderDraft(null)}
                    onDelete={reminderDraft.id ? deleteReminder : undefined}
                  />
                </div>
              </div>,
              document.body
            )}
        </section>
      )}

      {activeTab === "work" && companionSnapshot && (
        <section className={clsx(styles.tabContent, styles.sections)}>
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
        <section className={clsx(styles.tabContent, styles.sections)}>
          <article className={styles.card}>
            <div className="settings-row-between">
              <div>
                <div className="heading-with-tooltip">
                  <h2>桌面伙伴</h2>
                  <InfoTooltip text="隐藏后伙伴暂时离开桌面，可随时从系统托盘唤出。" />
                </div>
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
          <article className={styles.card}>
            <div className="settings-row-between">
              <div>
                <div className="heading-with-tooltip">
                  <h2>开机启动</h2>
                  <InfoTooltip text="电脑开机后自动在后台启动应用并常驻托盘。" />
                </div>
                {!autostartStatus?.supported && <p className="supporting-copy">安装应用后可以设置开机启动。</p>}
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
              <p className={styles.inlineStatusError} role="status">
                开机启动没有设置成功。请检查系统设置后再试一次。
              </p>
            )}
          </article>
          {petRendererStatus?.state === "safe-mode" && (
            <article className={clsx(styles.card, styles.recoveryCard)}>
              <h2>伙伴暂时没有显示</h2>
              <p className="supporting-copy">伙伴窗口暂时无法显示，设置和提醒仍可使用。</p>
              <button type="button" className="secondary-button" disabled={isBusy} onClick={retryPetRenderer}>
                重新显示伙伴
              </button>
            </article>
          )}
        </section>
      )}

      {activeTab === "guide" && (
        <section className={styles.tabContent}>
          <UserGuide />
        </section>
      )}

      <footer className={styles.footer}>
        <span>照片、声音和设置只保存在这台设备上</span>
      </footer>
    </main>
  );
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
    dialogueSettings: clonePetDialogueSettings(pet.dialogueSettings),
  };
}

function mergeImportedAssetsIntoDraft(current: PetUpdateInput | null, persistedPet: PetConfig): PetUpdateInput {
  const persisted = petToUpdateInput(persistedPet);
  if (!current || current.id !== persistedPet.id) return persisted;
  const existingAdjustments = new Map(current.assets.map((asset) => [asset.id, asset]));
  return {
    ...current,
    dialogueSettings: clonePetDialogueSettings(current.dialogueSettings),
    actionSlots:
      current.actionSlots.idle.length === 0 && persisted.actionSlots.idle.length > 0
        ? { ...current.actionSlots, idle: [...persisted.actionSlots.idle] }
        : current.actionSlots,
    assets: persisted.assets.map((asset) => {
      const existing = existingAdjustments.get(asset.id);
      return existing
        ? {
            id: existing.id,
            normalization: { ...existing.normalization },
            headHotspot: existing.headHotspot ? { ...existing.headHotspot } : null,
          }
        : asset;
    }),
  };
}

function parseTargetHeight(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= MIN_PET_TARGET_HEIGHT && parsed <= MAX_PET_TARGET_HEIGHT
    ? Math.round(parsed)
    : null;
}

function normalizeTargetHeight(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(Math.min(Math.max(parsed, MIN_PET_TARGET_HEIGHT), MAX_PET_TARGET_HEIGHT));
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
      return "稍微移动就督促";
    case "relaxed":
      return "明显移动才督促";
    default:
      return "移动一会儿再督促";
  }
}

function formatSoundBadge(reminder: Pick<ReminderSchedule, "sounds" | "voiceAssetId">): {
  label: string;
  enabled: boolean;
} {
  const { sounds, voiceAssetId } = reminder;
  const hasVoice = Boolean(voiceAssetId) && sounds.reminder;
  if (hasVoice && sounds.crying) return { label: "提醒语音 + 督促音", enabled: true };
  if (hasVoice) return { label: "提醒语音", enabled: true };
  if (sounds.reminder && sounds.crying) return { label: "提醒音 + 督促音", enabled: true };
  if (sounds.reminder) return { label: "提醒音", enabled: true };
  if (sounds.crying) return { label: "仅督促音", enabled: true };
  return { label: "静音", enabled: false };
}

function formatReminderTiming(reminder: ReminderSchedule): string {
  if (reminder.mode === "fixed") {
    return `${String(reminder.hour).padStart(2, "0")}:${String(reminder.minute).padStart(2, "0")}`;
  }
  return reminder.windows
    .map(
      (w) =>
        `${String(w.startHour).padStart(2, "0")}:${String(w.startMinute).padStart(2, "0")}–${String(w.endHour).padStart(2, "0")}:${String(w.endMinute).padStart(2, "0")}`
    )
    .join("、");
}
