# Companion Quick Dialogues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and execute this plan continuously in one session. Repository policy overrides the generic planning template: do not use `superpowers:subagent-driven-development`, per-task reviewers, dual reviews, or repeated review loops. Work in the three coherent batches below, with one commit per batch.

**Goal:** Let each companion expose up to three selected, non-system dialogue lines in a native “常用对白” submenu that displays the current text and conditionally plays the line's existing voice without changing companion state.

**Architecture:** Store ordered stable `{ category, lineId }` references inside each pet's dialogue settings and migrate settings schema V7 to V8 with an empty default. Resolve those references through a pure shared helper that is independent of automatic-dialogue enablement, then reuse the existing main-to-pet interaction event and exact dialogue playback path. Keep selection and capacity feedback inside the existing dialogue editor; do not add a new page, IPC channel, audio service, action binding, or tray-menu entry.

**Tech Stack:** npm, Electron 43, React 19, TypeScript 5.9, electron-vite, Vite 7, Vitest 4, ESLint 10, CSS Modules. Add no dependency.

**Spec:** `docs/superpowers/specs/2026-09-08-companion-quick-dialogues-design.md` and the synchronized source of truth `docs/superpowers/specs/2026-07-31-dear-companion-design.md`, especially sections 2.1, 2.2, 6.4, 7.5, 8.1, and 12.

## Global Constraints

- Read `AGENTS.md` and both spec files before implementation. Stop if a code decision would add photos, actions, state changes, trigger editing, keyboard shortcuts, or tray-menu shortcuts.
- Use npm exclusively. Do not introduce pnpm, yarn, bun, an alternative lockfile, or a new package.
- Preserve unrelated working-tree changes. Do not restore, rewrite, stage, or commit files outside the active batch.
- Production remains fully offline. Do not add remote assets, services, analytics, telemetry, or network access.
- Keep all renderer access behind the existing typed preload bridge. Do not expose generic IPC, filesystem, shell, path, or command functions.
- Store at most three ordered references per companion. Allow built-in lines, user lines, and lines disabled for automatic selection; reject `rest:crying` and `rest:completion`.
- A quick-dialogue trigger displays text only and optionally plays its existing voice. It must not change photos, action templates, life state, manual selection, or work sources.
- The “日常对话气泡” switch disables the submenu. The “对白声音” switch controls voice playback. System reminder/rest flows disable the submenu; ordinary working, drowsy, and sleeping states do not.
- Do not add UI unit tests, React component tests, snapshots, Playwright, browser tests, or automated end-to-end tests. Do not open a browser or visually inspect Electron.
- During Batches 1–3 run only the listed targeted core tests. At completion, run the full allowed unit suite, lint, typecheck, production build, and one non-visual Electron startup smoke check.
- After coding and verification, perform one comprehensive review of the full milestone diff for specification compliance, security/privacy boundaries, cross-module integration, and code quality. Consolidate findings into one fix pass and one final verification.

---

## Planned File Changes

```text
docs/superpowers/specs/2026-07-31-dear-companion-design.md       # Source-of-truth scope revision (already prepared)
docs/superpowers/specs/2026-09-08-companion-quick-dialogues-design.md # Detailed approved behavior (already prepared)
src/shared/dialogue-settings.ts                                  # Reference model, validation, exact resolution, mutations
src/shared/dialogue-settings.test.ts                             # Core reference and resolution coverage
src/shared/contracts.ts                                          # Schema V8 and quick-dialogue interaction request
src/shared/contracts.test.ts                                     # V7/V8 parsing, migration, and request/snapshot cloning coverage
src/main/settings/settings-store.test.ts                         # On-disk V7-to-V8 migration safety
src/main/pets/pet-pack-service.ts                                # Empty defaults and cloned persistence
src/renderer/src/components/DialogueLineEditor.tsx               # Per-line “设为常用” control
src/renderer/src/components/DialogueLineEditor.module.css        # Stable button and responsive action layout
src/renderer/src/components/DialogueSettingsEditor.tsx           # Summary, capacity, selection, deletion cleanup, focus
src/renderer/src/components/DialogueSettingsEditor.module.css    # Stable summary/status/error slots
src/renderer/src/windows/SettingsShell.tsx                        # Existing save validation and draft cloning compatibility
src/main/ipc/register-pet-system-ipc.ts                           # Native submenu and trusted resolved request dispatch
src/renderer/src/windows/PetShell.tsx                             # Exact text/voice handling without an extra action
```

