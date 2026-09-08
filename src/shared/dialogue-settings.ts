import { DIALOGUE_CATEGORIES, getDialogueTriggerMeta, type DialogueCategory } from "./dialogue-catalog";

export const ADDRESS_PLACEHOLDER = "[称呼]";
export const MAX_ADDRESS_LENGTH = 12;
export const MAX_DIALOGUE_LINE_LENGTH = 30;
export const MAX_REST_DIALOGUE_LINE_LENGTH = 15;
export const MAX_CUSTOM_LINES_PER_CATEGORY = 20;
export const MAX_CUSTOM_LINES_PER_REST_CATEGORY = 5;
export const MAX_BUILT_IN_OVERRIDES_PER_CATEGORY = 64;

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

export interface BuiltInDialogueOverride {
  readonly lineId: string;
  readonly automaticEnabled?: boolean;
  readonly text?: string;
  readonly voiceAssetId?: string;
  readonly voiceTrimStart?: number;
  readonly voiceTrimEnd?: number;
}

export interface CustomDialogueLine {
  readonly id: string;
  readonly automaticEnabled: boolean;
  readonly text: string;
  readonly voiceAssetId?: string;
  readonly voiceTrimStart?: number;
  readonly voiceTrimEnd?: number;
}

export interface DialogueCategorySettings {
  readonly builtInOverrides: readonly BuiltInDialogueOverride[];
  readonly customLines: readonly CustomDialogueLine[];
}

export interface PetDialogueSettings {
  readonly address: string;
  readonly categories: Readonly<Partial<Record<DialogueCategory, DialogueCategorySettings>>>;
  readonly voiceEnabled: boolean;
  readonly voiceVolume: number;
}

export interface DialogueValidationIssue {
  readonly path: string;
  readonly message: string;
}

export const EMPTY_PET_DIALOGUE_SETTINGS: PetDialogueSettings = Object.freeze({
  address: "",
  voiceEnabled: false,
  voiceVolume: 0.8,
  categories: Object.freeze({}),
});

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function countVisibleCharacters(text: string): number {
  return Array.from(segmenter.segment(text)).length;
}

export function clonePetDialogueSettings(settings: PetDialogueSettings): PetDialogueSettings {
  const clonedCategories: Partial<Record<DialogueCategory, DialogueCategorySettings>> = {};
  for (const [key, categorySettings] of Object.entries(settings.categories) as [
    DialogueCategory,
    DialogueCategorySettings | undefined,
  ][]) {
    if (!categorySettings) continue;
    clonedCategories[key] = {
      builtInOverrides: categorySettings.builtInOverrides.map((override) => ({ ...override })),
      customLines: categorySettings.customLines.map((line) => ({ ...line })),
    };
  }
  return {
    address: settings.address,
    categories: clonedCategories,
    voiceEnabled: settings.voiceEnabled,
    voiceVolume: settings.voiceVolume,
  };
}

