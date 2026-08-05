# Dear Companion Life States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` in one continuous session. Do not use `superpowers:subagent-driven-development`, per-task reviewers, or per-task review loops. Execute and commit the four coherent batches below, then perform one completion gate and one comprehensive milestone review.

**Goal:** Add configurable daily, drowsy, sleeping, and working behavior; state-aware click and petting interactions; built-in dialogue; safe static-photo transitions; and scheduled or manual work mode without expanding into numerical pet raising or an animation editor.

**Architecture:** Keep persistent configuration and authoritative life-state timing in typed shared contracts plus a focused Electron main-process `CompanionStateController`. Keep visual transitions and transient reactions in the pet renderer, while the main process exposes only narrow state, work-schedule, manual-mode, and petting-gesture APIs. Preserve the existing reminder/rest controller as the highest-priority system flow and migrate schema v3 settings atomically to schema v4.

**Tech Stack:** Node.js 24, pnpm 10.33, Electron 43, React 19, TypeScript 5.9, electron-vite, Vite, Vitest, ESLint, electron-builder, and sharp. Do not add a dependency, browser automation, UI test framework, cloud service, AI image feature, telemetry, or updater.

## Global Constraints

- Read `AGENTS.md`, `docs/superpowers/specs/2026-07-31-dear-companion-design.md`, and `docs/superpowers/specs/2026-08-05-companion-life-states-design.md` before implementation.
- Start from the current `master`, use `superpowers:using-git-worktrees`, and create `codex/companion-life-states` in an isolated worktree. Preserve the user's untracked `docs/requirements-drafts/` content.
- If implementation conflicts with either approved specification, stop and revise the source-of-truth specification with the user before coding.
- Keep the product fully offline. Imported photos, head regions, settings, work plans, cursor paths, and audio never leave the machine.
- Do not persist or log global cursor samples. Global cursor sampling may run only during an active rest session or a short petting candidate, never both; rest always wins.
- `nodeIntegration` remains false, `contextIsolation` and renderer sandboxing remain enabled, and every IPC sender and payload remains validated. Do not expose generic IPC, filesystem, shell, command execution, or global pointer APIs.
- “平时陪伴” remains the required photo group. “有点困了” and “睡觉” require both an enabled switch and at least one assigned photo. Work remains available without a work photo by falling back to a daily photo.
- Work and reminder/rest flows prevent random drowsy or sleeping transitions. Work has no automatic cute action; state-aware user clicks and petting remain available unless a reminder/rest system flow is active.
- Interaction copy is built in. Do not add custom copy editing, custom transition editing, custom trigger rules, a timeline, numerical growth, feeding, AI-generated frames, or user-defined timing numbers.
- Automated tests are limited to core state, time, gesture, selection, migration, validation, and recovery logic. Do not add UI, React, snapshot, Playwright, browser, or automated end-to-end tests.
- Never open or control a browser or launch Electron for visual inspection. Settings layout, head-hotspot editing, transitions, bubbles, pointer feel, tray/context menus, and native behavior are `等待用户验证`.
- Execute continuously in four coherent batches with one commit per batch. During coding run only the listed targeted core tests. At the milestone gate run the full allowed unit suite, lint, typecheck, production build, and one non-visual Electron startup smoke check once; then review the full milestone diff once and perform one consolidated fix pass.

---

## Planned File Structure

