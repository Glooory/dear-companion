# Full-Body Companion Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan in one continuous session. Repository policy forbids per-task subagents and per-task review loops.

**Goal:** Replace the current generic full-photo transforms with a coherent, full-body-safe motion system for autonomous activity and mouse interaction.

**Architecture:** Introduce one shared motion vocabulary and selection module, carry only a minimal petting direction result through the existing IPC bridge, and split the renderer into attention, action, photo, and overlay transform layers. Preserve the existing companion scheduler, state priority, photo crossfade, offline boundary, and narrow preload API.

**Tech Stack:** Electron 43, React 19, TypeScript 5.9, CSS Modules, Vitest, npm

**Spec:** `docs/superpowers/specs/2026-09-10-full-body-companion-motion-design.md`

## Global Constraints

- Treat every companion image as one indivisible, transparent full-body photograph.
- Do not add skeletal animation, body-part segmentation, AI frame generation, remote assets, network calls, telemetry, or new dependencies.
- Keep body transforms to small 2D translations, foot-anchored rotations, and at most about 1% uniform or vertical scale.
- Do not expose raw global pointer traces to the renderer, persistence, or logs.
- Keep the existing system-flow and life-state priority model and the approximately 400 ms photo crossfade.
- Do not add UI unit tests, React component tests, snapshot tests, browser tests, Playwright tests, or automated end-to-end tests.
- Run only targeted core tests during coding. Run the complete allowed test suite, lint, typecheck, production build, and non-visual Electron startup smoke check once at the milestone gate.
- Perform one comprehensive review after milestone verification, consolidate findings into one fix pass, and re-review only unresolved Critical or Important findings.
- Execute as four coherent implementation batches with one commit per batch.

## File Structure

**Create**

- `src/shared/companion-motion.ts` — motion names, canonical durations, reduced-motion mapping, state-specific pools, non-repeating selection, hover pose, and height-scaled displacement helpers.
- `src/shared/companion-motion.test.ts` — unit coverage for the reusable motion model and selection rules.

**Modify**

- `src/shared/action-fallback.ts` — use the shared motion template type and retain safe still/photo-swap/rest fallbacks.
- `src/shared/companion-rhythm.ts` — replace return-to-origin pacing with two-step approach and keep directed body-push steps bounded.
- `src/shared/companion-rhythm.test.ts` — assert two-step net displacement and existing rhythm behavior.
- `src/shared/petting-gesture.ts` — return minimal completion direction metadata instead of a boolean-only success.
- `src/shared/petting-gesture.test.ts` — cover left, right, and neutral completion results.
- `src/shared/contracts.ts` — define `PettingGestureResult` and type the existing callback payload.
- `src/main/interactions/petting-tracker.ts` — forward the detector result without retaining the trace.
- `src/main/interactions/petting-tracker.test.ts` — verify one result is forwarded and tracking is cancelled.
- `src/main/windows/window-manager.ts` — broadcast the validated petting result.
- `src/main/index.ts` — connect tracker result to the window manager broadcast.
- `src/preload/index.ts` — forward the typed result through the existing listener.
- `src/renderer/src/interactions/use-petting-gesture.ts` — pass completion direction to `PetShell`.
- `src/renderer/src/interactions/use-pet-interactions.ts` — calculate visible-region hover pose, drag lean, delayed neutral return, and rigid drag release.
- `src/renderer/src/interactions/use-companion-presence.ts` — suppress autonomous motion/personality layers under reduced motion while preserving ambient feedback.
- `src/renderer/src/windows/PetShell.tsx` — consume the motion registry, map life states and gestures to motions, compose transform layers, anchor overlays, and synchronize completion timing.
- `src/renderer/src/windows/PetShell.module.css` — replace large deformations and 3D tilt with the approved full-body-safe keyframes and layered transforms.
- `src/renderer/src/styles/global.css` — stop the global reduced-motion rule from overriding the pet window's semantic fallback durations.

---

## Batch 1: Shared Motion Vocabulary and Autonomous Steps

**Files:**

- Create: `src/shared/companion-motion.ts`
- Create: `src/shared/companion-motion.test.ts`
- Modify: `src/shared/action-fallback.ts`
- Modify: `src/shared/companion-rhythm.ts`
- Modify: `src/shared/companion-rhythm.test.ts`

**Interfaces:**

- Produces `MotionTemplate`, `MotionDirection`, `MotionDefinition`, `MOTION_DEFINITIONS`, `resolveMotion`, `selectAmbientMotion`, `selectPersonalityMotion`, `selectClickMotion`, `computeHoverPose`, `scaleMotionDip`, and `selectNonRepeating`.
- Produces `createApproachSteps(random, direction?)` and `createBodyPushSteps(direction, random)`.
- Later batches consume these names directly; no duplicate duration table may be added in renderer code or CSS.

