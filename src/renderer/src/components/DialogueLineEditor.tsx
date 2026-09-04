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
  readonly voiceAvailable?: boolean;
  readonly issue?: string;
}

export interface DialogueLineEditorProps {
  readonly petId: string;
  readonly row: DialogueLineRowModel;
  readonly address: string;
  readonly voiceVolume: number;
  readonly onTextChange: (text: string) => void;
  readonly onToggleAutomatic: (enabled: boolean) => void;
  readonly onVoiceChange: (voiceAssetId: string | undefined) => void;
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
  onTextChange,
  onToggleAutomatic,
  onVoiceChange,
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  const releaseAudition = (audio = audioRef.current): void => {
    if (!audio) return;
    if (audioRef.current === audio) audioRef.current = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = "";
    setIsPlayingVoice(false);
  };

  useEffect(() => {
    return () => {
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
    audio.onended = () => releaseAudition(audio);
    audio.onerror = () => {
      releaseAudition(audio);
      setFailedVoiceId(row.voiceAssetId ?? null);
    };
    void audio
      .play()
      .then(() => {
        setFailedVoiceId(null);
        setIsPlayingVoice(true);
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

  const badgeClass = clsx(
    styles.badge,
    row.source === "builtin" ? styles.badgeBuiltin : styles.badgeCustom,
    row.isModified && styles.badgeModified
  );

  return (
    <div className={clsx(styles.row, row.issue && styles.hasError)}>
      <div className={styles.main}>
        <label
          className={styles.toggle}
          title={row.automaticEnabled ? "点击停用" : "点击启用"}
        >
          <input
            type="checkbox"
            checked={row.automaticEnabled}
            onChange={(e) => onToggleAutomatic(e.target.checked)}
            aria-label="启用这句对白"
          />
        </label>

        <div className={styles.inputWrapper}>
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

          {hasPlaceholder && (
            <div className={styles.preview}>
              {trimmedAddress.length === 0 ? (
                <span className={styles.previewNotice}>设置称呼后，这句才会生效</span>
              ) : (
                <span className={styles.previewText}>
                  预览：{row.currentText.replaceAll(ADDRESS_PLACEHOLDER, trimmedAddress)}
                </span>
              )}
            </div>
          )}

          {row.issue && (
            <div id={errorId} className={styles.inlineError} role="alert">
              {row.issue}
            </div>
          )}
        </div>

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
                aria-label="更换声音"
              >
                更换
              </button>
              <button
                type="button"
                className={styles.voiceDeleteBtn}
                onClick={() => {
                  onVoiceChange(undefined);
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

          <span className={badgeClass}>
            {row.source === "builtin" ? (row.isModified ? "内置 · 已修改" : "内置") : "我的"}
          </span>

          {row.source === "builtin" && row.isModified && onRestore && (
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={onRestore}
              aria-label={`恢复原句：${row.defaultText ?? row.currentText}`}
            >
              恢复原句
            </button>
          )}

          {row.source === "custom" && onDelete && (
            <button
              type="button"
              className="ghost-button compact-button danger"
              onClick={onDelete}
              aria-label={`删除对白：${row.currentText || "未命名对白"}`}
            >
              删除
            </button>
          )}
        </div>
      </div>

      {showRecorder && (
        <VoiceRecorderPopover
          petId={petId}
          dialogueText={row.currentText || row.defaultText || ""}
          mode={row.voiceAssetId ? "replace" : "add"}
          volume={voiceVolume}
          onSave={(voiceId) => {
            onVoiceChange(voiceId);
          }}
          onClose={() => setShowRecorder(false)}
        />
      )}
    </div>
  );
}