export function getDialogueValidationIssues(value: unknown): readonly DialogueValidationIssue[] {
  const issues: DialogueValidationIssue[] = [];
  if (!isRecord(value)) {
    issues.push({ path: "root", message: "Invalid dialogue settings" });
    return issues;
  }

  if (typeof value.address !== "string") {
    issues.push({ path: "address", message: "称呼必须是文本" });
  } else {
    if (/\r|\n/.test(value.address)) {
      issues.push({ path: "address", message: "称呼只能写一行" });
    } else if (/\p{Cc}/u.test(value.address)) {
      issues.push({ path: "address", message: "称呼不能包含控制字符" });
    } else {
      const trimmedAddress = value.address.trim();
      if (countVisibleCharacters(trimmedAddress) > MAX_ADDRESS_LENGTH) {
        issues.push({ path: "address", message: "称呼最多 12 个字" });
      }
    }
  }

  if (value.voiceEnabled !== undefined && typeof value.voiceEnabled !== "boolean") {
    issues.push({ path: "voiceEnabled", message: "Invalid voiceEnabled state" });
  }

  if (
    value.voiceVolume !== undefined &&
    (typeof value.voiceVolume !== "number" ||
      !Number.isFinite(value.voiceVolume) ||
      value.voiceVolume < 0 ||
      value.voiceVolume > 1)
  ) {
    issues.push({ path: "voiceVolume", message: "音量必须在 0 到 1 之间" });
  }

  if (!isRecord(value.categories)) {
    issues.push({ path: "categories", message: "Invalid dialogue categories" });
    return issues;
  }

  for (const [catKey, catVal] of Object.entries(value.categories)) {
    if (!DIALOGUE_CATEGORIES.includes(catKey as DialogueCategory)) {
      issues.push({ path: `categories.${catKey}`, message: `Unknown dialogue category: ${catKey}` });
      continue;
    }

    const category = catKey as DialogueCategory;

    if (!isRecord(catVal)) {
      issues.push({ path: `categories.${category}`, message: "Invalid category settings" });
      continue;
    }

    if (!Array.isArray(catVal.builtInOverrides)) {
      issues.push({ path: `${category}`, message: "Invalid built-in overrides" });
    } else if (catVal.builtInOverrides.length > MAX_BUILT_IN_OVERRIDES_PER_CATEGORY) {
      issues.push({ path: `${category}`, message: "Too many built-in overrides" });
    }

    const maxCustomLines = category.startsWith("rest:")
      ? MAX_CUSTOM_LINES_PER_REST_CATEGORY
      : MAX_CUSTOM_LINES_PER_CATEGORY;
    if (!Array.isArray(catVal.customLines)) {
      issues.push({ path: `${category}`, message: "Invalid custom lines" });
    } else if (catVal.customLines.length > maxCustomLines) {
      issues.push({
        path: `${category}`,
        message: category.startsWith("rest:") ? "休息对白最多添加 5 条" : "每个互动时机最多添加 20 条对白",
      });
    }

    const maxLineLength = category.startsWith("rest:")
      ? MAX_REST_DIALOGUE_LINE_LENGTH
      : MAX_DIALOGUE_LINE_LENGTH;
    const maxLineLengthMessage = category.startsWith("rest:") ? "休息对白最多 15 个字" : "对白最多 30 个字";

    const builtInOverrides = Array.isArray(catVal.builtInOverrides) ? catVal.builtInOverrides : [];
    const customLines = Array.isArray(catVal.customLines) ? catVal.customLines : [];

    const seenOverrideIds = new Set<string>();
    const overrideTextMap = new Map<string, string>();

    for (const override of builtInOverrides) {
      if (!isRecord(override)) {
        issues.push({ path: `${category}`, message: "Invalid built-in override" });
        continue;
      }
      if (!isSafeIdentifier(override.lineId)) {
        issues.push({ path: `${category}:${String(override.lineId)}`, message: "Invalid dialogue identifier" });
        continue;
      }
      if (seenOverrideIds.has(override.lineId)) {
        issues.push({ path: `${category}:${override.lineId}`, message: "Duplicate built-in override line identifier" });
      }
      seenOverrideIds.add(override.lineId);

      if (override.automaticEnabled !== undefined && typeof override.automaticEnabled !== "boolean") {
        issues.push({ path: `${category}:${override.lineId}`, message: "Invalid automaticEnabled state" });
      }

      if (override.voiceAssetId !== undefined) {
        if (typeof override.voiceAssetId !== "string" || !isSafeIdentifier(override.voiceAssetId)) {
          issues.push({ path: `${category}:${override.lineId}`, message: "Invalid voice identifier" });
        }
      }

      if (override.voiceTrimStart !== undefined) {
        if (
          typeof override.voiceTrimStart !== "number" ||
          !Number.isFinite(override.voiceTrimStart) ||
          override.voiceTrimStart < 0
        ) {
          issues.push({ path: `${category}:${override.lineId}`, message: "Invalid voiceTrimStart" });
        }
      }

      if (override.voiceTrimEnd !== undefined) {
        const start = typeof override.voiceTrimStart === "number" ? override.voiceTrimStart : 0;
        if (
          typeof override.voiceTrimEnd !== "number" ||
          !Number.isFinite(override.voiceTrimEnd) ||
          override.voiceTrimEnd <= start
        ) {
          issues.push({ path: `${category}:${override.lineId}`, message: "Invalid voiceTrimEnd" });
        }
      }

      if ((override.voiceTrimStart !== undefined || override.voiceTrimEnd !== undefined) && !override.voiceAssetId) {
        issues.push({ path: `${category}:${override.lineId}`, message: "Voice trim requires voiceAssetId" });
      }

      if (override.text !== undefined) {
        if (typeof override.text !== "string") {
          issues.push({ path: `${category}:${override.lineId}`, message: "对白内容必须是文本" });
        } else if (/\r|\n/.test(override.text)) {
          issues.push({ path: `${category}:${override.lineId}`, message: "对白只能写一行" });
        } else if (/\p{Cc}/u.test(override.text)) {
          issues.push({ path: `${category}:${override.lineId}`, message: "对白不能包含控制字符" });
        } else {
          const trimmed = override.text.trim();
          if (trimmed.length === 0) {
            issues.push({ path: `${category}:${override.lineId}`, message: "对白内容不能为空" });
          } else if (countVisibleCharacters(trimmed) > maxLineLength) {
            issues.push({ path: `${category}:${override.lineId}`, message: maxLineLengthMessage });
          } else {
            overrideTextMap.set(override.lineId, trimmed);
          }
        }
      }
    }

    const seenCustomIds = new Set<string>();
    const customTexts: Array<{ id: string; text: string }> = [];

    for (const custom of customLines) {
      if (!isRecord(custom)) {
        issues.push({ path: `${category}`, message: "Invalid custom dialogue line" });
        continue;
      }
      if (!isSafeIdentifier(custom.id)) {
        issues.push({ path: `${category}:${String(custom.id)}`, message: "Invalid dialogue identifier" });
        continue;
      }
      if (seenCustomIds.has(custom.id)) {
        issues.push({ path: `${category}:${custom.id}`, message: "Duplicate custom line identifier" });
      }
      seenCustomIds.add(custom.id);

      if (typeof custom.automaticEnabled !== "boolean") {
        issues.push({ path: `${category}:${custom.id}`, message: "Invalid automaticEnabled state" });
      }

      if (custom.voiceAssetId !== undefined) {
        if (typeof custom.voiceAssetId !== "string" || !isSafeIdentifier(custom.voiceAssetId)) {
          issues.push({ path: `${category}:${custom.id}`, message: "Invalid voice identifier" });
        }
      }

      if (custom.voiceTrimStart !== undefined) {
        if (
          typeof custom.voiceTrimStart !== "number" ||
          !Number.isFinite(custom.voiceTrimStart) ||
          custom.voiceTrimStart < 0
        ) {
          issues.push({ path: `${category}:${custom.id}`, message: "Invalid voiceTrimStart" });
        }
      }

      if (custom.voiceTrimEnd !== undefined) {
        const start = typeof custom.voiceTrimStart === "number" ? custom.voiceTrimStart : 0;
        if (
          typeof custom.voiceTrimEnd !== "number" ||
          !Number.isFinite(custom.voiceTrimEnd) ||
          custom.voiceTrimEnd <= start
        ) {
          issues.push({ path: `${category}:${custom.id}`, message: "Invalid voiceTrimEnd" });
        }
      }

      if ((custom.voiceTrimStart !== undefined || custom.voiceTrimEnd !== undefined) && !custom.voiceAssetId) {
        issues.push({ path: `${category}:${custom.id}`, message: "Voice trim requires voiceAssetId" });
      }

      if (typeof custom.text !== "string") {
        issues.push({ path: `${category}:${custom.id}`, message: "对白内容必须是文本" });
      } else if (/\r|\n/.test(custom.text)) {
        issues.push({ path: `${category}:${custom.id}`, message: "对白只能写一行" });
      } else if (/\p{Cc}/u.test(custom.text)) {
        issues.push({ path: `${category}:${custom.id}`, message: "对白不能包含控制字符" });
      } else {
        const trimmed = custom.text.trim();
        if (trimmed.length === 0) {
          issues.push({ path: `${category}:${custom.id}`, message: "对白内容不能为空" });
        } else if (countVisibleCharacters(trimmed) > maxLineLength) {
          issues.push({ path: `${category}:${custom.id}`, message: maxLineLengthMessage });
        } else {
          customTexts.push({ id: custom.id, text: trimmed });
        }
      }
    }

    // Check duplicate templates within built-in overrides
    const seenOverrideTexts = new Set<string>();
    for (const [lineId, text] of overrideTextMap) {
      if (seenOverrideTexts.has(text)) {
        issues.push({ path: `${category}:${lineId}`, message: "对白内容不能重复" });
      } else {
        seenOverrideTexts.add(text);
      }
    }

    // Check duplicate templates within custom lines
    const seenCustomTexts = new Set<string>();
    for (const custom of customTexts) {
      if (seenCustomTexts.has(custom.text)) {
        issues.push({ path: `${category}:${custom.id}`, message: "对白内容不能重复" });
      } else {
        seenCustomTexts.add(custom.text);
      }
    }
  }

  return issues;
}