- [ ] **Define failing unit tests for canonical motion behavior.**

  Add tests that assert:

  ```ts
  expect(resolveMotion("playful-hop", false)).toMatchObject({ durationMs: 620, template: "playful-hop" });
  expect(resolveMotion("playful-hop", true)).toMatchObject({ durationMs: 160, template: "reduced-pulse" });
  expect(selectNonRepeating(["gentle-breathe", "weight-shift"], "gentle-breathe", () => 0)).toBe("weight-shift");
  expect(selectAmbientMotion("working", "lively", null, () => 0)).toBe("gentle-breathe");
  expect(selectClickMotion("daily-playful", null, () => 0)).toBe("playful-hop");
  expect(computeHoverPose({ x: 200, y: 100 }, { x: 100, y: 50, width: 100, height: 200 })).toEqual({
    translateX: 2,
    translateY: -0.5,
    rotate: 1.6,
  });
  expect(scaleMotionDip(6, 80)).toBeGreaterThanOrEqual(3);
  expect(scaleMotionDip(6, 260)).toBeLessThanOrEqual(8);
  ```

- [ ] **Run the new targeted tests and confirm they fail because the motion module does not exist.**

  Run: `npm test -- src/shared/companion-motion.test.ts src/shared/companion-rhythm.test.ts`

  Expected: FAIL on the missing exports and the old return-to-origin approach behavior.

- [ ] **Implement the shared motion registry and selectors.**

  Use a closed union containing:

  ```ts
  export type MotionTemplate =
    | "still"
    | "asset-swap"
    | "gentle-breathe"
    | "weight-shift"
    | "toe-rise"
    | "observe-lean"
    | "soft-lift"
    | "calm-lean"
    | "playful-hop"
    | "playful-double-hop"
    | "drowsy-dip"
    | "petting-lean"
    | "settle"
    | "angry-shake"
    | "crying-tremble"
    | "wake-sway"
    | "reduced-pulse";

  export interface MotionDefinition {
    durationMs: number;
    reducedMotionFallback: MotionTemplate;
    movesWindow: boolean;
  }
  ```

  Define canonical durations within the approved groups. `resolveMotion(template, true)` must return the fallback definition and duration, not the original action with a CSS-only duration override. Selectors must use state-specific ordered pools and exclude the immediately previous choice when another choice exists.

- [ ] **Replace the old pacing helpers.**

  `createApproachSteps` returns exactly two same-direction integer steps whose total is 12–18 DIP. `createBodyPushSteps` returns 4–6 same-direction integer steps totaling 6–10 DIP. Both clamp non-finite random values with the existing deterministic convention.

- [ ] **Run targeted core tests.**

  Run: `npm test -- src/shared/companion-motion.test.ts src/shared/companion-rhythm.test.ts src/shared/action-fallback.test.ts`

  Expected: PASS.

- [ ] **Commit Batch 1.**

  ```bash
  git add src/shared/companion-motion.ts src/shared/companion-motion.test.ts src/shared/action-fallback.ts src/shared/companion-rhythm.ts src/shared/companion-rhythm.test.ts
  git commit -m "feat: define full-body companion motions"
  ```

## Batch 2: Directional Petting Result

**Files:**

- Modify: `src/shared/petting-gesture.ts`
- Modify: `src/shared/petting-gesture.test.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/interactions/petting-tracker.ts`
- Modify: `src/main/interactions/petting-tracker.test.ts`
- Modify: `src/main/windows/window-manager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/interactions/use-petting-gesture.ts`

**Interfaces:**

- Produces `PettingGestureResult = { leanDirection: -1 | 0 | 1 }`.
- Changes `PettingGestureDetector.addSample(sample)` to return `PettingGestureResult | null`.
- Changes `onPettingGestureDetected(listener)` and renderer `onDetected` to receive the result.
- No raw points, speed history, path length, or timestamps cross the IPC boundary.

- [ ] **Write failing detector and tracker tests for minimal direction output.**

  Cover a back-and-forth gesture completing on the left, one completing on the right, and a completion within the horizontal center dead zone. Assert the tracker calls:

  ```ts
  expect(detected).toHaveBeenCalledWith({ leanDirection: 1 });
  ```

  Assert it emits only once and clears both timers exactly as before.

- [ ] **Run targeted tests and confirm the old boolean-only interface fails.**

  Run: `npm test -- src/shared/petting-gesture.test.ts src/main/interactions/petting-tracker.test.ts`

  Expected: FAIL on result type/value assertions.

