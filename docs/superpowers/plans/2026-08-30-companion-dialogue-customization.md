# Companion Dialogue Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one continuous session. Repository policy forbids per-task subagents, per-task reviews, UI automation, and browser-based runtime validation.

**Goal:** Let each desktop companion keep its own form of address and editable dialogue lists for every supported interaction, while preserving required system messages and the existing cooldown behavior.

**Architecture:** Move the editable dialogue catalog into shared TypeScript with stable trigger and line IDs, then add pure validation, normalization, reset, and effective-pool resolution helpers. Persist sparse per-pet dialogue settings through the existing atomic `updatePet` path. Add a nested settings editor that works on the existing pet draft, and have `PetShell` resolve a final pool before handing strings to the unchanged `DialogueSelector`.

**Tech Stack:** Electron 43, React 19, TypeScript 5.9, Vite/electron-vite, Vitest, CSS

**Spec:** `docs/superpowers/specs/2026-08-30-companion-dialogue-customization-design.md`

## Global Constraints

- Keep production fully offline; do not add accounts, telemetry, remote assets, content-filter services, update checks, or network calls.
- Store address and dialogue configuration inside the owning `PetConfig`; never share it between pets.
- Editable scenes and triggers are fixed. Users may edit or disable built-ins and add custom lines, but may not create triggers or change cooldowns.
- The only supported placeholder is the visible token `[称呼]`.
- Address is optional and limited to 12 Unicode grapheme clusters; dialogue is required, single-line, and limited to 30 Unicode grapheme clusters; each trigger allows at most 20 custom lines.
- Required rest, countdown, crying, completion, and error messages remain outside the editable pools and ignore the optional-bubble switch.
- The application is pre-release: introduce the new schema directly and reject old development schemas instead of adding a migration.
- Do not add a right-click shortcut schema, image/effect fields, or unused future-facing configuration.
- Renderer code uses only the existing narrow typed preload API; the main process validates the complete pet-update payload before persistence.
- Do not add UI unit tests, React component tests, snapshots, browser tests, Playwright, or automated end-to-end tests.
- Automated verification is limited to necessary shared/main core unit tests, lint, typecheck/build, and a non-visual Electron startup smoke check.
- Execute as three implementation batches with one commit per batch, followed by one milestone verification and comprehensive review batch.

---

### Batch 1: Shared dialogue model, strict validation, and per-pet persistence

**Files:**

- Create: `src/shared/dialogue-catalog.ts`
- Create: `src/shared/dialogue-settings.ts`
- Create: `src/shared/dialogue-settings.test.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/contracts.test.ts`
- Modify: `src/main/settings/default-settings.ts`
- Modify: `src/main/settings/settings-store.ts`
- Modify: `src/main/settings/settings-store.test.ts`
- Modify: `src/main/pets/pet-pack-service.ts`
- Modify: `src/main/pets/pet-pack-service.test.ts`

**Interfaces:**

- `DialogueCategory` is the union of the 17 existing selector keys: `daily:click`, `playful:click`, `daily:petting`, `auto:cute`, `state:daily`, `state:drowsy`, `drowsy:click`, `drowsy:petting`, `state:sleeping`, `sleeping:murmur`, `sleeping:stirring`, `sleeping:awake`, `sleeping:touch`, `state:working`, `working:click`, `working:petting`, and `angry`.
- `DIALOGUE_GROUPS` defines the five ordered user-facing groups and exact labels from the spec; each trigger metadata entry contains `id`, `group`, `label`, and built-in `{ id, text }` rows.
- `SYSTEM_DIALOGUES` contains only `crying` and `reminderCompletion`; it is not accepted in `PetDialogueSettings.categories`.
- `PetDialogueSettings`, `DialogueCategorySettings`, `BuiltInDialogueOverride`, and `CustomDialogueLine` match the approved spec exactly.
- `EMPTY_PET_DIALOGUE_SETTINGS` is `{ address: '', categories: {} }` and is cloned for each new pet.
- `getDialogueValidationIssues(value)` returns `readonly DialogueValidationIssue[]`, where an issue has `{ path: string; message: string }`.
- `parsePetDialogueSettings(value)` trims outer whitespace, validates exact object keys, grapheme limits, safe IDs, bounded override/custom-line counts, control characters, and duplicate templates, drops empty category objects, then returns a newly allocated normalized value or throws the first issue message.
- `resolveDialogueLines(category, settings)` applies built-in overrides, appends enabled custom lines, substitutes `[称呼]`, skips placeholder lines when address is empty, and removes empty or final-text duplicates.
- `restoreBuiltInLine(settings, category, lineId)` removes only that line's `text` override while preserving `automaticEnabled: false` when present.
- `restoreBuiltInCategory(settings, category)` removes all built-in overrides for that trigger while preserving address, custom lines, and custom-line enabled states.
- `AppSettingsV5` is the only accepted persisted shape and `AppSettings` aliases it; every `PetConfig` and `PetUpdateInput` includes `dialogueSettings`.

