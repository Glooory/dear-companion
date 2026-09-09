import React, { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { type DialogueCategory } from "@shared/dialogue-catalog";
import { ADDRESS_PLACEHOLDER } from "@shared/dialogue-settings";
import { VoiceRecorderPopover } from "./VoiceRecorderPopover";
import styles from "./DialogueLineEditor.module.css";

export interface DialogueLineRowModel {
  readonly id: string;
  readonly category: DialogueCategory;
  readonly source: "builtin" | "custom";
  readonly currentText: string;
  readonly defaultText?: string;
  readonly automaticEnabled: boolean;
  readonly isModified?: boolean;
  readonly voiceAssetId?: string;
  readonly voiceTrimStart?: number;
  readonly voiceTrimEnd?: number;
  readonly voiceAvailable?: boolean;
  readonly issue?: string;
}

export interface DialoguePreviewPayload {
  readonly text: string;
  readonly voiceAssetId?: string;
  readonly voiceTrimStart?: number;
  readonly voiceTrimEnd?: number;
}

export interface DialogueLineEditorProps {
  readonly petId: string;
  readonly row: DialogueLineRowModel;
  readonly address: string;
  readonly voiceVolume: number;
  readonly quickDialogueSelected?: boolean;
  readonly quickDialogueDisabled?: boolean;
  readonly quickDialogueUnavailableReason?: string;
  readonly onToggleQuickDialogue?: () => void;
  readonly onTextChange: (text: string) => void;
  readonly onToggleAutomatic: (enabled: boolean) => void;
  readonly onVoiceChange: (voiceAssetId: string | undefined, trimStart?: number, trimEnd?: number) => void;
  readonly onPreview?: (payload: DialoguePreviewPayload) => void;
  readonly onRestore?: () => void;
  readonly onDelete?: () => void;
  readonly onInputFocus?: (el: HTMLInputElement) => void;
  readonly onBlur?: () => void;
}

export function DialogueLineEditor({
  petId,
  row,
  address,
  voiceVolume,
  quickDialogueSelected,
  quickDialogueDisabled,
  quickDialogueUnavailableReason,
  onToggleQuickDialogue,
  onTextChange,
  onToggleAutomatic,
  onVoiceChange,
  onPreview,
  onRestore,
  onDelete,
  onInputFocus,
  onBlur,
}: DialogueLineEditorProps): React.JSX.Element {
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [failedVoiceId, setFailedVoiceId] = useState<string | null>(null);
  const [prevVoiceAssetId, setPrevVoiceAssetId] = useState(row.voiceAssetId);
  if (row.voiceAssetId !== prevVoiceAssetId) {
    setPrevVoiceAssetId(row.voiceAssetId);
    setFailedVoiceId(null);
  }
  const [showRecorder, setShowRecorder] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
  }, [row.voiceAssetId]);
  const voiceUnavailable = row.voiceAvailable === false || failedVoiceId === row.voiceAssetId;

  const toggleVoiceAudition = (): void => {
    if (!row.voiceAssetId) return;
    if (isPlayingVoice && audioRef.current) {
      releaseAudition();
      return;
    }
    if (audioRef.current) {
      releaseAudition();
    }
    const url = `app://renderer/pet-voices/${encodeURIComponent(petId)}/${encodeURIComponent(row.voiceAssetId)}`;
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, voiceVolume));
    audioRef.current = audio;

    const trimStart = row.voiceTrimStart ?? 0;
    const trimEnd = row.voiceTrimEnd;

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
      setFailedVoiceId(row.voiceAssetId ?? null);
    };
    if (trimStart > 0) {
      audio.currentTime = trimStart;
    }
    void audio
      .play()
      .then(() => {
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
        setFailedVoiceId(row.voiceAssetId ?? null);
      });
  };
  const inputId = `dialogue-input-${row.category}-${row.id}`;
  const errorId = `dialogue-error-${row.category}-${row.id}`;
  const hasPlaceholder = row.currentText.includes(ADDRESS_PLACEHOLDER);
  const trimmedAddress = address.trim();

  return (
    <div className={clsx(styles.row, row.issue && styles.hasError, row.source === "custom" && styles.customRow)}>
      <div className={styles.main}>
        <label className={styles.toggle} title={row.automaticEnabled ? "点击停用" : "点击启用"}>
          <input
            type="checkbox"
            checked={row.automaticEnabled}
            onChange={(e) => onToggleAutomatic(e.target.checked)}
            aria-label="启用这句对白"
          />
        </label>

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className={styles.input}
          value={row.currentText}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => {
            if (inputRef.current && onInputFocus) {
              onInputFocus(inputRef.current);
            }
          }}
          onBlur={onBlur}
          aria-invalid={Boolean(row.issue)}
          aria-describedby={row.issue ? errorId : undefined}
          placeholder={row.source === "builtin" ? row.defaultText : "输入对白内容"}
        />

        <div className={styles.meta}>
          {row.voiceAssetId ? (
            <div className={clsx(styles.voiceCapsule, voiceUnavailable && styles.voiceUnavailable)}>
              <button
                type="button"
                className={styles.voicePlayBtn}
                onClick={toggleVoiceAudition}
                aria-label={isPlayingVoice ? "暂停对白声音" : "试听对白声音"}
              >
                {isPlayingVoice ? (
                  <svg viewBox="0 0 10 10" width="8" height="8" fill="currentColor" aria-hidden="true">
                    <rect x="1.5" y="1" width="2.5" height="8" rx="0.5" />
                    <rect x="6" y="1" width="2.5" height="8" rx="0.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 10 10" width="8" height="8" fill="currentColor" aria-hidden="true">
                    <polygon points="2.5,1.5 8.5,5 2.5,8.5" />
                  </svg>
                )}
                <span>{isPlayingVoice ? "暂停" : "试听"}</span>
              </button>
              {voiceUnavailable && <span role="status">声音不可用</span>}
              <button
                type="button"
                className={styles.voiceActionBtn}
                onClick={() => setShowRecorder(true)}
                aria-label="编辑声音"
              >
                编辑
              </button>
              <button
                type="button"
                className={styles.voiceDeleteBtn}
                onClick={() => {
                  onVoiceChange(undefined, undefined, undefined);
                }}
                aria-label="删除声音"
              >
                删除
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.addVoiceBtn}
              onClick={() => setShowRecorder(true)}
              aria-label="添加声音"
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
              <span>声音</span>
            </button>
          )}

          {onPreview && (
            <button
              type="button"
              className={styles.previewBtn}
              onClick={() => {
                if (isPlayingVoice) {
                  releaseAudition();
                }
                onPreview({
                  text: row.currentText || row.defaultText || "",
                  voiceAssetId: row.voiceAssetId,
                  voiceTrimStart: row.voiceTrimStart,
                  voiceTrimEnd: row.voiceTrimEnd,
                });
              }}
              aria-label={`预览对白：${row.currentText || row.defaultText || "未命名对白"}`}
            >
              预览
            </button>
          )}

          {onToggleQuickDialogue && (
            <span
              className={styles.quickDialogueWrapper}
              title={
                quickDialogueSelected
                  ? "已设为常用（点击取消）。设为常用后，可在伙伴右键菜单中直接点击播放。"
                  : quickDialogueDisabled
                    ? quickDialogueUnavailableReason
                      ? `${quickDialogueUnavailableReason}。设为常用后可在伙伴右键菜单直接播放（每个伙伴最多 3 句）。`
                      : "常用对白最多选择 3 句。可在上方常用对白区域移除已有项目后再添加。"
                    : "设为常用后，可在伙伴右键菜单中直接点击使用。每个伙伴最多可设 3 句。"
              }
            >
              <button
                type="button"
                className={clsx(styles.quickDialogueBtn, quickDialogueSelected && styles.quickDialogueBtnSelected)}
                onClick={onToggleQuickDialogue}
                disabled={quickDialogueDisabled && !quickDialogueSelected}
                aria-pressed={quickDialogueSelected}
                aria-label={
                  quickDialogueSelected
                    ? `从常用对白移除：${row.currentText || row.defaultText || "未命名对白"}`
                    : `设为常用：${row.currentText || row.defaultText || "未命名对白"}`
                }
              >
                <span>常用</span>
              </button>
            </span>
          )}

          {row.source === "builtin" ? (
            <button
              type="button"
              className={clsx(
                styles.lifecycleBtn,
                row.isModified ? styles.restoreBtnActive : styles.lifecycleBtnDisabled
              )}
              onClick={row.isModified ? onRestore : undefined}
              disabled={!row.isModified}
              aria-label={
                row.isModified ? `恢复原句：${row.defaultText ?? row.currentText}` : "当前为内置原句，无需复原"
              }
              title={row.isModified ? `恢复原句：${row.defaultText ?? ""}` : "当前为内置原句（未修改）"}
            >
              复原
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.lifecycleBtn, styles.deleteBtn)}
              onClick={onDelete}
              aria-label={`删除对白：${row.currentText || "未命名对白"}`}
              title="删除这句自定义对白"
            >
              删除
            </button>
          )}
        </div>

        {hasPlaceholder && (
          <div className={styles.previewRow}>
            {trimmedAddress.length === 0 ? (
              <span className={styles.previewNotice}>设置称呼后，这句才会生效</span>
            ) : (
              <span
                className={styles.previewText}
                title={`预览：${row.currentText.replaceAll(ADDRESS_PLACEHOLDER, trimmedAddress)}`}
              >
                预览：{row.currentText.replaceAll(ADDRESS_PLACEHOLDER, trimmedAddress)}
              </span>
            )}
          </div>
        )}

        {row.issue && (
          <div id={errorId} className={styles.inlineErrorRow} role="alert">
            {row.issue}
          </div>
        )}
      </div>

      {showRecorder && (
        <VoiceRecorderPopover
          petId={petId}
          dialogueText={row.currentText || row.defaultText || ""}
          mode={row.voiceAssetId ? "replace" : "add"}
          volume={voiceVolume}
          initialVoiceAssetId={row.voiceAssetId}
          initialTrimStart={row.voiceTrimStart}
          initialTrimEnd={row.voiceTrimEnd}
          onSave={(voiceId, trimStart, trimEnd) => {
            onVoiceChange(voiceId, trimStart, trimEnd);
          }}
          onClose={() => setShowRecorder(false)}
        />
      )}
    </div>
  );
}
