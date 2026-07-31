import type { FoundationApi } from '@shared/contracts'

interface PetShellProps {
  api: FoundationApi
}

export function PetShell({ api }: PetShellProps): React.JSX.Element {
  const openSettings = (): void => {
    void api.openSettings()
  }

  return (
    <main className="pet-shell">
      <div className="pet-placeholder" aria-label="Dear Companion development placeholder">
        <span>Dear Companion</span>
      </div>
      <button className="pet-settings-button" type="button" onClick={openSettings}>设置</button>
    </main>
  )
}
