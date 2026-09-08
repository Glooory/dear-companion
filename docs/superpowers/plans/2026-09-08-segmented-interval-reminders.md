# Segmented Interval Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and execute this plan continuously in one session. Do not use `superpowers:subagent-driven-development`, per-task reviewers, or review loops. The user explicitly requires the implementation session to leave all changes uncommitted.

**Goal:** Add a user-friendly reminder mode that repeats at one shared interval inside one to three same-day time windows while preserving every existing fixed-time reminder.

**Architecture:** Represent reminder timing as a discriminated union, migrate schema v5/v6 reminders to schema v7 fixed schedules, and keep `ReminderOccurrence` as the normalized runtime boundary consumed by the existing rest flow. Extend the pure local-calendar calculator to generate interval occurrences and teach the scheduler to coalesce later occurrences from the same interval schedule while an earlier one is outstanding. Keep IPC channels, rest sessions, audio, and pet-state integration unchanged; update only the existing reminder editor and list presentation.

**Tech Stack:** npm, Electron 43, React 19, TypeScript 5.9, electron-vite, Vite 7, Vitest 4, ESLint 10, CSS Modules. Add no dependency.

**Spec:** `docs/superpowers/specs/2026-07-31-dear-companion-design.md`, especially sections 8.2, 8.3, 12.1, and 12.3.

## Global Constraints

- Read `AGENTS.md` and the spec before editing. If implementation would contradict the spec, stop and ask the user to revise the spec instead of coding around it.
- Use npm exclusively. Do not introduce pnpm, yarn, bun, or another lockfile.
- Do not create commits, branches, stashes, or pull requests. Leave all implementation changes in the working tree for the user's separate review session.
- Preserve all pre-existing working-tree changes. In particular, `ReminderEditor.tsx` and `SettingsShell.tsx` already contain user changes; modify them incrementally and do not restore or rewrite unrelated hunks.
- Production remains fully offline. Do not add remote assets, services, analytics, telemetry, or network access.
- Keep renderer access behind the existing typed preload API. Do not expose generic IPC, filesystem, shell, path, or command functions.
- Fixed-time reminders must retain their existing local-calendar, snooze, sleep/resume, daylight-saving, deterministic ordering, audio, dialogue, and rest-session behavior.
- Interval reminders allow one to three same-day, non-overlapping windows. Windows may touch but may not overlap; `09:00–12:00` and `12:00–14:00` are valid. Cross-midnight windows are invalid.
- Use one interval for all windows in a schedule. Accept 15–240 minutes in five-minute increments; default a new interval draft to 60 minutes.
- A window fires at its start and then at `start + n * interval` while the result is no later than the end. Do not add a special occurrence at the end when it is not aligned.
- During an active rest session, due reminders remain skipped. For one interval schedule, an active prompt, queued occurrence, or snooze suppresses later occurrences from that same schedule so they never accumulate. Distinct schedules due simultaneously retain deterministic queue ordering.
- Do not add UI unit tests, React tests, snapshots, Playwright, browser tests, or end-to-end tests. Do not open a browser or inspect Electron UI.
- During batches 1–3 run only the listed targeted core tests. Batch 4 has no UI automation. At the completion gate run the full allowed unit suite, lint, typecheck, production build, and one non-visual Electron startup smoke check.
- The separate review session owns the single comprehensive review. The implementation session must report verification evidence and a UI checklist, but must not commit or perform extra review loops.

---

## Planned File Changes