```text
src/shared/
├── contracts.ts                            # Schema v4, APIs, snapshots, validation, migration
├── companion-state.ts                     # Pure three-layer priority and availability resolution
├── companion-state.test.ts
├── companion-rhythm.ts                    # Pace profiles and random life-state transitions
├── companion-rhythm.test.ts
├── work-schedule-time.ts                   # Local-time active/boundary calculations
├── work-schedule-time.test.ts
├── wake-sequence.ts                        # Multi-click wake progression and expiry
├── wake-sequence.test.ts
├── petting-gesture.ts                      # Pure ellipse/path gesture detector
├── petting-gesture.test.ts
├── head-hotspot.ts                         # Normalized hotspot defaults and viewport geometry
├── head-hotspot.test.ts
├── dialogue-selector.ts                    # Cooldown and recent-line exclusion
└── dialogue-selector.test.ts
src/main/
├── companion/
│   ├── companion-state-controller.ts       # Authoritative timers, work/manual modes, suspension
│   └── companion-state-controller.test.ts
├── interactions/
│   ├── petting-tracker.ts                  # Bounded screen sampling around one validated ellipse
│   └── petting-tracker.test.ts
└── ipc/register-companion-system-ipc.ts    # Work CRUD and narrow runtime/gesture bridge
src/renderer/src/
├── components/
│   ├── LifeStateEditor.tsx                 # Friendly photo-purpose groups and enable switches
│   ├── HeadHotspotEditor.tsx               # Optional draggable/resizable ellipse
│   ├── CompanionPreferences.tsx            # Pace and optional interaction-bubble controls
│   ├── WeekdayPicker.tsx                    # Shared reminder/work weekday presentation
│   ├── WorkScheduleEditor.tsx               # Work period form and weekday controls
│   └── PhotoTransition.tsx                  # Built-in covered photo swap
├── dialogues/
│   ├── dialogue-library.ts                 # Built-in scene/trigger copy pools
│   └── use-dialogue.ts                     # Renderer cooldown/recent-history adapter
└── interactions/use-petting-gesture.ts     # Local hotspot arming and narrow main-process request
```

Existing renderer presentation, IPC wiring, preload, settings, pet-pack persistence, tray/context menu, window broadcasting, and application composition files are modified in place. Do not add tests for thin React presentation or IPC adapters.

---

## Batch 1: Schema v4 and Reusable Core Logic

**Files:**

- Create: `src/shared/companion-state.ts`
- Create: `src/shared/companion-state.test.ts`
- Create: `src/shared/companion-rhythm.ts`
- Create: `src/shared/companion-rhythm.test.ts`
- Create: `src/shared/work-schedule-time.ts`
- Create: `src/shared/work-schedule-time.test.ts`
- Create: `src/shared/wake-sequence.ts`
- Create: `src/shared/wake-sequence.test.ts`
- Create: `src/shared/petting-gesture.ts`
- Create: `src/shared/petting-gesture.test.ts`
- Create: `src/shared/head-hotspot.ts`
- Create: `src/shared/head-hotspot.test.ts`
- Create: `src/shared/dialogue-selector.ts`
- Create: `src/shared/dialogue-selector.test.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/contracts.test.ts`
- Modify: `src/shared/action-fallback.ts`
- Modify: `src/shared/action-fallback.test.ts`
- Modify: `src/shared/pet-state-machine.ts`
- Modify: `src/shared/pet-state-machine.test.ts`
- Modify: `src/main/settings/settings-store.test.ts`
- Modify: `src/main/pets/pet-pack-service.ts`
- Modify: `src/main/pets/pet-pack-service.test.ts`

**Interfaces produced for later batches:**

