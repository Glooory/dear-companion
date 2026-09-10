import type { MotionTemplate } from "./companion-motion";

export type WakeStage = "murmur" | "stirring" | "awake";
export const WAKE_SEQUENCE_EXPIRY_MS = 4_000;

export interface WakeStepResult {
  stage: WakeStage;
  photoOverride: string | null;
  motion: MotionTemplate;
  dialogueKey: "sleeping:murmur" | "sleeping:stirring" | "sleeping:awake";
  transitionThenDip: boolean;
}

export class WakeSequence {
  private clickCount = 0;
  private lastClickAt: number | null = null;
  private activePhotoOverride: string | null = null;

  registerClick(at: number, availableDrowsyAssetId?: string | null): WakeStepResult {
    if (!Number.isFinite(at) || (this.lastClickAt !== null && at < this.lastClickAt)) {
      this.reset();
      return {
        stage: "murmur",
        photoOverride: null,
        motion: "wake-sway",
        dialogueKey: "sleeping:murmur",
        transitionThenDip: false,
      };
    }
    if (this.lastClickAt === null || at - this.lastClickAt > WAKE_SEQUENCE_EXPIRY_MS) {
      this.clickCount = 0;
      this.activePhotoOverride = null;
    }
    this.clickCount += 1;
    this.lastClickAt = at;

    if (this.clickCount === 1) {
      this.activePhotoOverride = null;
      return {
        stage: "murmur",
        photoOverride: null,
        motion: "wake-sway",
        dialogueKey: "sleeping:murmur",
        transitionThenDip: false,
      };
    }

    if (this.clickCount === 2) {
      const override = availableDrowsyAssetId ?? null;
      this.activePhotoOverride = override;
      return {
        stage: "stirring",
        photoOverride: override,
        motion: "drowsy-dip",
        dialogueKey: "sleeping:stirring",
        transitionThenDip: override !== null,
      };
    }

    this.reset();
    return {
      stage: "awake",
      photoOverride: null,
      motion: "settle",
      dialogueKey: "sleeping:awake",
      transitionThenDip: false,
    };
  }

  getPhotoOverride(at?: number): string | null {
    if (at !== undefined && (this.lastClickAt === null || at - this.lastClickAt > WAKE_SEQUENCE_EXPIRY_MS)) {
      this.reset();
      return null;
    }
    return this.activePhotoOverride;
  }

  isExpired(at: number): boolean {
    return this.lastClickAt !== null && at - this.lastClickAt > WAKE_SEQUENCE_EXPIRY_MS;
  }

  reset(): void {
    this.clickCount = 0;
    this.lastClickAt = null;
    this.activePhotoOverride = null;
  }
}
