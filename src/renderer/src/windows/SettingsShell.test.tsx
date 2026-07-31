// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, FoundationApi } from '@shared/contracts'
import { SettingsShell } from './SettingsShell'

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const settings: AppSettings = {
  schemaVersion: 1,
  activePetId: null,
  petWindow: {
    x: null,
    y: null,
    displayId: null,
    height: 180,
    visible: true
  },
  autostartEnabled: false,
  audio: { reminderEnabled: false, cryingEnabled: false },
  reminders: []
}

function createApi(overrides: Partial<FoundationApi> = {}): FoundationApi {
  return {
    getSettings: vi.fn().mockResolvedValue(settings),
    setPetVisibility: vi.fn().mockResolvedValue(settings),
    openSettings: vi.fn().mockResolvedValue(undefined),
    getWindowKind: vi.fn().mockReturnValue('settings'),
    ...overrides
  }
}

describe('SettingsShell', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the no-pet foundation state when activePetId is null', async () => {
    render(<SettingsShell api={createApi()} />)

    expect(await screen.findByText('还没有添加宠物照片')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一阶段添加照片' })).toBeDisabled()
  })

  it('shows that reminders are not configured by default', async () => {
    render(<SettingsShell api={createApi()} />)

    expect(await screen.findByText('尚未设置提醒')).toBeInTheDocument()
  })

  it('settles an initial load failure and recovers after retrying', async () => {
    const getSettings = vi.fn()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce(settings)
    const api = createApi({ getSettings })

    const { container } = render(<SettingsShell api={api} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取本地设置')
    expect(container.querySelector('main')).toHaveAttribute('aria-busy', 'false')

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('还没有添加宠物照片')).toBeInTheDocument()
    expect(getSettings).toHaveBeenCalledTimes(2)
  })

  it('hides the pet only after setPetVisibility resolves', async () => {
    let resolveVisibility: (value: AppSettings) => void = () => undefined
    const visibilityResult = new Promise<AppSettings>((resolve) => {
      resolveVisibility = resolve
    })
    const api = createApi({
      setPetVisibility: vi.fn().mockReturnValue(visibilityResult)
    })

    render(<SettingsShell api={api} />)

    const toggle = await screen.findByRole('checkbox', { name: '显示桌面宠物' })
    fireEvent.click(toggle)

    expect(api.setPetVisibility).toHaveBeenCalledTimes(1)
    expect(api.setPetVisibility).toHaveBeenCalledWith(false)
    expect(toggle).toBeChecked()

    await act(async () => {
      resolveVisibility({
        ...settings,
        petWindow: { ...settings.petWindow, visible: false }
      })
      await visibilityResult
    })

    expect(toggle).not.toBeChecked()
  })

  it('shows an inline error and preserves the current toggle when persistence rejects', async () => {
    const api = createApi({
      setPetVisibility: vi.fn().mockRejectedValue(new Error('disk unavailable'))
    })

    render(<SettingsShell api={api} />)

    const toggle = await screen.findByRole('checkbox', { name: '显示桌面宠物' })
    fireEvent.click(toggle)

    expect(await screen.findByRole('alert')).toHaveTextContent('无法保存宠物显示设置')
    expect(toggle).toBeChecked()
  })

  it('ignores a stale visibility save after the API boundary changes', async () => {
    const pendingVisibility = deferred<AppSettings>()
    const firstApi = createApi({
      setPetVisibility: vi.fn().mockReturnValue(pendingVisibility.promise)
    })
    const replacementSettings: AppSettings = {
      ...settings,
      activePetId: 'replacement-pet'
    }
    const replacementApi = createApi({
      getSettings: vi.fn().mockResolvedValue(replacementSettings)
    })
    const { rerender } = render(<SettingsShell api={firstApi} />)

    const toggle = await screen.findByRole('checkbox', { name: '显示桌面宠物' })
    fireEvent.click(toggle)
    expect(firstApi.setPetVisibility).toHaveBeenCalledTimes(1)

    rerender(<SettingsShell api={replacementApi} />)
    await vi.waitFor(() => expect(replacementApi.getSettings).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(toggle).toBeEnabled())

    await act(async () => {
      pendingVisibility.resolve({
        ...settings,
        petWindow: { ...settings.petWindow, visible: false }
      })
      await pendingVisibility.promise
    })

    expect(toggle).toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
