import { useState } from "react";
import { clsx } from "clsx";
import type { PetActionSlots, PetAsset, PetLifeStates } from "@shared/contracts";
import { InfoTooltip } from "./Tooltip";
import styles from "./CompanionBehaviorEditor.module.css";

interface CompanionBehaviorEditorProps {
  petId: string;
  assets: readonly PetAsset[];
  slots: PetActionSlots;
  lifeStates: PetLifeStates;
  onSlotsChange(slots: PetActionSlots): void;
  onLifeStatesChange(lifeStates: PetLifeStates): void;
}

type BehaviorKey = "idle" | "drowsy" | "sleeping" | "working" | "resting";

interface BehaviorConfig {
  key: BehaviorKey;
  title: string;
  hint: string;
}

const BEHAVIOR_CONFIGS: readonly BehaviorConfig[] = [
  {
    key: "idle",
    title: "平时陪伴",
    hint: "日常陪伴时显示，至少需要一张照片；选择多张时会轮流显示。",
  },
  {
    key: "drowsy",
    title: "有点困了",
    hint: "伙伴犯困时显示；未选择时会跳过这个场景。",
  },
  {
    key: "sleeping",
    title: "睡觉",
    hint: "伙伴睡觉时显示；未选择时会跳过这个场景。",
  },
  {
    key: "working",
    title: "专注陪伴",
    hint: "专注时段内显示；未选择时使用平时陪伴照片。",
  },
  {
    key: "resting",
    title: "休息陪伴",
    hint: "休息进行中显示；未选择时使用平时陪伴照片。",
  },
];

export function CompanionBehaviorEditor({
  petId,
  assets,
  slots,
  lifeStates,
  onSlotsChange,
  onLifeStatesChange,
}: CompanionBehaviorEditorProps): React.JSX.Element {
  const [activePickingKey, setActivePickingKey] = useState<BehaviorKey | null>(null);

  const getSelectedIds = (key: BehaviorKey): readonly string[] => {
    switch (key) {
      case "idle":
        return slots.idle;
      case "resting":
        return slots.resting;
      case "drowsy":
        return lifeStates.drowsy.assetIds;
      case "sleeping":
        return lifeStates.sleeping.assetIds;
      case "working":
        return lifeStates.workingAssetIds;
    }
  };

  const toggleAsset = (key: BehaviorKey, assetId: string): void => {
    switch (key) {
      case "idle":
      case "resting": {
        const current = slots[key];
        const next = current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId];
        onSlotsChange({ ...slots, [key]: next });
        break;
      }
      case "working": {
        const next = lifeStates.workingAssetIds.includes(assetId)
          ? lifeStates.workingAssetIds.filter((id) => id !== assetId)
          : [...lifeStates.workingAssetIds, assetId];
        onLifeStatesChange({ ...lifeStates, workingAssetIds: next });
        break;
      }
      case "drowsy":
      case "sleeping": {
        const current = lifeStates[key];
        const nextIds = current.assetIds.includes(assetId)
          ? current.assetIds.filter((id) => id !== assetId)
          : [...current.assetIds, assetId];
        onLifeStatesChange({
          ...lifeStates,
          [key]: {
            enabled: nextIds.length > 0,
            assetIds: nextIds,
          },
        });
        break;
      }
    }
  };

  const removeAsset = (key: BehaviorKey, assetId: string): void => {
    switch (key) {
      case "idle":
      case "resting":
        onSlotsChange({
          ...slots,
          [key]: slots[key].filter((id) => id !== assetId),
        });
        break;
      case "working":
        onLifeStatesChange({
          ...lifeStates,
          workingAssetIds: lifeStates.workingAssetIds.filter((id) => id !== assetId),
        });
        break;
      case "drowsy":
      case "sleeping": {
        const current = lifeStates[key];
        const nextIds = current.assetIds.filter((id) => id !== assetId);
        onLifeStatesChange({
          ...lifeStates,
          [key]: {
            enabled: nextIds.length > 0,
            assetIds: nextIds,
          },
        });
        break;
      }
    }
  };

  return (
    <div className={styles.grid}>
      {BEHAVIOR_CONFIGS.map((config) => {
        const selectedIds = getSelectedIds(config.key);
        const selectedAssets = assets.filter((asset) => selectedIds.includes(asset.id));
        const isPicking = activePickingKey === config.key;

        return (
          <fieldset key={config.key} className={styles.card}>
            <legend className="fieldset-legend-row">
              <span>{config.title}</span>
              <InfoTooltip text={config.hint} />
            </legend>

            {selectedAssets.length > 0 && (
              <div className={styles.selectedStage}>
                <div className={styles.chipsWrap}>
                  {selectedAssets.map((asset) => {
                    const assetIndex = assets.findIndex((a) => a.id === asset.id) + 1;
                    return (
                      <div key={asset.id} className={styles.assetTile}>
                        <img src={petAssetUrl(petId, asset.id)} alt="" className={styles.tileImg} draggable={false} />
                        <span className={styles.tileCaption}>照片 {assetIndex}</span>
                        <button
                          type="button"
                          className={styles.tileRemoveBtn}
                          title="从这个场景移除"
                          onClick={() => removeAsset(config.key, asset.id)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {assets.length > 0 && (
              <div className={styles.actionBar}>
                <button
                  type="button"
                  className={clsx(styles.actionBtn, isPicking && styles.isActive)}
                  onClick={() => setActivePickingKey(isPicking ? null : config.key)}
                  title={isPicking ? "收起选图" : "选择照片"}
                >
                  <svg
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    {isPicking ? (
                      <path d="M3 8h10" />
                    ) : (
                      <>
                        <line x1="8" y1="3" x2="8" y2="13" />
                        <line x1="3" y1="8" x2="13" y2="8" />
                      </>
                    )}
                  </svg>
                  <span>{isPicking ? "完成" : selectedAssets.length > 0 ? "更换或添加照片" : "选择照片"}</span>
                </button>
              </div>
            )}

            {isPicking && assets.length > 0 && (
              <div className={styles.pickerPopover} role="listbox" aria-label={`选择${config.title}照片`}>
                <div className={styles.popoverGrid}>
                  {assets.map((asset, index) => {
                    const isSelected = selectedIds.includes(asset.id);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={clsx(styles.popoverItem, isSelected && styles.isSelected)}
                        onClick={() => toggleAsset(config.key, asset.id)}
                      >
                        <div className={styles.thumbBox}>
                          <img
                            src={petAssetUrl(petId, asset.id)}
                            alt=""
                            draggable={false}
                            className={styles.thumbImg}
                          />
                          <span className={styles.itemCaption}>照片 {index + 1}</span>
                          {isSelected && <span className={styles.checkBadge}>✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`;
}
