import type { ActionSlot, PetConfig } from "./contracts";

export type ActionTemplate =
  | "still"
  | "asset-swap"
  | "bounce"
  | "curious-tilt"
  | "wiggle"
  | "sway"
  | "rhythm-sway"
  | "peep-approach"
  | "posture-shift"
  | "stretch"
  | "scale-nod"
  | "petting-sink"
  | "nuzzle"
  | "purr-swell"
  | "land"
  | "drowsy-catch"
  | "fast-shake"
  | "gentle-breathe"
  | "nod";

export type ActionOverlay = "protest-bubble" | "tears";

export interface ResolvedAction {
  slot: ActionSlot;
  assetIds: readonly string[];
  template: ActionTemplate;
  overlays: readonly ActionOverlay[];
  usedFallback: boolean;
}

export function resolveAction(
  pet: Pick<PetConfig, "actionSlots">,
  slot: ActionSlot,
  randomIndex = 0,
  baseAssetId?: string
): ResolvedAction {
  const idleAssetId = baseAssetId ?? select(pet.actionSlots.idle, randomIndex);
  if (!idleAssetId) throw new Error("An idle asset is required to resolve pet actions");

  if (slot === "idle") {
    return { slot: "idle", assetIds: [idleAssetId], template: "still", overlays: [], usedFallback: false };
  }

  const restingAssetId = select(pet.actionSlots.resting, randomIndex);
  if (restingAssetId) {
    return {
      slot: "resting",
      assetIds: [restingAssetId],
      template: "asset-swap",
      overlays: [],
      usedFallback: false,
    };
  }

  return {
    slot: "resting",
    assetIds: [idleAssetId],
    template: "gentle-breathe",
    overlays: [],
    usedFallback: true,
  };
}

function select(values: readonly string[], index: number): string | null {
  if (!values || values.length === 0) return null;
  return values[positiveModulo(index, values.length)] ?? null;
}

function positiveModulo(value: number, divisor: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : 0;
  return ((integer % divisor) + divisor) % divisor;
}
