import React, { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  DIALOGUE_GROUPS,
  getDialogueTriggerMeta,
  type DialogueCategory,
  type DialogueGroupId,
} from "@shared/dialogue-catalog";
import {
  ADDRESS_PLACEHOLDER,
  getDialogueValidationIssues,
  MAX_CUSTOM_LINES_PER_CATEGORY,
  restoreBuiltInCategory,
  restoreBuiltInLine,
  type PetDialogueSettings,
} from "@shared/dialogue-settings";
import { DialogueLineEditor, type DialogueLineRowModel } from "./DialogueLineEditor";
import styles from "./DialogueSettingsEditor.module.css";

export interface DialogueSettingsEditorProps {
  petId: string;
  petName: string;
  settings: PetDialogueSettings;
  bubblesEnabled: boolean;
  drowsyEnabled: boolean;
  sleepingEnabled: boolean;
  validationAttempt: number;
  onChange: (settings: PetDialogueSettings) => void;
  onSave?: () => void;
  isBusy?: boolean;
  saveSuccess?: boolean;
  hasUnsavedChanges?: boolean;
}

export function DialogueSettingsEditor({
  petId,
  petName,
  settings,
  bubblesEnabled,
  drowsyEnabled,
  sleepingEnabled,
  validationAttempt,
  onChange,
  onSave,
  isBusy,
  saveSuccess,
  hasUnsavedChanges,
}: DialogueSettingsEditorProps): React.JSX.Element {
  const [selectedGroupId, setSelectedGroupId] = useState<DialogueGroupId>("daily");
  const [confirmRestoreCategory, setConfirmRestoreCategory] = useState<DialogueCategory | null>(null);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(() => new Set());
  const [voiceAvailabilityState, setVoiceAvailabilityState] = useState<{
    petId: string;
    values: Record<string, boolean>;
  } | null>(null);
  const lastFocusedInputRef = useRef<{
    category: DialogueCategory;
    lineId: string;
    inputEl: HTMLInputElement;
  } | null>(null);

  const markFieldTouched = (fieldKey: string): void => {
    setTouchedFields((prev) => {
      if (prev.has(fieldKey)) return prev;
      const next = new Set(prev);
      next.add(fieldKey);
      return next;
    });
  };

  const isFieldTouched = (fieldKey: string): boolean => {
    return validationAttempt > 0 || touchedFields.has(fieldKey);
  };

  const validationIssues = useMemo(() => getDialogueValidationIssues(settings), [settings]);
  const voiceIds = useMemo(
    () =>
      [
        ...new Set(
          Object.values(settings.categories).flatMap((category) => [
            ...(category?.builtInOverrides.flatMap((line) => line.voiceAssetId ?? []) ?? []),
            ...(category?.customLines.flatMap((line) => line.voiceAssetId ?? []) ?? []),
          ])
        ),
      ].sort(),
    [settings.categories]
  );

  useEffect(() => {
    let cancelled = false;
    if (voiceIds.length === 0) {
      return () => {
        cancelled = true;
      };
    }
    void window.dearCompanion.getPetVoiceAvailability(petId, voiceIds).then(
      (result) => {
        if (!cancelled) setVoiceAvailabilityState({ petId, values: result });
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [petId, voiceIds]);
  const voiceAvailability = voiceAvailabilityState?.petId === petId ? voiceAvailabilityState.values : {};

  const issueMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of validationIssues) {
      if (!map.has(issue.path)) {
        map.set(issue.path, issue.message);
      }
    }
    return map;
  }, [validationIssues]);
  const addressIssue = isFieldTouched("address") ? issueMap.get("address") : undefined;

  const focusIssue = (path: string): void => {
    if (path === "address") {
      document.getElementById("address-input")?.focus();
      return;
    }
    const category = DIALOGUE_GROUPS.flatMap((group) => group.triggers).find((trigger) =>
      path.startsWith(`${trigger.id}:`)
    )?.id;
    if (!category) return;
    const group = DIALOGUE_GROUPS.find((candidate) => candidate.triggers.some((trigger) => trigger.id === category));
    if (!group) return;
    const lineId = path.slice(category.length + 1);
    setSelectedGroupId(group.id);
    setTimeout(() => document.getElementById(`dialogue-input-${category}-${lineId}`)?.focus(), 0);
  };

  const prevValidationAttempt = useRef(validationAttempt);
  useEffect(() => {
    if (validationAttempt > prevValidationAttempt.current) {
      prevValidationAttempt.current = validationAttempt;
      if (validationIssues.length > 0) {
        const firstIssuePath = validationIssues[0]!.path;
        setTimeout(() => {
          focusIssue(firstIssuePath);
        }, 0);
      }
    }
  }, [validationAttempt, validationIssues]);

  const handleAddressChange = (address: string): void => {
    onChange({
      ...settings,
      address,
    });
  };

  const handleVoiceToggle = (voiceEnabled: boolean): void => {
    onChange({
      ...settings,
      voiceEnabled,
    });
  };

  const handleVolumeChange = (volume: number): void => {
    onChange({
      ...settings,
      voiceVolume: volume,
    });
  };

  const updateLineText = (category: DialogueCategory, lineId: string, text: string): void => {
    const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] };
    const triggerMeta = getDialogueTriggerMeta(category);
    const isBuiltIn = triggerMeta.builtIns.some((b) => b.id === lineId);

    if (isBuiltIn) {
      const existing = catSettings.builtInOverrides.find((o) => o.lineId === lineId);
      const nextOverrides = catSettings.builtInOverrides.filter((o) => o.lineId !== lineId);
      const defaultText = triggerMeta.builtIns.find((b) => b.id === lineId)?.text;
      const isCustomText = text !== defaultText;
      const isAutomaticDisabled = existing?.automaticEnabled === false;
      const hasVoice = existing?.voiceAssetId !== undefined;

      if (isCustomText || isAutomaticDisabled || hasVoice) {
        nextOverrides.push({
          lineId,
          ...(isAutomaticDisabled ? { automaticEnabled: false } : {}),
          ...(isCustomText ? { text } : {}),
          ...(hasVoice ? { voiceAssetId: existing!.voiceAssetId } : {}),
        });
      }

      const nextCategories = { ...settings.categories };
      if (nextOverrides.length === 0 && catSettings.customLines.length === 0) {
        delete nextCategories[category];
      } else {
        nextCategories[category] = {
          builtInOverrides: nextOverrides,
          customLines: catSettings.customLines,
        };
      }

      onChange({
        ...settings,
        categories: nextCategories,
      });
    } else {
      const nextCustom = catSettings.customLines.map((line) => (line.id === lineId ? { ...line, text } : line));
      onChange({
        ...settings,
        categories: {
          ...settings.categories,
          [category]: {
            ...catSettings,
            customLines: nextCustom,
          },
        },
      });
    }
  };

  const updateLineAutomatic = (category: DialogueCategory, lineId: string, automaticEnabled: boolean): void => {
    const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] };
    const triggerMeta = getDialogueTriggerMeta(category);
    const isBuiltIn = triggerMeta.builtIns.some((b) => b.id === lineId);

    if (isBuiltIn) {
      const existing = catSettings.builtInOverrides.find((o) => o.lineId === lineId);
      const nextOverrides = catSettings.builtInOverrides.filter((o) => o.lineId !== lineId);
      const isCustomText = existing?.text !== undefined;
      const hasVoice = existing?.voiceAssetId !== undefined;

      if (!automaticEnabled || isCustomText || hasVoice) {
        nextOverrides.push({
          lineId,
          ...(!automaticEnabled ? { automaticEnabled: false } : {}),
          ...(isCustomText ? { text: existing!.text } : {}),
          ...(hasVoice ? { voiceAssetId: existing!.voiceAssetId } : {}),
        });
      }

      const nextCategories = { ...settings.categories };
      if (nextOverrides.length === 0 && catSettings.customLines.length === 0) {
        delete nextCategories[category];
      } else {
        nextCategories[category] = {
          builtInOverrides: nextOverrides,
          customLines: catSettings.customLines,
        };
      }

      onChange({
        ...settings,
        categories: nextCategories,
      });
    } else {
      const nextCustom = catSettings.customLines.map((line) =>
        line.id === lineId ? { ...line, automaticEnabled } : line
      );
      onChange({
        ...settings,
        categories: {
          ...settings.categories,
          [category]: {
            ...catSettings,
            customLines: nextCustom,
          },
        },
      });
    }
  };

  const updateLineVoice = (category: DialogueCategory, lineId: string, voiceAssetId: string | undefined): void => {
    const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] };
    const triggerMeta = getDialogueTriggerMeta(category);
    const isBuiltIn = triggerMeta.builtIns.some((b) => b.id === lineId);

    if (isBuiltIn) {
      const existing = catSettings.builtInOverrides.find((o) => o.lineId === lineId);
      const nextOverrides = catSettings.builtInOverrides.filter((o) => o.lineId !== lineId);
      const isCustomText = existing?.text !== undefined;
      const isAutomaticDisabled = existing?.automaticEnabled === false;
      const hasVoice = voiceAssetId !== undefined;

      if (isCustomText || isAutomaticDisabled || hasVoice) {
        nextOverrides.push({
          lineId,
          ...(isAutomaticDisabled ? { automaticEnabled: false } : {}),
          ...(isCustomText ? { text: existing!.text } : {}),
          ...(hasVoice ? { voiceAssetId } : {}),
        });
      }

      const nextCategories = { ...settings.categories };
      if (nextOverrides.length === 0 && catSettings.customLines.length === 0) {
        delete nextCategories[category];
      } else {
        nextCategories[category] = {
          builtInOverrides: nextOverrides,
          customLines: catSettings.customLines,
        };
      }

      onChange({
        ...settings,
        categories: nextCategories,
      });
    } else {
      const nextCustom = catSettings.customLines.map((line) => (line.id === lineId ? { ...line, voiceAssetId } : line));
      onChange({
        ...settings,
        categories: {
          ...settings.categories,
          [category]: {
            ...catSettings,
            customLines: nextCustom,
          },
        },
      });
    }
  };

  const handleAddCustomLine = (category: DialogueCategory): void => {
    const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] };
    if (catSettings.customLines.length >= MAX_CUSTOM_LINES_PER_CATEGORY) return;

    const id = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    onChange({
      ...settings,
      categories: {
        ...settings.categories,
        [category]: {
          ...catSettings,
          customLines: [...catSettings.customLines, { id, automaticEnabled: true, text: "" }],
        },
      },
    });
    setTimeout(() => {
      document.getElementById(`dialogue-input-${category}-${id}`)?.focus();
    }, 0);
  };

  const handleDeleteCustomLine = (category: DialogueCategory, lineId: string): void => {
    const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] };
    const nextCustom = catSettings.customLines.filter((l) => l.id !== lineId);

    const nextCategories = { ...settings.categories };
    if (nextCustom.length === 0 && catSettings.builtInOverrides.length === 0) {
      delete nextCategories[category];
    } else {
      nextCategories[category] = {
        builtInOverrides: catSettings.builtInOverrides,
        customLines: nextCustom,
      };
    }

    onChange({
      ...settings,
      categories: nextCategories,
    });
  };

  const handleRestoreBuiltIn = (category: DialogueCategory, lineId: string): void => {
    onChange(restoreBuiltInLine(settings, category, lineId));
  };

  const handleRestoreCategory = (category: DialogueCategory): void => {
    onChange(restoreBuiltInCategory(settings, category));
    setConfirmRestoreCategory(null);
  };

  const handleInsertPlaceholder = (category: DialogueCategory): void => {
    let target =
      lastFocusedInputRef.current && lastFocusedInputRef.current.category === category
        ? lastFocusedInputRef.current
        : null;

    if (!target) {
      const firstInput = document.querySelector<HTMLInputElement>(`input[id^="dialogue-input-${category}-"]`);
      if (firstInput) {
        const lineId = firstInput.id.replace(`dialogue-input-${category}-`, "");
        target = { category, lineId, inputEl: firstInput };
        lastFocusedInputRef.current = target;
      }
    }

    if (!target) return;
    const { lineId, inputEl } = target;
    const currentVal = inputEl.value;
    const start = inputEl.selectionStart ?? currentVal.length;
    const end = inputEl.selectionEnd ?? currentVal.length;
    const newVal = currentVal.slice(0, start) + ADDRESS_PLACEHOLDER + currentVal.slice(end);
    updateLineText(category, lineId, newVal);

    setTimeout(() => {
      inputEl.focus();
      const nextPos = start + ADDRESS_PLACEHOLDER.length;
      inputEl.setSelectionRange(nextPos, nextPos);
    }, 0);
  };

  const currentGroup = DIALOGUE_GROUPS.find((g) => g.id === selectedGroupId) ?? DIALOGUE_GROUPS[0]!;

  return (
    <div className={styles.container}>
      {/* Top Controls: Nickname & Dialogue Voice */}
      <div className={styles.topControlsCard}>
        <div className={styles.controlCol}>
          <div className={styles.labelRow}>
            <label htmlFor="address-input" className={styles.label}>
              {petName ? `${petName}对你的称呼` : "对你的称呼"}
            </label>
          </div>
          <input
            id="address-input"
            type="text"
            className={styles.addressInput}
            value={settings.address}
            maxLength={12}
            onChange={(e) => handleAddressChange(e.currentTarget.value)}
            onBlur={() => markFieldTouched("address")}
            aria-invalid={Boolean(addressIssue)}
            aria-describedby={addressIssue ? "address-input-error" : "address-input-help"}
            placeholder="例如：小葡萄（可留空）"
          />
          <p id="address-input-help" className={styles.supportingCopy}>
            在对白中插入“称呼”时使用；留空时不触发含称呼的对白。
          </p>
          {addressIssue && (
            <p id="address-input-error" className={styles.inlineError} role="alert">
              {addressIssue}
            </p>
          )}
        </div>

        <div className={styles.controlCol}>
          <div className={styles.labelRow}>
            <span className={styles.label}>对白声音</span>
            <div className={styles.voiceToggleRow}>
              <span className={styles.switchStatus}>{settings.voiceEnabled ? "已启用" : "未启用"}</span>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={Boolean(settings.voiceEnabled)}
                  onChange={(e) => handleVoiceToggle(e.target.checked)}
                  aria-label="启用对白声音"
                />
                <span className={styles.slider} />
              </label>
            </div>
          </div>
          <p className={styles.supportingCopy}>气泡弹出时播放录制或上传的声音；未配音的对白保持静音。</p>

          {settings.voiceEnabled && (
            <div className={styles.volumeWrap}>
              <span className={styles.volumeLabel}>音量</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                className={styles.volumeSlider}
                value={settings.voiceVolume ?? 0.8}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                aria-label="对白音量"
              />
              <span className={styles.volumePercent}>{Math.round((settings.voiceVolume ?? 0.8) * 100)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Status Notice if feature is off */}
      {!bubblesEnabled && (
        <div className={styles.notice} role="status">
          日常对话气泡已关闭；对白设置会保留，重新开启气泡后生效。
        </div>
      )}
      {selectedGroupId === "drowsy" && !drowsyEnabled && (
        <div className={styles.notice} role="status">
          有点困了场景尚未启用，对白设置会保留。
        </div>
      )}
      {selectedGroupId === "sleeping" && !sleepingEnabled && (
        <div className={styles.notice} role="status">
          睡觉场景尚未启用，对白设置会保留。
        </div>
      )}

      {/* Scenario Pill Tabs */}
      <div className={styles.scenarioNav} role="tablist" aria-label="生活场景分类">
        {DIALOGUE_GROUPS.map((group) => {
          const isActive = group.id === selectedGroupId;
          return (
            <button
              key={group.id}
              type="button"
              id={`dialogue-group-tab-${group.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`dialogue-group-panel-${group.id}`}
              tabIndex={isActive ? 0 : -1}
              className={clsx(styles.scenarioTab, isActive && styles.active)}
              onClick={() => setSelectedGroupId(group.id)}
              onKeyDown={(event) => {
                const currentIndex = DIALOGUE_GROUPS.findIndex((candidate) => candidate.id === group.id);
                const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (delta === 0) return;
                event.preventDefault();
                const next = DIALOGUE_GROUPS[(currentIndex + delta + DIALOGUE_GROUPS.length) % DIALOGUE_GROUPS.length]!;
                setSelectedGroupId(next.id);
                document.getElementById(`dialogue-group-tab-${next.id}`)?.focus();
              }}
            >
              <span>{group.label}</span>
            </button>
          );
        })}
      </div>

      {/* Trigger Cards List */}
      <div
        id={`dialogue-group-panel-${currentGroup.id}`}
        className={styles.triggerCards}
        role="tabpanel"
        aria-labelledby={`dialogue-group-tab-${currentGroup.id}`}
      >
        {currentGroup.triggers.map((trigger) => {
          const catSettings = settings.categories[trigger.id];
          const overrides = catSettings?.builtInOverrides ?? [];
          const customLines = catSettings?.customLines ?? [];
          const overrideMap = new Map(overrides.map((o) => [o.lineId, o]));

          const builtInRows: DialogueLineRowModel[] = trigger.builtIns.map((b) => {
            const override = overrideMap.get(b.id);
            const isModified = override?.text !== undefined && override.text !== b.text;
            const issueKey = `${trigger.id}:${b.id}`;
            return {
              id: b.id,
              category: trigger.id,
              source: "builtin",
              currentText: override?.text ?? b.text,
              defaultText: b.text,
              automaticEnabled: override?.automaticEnabled ?? true,
              isModified,
              voiceAssetId: override?.voiceAssetId,
              voiceAvailable: override?.voiceAssetId ? voiceAvailability[override.voiceAssetId] : undefined,
              issue: isFieldTouched(issueKey) ? issueMap.get(issueKey) : undefined,
            };
          });

          const customRows: DialogueLineRowModel[] = customLines.map((c) => {
            const issueKey = `${trigger.id}:${c.id}`;
            return {
              id: c.id,
              category: trigger.id,
              source: "custom",
              currentText: c.text,
              automaticEnabled: c.automaticEnabled,
              voiceAssetId: c.voiceAssetId,
              voiceAvailable: c.voiceAssetId ? voiceAvailability[c.voiceAssetId] : undefined,
              issue: isFieldTouched(issueKey) ? issueMap.get(issueKey) : undefined,
            };
          });

          const allRows = [...builtInRows, ...customRows];
          const hasModifiedBuiltIns = overrides.some((o) => o.text !== undefined || o.automaticEnabled === false);

          return (
            <section key={trigger.id} className={styles.triggerCard} aria-labelledby={`trigger-title-${trigger.id}`}>
              <div className={styles.triggerHeader}>
                <div className={styles.triggerTitleWrap}>
                  <h4 id={`trigger-title-${trigger.id}`} className={styles.triggerTitle}>
                    {trigger.label}
                  </h4>
                </div>

                {hasModifiedBuiltIns &&
                  (confirmRestoreCategory === trigger.id ? (
                    <div className={styles.confirmBox}>
                      <span className={styles.confirmText}>恢复原句并重新启用？配音和我的对白会保留。</span>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => handleRestoreCategory(trigger.id)}
                      >
                        确认
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => setConfirmRestoreCategory(null)}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => setConfirmRestoreCategory(trigger.id)}
                    >
                      恢复内置对白
                    </button>
                  ))}
              </div>

              <div className={styles.triggerLines}>
                {allRows.map((row) => (
                  <DialogueLineEditor
                    key={row.id}
                    petId={petId}
                    row={row}
                    address={settings.address}
                    voiceVolume={settings.voiceVolume}
                    onTextChange={(text) => updateLineText(trigger.id, row.id, text)}
                    onToggleAutomatic={(auto) => updateLineAutomatic(trigger.id, row.id, auto)}
                    onVoiceChange={(voiceId) => updateLineVoice(trigger.id, row.id, voiceId)}
                    onRestore={
                      row.source === "builtin" && row.isModified
                        ? () => handleRestoreBuiltIn(trigger.id, row.id)
                        : undefined
                    }
                    onDelete={row.source === "custom" ? () => handleDeleteCustomLine(trigger.id, row.id) : undefined}
                    onInputFocus={(el) => {
                      lastFocusedInputRef.current = { category: trigger.id, lineId: row.id, inputEl: el };
                    }}
                    onBlur={() => markFieldTouched(`${trigger.id}:${row.id}`)}
                  />
                ))}
              </div>

              <div className={styles.triggerFooter}>
                <div className={styles.addActions}>
                  {customLines.length < MAX_CUSTOM_LINES_PER_CATEGORY && (
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={() => handleAddCustomLine(trigger.id)}
                    >
                      + 添加一句
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost-button compact-button"
                    onClick={() => handleInsertPlaceholder(trigger.id)}
                    title="在当前编辑的对白光标处插入 [称呼]"
                  >
                    插入称呼
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Save bar */}
      {onSave && (
        <div className={styles.saveBar}>
          {saveSuccess && <span className={styles.saveNotice}>设置已保存</span>}
          {!saveSuccess && hasUnsavedChanges && <span className={styles.unsavedNotice}>尚未保存</span>}
          <button type="button" className="primary-button" disabled={isBusy} onClick={onSave}>
            {isBusy ? "保存中..." : "保存设置"}
          </button>
        </div>
      )}
    </div>
  );
}
