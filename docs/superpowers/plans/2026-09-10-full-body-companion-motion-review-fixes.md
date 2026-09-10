# Full-Body Companion Motion Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan in one continuous single-agent session. Repository policy forbids subagents, per-task reviewers, granular review loops, UI automation, and UI tests. Do not create commits for this work because the current workspace changes must remain uncommitted.

**Goal:** Fix every actionable finding from the comprehensive review of the uncommitted full-body companion motion implementation while preserving the approved full-body-photo behavior, narrow IPC boundary, photo crossfade, and reduced-motion semantics.

**Architecture:** Keep the existing attention → action → photo plus overlay layering. Move personality-event and autonomous-step timing decisions into shared deterministic helpers, drive CSS duration from the shared motion registry, use a dedicated visible-person hit target, and explicitly gate renderer motion by runtime/page visibility. Restart only the action-layer animation for repeated runs so `PhotoTransition` remains mounted.

**Tech Stack:** Electron 43, React 19, TypeScript 5.9, CSS Modules, Vitest, npm

**Specs:**

- `docs/superpowers/specs/2026-09-10-full-body-companion-motion-design.md`
- `docs/superpowers/specs/2026-07-31-dear-companion-design.md`

**Source review:** The seven findings reported on 2026-09-10: pace-specific personality selection, runtime hover suppression, visible-person hit testing, synchronized two-step approach timing, repeated-motion replay, page-hidden runtime animation cancellation, and canonical CSS/JS duration ownership.

## Global Constraints

- Read both specifications and the current complete diff before editing.
- Treat each imported image as one indivisible full-body photograph. Do not introduce body-part layers, skeletal control, 3D transforms, or non-proportional deformation beyond the approved sub-1% vertical/uniform scaling.
- Keep all body transforms foot-anchored and keep overlay transforms independent from the photograph.
- Keep production behavior fully offline and do not add dependencies, telemetry, remote assets, persistence fields, or broader renderer privileges.
- Preserve `PettingGestureResult = { leanDirection: -1 | 0 | 1 }`; do not expose, persist, or log cursor traces.
- Do not modify or replace unrelated user changes in the dirty workspace.
- Do not add UI unit tests, React component tests, snapshots, Playwright tests, browser tests, or E2E tests.
- Do not open or control a browser and do not perform or claim visual UI verification.
- During implementation, run only targeted shared/core tests. At the completion gate, run the full allowed suite, lint, typecheck, production build, and non-visual Electron smoke check once.
- Perform one comprehensive diff review after the completion gate, apply one consolidated fix pass if needed, then run the final verification gate once.
- Do not commit any batch or final result.

---

## File Structure

**Modify**

- `src/shared/companion-motion.ts` — make pace-specific personality pools authoritative; expose deterministic photo-swap eligibility/probability; retain canonical motion durations.
- `src/shared/companion-motion.test.ts` — cover quiet/playful-state precedence, photo-swap eligibility, reduced-motion duration mapping, and non-repetition.
- `src/shared/companion-rhythm.ts` — return an explicit two-step approach timeline whose nudge times, total duration, and final hold are internally consistent.
- `src/shared/companion-rhythm.test.ts` — cover step direction, distance, timing, final hold, and non-finite randomness.
- `src/renderer/src/components/PhotoTransition.tsx` — stop making the full source-image rectangle the pointer hit target; keep transition state mounted and preload-before-crossfade behavior unchanged.
- `src/renderer/src/components/PhotoTransition.module.css` — make photo frames non-interactive while preserving crossfade duration behavior.
- `src/renderer/src/interactions/use-pet-interactions.ts` — suppress hover during system flows and use one explicit visible-person predicate instead of DOM frame attributes.
- `src/renderer/src/windows/PetShell.tsx` — render the alpha-bounds hit target, integrate pace-safe photo swaps, run the shared approach timeline, provide canonical CSS duration, restart repeated action animations, and force neutral motion while the page is hidden.
- `src/renderer/src/windows/PetShell.module.css` — style the hit target, consume `--motion-duration`, align two-step keyframes with the shared timeline, and ensure hidden pages do not animate overlays or runtime motions.

