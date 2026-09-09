import { useEffect, useRef, useState } from "react";
import type { AudioSettingsV3, AudioSource, AudioSourceInput } from "@shared/contracts";
import { playAudioSource } from "../audio/use-audio-playback";
import styles from "./AudioSettings.module.css";

interface Props {
  audio: AudioSettingsV3;
  disabled: boolean;
  onImport(): void;
  onChange(input: AudioSourceInput): void;
}

export function AudioSettings({ audio, disabled, onImport, onChange }: Props): React.JSX.Element {
  const [playingCue, setPlayingCue] = useState<"reminder" | "crying" | null>(null);
  const stopPreviewRef = useRef<(() => void) | null>(null);

  const stopPreview = (): void => {
    if (stopPreviewRef.current) {
      stopPreviewRef.current();
      stopPreviewRef.current = null;
    }
    setPlayingCue(null);
  };

  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  const handlePreview = (cue: "reminder" | "crying", source: AudioSource): void => {
    if (playingCue === cue) {
      stopPreview();
      return;
    }
    stopPreview();
    setPlayingCue(cue);
    stopPreviewRef.current = playAudioSource(cue, source, () => {
      setPlayingCue((current) => (current === cue ? null : current));
    });
  };

  const update = (cue: "reminder" | "crying", value: string): void => {
    stopPreview();
    const source: AudioSource =
      value === "builtin"
        ? {
            kind: "builtin",
            id: cue === "reminder" ? "gentle-chime" : "soft-whimper",
          }
        : { kind: "imported", assetId: value };
    onChange({
      reminderSource: cue === "reminder" ? source : audio.reminderSource,
      cryingSource: cue === "crying" ? source : audio.cryingSource,
    });
  };

  return (
    <article className={styles.card}>
      <div className="editor-heading-row">
        <div>
          <h2>提醒声音</h2>
          <p className={styles.subtext}>选择默认声音；是否播放由每条休息提醒单独设置。</p>
        </div>
        <button type="button" className="secondary-button" disabled={disabled} onClick={onImport}>
          导入提示音
        </button>
      </div>

      {(["reminder", "crying"] as const).map((cue) => {
        const source = cue === "reminder" ? audio.reminderSource : audio.cryingSource;
        const isPlaying = playingCue === cue;
        return (
          <div className={styles.control} key={cue}>
            <label className={styles.source}>
              <span>{cue === "reminder" ? "休息提醒音" : "休息督促音"}</span>
              <select
                disabled={disabled}
                value={source.kind === "builtin" ? "builtin" : source.assetId}
                onChange={(event) => update(cue, event.currentTarget.value)}
              >
                <option value="builtin">{cue === "reminder" ? "轻柔双音提示音" : "轻声督促音"}</option>
                {audio.assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.fileName}
                    {asset.available ? "" : "（无法播放，将使用内置声音）"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`secondary-button ${styles.previewButton}${isPlaying ? ` ${styles.isPlaying}` : ""}`}
              disabled={disabled}
              onClick={() => handlePreview(cue, source)}
              title="试听声音"
            >
              {isPlaying ? "停止" : "试听"}
            </button>
          </div>
        );
      })}
    </article>
  );
}