```ts
export type CompanionPace = 'quiet' | 'natural' | 'lively'
export type CompanionLifeState =
  | 'daily-calm' | 'daily-playful' | 'drowsy' | 'sleeping' | 'working'
export type ManualLifeSelection =
  | 'auto' | 'daily-calm' | 'daily-playful' | 'drowsy' | 'sleeping'

export interface HeadHotspot {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}

export interface ScreenEllipse {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}

export interface OptionalLifeAssets {
  enabled: boolean
  assetIds: readonly string[]
}

export interface PetLifeStates {
  drowsy: OptionalLifeAssets
  sleeping: OptionalLifeAssets
  workingAssetIds: readonly string[]
}

export interface WorkSchedule {
  id: string
  enabled: boolean
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  weekdays: readonly Weekday[]
}

export interface CompanionRuntimeSnapshot {
  lifeState: CompanionLifeState
  manualSelection: ManualLifeSelection
  manualWorkActive: boolean
  scheduledWorkActive: boolean
  systemSuspended: boolean
  nextTransitionAt: number | null
  available: { drowsy: boolean; sleeping: boolean }
}

export interface CompanionSystemSnapshot {
  workSchedules: readonly WorkSchedule[]
  runtime: CompanionRuntimeSnapshot
}

export interface CompanionStateInputs {
  current: CompanionLifeState
  automaticState: CompanionLifeState
  manualSelection: ManualLifeSelection
  manualWorkActive: boolean
  scheduledWorkActive: boolean
  systemSuspended: boolean
  available: { drowsy: boolean; sleeping: boolean }
}

export function resolveCompanionState(inputs: CompanionStateInputs): CompanionLifeState
export function nextRhythmStep(
  input: {
    state: CompanionLifeState
    pace: CompanionPace
    available: { drowsy: boolean; sleeping: boolean }
    now: number
    awakeUntil: number
  },
  random: () => number
): { state: CompanionLifeState; dueAt: number }
export function nextAutoCuteDelay(pace: CompanionPace, random: () => number): number
export function isWorkScheduleActive(
  schedule: WorkSchedule,
  now: number,
  calendar?: LocalCalendarAdapter
): boolean
export function nextWorkBoundary(
  schedules: readonly WorkSchedule[],
  now: number,
  calendar?: LocalCalendarAdapter
): number | null
```

`PetAsset` gains `headHotspot: HeadHotspot | null`. `PetConfig` gains `lifeStates`, `companionPace`, and `interactionBubblesEnabled`. `PetUpdateInput` carries all of those fields plus each asset's normalized hotspot. `AppSettingsV4` adds global `workSchedules` and becomes `AppSettings`; v1–v3 stay parseable only as migration sources.