export function parsePetDialogueSettings(value: unknown): PetDialogueSettings {
  if (!isRecord(value)) throw new Error("Invalid dialogue settings");
  const allowedRootKeys = ["address", "categories"];
  if ("voiceEnabled" in value) allowedRootKeys.push("voiceEnabled");
  if ("voiceVolume" in value) allowedRootKeys.push("voiceVolume");
  assertExactKeys(value, allowedRootKeys, "Invalid dialogue settings");

  const issues = getDialogueValidationIssues(value);
  if (issues.length > 0) {
    throw new Error(issues[0]!.message);
  }

  const address = (value.address as string).trim();
  const voiceEnabled = typeof value.voiceEnabled === "boolean" ? value.voiceEnabled : false;
  const voiceVolume = typeof value.voiceVolume === "number" ? Math.max(0, Math.min(1, value.voiceVolume)) : 0.8;
  const rawCategories = value.categories as Record<string, unknown>;
  const normalizedCategories: Partial<Record<DialogueCategory, DialogueCategorySettings>> = {};

  for (const [key, catVal] of Object.entries(rawCategories)) {
    const category = key as DialogueCategory;
    if (!isRecord(catVal)) continue;
    assertExactKeys(catVal, ["builtInOverrides", "customLines"], "Invalid category settings");

    const rawOverrides = catVal.builtInOverrides as readonly unknown[];
    const rawCustom = catVal.customLines as readonly unknown[];

    const builtInOverrides: BuiltInDialogueOverride[] = [];
    for (const rawO of rawOverrides) {
      if (!isRecord(rawO)) continue;
      const allowedKeys = ["lineId"];
      if ("automaticEnabled" in rawO) allowedKeys.push("automaticEnabled");
      if ("text" in rawO) allowedKeys.push("text");
      if ("voiceAssetId" in rawO) allowedKeys.push("voiceAssetId");
      if ("voiceTrimStart" in rawO) allowedKeys.push("voiceTrimStart");
      if ("voiceTrimEnd" in rawO) allowedKeys.push("voiceTrimEnd");
      assertExactKeys(rawO, allowedKeys, "Invalid built-in override");

      const lineId = rawO.lineId as string;
      const override: BuiltInDialogueOverride = {
        lineId,
        ...(rawO.automaticEnabled !== undefined ? { automaticEnabled: rawO.automaticEnabled as boolean } : {}),
        ...(rawO.text !== undefined ? { text: (rawO.text as string).trim() } : {}),
        ...(rawO.voiceAssetId !== undefined ? { voiceAssetId: rawO.voiceAssetId as string } : {}),
        ...(rawO.voiceTrimStart !== undefined ? { voiceTrimStart: rawO.voiceTrimStart as number } : {}),
        ...(rawO.voiceTrimEnd !== undefined ? { voiceTrimEnd: rawO.voiceTrimEnd as number } : {}),
      };
      builtInOverrides.push(override);
    }

    const customLines: CustomDialogueLine[] = [];
    for (const rawC of rawCustom) {
      if (!isRecord(rawC)) continue;
      const customAllowedKeys = ["id", "automaticEnabled", "text"];
      if ("voiceAssetId" in rawC) customAllowedKeys.push("voiceAssetId");
      if ("voiceTrimStart" in rawC) customAllowedKeys.push("voiceTrimStart");
      if ("voiceTrimEnd" in rawC) customAllowedKeys.push("voiceTrimEnd");
      assertExactKeys(rawC, customAllowedKeys, "Invalid custom dialogue line");
      customLines.push({
        id: rawC.id as string,
        automaticEnabled: rawC.automaticEnabled as boolean,
        text: (rawC.text as string).trim(),
        ...(rawC.voiceAssetId !== undefined ? { voiceAssetId: rawC.voiceAssetId as string } : {}),
        ...(rawC.voiceTrimStart !== undefined ? { voiceTrimStart: rawC.voiceTrimStart as number } : {}),
        ...(rawC.voiceTrimEnd !== undefined ? { voiceTrimEnd: rawC.voiceTrimEnd as number } : {}),
      });
    }

    if (builtInOverrides.length > 0 || customLines.length > 0) {
      normalizedCategories[category] = {
        builtInOverrides: Object.freeze(builtInOverrides),
        customLines: Object.freeze(customLines),
      };
    }
  }

  return {
    address,
    categories: Object.freeze(normalizedCategories),
    voiceEnabled,
    voiceVolume,
  };
}

