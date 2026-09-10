import { APPROACH_DURATION_MS } from "./companion-rhythm";
import type { CompanionLifeState, CompanionPace } from "./contracts";

export const PHOTO_TRANSITION_MS = 400;
export const REDUCED_PHOTO_TRANSITION_MS = 120;
export const ACTION_PHOTO_HOLD_MS = 1_000;
export const ASSET_SWAP_DURATION_MS = PHOTO_TRANSITION_MS + ACTION_PHOTO_HOLD_MS;
export const REDUCED_ASSET_SWAP_DURATION_MS = REDUCED_PHOTO_TRANSITION_MS;

export const NORMAL_WEIGHT_SHIFT_BASE_DIP = 1;
export const NORMAL_WEIGHT_SHIFT_DEG = 0.7;
export const WORKING_WEIGHT_SHIFT_BASE_DIP = 0.5;
export const WORKING_WEIGHT_SHIFT_DEG = 0.35;

export interface WeightShiftAmplitude {
  horizontalDip: number;
  rotationDeg: number;
}

export type MotionDirection = -1 | 0 | 1;

export type MotionTemplate =
  | "still"
  | "asset-swap"
  | "gentle-breathe"
  | "weight-shift"
  | "working-shift"
  | "toe-rise"
  | "observe-lean"
  | "two-step-approach"
  | "body-step"
  | "soft-lift"
  | "calm-lean"
  | "playful-hop"
  | "playful-double-hop"
  | "drowsy-dip"
  | "petting-lean"
  | "settle"
  | "angry-shake"
  | "crying-tremble"
  | "wake-sway"
  | "reduced-pulse";

export interface MotionDefinition {
  durationMs: number;
  reducedMotionFallback: MotionTemplate;
  movesWindow: boolean;
}

export interface ResolvedMotion extends MotionDefinition {
  template: MotionTemplate;
}

export interface MotionPoint {
  x: number;
  y: number;
}

export interface MotionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HoverPose {
  translateX: number;
  translateY: number;
  rotate: number;
}

export const MOTION_DEFINITIONS: Readonly<Record<MotionTemplate, MotionDefinition>> = Object.freeze({
  still: definition(0, "still"),
  "asset-swap": definition(ASSET_SWAP_DURATION_MS, "asset-swap"),
  "gentle-breathe": definition(1_800, "gentle-breathe"),
  "weight-shift": definition(1_500, "gentle-breathe"),
  "working-shift": definition(1_500, "gentle-breathe"),
  "toe-rise": definition(900, "reduced-pulse"),
  "observe-lean": definition(900, "reduced-pulse"),
  "two-step-approach": definition(APPROACH_DURATION_MS, "reduced-pulse", true),
  "body-step": definition(620, "reduced-pulse", true),
  "soft-lift": definition(520, "reduced-pulse"),
  "calm-lean": definition(620, "reduced-pulse"),
  "playful-hop": definition(620, "reduced-pulse"),
  "playful-double-hop": definition(720, "reduced-pulse"),
  "drowsy-dip": definition(1_500, "gentle-breathe"),
  "petting-lean": definition(900, "reduced-pulse"),
  settle: definition(280, "reduced-pulse"),
  "angry-shake": definition(1_040, "reduced-pulse"),
  "crying-tremble": definition(900, "gentle-breathe"),
  "wake-sway": definition(700, "reduced-pulse"),
  "reduced-pulse": definition(160, "reduced-pulse"),
});

const AMBIENT_POOLS = {
  "daily-calm": ["gentle-breathe", "weight-shift"],
  "daily-playful": ["gentle-breathe", "weight-shift", "toe-rise"],
  drowsy: ["gentle-breathe", "drowsy-dip"],
  sleeping: ["gentle-breathe"],
  working: ["gentle-breathe", "working-shift"],
} as const satisfies Readonly<Record<CompanionLifeState, readonly MotionTemplate[]>>;

const CLICK_POOLS = {
  "daily-calm": ["soft-lift", "calm-lean", "weight-shift"],
  "daily-playful": ["playful-hop", "playful-double-hop", "observe-lean"],
  drowsy: ["drowsy-dip"],
  sleeping: ["wake-sway"],
  working: ["calm-lean"],
} as const satisfies Readonly<Record<CompanionLifeState, readonly MotionTemplate[]>>;

export function resolveMotion(template: MotionTemplate, reducedMotion: boolean): ResolvedMotion {
  const resolvedTemplate = reducedMotion ? MOTION_DEFINITIONS[template].reducedMotionFallback : template;
  const baseDef = MOTION_DEFINITIONS[resolvedTemplate];
  const durationMs =
    reducedMotion && resolvedTemplate === "asset-swap"
      ? REDUCED_ASSET_SWAP_DURATION_MS
      : baseDef.durationMs;
  return { template: resolvedTemplate, ...baseDef, durationMs };
}

export function getWeightShiftAmplitude(
  template: "weight-shift" | "working-shift",
  targetHeight = 180
): WeightShiftAmplitude {
  const safeHeight = Number.isFinite(targetHeight) && targetHeight > 0 ? targetHeight : 180;
  const heightScale = clamp(safeHeight / 180, 0.5, 1.35);
  if (template === "working-shift") {
    return {
      horizontalDip: round(WORKING_WEIGHT_SHIFT_BASE_DIP * heightScale),
      rotationDeg: WORKING_WEIGHT_SHIFT_DEG,
    };
  }
  return {
    horizontalDip: round(NORMAL_WEIGHT_SHIFT_BASE_DIP * heightScale),
    rotationDeg: NORMAL_WEIGHT_SHIFT_DEG,
  };
}

