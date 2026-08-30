import { describe, expect, it } from 'vitest'
import { DialogueSelector } from './dialogue-selector'

describe('DialogueSelector', () => {
  it('enforces category cooldowns and excludes the last two lines', () => {
    const selector = new DialogueSelector()
    const lines = ['a', 'b', 'c']
    expect(selector.select({ category: 'daily:click', lines, now: 0, random: () => 0 })).toBe('a')
    expect(selector.select({ category: 'daily:click', lines, now: 1_000, random: () => 0 })).toBeNull()
    expect(selector.select({ category: 'daily:click', lines, now: 5_000, random: () => 0 })).toBe('b')
    expect(selector.select({ category: 'daily:petting', lines, now: 5_001, random: () => 0 })).toBe('c')
  })

  it('uses longer automatic cooldown and deterministic small-pool fallback', () => {
    const selector = new DialogueSelector()
    expect(selector.select({ category: 'auto:cute', lines: ['a'], now: 0, random: () => 0.9 })).toBe('a')
    expect(selector.select({ category: 'auto:cute', lines: ['a'], now: 59_999, random: () => 0 })).toBeNull()
    expect(selector.select({ category: 'auto:cute', lines: ['a'], now: 60_000, random: () => 0 })).toBe('a')
  })

  it('returns null for disabled, empty or invalid-time requests', () => {
    const selector = new DialogueSelector()
    expect(selector.select({ category: 'x', lines: ['a'], now: 0, random: () => 0, enabled: false })).toBeNull()
    expect(selector.select({ category: 'x', lines: [], now: 0, random: () => 0 })).toBeNull()
    expect(selector.select({ category: 'x', lines: ['a'], now: Number.NaN, random: () => 0 })).toBeNull()
  })

  it('resets cooldowns and recent lines on reset', () => {
    const selector = new DialogueSelector()
    const lines = ['a', 'b', 'c']
    expect(selector.select({ category: 'daily:click', lines, now: 0, random: () => 0 })).toBe('a')
    expect(selector.select({ category: 'daily:click', lines, now: 1_000, random: () => 0 })).toBeNull()
    selector.reset()
    expect(selector.select({ category: 'daily:click', lines, now: 1_000, random: () => 0 })).toBe('a')
  })
})