- [ ] Add schema-v4 types, exact-key parsers, cloned snapshots, `CreateWorkScheduleInput`, `UpdateWorkScheduleInput`, and input parsers. Validate normalized hotspot centers in `[0, 1]`, radii in `[0.03, 0.5]`, non-empty unique weekday sets, valid clock fields, unequal work start/end, known asset IDs, required daily assets for the active pet, and enabled drowsy/sleeping states only when their asset lists are non-empty.
- [ ] Migrate v3 to v4 with `actionSlots.idle` retained as the daily pool, `headHotspot: null` on existing assets, disabled empty drowsy/sleeping groups, an empty work group, `companionPace: 'natural'`, `interactionBubblesEnabled: true`, and global `workSchedules: []`. Update v1/v2 migrations to land directly on the same v4 defaults. Extend settings recovery tests to prove migration writes the old source to backup before atomically replacing the primary.
- [ ] Update new-pet creation, imported-asset creation, update cloning, active-pet validation, and pet-pack tests for v4. Newly imported photos start with `headHotspot: null`; the editor creates the non-AI default only when the user enables hotspot editing.
- [ ] Add `resolveCompanionState(inputs)` in `companion-state.ts` so system suspension freezes the current life state, scheduled or manual work wins over ordinary manual/automatic life states, and unavailable drowsy/sleeping requests fall back to `daily-calm`. The controller owns successful waking and its `awakeUntil` timestamp rather than placing timers inside the pure priority resolver.
- [ ] Add deterministic `nextRhythmStep({ state, pace, available, now, awakeUntil }, random)` and `nextAutoCuteDelay(pace, random)` in `companion-rhythm.ts`. Use initial internal profiles: quiet calm 12–24 minutes, playful 30–60 seconds, auto-cute 8–16 minutes, sleep opportunity 12%; natural calm 6–15 minutes, playful 45–120 seconds, auto-cute 4–10 minutes, sleep opportunity 16%; lively calm 3–8 minutes, playful 60–180 seconds, auto-cute 2–6 minutes, sleep opportunity 10%. All profiles use drowsy 20–45 seconds, sleep 3–8 minutes, and a 20-minute minimum-awake period. `nextRhythmStep` returns `{ state, dueAt }`; the renderer uses `nextAutoCuteDelay` only while the effective life state is daily. Keep these as named constants that can be calibrated after user testing without changing persisted schema.
- [ ] Add `isWorkScheduleActive(schedule, now, calendar)` and `nextWorkBoundary(schedules, now, calendar)` in `work-schedule-time.ts`. Cover ordinary periods, overnight periods where weekdays refer to the start day, overlapping periods, disabled plans, DST gaps/folds, invalid finite times, and the exact end boundary.
- [ ] Add `WakeSequence` with `registerClick(at): 'murmur' | 'stirring' | 'awake'`, a three-click threshold, a four-second expiry, and `reset()`. Non-finite or retrograde timestamps reset safely instead of advancing.
- [ ] Add `PettingGestureDetector` consuming `{ x, y, at }` screen samples plus an ellipse. Ignore movement below 2 DIP, require at least 48 DIP of in/near-region accumulated path and two reversals along the dominant movement axis, accept speeds from 20–1,600 DIP/s, allow at most 350 ms and 40 DIP outside the ellipse, and end every candidate after three seconds. Reject jitter, one-way passes, teleport-like samples, invalid timestamps, and distant leave/re-entry paths. Keep thresholds as named constants for later manual calibration.
- [ ] Add `defaultHeadHotspot(alphaBounds)` and `computeHeadHotspotGeometry(asset, targetHeight, viewport)` in `head-hotspot.ts`. The non-AI default uses normalized `{ centerX: 0.5, centerY: 0.22, radiusX: 0.18, radiusY: 0.18 }` relative to the visible alpha bounds; geometry composes with existing scale, offsets, baseline, and viewport placement.
- [ ] Add `DialogueSelector` with `select({ category, lines, now, random }): string | null`, per-category cooldowns, and exclusion of the last two selected lines. Use a 60-second cooldown for automatic categories and a four-second cooldown for repeat user-interaction categories; distinct sleeping wake stages use distinct categories so the three-click sequence is not suppressed. Empty pools, disabled bubbles, non-finite time, and a pool smaller than recent history must fall back deterministically without throwing.
- [ ] Change `resolveAction(pet, slot, randomIndex, baseAssetId?)` so all missing-action fallbacks animate the caller's current life-state photo. Assigned daily cute/petting assets remain optional; callers in non-daily states do not request incompatible global cute/petting swaps.
- [ ] Keep `pet-state-machine.ts` focused on transient renderer interactions (`idle`, hover, action, drag, angry, hidden) and remove reminder/rest ownership from it; the new companion/system snapshots provide those higher layers. Verify drag/suppressed-click behavior and return-to-underlying-state semantics through the shared tests.
- [ ] Run only the affected core tests and commit as `feat: add companion life-state core model`.

Targeted verification:

```bash
pnpm exec vitest run \
  src/shared/contracts.test.ts \
  src/main/settings/settings-store.test.ts \
  src/main/pets/pet-pack-service.test.ts \
  src/shared/companion-state.test.ts \
  src/shared/companion-rhythm.test.ts \
  src/shared/work-schedule-time.test.ts \
  src/shared/wake-sequence.test.ts \
  src/shared/petting-gesture.test.ts \
  src/shared/head-hotspot.test.ts \
  src/shared/dialogue-selector.test.ts \
  src/shared/action-fallback.test.ts \
  src/shared/pet-state-machine.test.ts
```

---

## Batch 2: Main-Process State Controller, Work Scheduling, and Narrow Gesture Bridge

**Files:**

