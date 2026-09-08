import { describe, expect, it } from "vitest";
import {
  createCompanionSystemSnapshot,
  DEFAULT_ACTION_TEMPLATES,
  DEFAULT_APP_SETTINGS,
  DEFAULT_ASSET_NORMALIZATION,
  EMPTY_ACTION_SLOTS,
  migrateAppSettings,
  parseAppSettings,
  parseAutostartEnabledInput,
  parseAutostartStatus,
  parseCreateReminderInput,
  parseCreateWorkScheduleInput,
  parseDialoguePreviewRequest,
  parseHeadHotspot,
  parseManualLifeSelection,
  parsePetRendererStatus,
  parsePetUpdateInput,
  parseScreenEllipse,
  parseSettingsNavigationTarget,
  parseUpdateReminderInput,
  parseUpdateWorkScheduleInput,
  resolvePetWindowSize,
  type PetConfig,
} from "./contracts";
import { resolveDialogueLines } from "./dialogue-settings";

function createPet(): PetConfig {
  return {
    id: "pet-1",
    name: "Mochi",
    targetHeight: 180,
    assets: [
      {
        id: "asset-1",
        fileName: "asset-1.png",
        format: "png",
        byteSize: 100,
        width: 100,
        height: 200,
        alphaBounds: { x: 10, y: 20, width: 80, height: 170 },
        normalization: { ...DEFAULT_ASSET_NORMALIZATION },
        headHotspot: null,
      },
    ],
    actionSlots: { ...EMPTY_ACTION_SLOTS, idle: ["asset-1"] },
    actionTemplates: { ...DEFAULT_ACTION_TEMPLATES },
    lifeStates: {
      drowsy: { enabled: false, assetIds: [] },
      sleeping: { enabled: false, assetIds: [] },
      workingAssetIds: [],
    },
    companionPace: "natural",
    interactionBubblesEnabled: true,
    dialogueSettings: { address: "", voiceEnabled: false, voiceVolume: 0.8, categories: {} },
  };
}