**Do not modify unless required by a compile error introduced by the above changes**

- Main-process petting tracker, IPC channel registration, window-manager validation, preload API, and shared contracts. The review found their current privacy and type boundaries correct.
- `PhotoTransition` keying. It must remain keyed only by the active pet so life-state and action-photo changes crossfade without component remounts.

---

## Batch 1: Correct Shared Personality and Autonomous Timing Models

### Task 1: Make pace authoritative for personality events

**Files:**

- Modify: `src/shared/companion-motion.ts`
- Modify: `src/shared/companion-motion.test.ts`

**Interfaces:**

- Preserve:

```ts
selectPersonalityMotion(
  lifeState: CompanionLifeState,
  pace: CompanionPace,
  previous: MotionTemplate | null,
  random: () => number
): MotionTemplate
```

- Add:

```ts
shouldSwapPersonalityPhoto(
  pace: CompanionPace,
  hasAlternativePhoto: boolean,
  random: () => number
): boolean
```

- Use conservative fixed probabilities: quiet `0`, natural `0.12`, lively `0.18`. Clamp non-finite/out-of-range random values through the module's existing `finiteRandom` convention.
- Personality motion pools must be selected by `pace`, not overridden by `daily-playful`:
  - quiet: `observe-lean`, `weight-shift`
  - natural: `observe-lean`, `toe-rise`, `playful-hop`
  - lively: `playful-hop`, `playful-double-hop`, `observe-lean`, `toe-rise`
- `lifeState` remains in the signature. If the selector is called outside `daily-calm` or `daily-playful`, return `gentle-breathe`; never select a playful personality event for `working`, `drowsy`, or `sleeping`.

- [ ] Replace the existing test that expects quiet + `daily-playful` to hop with assertions that pace remains authoritative.

```ts
expect(selectPersonalityMotion("daily-playful", "quiet", null, () => 0)).toBe("observe-lean");
expect(selectPersonalityMotion("daily-calm", "natural", null, () => 0)).toBe("observe-lean");
expect(selectPersonalityMotion("daily-calm", "lively", null, () => 0)).toBe("playful-hop");
```

- [ ] Add deterministic photo-swap tests.

```ts
expect(shouldSwapPersonalityPhoto("quiet", true, () => 0)).toBe(false);
expect(shouldSwapPersonalityPhoto("natural", true, () => 0.11)).toBe(true);
expect(shouldSwapPersonalityPhoto("natural", true, () => 0.12)).toBe(false);
expect(shouldSwapPersonalityPhoto("lively", true, () => 0.17)).toBe(true);
expect(shouldSwapPersonalityPhoto("lively", false, () => 0)).toBe(false);
expect(shouldSwapPersonalityPhoto("lively", true, () => Number.NaN)).toBe(true);
```

- [ ] Run the focused test before implementation and confirm the changed expectations fail.

Run: `npm test -- src/shared/companion-motion.test.ts`

Expected: FAIL because quiet + `daily-playful` still selects `playful-hop` and the new helper is absent.

- [ ] Implement the pace-first pools and `shouldSwapPersonalityPhoto` with no new dependency or configuration field.

- [ ] Run the focused test.

Run: `npm test -- src/shared/companion-motion.test.ts`

Expected: PASS.

### Task 2: Represent two-step approach timing as core data

**Files:**

- Modify: `src/shared/companion-rhythm.ts`
- Modify: `src/shared/companion-rhythm.test.ts`
- Modify: `src/shared/companion-motion.ts`
- Modify: `src/shared/companion-motion.test.ts`

**Interfaces:**

- Replace the array-only approach result with:

