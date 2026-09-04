import {
  BUBBLE_WINDOW_HEIGHT,
  BUBBLE_WINDOW_WIDTH,
  PET_WINDOW_HEIGHT,
  PET_WINDOW_WIDTH,
  type BubblePlacement,
} from "../../shared/contracts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface DisplaySnapshot {
  id: string;
  bounds: Rect;
  workArea: Rect;
  isPrimary: boolean;
}

export function chooseDisplay(
  displays: readonly DisplaySnapshot[],
  savedDisplayId: string | null,
  savedPoint: Point | null
): DisplaySnapshot {
  const savedDisplay = displays.find((display) => display.id === savedDisplayId);
  if (savedDisplay) return savedDisplay;

  if (savedPoint) {
    const containingDisplay = displays.find((display) => containsPoint(display.bounds, savedPoint));
    if (containingDisplay) return containingDisplay;
  }

  const fallback = displays.find((display) => display.isPrimary) ?? displays[0];
  if (!fallback) throw new Error("Cannot place the pet without an available display");
  return fallback;
}

export function clampRectToWorkArea(rect: Rect, workArea: Rect, margin = 8): Rect {
  const horizontal = clampAxis(rect.x, rect.width, workArea.x, workArea.width, margin);
  const vertical = clampAxis(rect.y, rect.height, workArea.y, workArea.height, margin);

  return {
    x: horizontal.position,
    y: vertical.position,
    width: horizontal.size,
    height: vertical.size,
  };
}

export function moveRectWithinWorkArea(rect: Rect, workArea: Rect, deltaX: number, deltaY: number, margin = 8): Rect {
  return clampRectToWorkArea(
    {
      ...rect,
      x: rect.x + deltaX,
      y: rect.y + deltaY,
    },
    workArea,
    margin
  );
}

export function resolvePetWindowBounds(
  displays: readonly DisplaySnapshot[],
  savedDisplayId: string | null,
  savedPoint: Point | null,
  size: Pick<Rect, "width" | "height"> = { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT },
  margin = 8
): Rect {
  const display = chooseDisplay(displays, savedDisplayId, savedPoint);
  const x = savedPoint?.x ?? display.workArea.x + display.workArea.width - size.width - margin;
  const y = savedPoint?.y ?? display.workArea.y + display.workArea.height - size.height - margin;

  return clampRectToWorkArea({ ...size, x, y }, display.workArea, margin);
}

export interface SettingsWindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export function resolveSettingsWindowBounds(
  displays: readonly DisplaySnapshot[],
  savedBounds?: Partial<SettingsWindowBounds> | null,
  defaultSize: Pick<Rect, "width" | "height"> = { width: 1000, height: 720 },
  minSize: Pick<Rect, "width" | "height"> = { width: 680, height: 520 }
): SettingsWindowBounds {
  const requestedWidth = Math.max(minSize.width, Math.round(savedBounds?.width ?? defaultSize.width));
  const requestedHeight = Math.max(minSize.height, Math.round(savedBounds?.height ?? defaultSize.height));

  if (
    savedBounds?.x !== undefined &&
    savedBounds?.y !== undefined &&
    Number.isFinite(savedBounds.x) &&
    Number.isFinite(savedBounds.y) &&
    displays.length > 0
  ) {
    const display = chooseDisplay(displays, null, { x: savedBounds.x, y: savedBounds.y });
    const clamped = clampRectToWorkArea(
      { x: savedBounds.x, y: savedBounds.y, width: requestedWidth, height: requestedHeight },
      display.workArea,
      0
    );
    return {
      x: clamped.x,
      y: clamped.y,
      width: clamped.width,
      height: clamped.height,
    };
  }

  const primaryDisplay = displays.find((d) => d.isPrimary) ?? displays[0];
  const maxWidth = primaryDisplay ? Math.max(minSize.width, primaryDisplay.workArea.width) : requestedWidth;
  const maxHeight = primaryDisplay ? Math.max(minSize.height, primaryDisplay.workArea.height) : requestedHeight;

  return {
    width: Math.min(requestedWidth, maxWidth),
    height: Math.min(requestedHeight, maxHeight),
  };
}