```text
docs/superpowers/plans/2026-09-08-segmented-interval-reminders.md
src/shared/contracts.ts                              # Schema v7 timing union, validation, migration, cloning
src/shared/contracts.test.ts                         # Fixed/interval parsing and v5/v6 migration coverage
src/main/settings/settings-store.test.ts             # On-disk v6-to-v7 migration/recovery proof
src/shared/reminder-time.ts                           # Pure fixed/interval local-calendar occurrence calculation
src/shared/reminder-time.test.ts                      # Window, interval, boundary, weekday, DST coverage
src/main/reminders/reminder-scheduler.ts              # Per-interval-schedule outstanding-occurrence coalescing
src/main/reminders/reminder-scheduler.test.ts         # Prompt/queue/snooze/rest collision coverage
src/renderer/src/components/ReminderEditor.tsx        # Timing-mode form, windows, summary, inline validation
src/renderer/src/components/ReminderEditor.module.css # Stable and responsive timing controls
src/renderer/src/windows/SettingsShell.tsx            # Draft conversion, union payloads, list summaries
src/renderer/src/windows/SettingsShell.module.css     # Multi-window primary line and badge wrapping
```

Do not change preload channels, `register-rest-system-ipc.ts`, the rest controller, audio services, or pet/bubble renderers unless typecheck demonstrates a necessary narrow compatibility edit.

---

## Batch 1: Schema v7, Timing Contracts, and Migration

**Files:**

- Modify: `src/shared/contracts.ts:13-31,197-255,486-501,563-612,846-1018,1133-1135`
- Modify: `src/shared/contracts.test.ts:72-123,353-378,575-627`
- Modify: `src/main/settings/settings-store.test.ts` in the existing migration/recovery describe block

**Produces:**

```ts
export const MAX_REMINDER_WINDOWS = 3;
export const MIN_REMINDER_INTERVAL_MINUTES = 15;
export const MAX_REMINDER_INTERVAL_MINUTES = 240;
export const REMINDER_INTERVAL_STEP_MINUTES = 5;

export interface ReminderTimeWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

interface ReminderCommonFields {
  enabled: boolean;
  weekdays: readonly Weekday[];
  restDurationMinutes: number;
  cursorTolerance: CursorTolerance;
  message: string;
  sounds: ReminderSounds;
  voiceAssetId?: string;
  voiceTrimStart?: number;
  voiceTrimEnd?: number;
}

export interface FixedReminderSchedule extends ReminderCommonFields {
  id: string;
  mode: "fixed";
  hour: number;
  minute: number;
}

export interface IntervalReminderSchedule extends ReminderCommonFields {
  id: string;
  mode: "interval";
  windows: readonly ReminderTimeWindow[];
  intervalMinutes: number;
}

export type ReminderSchedule = FixedReminderSchedule | IntervalReminderSchedule;
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type CreateReminderInput = WithoutId<ReminderSchedule>;
export type UpdateReminderInput = ReminderSchedule;
```

Keep a private legacy reminder type containing `hour` and `minute` without `mode`, and a private schema-v6 shape for migration. Do not redefine the old shape using the new union.

- [ ] Add contract tests that establish the new strict shapes before changing the parser. Use a complete fixed input and interval input, then assert rejection of unknown keys, mixed fixed/interval fields, empty windows, four windows, cross-midnight/equal endpoints, overlapping windows, out-of-range time parts, intervals below 15 or above 240, and intervals not divisible by five.

```ts
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
expect(() =>
  parseCreateReminderInput({
    ...intervalInput,
    windows: [
      { startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
      { startHour: 11, startMinute: 30, endHour: 13, endMinute: 0 },
    ],
  })
).toThrow("Overlapping reminder windows");
```

- [ ] Run the new focused contract test and confirm it fails because schema v7 and interval timing are not implemented.

```bash
npm exec vitest run src/shared/contracts.test.ts
```

- [ ] Replace the single reminder shape with the discriminated union. Factor parsing into `parseReminderCommonFields`, `parseFixedReminderFields`, `parseIntervalReminderFields`, and `parseReminderWindow`. Exact-key validation must depend on `mode`; returned windows must be cloned and sorted by start minutes.

- [ ] Validate windows by converting endpoints to minute-of-day. Require `start < end`; sort by start; reject when `currentStart < previousEnd`; allow equality so adjacent windows are legal. Require an integer interval in the approved range and divisible by five.