Do not add a new preload method or IPC channel: `PetInteractionRequest`, `WindowManager.requestPetInteraction`, and `onPetInteractionRequested` already provide the narrow main-to-pet event boundary. Do not modify `TrayController`, audio services, voice import, the bubble window, or companion-state controllers unless typecheck demonstrates a necessary narrow compatibility edit.

---

## Batch 1: Schema V8 and Pure Quick-Dialogue Model

**Files:**

- Modify: `src/shared/dialogue-settings.ts`
- Modify: `src/shared/dialogue-settings.test.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/contracts.test.ts`
- Modify: `src/main/settings/settings-store.test.ts`
- Modify: `src/main/pets/pet-pack-service.ts`

**Produces:**

```ts
export const MAX_QUICK_DIALOGUES = 3;
export const QUICK_DIALOGUE_BLOCKED_CATEGORIES = Object.freeze(["rest:crying", "rest:completion"] as const);

export interface QuickDialogueReference {
  readonly category: DialogueCategory;
  readonly lineId: string;
}

export interface PetDialogueSettings {
  readonly address: string;
  readonly categories: Readonly<Partial<Record<DialogueCategory, DialogueCategorySettings>>>;
  readonly voiceEnabled: boolean;
  readonly voiceVolume: number;
  readonly quickDialogueRefs: readonly QuickDialogueReference[];
}

export function resolveDialogueReference(
  reference: QuickDialogueReference,
  settings: PetDialogueSettings
): ResolvedDialogueCandidate | null;

export function resolveQuickDialogueCandidates(settings: PetDialogueSettings): readonly ResolvedDialogueCandidate[];

export function toggleQuickDialogueReference(
  settings: PetDialogueSettings,
  reference: QuickDialogueReference
): PetDialogueSettings;

export function removeQuickDialogueReference(
  settings: PetDialogueSettings,
  reference: QuickDialogueReference
): PetDialogueSettings;
```

The exact resolver returns the current built-in text or user text plus voice metadata even when `automaticEnabled` is false. It applies `[称呼]`, but returns `null` for a missing line, blank text, or missing address. It does not select randomly, mutate cooldowns, or consult automatic enablement.

- [ ] Add focused failing tests for parsing and validation. Cover an empty/default list, one to three ordered references, four references, duplicate `{ category, lineId }` pairs, unsafe IDs, unknown categories, both blocked rest categories, and deep cloning of reference objects.

```ts
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
```

- [ ] Run the focused dialogue-settings test and confirm failure because `quickDialogueRefs` is not accepted or returned.

```bash
npm exec vitest run src/shared/dialogue-settings.test.ts
```

- [ ] Add `MAX_QUICK_DIALOGUES`, `QuickDialogueReference`, the blocked-category predicate, and `quickDialogueRefs` to `PetDialogueSettings` and `EMPTY_PET_DIALOGUE_SETTINGS`. Update `clonePetDialogueSettings` and every explicit settings reconstruction in `restoreBuiltInLine`, `restoreBuiltInCategory`, and `toggleCategoryAutomatic` to preserve a newly cloned reference list.

- [ ] Extend `getDialogueValidationIssues` and `parsePetDialogueSettings`. Accept `quickDialogueRefs` as an optional compatibility field and always normalize a missing field to a newly allocated empty array; the outer schema migration still rewrites V7 files as V8. Validate maximum length, known non-system category, safe line ID, unique pair, unresolved placeholder due to empty address, and duplicate resolved final text. Use focusable paths:

