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
  const availableWidth = Math.max(0, workArea.width - margin * 2)
  const availableHeight = Math.max(0, workArea.height - margin * 2)
  const width = Math.min(rect.width, availableWidth)
  const height = Math.min(rect.height, availableHeight)
  const minimumX = workArea.x + margin
  const minimumY = workArea.y + margin
  const maximumX = workArea.x + workArea.width - margin - width
  const maximumY = workArea.y + workArea.height - margin - height

  return {
    x: clamp(rect.x, minimumX, maximumX),
    y: clamp(rect.y, minimumY, maximumY),
    width,
    height
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
