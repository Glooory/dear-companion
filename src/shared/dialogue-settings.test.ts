import { describe, expect, test } from "vitest";
import { DIALOGUE_CATEGORIES, DIALOGUE_GROUPS, getDialogueTriggerMeta } from "./dialogue-catalog";
import {
  countVisibleCharacters,
  getDialogueValidationIssues,
  parsePetDialogueSettings,
  resolveDialogueCandidates,
  resolveDialogueLines,
  restoreBuiltInCategory,
  restoreBuiltInLine,
  toggleCategoryAutomatic,
  MAX_QUICK_DIALOGUES,
  QUICK_DIALOGUE_BLOCKED_CATEGORIES,
  resolveDialogueReference,
  resolveQuickDialogueCandidates,
  toggleQuickDialogueReference,
  removeQuickDialogueReference,
  formatQuickDialogueLabel,
  MAX_QUICK_DIALOGUE_MENU_LABEL_LENGTH,
  type PetDialogueSettings,
} from "./dialogue-settings";

describe("dialogue catalog coverage", () => {
  test("all 19 trigger IDs are unique across groups", () => {
    expect(DIALOGUE_CATEGORIES).toHaveLength(19);
    expect(new Set(DIALOGUE_CATEGORIES).size).toBe(19);
    const groupTriggerIds = DIALOGUE_GROUPS.flatMap((group) => group.triggers.map((t) => t.id));
    expect(groupTriggerIds).toEqual(DIALOGUE_CATEGORIES);
  });

  test("every built-in line ID is unique within its trigger", () => {
    for (const category of DIALOGUE_CATEGORIES) {
      const meta = getDialogueTriggerMeta(category);
      expect(meta.builtIns.length).toBeGreaterThan(0);
      const lineIds = meta.builtIns.map((row) => row.id);
      expect(new Set(lineIds).size).toBe(lineIds.length);
      for (const line of meta.builtIns) {
        expect(line.text.trim().length).toBeGreaterThan(0);
        expect(countVisibleCharacters(line.text)).toBeLessThanOrEqual(30);
      }
    }
  });
});

