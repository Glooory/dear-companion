import React, { useEffect, useRef, useState } from "react";
import styles from "./AudioWaveformTrimmer.module.css";

export interface AudioWaveformTrimmerProps {
  waveformBars: readonly number[];
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  isPlaying: boolean;
  disabled?: boolean;
  onTrimChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onResetTrim: () => void;
}

const MIN_TRIM_DURATION = 0.2; // minimum 200ms clip

export function AudioWaveformTrimmer({
  waveformBars,
  duration,
  trimStart,
  trimEnd,
  currentTime,
  isPlaying,
  disabled = false,
  onTrimChange,
  onSeek,
  onTogglePlay,
  onResetTrim,
}: AudioWaveformTrimmerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeDrag, setActiveDrag] = useState<"start" | "end" | null>(null);

  const safeDuration = Math.max(0.1, duration);
  const startPercent = Math.max(0, Math.min(100, (trimStart / safeDuration) * 100));
  const endPercent = Math.max(0, Math.min(100, (trimEnd / safeDuration) * 100));
  const currentPercent = Math.max(0, Math.min(100, (currentTime / safeDuration) * 100));

  const trimmedDuration = Math.max(0, trimEnd - trimStart);
  const isTrimmed = trimStart > 0.05 || trimEnd < safeDuration - 0.05;

  // Handle pointer dragging for handles
  useEffect(() => {
    if (!activeDrag || disabled) return;

    const handlePointerMove = (e: PointerEvent): void => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const ratio = (clientX - rect.left) / rect.width;
      const targetTime = Number((ratio * safeDuration).toFixed(2));

      if (activeDrag === "start") {
        const newStart = Math.max(0, Math.min(targetTime, trimEnd - MIN_TRIM_DURATION));
        onTrimChange(newStart, trimEnd);
      } else {
        const newEnd = Math.min(safeDuration, Math.max(targetTime, trimStart + MIN_TRIM_DURATION));
        onTrimChange(trimStart, newEnd);
      }
    };

    const handlePointerUp = (): void => {
      setActiveDrag(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeDrag, disabled, onTrimChange, safeDuration, trimEnd, trimStart]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (disabled || activeDrag) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clickedTime = ratio * safeDuration;
    // Seek within the trimmed bounds, or nearest boundary
    const seekTarget = Math.max(trimStart, Math.min(trimEnd, clickedTime));
    onSeek(seekTarget);
  };

  const handleStartKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const step = e.shiftKey ? 0.2 : 0.05;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onTrimChange(Math.max(0, trimStart - step), trimEnd);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onTrimChange(Math.min(trimEnd - MIN_TRIM_DURATION, trimStart + step), trimEnd);
    } else if (e.key === "Home") {
      e.preventDefault();
      onTrimChange(0, trimEnd);
    }
  };

  const handleEndKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const step = e.shiftKey ? 0.2 : 0.05;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onTrimChange(trimStart, Math.max(trimStart + MIN_TRIM_DURATION, trimEnd - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onTrimChange(trimStart, Math.min(safeDuration, trimEnd + step));
    } else if (e.key === "End") {
      e.preventDefault();
      onTrimChange(trimStart, safeDuration);
    }
  };

  const barCount = waveformBars.length || 64;

  return (
    <div className={styles.wrapper}>
      {/* Waveform track area */}
      <div ref={containerRef} className={styles.waveformContainer} onClick={handleContainerClick} role="presentation">
        {/* Waveform visual bars */}
        <div className={styles.barsLayer} aria-hidden="true">
          {waveformBars.map((barHeight, idx) => {
            const barRatio = (idx + 0.5) / barCount;
            const barTime = barRatio * safeDuration;
            const inActiveZone = barTime >= trimStart && barTime <= trimEnd;
            const isPlayed = inActiveZone && barTime <= currentTime;

            return (
              <div key={idx} className={styles.barWrap} style={{ height: `${Math.max(8, barHeight * 100)}%` }}>
                <div
                  className={styles.barFill}
                  data-zone={inActiveZone ? (isPlayed ? "played" : "active") : "inactive"}
                />
              </div>
            );
          })}
        </div>

        {/* Head exclusion shade (left of trimStart) */}
        <div className={styles.excludedZone} style={{ left: 0, width: `${startPercent}%` }} aria-hidden="true" />

        {/* Tail exclusion shade (right of trimEnd) */}
        <div className={styles.excludedZone} style={{ left: `${endPercent}%`, right: 0 }} aria-hidden="true" />

        {/* Active boundary frame */}
        <div
          className={styles.activeFrame}
          style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }}
          aria-hidden="true"
        />

        {/* Playhead needle */}
        {currentTime >= trimStart && currentTime <= trimEnd && (
          <div className={styles.playhead} style={{ left: `${currentPercent}%` }} aria-hidden="true" />
        )}

        {/* Left trim handle */}
        <div
          className={styles.handle}
          style={{ left: `${startPercent}%` }}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="截取起点"
          aria-valuemin={0}
          aria-valuemax={Number((trimEnd - MIN_TRIM_DURATION).toFixed(2))}
          aria-valuenow={Number(trimStart.toFixed(2))}
          aria-valuetext={`起点 ${trimStart.toFixed(1)} 秒`}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (!disabled) setActiveDrag("start");
          }}
          onKeyDown={handleStartKeyDown}
        >
          <div className={styles.handleGrip} aria-hidden="true">
            <span className={styles.handleChevron}>‹</span>
          </div>
        </div>

        {/* Right trim handle */}
        <div
          className={styles.handle}
          style={{ left: `${endPercent}%` }}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="截取终点"
          aria-valuemin={Number((trimStart + MIN_TRIM_DURATION).toFixed(2))}
          aria-valuemax={Number(safeDuration.toFixed(2))}
          aria-valuenow={Number(trimEnd.toFixed(2))}
          aria-valuetext={`终点 ${trimEnd.toFixed(1)} 秒`}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (!disabled) setActiveDrag("end");
          }}
          onKeyDown={handleEndKeyDown}
        >
          <div className={styles.handleGrip} aria-hidden="true">
            <span className={styles.handleChevron}>›</span>
          </div>
        </div>
      </div>

      {/* Time display & Reset */}
      <div className={styles.infoRow}>
        <span className={styles.timeTag}>{formatSeconds(trimStart)}</span>

        <div className={styles.durationSummary}>
          <span>已选片段：{trimmedDuration.toFixed(1)} 秒</span>
          {isTrimmed && (
            <button type="button" className={styles.resetButton} onClick={onResetTrim} disabled={disabled}>
              恢复完整
            </button>
          )}
        </div>

        <span className={styles.timeTag}>{formatSeconds(trimEnd)}</span>
      </div>

      {/* Playback action pill */}
      <div className={styles.playbackRow}>
        <button type="button" className={styles.playButton} onClick={onTogglePlay} disabled={disabled}>
          {isPlaying ? (
            <>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                <rect x="3" y="2" width="3.5" height="12" rx="1" />
                <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
              </svg>
              <span>暂停试听</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                <path d="M4 2.5v11l9-5.5-9-5.5z" />
              </svg>
              <span>试听截取片段</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m.toString().padStart(2, "0")}:${s.padStart(4, "0")}`;
}