```ts
{ path: "address", message: "常用对白包含称呼，请先设置称呼" }
{ path: `${reference.category}:${reference.lineId}`, message: "常用对白内容不能重复" }
{ path: "quickDialogueRefs", message: "常用对白最多选择 3 句" }
```

Safe references to built-in IDs that no longer exist remain parseable and are ignored at resolution time. Do not reject an otherwise safe stale ID.

- [ ] Add failing resolver tests for: an unmodified built-in line; a modified built-in line; a custom line; an automatically disabled built-in and custom line; address substitution; preserved voice ID and trim bounds; missing address; blank/missing/stale line; stable input order; and duplicate final text rejection during validation.

```ts
expect(
  resolveDialogueReference({ category: "daily:click", lineId: "daily-click-here" }, settingsWithDisabledOverride)
).toEqual({
  lineId: "daily-click-here",
  text: "小葡萄，在呢。",
  voiceAssetId: "voice-one",
  voiceTrimStart: 0.2,
  voiceTrimEnd: 1.4,
});
```

- [ ] Implement exact resolution with one private line lookup shared by `resolveDialogueReference` and the automatic candidate builder where practical. Keep `resolveDialogueCandidates` behavior unchanged: it must continue filtering `automaticEnabled: false`, applying cooldown-compatible deduplication, and returning the same automatic pool.

- [ ] Add mutation-helper tests proving that selection appends in order, a fourth selection is a no-op, toggling an existing reference removes it, removing a deleted custom line cleans only the matching reference, and restoring/editing a line can preserve its reference.

- [ ] Implement `toggleQuickDialogueReference` and `removeQuickDialogueReference` as immutable helpers. Compare references by both category and line ID, clone retained objects, and return the original settings object only for a genuine no-op.

- [ ] Add `AppSettingsV8` and make it the exported `AppSettings`. Set `DEFAULT_APP_SETTINGS.schemaVersion` to `8`; parse schema V8 directly; migrate V7 to V8; and migrate supported V6/V5 inputs through their current reminder conversion into V8. Every migrated pet receives an empty `quickDialogueRefs` list while all existing reminders, dialogue text, voice bindings, assets, and settings remain unchanged.

```ts
export interface AppSettingsV8 {
  schemaVersion: 8;
  activePetId: string | null;
  petWindow: PetWindowSettings;
  autostartEnabled: boolean;
  audio: AudioSettingsV3;
  reminders: readonly ReminderSchedule[];
  workSchedules: readonly WorkSchedule[];
  pets: readonly PetConfig[];
}

export type AppSettings = AppSettingsV8;
```

- [ ] Update contract tests for the new current schema and add a real schema-V7 settings object with one pet whose dialogue settings omit `quickDialogueRefs`. Assert `migrateAppSettings` returns `migrated: true`, schema 8, empty references, unchanged voice settings, and independently cloned nested arrays.

- [ ] Extend `SettingsStore` migration coverage with an on-disk schema-V7 file. Assert loading rewrites the primary as schema V8, writes the exact original V7 shape to the backup, and preserves the companion's existing dialogue/voice values. Update older supported migration assertions to expect schema V8 without weakening their reminder checks.

- [ ] Update new-pet construction and any pet/dialogue clone path in `PetPackService` so a new companion starts with `quickDialogueRefs: []` and updates persist validated references. Do not change voice ownership collection: references point to dialogue lines, not directly to additional files.

- [ ] Run only the affected core tests.

```bash
npm exec vitest run src/shared/dialogue-settings.test.ts src/shared/contracts.test.ts src/main/settings/settings-store.test.ts src/main/pets/pet-pack-service.test.ts
```

Expected: all four files pass; existing automatic dialogue, voice ownership, reminder migration, and strict parsing behavior remain intact.

- [ ] Commit Batch 1.

```bash
git add docs/superpowers/specs/2026-07-31-dear-companion-design.md docs/superpowers/specs/2026-09-08-companion-quick-dialogues-design.md docs/superpowers/plans/2026-09-08-companion-quick-dialogues.md src/shared/dialogue-settings.ts src/shared/dialogue-settings.test.ts src/shared/contracts.ts src/shared/contracts.test.ts src/main/settings/settings-store.test.ts src/main/pets/pet-pack-service.ts
git commit -m "feat: add quick dialogue settings model"
```