describe("dialogue character counting and normalization", () => {
  test("emoji and combined characters count as one grapheme", () => {
    expect(countVisibleCharacters("👨‍👩‍👧‍👦")).toBe(1);
    expect(countVisibleCharacters("🎉")).toBe(1);
    expect(countVisibleCharacters("小葡萄")).toBe(3);
  });

  test("trims outer whitespace from address and dialogue lines", () => {
    const parsed = parsePetDialogueSettings({
      address: "  小葡萄  ",
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "  在呢～  " }],
          customLines: [{ id: "custom-1", automaticEnabled: true, text: "  收到啦  " }],
        },
      },
    });
    expect(parsed.address).toBe("小葡萄");
    expect(parsed.categories["daily:click"]?.builtInOverrides[0]?.text).toBe("在呢～");
    expect(parsed.categories["daily:click"]?.customLines[0]?.text).toBe("收到啦");
  });

  test("drops empty category objects during parse", () => {
    const parsed = parsePetDialogueSettings({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [],
          customLines: [],
        },
      },
    });
    expect(parsed.categories["daily:click"]).toBeUndefined();
  });

  test("rejects newlines and control characters in dialogue and address", () => {
    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [],
            customLines: [{ id: "line-1", automaticEnabled: true, text: "第一行\n第二行" }],
          },
        },
      })
    ).toThrow("对白只能写一行");

    expect(() =>
      parsePetDialogueSettings({
        address: "小\n葡萄",
        categories: {},
      })
    ).toThrow("称呼只能写一行");

    expect(() =>
      parsePetDialogueSettings({
        address: "小\u0007葡萄",
        categories: {},
      })
    ).toThrow("称呼不能包含控制字符");

    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [],
            customLines: [{ id: "line-1", automaticEnabled: true, text: "对白\u0007内容" }],
          },
        },
      })
    ).toThrow("对白不能包含控制字符");
  });

  test("rejects 13-character addresses and 31-character lines", () => {
    expect(() =>
      parsePetDialogueSettings({
        address: "一二三四五六七八九十甲乙丙",
        categories: {},
      })
    ).toThrow("称呼最多 12 个字");

    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [],
            customLines: [
              {
                id: "line-1",
                automaticEnabled: true,
                text: "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一",
              },
            ],
          },
        },
      })
    ).toThrow("对白最多 30 个字");
  });

  test("rejects 21st custom line in a single trigger", () => {
    const customLines = Array.from({ length: 21 }, (_, index) => ({
      id: `line-${index}`,
      automaticEnabled: true,
      text: `自定义句子${index}`,
    }));
    const issues = getDialogueValidationIssues({
      address: "",
      categories: {
        "daily:click": {
          builtInOverrides: [],
          customLines,
        },
      },
    });
    expect(issues[0]?.path).toBe("daily:click");
    expect(issues[0]?.message).toBe("每个互动时机最多添加 20 条对白");

    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [],
            customLines,
          },
        },
      })
    ).toThrow("每个互动时机最多添加 20 条对白");
  });

  test("rejects 16-character lines for rest categories", () => {
    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "rest:crying": {
            builtInOverrides: [],
            customLines: [
              {
                id: "line-1",
                automaticEnabled: true,
                text: "一二三四五六七八九十一二三四五六", // 16 characters
              },
            ],
          },
        },
      })
    ).toThrow("休息对白最多 15 个字");
  });

  test("rejects 6th custom line for rest categories", () => {
    const customLines = Array.from({ length: 6 }, (_, index) => ({
      id: `line-${index}`,
      automaticEnabled: true,
      text: `休息句子${index}`,
    }));
    const issues = getDialogueValidationIssues({
      address: "",
      categories: {
        "rest:crying": {
          builtInOverrides: [],
          customLines,
        },
      },
    });
    expect(issues[0]?.path).toBe("rest:crying");
    expect(issues[0]?.message).toBe("休息对白最多添加 5 条");

    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "rest:crying": {
            builtInOverrides: [],
            customLines,
          },
        },
      })
    ).toThrow("休息对白最多添加 5 条");
  });

  test("rejects unsafe and duplicate identifiers", () => {
    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [],
            customLines: [{ id: "INVALID ID!", automaticEnabled: true, text: "测试" }],
          },
        },
      })
    ).toThrow("Invalid dialogue identifier");

    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [],
            customLines: [
              { id: "custom-1", automaticEnabled: true, text: "测试一" },
              { id: "custom-1", automaticEnabled: true, text: "测试二" },
            ],
          },
        },
      })
    ).toThrow("Duplicate custom line identifier");

    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [
              { lineId: "daily-click-here", text: "修改一" },
              { lineId: "daily-click-here", text: "修改二" },
            ],
            customLines: [],
          },
        },
      })
    ).toThrow("Duplicate built-in override line identifier");
  });

  test("rejects duplicate templates within the same trigger", () => {
    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [],
            customLines: [
              { id: "custom-1", automaticEnabled: true, text: "一样的文字" },
              { id: "custom-2", automaticEnabled: true, text: "一样的文字" },
            ],
          },
        },
      })
    ).toThrow("对白内容不能重复");

    expect(() =>
      parsePetDialogueSettings({
        address: "",
        categories: {
          "daily:click": {
            builtInOverrides: [
              { lineId: "daily-click-here", text: "完全一样的文字" },
              { lineId: "daily-click-whats-up", text: "完全一样的文字" },
            ],
            customLines: [],
          },
        },
      })
    ).toThrow("对白内容不能重复");
  });

  test("accepts and preserves safe stale built-in line IDs", () => {
    const parsed = parsePetDialogueSettings({
      address: "",
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "stale-line-from-older-catalog", text: "旧版对白" }],
          customLines: [],
        },
      },
    });
    expect(parsed.categories["daily:click"]?.builtInOverrides[0]?.lineId).toBe("stale-line-from-older-catalog");
    const lines = resolveDialogueLines("daily:click", parsed);
    expect(lines).not.toContain("旧版对白");
  });
});