```ts
function minutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

for (let index = 1; index < windows.length; index += 1) {
  const previous = windows[index - 1]!;
  const current = windows[index]!;
  if (minutesOfDay(current.startHour, current.startMinute) < minutesOfDay(previous.endHour, previous.endMinute)) {
    throw new Error("Overlapping reminder windows");
  }
}
```

- [ ] Add `AppSettingsV7` and make it the exported `AppSettings`. Set `DEFAULT_APP_SETTINGS.schemaVersion` to `7`. `migrateAppSettings` must parse schema v7 directly and migrate both schema v6 and schema v5 through the legacy parser; every legacy reminder becomes `{ ...common, mode: "fixed", hour, minute }` with the same ID and values.

```ts
function migrateLegacyReminder(reminder: LegacyReminderSchedule): FixedReminderSchedule {
  return {
    ...reminder,
    weekdays: [...reminder.weekdays],
    sounds: { ...reminder.sounds },
    mode: "fixed",
  };
}
```

- [ ] Update `cloneReminder` and every snapshot/parser return path to deep-clone interval windows. A caller mutating an input or returned `windows` array must not mutate stored settings or another snapshot.

- [ ] Extend settings-store tests with a real schema-v6 JSON file containing a fixed reminder. Load it through `SettingsStore`, assert the returned schema is 7 and timing mode is fixed, assert the rewritten primary file is schema 7, and assert the backup preserves the original schema-v6 bytes/shape according to the existing migration safety behavior.

- [ ] Run only the affected core tests and leave the batch uncommitted.

```bash
npm exec vitest run src/shared/contracts.test.ts src/main/settings/settings-store.test.ts
```

Expected: both files pass with no schema-v6 regression and no mutation leak.

---

## Batch 2: Pure Multi-Window Occurrence Calculation

**Files:**

- Modify: `src/shared/reminder-time.ts:48-126`
- Modify: `src/shared/reminder-time.test.ts`

**Consumes:** `ReminderSchedule`, `FixedReminderSchedule`, `IntervalReminderSchedule`, and `ReminderTimeWindow` from Batch 1.

**Produces:** The existing public functions and signatures remain unchanged:

```ts
nextReminderOccurrence(
  schedule: ReminderSchedule,
  afterMs: number,
  calendar?: LocalCalendarAdapter
): ReminderOccurrence | null;

nextEnabledOccurrence(
  schedules: readonly ReminderSchedule[],
  afterMs: number,
  calendar?: LocalCalendarAdapter
): ReminderOccurrence | null;

dueReminderOccurrences(
  schedules: readonly ReminderSchedule[],
  startExclusiveMs: number,
  endInclusiveMs: number,
  excludedOccurrenceIds?: ReadonlySet<string>,
  calendar?: LocalCalendarAdapter
): ReminderOccurrence[];
```

- [ ] Update the existing test schedule factory to return a `mode: "fixed"` schedule. Add a separate `intervalSchedule` factory using `09:00–12:00` and `14:00–18:00` at 60-minute intervals.

- [ ] Add failing tests proving: start is included; aligned end is included; an unaligned end is not synthesized; the second window restarts its interval at its own start; the gap has no occurrence; disabled and weekday-filtered schedules are skipped; windows remain ordered after parsing; fixed and interval schedules sort deterministically together.

```ts
expect(nextReminderOccurrence(intervalSchedule(), Date.UTC(2026, 0, 5, 10, 1), calendar)?.scheduledFor).toBe(
  Date.UTC(2026, 0, 5, 11, 0)
);

expect(nextReminderOccurrence(intervalSchedule(), Date.UTC(2026, 0, 5, 12, 0), calendar)?.scheduledFor).toBe(
  Date.UTC(2026, 0, 5, 14, 0)
);
```

- [ ] Add DST adapter cases for a candidate local time that does not exist and for repeated local time. Missing candidates must be skipped; repeated candidates must use the adapter's earliest matching epoch and the local date/time occurrence key so they cannot fire twice.