- [ ] **Implement minimal direction derivation.**

  At successful completion, compare the final sample's horizontal position to the ellipse center. Use a dead zone equal to 10% of `radiusX`; positions outside it yield `-1` or `1`, and positions inside yield `0`. Return only `{ leanDirection }`.

- [ ] **Thread the result through the existing narrow channel.**

  Update tracker dependency `onDetected(result)`, `WindowManager.broadcastPettingGestureDetected(result)`, the main composition root, the shared API contract, preload wrapper, and `usePettingGesture`. Do not add a new IPC channel.

- [ ] **Run targeted core tests and typecheck.**

  Run: `npm test -- src/shared/petting-gesture.test.ts src/main/interactions/petting-tracker.test.ts && npm run typecheck`

  Expected: PASS.

- [ ] **Commit Batch 2.**

  ```bash
  git add src/shared/petting-gesture.ts src/shared/petting-gesture.test.ts src/shared/contracts.ts src/main/interactions/petting-tracker.ts src/main/interactions/petting-tracker.test.ts src/main/windows/window-manager.ts src/main/index.ts src/preload/index.ts src/renderer/src/interactions/use-petting-gesture.ts
  git commit -m "feat: carry petting response direction"
  ```

## Batch 3: Layered Renderer and Mouse Interaction Motion

**Files:**

- Modify: `src/renderer/src/interactions/use-pet-interactions.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/windows/PetShell.module.css`
- Modify: `src/renderer/src/styles/global.css`

**Interfaces:**

- Consumes the Batch 1 motion definitions and Batch 2 `PettingGestureResult`.
- `usePetInteractions` receives the current visible person rectangle plus `reducedMotion` and returns one attention pose containing `translateX`, `translateY`, and `rotate`.
- `PetShell` exposes CSS variables for attention direction, action direction, motion scale, and overlay position; CSS does not own business durations.

- [ ] **Split the person rendering into attention, action, photo, and overlay layers.**

  Restructure only the active companion branch:

  ```tsx
  <div className={styles.attentionLayer} style={attentionStyle}>
    <div className={clsx(styles.actionLayer, styles[motionClass])} style={motionStyle}>
      <PhotoTransition {...photoProps} />
    </div>
    <div className={styles.overlayLayer}>{/* heart / tears */}</div>
  </div>
  ```

  Keep presence enter/exit outside these layers. Keep photo crossfade transforms isolated inside `PhotoTransition`.

- [ ] **Replace 3D hover with visible-person 2D attention.**

  Derive the visible rectangle from `computeAssetGeometry` plus the asset alpha bounds. Feed pointer position and this rectangle to `computeHoverPose`. Use a maximum 1.6° foot-anchored rotation, 2 DIP horizontal movement, and 1 DIP vertical movement. On leave, hold 80 ms and return over 220 ms. Clear the pose on drag, action, petting candidate, photo transition, or system flow.

- [ ] **Add rigid drag lean and release behavior.**

  During dragging, use only recent horizontal delta direction to apply at most 1.2° opposite lean; do not scale the image or add window inertia. Ordinary release triggers `settle`. Fast release triggers `angry-shake` after the action's built-in 70 ms anticipation and retains the existing dialogue.

- [ ] **Replace click and petting mappings.**

  Use `selectClickMotion` for state-specific click responses. Preserve the sleeping three-stage wake flow, using `wake-sway`, optional drowsy photo swap, and `settle`. Map petting direction to `petting-lean`; sleeping uses `gentle-breathe`, drowsy uses `drowsy-dip`, and working uses a reduced-amplitude `calm-lean`.

- [ ] **Anchor emotion overlays to geometry.**

  Compute the heart and tear anchor from `computeHeadHotspotGeometry`; fall back to the top-center of the visible person rectangle. Main heart appears once; a second smaller heart may appear with low probability and an offset delay. Crying produces two staggered tear drops. Overlay elements must not inherit the body's deformation transform.

- [ ] **Rewrite action CSS around full-body-safe keyframes.**

  Delete the old 3D actor transform and the large `scale(1.05, 0.95)`, `scale(0.985, 1.035)`, and related rubber deformations. Add only the approved keyframes for breath, weight shift, toe rise, observation, soft lift, calm lean, single/double hop, drowsy dip, petting lean, settle, angry shake, crying tremble, wake sway, and reduced pulse. Every keyframe ends at neutral values.

- [ ] **Give the pet window semantic reduced-motion control.**

  Scope the global `0.01ms !important` reduced-motion rule away from `html[data-window="pet"]`. Continue using the existing bubble and settings fallbacks. In `PetShell`, resolve actions through `resolveMotion` so visual duration and busy duration change together.

- [ ] **Run lint and typecheck for renderer integration.**

  Run: `npm run lint && npm run typecheck`

  Expected: PASS. Do not launch a browser or perform visual validation.