```ts
export interface ApproachStep {
  deltaX: number;
  atMs: number;
}

export interface ApproachPlan {
  durationMs: number;
  steps: readonly [ApproachStep, ApproachStep];
}

export const APPROACH_DURATION_MS = 800;
export const APPROACH_STEP_TIMES_MS = [260, 580] as const;

export function createApproachPlan(
  random: () => number,
  initialDirection?: -1 | 1
): ApproachPlan;
```

- Preserve two same-direction integer displacements of 6–9 DIP each and 12–18 DIP total.
- The second nudge occurs at 580 ms; the action ends at 800 ms, leaving the specified 220 ms final hold.
- Change `MOTION_DEFINITIONS["two-step-approach"].durationMs` to `APPROACH_DURATION_MS`. Importing the constant from `companion-rhythm.ts` is acceptable because `companion-rhythm.ts` does not import `companion-motion.ts`; do not create a circular dependency.
- Remove the old `createApproachSteps` export after all consumers and tests move to `createApproachPlan`.

- [ ] Replace the current distance-only tests with timeline assertions.

```ts
expect(createApproachPlan(() => 0, -1)).toEqual({
  durationMs: 800,
  steps: [
    { deltaX: -6, atMs: 260 },
    { deltaX: -6, atMs: 580 },
  ],
});

const maximum = createApproachPlan(() => 1, 1);
expect(maximum.steps.map((step) => step.deltaX)).toEqual([9, 9]);
expect(maximum.durationMs - maximum.steps[1].atMs).toBe(220);
```

- [ ] Retain a loop test proving all generated plans contain exactly two same-direction steps totaling 12–18 DIP, and add a non-finite-random case.

```ts
expect(createApproachPlan(() => Number.NaN, 1)).toEqual({
  durationMs: 800,
  steps: [
    { deltaX: 6, atMs: 260 },
    { deltaX: 6, atMs: 580 },
  ],
});
```

- [ ] Add a registry consistency assertion.

```ts
expect(resolveMotion("two-step-approach", false).durationMs).toBe(APPROACH_DURATION_MS);
```

- [ ] Run the focused tests and confirm failure before implementation.

Run: `npm test -- src/shared/companion-rhythm.test.ts src/shared/companion-motion.test.ts`

Expected: FAIL on the new interface and 800 ms duration.

- [ ] Implement the plan object, registry duration, and exports.

- [ ] Run the focused tests.

Run: `npm test -- src/shared/companion-rhythm.test.ts src/shared/companion-motion.test.ts`

Expected: PASS.

---

## Batch 2: Fix Visible-Person Hit Testing and System-Flow Suppression

### Task 3: Replace full-frame pointer targets with an alpha-bounds hit target

**Files:**

- Modify: `src/renderer/src/components/PhotoTransition.tsx`
- Modify: `src/renderer/src/components/PhotoTransition.module.css`
- Modify: `src/renderer/src/interactions/use-pet-interactions.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/windows/PetShell.module.css`

**Interfaces:**

- `PhotoTransition` continues to render the outgoing and current photograph, preload new photos, keep the old photo until load succeeds, and invoke completion after 400 ms or 120 ms under reduced motion.
- Remove `data-pet-interactive` and `data-pet-drag` from both full-size photo frames. Set the photo frames to `pointer-events: none`.
- Render one sibling hit target inside the action layer using the current displayed asset's computed alpha-bounds rectangle:

```tsx
<div
  className={styles.interactionHitbox}
  data-pet-interactive="true"
  data-pet-drag="true"
  style={{
    left: displayedPersonRect.x,
    top: displayedPersonRect.y,
    width: displayedPersonRect.width,
    height: displayedPersonRect.height,
  }}
/>
```

- Keep the hit target inside the same attention/action transforms as the photograph, above photo frames and below the pointer-inert overlay.
- Do not attach new global listeners or expose new Electron APIs.

- [ ] Update `PhotoTransition` markup and CSS so source-image transparent margins cannot become pointer targets.

- [ ] Add `.interactionHitbox` with absolute positioning, transparent background, `pointer-events: auto`, and a z-index between the photo and overlay. Do not add visible debug styling.

