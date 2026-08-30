import {
  type DialogueCategory,
  type DialogueGroupId,
  DIALOGUE_CATEGORIES,
  DIALOGUE_GROUPS,
  getDialogueTriggerMeta
} from '@shared/dialogue-catalog'
import {
  ADDRESS_PLACEHOLDER,
  MAX_CUSTOM_LINES_PER_CATEGORY,
  type PetDialogueSettings,
  getDialogueValidationIssues,
  restoreBuiltInLine,
  restoreBuiltInCategory,
  type DialogueValidationIssue
} from '@shared/dialogue-settings'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DialogueLineEditor, type DialogueLineRowModel } from './DialogueLineEditor'

export interface DialogueSettingsEditorProps {
  petName: string
  settings: PetDialogueSettings
  bubblesEnabled: boolean
  drowsyEnabled: boolean
  sleepingEnabled: boolean
  validationAttempt: number
  onChange: (settings: PetDialogueSettings) => void
  onBack: () => void
  onSave?: () => void
  isBusy?: boolean
  saveSuccess?: boolean
}

type EditorView =
  | { type: 'home' }
  | { type: 'group'; groupId: DialogueGroupId }
  | { type: 'trigger'; category: DialogueCategory }

export function DialogueSettingsEditor({
  petName,
  settings,
  bubblesEnabled,
  drowsyEnabled,
  sleepingEnabled,
  validationAttempt,
  onChange,
  onBack,
  onSave,
  isBusy,
  saveSuccess
}: DialogueSettingsEditorProps): React.JSX.Element {
  const [view, setView] = useState<EditorView>({ type: 'home' })
  const [confirmingRestoreCategory, setConfirmingRestoreCategory] = useState(false)
  const [touchedFields, setTouchedFields] = useState<Set<string>>(() => new Set())
  const errorSummaryRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedInputRef = useRef<{
    category: DialogueCategory
    lineId: string
    inputEl: HTMLInputElement
  } | null>(null)

  const markFieldTouched = (fieldKey: string): void => {
    setTouchedFields((prev) => {
      if (prev.has(fieldKey)) return prev
      const next = new Set(prev)
      next.add(fieldKey)
      return next
    })
  }

  const isFieldTouched = (fieldKey: string): boolean => {
    return validationAttempt > 0 || touchedFields.has(fieldKey)
  }

  const validationIssues = useMemo(
    () => getDialogueValidationIssues(settings),
    [settings]
  )

  const issueMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const issue of validationIssues) {
      if (!map.has(issue.path)) {
        map.set(issue.path, issue.message)
      }
    }
    return map
  }, [validationIssues])

  const prevValidationAttempt = useRef(validationAttempt)
  useEffect(() => {
    if (validationAttempt > prevValidationAttempt.current) {
      prevValidationAttempt.current = validationAttempt
      if (validationIssues.length > 0) {
        errorSummaryRef.current?.focus()
      }
    }
  }, [validationAttempt, validationIssues])

  const handleAddressChange = (address: string): void => {
    onChange({
      ...settings,
      address
    })
  }

  const updateLineText = (category: DialogueCategory, lineId: string, text: string): void => {
    const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] }
    const triggerMeta = getDialogueTriggerMeta(category)
    const isBuiltIn = triggerMeta.builtIns.some((b) => b.id === lineId)

    if (isBuiltIn) {
      const existing = catSettings.builtInOverrides.find((o) => o.lineId === lineId)
      const nextOverrides = catSettings.builtInOverrides.filter((o) => o.lineId !== lineId)
      const defaultText = triggerMeta.builtIns.find((b) => b.id === lineId)?.text
      const isCustomText = text !== defaultText
      const isAutomaticDisabled = existing?.automaticEnabled === false

      if (isCustomText || isAutomaticDisabled) {
        nextOverrides.push({
          lineId,
          ...(isAutomaticDisabled ? { automaticEnabled: false } : {}),
          ...(isCustomText ? { text } : {})
        })
      }

      const nextCategories = { ...settings.categories }
      if (nextOverrides.length === 0 && catSettings.customLines.length === 0) {
        delete nextCategories[category]
      } else {
        nextCategories[category] = {
          builtInOverrides: nextOverrides,
          customLines: catSettings.customLines
        }
      }

      onChange({
        ...settings,
        categories: nextCategories
      })
    } else {
      const nextCustom = catSettings.customLines.map((line) =>
        line.id === lineId ? { ...line, text } : line
      )
      onChange({
        ...settings,
        categories: {
          ...settings.categories,
          [category]: {
            ...catSettings,
            customLines: nextCustom
          }
        }
      })
    }
  }

  const toggleAutomatic = (
    category: DialogueCategory,
    lineId: string,
    enabled: boolean
  ): void => {
    const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] }
    const triggerMeta = getDialogueTriggerMeta(category)
    const isBuiltIn = triggerMeta.builtIns.some((b) => b.id === lineId)

    if (isBuiltIn) {
      const existing = catSettings.builtInOverrides.find((o) => o.lineId === lineId)
      const nextOverrides = catSettings.builtInOverrides.filter((o) => o.lineId !== lineId)
      const defaultText = triggerMeta.builtIns.find((b) => b.id === lineId)?.text
      const hasTextOverride = existing?.text !== undefined && existing.text !== defaultText

      if (!enabled || hasTextOverride) {
        nextOverrides.push({
          lineId,
          ...(hasTextOverride ? { text: existing.text } : {}),
          ...(!enabled ? { automaticEnabled: false } : {})
        })
      }

      const nextCategories = { ...settings.categories }
      if (nextOverrides.length === 0 && catSettings.customLines.length === 0) {
        delete nextCategories[category]
      } else {
        nextCategories[category] = {
          builtInOverrides: nextOverrides,
          customLines: catSettings.customLines
        }
      }

      onChange({
        ...settings,
        categories: nextCategories
      })
    } else {
      const nextCustom = catSettings.customLines.map((line) =>
        line.id === lineId ? { ...line, automaticEnabled: enabled } : line
      )
      onChange({
        ...settings,
        categories: {
          ...settings.categories,
          [category]: {
            ...catSettings,
            customLines: nextCustom
          }
        }
      })
    }
  }

  const handleRestoreLine = (category: DialogueCategory, lineId: string): void => {
    onChange(restoreBuiltInLine(settings, category, lineId))
  }

  const handleRestoreCategory = (category: DialogueCategory): void => {
    onChange(restoreBuiltInCategory(settings, category))
    setConfirmingRestoreCategory(false)
  }

  const handleAddCustomLine = (category: DialogueCategory): void => {
    const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] }
    if (catSettings.customLines.length >= MAX_CUSTOM_LINES_PER_CATEGORY) return
    const newLineId = crypto.randomUUID()
    const nextCustom = [
      ...catSettings.customLines,
      { id: newLineId, automaticEnabled: true, text: '' }
    ]
    onChange({
      ...settings,
      categories: {
        ...settings.categories,
        [category]: {
          ...catSettings,
          customLines: nextCustom
        }
      }
    })

    setTimeout(() => {
      const el = document.getElementById(
        `dialogue-input-${category}-${newLineId}`
      ) as HTMLInputElement | null
      el?.focus()
    }, 50)
  }

  const handleDeleteCustomLine = (category: DialogueCategory, lineId: string): void => {
    const catSettings = settings.categories[category]
    if (!catSettings) return
    const nextCustom = catSettings.customLines.filter((line) => line.id !== lineId)
    const nextCategories = { ...settings.categories }
    if (nextCustom.length === 0 && catSettings.builtInOverrides.length === 0) {
      delete nextCategories[category]
    } else {
      nextCategories[category] = {
        ...catSettings,
        customLines: nextCustom
      }
    }
    onChange({
      ...settings,
      categories: nextCategories
    })
  }

  const handleInsertAddress = (category: DialogueCategory): void => {
    const lastFocused = lastFocusedInputRef.current
    if (
      lastFocused &&
      lastFocused.category === category &&
      document.body.contains(lastFocused.inputEl)
    ) {
      const el = lastFocused.inputEl
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      el.setRangeText(ADDRESS_PLACEHOLDER, start, end, 'end')
      updateLineText(category, lastFocused.lineId, el.value)
      el.focus()
      return
    }

    const catSettings = settings.categories[category]
    const customLines = catSettings?.customLines ?? []
    if (customLines.length > 0) {
      const newest = customLines[customLines.length - 1]!
      const el = document.getElementById(
        `dialogue-input-${category}-${newest.id}`
      ) as HTMLInputElement | null
      if (el) {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        el.setRangeText(ADDRESS_PLACEHOLDER, start, end, 'end')
        updateLineText(category, newest.id, el.value)
        el.focus()
        return
      }
    }

    // Otherwise insert into first available line
    const meta = getDialogueTriggerMeta(category)
    const firstBuiltIn = meta.builtIns[0]!
    const el = document.getElementById(
      `dialogue-input-${category}-${firstBuiltIn.id}`
    ) as HTMLInputElement | null
    if (el) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      el.setRangeText(ADDRESS_PLACEHOLDER, start, end, 'end')
      updateLineText(category, firstBuiltIn.id, el.value)
      el.focus()
    }
  }

  const navigateToIssue = (issue: DialogueValidationIssue): void => {
    if (issue.path === 'address' || issue.path === 'root' || issue.path === 'categories') {
      setView({ type: 'home' })
      setTimeout(() => {
        document.getElementById('dialogue-input-address')?.focus()
      }, 50)
      return
    }

    const category = DIALOGUE_CATEGORIES.find(
      (cat) => issue.path === cat || issue.path.startsWith(`${cat}:`)
    )

    if (category) {
      const lineId = issue.path.startsWith(`${category}:`)
        ? issue.path.slice(category.length + 1)
        : null
      setView({ type: 'trigger', category })
      setTimeout(() => {
        if (lineId) {
          const targetId = `dialogue-input-${category}-${lineId}`
          document.getElementById(targetId)?.focus()
        }
      }, 50)
      return
    }

    setView({ type: 'home' })
  }

  const renderErrorSummary = (): React.JSX.Element | null => {
    if (validationAttempt === 0 || validationIssues.length === 0) return null
    return (
      <div
        ref={errorSummaryRef}
        tabIndex={-1}
        className="dialogue-settings-error-summary"
        role="alert"
        aria-label="输入错误摘要"
      >
        <div className="dialogue-settings-error-summary-title">保存前请检查以下内容：</div>
        <ul className="dialogue-settings-error-list">
          {validationIssues.map((issue, index) => (
            <li key={`${issue.path}-${index}`}>
              <a
                href={`#${issue.path}`}
                onClick={(e) => {
                  e.preventDefault()
                  navigateToIssue(issue)
                }}
              >
                {issue.message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const renderHome = (): React.JSX.Element => {
    const addressIssue = issueMap.get('address')
    return (
      <div className="dialogue-settings-view">
        <header className="dialogue-settings-header">
          <button type="button" className="ghost-button back-button" onClick={onBack}>
            ‹ 返回伙伴设置
          </button>
          <h2>{petName}的对白</h2>
        </header>

        {renderErrorSummary()}

        {!bubblesEnabled && (
          <div className="dialogue-settings-notice" role="status">
            日常对话气泡已关闭；设置会保留，重新开启后生效。
          </div>
        )}

        <section className="dialogue-settings-section">
          <label
            htmlFor="dialogue-input-address"
            className="dialogue-settings-label"
          >
            对你的称呼
          </label>
          <div className="dialogue-settings-supporting-copy">
            在对白中插入“称呼”时使用；可以留空。最多 12 个字。
          </div>
          <input
            id="dialogue-input-address"
            type="text"
            className="dialogue-settings-address-input"
            value={settings.address}
            onChange={(e) => handleAddressChange(e.target.value)}
            onBlur={() => markFieldTouched('address')}
            aria-invalid={Boolean(isFieldTouched('address') && addressIssue)}
            aria-describedby={isFieldTouched('address') && addressIssue ? 'dialogue-error-address' : undefined}
            placeholder="例如：小葡萄"
          />
          {isFieldTouched('address') && addressIssue && (
            <div id="dialogue-error-address" className="dialogue-settings-inline-error" role="alert">
              {addressIssue}
            </div>
          )}
        </section>

        <section className="dialogue-settings-section">
          <div className="dialogue-settings-scenes-list">
            {DIALOGUE_GROUPS.map((group) => {
              const triggerCount = group.triggers.length
              let customCount = 0
              let hasOverrides = false
              for (const trigger of group.triggers) {
                const catSettings = settings.categories[trigger.id]
                if (catSettings) {
                  customCount += catSettings.customLines.length
                  if (catSettings.builtInOverrides.length > 0) hasOverrides = true
                }
              }

              const detail =
                customCount > 0
                  ? `自定义 ${customCount} 句`
                  : hasOverrides
                    ? '已调整内置对白'
                    : '使用内置对白'

              return (
                <button
                  key={group.id}
                  type="button"
                  className="dialogue-settings-scene-row"
                  onClick={() => setView({ type: 'group', groupId: group.id })}
                >
                  <div className="dialogue-settings-scene-name">{group.label}</div>
                  <div className="dialogue-settings-scene-meta">
                    <span>{triggerCount} 个时机 · {detail}</span>
                    <span className="dialogue-settings-scene-chevron">›</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <div className="dialogue-settings-system-notice">
          休息提醒、倒计时和状态提示由程序管理。
        </div>

        {onSave && (
          <div className="editor-actions">
            <button
              type="button"
              className="primary-button"
              disabled={isBusy}
              onClick={onSave}
            >
              {saveSuccess ? '已保存设置' : '保存设置'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderGroup = (groupId: DialogueGroupId): React.JSX.Element => {
    const groupMeta = DIALOGUE_GROUPS.find((g) => g.id === groupId)!
    const isDrowsyDisabled = groupId === 'drowsy' && !drowsyEnabled
    const isSleepingDisabled = groupId === 'sleeping' && !sleepingEnabled
    const isSceneDisabled = isDrowsyDisabled || isSleepingDisabled

    return (
      <div className="dialogue-settings-view">
        <header className="dialogue-settings-header">
          <button
            type="button"
            className="ghost-button back-button"
            onClick={() => setView({ type: 'home' })}
          >
            ‹ 返回对白设置
          </button>
          <h2>{groupMeta.label}</h2>
        </header>

        {renderErrorSummary()}

        {isSceneDisabled && (
          <div className="dialogue-settings-notice" role="status">
            这个场景尚未启用，设置会保留。
          </div>
        )}

        <section className="dialogue-settings-section">
          <div className="dialogue-settings-scenes-list">
            {groupMeta.triggers.map((trigger) => {
              const catSettings = settings.categories[trigger.id]
              const customCount = catSettings?.customLines.length ?? 0
              const hasOverrides = (catSettings?.builtInOverrides.length ?? 0) > 0
              const detail =
                customCount > 0
                  ? `自定义 ${customCount} 句`
                  : hasOverrides
                    ? '已调整内置对白'
                    : '使用内置对白'

              return (
                <button
                  key={trigger.id}
                  type="button"
                  className="dialogue-settings-scene-row"
                  onClick={() => setView({ type: 'trigger', category: trigger.id })}
                >
                  <div className="dialogue-settings-scene-name">{trigger.label}</div>
                  <div className="dialogue-settings-scene-meta">
                    <span>{detail}</span>
                    <span className="dialogue-settings-scene-chevron">›</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {onSave && (
          <div className="editor-actions">
            <button
              type="button"
              className="primary-button"
              disabled={isBusy}
              onClick={onSave}
            >
              {saveSuccess ? '已保存设置' : '保存设置'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderTrigger = (category: DialogueCategory): React.JSX.Element => {
    const triggerMeta = getDialogueTriggerMeta(category)
    const groupMeta = DIALOGUE_GROUPS.find((g) => g.id === triggerMeta.group)!
    const catSettings = settings.categories[category]
    const builtInOverrides = catSettings?.builtInOverrides ?? []
    const customLines = catSettings?.customLines ?? []

    const rows: DialogueLineRowModel[] = []

    for (const builtIn of triggerMeta.builtIns) {
      const override = builtInOverrides.find((o) => o.lineId === builtIn.id)
      const currentText = override?.text !== undefined ? override.text : builtIn.text
      const automaticEnabled = override?.automaticEnabled !== false
      const isModified = override?.text !== undefined && override.text !== builtIn.text
      const rawIssue = issueMap.get(`${category}:${builtIn.id}`)
      const issue = isFieldTouched(`${category}:${builtIn.id}`) ? rawIssue : undefined

      rows.push({
        id: builtIn.id,
        category,
        source: 'builtin',
        currentText,
        defaultText: builtIn.text,
        automaticEnabled,
        isModified,
        issue
      })
    }

    for (const custom of customLines) {
      const rawIssue = issueMap.get(`${category}:${custom.id}`)
      const issue = isFieldTouched(`${category}:${custom.id}`) ? rawIssue : undefined
      rows.push({
        id: custom.id,
        category,
        source: 'custom',
        currentText: custom.text,
        automaticEnabled: custom.automaticEnabled,
        issue
      })
    }

    const triggerLevelIssue = issueMap.get(category)
    const canAddMore = customLines.length < MAX_CUSTOM_LINES_PER_CATEGORY

    return (
      <div className="dialogue-settings-view">
        <header className="dialogue-settings-header">
          <button
            type="button"
            className="ghost-button back-button"
            onClick={() => {
              setConfirmingRestoreCategory(false)
              setView({ type: 'group', groupId: triggerMeta.group })
            }}
          >
            ‹ 返回{groupMeta.label}
          </button>
          <h2>{triggerMeta.label}</h2>
        </header>

        {renderErrorSummary()}

        {triggerLevelIssue && (
          <div className="dialogue-settings-inline-error" role="alert">
            {triggerLevelIssue}
          </div>
        )}

        <div className="dialogue-settings-supporting-copy">
          建议 4–12 个字，最多 30 个字。可自由停用或恢复内置对白。
        </div>

        <div className="dialogue-settings-lines-list">
          {rows.map((row) => (
            <DialogueLineEditor
              key={`${row.source}-${row.id}`}
              row={row}
              address={settings.address}
              onTextChange={(text) => updateLineText(category, row.id, text)}
              onToggleAutomatic={(enabled) => toggleAutomatic(category, row.id, enabled)}
              onRestore={row.source === 'builtin' ? () => handleRestoreLine(category, row.id) : undefined}
              onDelete={row.source === 'custom' ? () => handleDeleteCustomLine(category, row.id) : undefined}
              onInputFocus={(inputEl) => {
                lastFocusedInputRef.current = {
                  category,
                  lineId: row.id,
                  inputEl
                }
              }}
              onBlur={() => markFieldTouched(`${category}:${row.id}`)}
            />
          ))}
        </div>

        <div className="dialogue-settings-trigger-actions">
          <button
            type="button"
            className="ghost-button compact-button"
            disabled={!canAddMore}
            onClick={() => handleAddCustomLine(category)}
          >
            ＋ 添加一句
          </button>

          <button
            type="button"
            className="ghost-button compact-button"
            onClick={() => handleInsertAddress(category)}
          >
            插入称呼
          </button>

          {!confirmingRestoreCategory ? (
            <button
              type="button"
              className="ghost-button compact-button"
              onClick={() => setConfirmingRestoreCategory(true)}
            >
              恢复内置对白
            </button>
          ) : (
            <div className="dialogue-settings-confirm-box">
              <span className="dialogue-settings-confirm-text">
                内置对白将恢复原文并重新启用，你添加的对白不会改变。
              </span>
              <button
                type="button"
                className="ghost-button compact-button danger"
                onClick={() => handleRestoreCategory(category)}
              >
                确认恢复
              </button>
              <button
                type="button"
                className="ghost-button compact-button"
                onClick={() => setConfirmingRestoreCategory(false)}
              >
                取消
              </button>
            </div>
          )}
        </div>

        {onSave && (
          <div className="editor-actions">
            <button
              type="button"
              className="primary-button"
              disabled={isBusy}
              onClick={onSave}
            >
              {saveSuccess ? '已保存设置' : '保存设置'}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (view.type === 'trigger') return renderTrigger(view.category)
  if (view.type === 'group') return renderGroup(view.groupId)
  return renderHome()
}