describe("resolveDialogueLines", () => {
  test("applies overrides, appends custom lines, substitutes address, and deduplicates", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [
            { lineId: "daily-click-here", text: "[称呼]，在呢。" },
            { lineId: "daily-click-whats-up", automaticEnabled: false },
          ],
          customLines: [
            { id: "custom-1", automaticEnabled: true, text: "[称呼]，在呢。" },
            { id: "custom-2", automaticEnabled: false, text: "暂不自动说" },
            { id: "custom-3", automaticEnabled: true, text: "[称呼]，今天也辛苦啦～" },
          ],
        },
      },
    });

    const lines = resolveDialogueLines("daily:click", settings);
    expect(lines).toContain("小葡萄，在呢。");
    expect(lines).toContain("小葡萄，今天也辛苦啦～");
    expect(lines).not.toContain("怎么啦？");
    expect(lines).not.toContain("暂不自动说");
    expect(new Set(lines).size).toBe(lines.length);
  });

  test("skips placeholder lines when address is empty", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "[称呼]，在呢。" }],
          customLines: [],
        },
      },
    });

    expect(resolveDialogueLines("daily:click", { ...settings, address: "" })).not.toContain("[称呼]，在呢。");
  });

  test("returns empty array when all lines are disabled", () => {
    const meta = getDialogueTriggerMeta("daily:click");
    const settings = parsePetDialogueSettings({
      address: "",
      categories: {
        "daily:click": {
          builtInOverrides: meta.builtIns.map((b) => ({
            lineId: b.id,
            automaticEnabled: false,
          })),
          customLines: [{ id: "custom-1", automaticEnabled: false, text: "禁用中" }],
        },
      },
    });

    expect(resolveDialogueLines("daily:click", settings)).toEqual([]);
  });
});

describe("restore operations", () => {
  test("restoreBuiltInLine removes text override but preserves automaticEnabled: false", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [
            { lineId: "daily-click-here", automaticEnabled: false, text: "改了字" },
            { lineId: "daily-click-whats-up", text: "怎么了呀？" },
          ],
          customLines: [],
        },
      },
    });

    const restoredOne = restoreBuiltInLine(settings, "daily:click", "daily-click-here");
    const overrideOne = restoredOne.categories["daily:click"]?.builtInOverrides.find(
      (o) => o.lineId === "daily-click-here"
    );
    expect(overrideOne).toEqual({ lineId: "daily-click-here", automaticEnabled: false });

    const restoredTwo = restoreBuiltInLine(restoredOne, "daily:click", "daily-click-whats-up");
    const overrideTwo = restoredTwo.categories["daily:click"]?.builtInOverrides.find(
      (o) => o.lineId === "daily-click-whats-up"
    );
    expect(overrideTwo).toBeUndefined();
  });

  test("restoreBuiltInCategory removes all built-in overrides while preserving custom lines and address", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", automaticEnabled: false, text: "改了字" }],
          customLines: [{ id: "custom-1", automaticEnabled: true, text: "我的句子" }],
        },
      },
    });

    const restored = restoreBuiltInCategory(settings, "daily:click");
    expect(restored.address).toBe(settings.address);
    expect(restored.categories["daily:click"]?.builtInOverrides).toEqual([]);
    expect(restored.categories["daily:click"]?.customLines).toEqual(settings.categories["daily:click"]?.customLines);
  });

  test("restore operations preserve voiceEnabled and voiceVolume settings", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      voiceEnabled: true,
      voiceVolume: 0.55,
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "已修改" }],
          customLines: [],
        },
      },
    });

    const restoredLine = restoreBuiltInLine(settings, "daily:click", "daily-click-here");
    expect(restoredLine.voiceEnabled).toBe(true);
    expect(restoredLine.voiceVolume).toBe(0.55);

    const restoredCategory = restoreBuiltInCategory(settings, "daily:click");
    expect(restoredCategory.voiceEnabled).toBe(true);
    expect(restoredCategory.voiceVolume).toBe(0.55);
  });

  test("restore operations preserve voice bindings", () => {
    const settings = parsePetDialogueSettings({
      address: "",
      voiceEnabled: true,
      voiceVolume: 0.8,
      categories: {
        "daily:click": {
          builtInOverrides: [
            {
              lineId: "daily-click-here",
              automaticEnabled: false,
              text: "修改过",
              voiceAssetId: "voice-one",
            },
          ],
          customLines: [],
        },
      },
    });

    expect(
      restoreBuiltInLine(settings, "daily:click", "daily-click-here").categories["daily:click"]?.builtInOverrides[0]
    ).toEqual({
      lineId: "daily-click-here",
      automaticEnabled: false,
      voiceAssetId: "voice-one",
    });
    expect(restoreBuiltInCategory(settings, "daily:click").categories["daily:click"]?.builtInOverrides[0]).toEqual({
      lineId: "daily-click-here",
      voiceAssetId: "voice-one",
    });
  });
});

