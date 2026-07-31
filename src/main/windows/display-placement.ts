export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface DisplaySnapshot {
  id: string
  bounds: Rect
  workArea: Rect
  isPrimary: boolean
}

export function chooseDisplay(
  displays: readonly DisplaySnapshot[],
  savedDisplayId: string | null,
  savedPoint: Point | null
): DisplaySnapshot {
  const savedDisplay = displays.find((display) => display.id === savedDisplayId)
  if (savedDisplay) return savedDisplay

  if (savedPoint) {
    const containingDisplay = displays.find((display) => containsPoint(display.bounds, savedPoint))
    if (containingDisplay) return containingDisplay
  }

  const fallback = displays.find((display) => display.isPrimary) ?? displays[0]
  if (!fallback) throw new Error('Cannot place the pet without an available display')
  return fallback
}

export function clampRectToWorkArea(rect: Rect, workArea: Rect, margin = 8): Rect {
  const horizontal = clampAxis(rect.x, rect.width, workArea.x, workArea.width, margin)
  const vertical = clampAxis(rect.y, rect.height, workArea.y, workArea.height, margin)

  return {
    x: horizontal.position,
    y: vertical.position,
    width: horizontal.size,
    height: vertical.size
  }
}

export function resolvePetWindowBounds(
  displays: readonly DisplaySnapshot[],
  savedDisplayId: string | null,
  savedPoint: Point | null,
  size: Pick<Rect, 'width' | 'height'> = { width: 320, height: 320 },
  margin = 8
): Rect {
  const display = chooseDisplay(displays, savedDisplayId, savedPoint)
  const x = savedPoint?.x ?? display.workArea.x + display.workArea.width - size.width - margin
  const y = savedPoint?.y ?? display.workArea.y + display.workArea.height - size.height - margin

  return clampRectToWorkArea({ ...size, x, y }, display.workArea, margin)
}

function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function clampAxis(
  position: number,
  size: number,
  workAreaOrigin: number,
  workAreaExtent: number,
  margin: number
): { position: number; size: number } {
  const effectiveExtent = Math.max(1, workAreaExtent)
  const effectiveMargin = Math.min(
    Math.max(0, margin),
    Math.max(0, Math.floor((effectiveExtent - 1) / 2))
  )
  const availableSize = Math.max(1, effectiveExtent - effectiveMargin * 2)
  const clampedSize = Math.max(1, Math.min(size, availableSize))
  const minimumPosition = workAreaOrigin + effectiveMargin
  const maximumPosition =
    workAreaOrigin + effectiveExtent - effectiveMargin - clampedSize

  return {
    position: clamp(position, minimumPosition, maximumPosition),
    size: clampedSize
  }
}
