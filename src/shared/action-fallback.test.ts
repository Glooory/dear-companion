import { describe, expect, it } from 'vitest'
import { resolveAction } from './action-fallback'
import { EMPTY_ACTION_SLOTS, type PetActionSlots } from './contracts'

function slots(overrides: Partial<PetActionSlots> = {}): PetActionSlots {
  return { ...EMPTY_ACTION_SLOTS, idle: ['idle-a', 'idle-b'], ...overrides }
}

describe('action fallback resolution', () => {
  it('selects assigned action assets deterministically', () => {
    expect(resolveAction({ actionSlots: slots({ cute: ['cute-a', 'cute-b'] }) }, 'cute', 3)).toEqual({
      slot: 'cute',
      assetIds: ['cute-b'],
      template: 'asset-swap',
      overlays: [],
      usedFallback: false
    })
  })

  it.each([
    ['cute', 'bounce', []],
    ['petting', 'scale-nod', []],
    ['angry', 'fast-shake', ['protest-bubble']],
    ['crying', 'still', ['tears']],
    ['resting', 'gentle-breathe', []]
  ] as const)('uses the specified idle fallback for %s', (slot, template, overlays) => {
    expect(resolveAction({ actionSlots: slots() }, slot, 0)).toMatchObject({
      assetIds: ['idle-a'],
      template,
      overlays,
      usedFallback: true
    })
  })

  it('builds an open-closed-open blink sequence when a frame exists', () => {
    expect(resolveAction({ actionSlots: slots({ blink: ['closed'] }) }, 'blink')).toEqual({
      slot: 'blink',
      assetIds: ['idle-a', 'closed', 'idle-a'],
      template: 'blink-sequence',
      overlays: [],
      usedFallback: false
    })
  })

  it('uses nod or breathing without simulating an eyelid when blink is missing', () => {
    expect(resolveAction({ actionSlots: slots() }, 'blink', 0)).toMatchObject({ template: 'nod', overlays: [] })
    expect(resolveAction({ actionSlots: slots() }, 'blink', 1)).toMatchObject({ template: 'gentle-breathe', overlays: [] })
  })

  it('requires at least one idle asset', () => {
    expect(() => resolveAction({ actionSlots: { ...EMPTY_ACTION_SLOTS } }, 'cute')).toThrow('idle asset')
  })
})