- [ ] In `usePetInteractions`, continue using `closest('[data-pet-drag="true"]')`; after the markup change this predicate now means the visible-person alpha rectangle rather than the source frame.

- [ ] Confirm the window mouse-ignore logic in `PetShell` uses the same `data-pet-interactive` hit target for initial hover, mouse movement, drag release, and context menu.

- [ ] Run static checks for this renderer-only integration.

Run: `npm run lint && npm run typecheck`

Expected: PASS. Do not perform visual verification.

### Task 4: Prevent system flows and hidden pages from reactivating attention or runtime motion

**Files:**

- Modify: `src/renderer/src/interactions/use-pet-interactions.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/windows/PetShell.module.css`

**Required behavior:**

- `reminding`, `resting`, `crying`, and `celebrating` must keep attention neutral even if pointer events arrive after the runtime-state effect runs.
- When `document.visibilityState !== "visible"`, the final motion template must be `still`, hearts/tears must not render, attention must be neutral, and pending ordinary action/nudge timers must remain cleared.
- Returning to a visible page may resume the applicable runtime behavior from a neutral start; it must not resume midway through an old CSS animation.

- [ ] Add `runtimeState` to the hover rejection condition in `usePetInteractions.onPointerMove`.

```ts
if (!isOverPet || !hoverEnabled || reducedMotion || runtimeState || pettingCandidateActive) {
  resetAttention(isOverPet ? 0 : 80);
  // existing hover-end transition
  return;
}
```

- [ ] Pass `hoverEnabled: pageVisible && !runtimeActive && !actionState && !presenceTransitionActive` from `PetShell`.

- [ ] Gate the final requested template and overlays by page visibility.

```ts
const requestedTemplate: MotionTemplate = !pageVisible
  ? "still"
  : runtimeState === "crying"
    ? "crying-tremble"
    : runtimeState === "celebrating"
      ? "playful-double-hop"
      : resolvedAction?.template ?? (runtimeActive ? "gentle-breathe" : "still");
```

- [ ] Render hearts and tears only when `pageVisible` is true. Keep the existing effect that clears action timers and ordinary action state when the page becomes hidden.

- [ ] Ensure page visibility is part of the action-animation restart dependency introduced in Batch 3, so re-showing starts runtime motion at frame zero.

- [ ] Run static checks.

Run: `npm run lint && npm run typecheck`

Expected: PASS. Runtime appearance remains awaiting user verification.

---

## Batch 3: Make Motion Duration Canonical and Repeated Actions Replayable

### Task 5: Drive every action-layer duration from the shared registry

**Files:**

- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/windows/PetShell.module.css`

**Interfaces:**

- Resolve the final motion once during render:

```ts
const resolvedMotion = resolveMotion(requestedTemplate, reducedMotion);
const template = resolvedMotion.template;
```

- Add `--motion-duration: ${resolvedMotion.durationMs}ms` to `actionStyle`.
- CSS owns animation name, easing, fill mode, and iteration count only. CSS must not repeat numeric action durations from `MOTION_DEFINITIONS`.
- Photo crossfade durations remain owned by `PhotoTransition`; presence and overlay animations remain separate because they are not body-action registry entries.

- [ ] Rewrite each action selector from a full shorthand with a hard-coded duration to name/easing/fill declarations plus the common duration.

```css
.actionLayer[data-motion]:not([data-motion="still"]):not([data-motion="asset-swap"]) {
  animation-duration: var(--motion-duration, 0ms);
  animation-fill-mode: both;
}