export interface ResolvedDialogueCandidate {
  readonly lineId: string;
  readonly text: string;
  readonly voiceAssetId?: string;
  readonly voiceTrimStart?: number;
  readonly voiceTrimEnd?: number;
}

export function resolveDialogueCandidates(
  category: DialogueCategory,
  settings: PetDialogueSettings | null | undefined
): readonly ResolvedDialogueCandidate[] {
  const meta = getDialogueTriggerMeta(category);
  const catSettings = settings?.categories[category];
  const address = settings?.address?.trim() ?? "";

  const overridesByLineId = new Map((catSettings?.builtInOverrides ?? []).map((o) => [o.lineId, o]));

  const candidates: Array<{
    lineId: string;
    template: string;
    voiceAssetId?: string;
    voiceTrimStart?: number;
    voiceTrimEnd?: number;
  }> = [];

  for (const builtIn of meta.builtIns) {
    const override = overridesByLineId.get(builtIn.id);
    if (override?.automaticEnabled === false) {
      continue;
    }
    const text = override?.text !== undefined ? override.text.trim() : builtIn.text;
    if (text.length > 0) {
      candidates.push({
        lineId: builtIn.id,
        template: text,
        voiceAssetId: override?.voiceAssetId,
        voiceTrimStart: override?.voiceTrimStart,
        voiceTrimEnd: override?.voiceTrimEnd,
      });
    }
  }

  if (catSettings?.customLines) {
    for (const custom of catSettings.customLines) {
      if (custom.automaticEnabled) {
        const text = custom.text.trim();
        if (text.length > 0) {
          candidates.push({
            lineId: custom.id,
            template: text,
            voiceAssetId: custom.voiceAssetId,
            voiceTrimStart: custom.voiceTrimStart,
            voiceTrimEnd: custom.voiceTrimEnd,
          });
        }
      }
    }
  }

  const replaced: Array<{
    lineId: string;
    text: string;
    voiceAssetId?: string;
    voiceTrimStart?: number;
    voiceTrimEnd?: number;
  }> = [];
  for (const item of candidates) {
    if (item.template.includes(ADDRESS_PLACEHOLDER)) {
      if (address.length === 0) {
        continue;
      }
      replaced.push({
        lineId: item.lineId,
        text: item.template.replaceAll(ADDRESS_PLACEHOLDER, address),
        voiceAssetId: item.voiceAssetId,
        voiceTrimStart: item.voiceTrimStart,
        voiceTrimEnd: item.voiceTrimEnd,
      });
    } else {
      replaced.push({
        lineId: item.lineId,
        text: item.template,
        voiceAssetId: item.voiceAssetId,
        voiceTrimStart: item.voiceTrimStart,
        voiceTrimEnd: item.voiceTrimEnd,
      });
    }
  }

  const result: ResolvedDialogueCandidate[] = [];
  const seen = new Set<string>();
  for (const item of replaced) {
    const trimmed = item.text.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push({
        lineId: item.lineId,
        text: trimmed,
        ...(item.voiceAssetId ? { voiceAssetId: item.voiceAssetId } : {}),
        ...(item.voiceTrimStart !== undefined ? { voiceTrimStart: item.voiceTrimStart } : {}),
        ...(item.voiceTrimEnd !== undefined ? { voiceTrimEnd: item.voiceTrimEnd } : {}),
      });
    }
  }

  return Object.freeze(result);
}