- [ ] **Commit Batch 3.**

  ```bash
  git add src/renderer/src/interactions/use-pet-interactions.ts src/renderer/src/windows/PetShell.tsx src/renderer/src/windows/PetShell.module.css src/renderer/src/styles/global.css
  git commit -m "feat: redesign companion mouse interactions"
  ```

## Batch 4: Autonomous Motion Integration and Milestone Gate

**Files:**

- Modify: `src/renderer/src/interactions/use-companion-presence.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/windows/PetShell.module.css`
- Modify: `src/shared/companion-motion.ts`
- Modify: `src/shared/companion-motion.test.ts`
- Modify: `src/shared/companion-rhythm.ts`
- Modify: `src/shared/companion-rhythm.test.ts`

**Interfaces:**

- Consumes Batch 1 state-specific ambient/personality selectors and approach steps.
- Keeps the current three deadline layers and existing pace ranges unchanged.
- Produces no new settings or persistence schema.

- [ ] **Integrate state-specific ambient and personality pools.**

  Replace ad hoc arrays and direct `Math.random()` branches in `PetShell` with the shared selectors. Retain one previous motion and direction per layer to prevent immediate repetition. Working uses only gentle breath/low weight shift; drowsy uses gentle breath/drowsy dip; sleeping uses low breath; daily states use their approved pools.

- [ ] **Replace return-to-origin autonomous pacing with two-step approach.**

  Play `observe-lean` as anticipation, apply the two `createApproachSteps` deltas in the chosen direction, synchronize a 1–2 DIP step rise with each nudge, pause about 220 ms at the destination, and keep the new bounded window position. Body pushing continues to use the separate 6–10 DIP directed steps.

- [ ] **Complete reduced-motion scheduling.**

  In `useCompanionPresence`, keep ambient deadlines active, clear window-motion and personality deadlines while reduced motion is enabled, and re-arm them only after the preference is disabled. Confirm changing the preference cancels an active incompatible motion and removes any pending nudge timers.

- [ ] **Run the milestone verification gate once.**

  Run in this order:

  ```bash
  npm test
  npm run lint
  npm run typecheck
  npm run build
  DEAR_COMPANION_BUILD_SMOKE=1 npm exec -- electron ./out/main/index.js
  ```

  Expected: all unit tests, lint, typecheck, and build pass; the non-visual smoke process exits without an immediate startup failure. Do not inspect or interact with the UI.

- [ ] **Perform one comprehensive milestone review.**

  Review the complete diff against the approved spec for:

  - full-body photo proportions and foot-anchored transforms;
  - action duration synchronization and cancellation;
  - state and system-flow priority;
  - petting trace privacy and narrow IPC payload;
  - autonomous movement bounds and timer cleanup;
  - reduced-motion semantic behavior;
  - no new network, dependency, persistence, or renderer privilege exposure;
  - focused files and removal of obsolete motion names.

- [ ] **Apply one consolidated fix pass and run final verification.**

  Fix all confirmed findings together. Then rerun:

  ```bash
  npm test
  npm run lint
  npm run typecheck
  npm run build
  DEAR_COMPANION_BUILD_SMOKE=1 npm exec -- electron ./out/main/index.js
  ```

  Re-review only any unresolved Critical or Important finding. Record all visual behavior as awaiting user verification.

- [ ] **Commit Batch 4.**

  ```bash
  git add src/shared/companion-motion.ts src/shared/companion-motion.test.ts src/shared/companion-rhythm.ts src/shared/companion-rhythm.test.ts src/renderer/src/interactions/use-companion-presence.ts src/renderer/src/windows/PetShell.tsx src/renderer/src/windows/PetShell.module.css
  git commit -m "feat: complete companion motion redesign"
  ```

## User UI Verification Checklist

All items below remain **awaiting user verification** on macOS and Windows:

- Full-body photographs do not visibly stretch, squash, flip like cards, or slide at the feet during ordinary motions.
- Quiet, natural, and lively modes have distinct motion character without excessive interruption.
- Autonomous two-step approach looks intentional, stays inside the work area, and does not always return to its starting point.
- Hover follows the visible person rather than transparent margins and returns smoothly after pointer exit.
- Calm, playful, drowsy, working, and sleeping clicks produce state-appropriate responses.
- Petting leans toward the completion side and positions heart feedback near the configured head hotspot.
- Body pushing, rigid dragging, ordinary release settling, and fast-release anger match the gesture direction.
- Crying looks distinct from anger and positions tears near the head.
- Rapidly alternating hover, click, petting, drag, life-state changes, and system flows never leaves a stuck transform.
- Reduced-motion mode retains subtle feedback without hidden interaction lock time.
- Idle and active CPU/memory remain within the product's soft performance budget.