- Create: `src/main/companion/companion-state-controller.ts`
- Create: `src/main/companion/companion-state-controller.test.ts`
- Create: `src/main/interactions/petting-tracker.ts`
- Create: `src/main/interactions/petting-tracker.test.ts`
- Create: `src/main/ipc/register-companion-system-ipc.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/contracts.test.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/ipc/register-pet-system-ipc.ts`
- Modify: `src/main/windows/window-manager.ts`
- Modify: `src/main/index.ts`

**Controller interface:**

```ts
export class CompanionStateController {
  start(): Promise<void>
  refresh(): Promise<void>
  getSnapshot(): CompanionRuntimeSnapshot
  selectManualState(selection: ManualLifeSelection): void
  setManualWork(active: boolean): void
  wakeFromSleep(): void
  setSystemSuspended(suspended: boolean): void
  handleResume(): void
  dispose(): void
}
```

**Narrow preload API additions:**

```ts
getCompanionSystemSnapshot(): Promise<CompanionSystemSnapshot>
createWorkSchedule(input: CreateWorkScheduleInput): Promise<CompanionSystemSnapshot>
updateWorkSchedule(input: UpdateWorkScheduleInput): Promise<CompanionSystemSnapshot>
deleteWorkSchedule(id: string): Promise<CompanionSystemSnapshot>
setWorkScheduleEnabled(id: string, enabled: boolean): Promise<CompanionSystemSnapshot>
wakeCompanion(): Promise<CompanionSystemSnapshot>
beginPettingGesture(region: ScreenEllipse): void
cancelPettingGesture(): void
onCompanionSystemChanged(listener: (snapshot: CompanionSystemSnapshot) => void): () => void
onPettingGestureDetected(listener: () => void): () => void
```

Declare these methods on `CompanionSystemApi extends PetSystemApi`, then make the existing `RestSystemApi` extend `CompanionSystemApi` so both renderer windows keep one typed preload surface.

- [ ] Implement `CompanionStateController` with one owned wake timer. It loads the active pet and global work schedules, derives available states, selects the next rhythm step, schedules the nearest rhythm or work boundary, and publishes immutable snapshots. `refresh()` cancels stale timers and revalidates manual selection after settings changes.
- [ ] Make work state authoritative whenever a manual-work flag or active work schedule exists. A reminder/rest suspension cancels life timers but preserves manual work so it can resume when the transient system flow ends. `handleResume()` after operating-system sleep clears ordinary manual selection and manual work, re-evaluates scheduled work at the current local time, and otherwise restarts at `daily-calm` as approved. A fresh app process starts with both manual flags clear.
- [ ] `wakeFromSleep()` succeeds only while the effective state is `sleeping` and no work/system flow has superseded it; it changes to `daily-calm`, clears ordinary manual selection, starts the minimum-awake interval, and broadcasts once. Repeated or stale requests are harmless.
- [ ] Implement `PettingTracker` around injected `getCursorScreenPoint`, timer functions, and `PettingGestureDetector`. Sample every 40 ms only while one candidate is armed. One candidate lasts at most three seconds, emits detection once, stops immediately on cancel/dispose/system flow, and never returns or stores raw cursor samples outside the detector.
- [ ] Add validated companion IPC handlers. Work CRUD is settings-window-only, generates safe unique IDs, persists through `SettingsStore.update`, refreshes the controller, and broadcasts one snapshot. Wake and petting requests are pet-window-only. Accept only finite ellipse centers, radii from 6–200 DIP, and centers within the owned pet window bounds expanded by 32 DIP before starting tracking.
- [ ] Add exact IPC channels and preload listener disposal. Never expose `screen.getCursorScreenPoint`; `beginPettingGesture` accepts one bounded ellipse and the only result event is “detected”. Extend contract tests for all new input parsers and snapshots.
- [ ] Extend `WindowManager` with `broadcastCompanionSystemChanged()` and `broadcastPettingGestureDetected()` using the existing owned-window checks. Keep renderer sandbox and navigation policy unchanged.
- [ ] Extend the pet context menu with “自动陪伴”, “安静待一会儿”, “活泼一会儿”, available “有点困了”/“睡一会儿”, and “陪我工作”/“结束工作”. Menu clicks call the controller directly; system-flow state disables ordinary entries. Keep settings, visibility, rest-ending, and quit entries intact. Do not duplicate the full state picker in the tray menu.
- [ ] Compose the controller and tracker in `src/main/index.ts`. Start the controller after settings and windows are ready; refresh it after pet/work settings changes; suspend it and cancel petting whenever a reminder prompt or rest session is active; broadcast companion state beside pet/rest snapshots; include controller/tracker and all IPC listeners in best-effort disposal; forward power-resume to reminder, rest, and companion controllers.
- [ ] Test controller timer replacement, pace transitions, manual one-cycle state, unavailable-state fallback, scheduled/manual work combination, overlapping and overnight boundary refresh, reminder/rest suspension, operating-system resume, wake cooldown, active-pet changes, persisted-visibility pause/resume, and disposal. Test tracker detection, timeout, cancellation, one-shot emission, system cancellation, and no sampling after disposal.
- [ ] Run only the affected core tests and commit as `feat: orchestrate companion states and work schedules`.