function containsPoint(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampAxis(
  position: number,
  size: number,
  workAreaOrigin: number,
  workAreaExtent: number,
  margin: number
): { position: number; size: number } {
  const effectiveExtent = Math.max(1, workAreaExtent);
  const effectiveMargin = Math.min(Math.max(0, margin), Math.max(0, Math.floor((effectiveExtent - 1) / 2)));
  const availableSize = Math.max(1, effectiveExtent - effectiveMargin * 2);
  const clampedSize = Math.max(1, Math.min(size, availableSize));
  const minimumPosition = workAreaOrigin + effectiveMargin;
  const maximumPosition = workAreaOrigin + effectiveExtent - effectiveMargin - clampedSize;

  return {
    position: clamp(position, minimumPosition, maximumPosition),
    size: clampedSize,
  };
}

export interface BubbleWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  placement: BubblePlacement;
  tailOffsetX: number;
}

export const DEFAULT_BUBBLE_WINDOW_GAP = 0;
export const DEFAULT_BUBBLE_WINDOW_MARGIN = 8;

export function resolveBubbleWindowBounds(
  petBounds: Rect,
  workArea: Rect,
  bubbleSize: Pick<Rect, "width" | "height"> = { width: BUBBLE_WINDOW_WIDTH, height: BUBBLE_WINDOW_HEIGHT },
  gap = DEFAULT_BUBBLE_WINDOW_GAP,
  margin = DEFAULT_BUBBLE_WINDOW_MARGIN
): BubbleWindowBounds {
  const petCenterX = petBounds.x + petBounds.width / 2;
  const width = Math.min(bubbleSize.width, Math.max(1, workArea.width - margin * 2));
  const height = Math.min(bubbleSize.height, Math.max(1, workArea.height - margin * 2));

  // Horizontal placement: center on pet, clamped inside workArea
  const idealX = Math.round(petCenterX - width / 2);
  const minX = workArea.x + margin;
  const maxX = workArea.x + workArea.width - margin - width;
  const x = clamp(idealX, minX, maxX);

  // Vertical placement: prefer top unless pet is too close to workArea top
  const canFitTop = petBounds.y - height - gap >= workArea.y + margin;
  const canFitBottom = petBounds.y + petBounds.height + gap + height <= workArea.y + workArea.height - margin;

  let y: number;
  let placement: BubblePlacement;

  if (canFitTop) {
    placement = "top";
    y = Math.round(petBounds.y - height - gap);
  } else if (canFitBottom) {
    placement = "bottom";
    y = Math.round(petBounds.y + petBounds.height + gap);
  } else {
    // Both sides are tight: choose the side with more remaining space
    const topSpace = petBounds.y - workArea.y;
    const bottomSpace = workArea.y + workArea.height - (petBounds.y + petBounds.height);
    if (topSpace >= bottomSpace) {
      placement = "top";
      y = clamp(petBounds.y - height - gap, workArea.y + margin, workArea.y + workArea.height - margin - height);
    } else {
      placement = "bottom";
      y = clamp(
        petBounds.y + petBounds.height + gap,
        workArea.y + margin,
        workArea.y + workArea.height - margin - height
      );
    }
  }

  // Dynamic tail offset relative to bubble window left edge (keep safely within bubble corners)
  const minTailOffset = Math.min(24, Math.floor(width / 4));
  const maxTailOffset = Math.max(minTailOffset, width - minTailOffset);
  const rawTailOffset = petCenterX - x;
  const tailOffsetX = Math.round(clamp(rawTailOffset, minTailOffset, maxTailOffset));

  return {
    x,
    y,
    width,
    height,
    placement,
    tailOffsetX,
  };
}
