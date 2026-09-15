import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { CursorTolerance, ReminderSounds, ReminderTimeWindow, Weekday } from "@shared/contracts";
import { InfoTooltip, Tooltip } from "./Tooltip";
import { VoiceRecorderPopover } from "./VoiceRecorderPopover";
import { WeekdayPicker } from "./WeekdayPicker";
import styles from "./ReminderEditor.module.css";

export interface ReminderWindowDraft {
  key: string;
  startHour: number | null;
  startMinute: number | null;
  endHour: number | null;
  endMinute: number | null;
}

export interface ReminderDraft {
  id?: string;
  mode: "fixed" | "interval";
  hour: number | null;
  minute: number | null;
  windows: ReminderWindowDraft[];
  intervalMinutes: number;
  enabled: boolean;
  weekdays: Weekday[];
  restDurationMinutes: number;
  cursorTolerance: CursorTolerance;
  message: string;
  sounds: ReminderSounds;
  voiceAssetId?: string;
  voiceTrimStart?: number;
  voiceTrimEnd?: number;
}

export interface ReminderEditorProps {
  value: ReminderDraft;
  disabled: boolean;
  activePetName?: string;
  onNavigateToPetDialogue?: () => void;
  onChange(value: ReminderDraft): void;
  onSave(): void;
  onValidationError(): void;
  onCancel(): void;
  onDelete?: () => void;
}

export function createDraftWindow(window?: ReminderTimeWindow): ReminderWindowDraft {
  return {
    key: crypto.randomUUID(),
    startHour: window ? window.startHour : null,
    startMinute: window ? window.startMinute : null,
    endHour: window ? window.endHour : null,
    endMinute: window ? window.endMinute : null,
  };
}

function formatReminderWeekdaysSummary(weekdays: readonly Weekday[]): string {
  if (weekdays.length === 7) return "每天";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d as Weekday))) return "周一至周五";
  if (weekdays.length === 2 && [0, 6].every((d) => weekdays.includes(d as Weekday))) return "周末";
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return weekdays
    .slice()
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => names[d])
    .join("、");
}