- [ ] Add the shared catalog with the five groups in this order and map every current editable string from `src/renderer/src/dialogues/dialogue-library.ts` to an explicit stable line ID. Preserve the current selector keys so `auto:cute` remains the only automatic-cooldown category. Keep these two pools separate and non-editable:

```ts
export const SYSTEM_DIALOGUES = {
  crying: ["还没休息够呢～", "再休息一会儿吧～", "闭目养神一会儿好不好？"],
  reminderCompletion: ["休息结束啦！", "活动一下，感觉好多了～", "充满电啦，继续加油！"],
} as const;
```

- [ ] Write failing core tests for catalog coverage and dialogue normalization. The assertions must prove that all 17 trigger IDs are unique, every built-in line ID is unique within its trigger, emoji and combined characters count as one grapheme, outer whitespace is trimmed, newlines/control characters are rejected, 13-character addresses and 31-character lines are rejected, a 21st custom line is rejected, unsafe/duplicate IDs are rejected, and duplicate templates in one trigger are rejected:

```ts
expect(countVisibleCharacters("👨‍👩‍👧‍👦")).toBe(1);
expect(parsePetDialogueSettings({ address: "  小葡萄  ", categories: {} }).address).toBe("小葡萄");
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
```

- [ ] Run `pnpm test -- src/shared/dialogue-settings.test.ts src/shared/contracts.test.ts`; expect failure because the shared dialogue modules and schema v5 do not exist.

- [ ] Implement `dialogue-settings.ts` with `Intl.Segmenter(undefined, { granularity: 'grapheme' })`, a control-character check that rejects Unicode `Cc` characters without rejecting zero-width joiners used by emoji, exact-key validation at every nested level, and immutable return values. Reject unknown category IDs. Accept safely formatted built-in line IDs that no longer exist, cap overrides at 64 per trigger, retain them in persisted settings, and ignore them in `resolveDialogueLines`; this implements the approved catalog-evolution rule without allowing an unbounded payload.

- [ ] Add resolver/reset tests covering all approved semantics:

```ts
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
      ],
    },
  },
});
expect(resolveDialogueLines("daily:click", settings)).toContain("小葡萄，在呢。");
expect(resolveDialogueLines("daily:click", { ...settings, address: "" })).not.toContain("[称呼]，在呢。");
expect(new Set(resolveDialogueLines("daily:click", settings)).size).toBe(
  resolveDialogueLines("daily:click", settings).length
);
```

Also prove that all-disabled returns `[]`, `restoreBuiltInLine` keeps a false enabled override, and `restoreBuiltInCategory` leaves address and custom lines byte-for-byte equivalent.

- [ ] Replace schema v4 with schema v5 in contracts and defaults. Remove v1–v4 migration branches, legacy pet types/parsers, and migration-only tests. Keep `migrateAppSettings(value)` as the `SettingsStore` boundary, but make it return `{ migrated: false, settings: parseAppSettingsV5(value) }` only for schema 5 and throw `Unsupported settings schema version` otherwise; this preserves the store interface without pretending to migrate pre-release data.

- [ ] Extend both `parsePetConfig` and `parsePetUpdateInput` exact-key lists with `dialogueSettings`, call `parsePetDialogueSettings`, and clone the normalized nested arrays on snapshots and persistence. Add contract tests proving unknown fields, invalid category IDs, malformed or excessive overrides, and duplicate custom lines are rejected in both saved settings and update payloads; add a positive test proving one safe stale built-in line ID round-trips but never enters the effective pool.

- [ ] Initialize each new pet with a fresh `{ address: '', categories: {} }`, and make `PetPackService.updatePet` save only the validated dialogue configuration belonging to the requested pet. Add a two-pet service test that updates pet A and proves pet B's address and category data are unchanged.

- [ ] Update settings-store tests to use schema v5, delete the old migration expectations, and add one assertion that an old schema is invalid rather than rewritten. Retain all existing atomic-write, backup recovery, invalid-payload preservation, and file-permission coverage.

- [ ] Run targeted core tests: `pnpm test -- src/shared/dialogue-settings.test.ts src/shared/contracts.test.ts src/main/settings/settings-store.test.ts src/main/pets/pet-pack-service.test.ts`.

- [ ] Commit with message `feat: add per-pet dialogue settings`.