---

## Batch 2: Dialogue Settings Selection Experience

**Files:**

- Modify: `src/renderer/src/components/DialogueLineEditor.tsx`
- Modify: `src/renderer/src/components/DialogueLineEditor.module.css`
- Modify: `src/renderer/src/components/DialogueSettingsEditor.tsx`
- Modify: `src/renderer/src/components/DialogueSettingsEditor.module.css`
- Modify: `src/renderer/src/windows/SettingsShell.tsx` only where draft cloning or focus routing requires compatibility

**Consumes:** `MAX_QUICK_DIALOGUES`, `QuickDialogueReference`, `resolveDialogueReference`, `toggleQuickDialogueReference`, and `removeQuickDialogueReference` from Batch 1.

**Produces:**

```ts
interface DialogueLineEditorProps {
  // Existing properties remain unchanged.
  readonly quickDialogueSelected?: boolean;
  readonly quickDialogueDisabled?: boolean;
  readonly quickDialogueUnavailableReason?: string;
  readonly onToggleQuickDialogue?: () => void;
}
```

- [ ] In `DialogueSettingsEditor`, derive ordered selected summaries from `settings.quickDialogueRefs` and exact resolution. Keep unresolved selected references visible as “对白暂不可用” until save validation directs the user to the actual field; do not silently discard them during render.

- [ ] Add the “常用对白” section inside the existing top controls card after the bubble/voice controls. Render a stable heading row with `已选 n / 3`, ordered removable summary chips, the normal supporting sentence, and one reserved status/error slot. Use semantic buttons for removal with full accessible names such as `从常用对白移除：今天也辛苦啦。`.

```tsx
<section className={styles.quickDialogueSection} aria-labelledby="quick-dialogue-title">
  <div className={styles.quickDialogueHeading}>
    <span id="quick-dialogue-title" className={styles.label}>
      常用对白
    </span>
    <span className={styles.quickDialogueCount}>
      已选 {selectedCount} / {MAX_QUICK_DIALOGUES}
    </span>
  </div>
  <div className={styles.quickDialogueSummary}>{/* ordered chips */}</div>
  <div className={styles.quickDialogueStatus} role={quickIssue ? "alert" : "status"}>
    {quickIssue ?? capacityCopy}
  </div>
</section>
```

- [ ] Preserve layout stability: reserve the summary row and status line height, keep the counter width stable, and allow chips to truncate only visually. Put the full resolved text in `title` and `aria-label`. At the existing 680px breakpoint, let chips and line actions wrap without covering inputs or changing the focused input's vertical position as validation appears.

- [ ] Extend `DialogueLineEditor` with a fixed-width vector-icon button after “预览” and before the source badge. Use the labels “设为常用” and “已设为常用”, `aria-pressed`, native `disabled`, and a non-color selected treatment. Do not use emoji or add an icon dependency; follow the current inline SVG style and stroke weight.

- [ ] Only pass the quick-dialogue props for non-rest categories. Compute `quickDialogueDisabled` when three other references are already selected, the current line is empty/invalid, or the line contains `[称呼]` while the address is empty. A selected line always remains removable even when the limit is full or its content later becomes invalid.

- [ ] Wire selection through `toggleQuickDialogueReference`. When the third line is selected, update the reserved status copy to “已经选满，取消一句后可以继续添加。” and disable only unselected line controls. Do not display a Toast for reaching the capacity.

- [ ] Update `handleDeleteCustomLine` to call `removeQuickDialogueReference` before publishing the new settings object. Keep `handleRestoreBuiltIn`, `handleRestoreCategory`, text edits, voice edits, and automatic-enable toggles reference-preserving.

- [ ] Extend existing validation focus routing: `address` focuses the address input; a quick-dialogue line path switches to the owning scenario tab and focuses that line input; the aggregate `quickDialogueRefs` path focuses the summary section with `tabIndex={-1}`. Generalize the existing save-time warning Toast to “对白设置中有需要处理的内容，请检查后再保存。” and keep the specific inline error; do not add a top error banner.