export function ReminderEditor({
  value,
  disabled,
  activePetName,
  onNavigateToPetDialogue,
  onChange,
  onSave,
  onValidationError,
  onCancel,
  onDelete,
}: ReminderEditorProps): React.JSX.Element {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [failedVoiceId, setFailedVoiceId] = useState<string | null>(null);
  const [isVoiceMissing, setIsVoiceMissing] = useState(false);
  const [prevVoiceAssetId, setPrevVoiceAssetId] = useState(value.voiceAssetId);
  if (value.voiceAssetId !== prevVoiceAssetId) {
    setPrevVoiceAssetId(value.voiceAssetId);
    setFailedVoiceId(null);
    setIsVoiceMissing(false);
    setIsPlayingVoice(false);
  }
  const [showRecorder, setShowRecorder] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const releaseAudition = (audio = audioRef.current): void => {
    if (!audio) return;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioRef.current === audio) audioRef.current = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = "";
    setIsPlayingVoice(false);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, [value.voiceAssetId]);

  useEffect(() => {
    if (disabled && isPlayingVoice) {
      releaseAudition();
    }
  }, [disabled, isPlayingVoice]);

  useEffect(() => {
    if (!value.voiceAssetId) return;
    let cancelled = false;
    const assetId = value.voiceAssetId;
    window.dearCompanion
      .getReminderVoiceAvailability([assetId])
      .then((avail) => {
        if (!cancelled) {
          setIsVoiceMissing(!avail[assetId]);
        }
      })
      .catch(() => {
        if (!cancelled) setIsVoiceMissing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value.voiceAssetId]);

  const voiceUnavailable = isVoiceMissing || failedVoiceId === value.voiceAssetId;

  const toggleVoiceAudition = (): void => {
    if (!value.voiceAssetId) return;
    if (isPlayingVoice && audioRef.current) {
      releaseAudition();
      return;
    }
    if (audioRef.current) {
      releaseAudition();
    }
    const url = `app://renderer/reminder-voices/${encodeURIComponent(value.voiceAssetId)}`;
    const audio = new Audio(url);
    audio.volume = 1.0;
    audioRef.current = audio;

    const trimStart = value.voiceTrimStart ?? 0;
    const trimEnd = value.voiceTrimEnd;

    const checkTrim = (): void => {
      if (!audioRef.current || audioRef.current !== audio) return;
      if (trimEnd !== undefined && audio.currentTime >= trimEnd) {
        releaseAudition(audio);
        return;
      }
      rafRef.current = requestAnimationFrame(checkTrim);
    };

    audio.onended = () => releaseAudition(audio);
    audio.onerror = () => {
      releaseAudition(audio);
      setFailedVoiceId(value.voiceAssetId ?? null);
    };

    const applySeekAndPlay = (): void => {
      if (!audioRef.current || audioRef.current !== audio) return;
      if (trimStart > 0) {
        try {
          audio.currentTime = trimStart;
        } catch {
          // Seek will be reapplied once playback starts if metadata is not ready yet
        }
      }
      void audio
        .play()
        .then(() => {
          if (!audioRef.current || audioRef.current !== audio) return;
          if (trimStart > 0 && audio.currentTime < trimStart) {
            audio.currentTime = trimStart;
          }
          setFailedVoiceId(null);
          setIsPlayingVoice(true);
          if (trimEnd !== undefined) {
            rafRef.current = requestAnimationFrame(checkTrim);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          releaseAudition(audio);
          setFailedVoiceId(value.voiceAssetId ?? null);
        });
    };

    if (trimStart > 0 && audio.readyState < 1) {
      audio.addEventListener("loadedmetadata", applySeekAndPlay, { once: true });
    } else {
      applySeekAndPlay();
    }
  };

  const handleWindowTimeChange = (
    index: number,
    field: "start" | "end",
    rawValue: string
  ): void => {
    let hour: number | null = null;
    let minute: number | null = null;
    if (rawValue) {
      const parts = rawValue.split(":").map(Number);
      if (parts.length >= 2 && Number.isInteger(parts[0]) && Number.isInteger(parts[1])) {
        hour = parts[0]!;
        minute = parts[1]!;
      }
    }
    const nextWindows = value.windows.map((w, i) => {
      if (i !== index) return w;
      return field === "start"
        ? { ...w, startHour: hour, startMinute: minute }
        : { ...w, endHour: hour, endMinute: minute };
    });
    onChange({ ...value, windows: nextWindows });
    const targetKey = value.windows[index]?.key;
    if (targetKey) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[`window_${targetKey}_${field}`];
        delete copy[`window_${targetKey}`];
        delete copy.windows;
        return copy;
      });
    }
  };

  const handleAddWindow = (): void => {
    if (value.windows.length >= 3) return;
    onChange({
      ...value,
      windows: [...value.windows, createDraftWindow()],
    });
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.windows;
      return copy;
    });
  };

  const handleRemoveWindow = (index: number): void => {
    if (value.windows.length <= 1) return;
    const removedKey = value.windows[index]?.key;
    onChange({
      ...value,
      windows: value.windows.filter((_, i) => i !== index),
    });
    if (removedKey) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[`window_${removedKey}_start`];
        delete copy[`window_${removedKey}_end`];
        delete copy[`window_${removedKey}`];
        delete copy.windows;
        return copy;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (value.mode === "fixed") {
      if (value.hour === null || value.minute === null) {
        newErrors.fixedTime = "请选择提醒时间";
      }
    } else {
      if (value.windows.length === 0) {
        newErrors.windows = "请添加至少一个时段";
      } else {
        const validWindows: { start: number; end: number }[] = [];
        for (const w of value.windows) {
          if (w.startHour === null || w.startMinute === null) {
            newErrors[`window_${w.key}_start`] = "请选择开始时间";
          }
          if (w.endHour === null || w.endMinute === null) {
            newErrors[`window_${w.key}_end`] = "请选择结束时间";
          }
          if (
            w.startHour !== null &&
            w.startMinute !== null &&
            w.endHour !== null &&
            w.endMinute !== null
          ) {
            const startMin = w.startHour * 60 + w.startMinute;
            const endMin = w.endHour * 60 + w.endMinute;
            if (startMin >= endMin) {
              newErrors[`window_${w.key}`] = "结束时间必须晚于开始时间";
            } else {
              validWindows.push({ start: startMin, end: endMin });
            }
          }
        }

        if (validWindows.length > 1) {
          const sorted = [...validWindows].sort((a, b) => a.start - b.start);
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentWin = sorted[i];
            const nextWin = sorted[i + 1];
            if (currentWin && nextWin && currentWin.end > nextWin.start) {
              newErrors.windows = "时段之间不能重叠";
              break;
            }
          }
        }
      }

      if (
        !Number.isInteger(value.intervalMinutes) ||
        value.intervalMinutes < 15 ||
        value.intervalMinutes > 240 ||
        value.intervalMinutes % 5 !== 0
      ) {
        newErrors.intervalMinutes = "提醒间隔需在 15–240 分钟之间，且为 5 的倍数";
      }
    }

    if (value.weekdays.length === 0) {
      newErrors.weekdays = "请至少选择一天";
    }

    const trimmedMessage = value.message.trim();
    if (trimmedMessage.length === 0) {
      newErrors.message = "请填写提醒内容";
    } else if (trimmedMessage.length > 200) {
      newErrors.message = "提醒文案不能超过 200 字";
    }

    if (
      !Number.isInteger(value.restDurationMinutes) ||
      value.restDurationMinutes < 1 ||
      value.restDurationMinutes > 120
    ) {
      newErrors.restDurationMinutes = "休息时长需在 1–120 分钟之间";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (disabled) return;
    if (!validate()) {
      onValidationError();
      setTimeout(() => {
        const firstInvalid = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
        firstInvalid?.focus();
      }, 0);
      return;
    }
    setErrors({});
    onSave();
  };

  const formatHourMinute = (h: number, m: number): string =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  const getTimingSummary = (): string => {
    if (value.weekdays.length === 0) {
      return value.mode === "fixed" ? "填写提醒时间后，这里会显示完整安排。" : "填写提醒时段后，这里会显示完整安排。";
    }

    const weekdayText = formatReminderWeekdaysSummary(value.weekdays);

    if (value.mode === "fixed") {
      if (value.hour === null || value.minute === null) {
        return "填写提醒时间后，这里会显示完整安排。";
      }
      return `${weekdayText} ${formatHourMinute(value.hour, value.minute)} 提醒。`;
    }

    if (value.windows.length === 0) {
      return "填写提醒时段后，这里会显示完整安排。";
    }

    for (const w of value.windows) {
      if (
        w.startHour === null ||
        w.startMinute === null ||
        w.endHour === null ||
        w.endMinute === null
      ) {
        return "填写提醒时段后，这里会显示完整安排。";
      }
      const startMin = w.startHour * 60 + w.startMinute;
      const endMin = w.endHour * 60 + w.endMinute;
      if (startMin >= endMin) {
        return "填写提醒时段后，这里会显示完整安排。";
      }
    }

    const sorted = [...value.windows].sort((a, b) => {
      const startA = a.startHour! * 60 + a.startMinute!;
      const startB = b.startHour! * 60 + b.startMinute!;
      return startA - startB;
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const currentWin = sorted[i];
      const nextWin = sorted[i + 1];
      if (
        currentWin &&
        nextWin &&
        currentWin.endHour! * 60 + currentWin.endMinute! > nextWin.startHour! * 60 + nextWin.startMinute!
      ) {
        return "填写提醒时段后，这里会显示完整安排。";
      }
    }

    const ranges = sorted.map(
      (w) => `${formatHourMinute(w.startHour!, w.startMinute!)}–${formatHourMinute(w.endHour!, w.endMinute!)}`
    );
    const rangeText =
      ranges.length === 1 ? ranges[0] : `${ranges.slice(0, -1).join("、")} 和 ${ranges[ranges.length - 1]}`;

    return `${weekdayText}，${rangeText} 期间，每 ${value.intervalMinutes} 分钟提醒一次。`;
  };

  const fixedTimeValue =
    value.hour === null || value.minute === null
      ? ""
      : `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;

  return (
    <form ref={formRef} className={styles.editor} onSubmit={handleSubmit} noValidate>
      <div className={styles.editorContent}>
        <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>时间与重复</h3>

        <fieldset className={styles.modeFieldset}>
          <legend className={styles.modeLegend}>提醒方式</legend>
          <div className={styles.segmentedControl} role="radiogroup" aria-label="提醒方式">
            <label className={clsx(styles.segmentOption, value.mode === "fixed" && styles.segmentSelected)}>
              <input
                type="radio"
                name="timingMode"
                value="fixed"
                checked={value.mode === "fixed"}
                disabled={disabled}
                onChange={() => {
                  onChange({ ...value, mode: "fixed" });
                  setErrors({});
                }}
                className={styles.segmentRadio}
              />
              <span>指定时间</span>
            </label>
            <label className={clsx(styles.segmentOption, value.mode === "interval" && styles.segmentSelected)}>
              <input
                type="radio"
                name="timingMode"
                value="interval"
                checked={value.mode === "interval"}
                disabled={disabled}
                onChange={() => {
                  onChange({ ...value, mode: "interval" });
                  setErrors({});
                }}
                className={styles.segmentRadio}
              />
              <span>时段内重复</span>
            </label>
          </div>
        </fieldset>

        {value.mode === "interval" && (
          <div className={styles.windowsSection}>
            <div className={styles.windowsHeader}>
              <span className={styles.windowLabel}>提醒时段</span>
            </div>
            <div className={styles.windowRows}>
              {value.windows.map((windowDraft, index) => {
                const windowError =
                  errors[`window_${windowDraft.key}`] ||
                  errors[`window_${windowDraft.key}_start`] ||
                  errors[`window_${windowDraft.key}_end`];
                const startTimeValue =
                  windowDraft.startHour === null || windowDraft.startMinute === null
                    ? ""
                    : `${String(windowDraft.startHour).padStart(2, "0")}:${String(windowDraft.startMinute).padStart(2, "0")}`;
                const endTimeValue =
                  windowDraft.endHour === null || windowDraft.endMinute === null
                    ? ""
                    : `${String(windowDraft.endHour).padStart(2, "0")}:${String(windowDraft.endMinute).padStart(2, "0")}`;

                return (
                  <div className={styles.windowRowContainer} key={windowDraft.key}>
                    <div className={styles.windowRow}>
                      <div className={styles.windowInputsContainer}>
                        <div className={styles.windowTimeField}>
                          <label htmlFor={`window-start-${windowDraft.key}`}>
                            <span className={styles.windowTimeLabel}>开始时间</span>
                          </label>
                          <input
                            id={`window-start-${windowDraft.key}`}
                            type="time"
                            value={startTimeValue}
                            disabled={disabled}
                            aria-invalid={Boolean(
                              errors[`window_${windowDraft.key}_start`] ||
                                errors[`window_${windowDraft.key}`] ||
                                errors.windows
                            )}
                            aria-describedby={windowError ? `window-error-${windowDraft.key}` : undefined}
                            onChange={(event) => handleWindowTimeChange(index, "start", event.currentTarget.value)}
                          />
                        </div>
                        <span className={styles.windowTimeSeparator} aria-hidden="true">
                          至
                        </span>
                        <div className={styles.windowTimeField}>
                          <label htmlFor={`window-end-${windowDraft.key}`}>
                            <span className={styles.windowTimeLabel}>结束时间</span>
                          </label>
                          <input
                            id={`window-end-${windowDraft.key}`}
                            type="time"
                            value={endTimeValue}
                            disabled={disabled}
                            aria-invalid={Boolean(
                              errors[`window_${windowDraft.key}_end`] ||
                                errors[`window_${windowDraft.key}`] ||
                                errors.windows
                            )}
                            aria-describedby={windowError ? `window-error-${windowDraft.key}` : undefined}
                            onChange={(event) => handleWindowTimeChange(index, "end", event.currentTarget.value)}
                          />
                        </div>
                      </div>
                      <div className={styles.windowActionSlot}>
                        <button
                          type="button"
                          className={styles.removeWindowBtn}
                          disabled={disabled || value.windows.length <= 1}
                          onClick={() => handleRemoveWindow(index)}
                          aria-label={`移除第 ${index + 1} 个时段`}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                    <div className={styles.errorSlot} id={`window-error-${windowDraft.key}`} role="alert">
                      {windowError && <span className={styles.inlineError}>{windowError}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.windowAddSlot}>
              <Tooltip content="每条提醒最多设置 3 个时段" disabled={value.windows.length < 3}>
                <button
                  type="button"
                  className={styles.addWindowBtn}
                  disabled={disabled || value.windows.length >= 3}
                  onClick={handleAddWindow}
                >
                  + 添加时段
                </button>
              </Tooltip>
            </div>
            <div className={styles.errorSlot} role="alert">
              {errors.windows && <span className={styles.inlineError}>{errors.windows}</span>}
            </div>
          </div>
        )}

        <div className={styles.fields}>
          {value.mode === "fixed" ? (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldHeader}>
                <label htmlFor="reminder-time-input">
                  <span>提醒时间</span>
                </label>
              </div>
              <input
                id="reminder-time-input"
                type="time"
                value={fixedTimeValue}
                disabled={disabled}
                aria-invalid={Boolean(errors.fixedTime)}
                aria-describedby={errors.fixedTime ? "fixed-time-error" : undefined}
                onChange={(event) => {
                  const parts = event.currentTarget.value.split(":").map(Number);
                  onChange({
                    ...value,
                    hour: parts.length >= 2 && Number.isInteger(parts[0]) ? parts[0]! : null,
                    minute: parts.length >= 2 && Number.isInteger(parts[1]) ? parts[1]! : null,
                  });
                  if (errors.fixedTime) {
                    setErrors((prev) => ({ ...prev, fixedTime: undefined }));
                  }
                }}
              />
              <div className={styles.errorSlot} id="fixed-time-error" role="alert">
                {errors.fixedTime && <span className={styles.inlineError}>{errors.fixedTime}</span>}
              </div>
            </div>
          ) : (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldHeader}>
                <label htmlFor="reminder-interval-input">
                  <span>提醒间隔</span>
                </label>
                <InfoTooltip text="可设置 15–240 分钟，须为 5 的倍数。" position="top-start" />
              </div>
              <div className={styles.inputWithSuffix}>
                <input
                  id="reminder-interval-input"
                  type="number"
                  min={15}
                  max={240}
                  step={5}
                  value={value.intervalMinutes}
                  disabled={disabled}
                  aria-invalid={Boolean(errors.intervalMinutes)}
                  aria-describedby={errors.intervalMinutes ? "interval-minutes-error" : undefined}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value);
                    if (Number.isInteger(next)) {
                      onChange({
                        ...value,
                        intervalMinutes: next,
                      });
                      if (errors.intervalMinutes) {
                        setErrors((prev) => ({ ...prev, intervalMinutes: undefined }));
                      }
                    }
                  }}
                />
                <span className={styles.inputSuffix}>分钟</span>
              </div>
              <div className={styles.errorSlot} id="interval-minutes-error" role="alert">
                {errors.intervalMinutes && <span className={styles.inlineError}>{errors.intervalMinutes}</span>}
              </div>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <div className={styles.fieldHeader}>
              <label htmlFor="rest-duration-input">
                <span>休息时长</span>
              </label>
            </div>
            <div className={styles.inputWithSuffix}>
              <input
                id="rest-duration-input"
                type="number"
                min={1}
                max={120}
                value={value.restDurationMinutes}
                disabled={disabled}
                aria-invalid={Boolean(errors.restDurationMinutes)}
                aria-describedby={errors.restDurationMinutes ? "rest-duration-error" : undefined}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (Number.isInteger(next)) {
                    onChange({
                      ...value,
                      restDurationMinutes: Math.min(Math.max(next, 1), 120),
                    });
                    if (errors.restDurationMinutes) {
                      setErrors((prev) => ({ ...prev, restDurationMinutes: undefined }));
                    }
                  }
                }}
              />
              <span className={styles.inputSuffix}>分钟</span>
            </div>
            <div className={styles.errorSlot} id="rest-duration-error" role="alert">
              {errors.restDurationMinutes && (
                <span className={styles.inlineError}>{errors.restDurationMinutes}</span>
              )}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldHeader}>
              <label htmlFor="cursor-tolerance-select">
                <span>休息时允许移动</span>
              </label>
            </div>
            <select
              id="cursor-tolerance-select"
              value={value.cursorTolerance}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  cursorTolerance: event.currentTarget.value as CursorTolerance,
                })
              }
            >
              <option value="sensitive">稍微移动就督促</option>
              <option value="standard">移动一会儿再督促</option>
              <option value="relaxed">明显移动才督促</option>
            </select>
            <div className={styles.errorSlot} />
          </div>
        </div>

        <WeekdayPicker
          value={value.weekdays}
          disabled={disabled}
          isInvalid={Boolean(errors.weekdays)}
          describedBy={errors.weekdays ? "weekdays-error" : undefined}
          onChange={(weekdays) => {
            onChange({ ...value, weekdays: [...weekdays] });
            if (errors.weekdays) {
              setErrors((prev) => ({ ...prev, weekdays: undefined }));
            }
          }}
        />
        <div className={styles.errorSlot} id="weekdays-error" role="alert">
          {errors.weekdays && <span className={styles.inlineError}>{errors.weekdays}</span>}
        </div>

        <div className={styles.timingSummary} aria-live="polite">
          {getTimingSummary()}
        </div>
      </div>

      <div className={styles.sectionCard}>
        <div className={styles.sectionHeaderRow}>
          <h3 className={styles.sectionTitle}>提醒内容</h3>
          <div className={styles.voiceSlot}>
            {value.voiceAssetId ? (
              <div className={styles.voiceCapsule}>
                <button
                  type="button"
                  className={clsx(styles.voicePlayBtn, voiceUnavailable && styles.voiceUnavailable)}
                  disabled={disabled}
                  onClick={toggleVoiceAudition}
                  aria-label={isPlayingVoice ? "停止试听" : "试听提醒语音"}
                  title={voiceUnavailable ? "提醒语音文件缺失" : isPlayingVoice ? "停止试听" : "试听提醒语音"}
                >
                  {isPlayingVoice ? (
                    <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true">
                      <rect x="2" y="2" width="3" height="8" rx="0.5" />
                      <rect x="7" y="2" width="3" height="8" rx="0.5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true">
                      <path d="M3 2.5v7l6-3.5-6-3.5z" />
                    </svg>
                  )}
                  <span>{isPlayingVoice ? "停止" : "试听"}</span>
                </button>
                <button
                  type="button"
                  className={styles.voiceActionBtn}
                  disabled={disabled}
                  onClick={() => {
                    if (isPlayingVoice) releaseAudition();
                    setShowRecorder(true);
                  }}
                  aria-label="编辑提醒语音"
                >
                  编辑
                </button>
                <button
                  type="button"
                  className={styles.voiceDeleteBtn}
                  disabled={disabled}
                  onClick={() => {
                    if (isPlayingVoice) releaseAudition();
                    onChange({
                      ...value,
                      voiceAssetId: undefined,
                      voiceTrimStart: undefined,
                      voiceTrimEnd: undefined,
                    });
                  }}
                  aria-label="删除提醒语音"
                >
                  删除
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.addVoiceBtn}
                disabled={disabled}
                onClick={() => {
                  if (isPlayingVoice) releaseAudition();
                  setShowRecorder(true);
                }}
                aria-label="添加提醒语音"
              >
                <svg
                  viewBox="0 0 12 12"
                  width="10"
                  height="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="6" y1="2" x2="6" y2="10" />
                  <line x1="2" y1="6" x2="10" y2="6" />
                </svg>
                <span>提醒语音</span>
              </button>
            )}
          </div>
        </div>
        <label className={styles.messageField}>
          <span>提醒内容</span>
          <textarea
            maxLength={200}
            value={value.message}
            disabled={disabled}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "message-error" : undefined}
            onChange={(event) => {
              onChange({ ...value, message: event.currentTarget.value });
              if (errors.message) {
                setErrors((prev) => ({ ...prev, message: undefined }));
              }
            }}
          />
        </label>
        <div className={styles.errorSlot} id="message-error" role="alert">
          {errors.message && <span className={styles.inlineError}>{errors.message}</span>}
        </div>
      </div>

      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>启用与声音</h3>
        <div className={styles.togglesGrid}>
          <label className={styles.toggleDetailed}>
            <div className={styles.toggleMain}>
              <input
                type="checkbox"
                checked={value.enabled}
                disabled={!value.id || disabled}
                onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
              />
              <strong>启用此条提醒</strong>
            </div>
            <span className={styles.toggleSubtext}>关闭后保留设置，但不会按以上安排提醒</span>
          </label>
          <label className={styles.toggleDetailed}>
            <div className={styles.toggleMain}>
              <input
                type="checkbox"
                checked={value.sounds.reminder}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    sounds: { ...value.sounds, reminder: event.currentTarget.checked },
                  })
                }
              />
              <strong>{value.voiceAssetId ? "播放提醒语音" : "播放休息提示音"}</strong>
            </div>
            <span className={styles.toggleSubtext}>
              {value.voiceAssetId
                ? "提醒出现时播放录制的语音，不再播放默认提示音"
                : "提醒出现时播放默认提示音"}
            </span>
          </label>
          <label className={styles.toggleDetailed}>
            <div className={styles.toggleMain}>
              <input
                type="checkbox"
                checked={value.sounds.crying}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...value,
                    sounds: { ...value.sounds, crying: event.currentTarget.checked },
                  })
                }
              />
              <strong>检测到移动时播放提示音</strong>
            </div>
            <span className={styles.toggleSubtext}>
              休息期间移动超过所选程度后播放；督促对白与配音随当前伙伴切换
            </span>
          </label>

          {onNavigateToPetDialogue && activePetName && (
            <div className={styles.companionContextNotice}>
              <span>
                当前伙伴：<strong>{activePetName}</strong>
              </span>
              <button
                type="button"
                className={styles.companionContextLink}
                onClick={onNavigateToPetDialogue}
              >
                设置休息对白 ›
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

      <div className={styles.saveBar}>
        {onDelete && (
          <button type="button" className="danger-button" disabled={disabled} onClick={onDelete}>
            删除提醒
          </button>
        )}
        <div className={styles.saveBarRight}>
          <button type="button" className="secondary-button" disabled={disabled} onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={disabled}>
            保存提醒
          </button>
        </div>
      </div>

      {showRecorder && (
        <VoiceRecorderPopover
          target="reminder"
          dialogueText={value.message || "休息一会儿吧。"}
          mode={value.voiceAssetId ? "replace" : "add"}
          volume={1.0}
          initialVoiceAssetId={value.voiceAssetId}
          initialTrimStart={value.voiceTrimStart}
          initialTrimEnd={value.voiceTrimEnd}
          onSave={(voiceId, trimStart, trimEnd) => {
            onChange({
              ...value,
              voiceAssetId: voiceId,
              voiceTrimStart: trimStart,
              voiceTrimEnd: trimEnd,
              sounds: { ...value.sounds, reminder: true },
            });
          }}
          onClose={() => setShowRecorder(false)}
        />
      )}
    </form>
  );
}