export function resolveDialogueLines(
  category: DialogueCategory,
  settings: PetDialogueSettings | null | undefined
): readonly string[] {
  return resolveDialogueCandidates(category, settings).map((c) => c.text);
}

export function restoreBuiltInLine(
  settings: PetDialogueSettings,
  category: DialogueCategory,
  lineId: string
): PetDialogueSettings {
  const catSettings = settings.categories[category];
  if (!catSettings) return settings;

  const nextOverrides = catSettings.builtInOverrides
    .map((override) => {
      if (override.lineId !== lineId) return override;
      if (override.automaticEnabled === false || override.voiceAssetId) {
        return {
          lineId: override.lineId,
          ...(override.automaticEnabled === false ? { automaticEnabled: false } : {}),
          ...(override.voiceAssetId ? { voiceAssetId: override.voiceAssetId } : {}),
          ...(override.voiceAssetId && override.voiceTrimStart !== undefined
            ? { voiceTrimStart: override.voiceTrimStart }
            : {}),
          ...(override.voiceAssetId && override.voiceTrimEnd !== undefined
            ? { voiceTrimEnd: override.voiceTrimEnd }
            : {}),
        };
      }
      return null;
    })
    .filter((override): override is BuiltInDialogueOverride => override !== null);

  const nextCategories = { ...settings.categories };
  if (nextOverrides.length === 0 && catSettings.customLines.length === 0) {
    delete nextCategories[category];
  } else {
    nextCategories[category] = {
      builtInOverrides: Object.freeze(nextOverrides),
      customLines: catSettings.customLines,
    };
  }

  return {
    address: settings.address,
    categories: Object.freeze(nextCategories),
    voiceEnabled: settings.voiceEnabled,
    voiceVolume: settings.voiceVolume,
  };
}

