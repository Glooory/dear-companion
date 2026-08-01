# Dear Companion Rest System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` in one continuous session. Do not use `superpowers:subagent-driven-development`, per-task reviewers, or per-task review loops. Checkboxes track execution, but implementation is committed in four coherent batches.

**Goal:** Add configurable local reminders, reliable calendar scheduling and snooze, rest sessions with cursor-movement crying, sleep/time recovery, and optional local sounds without weakening the offline and renderer-sandbox boundaries.

**Architecture:** Migrate settings to schema v3 for persistent reminder schedules and audio metadata. Pure shared TypeScript modules own calendar calculations, cursor accumulation, countdown derivation, and the extended pet-state reducer; focused main-process services own scheduling, live rest sessions, local audio assets, Electron power/screen integration, and runtime event broadcasts. React renders reminder/rest state and settings, while all privileged operations stay behind a narrow validated preload API.

**Tech Stack:** Node.js 24, pnpm 10.33, Electron 43, React 19, TypeScript 5.9, electron-vite, Vite, Vitest, ESLint, electron-builder, sharp, Web Audio, and HTML media playback. Do not add a native audio player, browser automation, UI test framework, or network dependency.

## Global Constraints

- Read `AGENTS.md`, `docs/superpowers/specs/2026-07-31-dear-companion-design.md`, and the completed phase-one and phase-two plans before implementation.
- Start from the current clean `master`, create `codex/dear-companion-rest-system`, and use an isolated worktree created through `superpowers:using-git-worktrees`.
- Supported targets remain Windows 10/11 x64 and macOS 13+ on Intel and Apple Silicon; do not add Linux support.
- Production remains fully offline. Do not add cloud services, accounts, telemetry, update checks, remote pages, remote scripts, remote assets, or network-dependent validation.
- First installation and every valid v1/v2 migration have zero reminders. A reminder is persisted only after the user explicitly saves it.
- New reminder drafts may suggest every day, 10 minutes, standard cursor tolerance, and built-in copy, but suggestions must not become saved schedules until the user confirms.
- Reminder sound and crying sound are independently enabled per reminder and default to off. Global selected sound sources default to built-in local tones.
- Autostart remains off and outside this milestone. Do not implement installers, release publishing, code signing, notarization, update delivery, or final performance profiling.
- Rest mode never locks the computer, blocks input, captures keyboard events, resets the timer after movement, or extends the planned end time.
- Renderer windows retain `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and receive no generic IPC, filesystem, shell, path, or command capability.
- Imported audio is private local data. Never persist or log its original path or bytes. Accept only MP3, WAV, or OGG up to 20 MiB and cap each playback request at 30 seconds.
- Automated tests are limited to necessary core logic: schema/migration, reminder calculations, scheduler recovery/deduplication, rest-session transitions, countdowns, cursor thresholds, audio input validation, persistence recovery, and reusable validation helpers.
- Do not add UI, React, snapshot, Playwright, browser, or end-to-end tests. Do not open a browser or launch Electron to inspect or interact with UI.
- Agent completion checks are the full allowed core unit suite, lint, typecheck, production build, and one non-visual Electron startup smoke check. Every UI and operating-system behavior is handed to the user as “等待用户验证”.
- Execute continuously in four coherent coding batches. Run targeted core tests during coding, then one completion gate, one full milestone review, one consolidated fix pass, and only a targeted re-review for unresolved Critical/Important findings.

---

## Planned File Structure

```text
src/
├── main/
│   ├── audio/
│   │   ├── audio-input.ts                    # Signature/size validation for MP3/WAV/OGG
│   │   └── audio-service.ts                  # Safe copies, source resolution, availability
│   ├── ipc/
│   │   └── register-rest-system-ipc.ts       # Validated reminder/rest/audio operations
│   ├── reminders/
│   │   └── reminder-scheduler.ts             # One active wake timer, snooze, recovery
│   ├── rest/
│   │   └── rest-session-controller.ts        # Live session, 250 ms cursor sampling, completion
│   ├── security/app-protocol.ts               # Controlled audio-asset URL branch
│   ├── settings/settings-store.ts             # v1/v2→v3 migration and recovery
│   ├── windows/window-manager.ts              # Runtime broadcasts and temporary reminder visibility
│   └── index.ts                               # Phase-three composition and power events
├── preload/
│   ├── index.ts                               # Narrow RestSystemApi bridge
│   └── index.d.ts
├── renderer/src/
│   ├── audio/use-audio-playback.ts            # Built-in tones/local media, 30-second cap
│   ├── components/AudioSettings.tsx            # Local sound source settings
│   ├── components/ReminderEditor.tsx           # Reminder create/edit form
│   ├── windows/PetShell.tsx                    # Prompt, countdown, crying, completion states
│   ├── windows/SettingsShell.tsx               # Reminder CRUD and service status
│   └── styles/global.css                       # Phase-three presentation only
└── shared/
    ├── contracts.ts                            # AppSettingsV3 and RestSystemApi contracts
    ├── cursor-movement.ts                      # Pure jitter filtering and distance accumulation
    ├── reminder-time.ts                        # Pure local-calendar occurrence calculation
    ├── rest-session.ts                         # Pure session/countdown/state calculations
    ├── pet-state-machine.ts                    # Full priority reducer
    └── ipc-channels.ts                         # Closed phase-three channel constants
