import { describe, expect, it } from 'vitest'
import { SharpImageDecoder } from './image-decoder'

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAEUlEQVR4nGP4z8BQD8IMMAYAOMoF+at9CEwAAAAASUVORK5CYII=',
  'base64'
)
const transparentWebp = Buffer.from(
  'UklGRhwAAABXRUJQVlA4TA8AAAAvAUAAEAcQ/Y/+BSKi/wEA',
  'base64'
)

describe('SharpImageDecoder', () => {
  it.each([
    ['png', transparentPng],
    ['webp', transparentWebp]
  ] as const)('decodes real transparent %s pixels', async (format, bytes) => {
    await expect(new SharpImageDecoder().decode(bytes, format)).resolves.toEqual({
      width: 2,
      height: 2,
      alphaBounds: { x: 0, y: 0, width: 2, height: 2 }
    })
  })

  it('rejects a signature/decoded format mismatch', async () => {
    await expect(new SharpImageDecoder().decode(transparentPng, 'webp')).rejects.toMatchObject({
      code: 'decode-failed'
    })
  })
})
