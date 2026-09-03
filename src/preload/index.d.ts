import type { ReleaseHardeningApi } from "@shared/contracts";

declare global {
  interface Window {
    dearCompanion: ReleaseHardeningApi;
  }
}

export {};