```

Core tests live beside the corresponding core module as `*.test.ts`. `ReminderScheduler`, `RestSessionController`, and `AudioService` receive focused unit tests because they own time/recovery, state transitions, and private local input behavior. Thin IPC, Electron/window adapters, React components, hooks, and CSS do not receive automated tests.

---

## Batch 1: Schema v3 and Pure Reminder/Rest Core

**Files:**

- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/contracts.test.ts`
- Modify: `src/main/settings/settings-store.ts`
- Modify: `src/main/settings/settings-store.test.ts`
- Create: `src/shared/reminder-time.ts`
- Create: `src/shared/reminder-time.test.ts`
- Create: `src/shared/rest-session.ts`
- Create: `src/shared/rest-session.test.ts`
- Create: `src/shared/cursor-movement.ts`
- Create: `src/shared/cursor-movement.test.ts`
- Modify: `src/shared/pet-state-machine.ts`
- Modify: `src/shared/pet-state-machine.test.ts`

**Persistent interfaces:**

- `Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6`, using JavaScript local-calendar Sunday through Saturday.
- `CursorTolerance = 'sensitive' | 'standard' | 'relaxed'` maps to 12, 24, and 48 accumulated DIP respectively over a rolling 2,000 ms window; each individual movement of at most 2 DIP is treated as jitter.
- `ReminderSchedule` stores `id`, `enabled`, `hour`, `minute`, unique nonempty `weekdays`, `restDurationMinutes`, `cursorTolerance`, `message`, and `sounds: { reminder: boolean; crying: boolean }`.
- Reminder `hour` is an integer from 0 through 23; `minute` is 0 through 59; duration is an integer from 1 through 120 minutes; trimmed message length is 1 through 200 characters.
- `AudioAssetFormat = 'mp3' | 'wav' | 'ogg'`; `AudioAsset` stores generated `id`, internal `fileName`, `format`, `byteSize`, and `available`.
- `BuiltInSoundId = 'gentle-chime' | 'soft-whimper'`; `AudioSource` is either `{ kind: 'builtin'; id: BuiltInSoundId }` or `{ kind: 'imported'; assetId: string }`.
- `AudioSettingsV3` stores `reminderSource`, `cryingSource`, and `assets`; enabled/disabled behavior remains on each reminder schedule.
- `AppSettingsV3` preserves every phase-two field, sets `schemaVersion: 3`, changes `reminders` to `readonly ReminderSchedule[]`, and changes `audio` to `AudioSettingsV3`.
- `migrateAppSettings` accepts strict v1, v2, or v3. v1/v2 migrate with `reminders: []`, no imported audio, `gentle-chime` reminder source, and `soft-whimper` crying source. Existing v1/v2 boolean sound defaults are not converted into an enabled reminder because no schedule exists.

**Runtime interfaces:**

