import { type DialogueCategory } from '@shared/dialogue-catalog'
import { ADDRESS_PLACEHOLDER } from '@shared/dialogue-settings'
import React, { useRef } from 'react'

export interface DialogueLineRowModel {
  readonly id: string
  readonly category: DialogueCategory
  readonly source: 'builtin' | 'custom'
  readonly currentText: string
  readonly defaultText?: string
  readonly automaticEnabled: boolean
  readonly isModified?: boolean
  readonly issue?: string
}

export interface DialogueLineEditorProps {
  readonly row: DialogueLineRowModel
  readonly address: string
  readonly onTextChange: (text: string) => void
  readonly onToggleAutomatic: (enabled: boolean) => void
  readonly onRestore?: () => void
  readonly onDelete?: () => void
  readonly onInputFocus?: (el: HTMLInputElement) => void
}

export function DialogueLineEditor({
  row,
  address,
  onTextChange,
  onToggleAutomatic,
  onRestore,
  onDelete,
  onInputFocus
}: DialogueLineEditorProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = `dialogue-input-${row.category}-${row.id}`
  const errorId = `dialogue-error-${row.category}-${row.id}`
  const hasPlaceholder = row.currentText.includes(ADDRESS_PLACEHOLDER)
  const trimmedAddress = address.trim()

  return (
    <div className={`dialogue-settings-line-row ${row.issue ? 'has-error' : ''}`}>
      <div className="dialogue-settings-line-main">
        <label className="dialogue-settings-toggle">
          <input
            type="checkbox"
            checked={row.automaticEnabled}
            onChange={(e) => onToggleAutomatic(e.target.checked)}
            aria-label="自动使用"
          />
          <span className="dialogue-settings-toggle-label">自动使用</span>
        </label>

        <div className="dialogue-settings-input-wrapper">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="dialogue-settings-input"
            value={row.currentText}
            onChange={(e) => onTextChange(e.target.value)}
            onFocus={() => {
              if (inputRef.current && onInputFocus) {
                onInputFocus(inputRef.current)
              }
            }}
            aria-invalid={Boolean(row.issue)}
            aria-describedby={row.issue ? errorId : undefined}
            placeholder={row.source === 'builtin' ? row.defaultText : '输入对白内容'}
          />

          {hasPlaceholder && (
            <div className="dialogue-settings-preview">
              {trimmedAddress.length === 0 ? (
                <span className="dialogue-settings-preview-notice">
                  设置称呼后，这句才会自动使用
                </span>
              ) : (
                <span className="dialogue-settings-preview-text">
                  预览：{row.currentText.replaceAll(ADDRESS_PLACEHOLDER, trimmedAddress)}
                </span>
              )}
            </div>
          )}

          {row.issue && (
            <div id={errorId} className="dialogue-settings-inline-error" role="alert">
              {row.issue}
            </div>
          )}
        </div>

        <div className="dialogue-settings-line-meta">
          <span
            className={`dialogue-settings-badge ${row.source === 'builtin' ? 'badge-builtin' : 'badge-custom'} ${row.isModified ? 'badge-modified' : ''}`}
          >
            {row.source === 'builtin'
              ? row.isModified
                ? '内置 · 已修改'
                : '内置'
              : '我的'}
          </span>

          {row.source === 'builtin' && row.isModified && onRestore && (
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={onRestore}
              aria-label="恢复原句"
            >
              恢复原句
            </button>
          )}

          {row.source === 'custom' && onDelete && (
            <button
              type="button"
              className="ghost-button compact-button danger"
              onClick={onDelete}
              aria-label="删除"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