- [ ] Ensure `petToUpdateInput`, draft replacement after save, pet switching, and unsaved-change comparison clone and retain `quickDialogueRefs`. Most paths should inherit this through the Batch 1 clone helper; make only narrow compatibility edits in `SettingsShell.tsx` if static checks expose a missing field.

- [ ] Do not add automated UI tests. Run the core dialogue tests plus static checks for this batch.

```bash
npm exec vitest run src/shared/dialogue-settings.test.ts
npm run typecheck
npm run lint
```

Expected: core selection helpers pass, and the editor compiles and lints without React, accessibility, or CSS-module errors.

- [ ] Commit Batch 2.

```bash
git add src/renderer/src/components/DialogueLineEditor.tsx src/renderer/src/components/DialogueLineEditor.module.css src/renderer/src/components/DialogueSettingsEditor.tsx src/renderer/src/components/DialogueSettingsEditor.module.css src/renderer/src/windows/SettingsShell.tsx
git commit -m "feat: add quick dialogue selection controls"
```

---

## Batch 3: Native Menu and Exact Runtime Playback

**Files:**

- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/contracts.test.ts`
- Modify: `src/main/ipc/register-pet-system-ipc.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`

**Consumes:** `resolveQuickDialogueCandidates(settings)` and the current active-pet snapshot from Batch 1. Reuses `WindowManager.requestPetInteraction`, preload `onPetInteractionRequested`, `useDialogue.preview`, and `VoicePlaybackCoordinator`.

**Produces:**

```ts
export interface QuickDialogueRequest extends DialoguePreviewRequest {
  type: "quick-dialogue";
}

export type PetInteractionRequest =
  | { type: "play-now" }
  | { type: "preview-pace"; pace: CompanionPace }
  | ({ type: "preview-dialogue" } & DialoguePreviewRequest)
  | QuickDialogueRequest;
```

- [ ] Add a contract test showing that a `QuickDialogueRequest` can carry only the already validated pet ID, final text, optional voice ID, trim bounds, and volume through `PetInteractionRequest`. Do not add a renderer-to-main parser or public preload method for this main-originated event.

- [ ] Change `showContextMenuListener` to an async listener with one surrounding `try/catch`. Validate the sender before and after awaiting `petPackService.getSnapshot()`, locate `activePetId`, and resolve its current quick dialogues. If the sender/window or active pet becomes stale, abandon the popup without side effects.

- [ ] Build a native “常用对白” submenu immediately after “逗逗它” only when at least one reference resolves. Wrap each label in Chinese quotation marks and preserve configured order. Keep the submenu visible but disabled when `activePet.interactionBubblesEnabled` is false or `companion.systemSuspended` is true. Do not add it to `TrayController`.

```ts
const quickDialogues = activePet ? resolveQuickDialogueCandidates(activePet.dialogueSettings) : [];
const quickDialogueEnabled = Boolean(activePet?.interactionBubblesEnabled) && ordinaryEnabled;

const quickDialogueMenu = quickDialogues.length
  ? [
      {
        label: "常用对白",
        enabled: quickDialogueEnabled,
        submenu: quickDialogues.map((line) => ({
          label: `“${line.text}”`,
          click: () =>
            windowManager.requestPetInteraction({
              type: "quick-dialogue",
              petId: activePet!.id,
              text: line.text,
              ...(activePet!.dialogueSettings.voiceEnabled && line.voiceAssetId
                ? {
                    voiceAssetId: line.voiceAssetId,
                    ...(line.voiceTrimStart !== undefined ? { voiceTrimStart: line.voiceTrimStart } : {}),
                    ...(line.voiceTrimEnd !== undefined ? { voiceTrimEnd: line.voiceTrimEnd } : {}),
                    voiceVolume: activePet!.dialogueSettings.voiceVolume,
                  }
                : {}),
            }),
        })),
      },
    ]
  : [];