- `ReminderOccurrence` stores `occurrenceId`, `scheduleId`, `scheduledFor`, and a copy of the schedule fields needed to start or snooze that occurrence.
- A scheduled occurrence ID is deterministic from schedule ID plus local date and configured local time. It prevents the repeated local hour during daylight-saving fallback from firing twice.
- `ReminderPrompt` adds `triggeredAt`; `RestSessionSnapshot` stores `sessionId`, nullable `scheduleId`, `startedAt`, `endsAt`, `state`, nullable `cryingUntil`, and the applicable message/sound options.
- `RestRuntimeSnapshot` stores `serviceStatus: 'healthy' | 'error'`, optional `serviceError`, nullable `prompt`, and nullable `session`. It contains no filesystem path.
- `RestSystemSnapshot` stores cloned persistent `reminders`, cloned `audio` settings, and `runtime: RestRuntimeSnapshot` so both owned renderers receive one serializable source of truth.
- `CreateReminderInput` contains every editable reminder field except `id`; `UpdateReminderInput` contains the same fields plus an existing reminder `id`. IDs are generated only in the main process.
- `AudioSourceInput` contains exactly `reminderSource` and `cryingSource`. `AudioImportResult` contains cloned imported `AudioAsset` records plus indexed failures using `unsupported-type`, `empty-file`, `file-too-large`, `read-failed`, or `copy-failed`.
- `AudioPlaybackRequest` contains generated `requestId`, `cue`, `source`, and `maxDurationMs: 30_000`; imported sources use an asset ID and never a path.
- Snoozed occurrences and live rest sessions are memory-only. App restart retains schedules and audio configuration but deliberately does not recover a prompt, snooze, or interrupted rest session.

**Pure functions:**

- `LocalCalendarAdapter` converts epoch milliseconds to local date parts, adds calendar days, and converts local date/time parts back to the earliest matching epoch or `null` for a nonexistent local time. Production wraps native `Date`; tests inject deterministic daylight-saving gap/fold fixtures.
- `nextReminderOccurrence(schedule, afterMs, calendar = SYSTEM_LOCAL_CALENDAR): ReminderOccurrence | null` searches future local calendar dates and skips disabled schedules and nonexistent spring-forward local times instead of silently shifting them.
- `nextEnabledOccurrence(schedules, afterMs): ReminderOccurrence | null` selects the earliest occurrence with deterministic schedule-ID tie-breaking.
- `dueReminderOccurrences(schedules, startExclusiveMs, endInclusiveMs, excludedOccurrenceIds)` returns every newly due occurrence sorted by timestamp then schedule ID. This lets simultaneous schedules queue deterministically instead of losing all but one.
- `remainingRestMilliseconds(endsAt, now)` clamps to `0..endsAt-startedAt` and derives countdowns from absolute time rather than decrementing counters.
- `transitionRestSession(session, event, now)` handles `resting`, three-second `crying`, `celebrating`, manual end, and completion without changing `endsAt` after movement.
- `CursorMovementAccumulator` accepts screen points with timestamps, ignores jitter, discards segments older than the 2,000 ms rolling window, accumulates Euclidean distance, triggers once at the configured threshold, and resets accumulated movement after crying.
- Extend `PetState` with `reminding`, `resting`, `crying`, and `celebrating`. Use explicit priority `crying 90 > resting 80 > reminding 70 > celebrating 65 > hidden 60 > angry 50 > dragging 40 > performingAction 30 > hovering 20 > idle 10`. System states can temporarily override a hidden preference; after runtime completion the renderer derives `hidden` or `idle` from persisted visibility.

- [ ] Extend contract parsers with exact-field validation, safe unique IDs, duplicate schedule/audio rejection, valid weekday sets, integer time/duration bounds, trimmed messages, valid audio references, and immutable cloned results.
- [ ] Add v1/v2→v3 migration and strict v3 tests, including zero-reminder migration, malformed schedules, duplicate IDs, invalid weekdays, stale audio references, non-finite values, unknown sound sources, and preservation of every phase-two pet field.
- [ ] Extend `SettingsStore` migration/recovery tests to prove v2 backup preservation, atomic v3 replacement, migration write failure safety, recovery from a v2 backup, and unchanged concurrent update serialization.
- [ ] Implement local-calendar occurrence tests for every weekday, same-day future/past time, month/year boundaries, disabled schedules, simultaneous schedules, deterministic ties, spring-forward missing time, fall-back occurrence keys, and no duplicate occurrence after clock repetition.
- [ ] Implement countdown/session tests for absolute `endsAt`, late ticks, three-second crying, manual end, movement not pausing/extending/resetting rest, completion, and resume before/after `endsAt`.
- [ ] Implement cursor tests for first-sample initialization, ≤2 DIP jitter, accumulated path distance, two-second expiry, sensitive/standard/relaxed thresholds, threshold reset, invalid/retrograde samples, and display coordinates containing negative values.
- [ ] Extend pet-state tests for the complete priority order, reminder overriding hidden/daily states, crying overriding resting, lower-priority interaction rejection, celebrating completion, and restoration based on persisted visibility.
- [ ] Run only the affected core tests and commit this batch as `feat: define reminder and rest system core`.

