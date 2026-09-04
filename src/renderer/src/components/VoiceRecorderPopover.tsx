import React, { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import styles from "./VoiceRecorderPopover.module.css";

export interface VoiceRecorderPopoverProps {
  petId: string;
  dialogueText: string;
  mode: "add" | "replace";
  volume: number;
  onSave: (voiceId: string) => void;
  onClose: () => void;
}

type RecorderStatus = "idle" | "requesting" | "recording" | "recorded" | "saving";
const MAX_RECORD_SECONDS = 8;

export function VoiceRecorderPopover({
  petId,
  dialogueText,
  mode,
  volume,
  onSave,
  onClose,
}: VoiceRecorderPopoverProps): React.JSX.Element {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<{ blob: Blob; ext: string; duration: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const initialButtonRef = useRef<HTMLButtonElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);

  const revokeActiveBlobUrl = (): void => {
    if (!activeBlobUrlRef.current) return;
    URL.revokeObjectURL(activeBlobUrlRef.current);
    activeBlobUrlRef.current = null;
  };

  const stopStream = (stream = streamRef.current): void => {
    stream?.getTracks().forEach((track) => track.stop());
    if (stream === streamRef.current) streamRef.current = null;
  };

  const stopPlayback = (): void => {
    const audio = playbackAudioRef.current;
    playbackAudioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
    }
    revokeActiveBlobUrl();
    if (mountedRef.current) setIsPlaying(false);
  };

  const releaseRecorder = (): void => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    stopStream();
  };

  const close = (): void => {
    if (status === "saving") return;
    operationRef.current += 1;
    releaseRecorder();
    stopPlayback();
    onClose();
  };

  useEffect(() => {
    mountedRef.current = true;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialButtonRef.current?.focus();
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const audio = playbackAudioRef.current;
      playbackAudioRef.current = null;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.src = "";
      }
      if (activeBlobUrlRef.current) URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
      opener?.focus();
    };
  }, []);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !modalRef.current) return;
    const focusable = [...modalRef.current.querySelectorAll<HTMLElement>(focusableSelector())].filter(
      (element) => !element.hasAttribute("disabled")
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleStopRecording = (): void => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const handleStartRecording = async (): Promise<void> => {
    if (status !== "idle" && status !== "recorded") return;
    const operation = ++operationRef.current;
    setStatus("requesting");
    setErrorMessage(null);
    stopPlayback();
    setRecordedBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || operation !== operationRef.current) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      const format = selectRecorderFormat();
      if (!format) throw new Error("unsupported-recorder");

      const recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      const startTime = Date.now();

      recorder.ondataavailable = (event) => {
        if (operation === operationRef.current && event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current || operation !== operationRef.current) return;
        releaseRecorder();
        setStatus("idle");
        setErrorMessage("录音没有完成，请再试一次，或从电脑选择音频文件。");
      };
      recorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        stopStream(stream);
        mediaRecorderRef.current = null;
        if (!mountedRef.current || operation !== operationRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: format.mimeType });
        if (blob.size === 0) {
          setStatus("idle");
          setErrorMessage("没有录到声音，请再试一次。");
          return;
        }
        const duration = Math.min(MAX_RECORD_SECONDS, Math.max(0.1, (Date.now() - startTime) / 1000));
        setRecordedBlob({ blob, ext: format.ext, duration: Number(duration.toFixed(1)) });
        setStatus("recorded");
      };

      recorder.start(100);
      setStatus("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const seconds = Math.min(MAX_RECORD_SECONDS, (Date.now() - startTime) / 1000);
        setElapsed(seconds);
        if (seconds >= MAX_RECORD_SECONDS) handleStopRecording();
      }, 100);
    } catch {
      if (!mountedRef.current || operation !== operationRef.current) return;
      releaseRecorder();
      setErrorMessage("未能开启麦克风。请在系统设置中允许本应用访问麦克风，或从电脑选择音频文件。");
      setStatus("idle");
    }
  };

  const handleToggleAudition = (): void => {
    if (!recordedBlob) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const url = URL.createObjectURL(recordedBlob.blob);
    activeBlobUrlRef.current = url;
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    playbackAudioRef.current = audio;
    audio.onended = stopPlayback;
    audio.onerror = () => {
      stopPlayback();
      setErrorMessage("试听失败，请重新录制。");
    };
    void audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        stopPlayback();
        setErrorMessage("试听失败，请重新录制。");
      });
  };

  const handleSave = async (): Promise<void> => {
    if (!recordedBlob || status === "saving") return;
    const operation = ++operationRef.current;
    setStatus("saving");
    setErrorMessage(null);
    stopPlayback();
    try {
      const buffer = new Uint8Array(await recordedBlob.blob.arrayBuffer());
      if (!mountedRef.current || operation !== operationRef.current) return;
      const { voiceId } = await window.dearCompanion.savePetVoice(petId, buffer, recordedBlob.ext);
      if (!mountedRef.current || operation !== operationRef.current) return;
      onSave(voiceId);
      onClose();
    } catch {
      if (!mountedRef.current || operation !== operationRef.current) return;
      setErrorMessage("保存声音失败，录音仍在这里，可以再试一次。");
      setStatus("recorded");
    }
  };

  const handleChooseFile = async (): Promise<void> => {
    if (status !== "idle") return;
    const operation = ++operationRef.current;
    setStatus("saving");
    setErrorMessage(null);
    try {
      const result = await window.dearCompanion.chooseAndImportPetVoice(petId);
      if (!mountedRef.current || operation !== operationRef.current) return;
      if (result?.voiceId) {
        onSave(result.voiceId);
        onClose();
      } else {
        setStatus("idle");
      }
    } catch {
      if (!mountedRef.current || operation !== operationRef.current) return;
      setErrorMessage("导入失败。请选择不超过 5 MB 的 MP3、WAV、OGG、WebM 或 M4A 音频。");
      setStatus("idle");
    }
  };

  const handleResetRecording = (): void => {
    operationRef.current += 1;
    releaseRecorder();
    stopPlayback();
    setRecordedBlob(null);
    setElapsed(0);
    setErrorMessage(null);
    setStatus("idle");
  };

  const remainingSeconds = Math.max(0, MAX_RECORD_SECONDS - Math.floor(elapsed));
  const progress = Math.min(1, elapsed / MAX_RECORD_SECONDS);
  const circumference = 2 * Math.PI * 42;
  const title = mode === "replace" ? "更换对白声音" : "添加对白声音";

  return (
    <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-recorder-title"
        aria-describedby="voice-recorder-description"
        onKeyDown={handleDialogKeyDown}
      >
        <div className={styles.header}>
          <h3 id="voice-recorder-title" className={styles.title}>
            {title}
          </h3>
          <button
            type="button"
            className={styles.closeButton}
            onClick={close}
            disabled={status === "saving"}
            aria-label="关闭"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        </div>

        <div id="voice-recorder-description" className={styles.dialogueQuote} title={dialogueText}>
          “{dialogueText}”
        </div>

        {errorMessage && (
          <div className={styles.errorBanner} role="alert">
            {errorMessage}
          </div>
        )}

        <div className={styles.recorderBody}>
          {(status === "idle" || status === "requesting") && (
            <>
              <button
                ref={initialButtonRef}
                type="button"
                className={styles.recordButton}
                onClick={() => void handleStartRecording()}
                disabled={status === "requesting"}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                <span>{status === "requesting" ? "正在请求麦克风" : "开始录音"}</span>
              </button>
              <span className={styles.statusLabel}>最长 {MAX_RECORD_SECONDS} 秒</span>
            </>
          )}

          {status === "recording" && (
            <>
              <div className={styles.progressRingWrap}>
                <div className={styles.pulseRing} aria-hidden="true" />
                <svg
                  className={styles.progressRing}
                  viewBox="0 0 96 96"
                  role="progressbar"
                  aria-label="录音进度"
                  aria-valuemin={0}
                  aria-valuemax={MAX_RECORD_SECONDS}
                  aria-valuenow={Math.min(MAX_RECORD_SECONDS, Math.round(elapsed))}
                >
                  <circle className={styles.progressTrack} cx="48" cy="48" r="42" />
                  <circle
                    className={styles.progressValue}
                    cx="48"
                    cy="48"
                    r="42"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - progress)}
                  />
                </svg>
                <button
                  type="button"
                  className={clsx(styles.recordButton, styles.recording)}
                  onClick={handleStopRecording}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                    <rect x="5" y="5" width="14" height="14" rx="3" />
                  </svg>
                  <span className={styles.visuallyHidden}>停止录音</span>
                </button>
              </div>
              <div className={styles.timerDisplay} aria-hidden="true">
                {formatTimer(elapsed)} / 00:08
              </div>
              <span className={styles.statusLabel} role="status" aria-atomic="true">
                录音中，还剩 {remainingSeconds} 秒
              </span>
            </>
          )}

          {(status === "recorded" || status === "saving") && recordedBlob && (
            <div className={styles.auditionCard}>
              <button
                type="button"
                className={styles.playToggle}
                onClick={handleToggleAudition}
                disabled={status === "saving"}
              >
                {isPlaying ? "暂停试听" : "试听录音"}
              </button>
              <div className={styles.auditionInfo}>
                <span className={styles.auditionTitle}>录音完成</span>
                <span className={styles.auditionMeta}>约 {recordedBlob.duration} 秒</span>
              </div>
            </div>
          )}
        </div>

        {status === "idle" && (
          <div className={styles.importRow}>
            <button type="button" className={styles.importLink} onClick={() => void handleChooseFile()}>
              从电脑选择音频
            </button>
            <span>MP3、WAV、OGG、WebM 或 M4A，最多 5 MB</span>
          </div>
        )}

        {(status === "recorded" || status === "saving") && (
          <div className={styles.footerActions}>
            <button
              type="button"
              className="ghost-button"
              disabled={status === "saving"}
              onClick={handleResetRecording}
            >
              重新录制
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={status === "saving"}
              onClick={() => void handleSave()}
            >
              {status === "saving" ? "保存声音中…" : "使用这段录音"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function selectRecorderFormat(): { mimeType: string; ext: string } | null {
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", ext: "webm" },
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
    { mimeType: "audio/mp4", ext: "m4a" },
    { mimeType: "audio/webm", ext: "webm" },
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType)) ?? null;
}

function formatTimer(elapsed: number): string {
  return `00:${Math.min(MAX_RECORD_SECONDS, Math.floor(elapsed)).toString().padStart(2, "0")}`;
}

function focusableSelector(): string {
  return 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
}