describe("dialogue voice settings and candidates", () => {
  test("parses voiceEnabled, voiceVolume, voiceAssetId, and voiceTrimStart/voiceTrimEnd correctly", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      voiceEnabled: true,
      voiceVolume: 0.65,
      categories: {
        "daily:click": {
          builtInOverrides: [
            {
              lineId: "daily-click-here",
              text: "在呢",
              voiceAssetId: "voice-123",
              voiceTrimStart: 0.25,
              voiceTrimEnd: 1.8,
            },
          ],
          customLines: [
            {
              id: "custom-1",
              automaticEnabled: true,
              text: "来啦",
              voiceAssetId: "voice-456",
              voiceTrimStart: 0.5,
              voiceTrimEnd: 2.1,
            },
          ],
        },
      },
    });

    expect(settings.voiceEnabled).toBe(true);
    expect(settings.voiceVolume).toBe(0.65);
    expect(settings.categories["daily:click"]?.builtInOverrides[0]?.voiceAssetId).toBe("voice-123");
    expect(settings.categories["daily:click"]?.builtInOverrides[0]?.voiceTrimStart).toBe(0.25);
    expect(settings.categories["daily:click"]?.builtInOverrides[0]?.voiceTrimEnd).toBe(1.8);
    expect(settings.categories["daily:click"]?.customLines[0]?.voiceAssetId).toBe("voice-456");
    expect(settings.categories["daily:click"]?.customLines[0]?.voiceTrimStart).toBe(0.5);
    expect(settings.categories["daily:click"]?.customLines[0]?.voiceTrimEnd).toBe(2.1);
  });

  test("validates voiceVolume range and invalid voiceAssetId identifier", () => {
    const issues = getDialogueValidationIssues({
      address: "小葡萄",
      voiceVolume: 1.5,
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", voiceAssetId: "invalid/voice" }],
          customLines: [],
        },
      },
    });

    expect(issues.some((i) => i.path === "voiceVolume")).toBe(true);
    expect(issues.some((i) => i.path === "daily:click:daily-click-here")).toBe(true);
  });

  test("validates voiceTrimStart and voiceTrimEnd boundaries and dependencies", () => {
    // voiceTrimStart negative
    const issues1 = getDialogueValidationIssues({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", voiceAssetId: "voice-1", voiceTrimStart: -1 }],
          customLines: [],
        },
      },
    });
    expect(issues1.some((i) => i.message === "Invalid voiceTrimStart")).toBe(true);

    // voiceTrimEnd <= voiceTrimStart
    const issues2 = getDialogueValidationIssues({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [
            { lineId: "daily-click-here", voiceAssetId: "voice-1", voiceTrimStart: 1.5, voiceTrimEnd: 1.2 },
          ],
          customLines: [],
        },
      },
    });
    expect(issues2.some((i) => i.message === "Invalid voiceTrimEnd")).toBe(true);

    // trim without voiceAssetId
    const issues3 = getDialogueValidationIssues({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", voiceTrimStart: 0.5 }],
          customLines: [],
        },
      },
    });
    expect(issues3.some((i) => i.message === "Voice trim requires voiceAssetId")).toBe(true);
  });

  test("resolveDialogueCandidates returns text and bound voiceAssetId with trim metadata", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      voiceEnabled: true,
      categories: {
        "daily:click": {
          builtInOverrides: [
            {
              lineId: "daily-click-here",
              text: "[称呼]，我在呢",
              voiceAssetId: "voice-abc",
              voiceTrimStart: 0.3,
              voiceTrimEnd: 1.5,
            },
          ],
          customLines: [
            {
              id: "custom-1",
              automaticEnabled: true,
              text: "主人好",
              voiceAssetId: "voice-custom",
              voiceTrimStart: 0.1,
              voiceTrimEnd: 2.0,
            },
          ],
        },
      },
    });

    const candidates = resolveDialogueCandidates("daily:click", settings);
    expect(candidates).toContainEqual({
      lineId: "daily-click-here",
      text: "小葡萄，我在呢",
      voiceAssetId: "voice-abc",
      voiceTrimStart: 0.3,
      voiceTrimEnd: 1.5,
    });
    expect(candidates).toContainEqual({
      lineId: "custom-1",
      text: "主人好",
      voiceAssetId: "voice-custom",
      voiceTrimStart: 0.1,
      voiceTrimEnd: 2.0,
    });
  });

  test("toggleCategoryAutomatic disables all lines and empty candidates are returned", () => {
    const initial = parsePetDialogueSettings({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "改过的文本", voiceAssetId: "voice-v1" }],
          customLines: [{ id: "custom-1", automaticEnabled: true, text: "我的自定义", voiceAssetId: "voice-v2" }],
        },
      },
    });

    const disabled = toggleCategoryAutomatic(initial, "daily:click", false);
    const cat = disabled.categories["daily:click"];
    expect(cat).toBeDefined();
    // All built-ins have automaticEnabled: false
    const meta = getDialogueTriggerMeta("daily:click");
    expect(cat?.builtInOverrides).toHaveLength(meta.builtIns.length);
    for (const b of cat!.builtInOverrides) {
      expect(b.automaticEnabled).toBe(false);
    }
    // Preserved custom text and voiceAssetId
    const override = cat?.builtInOverrides.find((b) => b.lineId === "daily-click-here");
    expect(override?.text).toBe("改过的文本");
    expect(override?.voiceAssetId).toBe("voice-v1");
    // Custom line disabled
    expect(cat?.customLines[0]?.automaticEnabled).toBe(false);
    expect(cat?.customLines[0]?.text).toBe("我的自定义");

    // Runtime candidates are completely empty
    expect(resolveDialogueCandidates("daily:click", disabled)).toEqual([]);

    // Re-enable
    const reEnabled = toggleCategoryAutomatic(disabled, "daily:click", true);
    const reCat = reEnabled.categories["daily:click"];
    // BuiltIns with no custom text or voice are dropped from overrides
    expect(reCat?.builtInOverrides).toHaveLength(1);
    expect(reCat?.builtInOverrides[0]).toEqual({
      lineId: "daily-click-here",
      text: "改过的文本",
      voiceAssetId: "voice-v1",
    });
    expect(reCat?.customLines[0]?.automaticEnabled).toBe(true);
    expect(resolveDialogueCandidates("daily:click", reEnabled).length).toBeGreaterThan(0);
  });

  test("toggleCategoryAutomatic on clean default resets to empty categories when re-enabled", () => {
    const clean = parsePetDialogueSettings({ address: "", categories: {} });
    const disabled = toggleCategoryAutomatic(clean, "daily:click", false);
    expect(disabled.categories["daily:click"]?.builtInOverrides.length).toBeGreaterThan(0);
    expect(resolveDialogueCandidates("daily:click", disabled)).toEqual([]);

    const restored = toggleCategoryAutomatic(disabled, "daily:click", true);
    expect(restored.categories["daily:click"]).toBeUndefined();
    expect(resolveDialogueCandidates("daily:click", restored).length).toBeGreaterThan(0);
  });

  test("restoreBuiltInLine and restoreBuiltInCategory retain voiceAssetId and trim bounds", () => {
    const initial = parsePetDialogueSettings({
      address: "小葡萄",
      categories: {
        "daily:click": {
          builtInOverrides: [
            {
              lineId: "daily-click-here",
              text: "改过的文本",
              voiceAssetId: "voice-1",
              voiceTrimStart: 0.2,
              voiceTrimEnd: 1.5,
            },
          ],
          customLines: [],
        },
      },
    });

    const restoredLine = restoreBuiltInLine(initial, "daily:click", "daily-click-here");
    expect(restoredLine.categories["daily:click"]?.builtInOverrides[0]).toEqual({
      lineId: "daily-click-here",
      voiceAssetId: "voice-1",
      voiceTrimStart: 0.2,
      voiceTrimEnd: 1.5,
    });

    const restoredCat = restoreBuiltInCategory(initial, "daily:click");
    expect(restoredCat.categories["daily:click"]?.builtInOverrides[0]).toEqual({
      lineId: "daily-click-here",
      voiceAssetId: "voice-1",
      voiceTrimStart: 0.2,
      voiceTrimEnd: 1.5,
    });
  });
});

