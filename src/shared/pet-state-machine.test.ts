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

  it('makes hidden dominant until show', () => {
    expect(transitionPetState('dragging', { type: 'hide' })).toBe('hidden')
    expect(transitionPetState('hidden', { type: 'drag-start' })).toBe('hidden')
    expect(transitionPetState('hidden', { type: 'show' })).toBe('idle')
  })

  it('keeps an explicit future priority boundary above daily interactions', () => {
    expect(RESERVED_PET_STATE_PRIORITY.reminding).toBeGreaterThan(PET_STATE_PRIORITY.angry)
    expect(RESERVED_PET_STATE_PRIORITY.resting).toBeGreaterThan(RESERVED_PET_STATE_PRIORITY.reminding)
    expect(RESERVED_PET_STATE_PRIORITY.crying).toBeGreaterThan(RESERVED_PET_STATE_PRIORITY.resting)
    expect(PET_STATE_PRIORITY.hidden).toBeGreaterThan(RESERVED_PET_STATE_PRIORITY.crying)
  })
})
