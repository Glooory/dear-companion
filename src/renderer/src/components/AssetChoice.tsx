import type { PetAsset } from '@shared/contracts'
import { clsx } from 'clsx'
import styles from './AssetChoice.module.css'

export function AssetChoice({
  petId,
  asset,
  checked,
  onChange,
}: {
  petId: string
  asset: PetAsset
  checked: boolean
  onChange(): void
}): React.JSX.Element {
  return (
    <label className={clsx(styles.choice, checked && styles.selected)}>
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        onChange={onChange}
      />
      <span className={styles.thumbnail} aria-hidden="true">
        <img
          src={`app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(asset.id)}`}
          alt=""
          draggable={false}
        />
      </span>
      <span className={styles.details}>
        <strong>照片 {asset.id.slice(0, 8)}</strong>
        <small>
          {asset.format.toUpperCase()} · {asset.width}×{asset.height}
        </small>
      </span>
    </label>
  )
}