describe("settings contracts", () => {
  it("resolves dynamic pet window size based on targetHeight within 80-320 range", () => {
    // 80px (min): 80 + 24 = 104 height, width = max(120, round(80*1.1)+24) = 120
    expect(resolvePetWindowSize(80)).toEqual({ width: 120, height: 104 });
    // 180px (default): 180 + 24 = 204 height, width = round(180*1.1)+24 = 222
    expect(resolvePetWindowSize(180)).toEqual({ width: 222, height: 204 });
    // 320px (max): 320 + 24 = 344 height, width = round(320*1.1)+24 = 376
    expect(resolvePetWindowSize(320)).toEqual({ width: 376, height: 344 });
    // Clamping outside range:
    expect(resolvePetWindowSize(50)).toEqual({ width: 120, height: 104 });
    expect(resolvePetWindowSize(400)).toEqual({ width: 376, height: 344 });
  });

  it("uses privacy-preserving schema v7 first-run defaults", () => {
    expect(DEFAULT_APP_SETTINGS).toEqual({
      schemaVersion: 7,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: {
        reminderSource: { kind: "builtin", id: "gentle-chime" },
        cryingSource: { kind: "builtin", id: "soft-whimper" },
        assets: [],
      },
      reminders: [],
      workSchedules: [],
      pets: [],
    });
  });

  it("rejects legacy schema versions instead of migrating pre-release data", () => {
    expect(() => migrateAppSettings({ schemaVersion: 1 })).toThrow("Unsupported settings schema version");
    expect(() => migrateAppSettings({ schemaVersion: 2 })).toThrow("Unsupported settings schema version");
    expect(() => migrateAppSettings({ schemaVersion: 3 })).toThrow("Unsupported settings schema version");
    expect(() => migrateAppSettings({ schemaVersion: 4 })).toThrow("Unsupported settings schema version");
  });

  it("round-trips v7 into newly allocated nested values", () => {
    const pet = createPet();
    const input = { ...DEFAULT_APP_SETTINGS, activePetId: pet.id, pets: [pet] };
    const parsed = parseAppSettings(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed.pets).not.toBe(input.pets);
    expect(parsed.pets[0]?.assets).not.toBe(pet.assets);
    expect(parsed.pets[0]?.actionSlots).not.toBe(pet.actionSlots);
    expect(parsed.pets[0]?.dialogueSettings).not.toBe(pet.dialogueSettings);
  });

  it("migrates v5 dialogue settings to explicit voice defaults and schema v7", () => {
    const pet = createPet();
    const legacyPet = {
      ...pet,
      dialogueSettings: { address: "小葡萄", categories: {} },
    };
    const legacy = {
      ...DEFAULT_APP_SETTINGS,
      schemaVersion: 5,
      activePetId: pet.id,
      pets: [legacyPet],
    };

    const migration = migrateAppSettings(legacy);

    expect(migration.migrated).toBe(true);
    expect(migration.settings.schemaVersion).toBe(7);
    expect(migration.settings.pets[0]?.dialogueSettings).toEqual({
      address: "小葡萄",
      voiceEnabled: false,
      voiceVolume: 0.8,
      categories: {},
    });
  });

  it("migrates v6 legacy reminders to schema v7 fixed schedules", () => {
    const legacyReminder = {
      id: "reminder-1",
      enabled: true,
      hour: 9,
      minute: 30,
      weekdays: [1, 2, 3, 4, 5],
      restDurationMinutes: 10,
      cursorTolerance: "standard",
      message: "休息一下",
      sounds: { reminder: false, crying: false },
    };
    const legacy = {
      schemaVersion: 6,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: {
        reminderSource: { kind: "builtin", id: "gentle-chime" },
        cryingSource: { kind: "builtin", id: "soft-whimper" },
        assets: [],
      },
      reminders: [legacyReminder],
      workSchedules: [],
      pets: [],
    };

    const migration = migrateAppSettings(legacy);
    expect(migration.migrated).toBe(true);
    expect(migration.settings.schemaVersion).toBe(7);
    expect(migration.settings.reminders[0]).toEqual({
      ...legacyReminder,
      mode: "fixed",
    });
  });

  it("rejects a stale active pet or active pet without idle", () => {
    const pet = createPet();
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, activePetId: "missing" })).toThrow(
      "Active pet must reference a configured idle asset"
    );
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        activePetId: pet.id,
        pets: [{ ...pet, actionSlots: { ...pet.actionSlots, idle: [] } }],
      })
    ).toThrow("Active pet must reference a configured idle asset");
  });

  it("rejects duplicate IDs and stale action references", () => {
    const pet = createPet();
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, pets: [pet, pet] })).toThrow("Duplicate pet identifier");
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        pets: [{ ...pet, actionSlots: { ...pet.actionSlots, resting: ["missing"] } }],
      })
    ).toThrow("Unknown asset in resting action slot");
  });

  it("rejects invalid immutable metadata and normalization values", () => {
    const pet = createPet();
    const asset = pet.assets[0]!;
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        pets: [{ ...pet, assets: [{ ...asset, fileName: "../photo.png" }] }],
      })
    ).toThrow("Invalid pet asset filename");
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        pets: [{ ...pet, assets: [{ ...asset, normalization: { ...asset.normalization, scale: 9 } }] }],
      })
    ).toThrow("Invalid asset normalization");
  });

  it("rejects unknown fields in pet update payloads", () => {
    const pet = createPet();
    const input = {
      id: pet.id,
      name: pet.name,
      targetHeight: pet.targetHeight,
      assets: pet.assets.map((asset) => ({
        id: asset.id,
        normalization: asset.normalization,
        headHotspot: asset.headHotspot,
      })),
      actionSlots: pet.actionSlots,
      actionTemplates: pet.actionTemplates,
      lifeStates: pet.lifeStates,
      companionPace: pet.companionPace,
      interactionBubblesEnabled: pet.interactionBubblesEnabled,
      dialogueSettings: pet.dialogueSettings,
    };

    expect(() => parsePetUpdateInput({ ...input, unexpected: true }, ["asset-1"])).toThrow("Invalid pet update");
    expect(() =>
      parsePetUpdateInput(
        {
          ...input,
          assets: [{ ...input.assets[0], unexpected: true }],
        },
        ["asset-1"]
      )
    ).toThrow("Invalid pet asset adjustment");
  });

  it("rejects a configured pet pack above 250 MB", () => {
    const pet = createPet();
    const template = pet.assets[0]!;
    const assets = Array.from({ length: 13 }, (_, index) => ({
      ...template,
      id: `asset-${index}`,
      fileName: `asset-${index}.png`,
      byteSize: 20 * 1024 * 1024,
    }));
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        pets: [{ ...pet, assets, actionSlots: { ...pet.actionSlots, idle: ["asset-0"] } }],
      })
    ).toThrow("exceeds 250 MB");
  });

  it("validates dialogueSettings in pet update and settings, and preserves safe stale line IDs", () => {
    const pet = createPet();
    const validUpdate = {
      id: pet.id,
      name: pet.name,
      targetHeight: pet.targetHeight,
      assets: pet.assets.map((asset) => ({
        id: asset.id,
        normalization: asset.normalization,
        headHotspot: asset.headHotspot,
      })),
      actionSlots: pet.actionSlots,
      actionTemplates: pet.actionTemplates,
      lifeStates: pet.lifeStates,
      companionPace: pet.companionPace,
      interactionBubblesEnabled: pet.interactionBubblesEnabled,
      dialogueSettings: {
        address: "小葡萄",
        categories: {
          "daily:click": {
            builtInOverrides: [{ lineId: "daily-click-here", text: "在呢！" }],
            customLines: [{ id: "custom-1", automaticEnabled: true, text: "自定义一句" }],
          },
        },
      },
    };

    const parsedUpdate = parsePetUpdateInput(validUpdate, ["asset-1"]);
    expect(parsedUpdate.dialogueSettings.address).toBe("小葡萄");

    // invalid category ID in update
    expect(() =>
      parsePetUpdateInput(
        {
          ...validUpdate,
          dialogueSettings: {
            address: "",
            categories: { "invalid-category": { builtInOverrides: [], customLines: [] } },
          },
        },
        ["asset-1"]
      )
    ).toThrow("Unknown dialogue category");

    // malformed built-in override
    expect(() =>
      parsePetUpdateInput(
        {
          ...validUpdate,
          dialogueSettings: {
            address: "",
            categories: {
              "daily:click": {
                builtInOverrides: [{ lineId: "daily-click-here", text: 123 as unknown as string }],
                customLines: [],
              },
            },
          },
        },
        ["asset-1"]
      )
    ).toThrow("对白内容必须是文本");

    // duplicate custom lines in update
    expect(() =>
      parsePetUpdateInput(
        {
          ...validUpdate,
          dialogueSettings: {
            address: "",
            categories: {
              "daily:click": {
                builtInOverrides: [],
                customLines: [
                  { id: "c-1", automaticEnabled: true, text: "重复文字" },
                  { id: "c-2", automaticEnabled: true, text: "重复文字" },
                ],
              },
            },
          },
        },
        ["asset-1"]
      )
    ).toThrow("对白内容不能重复");

    // excessive custom lines in update
    const excessiveLines = Array.from({ length: 21 }, (_, i) => ({
      id: `c-${i}`,
      automaticEnabled: true,
      text: `句子${i}`,
    }));
    expect(() =>
      parsePetUpdateInput(
        {
          ...validUpdate,
          dialogueSettings: {
            address: "",
            categories: {
              "daily:click": { builtInOverrides: [], customLines: excessiveLines },
            },
          },
        },
        ["asset-1"]
      )
    ).toThrow("每个互动时机最多添加 20 条对白");

    // safe stale built-in line ID round-trips in saved settings but never enters effective pool
    const stalePet: PetConfig = {
      ...pet,
      dialogueSettings: {
        address: "",
        voiceEnabled: false,
        voiceVolume: 0.8,
        categories: {
          "daily:click": {
            builtInOverrides: [{ lineId: "stale-built-in-line", text: "旧版文字" }],
            customLines: [],
          },
        },
      },
    };
    const saved = parseAppSettings({ ...DEFAULT_APP_SETTINGS, activePetId: pet.id, pets: [stalePet] });
    expect(saved.pets[0]?.dialogueSettings.categories["daily:click"]?.builtInOverrides[0]?.lineId).toBe(
      "stale-built-in-line"
    );
    const effectiveLines = resolveDialogueLines("daily:click", saved.pets[0]?.dialogueSettings);
    expect(effectiveLines).not.toContain("旧版文字");
  });

  it("validates reminder and audio ownership strictly", () => {
    const reminder = {
      id: "reminder-1",
      mode: "fixed" as const,
      enabled: true,
      hour: 9,
      minute: 30,
      weekdays: [1, 2, 3, 4, 5],
      restDurationMinutes: 10,
      cursorTolerance: "standard",
      message: "  休息一下  ",
      sounds: { reminder: false, crying: false },
    };
    const parsed = parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [reminder] });
    expect(parsed.reminders[0]?.message).toBe("休息一下");
    expect(parsed.reminders[0]).not.toBe(reminder);
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{ ...reminder, weekdays: [1, 1] }] })).toThrow(
      "Duplicate reminder weekday"
    );
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [reminder, reminder] })).toThrow(
      "Duplicate reminder identifier"
    );
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{ ...reminder, hour: Number.NaN }] })).toThrow(
      "Invalid reminder time"
    );
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{ ...reminder, unknown: true }] })).toThrow(
      "Invalid reminder schedule"
    );
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        audio: { ...DEFAULT_APP_SETTINGS.audio, reminderSource: { kind: "imported", assetId: "missing" } },
      })
    ).toThrow("Stale imported audio source");
  });

  it("rejects malformed audio assets and unknown sound sources", () => {
    const asset = { id: "sound-1", fileName: "sound-1.mp3", format: "mp3", byteSize: 10, available: true };
    expect(
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        audio: {
          ...DEFAULT_APP_SETTINGS.audio,
          assets: [asset],
          reminderSource: { kind: "imported", assetId: "sound-1" },
        },
      }).audio.assets
    ).toEqual([asset]);
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        audio: { ...DEFAULT_APP_SETTINGS.audio, assets: [asset, asset] },
      })
    ).toThrow("Duplicate audio asset identifier");
    expect(() =>
      parseAppSettings({
        ...DEFAULT_APP_SETTINGS,
        audio: { ...DEFAULT_APP_SETTINGS.audio, reminderSource: { kind: "builtin", id: "soft-whimper" } },
      })
    ).toThrow("Unknown built-in audio source");
  });

  it("validates and clones sanitized release-hardening statuses", () => {
    const autostart = {
      supported: true,
      requested: false,
      effective: true,
      errorCode: "readback-mismatch",
    } as const;
    const parsedAutostart = parseAutostartStatus(autostart);
    expect(parsedAutostart).toEqual(autostart);
    expect(parsedAutostart).not.toBe(autostart);

    const recovery = { state: "safe-mode", errorCode: "pet-renderer-failed" } as const;
    const parsedRecovery = parsePetRendererStatus(recovery);
    expect(parsedRecovery).toEqual(recovery);
    expect(parsedRecovery).not.toBe(recovery);
  });

  it("rejects invalid autostart payloads and unsanitized status errors", () => {
    expect(parseAutostartEnabledInput(true)).toBe(true);
    expect(() => parseAutostartEnabledInput("true")).toThrow("enabled must be a boolean");
    expect(() =>
      parseAutostartStatus({
        supported: true,
        requested: true,
        effective: false,
        errorCode: "/Users/private/login-item-error",
      })
    ).toThrow("Invalid autostart status");
    expect(() =>
      parsePetRendererStatus({
        state: "safe-mode",
        errorCode: "render-process-gone: crashed",
      })
    ).toThrow("Invalid pet renderer status");
  });

  it("validates work schedules and narrow companion inputs", () => {
    const input = {
      enabled: true,
      startHour: 9,
      startMinute: 0,
      endHour: 17,
      endMinute: 30,
      weekdays: [1, 2, 3, 4, 5],
    };
    expect(parseCreateWorkScheduleInput(input)).toEqual(input);
    expect(parseUpdateWorkScheduleInput({ id: "work-1", ...input })).toEqual({ id: "work-1", ...input });
    expect(() => parseCreateWorkScheduleInput({ ...input, endHour: 9, endMinute: 0 })).toThrow("must differ");
    expect(() => parseCreateWorkScheduleInput({ ...input, weekdays: [1, 1] })).toThrow("Duplicate");
    expect(parseManualLifeSelection("sleeping")).toBe("sleeping");
    expect(() => parseManualLifeSelection("working")).toThrow("Invalid manual");
    expect(parseScreenEllipse({ centerX: -20, centerY: 10, radiusX: 6, radiusY: 200 })).toEqual({
      centerX: -20,
      centerY: 10,
      radiusX: 6,
      radiusY: 200,
    });
    expect(() => parseScreenEllipse({ centerX: 0, centerY: 0, radiusX: 5, radiusY: 10 })).toThrow("Invalid screen");
  });

  it("clones companion snapshots without exposing mutable settings values", () => {
    const work = {
      id: "work-1",
      enabled: true,
      startHour: 9,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
      weekdays: [1] as const,
    };
    const runtime = {
      lifeState: "daily-calm" as const,
      pace: "natural" as const,
      manualSelection: "auto" as const,
      manualWorkActive: false,
      scheduledWorkActive: false,
      systemSuspended: false,
      nextTransitionAt: null,
      available: { drowsy: false, sleeping: false },
    };
    const snapshot = createCompanionSystemSnapshot({ ...DEFAULT_APP_SETTINGS, workSchedules: [work] }, runtime);
    expect(snapshot).toEqual({ workSchedules: [work], runtime });
    expect(snapshot.workSchedules).not.toBe(DEFAULT_APP_SETTINGS.workSchedules);
    expect(snapshot.runtime).not.toBe(runtime);
    expect(snapshot.runtime.available).not.toBe(runtime.available);
  });

  it("validates settings navigation target payloads", () => {
    expect(parseSettingsNavigationTarget(null)).toBeNull();
    expect(parseSettingsNavigationTarget({})).toBeNull();
    expect(parseSettingsNavigationTarget({ tab: "invalid" })).toBeNull();
    expect(parseSettingsNavigationTarget({ tab: "rest", action: "invalid" })).toBeNull();
    expect(parseSettingsNavigationTarget({ tab: "rest" })).toEqual({ tab: "rest" });
    expect(parseSettingsNavigationTarget({ tab: "rest", action: "new-reminder" })).toEqual({
      tab: "rest",
      action: "new-reminder",
    });
    expect(parseSettingsNavigationTarget({ tab: "pets" })).toEqual({ tab: "pets" });
  });

  it("parses head hotspot with optional enabled flag", () => {
    const legacy = { centerX: 0.5, centerY: 0.22, radiusX: 0.18, radiusY: 0.18 };
    expect(parseHeadHotspot(legacy)).toEqual(legacy);

    const disabled = { ...legacy, enabled: false };
    expect(parseHeadHotspot(disabled)).toEqual(disabled);

    const enabled = { ...legacy, enabled: true };
    expect(parseHeadHotspot(enabled)).toEqual(enabled);

    expect(() => parseHeadHotspot({ ...legacy, enabled: "yes" })).toThrow("Invalid head hotspot enabled state");
    expect(() => parseHeadHotspot({ ...legacy, extra: 1 })).toThrow("Invalid head hotspot");
  });

  it("parses valid dialogue preview request and rejects invalid payloads", () => {
    const valid = {
      petId: "pet-1",
      text: "你好呀！",
      voiceAssetId: "voice-1",
      voiceTrimStart: 0.5,
      voiceTrimEnd: 3.2,
      voiceVolume: 0.8,
    };
    expect(parseDialoguePreviewRequest(valid)).toEqual(valid);

    // Minimal valid
    expect(parseDialoguePreviewRequest({ petId: "pet-1", text: "早安" })).toEqual({
      petId: "pet-1",
      text: "早安",
      voiceAssetId: undefined,
      voiceTrimStart: undefined,
      voiceTrimEnd: undefined,
      voiceVolume: undefined,
    });

    // Invalid non-record
    expect(() => parseDialoguePreviewRequest(null)).toThrow("Invalid dialogue preview request");
    expect(() => parseDialoguePreviewRequest("test")).toThrow("Invalid dialogue preview request");

    // Invalid petId
    expect(() => parseDialoguePreviewRequest({ petId: "../bad", text: "hello" })).toThrow("Invalid pet identifier");

    // Invalid text
    expect(() => parseDialoguePreviewRequest({ petId: "pet-1", text: "" })).toThrow("Invalid preview text length");
    expect(() => parseDialoguePreviewRequest({ petId: "pet-1", text: "   " })).toThrow("Invalid preview text length");
    expect(() => parseDialoguePreviewRequest({ petId: "pet-1", text: 123 })).toThrow("Invalid preview text");

    // Invalid voiceTrim
    expect(() => parseDialoguePreviewRequest({ petId: "pet-1", text: "ok", voiceTrimStart: -1 })).toThrow(
      "Invalid voice trim start"
    );
    expect(() =>
      parseDialoguePreviewRequest({ petId: "pet-1", text: "ok", voiceTrimStart: 5, voiceTrimEnd: 4 })
    ).toThrow("Voice trim end must be greater than trim start");

    // Invalid volume
    expect(() => parseDialoguePreviewRequest({ petId: "pet-1", text: "ok", voiceVolume: 1.5 })).toThrow(
      "Invalid voice volume"
    );
  });

  it("parses create and update reminder inputs with optional voice configuration", () => {
    const validBase = {
      mode: "fixed" as const,
      enabled: true,
      hour: 14,
      minute: 30,
      weekdays: [1, 2, 3, 4, 5] as const,
      restDurationMinutes: 10,
      cursorTolerance: "standard" as const,
      message: "该休息一下啦",
      sounds: { reminder: true, crying: false },
    };

    const parsedWithoutVoice = parseCreateReminderInput(validBase);
    expect(parsedWithoutVoice).toEqual(validBase);

    const withVoice = {
      ...validBase,
      voiceAssetId: "voice-123",
      voiceTrimStart: 0.5,
      voiceTrimEnd: 3.2,
    };
    const parsedWithVoice = parseCreateReminderInput(withVoice);
    expect(parsedWithVoice).toEqual(withVoice);

    const updateWithVoice = parseUpdateReminderInput({ id: "rem-1", ...withVoice });
    expect(updateWithVoice).toEqual({ id: "rem-1", ...withVoice });

    // Rejects trims without voiceAssetId
    expect(() => parseCreateReminderInput({ ...validBase, voiceTrimStart: 1 })).toThrow(
      "voiceTrimStart and voiceTrimEnd require voiceAssetId"
    );

    // Rejects voiceTrimEnd <= voiceTrimStart
    expect(() =>
      parseCreateReminderInput({
        ...validBase,
        voiceAssetId: "voice-123",
        voiceTrimStart: 2,
        voiceTrimEnd: 1,
      })
    ).toThrow("voiceTrimEnd must be greater than voiceTrimStart");

    // Rejects voiceTrimEnd <= 0 even when voiceTrimStart is omitted
    expect(() =>
      parseCreateReminderInput({
        ...validBase,
        voiceAssetId: "voice-123",
        voiceTrimEnd: 0,
      })
    ).toThrow("Invalid reminder voiceTrimEnd");

    // Rejects unexpected keys
    expect(() => parseCreateReminderInput({ ...validBase, extra: 123 })).toThrow("Invalid reminder input");
  });

  it("validates interval reminder timing and windows strictly", () => {
    const intervalInput = {
      enabled: true,
      mode: "interval" as const,
      windows: [
        { startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
        { startHour: 14, startMinute: 0, endHour: 18, endMinute: 0 },
      ],
      intervalMinutes: 60,
      weekdays: [1, 2, 3, 4, 5] as const,
      restDurationMinutes: 10,
      cursorTolerance: "standard" as const,
      message: "休息一会儿吧。",
      sounds: { reminder: false, crying: false },
    };

    expect(parseCreateReminderInput(intervalInput)).toEqual(intervalInput);

    // Deep clones windows
    const parsed = parseCreateReminderInput(intervalInput);
    if (parsed.mode === "interval") {
      expect(parsed.windows).not.toBe(intervalInput.windows);
      expect(parsed.windows[0]).not.toBe(intervalInput.windows[0]);
    }

    // Sorts windows by start minute
    const unsortedInput = {
      ...intervalInput,
      windows: [
        { startHour: 14, startMinute: 0, endHour: 18, endMinute: 0 },
        { startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
      ],
    };
    expect(parseCreateReminderInput(unsortedInput)).toEqual(intervalInput);

    // Allows adjacent touching windows
    const adjacentWindows = [
      { startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
      { startHour: 12, startMinute: 0, endHour: 14, endMinute: 0 },
    ];
    expect(parseCreateReminderInput({ ...intervalInput, windows: adjacentWindows })).toMatchObject({
      windows: adjacentWindows,
    });

    // Rejects mixed fixed and interval fields
    expect(() => parseCreateReminderInput({ ...intervalInput, hour: 9 })).toThrow("Invalid reminder input");
    expect(() =>
      parseCreateReminderInput({
        mode: "fixed",
        enabled: true,
        hour: 9,
        minute: 0,
        windows: [{ startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 }],
        weekdays: [1],
        restDurationMinutes: 10,
        cursorTolerance: "standard",
        message: "休息",
        sounds: { reminder: false, crying: false },
      })
    ).toThrow("Invalid reminder input");

    // Rejects empty windows
    expect(() => parseCreateReminderInput({ ...intervalInput, windows: [] })).toThrow("Invalid reminder windows");

    // Rejects more than 3 windows
    expect(() =>
      parseCreateReminderInput({
        ...intervalInput,
        windows: [
          { startHour: 9, startMinute: 0, endHour: 11, endMinute: 0 },
          { startHour: 11, startMinute: 0, endHour: 13, endMinute: 0 },
          { startHour: 13, startMinute: 0, endHour: 15, endMinute: 0 },
          { startHour: 15, startMinute: 0, endHour: 17, endMinute: 0 },
        ],
      })
    ).toThrow("Invalid reminder windows");

    // Rejects equal endpoints
    expect(() =>
      parseCreateReminderInput({
        ...intervalInput,
        windows: [{ startHour: 9, startMinute: 0, endHour: 9, endMinute: 0 }],
      })
    ).toThrow("Invalid reminder window range");

    // Rejects cross-midnight window
    expect(() =>
      parseCreateReminderInput({
        ...intervalInput,
        windows: [{ startHour: 22, startMinute: 0, endHour: 2, endMinute: 0 }],
      })
    ).toThrow("Invalid reminder window range");

    // Rejects overlapping windows
    expect(() =>
      parseCreateReminderInput({
        ...intervalInput,
        windows: [
          { startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
          { startHour: 11, startMinute: 30, endHour: 13, endMinute: 0 },
        ],
      })
    ).toThrow("Overlapping reminder windows");

    // Rejects out-of-range time parts in window
    expect(() =>
      parseCreateReminderInput({
        ...intervalInput,
        windows: [{ startHour: 24, startMinute: 0, endHour: 25, endMinute: 0 }],
      })
    ).toThrow("Invalid reminder window time");
    expect(() =>
      parseCreateReminderInput({
        ...intervalInput,
        windows: [{ startHour: 9, startMinute: -1, endHour: 10, endMinute: 0 }],
      })
    ).toThrow("Invalid reminder window time");

    // Rejects interval < 15 or > 240 or not divisible by 5
    expect(() => parseCreateReminderInput({ ...intervalInput, intervalMinutes: 10 })).toThrow(
      "Invalid reminder interval"
    );
    expect(() => parseCreateReminderInput({ ...intervalInput, intervalMinutes: 245 })).toThrow(
      "Invalid reminder interval"
    );
    expect(() => parseCreateReminderInput({ ...intervalInput, intervalMinutes: 17 })).toThrow(
      "Invalid reminder interval"
    );
  });
});