### Batch 2: Nested dialogue-and-address settings experience

**Files:**

- Create: `src/renderer/src/components/DialogueSettingsEditor.tsx`
- Create: `src/renderer/src/components/DialogueLineEditor.tsx`
- Modify: `src/renderer/src/windows/SettingsShell.tsx`
- Modify: `src/renderer/src/styles/global.css`

**Interfaces:**

- `DialogueSettingsEditor` receives `{ petName, settings, bubblesEnabled, drowsyEnabled, sleepingEnabled, validationAttempt, onChange, onBack }`.
- `DialogueLineEditor` receives a resolved row model with source `builtin | custom`, current text, default text, automatic state, validation issue, and callbacks for text change, toggle, restore, delete, and placeholder insertion.
- `SettingsShell` owns `petEditorPage: 'details' | 'dialogues'`, keeps dialogue changes in the existing `PetUpdateInput` draft, and runs the same `saveDraft` method from either page.
- Local navigation inside `DialogueSettingsEditor` is `home -> group -> trigger`; it does not create a new top-level settings tab or URL/router dependency.
- New custom IDs use renderer `crypto.randomUUID()` and are stored without display-text coupling.

- [ ] Add a `对白与称呼` summary card immediately after `CompanionPreferences` and provide the single action label `编辑对白`. Build the secondary copy from concrete fragments: use `${petName}称呼你为“${address}”` when an address exists, `自定义 ${count} 句` when custom lines exist, and `已调整内置对白` when overrides exist; join present fragments with `·`. When none are present, show `当前使用内置对白`.

- [ ] Build the nested home and group views from `DIALOGUE_GROUPS`, not duplicated JSX metadata. The home view must show the address field, five ordered scene rows, trigger/custom counts, the fixed system-message note, and the disabled-bubbles notice. The relevant group view shows `这个场景尚未启用，设置会保留` when drowsy or sleeping is not enabled. Returning to pet details must preserve the draft.

- [ ] Build the trigger view as one unified list. Built-in rows show `内置` and conditional `已修改`; custom rows show `我的`. Every row uses a native checkbox/switch labelled `自动使用`. Built-ins expose `恢复原句` only when text differs from the catalog; custom rows expose `删除`. Show `建议 4–12 个字，最多 30 个字` near line editing and `最多 12 个字，可以留空` near the address field. These are grapheme-aware validation limits, not HTML UTF-16 `maxLength` enforcement. All-disabled is allowed and does not produce a form error.

- [ ] Implement `添加一句` with the 20-line limit and insert `[称呼]` at the active input selection using `setRangeText('[称呼]', start, end, 'end')`. If no input owns the cursor, insert into the newest custom row. Render the substituted final preview under a line that contains the placeholder; when address is empty, show `设置称呼后，这句才会自动使用` instead of a broken preview.

- [ ] Implement `恢复内置对白` as a confirmation inside the trigger view with the exact explanation `内置对白将恢复原文并重新启用，你添加的对白不会改变。`. On confirmation call `restoreBuiltInCategory`; do not mutate custom lines, their switches, or `settings.address`.

- [ ] Use `getDialogueValidationIssues` for blur-time inline errors and the save-time error summary. Give every editable row a deterministic DOM ID derived from the trigger and line ID; link summary entries with anchors, associate messages through `aria-describedby`, set invalid fields with `aria-invalid`, and focus the summary whenever `validationAttempt` increases.

- [ ] Render the existing `保存设置` action on the dialogue home, group, and trigger views. In `SettingsShell.saveDraft`, validate dialogue settings before invoking `api.updatePet`. If issues exist, switch to the dialogue page, increment `validationAttempt`, retain the draft, and do not call IPC. If persistence fails, keep the page and draft intact and use the existing top-level save failure surface. On a successful save, replace the draft from the returned pet exactly as today. Extend `petToUpdateInput` and `mergeImportedAssetsIntoDraft` to deep-clone/preserve dialogue settings so photo imports cannot erase unsaved dialogue edits.

- [ ] Add CSS scoped to `.dialogue-settings-*` for the nested header, scene rows, source badges, compact line editor, preview, inline errors, and error summary. Reuse current colors, borders, focus ring, button types, and spacing rhythm; keep controls usable at the settings window's minimum width. Do not change pet-window CSS.

- [ ] Run `pnpm lint` and `pnpm typecheck`. No automated UI validation is permitted.

- [ ] Commit with message `feat: add dialogue settings editor`.

### Batch 3: Runtime effective pools and system-message isolation

**Files:**

