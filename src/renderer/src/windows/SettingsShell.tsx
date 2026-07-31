import { useEffect, useState } from 'react'
import type { AppSettings, FoundationApi } from '@shared/contracts'

interface SettingsShellProps {
  api: FoundationApi
}

export function SettingsShell({ api }: SettingsShellProps): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isSavingVisibility, setIsSavingVisibility] = useState(false)

  useEffect(() => {
    let cancelled = false

    void api.getSettings().then(
      (loadedSettings) => {
        if (cancelled) return
        setSettings(loadedSettings)
        setIsLoading(false)
      },
      () => {
        if (cancelled) return
        setError('无法读取本地设置')
        setHasLoadError(true)
        setIsLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [api, loadAttempt])

  const retryLoadingSettings = (): void => {
    setIsLoading(true)
    setHasLoadError(false)
    setError(null)
    setLoadAttempt((currentAttempt) => currentAttempt + 1)
  }

  const updatePetVisibility = (): void => {
    if (!settings || isSavingVisibility) return

    setError(null)
    setIsSavingVisibility(true)
    void api.setPetVisibility(!settings.petWindow.visible).then(
      (updatedSettings) => {
        setSettings(updatedSettings)
        setIsSavingVisibility(false)
      },
      () => {
        setError('无法保存宠物显示设置')
        setIsSavingVisibility(false)
      }
    )
  }

  return (
    <main className="settings-shell" aria-busy={isLoading}>
      <header className="settings-header">
        <p className="eyebrow">本地离线桌面伙伴</p>
        <h1>Dear Companion</h1>
      </header>

      {error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          {hasLoadError && <button type="button" onClick={retryLoadingSettings}>重试</button>}
        </div>
      )}

      {settings && (
        <section className="settings-sections" aria-label="基础设置">
          <article className="settings-card">
            <h2>宠物</h2>
            {settings.activePetId === null && (
              <>
                <p>还没有添加宠物照片</p>
                <button type="button" disabled>下一阶段添加照片</button>
              </>
            )}
          </article>

          <article className="settings-card">
            <h2>提醒</h2>
            <p>尚未设置提醒</p>
            <p className="supporting-copy">提醒功能将在下一阶段提供；首次安装不会自动创建提醒。</p>
          </article>

          <article className="settings-card">
            <h2>基础控制</h2>
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={settings.petWindow.visible}
                disabled={isSavingVisibility}
                onChange={updatePetVisibility}
              />
              <span>显示桌面宠物</span>
            </label>
            <label className="height-control">
              <span>默认高度</span>
              <input type="text" readOnly value="180 px" aria-label="默认高度" />
            </label>
          </article>
        </section>
      )}

      <footer className="privacy-note">照片和设置只保存在这台电脑上</footer>
    </main>
  )
}
