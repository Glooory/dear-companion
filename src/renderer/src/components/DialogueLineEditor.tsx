import React, { useRef } from "react";
import { clsx } from "clsx";
import { type DialogueCategory } from "@shared/dialogue-catalog";
import { ADDRESS_PLACEHOLDER } from "@shared/dialogue-settings";
import styles from "./DialogueLineEditor.module.css";

export interface DialogueLineRowModel {
  readonly id: string;
  readonly category: DialogueCategory;
  readonly source: "builtin" | "custom";
  readonly currentText: string;
  readonly defaultText?: string;
  readonly automaticEnabled: boolean;
  readonly isModified?: boolean;
  readonly issue?: string;
}

export interface DialogueLineEditorProps {
  readonly row: DialogueLineRowModel;
  readonly address: string;
  readonly onTextChange: (text: string) => void;
  readonly onToggleAutomatic: (enabled: boolean) => void;
  readonly onRestore?: () => void;
  readonly onDelete?: () => void;
  readonly onInputFocus?: (el: HTMLInputElement) => void;
  readonly onBlur?: () => void;
}

export function DialogueLineEditor({
  row,
  address,
  onTextChange,
  onToggleAutomatic,
  onRestore,
  onDelete,
  onInputFocus,
  onBlur,
}: DialogueLineEditorProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
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
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={row.automaticEnabled}
            onChange={(e) => onToggleAutomatic(e.target.checked)}
            aria-label="自动使用"
          />
          <span className={styles.toggleLabel}>自动使用</span>
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
                <span className={styles.previewNotice}>设置称呼后，这句才会自动使用</span>
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
    </div>
  );
}