Targeted verification:

```bash
pnpm exec vitest run \
  src/main/companion/companion-state-controller.test.ts \
  src/main/interactions/petting-tracker.test.ts \
  src/shared/contracts.test.ts \
  src/shared/companion-state.test.ts \
  src/shared/companion-rhythm.test.ts \
  src/shared/work-schedule-time.test.ts \
  src/shared/petting-gesture.test.ts
```

---

## Batch 3: Friendly Settings for Photo Purposes, Hotspots, Pace, and Work Periods

**Files:**

- Create: `src/renderer/src/components/LifeStateEditor.tsx`
- Create: `src/renderer/src/components/HeadHotspotEditor.tsx`
- Create: `src/renderer/src/components/CompanionPreferences.tsx`
- Create: `src/renderer/src/components/WeekdayPicker.tsx`
- Create: `src/renderer/src/components/WorkScheduleEditor.tsx`
- Modify: `src/renderer/src/components/ActionSlotEditor.tsx`
- Modify: `src/renderer/src/components/PetAssetEditor.tsx`
- Modify: `src/renderer/src/components/ReminderEditor.tsx`
- Modify: `src/renderer/src/windows/SettingsShell.tsx`
- Modify: `src/renderer/src/styles/global.css`

- [ ] Replace the user-facing “空闲” material label with “平时陪伴（至少一张）”. Keep short-action labels “卖萌、摸头、生气、哭闹、休息、闭眼 / 眨眼”, but explain that missing short-action photos animate the current life photo.
- [ ] Add `LifeStateEditor` for “有点困了”, “睡觉”, and optional “陪伴工作” asset assignment. Drowsy/sleep toggles remain disabled until at least one photo is assigned; removing the last photo automatically turns the corresponding draft switch off without deleting any asset or hotspot. Work has no enable switch and clearly explains the daily-photo fallback.
- [ ] Add `HeadHotspotEditor` inside every asset preview. A disabled hotspot shows “设置头部区域”; enabling starts from `defaultHeadHotspot(asset.alphaBounds)`. Render one ellipse over the normalized image, support pointer drag for its center and four resize handles for radii, clamp normalized values through shared helpers, and provide “关闭摸头区域”. Do not infer a face or add a neck baseline.
- [ ] Add `CompanionPreferences` with the three pace values “安静、自然、活泼” and one “显示互动气泡” switch. Do not expose numeric timing fields or built-in dialogue editing.
- [ ] Add `WorkScheduleEditor` with start/end time, weekdays, and enabled state. Permit overnight ranges, reject equal start/end with an understandable inline message, and explain that weekdays refer to the start day. Support multiple saved schedules with add, edit, enable/disable, and delete operations through the companion API.
- [ ] Extract only the existing weekday checkbox presentation needed by both reminder and work editors; do not refactor unrelated settings code. Keep reminder-specific duration, cursor tolerance, editable message, and sound controls unchanged.
- [ ] Extend `SettingsShell` loading/subscriptions/drafts for `CompanionSystemSnapshot`. Save pet purpose groups, state switches, pace, bubble preference, normalization, and hotspots atomically through `updatePet`; keep unsaved edits local. Apply returned snapshots after work mutations and keep the existing generic failure message and old-config preservation behavior.
- [ ] Update settings copy to use “平时陪伴、有点困了、睡觉、陪伴工作”, not internal state names. Preserve the privacy footer. Do not add React/component/snapshot/browser tests and do not claim visual correctness.
- [ ] Commit as `feat: configure companion life states and work periods`. No automated UI verification runs in this batch; defer typecheck/lint/build to the milestone completion gate as required by repository policy.

