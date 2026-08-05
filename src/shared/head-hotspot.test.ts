import { describe, expect, it } from 'vitest'
import { computeHeadHotspotGeometry, defaultHeadHotspot } from './head-hotspot'

describe('head hotspot geometry', () => {
  it('uses the approved non-AI default', () => {
    expect(defaultHeadHotspot({ x: 10, y: 20, width: 80, height: 160 })).toEqual({
      centerX: 0.5, centerY: 0.22, radiusX: 0.18, radiusY: 0.18
    })
  })

  it('composes normalized hotspot coordinates with asset geometry', () => {
    const geometry = computeHeadHotspotGeometry({
      width: 100, height: 200, alphaBounds: { x: 10, y: 20, width: 80, height: 160 },
      normalization: { scale: 1, offsetX: 0, offsetY: 0, baselineOffset: 0 },
      headHotspot: { centerX: 0.5, centerY: 0.25, radiusX: 0.2, radiusY: 0.1 }
    }, 160, { width: 200, height: 220, baselineY: 200 })
    expect(geometry).toEqual({ centerX: 100, centerY: 80, radiusX: 16, radiusY: 16 })
  })

  it('disables geometry when no hotspot is configured', () => {
    expect(computeHeadHotspotGeometry({
      width: 1, height: 1, alphaBounds: { x: 0, y: 0, width: 1, height: 1 },
      normalization: { scale: 1, offsetX: 0, offsetY: 0, baselineOffset: 0 }, headHotspot: null
    }, 80, { width: 100, height: 100 })).toBeNull()
  })
})