Targeted verification:

```bash
pnpm vitest run src/shared/contracts.test.ts src/main/settings/settings-store.test.ts src/shared/reminder-time.test.ts src/shared/rest-session.test.ts src/shared/cursor-movement.test.ts src/shared/pet-state-machine.test.ts
```

---

## Batch 2: ReminderScheduler, RestSessionController, and AudioService

**Files:**

- Create: `src/main/reminders/reminder-scheduler.ts`
- Create: `src/main/reminders/reminder-scheduler.test.ts`
- Create: `src/main/rest/rest-session-controller.ts`
- Create: `src/main/rest/rest-session-controller.test.ts`
- Create: `src/main/audio/audio-input.ts`
- Create: `src/main/audio/audio-input.test.ts`
- Create: `src/main/audio/audio-service.ts`
- Create: `src/main/audio/audio-service.test.ts`
- Modify: `src/main/security/app-protocol.ts`
- Modify: `src/main/security/app-protocol.test.ts`

**ReminderScheduler interface:**

```ts
interface ReminderScheduler {
  start(): Promise<void>
  refresh(): Promise<void>
  snooze(occurrenceId: string, minutes: 5 | 10 | 15): void
  resolvePrompt(occurrenceId: string): void
  handleResume(now?: number): void
  dispose(): void
}
```

- The scheduler receives injected `now`, timeout creation/cancellation, and callbacks. It owns at most one active wake timeout.
- A wake is capped at 30 seconds. Each wake compares local wall time, timezone offset, and monotonic elapsed time, then recomputes the nearest occurrence. This detects timezone/system-clock changes without adding a second polling loop.
- A normal timer callback may fire an occurrence only once and only when it is due within a 60-second lateness window. `handleResume` never catches up missed reminders; it marks past occurrences handled and schedules the next future one.
- Snooze accepts only an active occurrence and 5, 10, or 15 minutes. It creates one in-memory due time and never mutates the repeating schedule.
- If several schedules become due in one scan, prompts are queued in deterministic order and shown one at a time. Starting or snoozing the current prompt advances to the next queued prompt. A snooze that becomes due while another prompt is active joins the queue once.
- `handleResume` discards occurrences and snoozes that became due during sleep, keeps a prompt that was already visible before sleep, and schedules only future work.
- Occurrences and snoozes that become due during an active rest session are marked handled and skipped because resting has higher priority than reminding; they are not shown after the rest as catch-up prompts.
- Refresh after disabling or deleting a schedule removes that schedule's queued prompt and snooze. If its prompt is currently visible, dismiss it and advance to the next valid queued prompt.
- `refresh` is called after reminder CRUD and atomically replaces scheduling state only after valid settings load. On failure it cancels the wake timer, reports a sanitized local error code without settings content or paths, broadcasts service error once, and never creates duplicate timers.

**RestSessionController interface:**

```ts
interface RestSessionController {
  startFromPrompt(prompt: ReminderPrompt): RestSessionSnapshot
  endManually(): void
  getSnapshot(): RestRuntimeSnapshot
  handleResume(now?: number): void
  dispose(): void
}
```

- Starting records explicit `startedAt` and `endsAt`; it consumes the active prompt and begins one approximately 250 ms cursor sampler using `screen.getCursorScreenPoint()`.
- Cursor samples are passed into `CursorMovementAccumulator`. Threshold crossing enters crying for three seconds, resets accumulated distance, optionally requests crying audio, and keeps the original `endsAt`.
- A session tick derives state from wall time. Resume after `endsAt` completes immediately; resume before `endsAt` continues with the same end time and a fresh cursor baseline.
- Completion enters `celebrating` for two seconds, stops cursor sampling, then clears the live session. Manual end clears immediately with no penalty or persistence.
- `dispose` cancels every owned timer and sampler. No runtime session is written to settings.

**Audio interfaces and storage:**

