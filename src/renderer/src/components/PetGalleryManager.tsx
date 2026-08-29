import { useState } from 'react'
import type { AssetNormalization, HeadHotspot, PetAsset, PetAssetAdjustment } from '@shared/contracts'
import { PetAssetEditor } from './PetAssetEditor'
import { InfoTooltip, Tooltip } from './Tooltip'

interface PetGalleryManagerProps {
  petId: string
  assets: readonly PetAsset[]
  targetHeight: number
  assetAdjustments: readonly PetAssetAdjustment[]
  isActivePet?: boolean
  onImport(): void
  onDeleteAsset?(assetId: string): void
  onUpdateNormalization(assetId: string, normalization: AssetNormalization): void
  onUpdateHeadHotspot(assetId: string, headHotspot: HeadHotspot | null): void
  isBusy?: boolean
}

export function PetGalleryManager({
  petId,
  assets,
  targetHeight,
  assetAdjustments,
  isActivePet,
  onImport,
  onDeleteAsset,
  onUpdateNormalization,
  onUpdateHeadHotspot,
  isBusy
}: PetGalleryManagerProps): React.JSX.Element {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)

  const activeId = (selectedAssetId && assets.some((a) => a.id === selectedAssetId))
    ? selectedAssetId
    : assets[0]?.id ?? null

  const activeAsset = assets.find((a) => a.id === activeId) ?? null
  const activeAdjustment = activeId
    ? assetAdjustments.find((adj) => adj.id === activeId)
    : null

  const isOnlyActiveAsset = Boolean(isActivePet && assets.length <= 1)
  const isDeleteDisabled = isBusy || isOnlyActiveAsset

  return (
    <section className="editor-section gallery-manager-section">
      <div className="gallery-header-row">
        <div className="heading-with-tooltip">
          <h2>照片与姿态标定</h2>
          <InfoTooltip text="调整照片脚底对齐线与抚摸感应区。" />
        </div>
        <div className="gallery-header-actions">
          {activeAsset && onDeleteAsset && (
            <Tooltip
              content="使用中的伙伴需至少保留一张照片"
              disabled={!isOnlyActiveAsset}
            >
              <button
                type="button"
                className="danger-button compact-button"
                disabled={isDeleteDisabled}
                onClick={() => onDeleteAsset(activeAsset.id)}
              >
                删除照片
              </button>
            </Tooltip>
          )}
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={isBusy}
            onClick={onImport}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <circle cx="5.5" cy="5.5" r="1.2" />
              <path d="M14 10l-3.5-3.5L3 14" />
            </svg>
            <span>导入照片</span>
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="gallery-empty-state">
          <div className="gallery-empty-illustration" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <p className="gallery-empty-text">还没有导入照片</p>
          <span className="supporting-copy">导入一张透明背景的 PNG 或 WebP 照片即可开始陪伴</span>
          <button
            type="button"
            className="primary-button"
            style={{ marginTop: 12 }}
            disabled={isBusy}
            onClick={onImport}
          >
            导入第一张照片
          </button>
        </div>
      ) : (
        <div className="gallery-workbench">
          <div className="gallery-asset-rail" role="tablist" aria-label="伙伴照片选择">
            {assets.map((asset, index) => {
              const isActive = asset.id === activeId
              return (
                <div
                  key={asset.id}
                  role="tab"
                  tabIndex={0}
                  aria-selected={isActive}
                  className={`gallery-rail-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedAssetId(asset.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedAssetId(asset.id)
                    }
                  }}
                >
                  <div className="rail-thumb-wrap">
                    <img
                      src={petAssetUrl(petId, asset.id)}
                      alt=""
                      draggable={false}
                      className="rail-thumb-img"
                    />
                    {onDeleteAsset && !isDeleteDisabled && (
                      <button
                        type="button"
                        className="rail-thumb-delete-btn"
                        title={`删除照片 ${index + 1}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onDeleteAsset(asset.id)
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <span className="rail-item-label">
                    照片 {index + 1}
                  </span>
                </div>
              )
            })}
            <button
              type="button"
              className="gallery-rail-add"
              disabled={isBusy}
              onClick={onImport}
              title="导入新照片"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="8" y1="3" x2="8" y2="13" />
                <line x1="3" y1="8" x2="13" y2="8" />
              </svg>
              <span>添加</span>
            </button>
          </div>

          <div className="gallery-stage">
            {activeAsset && activeAdjustment ? (
              <PetAssetEditor
                key={activeAsset.id}
                petId={petId}
                asset={activeAsset}
                targetHeight={targetHeight}
                normalization={activeAdjustment.normalization}
                headHotspot={activeAdjustment.headHotspot}
                onChange={(normalization) => onUpdateNormalization(activeAsset.id, normalization)}
                onHeadHotspotChange={(headHotspot) => onUpdateHeadHotspot(activeAsset.id, headHotspot)}
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
