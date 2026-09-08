import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { CreateReminderInput, CursorTolerance } from "@shared/contracts";
import { VoiceRecorderPopover } from "./VoiceRecorderPopover";
import { WeekdayPicker } from "./WeekdayPicker";
import styles from "./ReminderEditor.module.css";

export interface ReminderDraft extends Omit<CreateReminderInput, "hour" | "minute"> {
  id?: string;
  hour: number | null;
  minute: number | null;
}

interface Props {
  value: ReminderDraft;
  disabled: boolean;
  activePetName?: string;
  onNavigateToPetDialogue?: () => void;
  onChange(value: ReminderDraft): void;
  onSave(): void;
  onCancel(): void;
  onDelete?: () => void;
}

export function ReminderEditor({
  value,
  disabled,
  activePetName,
  onNavigateToPetDialogue,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: Props): React.JSX.Element {
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

  const timeValue =
    value.hour === null || value.minute === null
      ? ""
      : `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
  const valid =
    value.hour !== null &&
    value.minute !== null &&
    value.weekdays.length > 0 &&
    value.message.trim().length >= 1 &&
    value.message.trim().length <= 200;

  return (
    <div className={styles.editor}>
      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>时间与重复</h3>
        <div className={styles.fields}>
          <label>
            <span>提醒时间</span>
            <input
              type="time"
              value={timeValue}
              onChange={(event) => {
                const [hour, minute] = event.currentTarget.value.split(":").map(Number);
                onChange({
                  ...value,
                  hour: Number.isInteger(hour) ? hour! : null,
                  minute: Number.isInteger(minute) ? minute! : null,
                });
              }}
            />
          </label>
          <label>
            <span>休息时长（分钟）</span>
            <input
              type="number"
              min={1}
              max={120}
              value={value.restDurationMinutes}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isInteger(next)) {
                  onChange({
                    ...value,
                    restDurationMinutes: Math.min(Math.max(next, 1), 120),
                  });
                }
              }}
            />
          </label>
          <label>
            <span>鼠标移动灵敏度</span>
            <select
              value={value.cursorTolerance}
              onChange={(event) =>
                onChange({
                  ...value,
                  cursorTolerance: event.currentTarget.value as CursorTolerance,
                })
              }
            >
              <option value="sensitive">轻微移动即提醒</option>
              <option value="standard">适度移动后提醒</option>
              <option value="relaxed">明显移动才提醒</option>
            </select>
          </label>
        </div>
        <WeekdayPicker
          value={value.weekdays}
          disabled={disabled}
          onChange={(weekdays) => onChange({ ...value, weekdays })}
        />
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
                  aria-label={isPlayingVoice ? "停止试听" : "试听对白语音"}
                  title={voiceUnavailable ? "对白语音文件缺失" : isPlayingVoice ? "停止试听" : "试听对白语音"}
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
                  aria-label="编辑对白语音"
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
                  aria-label="删除对白语音"
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
                aria-label="添加对白语音"
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
                <span>对白语音</span>
              </button>
            )}
          </div>
        </div>
        <label className={styles.messageField}>
          <span>提醒气泡文案</span>
          <textarea
            maxLength={200}
            value={value.message}
            onChange={(event) => onChange({ ...value, message: event.currentTarget.value })}
          />
        </label>
      </div>

      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>声音与启用状态</h3>
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
            <span className={styles.toggleSubtext}>是否在预定时间触发提醒</span>
          </label>
          <label className={styles.toggleDetailed}>
            <div className={styles.toggleMain}>
              <input
                type="checkbox"
                checked={value.sounds.reminder}
                onChange={(event) =>
                  onChange({
                    ...value,
                    sounds: { ...value.sounds, reminder: event.currentTarget.checked },
                  })
                }
              />
              <strong>{value.voiceAssetId ? "播放对白语音" : "播放休息提示音"}</strong>
            </div>
            <span className={styles.toggleSubtext}>
              {value.voiceAssetId
                ? "到点弹出提醒气泡时播放上方录制的对白语音（替代默认提示音）"
                : "到点弹出提醒气泡时播放默认提示铃声"}
            </span>
          </label>
          <label className={styles.toggleDetailed}>
            <div className={styles.toggleMain}>
              <input
                type="checkbox"
                checked={value.sounds.crying}
                onChange={(event) =>
                  onChange({
                    ...value,
                    sounds: { ...value.sounds, crying: event.currentTarget.checked },
                  })
                }
              />
              <strong>督促继续休息时播放提示音</strong>
            </div>
            <span className={styles.toggleSubtext}>
              休息期间检测到鼠标移动时发声督促。督促对白与配音随当前在场的伙伴切换
            </span>
          </label>

          {onNavigateToPetDialogue && activePetName && (
            <div className={styles.companionContextNotice}>
              <span>
                当前陪伴：<strong>{activePetName}</strong>
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

      <div className="editor-actions">
        {onDelete && (
          <button type="button" className="danger-button" disabled={disabled} onClick={onDelete}>
            删除
          </button>
        )}
        <button type="button" className="secondary-button" disabled={disabled} onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary-button" disabled={disabled || !valid} onClick={onSave}>
          保存提醒
        </button>
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
    </div>
  );
}