.actionLayer[data-motion="gentle-breathe"] {
  animation-name: gentleBreathe;
  animation-timing-function: ease-in-out;
}
```

- [ ] Preserve special runtime iteration semantics without changing duration ownership:
  - crying: `animation-iteration-count: infinite`
  - celebrating double-hop: `animation-iteration-count: 2`
  - ordinary actions: one iteration

- [ ] Update `observeLean` percentages so the two rise peaks align with the approach plan's nudge times: 32.5% for 260/800 ms and 72.5% for 580/800 ms. Keep the action foot-anchored and neutral at 0%/100%.

- [ ] Search for stale hard-coded body-action durations after the rewrite.

Run:

```bash
rg -n 'animation: (gentleBreathe|weightShift|toeRise|observeLean|bodyStep|softLift|calmLean|playfulHop|playfulDoubleHop|drowsyDip|pettingLean|settle|angryShake|cryingTremble|wakeSway|reducedPulse)' src/renderer/src/windows/PetShell.module.css
```

Expected: no full animation shorthand containing a numeric duration for registry-backed body actions.

- [ ] Run static checks.

Run: `npm run lint && npm run typecheck`

Expected: PASS.

### Task 6: Restart repeated action-layer animations without remounting photos

**Files:**

- Modify: `src/renderer/src/windows/PetShell.tsx`

**Interfaces and constraints:**

- Add `motionRunId` state or ref-backed revision and increment it every time `performResolvedAction` starts a body action, including reduced-motion fallbacks.
- Add an `actionLayerRef` to the existing action-layer element.
- Use `useLayoutEffect` keyed by `motionRunId`, `template`, and `pageVisible` to restart animations attached directly to the action layer through the Web Animations API:

```ts
useLayoutEffect(() => {
  const node = actionLayerRef.current;
  if (!node || template === "still" || template === "asset-swap" || !pageVisible) return;
  for (const animation of node.getAnimations()) {
    animation.cancel();
    animation.play();
  }
}, [motionRunId, pageVisible, template]);
```

- `Element.getAnimations()` must be called on the action layer without subtree traversal, so photo crossfade animations are not cancelled or restarted.
- Do not key or remount `.actionLayer`, `PhotoTransition`, or any ancestor of `PhotoTransition` to restart motion.
- Runtime-state and page-visibility changes must also advance or otherwise trigger a clean restart when the resulting runtime template becomes active.

- [ ] Add `useLayoutEffect` to the React import and add the action-layer ref/revision.

- [ ] Increment the run revision only after old action timers are cleared and before/with the new action state. Cancellation to `still` does not need to increment it.

- [ ] Ensure repeated petting, rapid click replacement, and multiple source templates resolving to `reduced-pulse` all trigger a new action-layer run.

- [ ] Keep heart replay independent: add `heartRunId`, increment it in every successful `handlePettingDetected` call, and key only `.heartWrap` by that id so a second successful petting gesture restarts the heart animation. Do not key or remount the photo, action layer, or attention layer.

- [ ] Run static checks.

Run: `npm run lint && npm run typecheck`

Expected: PASS. Actual replay appearance remains awaiting user verification.

### Task 7: Integrate the shared approach plan and pace-safe photo switching

**Files:**

- Modify: `src/renderer/src/windows/PetShell.tsx`

- [ ] Replace `createApproachSteps` with `createApproachPlan`.

```ts
const plan = createApproachPlan(Math.random, resolvedDirection);
performCurrentPhotoAction("two-step-approach", resolvedDirection);
for (const step of plan.steps) {
  actionTimers.current.push(
    setTimeout(() => api.nudgePetBy(step.deltaX, 0), step.atMs)
  );
}
```

- [ ] Assert through code structure that the registry and plan duration are the same; do not add a second renderer duration constant.

- [ ] Replace the unconditional `Math.random() < 0.35` branch with `shouldSwapPersonalityPhoto(activePet.companionPace, activePet.actionSlots.idle.length > 1, Math.random)`.

- [ ] Preserve action cancellation: all scheduled approach nudge timers must remain stored in `actionTimers.current`, so drag, runtime flow, life-state change, hidden page, reduced-motion change, or pet change clears them.

- [ ] Run the targeted core tests and static checks.

Run:

```bash
npm test -- src/shared/companion-motion.test.ts src/shared/companion-rhythm.test.ts
npm run lint
npm run typecheck
```

Expected: PASS.

---

## Batch 4: Completion Gate, Comprehensive Review, and One Fix Pass

### Task 8: Run the allowed completion verification once

- [ ] Run exactly these commands in order:

```bash
npm test
npm run lint
npm run typecheck
npm run build
DEAR_COMPANION_BUILD_SMOKE=1 npm exec -- electron ./out/main/index.js
```

Expected:

- All existing and newly added core unit tests pass.
- ESLint exits successfully.
- Node and renderer TypeScript checks exit successfully.
- Electron/Vite production build exits successfully.
- The non-visual Electron smoke process exits without an immediate startup failure.

- [ ] Also run `git diff --check` and confirm no whitespace errors.

### Task 9: Perform one comprehensive full-diff review

- [ ] Review the complete uncommitted diff once against both specifications and confirm:
  - quiet, natural, and lively personality pools remain distinct in both daily life states;
  - quiet never auto-switches photos or chooses hops/double-hops;
  - autonomous approach uses exactly two bounded same-direction steps, synchronized rise peaks, and a 220 ms final hold;
  - all approach timers are cancelled by drag, runtime flows, hidden pages, pet/life-state changes, and reduced-motion changes;
  - `movesWindow` remains true only for templates that actually call the bounded nudge path in normal motion;
  - hover, dragging, context menu, petting entry, and mouse-ignore use the visible alpha-bounds hit target rather than the original source-image rectangle;
  - reminders, rest, crying, celebration, hidden pages, and presence transitions cannot reactivate hover;
  - repeated identical templates and repeated `reduced-pulse` fallbacks restart action animation without remounting `PhotoTransition`;
  - JS action occupancy and CSS animation duration both come from `MOTION_DEFINITIONS`;
  - photo crossfade remains 400 ms normally and 120 ms under reduced motion, retaining the old photo until the new one loads;
  - no raw petting trace or broader renderer capability crosses IPC;
  - no old 3D transform, rubber deformation, obsolete motion name, or stale keyframe is reintroduced;
  - no dependency, network behavior, persistence schema, telemetry, or logging change appears.

- [ ] If the review finds any confirmed issue, apply all fixes in one consolidated pass. Do not create a task-by-task review loop.

### Task 10: Run one final verification after the consolidated fix pass

- [ ] If Task 9 changed code, rerun the full allowed gate once:

```bash
npm test
npm run lint
npm run typecheck
npm run build
DEAR_COMPANION_BUILD_SMOKE=1 npm exec -- electron ./out/main/index.js
git diff --check
```

- [ ] Do not commit. Report the final changed-file list, verification results, and any unresolved Critical or Important finding.

## User UI Verification Checklist

Every item below must be reported as **awaiting user verification** on both macOS and Windows. Passing tests/build/smoke does not verify any of them.

- Full-body photographs remain proportionate and foot-stable during breathing, leaning, hopping, petting, settling, anger, crying, and wake motions.
- Transparent padding does not capture hover, drag, petting, body push, or context-menu interaction outside the visible-person alpha rectangle.
- Hover direction follows the visible person, holds briefly on leave, returns smoothly, and remains neutral during reminder/rest/crying/celebration flows.
- Quiet, natural, and lively profiles have visibly distinct character; quiet never hops or auto-switches photos.
- Two-step autonomous approach looks like two intentional steps rather than sliding, stays inside the work area, and stops promptly when interrupted.
- Repeated clicks/petting and rapid action replacement visibly restart feedback, including under reduced motion.
- Hidden/show transitions resume from a neutral pose without stale runtime animation or overlay frames.
- Photo transitions preserve the old loaded image until the replacement loads, crossfade smoothly, survive rapid switching, and recover from load failure.
- Reduced motion disables autonomous window movement, jumps, shaking, and sustained hover while retaining short low-amplitude feedback without invisible busy time.
