import { describe, expect, it } from 'vitest'
import { calculateDragVelocity, isAngryDragRelease } from './drag-gesture'

describe('drag gesture velocity', () => {
  it('calculates recent distance per second', () => {
    expect(calculateDragVelocity([{ x: 0, y: 0, at: 0 }, { x: 30, y: 40, at: 100 }])).toBe(500)
  })

  it('uses only the configured recent sample window', () => {
    expect(calculateDragVelocity([
      { x: -500, y: 0, at: 0 },
      { x: 0, y: 0, at: 900 },
      { x: 100, y: 0, at: 1_000 }
    ])).toBe(1_000)
  })

  it('triggers anger at or above the threshold', () => {
    const samples = [{ x: 0, y: 0, at: 0 }, { x: 120, y: 0, at: 100 }]
    expect(isAngryDragRelease(samples, 1_200)).toBe(true)
    expect(isAngryDragRelease(samples, 1_201)).toBe(false)
  })

  it('safely ignores malformed or zero-duration samples', () => {
    expect(calculateDragVelocity([{ x: 0, y: 0, at: 1 }, { x: 10, y: 10, at: 1 }])).toBe(0)
    expect(calculateDragVelocity([{ x: Number.NaN, y: 0, at: 0 }])).toBe(0)
  })
})
