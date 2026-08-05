import type { CompanionLifeState, ManualLifeSelection } from './contracts'

export interface CompanionStateInputs {
  current: CompanionLifeState
  automaticState: CompanionLifeState
  manualSelection: ManualLifeSelection
  manualWorkActive: boolean
  scheduledWorkActive: boolean
  systemSuspended: boolean
  available: { drowsy: boolean; sleeping: boolean }
}

export function resolveCompanionState(inputs: CompanionStateInputs): CompanionLifeState {
  if (inputs.systemSuspended) return inputs.current
  if (inputs.manualWorkActive || inputs.scheduledWorkActive) return 'working'
  const requested = inputs.manualSelection === 'auto'
    ? inputs.automaticState
    : inputs.manualSelection
  if (requested === 'working') return 'daily-calm'
  if (requested === 'drowsy' && !inputs.available.drowsy) return 'daily-calm'
  if (requested === 'sleeping' && !inputs.available.sleeping) return 'daily-calm'
  return requested
}
