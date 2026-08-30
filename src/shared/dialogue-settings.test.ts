import { describe, expect, test } from 'vitest'
import {
  DIALOGUE_CATEGORIES,
  DIALOGUE_GROUPS,
  getDialogueTriggerMeta
} from './dialogue-catalog'
import {
  countVisibleCharacters,
  parsePetDialogueSettings,
  resolveDialogueLines,
  restoreBuiltInLine,
  restoreBuiltInCategory
} from './dialogue-settings'

describe('dialogue catalog coverage', () => {
  test('all 17 trigger IDs are unique across groups', () => {
    expect(DIALOGUE_CATEGORIES).toHaveLength(17)
    expect(new Set(DIALOGUE_CATEGORIES).size).toBe(17)
    const groupTriggerIds = DIALOGUE_GROUPS.flatMap((group) => group.triggers.map((t) => t.id))
    expect(groupTriggerIds).toEqual(DIALOGUE_CATEGORIES)
  })

  test('every built-in line ID is unique within its trigger', () => {
    for (const category of DIALOGUE_CATEGORIES) {
      const meta = getDialogueTriggerMeta(category)
      expect(meta.builtIns.length).toBeGreaterThan(0)
      const lineIds = meta.builtIns.map((row) => row.id)
      expect(new Set(lineIds).size).toBe(lineIds.length)
      for (const line of meta.builtIns) {
        expect(line.text.trim().length).toBeGreaterThan(0)
        expect(countVisibleCharacters(line.text)).toBeLessThanOrEqual(30)
      }
    }
  })
})

describe('dialogue character counting and normalization', () => {
  test('emoji and combined characters count as one grapheme', () => {
    expect(countVisibleCharacters('👨‍👩‍👧‍👦')).toBe(1)
    expect(countVisibleCharacters('🎉')).toBe(1)
    expect(countVisibleCharacters('小葡萄')).toBe(3)
  })

  test('trims outer whitespace from address and dialogue lines', () => {
    const parsed = parsePetDialogueSettings({
      address: '  小葡萄  ',
      categories: {
        'daily:click': {
          builtInOverrides: [
            { lineId: 'daily-click-here', text: '  在呢～  ' }
          ],
          customLines: [
            { id: 'custom-1', automaticEnabled: true, text: '  收到啦  ' }
          ]
        }
      }
    })
    expect(parsed.address).toBe('小葡萄')
    expect(parsed.categories['daily:click']?.builtInOverrides[0]?.text).toBe('在呢～')
    expect(parsed.categories['daily:click']?.customLines[0]?.text).toBe('收到啦')
  })

  test('drops empty category objects during parse', () => {
    const parsed = parsePetDialogueSettings({
      address: '小葡萄',
      categories: {
        'daily:click': {
          builtInOverrides: [],
          customLines: []
        }
      }
    })
    expect(parsed.categories['daily:click']).toBeUndefined()
  })

  test('rejects newlines and control characters in dialogue and address', () => {
    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [],
            customLines: [
              { id: 'line-1', automaticEnabled: true, text: '第一行\n第二行' }
            ]
          }
        }
      })
    ).toThrow('对白只能写一行')

    expect(() =>
      parsePetDialogueSettings({
        address: '小\n葡萄',
        categories: {}
      })
    ).toThrow('称呼只能写一行')

    expect(() =>
      parsePetDialogueSettings({
        address: '小\u0007葡萄',
        categories: {}
      })
    ).toThrow('称呼不能包含控制字符')

    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [],
            customLines: [
              { id: 'line-1', automaticEnabled: true, text: '对白\u0007内容' }
            ]
          }
        }
      })
    ).toThrow('对白不能包含控制字符')
  })

  test('rejects 13-character addresses and 31-character lines', () => {
    expect(() =>
      parsePetDialogueSettings({
        address: '一二三四五六七八九十甲乙丙',
        categories: {}
      })
    ).toThrow('称呼最多 12 个字')

    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [],
            customLines: [
              { id: 'line-1', automaticEnabled: true, text: '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一' }
            ]
          }
        }
      })
    ).toThrow('对白最多 30 个字')
  })

  test('rejects 21st custom line in a single trigger', () => {
    const customLines = Array.from({ length: 21 }, (_, index) => ({
      id: `line-${index}`,
      automaticEnabled: true,
      text: `自定义句子${index}`
    }))
    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [],
            customLines
          }
        }
      })
    ).toThrow('每个互动时机最多添加 20 条对白')
  })

  test('rejects unsafe and duplicate identifiers', () => {
    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [],
            customLines: [
              { id: 'INVALID ID!', automaticEnabled: true, text: '测试' }
            ]
          }
        }
      })
    ).toThrow('Invalid dialogue identifier')

    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [],
            customLines: [
              { id: 'custom-1', automaticEnabled: true, text: '测试一' },
              { id: 'custom-1', automaticEnabled: true, text: '测试二' }
            ]
          }
        }
      })
    ).toThrow('Duplicate custom line identifier')

    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [
              { lineId: 'daily-click-here', text: '修改一' },
              { lineId: 'daily-click-here', text: '修改二' }
            ],
            customLines: []
          }
        }
      })
    ).toThrow('Duplicate built-in override line identifier')
  })

  test('rejects duplicate templates within the same trigger', () => {
    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [],
            customLines: [
              { id: 'custom-1', automaticEnabled: true, text: '一样的文字' },
              { id: 'custom-2', automaticEnabled: true, text: '一样的文字' }
            ]
          }
        }
      })
    ).toThrow('对白内容不能重复')

    expect(() =>
      parsePetDialogueSettings({
        address: '',
        categories: {
          'daily:click': {
            builtInOverrides: [
              { lineId: 'daily-click-here', text: '完全一样的文字' },
              { lineId: 'daily-click-whats-up', text: '完全一样的文字' }
            ],
            customLines: []
          }
        }
      })
    ).toThrow('对白内容不能重复')
  })

  test('accepts and preserves safe stale built-in line IDs', () => {
    const parsed = parsePetDialogueSettings({
      address: '',
      categories: {
        'daily:click': {
          builtInOverrides: [
            { lineId: 'stale-line-from-older-catalog', text: '旧版对白' }
          ],
          customLines: []
        }
      }
    })
    expect(parsed.categories['daily:click']?.builtInOverrides[0]?.lineId).toBe(
      'stale-line-from-older-catalog'
    )
    const lines = resolveDialogueLines('daily:click', parsed)
    expect(lines).not.toContain('旧版对白')
  })
})