- [ ] Refactor candidate construction so `createOccurrence` receives the actual candidate hour and minute instead of reading a fixed schedule's fields. Keep the ID format `<schedule-id>-YYYY-MM-DD-HH-mm` for both modes.

- [ ] Implement interval candidates using local minute-of-day arithmetic, not epoch-duration arithmetic. For each eligible local date, iterate each normalized window from `startMinutes` through `endMinutes` by `intervalMinutes`, convert each candidate through `calendar.fromLocalParts`, skip `null`, and return the first epoch strictly greater than `afterMs`.

```ts
for (let minuteOfDay = start; minuteOfDay <= end; minuteOfDay += schedule.intervalMinutes) {
  const scheduledFor = calendar.fromLocalParts({
    ...date,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  });
  if (scheduledFor !== null && scheduledFor > afterMs) {
    return createOccurrence(schedule, scheduledFor, date, minuteOfDay);
  }
}
```

- [ ] Keep the fixed branch behavior byte-for-byte equivalent where practical. Review `dueReminderOccurrences`' safety guard against the approved maximum density; raise it to a named bound only if the new tests demonstrate truncation within the supported 14-day search horizon.

- [ ] Run only the pure calculation tests and leave the batch uncommitted.

```bash
npm exec vitest run src/shared/reminder-time.test.ts
```

Expected: fixed-time tests and all new interval boundary/DST tests pass.

---

## Batch 3: Scheduler Coalescing and Runtime Compatibility

**Files:**

- Modify: `src/main/reminders/reminder-scheduler.ts:48-74,126-166,212-229`
- Modify: `src/main/reminders/reminder-scheduler.test.ts`

**Consumes:** Interval occurrences from Batch 2. `ReminderOccurrence`, `ReminderPrompt`, `RestSessionController`, audio playback, and IPC interfaces remain unchanged.

- [ ] Update the scheduler test factory to use fixed mode and add an interval factory with short, deterministic windows. Add failing tests for multiple occurrences from one interval schedule, a snoozed occurrence overlapping the next interval, an active prompt overlapping the next interval, active-rest skipping, and distinct schedules due at the same instant.

```ts
expect(prompts).toHaveBeenCalledTimes(1);
expect(prompts.mock.calls[0]![0].scheduledFor).toBe(firstOccurrenceAt);

// Advance through the next interval while the first prompt remains active.
now = secondOccurrenceAt;
timer!();
scheduler.resolvePrompt(prompts.mock.calls[0]![0].occurrenceId);
expect(prompts).toHaveBeenCalledTimes(1);
```

- [ ] Add a private `hasOutstandingOccurrence(scheduleId: string): boolean` that checks the active prompt, queued occurrences, and snooze entries. In `wake`, mark each due occurrence handled first, then skip a later interval occurrence when the same interval schedule already has outstanding work. Do not apply this coalescing across different schedule IDs.

```ts
private hasOutstandingOccurrence(scheduleId: string): boolean {
  return (
    this.activePrompt?.scheduleId === scheduleId ||
    this.queue.some((item) => item.scheduleId === scheduleId) ||
    [...this.snoozes.values()].some((entry) => entry.occurrence.scheduleId === scheduleId)
  );
}
```

- [ ] Ensure due items from the same interval schedule within one scan cannot both enter the queue: once the first is enqueued, `hasOutstandingOccurrence` must suppress the rest. Preserve the existing 60-second lateness cutoff, resume behavior, active-rest skip, and deterministic ordering for distinct schedules.

- [ ] Update `cloneSchedule` to clone `windows` only for interval mode and continue cloning weekdays and sounds for both modes. Update `stripPrompt` only if typecheck requires it; timing configuration does not belong in runtime occurrences.

```ts
function cloneSchedule(schedule: ReminderSchedule): ReminderSchedule {
  const common = { ...schedule, weekdays: [...schedule.weekdays], sounds: { ...schedule.sounds } };
  return schedule.mode === "interval"
    ? { ...common, windows: schedule.windows.map((window) => ({ ...window })) }
    : common;
}
```