describe("quick dialogue references and resolution", () => {
  test("constants are defined as specified", () => {
    expect(MAX_QUICK_DIALOGUES).toBe(3);
    expect(QUICK_DIALOGUE_BLOCKED_CATEGORIES).toEqual(["rest:crying", "rest:completion"]);
  });

  test("parses empty/default quickDialogueRefs and deep clones them", () => {
    const defaultParsed = parsePetDialogueSettings({
      address: "小葡萄",
      categories: {},
    });
    expect(defaultParsed.quickDialogueRefs).toEqual([]);

    const input = {
      address: "小葡萄",
      voiceEnabled: true,
      voiceVolume: 0.8,
      quickDialogueRefs: [
        { category: "daily:click", lineId: "daily-click-here" },
        { category: "working:click", lineId: "working-click-with-you" },
      ],
      categories: {},
    };
    const parsed = parsePetDialogueSettings(input);

    expect(parsed.quickDialogueRefs).toEqual([
      { category: "daily:click", lineId: "daily-click-here" },
      { category: "working:click", lineId: "working-click-with-you" },
    ]);
    expect(parsed.quickDialogueRefs).not.toBe(input.quickDialogueRefs);
    expect(parsed.quickDialogueRefs[0]).not.toBe(input.quickDialogueRefs[0]);
  });

  test("validates quickDialogueRefs structure, capacity, safe IDs, and categories", () => {
    // Exceeding capacity (4 items)
    const tooMany = {
      address: "",
      quickDialogueRefs: [
        { category: "daily:click", lineId: "daily-click-here" },
        { category: "daily:click", lineId: "daily-click-poke" },
        { category: "daily:click", lineId: "daily-click-pat" },
        { category: "working:click", lineId: "working-click-with-you" },
      ],
      categories: {},
    };
    expect(getDialogueValidationIssues(tooMany)).toContainEqual({
      path: "quickDialogueRefs",
      message: "常用对白最多选择 3 句",
    });

    // Duplicate reference pair
    const duplicatePair = {
      address: "",
      quickDialogueRefs: [
        { category: "daily:click", lineId: "daily-click-here" },
        { category: "daily:click", lineId: "daily-click-here" },
      ],
      categories: {},
    };
    expect(getDialogueValidationIssues(duplicatePair)).toContainEqual({
      path: "quickDialogueRefs",
      message: "Duplicate quick dialogue reference",
    });

    // Unsafe line ID
    const unsafeId = {
      address: "",
      quickDialogueRefs: [{ category: "daily:click", lineId: "../bad-id" }],
      categories: {},
    };
    expect(getDialogueValidationIssues(unsafeId)).toContainEqual({
      path: "quickDialogueRefs",
      message: "Invalid dialogue identifier",
    });

    // Unknown category
    const unknownCat = {
      address: "",
      quickDialogueRefs: [{ category: "unknown:category", lineId: "line-1" }],
      categories: {},
    };
    expect(getDialogueValidationIssues(unknownCat)).toContainEqual({
      path: "quickDialogueRefs",
      message: "Unknown dialogue category: unknown:category",
    });

    // Blocked rest categories
    const restCrying = {
      address: "",
      quickDialogueRefs: [{ category: "rest:crying", lineId: "rest-crying-1" }],
      categories: {},
    };
    expect(getDialogueValidationIssues(restCrying)).toContainEqual({
      path: "quickDialogueRefs",
      message: "休息系统对白不能设为常用",
    });

    const restCompletion = {
      address: "",
      quickDialogueRefs: [{ category: "rest:completion", lineId: "rest-completion-1" }],
      categories: {},
    };
    expect(getDialogueValidationIssues(restCompletion)).toContainEqual({
      path: "quickDialogueRefs",
      message: "休息系统对白不能设为常用",
    });
  });

  test("validates placeholder requires address and duplicate resolved final text", () => {
    // Line with [称呼] but address is empty
    const missingAddress = {
      address: "",
      quickDialogueRefs: [{ category: "daily:click", lineId: "daily-click-here" }],
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "[称呼]，在呢！" }],
          customLines: [],
        },
      },
    };
    expect(getDialogueValidationIssues(missingAddress)).toContainEqual({
      path: "address",
      message: "常用对白包含称呼，请先设置称呼",
    });

    // Two quick dialogues resolving to duplicate final text
    const duplicateFinalText = {
      address: "小葡萄",
      quickDialogueRefs: [
        { category: "daily:click", lineId: "daily-click-here" },
        { category: "daily:click", lineId: "custom-1" },
      ],
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "在呢！" }],
          customLines: [{ id: "custom-1", automaticEnabled: true, text: "在呢！" }],
        },
      },
    };
    expect(getDialogueValidationIssues(duplicateFinalText)).toContainEqual({
      path: "daily:click:custom-1",
      message: "常用对白内容不能重复",
    });
  });

  test("resolveDialogueReference resolves built-in, custom, overrides, voices, and addresses", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      voiceEnabled: true,
      voiceVolume: 0.8,
      quickDialogueRefs: [],
      categories: {
        "daily:click": {
          builtInOverrides: [
            {
              lineId: "daily-click-here",
              automaticEnabled: false,
              text: "[称呼]，在呢。",
              voiceAssetId: "voice-one",
              voiceTrimStart: 0.2,
              voiceTrimEnd: 1.4,
            },
          ],
          customLines: [
            {
              id: "custom-1",
              automaticEnabled: false,
              text: "陪你一起呀",
              voiceAssetId: "voice-two",
            },
          ],
        },
      },
    });

    // Resolves automatically disabled built-in line with address and voice metadata
    expect(resolveDialogueReference({ category: "daily:click", lineId: "daily-click-here" }, settings)).toEqual({
      lineId: "daily-click-here",
      text: "小葡萄，在呢。",
      voiceAssetId: "voice-one",
      voiceTrimStart: 0.2,
      voiceTrimEnd: 1.4,
    });

    // Resolves automatically disabled custom line
    expect(resolveDialogueReference({ category: "daily:click", lineId: "custom-1" }, settings)).toEqual({
      lineId: "custom-1",
      text: "陪你一起呀",
      voiceAssetId: "voice-two",
    });

    // Resolves unmodified built-in line
    const unmodified = resolveDialogueReference({ category: "daily:click", lineId: "daily-click-whats-up" }, settings);
    expect(unmodified).not.toBeNull();
    expect(unmodified?.lineId).toBe("daily-click-whats-up");
    expect(unmodified?.text.length).toBeGreaterThan(0);

    // Returns null for stale or missing line ID
    expect(resolveDialogueReference({ category: "daily:click", lineId: "non-existent" }, settings)).toBeNull();

    // Returns null for blocked category
    expect(resolveDialogueReference({ category: "rest:crying", lineId: "some-line" }, settings)).toBeNull();

    // Returns null when address is required but empty
    const noAddressSettings = parsePetDialogueSettings({
      address: "",
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "[称呼]，在呢。" }],
          customLines: [],
        },
      },
    });
    expect(
      resolveDialogueReference({ category: "daily:click", lineId: "daily-click-here" }, noAddressSettings)
    ).toBeNull();
  });

  test("resolveQuickDialogueCandidates maintains order and skips nulls", () => {
    const settings = parsePetDialogueSettings({
      address: "小葡萄",
      quickDialogueRefs: [
        { category: "daily:click", lineId: "daily-click-here" },
        { category: "daily:click", lineId: "missing-stale" },
        { category: "daily:click", lineId: "daily-click-whats-up" },
      ],
      categories: {},
    });

    const candidates = resolveQuickDialogueCandidates(settings);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.lineId).toBe("daily-click-here");
    expect(candidates[1]?.lineId).toBe("daily-click-whats-up");
  });

  test("toggleQuickDialogueReference and removeQuickDialogueReference mutate immutably", () => {
    const initial = parsePetDialogueSettings({
      address: "小葡萄",
      quickDialogueRefs: [{ category: "daily:click", lineId: "daily-click-here" }],
      categories: {
        "daily:click": {
          builtInOverrides: [],
          customLines: [{ id: "custom-1", automaticEnabled: true, text: "自建对白" }],
        },
      },
    });

    // Appending a second reference
    const withSecond = toggleQuickDialogueReference(initial, { category: "daily:click", lineId: "custom-1" });
    expect(withSecond.quickDialogueRefs).toEqual([
      { category: "daily:click", lineId: "daily-click-here" },
      { category: "daily:click", lineId: "custom-1" },
    ]);
    expect(withSecond).not.toBe(initial);

    // Appending a third reference
    const withThird = toggleQuickDialogueReference(withSecond, { category: "daily:click", lineId: "daily-click-whats-up" });
    expect(withThird.quickDialogueRefs).toHaveLength(3);

    // Appending a 4th reference is a no-op
    const withFourth = toggleQuickDialogueReference(withThird, { category: "daily:click", lineId: "daily-click-see-you" });
    expect(withFourth).toBe(withThird);
    expect(withFourth.quickDialogueRefs).toHaveLength(3);

    // Toggling an existing reference removes it
    const toggledOff = toggleQuickDialogueReference(withThird, { category: "daily:click", lineId: "custom-1" });
    expect(toggledOff.quickDialogueRefs).toEqual([
      { category: "daily:click", lineId: "daily-click-here" },
      { category: "daily:click", lineId: "daily-click-whats-up" },
    ]);

    // removeQuickDialogueReference on non-existent is a no-op
    expect(removeQuickDialogueReference(toggledOff, { category: "daily:click", lineId: "custom-1" })).toBe(toggledOff);

    // removeQuickDialogueReference removes matching reference
    const removed = removeQuickDialogueReference(toggledOff, { category: "daily:click", lineId: "daily-click-here" });
    expect(removed.quickDialogueRefs).toEqual([{ category: "daily:click", lineId: "daily-click-whats-up" }]);

    // Restoring or editing builtIn line preserves quickDialogueRefs
    const withOverride = parsePetDialogueSettings({
      address: "小葡萄",
      quickDialogueRefs: [{ category: "daily:click", lineId: "daily-click-here" }],
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "新内容" }],
          customLines: [],
        },
      },
    });
    const restored = restoreBuiltInLine(withOverride, "daily:click", "daily-click-here");
    expect(restored.quickDialogueRefs).toEqual([{ category: "daily:click", lineId: "daily-click-here" }]);

    // Supports settings objects where quickDialogueRefs is undefined
    const legacyLike = {
      address: "小葡萄",
      categories: {},
      voiceEnabled: false,
      voiceVolume: 0.8,
    } as unknown as PetDialogueSettings;
    const toggledLegacy = toggleQuickDialogueReference(legacyLike, {
      category: "daily:click",
      lineId: "daily-click-here",
    });
    expect(toggledLegacy.quickDialogueRefs).toEqual([{ category: "daily:click", lineId: "daily-click-here" }]);
    const removedLegacy = removeQuickDialogueReference(legacyLike, {
      category: "daily:click",
      lineId: "daily-click-here",
    });
    expect(removedLegacy).toBe(legacyLike);
  });

  test("does not resurrect built-in placeholder or template when override is blank", () => {
    // Built-in line contains [称呼], but user override is empty whitespace
    const blankOverride = {
      address: "",
      quickDialogueRefs: [{ category: "daily:click", lineId: "daily-click-here" }],
      categories: {
        "daily:click": {
          builtInOverrides: [{ lineId: "daily-click-here", text: "   " }],
          customLines: [],
        },
      },
    };
    const issues = getDialogueValidationIssues(blankOverride);
    // Line itself is flagged as empty
    expect(issues).toContainEqual({
      path: "daily:click:daily-click-here",
      message: "对白内容不能为空",
    });
    // Should NOT resurrect built-in [称呼] and falsely report address missing
    expect(issues.some((i) => i.path === "address" && i.message.includes("常用对白"))).toBe(false);
  });
});