describe('resolveDialogueLines', () => {
  test('applies overrides, appends custom lines, substitutes address, and deduplicates', () => {
    const settings = parsePetDialogueSettings({
      address: '小葡萄',
      categories: {
        'daily:click': {
          builtInOverrides: [
            { lineId: 'daily-click-here', text: '[称呼]，在呢。' },
            { lineId: 'daily-click-whats-up', automaticEnabled: false }
          ],
          customLines: [
            { id: 'custom-1', automaticEnabled: true, text: '[称呼]，在呢。' },
            { id: 'custom-2', automaticEnabled: false, text: '暂不自动说' },
            { id: 'custom-3', automaticEnabled: true, text: '[称呼]，今天也辛苦啦～' }
          ]
        }
      }
    })

    const lines = resolveDialogueLines('daily:click', settings)
    expect(lines).toContain('小葡萄，在呢。')
    expect(lines).toContain('小葡萄，今天也辛苦啦～')
    expect(lines).not.toContain('怎么啦？')
    expect(lines).not.toContain('暂不自动说')
    expect(new Set(lines).size).toBe(lines.length)
  })

  test('skips placeholder lines when address is empty', () => {
    const settings = parsePetDialogueSettings({
      address: '小葡萄',
      categories: {
        'daily:click': {
          builtInOverrides: [
            { lineId: 'daily-click-here', text: '[称呼]，在呢。' }
          ],
          customLines: []
        }
      }
    })

    expect(resolveDialogueLines('daily:click', { ...settings, address: '' })).not.toContain(
      '[称呼]，在呢。'
    )
  })

  test('returns empty array when all lines are disabled', () => {
    const meta = getDialogueTriggerMeta('daily:click')
    const settings = parsePetDialogueSettings({
      address: '',
      categories: {
        'daily:click': {
          builtInOverrides: meta.builtIns.map((b) => ({
            lineId: b.id,
            automaticEnabled: false
          })),
          customLines: [
            { id: 'custom-1', automaticEnabled: false, text: '禁用中' }
          ]
        }
      }
    })

    expect(resolveDialogueLines('daily:click', settings)).toEqual([])
  })
})

describe('restore operations', () => {
  test('restoreBuiltInLine removes text override but preserves automaticEnabled: false', () => {
    const settings = parsePetDialogueSettings({
      address: '小葡萄',
      categories: {
        'daily:click': {
          builtInOverrides: [
            { lineId: 'daily-click-here', automaticEnabled: false, text: '改了字' },
            { lineId: 'daily-click-whats-up', text: '怎么了呀？' }
          ],
          customLines: []
        }
      }
    })

    const restoredOne = restoreBuiltInLine(settings, 'daily:click', 'daily-click-here')
    const overrideOne = restoredOne.categories['daily:click']?.builtInOverrides.find(
      (o) => o.lineId === 'daily-click-here'
    )
    expect(overrideOne).toEqual({ lineId: 'daily-click-here', automaticEnabled: false })

    const restoredTwo = restoreBuiltInLine(restoredOne, 'daily:click', 'daily-click-whats-up')
    const overrideTwo = restoredTwo.categories['daily:click']?.builtInOverrides.find(
      (o) => o.lineId === 'daily-click-whats-up'
    )
    expect(overrideTwo).toBeUndefined()
  })

  test('restoreBuiltInCategory removes all built-in overrides while preserving custom lines and address', () => {
    const settings = parsePetDialogueSettings({
      address: '小葡萄',
      categories: {
        'daily:click': {
          builtInOverrides: [
            { lineId: 'daily-click-here', automaticEnabled: false, text: '改了字' }
          ],
          customLines: [
            { id: 'custom-1', automaticEnabled: true, text: '我的句子' }
          ]
        }
      }
    })

    const restored = restoreBuiltInCategory(settings, 'daily:click')
    expect(restored.address).toBe(settings.address)
    expect(restored.categories['daily:click']?.builtInOverrides).toEqual([])
    expect(restored.categories['daily:click']?.customLines).toEqual(
      settings.categories['daily:click']?.customLines
    )
  })
})
