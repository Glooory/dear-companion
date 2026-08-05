import type { ActionSlot, PetConfig } from './contracts'

export type ActionTemplate =
  | 'still'
  | 'asset-swap'
  | 'blink-sequence'
  | 'bounce'
  | 'sway'
  | 'scale-nod'
  | 'fast-shake'
  | 'gentle-breathe'
  | 'nod'

export type ActionOverlay = 'protest-bubble' | 'tears'

export interface ResolvedAction {
  slot: ActionSlot
  assetIds: readonly string[]
  template: ActionTemplate
  overlays: readonly ActionOverlay[]
  usedFallback: boolean
}

export function resolveAction(
  pet: Pick<PetConfig, 'actionSlots'>,
  slot: ActionSlot,
  randomIndex = 0,
  baseAssetId?: string
): ResolvedAction {
  const idleAssetId = baseAssetId ?? select(pet.actionSlots.idle, randomIndex)
  if (!idleAssetId) throw new Error('An idle asset is required to resolve pet actions')

  if (slot === 'idle') {
    return { slot, assetIds: [idleAssetId], template: 'still', overlays: [], usedFallback: false }
  }

  const assignedAssetId = select(pet.actionSlots[slot], randomIndex)
  if (assignedAssetId) {
    if (slot === 'blink') {
      return {
        slot,
        assetIds: [idleAssetId, assignedAssetId, idleAssetId],
        template: 'blink-sequence',
        overlays: [],
        usedFallback: false
      }
    }
    return {
      slot,
      assetIds: [assignedAssetId],
      template: 'asset-swap',
      overlays: [],
      usedFallback: false
    }
  }

  const fallback = FALLBACKS[slot]
  if (!fallback) throw new Error(`No fallback is defined for ${slot}`)
  const template = Array.isArray(fallback.template)
    ? fallback.template[positiveModulo(randomIndex, fallback.template.length)]!
    : fallback.template
  return {
    slot,
    assetIds: [idleAssetId],
    template,
    overlays: fallback.overlays,
    usedFallback: true
  }
}

const FALLBACKS: Partial<Record<ActionSlot, { template: ActionTemplate | readonly ActionTemplate[]; overlays: readonly ActionOverlay[] }>> = {
  cute: { template: ['bounce', 'sway'], overlays: [] },
  petting: { template: 'scale-nod', overlays: [] },
  angry: { template: 'fast-shake', overlays: ['protest-bubble'] },
  crying: { template: 'still', overlays: ['tears'] },
  resting: { template: 'gentle-breathe', overlays: [] },
  blink: { template: ['nod', 'gentle-breathe'], overlays: [] }
}

function select(values: readonly string[], index: number): string | null {
  if (values.length === 0) return null
  return values[positiveModulo(index, values.length)] ?? null
}

function positiveModulo(value: number, divisor: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : 0
  return ((integer % divisor) + divisor) % divisor
}