- [ ] Run the scheduler and calculation tests and leave the batch uncommitted.

```bash
npm exec vitest run src/main/reminders/reminder-scheduler.test.ts src/shared/reminder-time.test.ts
```

Expected: interval instances never accumulate for one schedule; distinct schedules still queue; existing fixed, snooze, resume, error, and disposal tests pass.

---

## Batch 4: Reminder Editor and Saved-List Presentation

**Files:**

- Modify: `src/renderer/src/components/ReminderEditor.tsx:1-25,176-247,408-425`
- Modify: `src/renderer/src/components/ReminderEditor.module.css:1-180,272-276`
- Modify: `src/renderer/src/windows/SettingsShell.tsx:444-487,1029-1066,1112-1128,1336-1375`
- Modify: `src/renderer/src/windows/SettingsShell.module.css` reminder row and modal rules

**Local draft interface:** Keep both timing-mode drafts in memory so switching modes in one open editor does not discard input. Only the selected branch is persisted.

```ts
interface ReminderWindowDraft {
  key: string;
  startHour: number | null;
  startMinute: number | null;
  endHour: number | null;
  endMinute: number | null;
}

export interface ReminderDraft {
  id?: string;
  mode: "fixed" | "interval";
  hour: number | null;
  minute: number | null;
  windows: ReminderWindowDraft[];
  intervalMinutes: number;
  enabled: boolean;
  weekdays: Weekday[];
  restDurationMinutes: number;
  cursorTolerance: CursorTolerance;
  message: string;
  sounds: ReminderSounds;
  voiceAssetId?: string;
  voiceTrimStart?: number;
  voiceTrimEnd?: number;
}

interface ReminderEditorProps {
  value: ReminderDraft;
  disabled: boolean;
  onChange(value: ReminderDraft): void;
  onSave(): void;
  onValidationError(): void;
  onCancel(): void;
  onDelete?: () => void;
}

function createDraftWindow(window?: ReminderTimeWindow): ReminderWindowDraft;
function formatReminderTiming(reminder: ReminderSchedule): string;
```

- [ ] Replace the existing `ReminderDraft extends Omit<CreateReminderInput, ...>` with the explicit UI draft above. Implement `createDraftWindow(window?)` with renderer-safe `crypto.randomUUID()` keys; keys are never sent through IPC. Implement `formatReminderTiming(reminder)` in `SettingsShell.tsx` to return `HH:mm` for fixed schedules and the `、`-joined `HH:mm–HH:mm` ranges for interval schedules.

- [ ] In `SettingsShell`, make a new draft default to fixed mode with an empty fixed time, one empty interval window, interval 60, every weekday, 10-minute rest, standard tolerance, default copy, and both sounds off. Convert saved fixed and interval schedules into drafts without losing their timing data.

- [ ] Build `CreateReminderInput` with a mode branch. For interval mode, require complete window values, omit draft keys, and rely on the validated parser to normalize ordering. Keep optional voice fields and common values exactly as they are today.

```ts
const timingInput =
  draftValue.mode === "fixed"
    ? { mode: "fixed" as const, hour: draftValue.hour!, minute: draftValue.minute! }
    : {
        mode: "interval" as const,
        windows: draftValue.windows.map(({ startHour, startMinute, endHour, endMinute }) => ({
          startHour: startHour!,
          startMinute: startMinute!,
          endHour: endHour!,
          endMinute: endMinute!,
        })),
        intervalMinutes: draftValue.intervalMinutes,
      };
```

- [ ] Change the editor root to a semantic `<form onSubmit>` and render timing mode as a labelled `<fieldset>` containing real radio inputs styled as a two-option segmented control: “指定时间” and “时段内重复”. Keep labels visible; do not use placeholders as labels.

