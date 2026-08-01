import { describe, expect, it } from 'vitest'
import { MAX_AUDIO_FILE_BYTES, detectAudioFormat, validateAudioFileSize } from './audio-input'

describe('audio input validation', () => {
  it('detects MP3, WAV, and OGG signatures without trusting extensions', () => {
    expect(detectAudioFormat(Uint8Array.from([0x49, 0x44, 0x33]))).toBe('mp3')
    expect(detectAudioFormat(Uint8Array.from([0xff, 0xfb]))).toBe('mp3')
    expect(detectAudioFormat(Buffer.from('RIFFxxxxWAVE'))).toBe('wav')
    expect(detectAudioFormat(Buffer.from('OggS'))).toBe('ogg')
    expect(detectAudioFormat(Buffer.from('not audio'))).toBeNull()
  })

  it('accepts 1..20 MiB and rejects empty, non-finite, and oversized lengths', () => {
    expect(() => validateAudioFileSize(1)).not.toThrow()
    expect(() => validateAudioFileSize(MAX_AUDIO_FILE_BYTES)).not.toThrow()
    expect(() => validateAudioFileSize(0)).toThrow('为空')
    expect(() => validateAudioFileSize(MAX_AUDIO_FILE_BYTES + 1)).toThrow('20 MiB')
    expect(() => validateAudioFileSize(Number.NaN)).toThrow('为空')
  })
})
