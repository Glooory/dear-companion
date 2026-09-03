import { PET_WINDOW_HEIGHT, PET_WINDOW_WIDTH } from "../../shared/contracts";

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
