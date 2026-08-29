import { describe, expect, it } from 'vitest'
import { resolveAction } from './action-fallback'
import { EMPTY_ACTION_SLOTS, type PetActionSlots } from './contracts'

function slots(overrides: Partial<PetActionSlots> = {}): PetActionSlots {
  return { ...EMPTY_ACTION_SLOTS, idle: ['idle-a', 'idle-b'], ...overrides }
}

describe('action fallback resolution', () => {
  it('selects assigned action assets deterministically for resting mode', () => {
    expect(resolveAction({ actionSlots: slots({ resting: ['resting-a', 'resting-b'] }) }, 'resting', 3)).toEqual({
      slot: 'resting',
      assetIds: ['resting-b'],
      template: 'asset-swap',
      overlays: [],
      usedFallback: false
    })
  })

  it('uses gentle-breathe fallback when no resting asset is configured', () => {
    expect(resolveAction({ actionSlots: slots() }, 'resting', 0)).toEqual({
      slot: 'resting',
      assetIds: ['idle-a'],
      template: 'gentle-breathe',
      overlays: [],
      usedFallback: true
    })
  })

  it('resolves idle slot as still with current idle asset', () => {
    expect(resolveAction({ actionSlots: slots() }, 'idle', 0)).toEqual({
      slot: 'idle',
      assetIds: ['idle-a'],
      template: 'still',
      overlays: [],
      usedFallback: false
    })
  })

  it('requires at least one idle asset', () => {
    expect(() => resolveAction({ actionSlots: { ...EMPTY_ACTION_SLOTS } }, 'resting')).toThrow('idle asset')
  })

  it('uses caller specified base asset when provided', () => {
    expect(resolveAction({ actionSlots: slots() }, 'resting', 0, 'custom-base')).toEqual({
      slot: 'resting',
      assetIds: ['custom-base'],
      template: 'gentle-breathe',
      overlays: [],
      usedFallback: true
    })
  })
})
