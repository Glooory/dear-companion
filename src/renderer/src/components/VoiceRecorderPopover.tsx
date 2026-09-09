import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { extractPcmFromAudioBuffer, PcmAudioData, sliceAndEncodeWav } from "../dialogues/audio-encoder";
import { computeWaveformBars } from "../dialogues/audio-waveform";
import { AudioWaveformTrimmer } from "./AudioWaveformTrimmer";
import styles from "./VoiceRecorderPopover.module.css";

export interface VoiceRecorderPopoverProps {
  petId?: string;
  target?: "pet" | "reminder";
  dialogueText: string;
  mode: "add" | "replace";
  volume: number;
  initialVoiceAssetId?: string;
  initialTrimStart?: number;
  initialTrimEnd?: number;
  onSave: (voiceId: string, trimStart?: number, trimEnd?: number) => void;
  onClose: () => void;
}

type RecorderStatus = "idle" | "requesting" | "recording" | "recorded" | "saving";
const MAX_RECORD_SECONDS = 8;

interface AudioEditorData {
  audioBuffer: AudioBuffer;
  pcm: PcmAudioData;
  bars: number[];
  duration: number;
  trimStart: number;
  trimEnd: number;
  sourceType: "recorded" | "imported" | "existing";
  rawBytes?: Uint8Array;
  rawExt?: string;
}