- `detectAudioFormat(bytes)` recognizes MP3 ID3/frame-sync, RIFF/WAVE, and OggS signatures without trusting extensions or renderer input.
- `validateAudioFileSize` accepts `1..20 * 1024 * 1024` bytes.
- Imported copies live at `<userData>/audio/assets/<generated-id>.<mp3|wav|ogg>` with mode `0o600`, generated IDs, exclusive creation, cleanup on failed settings save, and no persisted source path.
- `AudioService.importAssets(sourcePaths)` returns per-file successes/failures without undoing successful sibling imports.
- `AudioService.updateSources(input)` validates imported ownership or allowed built-in IDs before persisting.
- `AudioService.resolveAssetPath(assetId)` canonicalizes and contains the file inside the generated audio directory.
- `AudioService.requestPlayback(cue, enabled)` emits a typed playback request only when that reminder enables the cue. Imported-source decode/playback failure is reported back and atomically marks the asset unavailable; future requests silently fall back to the corresponding built-in tone.
- Controlled imported audio URLs use `app://renderer/audio-assets/<assetId>`. The application protocol delegates ownership resolution to `AudioService` and returns 403/404 without local paths.

- [ ] Test scheduler single-timer ownership, next occurrence, ordinary due firing, simultaneous prompt ordering, 60-second late suppression, snooze isolation, duplicate prevention, active-rest skipping, disable/delete cleanup, refresh after edits, timezone/clock drift, resume skip, repeated resume, failure state, and idempotent disposal with injected clocks/timers.
- [ ] Test rest controller start/end, exact `endsAt`, 250 ms sampler ownership, jitter and threshold crossing, three-second crying, repeated crying, unchanged end time, completion, resume semantics, audio callbacks, and disposal.
- [ ] Test audio signatures, empty/oversize files, mismatched extensions, safe generated names, successful partial import, original-path omission, cleanup after persistence failure, source validation, unavailable fallback, and canonical path containment.
- [ ] Extend protocol tests for valid audio access, malformed IDs, missing files, traversal, symlink escape, and guesses that do not map to persisted assets.
- [ ] Run only the affected core tests and commit this batch as `feat: schedule reminders and manage rest sessions`.

Targeted verification:

```bash
pnpm vitest run src/main/reminders/reminder-scheduler.test.ts src/main/rest/rest-session-controller.test.ts src/main/audio/audio-input.test.ts src/main/audio/audio-service.test.ts src/main/security/app-protocol.test.ts src/shared/reminder-time.test.ts src/shared/rest-session.test.ts src/shared/cursor-movement.test.ts
```

---

## Batch 3: Validated IPC, Runtime Composition, and Pet Runtime States

**Files:**