```

Construct optional voice properties without explicit `undefined` where practical so the event payload stays narrow. Never derive or send a filesystem path.

- [ ] Preserve existing context-menu behavior and order outside the new submenu: current state, “逗逗它”, manual life controls, work controls, visibility, reminder, settings, active-rest exit, and quit continue unchanged.

- [ ] In `PetShell`, add a `quick-dialogue` branch before pace handling. Require the request pet ID to match the active pet and keep the existing early return for `runtimeActive`. Call the existing exact dialogue display/playback function, but do not call `performCurrentPhotoAction` and do not change life state.

```ts
if (request.type === "quick-dialogue") {
  if (request.petId !== activePet.id) return;
  previewDialogue({
    text: request.text,
    voiceAssetId: request.voiceAssetId,
    voiceTrimStart: request.voiceTrimStart,
    voiceTrimEnd: request.voiceTrimEnd,
    voiceVolume: request.voiceVolume,
  });
  return;
}
```

- [ ] Keep settings preview behavior unchanged: it may still bypass the voice master switch and play the existing nod action. Quick dialogue must obey the master switches because the main process omits voice metadata when voice is disabled and disables the submenu when bubbles are disabled.

- [ ] Run the affected core tests and static integration checks.

```bash
npm exec vitest run src/shared/dialogue-settings.test.ts src/shared/contracts.test.ts
npm run typecheck
npm run lint
```

Expected: shared contracts pass, the native menu compiles against Electron types, and preview/play-now behavior retains exhaustive union handling.

- [ ] Commit Batch 3.

```bash
git add src/shared/contracts.ts src/shared/contracts.test.ts src/main/ipc/register-pet-system-ipc.ts src/renderer/src/windows/PetShell.tsx
git commit -m "feat: play quick dialogues from context menu"
```

---

## Completion Gate

Run each command once after all three batches are implemented. Do not open or inspect the Electron window.

- [ ] Run the complete allowed unit suite.

```bash
npm test
```

- [ ] Run lint.

```bash
npm run lint
```

- [ ] Run the standalone typecheck.

```bash
npm run typecheck
```

- [ ] Run the production build.

```bash
npm run build
```

- [ ] Run the non-visual Electron startup smoke check and confirm exit code 0 without interacting with the UI.

```bash
DEAR_COMPANION_BUILD_SMOKE=1 npm exec -- electron ./out/main/index.js
```

- [ ] Inspect `git status --short`, `git diff --check`, and the milestone diff from the pre-feature base. Confirm there are no alternative lockfiles, generated build outputs, accidental remote assets, or unrelated edits.

- [ ] Perform one comprehensive review of the full milestone diff. Check specification compliance, V7-to-V8 data safety, strict parsing, voice-file privacy, sender validation across the async menu build, stale window/pet handling, request payload narrowing, settings/editor integration, and code quality.

- [ ] Consolidate all review findings into one fix pass. Run the complete unit suite, lint, typecheck, build, and non-visual startup smoke check once more after fixes. Re-review only any unresolved Critical or Important finding.

- [ ] Hand off a concise verification report and mark every UI item below as `等待用户验证`:

  - A companion can select zero through three common dialogue lines across different scenario tabs.
  - The summary, count, selected buttons, full-capacity message, validation messages, and focus behavior are understandable and stable.
  - Adding/removing selections, deleting a custom line, restoring a built-in line, editing text/voice, saving, reopening settings, and switching companions preserve the intended references.
  - The right-click “常用对白” submenu appears after “逗逗它”, uses full quoted text in saved order, and is absent when no line resolves.
  - Bubble-off and system-flow states disable the submenu; voice-off keeps the bubble silent; working, drowsy, and sleeping states remain usable and unchanged.
  - Existing voice volume, trim, delayed start, rapid replacement, missing-file fallback, and bubble timeout behavior remain correct.
  - The system tray contains no common-dialogue entry.
  - Windows and macOS native menu layout, keyboard navigation, pointer navigation, long labels, and disabled appearance are usable.

Do not claim any UI item passed. The user will verify those manually.
