import React from "react";
import { clsx } from "clsx";
import type { CompanionPace } from "@shared/contracts";
import { InfoTooltip } from "./Tooltip";
import styles from "./CompanionPreferences.module.css";

const PACE_OPTIONS = [
  {
    value: "quiet",
    label: "安静",
    tagline: "轻微呼吸 · 很少走动和说话",
  },
  {
    value: "natural",
    label: "自然",
    tagline: "偶尔活动 · 适合日常陪伴",
  },
  {
    value: "lively",
    label: "爱玩",
    tagline: "更常走动和活动 · 偶尔主动说话",
  },
] as const;

export interface CompanionPreferencesProps {
  pace: CompanionPace;
  onPaceChange(value: CompanionPace): void;
  onPreview(value: CompanionPace): void;
}

export function CompanionPreferences({ pace, onPaceChange, onPreview }: CompanionPreferencesProps): React.JSX.Element {
  const handleKeyDown = (event: React.KeyboardEvent, index: number): void => {
    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (index + 1) % PACE_OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = (index - 1 + PACE_OPTIONS.length) % PACE_OPTIONS.length;
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onPaceChange(PACE_OPTIONS[index]!.value);
      return;
    } else {
      return;
    }
    const nextOption = PACE_OPTIONS[nextIndex]!;
    onPaceChange(nextOption.value);
    document.getElementById(`companion-pace-option-${nextOption.value}`)?.focus();
  };

  return (
    <div className={styles.preferences}>
      <div className={clsx("heading-with-tooltip", styles.headingRow)}>
        <h2 id="companion-pace-heading" className={styles.heading}>
          陪伴方式
        </h2>
        <InfoTooltip text="调整伙伴在桌面的自主活动与走动频率。" />
      </div>
      <div role="radiogroup" aria-labelledby="companion-pace-heading" className={styles.grid}>
        {PACE_OPTIONS.map((option, index) => {
          const isSelected = pace === option.value;
          return (
            <div
              key={option.value}
              id={`companion-pace-option-${option.value}`}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={clsx(styles.option, isSelected && styles.selected)}
              onClick={() => onPaceChange(option.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            >
              <div className={styles.cardTop}>
                <div className={styles.labelRow}>
                  <strong className={styles.label}>{option.label}</strong>
                  {isSelected && <span className={styles.activeIndicator} aria-hidden="true" />}
                </div>
                <span className={styles.tagline}>{option.tagline}</span>
              </div>
              <div className={styles.cardBottom}>
                <button
                  type="button"
                  className={styles.previewButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(option.value);
                  }}
                  title={`试试看${option.label}陪伴`}
                  aria-label={`试试看${option.label}陪伴`}
                >
                  试试看
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