- Delete: `src/renderer/src/dialogues/dialogue-library.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/dialogues/use-dialogue.ts`
- Modify: `src/shared/dialogue-selector.test.ts`
- Modify: `src/shared/dialogue-settings.test.ts`

**Interfaces:**

- `PetShell.showPetDialogue(category)` calls `resolveDialogueLines(category, activePet.dialogueSettings)` and then `showDialogue(category, lines)`.
- Required flows continue to call `showDialogue('system:crying', SYSTEM_DIALOGUES.crying, true)` and `showDialogue('system:completion', SYSTEM_DIALOGUES.reminderCompletion, true)`.
- `useDialogue` retains the current `required || enabled` boundary; optional empty pools return without clearing an already visible required message or changing an action.

- [ ] Replace all 17 editable `DIALOGUES.*` call sites with `showPetDialogue` using the unchanged category IDs. This includes click, playful click, petting, ambient speech, state entry/return, wake stages, and drag-too-fast. Keep action execution independent of whether the returned dialogue is null.

- [ ] Import `SYSTEM_DIALOGUES` directly for crying and rest completion only. Preserve `required: true` and the existing fallback text in the rest overlay so disabling daily bubbles or all editable rows cannot hide necessary state communication.

- [ ] Ensure `showPetDialogue` is recreated when the active pet or its dialogue settings change, and reset/clear visible optional dialogue on pet changes so one pet's rendered line cannot remain over another pet. Do not reset `DialogueSelector` between ordinary events; its existing category cooldown and recent-two memory must remain active.

- [ ] Extend core tests to prove resolved final strings still participate in the existing category cooldown and recent-two behavior, and that a resolver result of `[]` makes `DialogueSelector.select` return null without updating cooldown state. Keep this in shared tests; do not test the React hook or `PetShell` component.

- [ ] Remove the old renderer-only catalogue after every call site uses the shared catalog. Run targeted core tests: `pnpm test -- src/shared/dialogue-settings.test.ts src/shared/dialogue-selector.test.ts`.

- [ ] Run `pnpm lint` and `pnpm typecheck`.

- [ ] Commit with message `feat: use customized dialogue at runtime`.

### Batch 4: Milestone verification, comprehensive review, and consolidated fix

**Files:**

- Modify only files needed to resolve findings from the single milestone review.

- [ ] Run the full allowed unit suite: `pnpm test`.

- [ ] Run static verification: `pnpm lint` and `pnpm typecheck`.

- [ ] Run the production build: `pnpm build`.

- [ ] Run the non-visual Electron startup smoke check: `DEAR_COMPANION_BUILD_SMOKE=1 pnpm exec electron ./out/main/index.js`; expect exit code 0 without an immediate startup failure.

- [ ] Review the complete milestone diff once against the 2026-08-30 design for per-pet isolation, sparse overrides, reset semantics, placeholder skipping, Unicode validation, final-text deduplication, required-message isolation, optional-bubble behavior, strict IPC validation, atomic persistence, offline/privacy boundaries, and absence of premature shortcut-interaction fields.

- [ ] Review renderer integration once for stale pet closures, draft loss during nested navigation/import/pet switching, unsafe list keys, lost input focus after insertion, inaccessible validation, and action code accidentally depending on a non-empty dialogue pool. Record UI appearance and interaction checks as awaiting the user; do not open a browser or claim visual correctness.

- [ ] Apply one consolidated fix pass for all Critical or Important findings, then repeat `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the non-visual startup smoke check.

- [ ] If no fix was needed, do not create an empty commit. If fixes were needed, commit them together with message `fix: complete dialogue customization milestone`.

## Manual UI verification awaiting the user

- Confirm each pet shows and saves a different address and different dialogue changes after switching between pets.
- Confirm the nested `对白与称呼` home, scene, trigger, and back-navigation hierarchy is understandable on Windows and macOS.
- Confirm built-in and custom sources, modified state, automatic switches, deletion, single-line restore, and trigger-wide restore are visually distinct and behave as described.
- Confirm trigger-wide restore re-enables/restores built-ins without changing custom lines, custom enabled states, or the address.
- Confirm `[称呼]` inserts at the caret, previews the final sentence, and becomes temporarily unavailable when the address is empty.
- Confirm all-disabled optional dialogue still plays the associated companion action without showing a bubble.
- Confirm turning off `日常对话气泡` preserves all settings and suppresses optional dialogue after save, while rest invitations, countdowns, crying, completion, and errors remain visible.
- Confirm length-limit errors, the summary focus jump, error links, keyboard order, switches, and accessible names are understandable without relying on color.
- Confirm lines up to 30 visible characters remain readable in the desktop bubble and do not make the transparent pet window unusable.
