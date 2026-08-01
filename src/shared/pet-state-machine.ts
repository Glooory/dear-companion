export type PetState =
  | 'idle'
  | 'hovering'
  | 'performingAction'
  | 'dragging'
  | 'angry'
  | 'hidden'
  | 'reminding'
  | 'resting'
  | 'crying'
  | 'celebrating'

export type PetStateEvent =
  | { type: 'hide' }
  | { type: 'show' }
  | { type: 'hover-start' }
  | { type: 'hover-end' }
  | { type: 'action-start' }
  | { type: 'action-complete' }
  | { type: 'drag-start' }
  | { type: 'drag-release'; angry: boolean }
  | { type: 'anger-complete' }
  | { type: 'system-state'; state: 'reminding' | 'resting' | 'crying' | 'celebrating' }
  | { type: 'system-complete'; visible: boolean }

export const RESERVED_PET_STATE_PRIORITY = Object.freeze({
  reminding: 70,
  resting: 80,
  crying: 90,
  celebrating: 65
})

export const PET_STATE_PRIORITY: Readonly<Record<PetState, number>> = Object.freeze({
  idle: 10,
  hovering: 20,
  performingAction: 30,
  dragging: 40,
  angry: 50,
  hidden: 60,
  celebrating: RESERVED_PET_STATE_PRIORITY.celebrating,
  reminding: RESERVED_PET_STATE_PRIORITY.reminding,
  resting: RESERVED_PET_STATE_PRIORITY.resting,
  crying: RESERVED_PET_STATE_PRIORITY.crying
})

export function transitionPetState(state: PetState, event: PetStateEvent): PetState {
  if (event.type === 'system-state') return event.state
  if (event.type === 'system-complete') return event.visible ? 'idle' : 'hidden'
  if (isSystemState(state)) return state
  if (event.type === 'hide') return 'hidden'
  if (state === 'hidden') return event.type === 'show' ? 'idle' : 'hidden'
  if (event.type === 'show') return state

  switch (event.type) {
    case 'drag-start':
      return requestState(state, 'dragging')
    case 'drag-release':
      return state === 'dragging' ? (event.angry ? 'angry' : 'idle') : state
    case 'anger-complete':
      return state === 'angry' ? 'idle' : state
    case 'action-start':
      return requestState(state, 'performingAction')
    case 'action-complete':
      return state === 'performingAction' ? 'idle' : state
    case 'hover-start':
      return requestState(state, 'hovering')
    case 'hover-end':
      return state === 'hovering' ? 'idle' : state
  }
}

export function isSystemState(state: PetState): boolean {
  return state === 'reminding' || state === 'resting' || state === 'crying' || state === 'celebrating'
}

function requestState(current: PetState, next: PetState): PetState {
  return PET_STATE_PRIORITY[next] >= PET_STATE_PRIORITY[current] ? next : current
}