export type AssetSwapStep =
  | { action: "hold-then-return"; holdMs: number }
  | { action: "return-immediately" }
  | { action: "finish" };

export function determineAssetSwapStep(
  phase: "active" | "returning",
  reducedMotion: boolean,
  needsReturnToBase: boolean,
  holdMs: number = ACTION_PHOTO_HOLD_MS
): AssetSwapStep {
  if (phase === "returning") {
    return { action: "finish" };
  }
  if (!needsReturnToBase) {
    return { action: "finish" };
  }
  if (reducedMotion) {
    return { action: "return-immediately" };
  }
  return { action: "hold-then-return", holdMs };
}

export function getInitialActionTimeout(
  template: MotionTemplate,
  durationMs: number
): number | null {
  if (template === "asset-swap") {
    return null;
  }
  return durationMs;
}

const DIRECTIONAL_TEMPLATES = new Set<MotionTemplate>([
  "weight-shift",
  "working-shift",
  "observe-lean",
  "two-step-approach",
  "body-step",
  "calm-lean",
  "drowsy-dip",
  "petting-lean",
  "wake-sway",
]);

export function motionRequiresDirection(template: MotionTemplate): boolean {
  return DIRECTIONAL_TEMPLATES.has(template);
}

export function resolveNextMotionDirection(
  template: MotionTemplate,
  previousDirection: MotionDirection | null,
  random: () => number
): { direction: MotionDirection; nextHistory: MotionDirection | null } {
  if (!motionRequiresDirection(template)) {
    return { direction: 0, nextHistory: previousDirection };
  }
  const direction = selectMotionDirection(previousDirection, random);
  return { direction, nextHistory: direction };
}

export function unionMotionRect(a: MotionRect | null, b: MotionRect | null): MotionRect | null {
  if (!a) return b;
  if (!b) return a;
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function selectNonRepeating<T>(
  values: readonly T[],
  previous: T | null,
  random: () => number
): T {
  if (values.length === 0) throw new Error("At least one motion choice is required");
  const candidates = values.length > 1 ? values.filter((value) => value !== previous) : values;
  const index = Math.min(candidates.length - 1, Math.floor(finiteRandom(random) * candidates.length));
  return candidates[index]!;
}

export function selectMotionDirection(previous: MotionDirection | null, random: () => number): -1 | 1 {
  if (previous === -1 || previous === 1) return previous === -1 ? 1 : -1;
  return finiteRandom(random) < 0.5 ? -1 : 1;
}

export function selectAmbientMotion(
  lifeState: CompanionLifeState,
  _pace: CompanionPace,
  previous: MotionTemplate | null,
  random: () => number
): MotionTemplate {
  return selectNonRepeating(AMBIENT_POOLS[lifeState], previous, random);
}

const PERSONALITY_POOLS: Readonly<Record<CompanionPace, readonly MotionTemplate[]>> = Object.freeze({
  quiet: ["observe-lean", "weight-shift"],
  natural: ["observe-lean", "toe-rise", "playful-hop"],
  lively: ["playful-hop", "playful-double-hop", "observe-lean", "toe-rise"],
});

const PERSONALITY_PHOTO_SWAP_PROBABILITIES: Readonly<Record<CompanionPace, number>> = Object.freeze({
  quiet: 0,
  natural: 0.12,
  lively: 0.18,
});

export function shouldSwapPersonalityPhoto(
  pace: CompanionPace,
  hasAlternativePhoto: boolean,
  random: () => number
): boolean {
  if (!hasAlternativePhoto) return false;
  const threshold = PERSONALITY_PHOTO_SWAP_PROBABILITIES[pace];
  if (threshold <= 0) return false;
  return finiteRandom(random) < threshold;
}

export function selectPersonalityMotion(
  lifeState: CompanionLifeState,
  pace: CompanionPace,
  previous: MotionTemplate | null,
  random: () => number
): MotionTemplate {
  if (lifeState !== "daily-calm" && lifeState !== "daily-playful") {
    return "gentle-breathe";
  }
  return selectNonRepeating(PERSONALITY_POOLS[pace], previous, random);
}

export function selectClickMotion(
  lifeState: CompanionLifeState,
  previous: MotionTemplate | null,
  random: () => number
): MotionTemplate {
  return selectNonRepeating(CLICK_POOLS[lifeState], previous, random);
}

export function computeHoverPose(point: MotionPoint, rect: MotionRect | null): HoverPose {
  if (!isFinitePoint(point) || !isFiniteRect(rect)) return neutralPose();
  const normalizedX = clamp((point.x - (rect.x + rect.width / 2)) / (rect.width / 2), -1, 1);
  const normalizedY = clamp((point.y - (rect.y + rect.height / 2)) / (rect.height / 2), -1, 1);
  return {
    translateX: round(normalizedX * 2),
    translateY: round(normalizedY),
    rotate: round(normalizedX * 1.6),
  };
}

export function scaleMotionDip(baseDip: number, targetHeight: number): number {
  const safeBase = Number.isFinite(baseDip) ? baseDip : 0;
  const safeHeight = Number.isFinite(targetHeight) && targetHeight > 0 ? targetHeight : 180;
  return Math.round(safeBase * clamp(safeHeight / 180, 0.5, 1.35));
}

function definition(
  durationMs: number,
  reducedMotionFallback: MotionTemplate,
  movesWindow = false
): MotionDefinition {
  return Object.freeze({ durationMs, reducedMotionFallback, movesWindow });
}

function neutralPose(): HoverPose {
  return { translateX: 0, translateY: 0, rotate: 0 };
}

function isFinitePoint(point: MotionPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isFiniteRect(rect: MotionRect | null): rect is MotionRect {
  return (
    rect !== null &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function finiteRandom(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