export function restoreBuiltInCategory(settings: PetDialogueSettings, category: DialogueCategory): PetDialogueSettings {
  const catSettings = settings.categories[category];
  if (!catSettings || catSettings.builtInOverrides.length === 0) {
    return settings;
  }

  const restoredVoiceOverrides = catSettings.builtInOverrides
    .filter((override) => override.voiceAssetId)
    .map((override) => ({
      lineId: override.lineId,
      voiceAssetId: override.voiceAssetId,
      ...(override.voiceTrimStart !== undefined ? { voiceTrimStart: override.voiceTrimStart } : {}),
      ...(override.voiceTrimEnd !== undefined ? { voiceTrimEnd: override.voiceTrimEnd } : {}),
    }));
  const nextCategories = { ...settings.categories };
  if (catSettings.customLines.length === 0 && restoredVoiceOverrides.length === 0) {
    delete nextCategories[category];
  } else {
    nextCategories[category] = {
      builtInOverrides: Object.freeze(restoredVoiceOverrides),
      customLines: catSettings.customLines,
    };
  }

  return {
    address: settings.address,
    categories: Object.freeze(nextCategories),
    voiceEnabled: settings.voiceEnabled,
    voiceVolume: settings.voiceVolume,
  };
}

export function toggleCategoryAutomatic(
  settings: PetDialogueSettings,
  category: DialogueCategory,
  automaticEnabled: boolean
): PetDialogueSettings {
  const catSettings = settings.categories[category] ?? { builtInOverrides: [], customLines: [] };
  const triggerMeta = getDialogueTriggerMeta(category);

  const existingMap = new Map(catSettings.builtInOverrides.map((o) => [o.lineId, o]));
  const nextOverrides: BuiltInDialogueOverride[] = [];

  for (const builtIn of triggerMeta.builtIns) {
    const existing = existingMap.get(builtIn.id);
    const isCustomText = existing?.text !== undefined;
    const hasVoice = existing?.voiceAssetId !== undefined;
    const voiceTrimStart = existing?.voiceTrimStart;
    const voiceTrimEnd = existing?.voiceTrimEnd;

    if (!automaticEnabled) {
      nextOverrides.push({
        lineId: builtIn.id,
        automaticEnabled: false,
        ...(isCustomText ? { text: existing!.text } : {}),
        ...(hasVoice ? { voiceAssetId: existing!.voiceAssetId } : {}),
        ...(hasVoice && voiceTrimStart !== undefined ? { voiceTrimStart } : {}),
        ...(hasVoice && voiceTrimEnd !== undefined ? { voiceTrimEnd } : {}),
      });
    } else {
      if (isCustomText || hasVoice) {
        nextOverrides.push({
          lineId: builtIn.id,
          ...(isCustomText ? { text: existing!.text } : {}),
          ...(hasVoice ? { voiceAssetId: existing!.voiceAssetId } : {}),
          ...(hasVoice && voiceTrimStart !== undefined ? { voiceTrimStart } : {}),
          ...(hasVoice && voiceTrimEnd !== undefined ? { voiceTrimEnd } : {}),
        });
      }
    }
  }

  for (const [lineId, existing] of existingMap) {
    if (!triggerMeta.builtIns.some((b) => b.id === lineId)) {
      nextOverrides.push({
        ...existing,
        ...(automaticEnabled ? {} : { automaticEnabled: false }),
      });
    }
  }

  const nextCustom = catSettings.customLines.map((line) => ({
    ...line,
    automaticEnabled,
  }));

  const nextCategories = { ...settings.categories };
  if (nextOverrides.length === 0 && nextCustom.length === 0) {
    delete nextCategories[category];
  } else {
    nextCategories[category] = {
      builtInOverrides: Object.freeze(nextOverrides),
      customLines: Object.freeze(nextCustom),
    };
  }

  return {
    address: settings.address,
    categories: Object.freeze(nextCategories),
    voiceEnabled: settings.voiceEnabled,
    voiceVolume: settings.voiceVolume,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], message: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(message);
  }
}