describe("formatQuickDialogueLabel", () => {
  test("wraps short dialogues in Chinese quotes without ellipsis", () => {
    expect(formatQuickDialogueLabel("在呢。")).toBe("“在呢。”");
    expect(formatQuickDialogueLabel("今天也辛苦啦")).toBe("“今天也辛苦啦”");
  });

  test("preserves text at exact max length", () => {
    const exactMaxChars = "一".repeat(MAX_QUICK_DIALOGUE_MENU_LABEL_LENGTH);
    expect(countVisibleCharacters(exactMaxChars)).toBe(MAX_QUICK_DIALOGUE_MENU_LABEL_LENGTH);
    expect(formatQuickDialogueLabel(exactMaxChars)).toBe(`“${exactMaxChars}”`);
  });

  test("truncates text exceeding max length and appends ellipsis", () => {
    const fifteenChars = "一二三四五六七八九十一二三四五";
    expect(countVisibleCharacters(fifteenChars)).toBe(15);
    expect(formatQuickDialogueLabel(fifteenChars)).toBe("“一二三四五六七八九十一二三四…”");
  });

  test("handles grapheme clusters and emojis gracefully", () => {
    const textWithEmoji = "🎉👨‍👩‍👧‍👦小葡萄在看你呢，加油哦！";
    const formatted = formatQuickDialogueLabel(textWithEmoji, 5);
    expect(formatted).toBe("“🎉👨‍👩‍👧‍👦小葡萄…”");
  });

  test("trims leading and trailing whitespace before formatting", () => {
    expect(formatQuickDialogueLabel("   伸个懒腰吧   ")).toBe("“伸个懒腰吧”");
  });
});