---

## Batch 4: State-Aware Pet Runtime, Dialogue, Wake-Up, Petting, and Covered Transitions

**Files:**

- Create: `src/renderer/src/components/PhotoTransition.tsx`
- Create: `src/renderer/src/dialogues/dialogue-library.ts`
- Create: `src/renderer/src/dialogues/use-dialogue.ts`
- Create: `src/renderer/src/interactions/use-petting-gesture.ts`
- Modify: `src/renderer/src/interactions/use-pet-interactions.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/styles/global.css`
- Modify: `README.md`

- [ ] Subscribe `PetShell` to `CompanionSystemSnapshot` and resolve the current base asset from the effective life state: daily uses `actionSlots.idle`, drowsy/sleep use their enabled groups, and work uses work assets or the daily fallback. Rest crying/resting assets continue to override through the existing rest snapshot.
- [ ] Replace double-click arbitration with immediate state-aware single clicks while retaining drag-click suppression. Daily calm uses restrained nod/bounce/sway; daily playful may use a covered daily-photo change; drowsy stirs and returns; work gives a restrained response and remains working; reminder/rest ignores ordinary clicks.
- [ ] Use `WakeSequence` only in sleeping state. First click shows a murmur, second intensifies and may show a drowsy photo, and third calls `wakeCompanion()`. Reset on timeout, state change, drag, reminder/rest override, hidden window, or unmount. Do not interpret sleeping click sequences as petting or double-click.
- [ ] Implement `usePettingGesture`: compute the current normalized hotspot ellipse in pet-window screen coordinates, arm the narrow main-process tracker when the local pointer enters, cancel on asset/state/system-flow changes, and react only to `onPettingGestureDetected`. Petting plays a state-specific small animation, optional daily petting asset, heart overlay, and dialogue; work remains work, sleeping uses the sleep-touch response rather than ordinary petting.
- [ ] Add built-in Chinese copy pools keyed by scene and trigger: daily click/cute/petting, playful click, drowsy click/petting/enter, sleeping murmur/stirring/wake/touch, working click/petting/enter, angry, crying, reminder completion, and state transitions. Keep the small-companion voice, avoid claims about real memories, and route selection through `DialogueSelector`. The bubble preference hides only optional interaction copy, never actionable reminder/rest/error UI.
- [ ] Implement `PhotoTransition` as a 350–550 ms covered swap. The outgoing photo settles, a bubble/star/cloud veil covers the subject, the source changes at maximum cover, and the incoming photo rises while the veil disperses. Use clouds for sleep-related transitions and bubbles/stars otherwise. Keep CSS to `transform` and `opacity`; no custom controls, keyframes editor, continuous 60 FPS loop, or extra dependency.
- [ ] Preserve the old photo until the incoming image has loaded. If loading fails, keep the old asset; if it is no longer valid, fall back to the current daily asset. Clear all timers and animation handles on visibility loss, system-flow takeover, active-pet change, or unmount.
- [ ] Keep automatic cute actions only in daily calm/playful and derive their interval from the pace profile. Work, drowsy, sleeping, reminder, and rest never start automatic cute actions. Angry remains the fast-drag reaction and crying remains the rest-movement reaction; both retain generic names and existing audio behavior.
- [ ] Update README usage copy for daily/drowsy/sleep/work photo purposes, pace, work periods, right-click state selection, state-aware clicks, optional head-region petting, and the continued offline/privacy boundary.
- [ ] Commit as `feat: render state-aware companion interactions`. Do not run UI automation or visually inspect Electron; proceed directly to the milestone completion gate.

