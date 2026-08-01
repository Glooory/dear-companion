import type { RestSystemApi } from '@shared/contracts'

declare global {
  interface Window {
    dearCompanion: RestSystemApi
  }
}

export {}
