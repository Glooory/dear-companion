import type { FoundationApi } from '@shared/contracts'

declare global {
  interface Window {
    dearCompanion: FoundationApi
  }
}

export {}
