// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FoundationApi } from '@shared/contracts'
import { PetShell } from './PetShell'

function createApi(openSettings = vi.fn().mockResolvedValue(undefined)): FoundationApi {
  return {
    getSettings: vi.fn(),
    setPetVisibility: vi.fn(),
    openSettings,
    getWindowKind: vi.fn().mockReturnValue('pet')
  }
}

describe('PetShell', () => {
  afterEach(() => {
    cleanup()
  })

  it('makes the pet surface draggable while keeping the settings button interactive', () => {
    const { container } = render(<PetShell api={createApi()} />)
    const petSurface = container.querySelector('main')
    const settingsButton = screen.getByRole('button', { name: '设置' })

    expect(petSurface).toHaveClass('pet-shell')
    expect(petSurface).toHaveAttribute('data-native-drag-region', 'drag')
    expect(settingsButton).toHaveClass('pet-settings-button')
    expect(settingsButton).toHaveAttribute('data-native-drag-region', 'no-drag')
  })

  it('consumes a rejected settings request', async () => {
    const settingsRequest = Promise.reject(new Error('settings unavailable'))
    const consumeRejection = vi.spyOn(settingsRequest, 'catch')
    const openSettings = vi.fn(() => settingsRequest)
    render(<PetShell api={createApi(openSettings)} />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    await waitFor(() => expect(openSettings).toHaveBeenCalledOnce())
    expect(consumeRejection).toHaveBeenCalledOnce()
    const consumedRequest = consumeRejection.mock.results[0]?.value
    if (!(consumedRequest instanceof Promise)) throw new Error('Expected a consumed request')
    await expect(consumedRequest).resolves.toBeUndefined()
    expect(screen.getByRole('button', { name: '设置' })).toBeEnabled()
  })
})
