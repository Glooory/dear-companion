import { describe, expect, it } from 'vitest'
import { PET_STATE_PRIORITY, RESERVED_PET_STATE_PRIORITY, transitionPetState } from './pet-state-machine'

describe('pet state machine', () => {
  it('moves through idle, hover, action, and completion', () => {
    expect(transitionPetState('idle', { type: 'hover-start' })).toBe('hovering')
    expect(transitionPetState('hovering', { type: 'action-start' })).toBe('performingAction')
    expect(transitionPetState('performingAction', { type: 'action-complete' })).toBe('idle')
  })

  it('lets dragging interrupt hover and actions, then resolves anger', () => {
    expect(transitionPetState('hovering', { type: 'drag-start' })).toBe('dragging')
    expect(transitionPetState('performingAction', { type: 'drag-start' })).toBe('dragging')
    expect(transitionPetState('dragging', { type: 'drag-release', angry: true })).toBe('angry')
    expect(transitionPetState('angry', { type: 'anger-complete' })).toBe('idle')
  })

  it('rejects lower-priority hover or action while dragging or angry', () => {
    expect(transitionPetState('dragging', { type: 'hover-start' })).toBe('dragging')
    expect(transitionPetState('angry', { type: 'action-start' })).toBe('angry')
  })

  it('makes hidden dominant over daily states until show', () => {
    expect(transitionPetState('dragging', { type: 'hide' })).toBe('hidden')
    expect(transitionPetState('hidden', { type: 'drag-start' })).toBe('hidden')
    expect(transitionPetState('hidden', { type: 'show' })).toBe('idle')
  })

  it('uses the complete runtime priority order', () => {
    expect(RESERVED_PET_STATE_PRIORITY.reminding).toBeGreaterThan(PET_STATE_PRIORITY.angry)
    expect(RESERVED_PET_STATE_PRIORITY.resting).toBeGreaterThan(RESERVED_PET_STATE_PRIORITY.reminding)
    expect(RESERVED_PET_STATE_PRIORITY.crying).toBeGreaterThan(RESERVED_PET_STATE_PRIORITY.resting)
    expect(RESERVED_PET_STATE_PRIORITY.celebrating).toBeGreaterThan(PET_STATE_PRIORITY.hidden)
  })

  it('lets reminder and rest runtime override hidden and reject daily input', () => {
    expect(transitionPetState('hidden', { type: 'system-state', state: 'reminding' })).toBe('reminding')
    expect(transitionPetState('reminding', { type: 'drag-start' })).toBe('reminding')
    expect(transitionPetState('resting', { type: 'system-state', state: 'crying' })).toBe('crying')
    expect(transitionPetState('crying', { type: 'hover-start' })).toBe('crying')
  })

  it('celebrates and restores persisted visibility after runtime completion', () => {
    expect(transitionPetState('resting', { type: 'system-state', state: 'celebrating' })).toBe('celebrating')
    expect(transitionPetState('celebrating', { type: 'system-complete', visible: false })).toBe('hidden')
    expect(transitionPetState('celebrating', { type: 'system-complete', visible: true })).toBe('idle')
  })
})