---

## Milestone Completion Gate and One Comprehensive Review

- [ ] Run the full allowed unit suite once:

```bash
pnpm test
```

- [ ] Run lint, typecheck, and the production build once:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

- [ ] Run exactly one non-visual Electron startup smoke check after the build. Confirm exit code 0 and no immediate startup failure; do not inspect or interact with any window:

```bash
DEAR_COMPANION_BUILD_SMOKE=1 pnpm exec electron out/main/index.js
```

- [ ] Review the complete milestone diff once for both approved specifications, schema-v4 migration/recovery, IPC sender/payload validation, cursor privacy, timer disposal, reminder/work/life-state priority, missing-photo fallbacks, cross-module snapshot consistency, offline behavior, dependency changes, and focused-file code quality.
- [ ] Consolidate every review finding into one fix pass. Commit material corrections as `fix: address companion life-state review findings`.
- [ ] If the fix pass changes files, re-run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the same non-visual startup smoke once. Re-review only unresolved Critical or Important findings; do not start another general review loop.
- [ ] Confirm only intended files are committed and preserve unrelated user files. Report commit IDs, verification evidence, startup-smoke evidence, known limitations, and every UI item below as `等待用户验证`.

## User UI Checklist — All Awaiting User Verification

- [ ] `等待用户验证` — Existing settings migrate without losing pets, reminders, sounds, normalization, or action assignments.
- [ ] `等待用户验证` — “平时陪伴、有点困了、睡觉、陪伴工作” are understandable; optional state switches and missing-photo fallbacks behave as described.
- [ ] `等待用户验证` — Head ellipse can be enabled, moved, resized, disabled, and saved independently for photos with different poses.
- [ ] `等待用户验证` — Slow back-and-forth petting feels natural, tolerates a brief window exit/re-entry, avoids jitter/one-way false positives, and stops during reminders/rest.
- [ ] `等待用户验证` — Quiet/natural/lively pace differences feel noticeable without excessive interruption or CPU usage.
- [ ] `等待用户验证` — Daily calm/playful, drowsy, sleeping, wake cooldown, and three-click wake-up feel natural.
- [ ] `等待用户验证` — Work schedules, overnight periods, overlaps, right-click manual work, and manual ordinary state selection follow the approved priority.
- [ ] `等待用户验证` — A reminder wakes or overrides sleeping/working and correctly restores current scheduled work or daily companionship afterward.
- [ ] `等待用户验证` — Work never auto-cutes but still gives restrained click and petting responses.
- [ ] `等待用户验证` — Bubble/cloud/star transitions mask large pose changes without flicker, blank frames, clipping, or distracting repetition.
- [ ] `等待用户验证` — Built-in bubbles respect cooldown/recent-line rules, the optional bubble switch, and system-bubble exceptions.
- [ ] `等待用户验证` — Fast drag still triggers anger; rest movement still triggers crying without extending the countdown.
- [ ] `等待用户验证` — Transparent window, drag feel, context menu, tray, multi-display placement, imported photos, and Windows/macOS behavior remain correct.
- [ ] `等待用户验证` — Standby CPU and memory remain within the approved soft budget and production emits no network requests.