- [ ] In fixed mode, show only “提醒时间”. In interval mode, show “提醒时段”, one to three rows with labelled start/end time inputs, a stable-width text button “移除”, “添加时段”, and a numeric “提醒间隔” control with minute suffix. Use `min=15`, `max=240`, `step=5`; explain “15–240 分钟，以 5 分钟为单位” as supporting copy rather than a tooltip.

- [ ] Keep at least one window. Reserve the remove-action area even when its control is disabled so rows do not shift. Keep “添加时段” visible but disabled at three windows, with the existing `Tooltip` explaining “每条提醒最多设置 3 个时段”. Do not reorder rows while any input is focused.

- [ ] Add draft validation for missing values, `start >= end`, overlap, invalid interval, empty weekdays, and message length. After an invalid submit, set `aria-invalid` and `aria-describedby` on affected inputs, render one specific inline message in a reserved error slot, invoke `onValidationError()` so `SettingsShell` shows one lightweight warning Toast, and focus the first invalid control. Do not add an error banner.

```ts
const firstInvalid = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
firstInvalid?.focus();
```

- [ ] Render a live sentence below the timing fields using existing weekday terminology: for example, “周一至周五，09:00–12:00 和 14:00–18:00 期间，每 60 分钟提醒一次。” Do not show a misleading summary while required time fields are blank; use the short supporting copy “填写提醒时段后，这里会显示完整安排。”

- [ ] Preserve stable row/error/action heights with dedicated CSS classes. At widths up to 760px, stack window start/end fields while keeping each input label attached; do not rely on color alone for errors or selected mode.

- [ ] Update the modal title to “添加休息提醒” or “编辑休息提醒”; do not append `00:00` or a long multi-window summary to the title.

- [ ] Update reminder list formatting:

```text
Fixed:    10:00                              休息一会儿吧。
Interval: 09:00–12:00、14:00–18:00          休息一会儿吧。
Badges:   工作日 · 每 60 分钟 · 10 分钟休息 · 静音 · 适度移动后提醒
```

Use a timing formatter that branches on `reminder.mode`. Preserve existing weekday, sound, duration, tolerance, edit, enable/disable, voice, delete, and save behavior.

- [ ] Adjust the reminder primary row so a multi-window timing label may wrap without colliding with the message or enable controls. Keep the time label readable at the existing modal/page widths, preserve the current card height rhythm for fixed reminders, and let badges wrap as a group without changing their individual line height.

- [ ] Do not add automated UI tests. Run the final static and automated completion gate below.

---

## Completion Gate

Run each command once after all four batches are implemented. Do not open or inspect the Electron window.

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

- [ ] Run the non-visual Electron startup smoke check and confirm exit code 0 without interacting with UI.

```bash
DEAR_COMPANION_BUILD_SMOKE=1 npm exec -- electron ./out/main/index.js
```

- [ ] Inspect `git status --short` and `git diff --check`. Confirm there are no generated build outputs staged or intentionally added, no alternative lockfiles, and no accidental edits outside the planned files. Do not clean, restore, stage, or commit anything.

- [ ] Hand off a concise verification report and mark every UI item below as `等待用户验证`:

  - Fixed reminder creation/editing remains unchanged.
  - Switching timing modes retains unsaved values during the open editor session.
  - One to three interval windows can be added and removed without row/action/error layout jumps.
  - Missing, reversed, overlapping, and cross-midnight windows receive the correct inline error and focus.
  - The natural-language summary and saved reminder list describe weekdays, windows, and interval accurately.
  - A `09:00–12:00` and `14:00–18:00` schedule at 60 minutes fires at the intended local times and never during the gap.
  - Prompt, snooze, active rest, system sleep, system clock, timezone, and DST behavior match the spec.
  - Reminder audio, voice, rest countdown, cursor tolerance, enable/disable, edit, and delete behavior remain intact.
  - Windows and macOS layout and native time inputs remain usable.

Do not claim any UI item passed. The user will verify those manually.