- Create: `src/main/ipc/register-rest-system-ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/windows/window-manager.ts`
- Modify: `src/main/tray/tray-controller.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Create: `src/renderer/src/audio/use-audio-playback.ts`
- Modify: `src/renderer/src/interactions/use-pet-interactions.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/styles/global.css`

**RestSystemApi interface:**

```ts
interface RestSystemApi extends PetSystemApi {
  getRestSystemSnapshot(): Promise<RestSystemSnapshot>
  createReminder(input: CreateReminderInput): Promise<RestSystemSnapshot>
  updateReminder(input: UpdateReminderInput): Promise<RestSystemSnapshot>
  deleteReminder(reminderId: string): Promise<RestSystemSnapshot>
  setReminderEnabled(reminderId: string, enabled: boolean): Promise<RestSystemSnapshot>
  retryReminderService(): Promise<RestSystemSnapshot>
  startPromptedRest(occurrenceId: string): Promise<RestSystemSnapshot>
  snoozePrompt(occurrenceId: string, minutes: 5 | 10 | 15): Promise<RestSystemSnapshot>
  endRestSession(): Promise<RestSystemSnapshot>
  chooseAndImportAudio(): Promise<AudioImportResult>
  updateAudioSources(input: AudioSourceInput): Promise<RestSystemSnapshot>
  reportAudioPlaybackFailure(requestId: string, assetId: string | null): void
  onRestSystemChanged(listener: (snapshot: RestSystemSnapshot) => void): () => void
  onAudioPlaybackRequested(listener: (request: AudioPlaybackRequest) => void): () => void
}
```

- Settings-only operations: reminder CRUD, enable/disable, scheduler retry, audio import, and source selection.
- Pet-window-only operations: start/snooze the current prompt, end the current rest, and playback failure reporting.
- Both owned windows may read snapshots and subscribe to sanitized runtime changes.
- Every handler validates the owned sender first, then exact payload fields, identifier ownership, active occurrence/session identity, allowed snooze values, and current state.
- Event listeners expose unsubscribe functions and only the two closed event channels. No raw Electron event, path, or file contents cross preload.

**Runtime composition:**

- Construct `AudioService`, `ReminderScheduler`, and `RestSessionController` after settings load and before registering phase-three IPC.
- Scheduler prompt callback awaits `WindowManager` temporarily showing/creating a ready pet window without changing persisted `petWindow.visible`, then broadcasts the prompt snapshot and requests reminder audio if enabled.
- `WindowManager` remembers whether reminder/rest temporarily overrode a hidden preference. After the prompt/session/celebration ends, it restores the persisted hidden state unless the user explicitly changed visibility meanwhile.
- Subscribe to `powerMonitor.resume` once. Forward resume to scheduler and rest controller; remove the listener during startup failure and quit.
- Reminder CRUD refreshes the scheduler only after settings persistence succeeds. Service failures broadcast a sanitized Chinese status code/message and leave no duplicate timer.
- Tray and pet context menus add `结束本次休息` only while a live session exists. The command calls the same controller path as IPC.

**Renderer behavior:**

- `PetShell` treats runtime state as authoritative over local daily interactions. `reminding`, `resting`, `crying`, and `celebrating` prevent click, hover, drag, and idle/blink actions until the system state ends.
- Reminder and rest controls remain usable when no active pet is configured: render the bubble/countdown with the existing safe empty placeholder rather than dropping the runtime event.
- Reminder prompt displays message plus `立即开始`, `延后 5 分钟`, `延后 10 分钟`, and `延后 15 分钟`.
- Rest display uses the configured resting action/fallback and derives visible remaining time from `endsAt - Date.now()`; a renderer interval only refreshes display and never owns completion.
- Crying uses the existing crying action fallback, tears, and message for about three seconds. Completion uses a short celebration transform/opacity action.
- `useAudioPlayback` creates built-in tones locally with Web Audio or plays controlled imported URLs through `Audio`. It stops at 30 seconds and cancels replaced requests. On imported decode/playback failure it plays the corresponding built-in tone once without an error popup, then reports the asset so settings can mark it unavailable; no browser API is exposed through preload.
- Hidden/invisible renderers stop presentation-only intervals and audio. Runtime authority remains in the main process.

- [ ] Add closed channels and narrow preload wrappers/subscriptions matching `RestSystemApi`; validate callback cleanup and never expose generic capabilities.
- [ ] Implement phase-three IPC wiring without automated IPC tests, following the existing owned-window validation and cleanup pattern.
- [ ] Compose all services, power-resume handling, broadcasts, temporary visibility, tray commands, and cleanup in small focused main-process methods.
- [ ] Extend the shared state reducer and interaction hook so system states block daily input and cleanly restore hidden/idle behavior afterward.
- [ ] Render reminder, countdown, crying, and celebration states with existing pet action fallbacks and transform/opacity-only animation.
- [ ] Implement renderer audio playback coordination and failure reporting. Keep all audio disabled unless the active reminder explicitly enables that cue.
- [ ] Run the relevant core state/service tests plus typecheck, then commit this batch as `feat: integrate reminder and rest runtime`.

Targeted verification:

```bash
pnpm vitest run src/shared/pet-state-machine.test.ts src/main/reminders/reminder-scheduler.test.ts src/main/rest/rest-session-controller.test.ts src/main/audio/audio-service.test.ts
pnpm typecheck
```

---

## Batch 4: Reminder and Audio Settings Workflow

**Files:**

- Create: `src/renderer/src/components/ReminderEditor.tsx`
- Create: `src/renderer/src/components/AudioSettings.tsx`
- Modify: `src/renderer/src/windows/SettingsShell.tsx`
- Modify: `src/renderer/src/styles/global.css`
- Modify: `docs/development.md`

**Settings behavior:**

- The initial reminder section is an empty state and does not call a mutation until the user explicitly saves a new reminder.
- Clicking `添加提醒` creates only a local draft with no confirmed time, all seven weekdays, 10-minute duration, standard tolerance, built-in suggested message, and both sounds disabled. Save remains disabled until the user explicitly selects a time.
- The editor supports time, weekdays, duration, sensitive/standard/relaxed tolerance, 1–200 character message, independent reminder/crying sound toggles, enabled state, save, cancel, and delete.
- Newly saved reminders are enabled. Editing, enable/disable, and deletion always use the committed snapshot returned by main IPC rather than optimistic persisted state.
- Audio settings allow built-in source selection and native-picker import for MP3/WAV/OGG. Show per-file import results for unsupported signature, empty/read failure, over 20 MiB, and copy failure. A file with a valid container signature but failed media decoding is marked unavailable only after the renderer reports playback failure.
- An imported source marked unavailable remains visible with an error label and automatically falls back to the matching built-in tone until the user changes or reimports it.
- Preserve all phase-two pet creation/import/normalization/action UI and foundation visibility behavior.
- UI code receives no unit tests. Agent does not inspect the UI or open a browser/Electron window for visual validation.

- [ ] Add the empty reminder list, draft editor, explicit save/cancel, enable/disable, edit, and delete flows using only `RestSystemApi`.
- [ ] Add audio source controls, native import results, per-reminder sound toggles, unavailable status, and clear Chinese error messages.
- [ ] Surface scheduler service errors with a retry action that calls the settings-only `retryReminderService`; the main process invokes the scheduler's idempotent `refresh` rather than exposing timer control.
- [ ] Update `docs/development.md` with schema v3, reminder scheduling semantics, non-persistent snooze/session behavior, audio storage/limits, phase-three exclusions, non-visual agent verification, and a separate user UI checklist.
- [ ] Run typecheck and the relevant contract parser tests, then commit this batch as `feat: add reminder and audio settings`.

Targeted verification:

```bash
pnpm vitest run src/shared/contracts.test.ts
pnpm typecheck
```

---

## Phase-Three Completion Gate

- [ ] Run the full allowed core suite once: `pnpm test`.
- [ ] Run static checks once: `pnpm lint` and `pnpm typecheck`.
- [ ] Run the production build once: `pnpm build`.
- [ ] Run exactly one non-visual startup smoke check after the build: `DEAR_COMPANION_BUILD_SMOKE=1 pnpm exec electron .`. Confirm exit code 0 and no immediate startup failure; do not inspect or interact with Electron UI.
- [ ] Do not open an in-app/system browser, local browser preview, or Electron window for UI validation.
- [ ] Prepare a concise user checklist marked entirely `等待用户验证`: zero-reminder first run; reminder CRUD and enable/disable; local-time trigger; 5/10/15-minute snooze; countdown; sensitive/standard/relaxed movement; three-second crying without timer extension; manual end; sleep/resume; mapped/fallback rest/cry visuals; imported/built-in audio; independent sound toggles; audio failure fallback; hidden-pet temporary reminder visibility; tray/context-menu end action; Windows/macOS behavior; production offline behavior.
- [ ] Inspect `git diff master...HEAD` exactly once for design-spec coverage, timer ownership, wall-clock/DST/resume semantics, persistence/migration safety, cursor thresholds, audio privacy/path authorization, IPC sender validation, runtime cleanup, and code quality.
- [ ] Consolidate all review findings into one fix pass and one coherent fix commit if changes are needed.
- [ ] If the consolidated fix pass changes files, re-run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the non-visual startup smoke once. Re-review only unresolved Critical or Important findings.
- [ ] Confirm `git status --short` is clean, leave `codex/dear-companion-rest-system` unmerged, preserve its worktree, and report commits, automated verification evidence, startup-smoke evidence, known limitations, and the user UI checklist.

## Explicit Phase-Three Exclusions

- No autostart implementation or settings mutation beyond preserving the existing default-off field.
- No installer/release workflow, final icons, code signing, notarization, GitHub Release, or automatic update behavior.
- No cloud sync, accounts, telemetry, remote sounds, analytics, statistics, streaks, penalties, or reminder history.
- No persistent recovery of an interrupted rest session, active prompt, or snoozed occurrence after process exit.
- No arbitrary numeric cursor threshold, arbitrary snooze duration, OS input blocking, screen locking, or full-screen rest overlay.
- No UI automation, browser validation, screenshots used as evidence, React tests, or agent-performed UI acceptance.
