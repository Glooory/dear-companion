import type { PetSystemApi } from '@shared/contracts'

declare global {
  interface Window {
    dearCompanion: PetSystemApi
  }
}

export {}
