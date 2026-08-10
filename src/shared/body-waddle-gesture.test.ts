import { describe, expect, it } from 'vitest'
import { BodyWaddleGesture, type BodyWaddleRegion } from './body-waddle-gesture'

const region: BodyWaddleRegion = {
  visibleRect: { x: 0, y: 0, width: 100, height: 200 },
  headEllipse: { centerX: 50, centerY: 30, radiusX: 20, radiusY: 20 }
}

describe('body waddle gesture', () => {
  it('reports the horizontal movement direction after crossing the threshold', () => {
    const right = new BodyWaddleGesture()
    expect(right.register({ x: 10, y: 100, at: 0 }, region)).toBe(0)
    expect(right.register({ x: 25, y: 101, at: 50 }, region)).toBe(0)
    expect(right.register({ x: 41, y: 100, at: 100 }, region)).toBe(1)

    const left = new BodyWaddleGesture()
    left.register({ x: 80, y: 100, at: 0 }, region)
    left.register({ x: 64, y: 100, at: 50 }, region)
    expect(left.register({ x: 49, y: 100, at: 100 }, region)).toBe(-1)
  })

  it('resets accumulated movement inside the head region', () => {
    const gesture = new BodyWaddleGesture()
    gesture.register({ x: 10, y: 100, at: 0 }, region)
    gesture.register({ x: 25, y: 100, at: 50 }, region)
    expect(gesture.register({ x: 40, y: 30, at: 100 }, region)).toBe(0)
    expect(gesture.register({ x: 75, y: 100, at: 150 }, region)).toBe(0)
    expect(gesture.register({ x: 100, y: 100, at: 200 }, region)).toBe(0)
  })

  it('ignores movement dominated by the vertical axis', () => {
    const gesture = new BodyWaddleGesture()
    gesture.register({ x: 10, y: 100, at: 0 }, region)
    expect(gesture.register({ x: 41, y: 150, at: 100 }, region)).toBe(0)
  })

  it('enforces a one-second cooldown after triggering', () => {
    const gesture = new BodyWaddleGesture()
    gesture.register({ x: 10, y: 100, at: 0 }, region)
    expect(gesture.register({ x: 45, y: 100, at: 100 }, region)).toBe(1)
    expect(gesture.register({ x: 10, y: 100, at: 500 }, region)).toBe(0)
    expect(gesture.register({ x: 45, y: 100, at: 900 }, region)).toBe(0)
    expect(gesture.register({ x: 10, y: 100, at: 1_100 }, region)).toBe(-1)
  })
})
