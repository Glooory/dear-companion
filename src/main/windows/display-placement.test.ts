import { describe, expect, it } from 'vitest'
import {
  chooseDisplay,
  clampRectToWorkArea,
  moveRectWithinWorkArea,
  resolvePetWindowBounds,
  type DisplaySnapshot
} from './display-placement'

const displays: readonly DisplaySnapshot[] = [
  {
    id: 'left',
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
    isPrimary: false
  },
  {
    id: 'primary',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    isPrimary: true
  }
]

describe('display placement', () => {
  it('uses the saved display when it still exists', () => {
    expect(chooseDisplay(displays, 'left', { x: 120, y: 120 })).toEqual(displays[0])
  })

  it('uses the display containing the saved point when the id changed', () => {
    expect(chooseDisplay(displays, 'old-left-id', { x: -800, y: 400 })).toEqual(displays[0])
  })

  it('falls back to the primary display when the saved display disappeared', () => {
    expect(chooseDisplay(displays, 'missing', { x: 2600, y: 400 })).toEqual(displays[1])
  })

  it('keeps every edge inside the work area with an 8 DIP margin', () => {
    expect(
      clampRectToWorkArea(
        { x: -2200, y: 1000, width: 320, height: 320 },
        displays[0]!.workArea
      )
    ).toEqual({ x: -1912, y: 712, width: 320, height: 320 })
  })

  it('shortens pet movement at the edge of the visible work area', () => {
    expect(
      moveRectWithinWorkArea(
        { x: 1588, y: 712, width: 320, height: 320 },
        displays[1]!.workArea,
        12,
        0
      )
    ).toEqual({ x: 1592, y: 712, width: 320, height: 320 })
  })

  it('places a missing position at the primary work-area bottom-right', () => {
    expect(resolvePetWindowBounds(displays, null, null, { width: 320, height: 320 })).toEqual({
      x: 1592,
      y: 712,
      width: 320,
      height: 320
    })
  })

  it('keeps a nonzero visible rectangle when the work area cannot fit the normal margin', () => {
    expect(
      clampRectToWorkArea(
        { x: -100, y: -100, width: 320, height: 320 },
        { x: 100, y: 200, width: 8, height: 0 }
      )
    ).toEqual({ x: 103, y: 200, width: 2, height: 1 })
  })
})