export function VoiceRecorderPopover({
  petId,
  target = "pet",
  dialogueText,
  mode,
  volume,
  initialVoiceAssetId,
  initialTrimStart,
  initialTrimEnd,
  onSave,
  onClose,
}: VoiceRecorderPopoverProps): React.JSX.Element {
  const [status, setStatus] = useState<RecorderStatus>(initialVoiceAssetId ? "saving" : "idle");
  const [elapsed, setElapsed] = useState(0);
  const [editorData, setEditorData] = useState<AudioEditorData | null>(null);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const initialButtonRef = useRef<HTMLButtonElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);

  const getAudioContext = (): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
    }
    return audioCtxRef.current;
  };

  const stopStream = (stream = streamRef.current): void => {
    stream?.getTracks().forEach((track) => track.stop());
    if (stream === streamRef.current) streamRef.current = null;
  };

  const stopPlayback = (): void => {
    if (seekTimerRef.current) {
      clearTimeout(seekTimerRef.current);
      seekTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.onended = null;
        playbackSourceRef.current.stop();
        playbackSourceRef.current.disconnect();
      } catch {
        // ignore already stopped source
      }
      playbackSourceRef.current = null;
    }
    if (mountedRef.current) {
      setIsPlaying(false);
    }
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
      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
        seekTimerRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (playbackSourceRef.current) {
        try {
          playbackSourceRef.current.onended = null;
          playbackSourceRef.current.stop();
          playbackSourceRef.current.disconnect();
        } catch {
          // ignore
        }
        playbackSourceRef.current = null;
      }
      audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    if (!initialVoiceAssetId) return;
    const operation = ++operationRef.current;
    const loadPromise =
      target === "reminder"
        ? window.dearCompanion.getReminderVoice(initialVoiceAssetId)
        : petId
          ? window.dearCompanion.getPetVoice(petId, initialVoiceAssetId)
          : Promise.resolve(null);

    void loadPromise
      .then(async (result) => {
        if (!result) throw new Error("voice-not-found");
        if (!mountedRef.current || operation !== operationRef.current) return;
        const copy = new Uint8Array(result.data.byteLength);
        copy.set(result.data);
        const ctx = getAudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        const audioBuffer = await ctx.decodeAudioData(copy.buffer);
        const pcm = extractPcmFromAudioBuffer(audioBuffer);
        const bars = computeWaveformBars(pcm.channels, { barCount: 64 });
        const dur = audioBuffer.duration;
        if (!mountedRef.current || operation !== operationRef.current) return;
        const start = Math.max(0, Math.min(dur, initialTrimStart ?? 0));
        const end = Math.max(start + 0.05, Math.min(dur, initialTrimEnd ?? dur));

        setEditorData({
          audioBuffer,
          pcm,
          bars,
          duration: dur,
          trimStart: start,
          trimEnd: end,
          sourceType: "existing",
        });
        setCurrentPlaybackTime(start);
        setStatus("recorded");
      })
      .catch(() => {
        if (!mountedRef.current || operation !== operationRef.current) return;
        setErrorMessage("无法加载现有声音，可以重新录制或选择新音频。");
        setStatus("idle");
      });
  }, [initialTrimEnd, initialTrimStart, initialVoiceAssetId, petId, target]);

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
    setEditorData(null);
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
      recorder.onstop = async () => {
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

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const ctx = getAudioContext();
          if (ctx.state === "suspended") await ctx.resume();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
          const pcm = extractPcmFromAudioBuffer(audioBuffer);
          const bars = computeWaveformBars(pcm.channels, { barCount: 64 });
          const dur = audioBuffer.duration;

          if (!mountedRef.current || operation !== operationRef.current) return;
          const fullWavBytes = sliceAndEncodeWav(pcm, 0);
          setEditorData({
            audioBuffer,
            pcm,
            bars,
            duration: dur,
            trimStart: 0,
            trimEnd: dur,
            sourceType: "recorded",
            rawBytes: fullWavBytes,
            rawExt: "wav",
          });
          setCurrentPlaybackTime(0);
          setStatus("recorded");
        } catch {
          if (!mountedRef.current || operation !== operationRef.current) return;
          setErrorMessage("解析录音失败，请再试一次。");
          setStatus("idle");
        }
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
    if (!editorData) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }

    stopPlayback();
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    // Determine start offset
    let startOffset = currentPlaybackTime;
    if (startOffset < editorData.trimStart || startOffset >= editorData.trimEnd - 0.05) {
      startOffset = editorData.trimStart;
      setCurrentPlaybackTime(startOffset);
    }

    const durationToPlay = Math.max(0.05, editorData.trimEnd - startOffset);
    const source = ctx.createBufferSource();
    source.buffer = editorData.audioBuffer;

    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));

    source.connect(gain);
    gain.connect(ctx.destination);
    playbackSourceRef.current = source;

    const playbackStartTime = ctx.currentTime;
    setIsPlaying(true);

    const updateFrame = (): void => {
      if (!mountedRef.current) return;
      const progress = ctx.currentTime - playbackStartTime;
      const currentPos = startOffset + progress;

      if (currentPos >= editorData.trimEnd) {
        stopPlayback();
        setCurrentPlaybackTime(editorData.trimStart);
      } else {
        setCurrentPlaybackTime(currentPos);
        rafRef.current = requestAnimationFrame(updateFrame);
      }
    };

    source.onended = () => {
      stopPlayback();
      setCurrentPlaybackTime(editorData.trimStart);
    };

    try {
      source.start(0, startOffset, durationToPlay);
      rafRef.current = requestAnimationFrame(updateFrame);
    } catch {
      stopPlayback();
      setErrorMessage("试听失败，请重新录制或选择音频。");
    }
  };

  const handleSeek = (time: number): void => {
    if (!editorData) return;
    const clamped = Math.max(editorData.trimStart, Math.min(editorData.trimEnd, time));
    setCurrentPlaybackTime(clamped);
    if (isPlaying) {
      stopPlayback();
      // Restart playback from new seek point
      seekTimerRef.current = setTimeout(() => {
        seekTimerRef.current = null;
        if (!mountedRef.current) return;
        const ctx = getAudioContext();
        if (ctx.state === "suspended") void ctx.resume();
        const durationToPlay = Math.max(0.05, editorData.trimEnd - clamped);
        const source = ctx.createBufferSource();
        source.buffer = editorData.audioBuffer;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));
        source.connect(gain);
        gain.connect(ctx.destination);
        playbackSourceRef.current = source;

        const startTime = ctx.currentTime;
        setIsPlaying(true);

        const updateFrame = (): void => {
          if (!mountedRef.current) return;
          const currentPos = clamped + (ctx.currentTime - startTime);
          if (currentPos >= editorData.trimEnd) {
            stopPlayback();
            setCurrentPlaybackTime(editorData.trimStart);
          } else {
            setCurrentPlaybackTime(currentPos);
            rafRef.current = requestAnimationFrame(updateFrame);
          }
        };

        source.onended = () => {
          stopPlayback();
          setCurrentPlaybackTime(editorData.trimStart);
        };

        source.start(0, clamped, durationToPlay);
        rafRef.current = requestAnimationFrame(updateFrame);
      }, 20);
    }
  };

  const handleTrimChange = (start: number, end: number): void => {
    if (!editorData) return;
    setEditorData({
      ...editorData,
      trimStart: start,
      trimEnd: end,
    });
    if (currentPlaybackTime < start || currentPlaybackTime > end) {
      setCurrentPlaybackTime(start);
    }
    if (isPlaying) {
      stopPlayback();
    }
  };

  const handleResetTrim = (): void => {
    if (!editorData) return;
    setEditorData({
      ...editorData,
      trimStart: 0,
      trimEnd: editorData.duration,
    });
    setCurrentPlaybackTime(0);
    if (isPlaying) {
      stopPlayback();
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!editorData || status === "saving") return;
    const operation = ++operationRef.current;
    setStatus("saving");
    setErrorMessage(null);
    stopPlayback();

    const isStartTrimmed = editorData.trimStart > 0.02;
    const isEndTrimmed = editorData.trimEnd < editorData.duration - 0.02;
    const trimStart = isStartTrimmed ? Math.round(editorData.trimStart * 100) / 100 : undefined;
    const trimEnd = isEndTrimmed ? Math.round(editorData.trimEnd * 100) / 100 : undefined;

    try {
      let voiceId = initialVoiceAssetId;
      if (editorData.sourceType !== "existing") {
        if (!editorData.rawBytes || !editorData.rawExt) {
          throw new Error("Missing audio source data");
        }
        if (target === "reminder") {
          const saved = await window.dearCompanion.saveReminderVoice(editorData.rawBytes, editorData.rawExt);
          voiceId = saved.voiceId;
        } else {
          if (!petId) throw new Error("Missing petId");
          const saved = await window.dearCompanion.savePetVoice(petId, editorData.rawBytes, editorData.rawExt);
          voiceId = saved.voiceId;
        }
      }
      if (!voiceId) {
        throw new Error("No voice ID resolved");
      }
      if (!mountedRef.current || operation !== operationRef.current) return;
      onSave(voiceId, trimStart, trimEnd);
      onClose();
    } catch {
      if (!mountedRef.current || operation !== operationRef.current) return;
      setErrorMessage("保存声音失败，截取片段仍在这里，可以再试一次。");
      setStatus("recorded");
    }
  };

  const handleChooseFile = async (): Promise<void> => {
    if (status !== "idle" && status !== "recorded") return;
    const operation = ++operationRef.current;
    setStatus("saving");
    setErrorMessage(null);
    stopPlayback();
    try {
      const result =
        target === "reminder"
          ? await window.dearCompanion.pickReminderVoiceSource()
          : petId
            ? await window.dearCompanion.pickPetVoiceSource(petId)
            : null;
      if (!mountedRef.current || operation !== operationRef.current) return;
      if (result?.data) {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        const copy = new Uint8Array(result.data.byteLength);
        copy.set(result.data);
        const audioBuffer = await ctx.decodeAudioData(copy.buffer);
        const pcm = extractPcmFromAudioBuffer(audioBuffer);
        const bars = computeWaveformBars(pcm.channels, { barCount: 64 });
        const dur = audioBuffer.duration;

        if (!mountedRef.current || operation !== operationRef.current) return;
        setEditorData({
          audioBuffer,
          pcm,
          bars,
          duration: dur,
          trimStart: 0,
          trimEnd: dur,
          sourceType: "imported",
          rawBytes: result.data,
          rawExt: result.ext,
        });
        setCurrentPlaybackTime(0);
        setStatus("recorded");
      } else {
        setStatus(editorData ? "recorded" : "idle");
      }
    } catch {
      if (!mountedRef.current || operation !== operationRef.current) return;
      setErrorMessage("导入失败。请选择不超过 5 MB 的 MP3、WAV、OGG、WebM 或 M4A 音频。");
      setStatus(editorData ? "recorded" : "idle");
    }
  };

  const handleResetRecording = (): void => {
    operationRef.current += 1;
    releaseRecorder();
    stopPlayback();
    setEditorData(null);
    setElapsed(0);
    setErrorMessage(null);
    setStatus("idle");
  };

  const remainingSeconds = Math.max(0, MAX_RECORD_SECONDS - Math.floor(elapsed));
  const progress = Math.min(1, elapsed / MAX_RECORD_SECONDS);
  const circumference = 2 * Math.PI * 42;
  const title = `${mode === "replace" ? "更换" : "添加"}${target === "reminder" ? "提醒语音" : "对白声音"}`;

  const modalContent = (
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
          {status === "saving" && !editorData && (
            <span className={styles.statusLabel} role="status">
              正在加载声音…
            </span>
          )}

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
                <span>{status === "requesting" ? "正在等待麦克风权限…" : "开始录音"}</span>
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

          {(status === "recorded" || status === "saving") && editorData && (
            <AudioWaveformTrimmer
              waveformBars={editorData.bars}
              duration={editorData.duration}
              trimStart={editorData.trimStart}
              trimEnd={editorData.trimEnd}
              currentTime={currentPlaybackTime}
              isPlaying={isPlaying}
              disabled={status === "saving"}
              onTrimChange={handleTrimChange}
              onSeek={handleSeek}
              onTogglePlay={handleToggleAudition}
              onResetTrim={handleResetTrim}
            />
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

        {(status === "recorded" || status === "saving") && editorData && (
          <div className={styles.footerActions}>
            <button
              type="button"
              className="ghost-button"
              disabled={status === "saving"}
              onClick={handleResetRecording}
            >
              换一段声音
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={status === "saving"}
              onClick={() => void handleSave()}
            >
              {status === "saving"
                ? "正在处理声音…"
                : editorData.sourceType === "recorded"
                  ? "使用这段录音"
                  : "使用这段音频"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
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
