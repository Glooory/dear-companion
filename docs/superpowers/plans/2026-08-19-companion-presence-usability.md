# Companion Presence and Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one continuous session. Repository policy forbids per-task subagents, per-task reviews, UI automation, and browser-based runtime validation.

**Goal:** Make the desktop companion feel continuously alive, make every menu action immediately understandable, simplify one-photo setup, and rewrite all user-facing Chinese copy in a clear human voice.

**Architecture:** Add a small pure scheduling module for ambient and autonomous presence deadlines, then let a focused renderer hook coordinate those deadlines with the existing action system without rerolling on hover. Use one narrow typed main-to-renderer interaction event for context-menu play and settings previews. Keep the existing state controller, asset model, offline storage, and CSS action templates, while reorganizing settings through progressive disclosure rather than introducing a new router or onboarding subsystem.

**Tech Stack:** Electron 43, React 19, TypeScript 5.9, Vite/electron-vite, Vitest, CSS/Web Animations

**Spec:** `docs/superpowers/specs/2026-08-19-companion-presence-usability-design.md`

## Global Constraints

- Keep production fully offline; do not add accounts, telemetry, remote assets, update checks, or network calls.
- Preserve imported originals and existing non-destructive normalization metadata.
- Renderer code must use only narrow typed preload APIs; validate renderer senders and payloads in the main process.
- Use the user-visible labels `安静`, `自然`, and `爱玩`; internal `quiet`, `natural`, and `lively` identifiers remain unchanged.
- Product copy is calm, direct, and concrete; pet dialogue is short, action-specific, and never imitates an AI coach.
- Do not add UI unit tests, React component tests, snapshots, browser tests, Playwright, or automated end-to-end tests.
- Automated verification is limited to necessary core unit tests, lint, typecheck/build, and the non-visual Electron startup smoke check.
- Execute as four coherent batches with one commit per implementation batch, then one comprehensive milestone review and one consolidated fix pass if needed.

---

### Batch 1: Reliable layered presence scheduling

**Files:**
- Create: `src/shared/companion-presence.ts`
- Create: `src/shared/companion-presence.test.ts`
- Create: `src/renderer/src/interactions/use-companion-presence.ts`
- Modify: `src/shared/companion-rhythm.ts`
- Modify: `src/shared/companion-rhythm.test.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/styles/global.css`
- Include: `docs/superpowers/plans/2026-08-19-companion-presence-usability.md`

**Interfaces:**
- `PRESENCE_PROFILES: Record<CompanionPace, { ambientRangeMs; motionRangeMs }>` contains the exact ranges from the spec.
- `nextAmbientDelay(pace, random)` and `nextMotionDelay(pace, random)` return clamped randomized delays.
- `PresenceDeadline` exposes `arm(now, delay)`, `isDue(now)`, `consume(now, nextDelay)`, `clear()`, and `dueAt`; calling `arm` while already armed preserves the original deadline.
- `useCompanionPresence(options)` receives pace, life state, eligibility/busy flags, reduced-motion state, and `onAmbient`, `onMotion`, `onPersonality` callbacks.

- [ ] Add core tests that prove the three ambient/motion ranges, non-finite random clamping, preservation of an armed deadline across repeated `arm` calls, due detection, consumption, and clearing:

```ts
expect(nextAmbientDelay('natural', () => 0)).toBe(8_000)
expect(nextAmbientDelay('natural', () => 1)).toBe(14_000)
expect(nextMotionDelay('lively', () => 0)).toBe(25_000)
const deadline = new PresenceDeadline()
deadline.arm(1_000, 8_000)
deadline.arm(4_000, 14_000)
expect(deadline.dueAt).toBe(9_000)
expect(deadline.isDue(8_999)).toBe(false)
expect(deadline.isDue(9_000)).toBe(true)
```

- [ ] Run `pnpm test -- src/shared/companion-presence.test.ts`; expect failure because the module does not exist.
- [ ] Implement the pure scheduling module and update the old no-argument waddle delay to the pace-aware `nextMotionDelay` interface.
- [ ] Build `useCompanionPresence` with one timer for the earliest armed layer. Busy hover/action state postpones an already-due callback by 1–3 seconds without rerolling; hidden, page-invisible, runtime-system, pet change, pace change, and life-state eligibility changes clear inapplicable deadlines.
- [ ] In `PetShell`, map ambient callbacks to blink when a closed-eye asset exists, otherwise to state-appropriate `gentle-breathe`, `nod`, or `sway`; map motion to the existing waddle action; map personality to existing cute actions and show an automatic dialogue only for a minority of personality events.
- [ ] Keep work, drowsy, and sleeping ambient feedback state-appropriate; disable window movement under reduced motion while retaining low-amplitude breathing or asset blink.
- [ ] Remove the two independent renderer timer effects replaced by the hook, and ensure the idle frame remains still between intermittent actions.
- [ ] Run targeted core tests: `pnpm test -- src/shared/companion-presence.test.ts src/shared/companion-rhythm.test.ts`.
- [ ] Commit with message `feat: add layered companion presence`.

### Batch 2: Intent-based menu, immediate actions, and one-photo setup

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/windows/window-manager.ts`
- Modify: `src/main/ipc/register-pet-system-ipc.ts`
- Modify: `src/main/pets/pet-pack-service.ts`
- Modify: `src/main/pets/pet-pack-service.test.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/windows/SettingsShell.tsx`

**Interfaces:**
- `PetInteractionRequest = { type: 'play-now' } | { type: 'preview-pace'; pace: CompanionPace }`.
- `PetSystemApi.previewCompanionPace(pace)` is settings-only and main-process validated.
- `PetSystemApi.onPetInteractionRequested(listener)` subscribes the pet renderer to trusted requests.
- `WindowManager.requestPetInteraction(request)` sends only to the owned pet window.
- `CompanionRuntimeSnapshot.pace` exposes the active pet pace for the current-status menu label.

- [ ] Add contract parsing for `previewCompanionPace` input and a narrow main-to-renderer request channel; do not expose generic IPC.
- [ ] Replace the state-machine labels in the pet context menu with a disabled current-state line plus `逗逗它`, `安静陪我一会儿`, conditional `让它打个盹`/`让它歇一会儿`, `陪我专注`/`结束专注陪伴`, and conditional `恢复自动陪伴`.
- [ ] Make `逗逗它` send `play-now` and make each pace preview send `preview-pace`; in `PetShell`, both requests immediately run a visible compatible action, with the preview selecting representative intensity without changing saved settings or the life state.
- [ ] Add a pet-pack-service core test proving that the first successfully imported photo is assigned to `actionSlots.idle` only when the pet has no daily photo; later imports must not replace the existing daily choice.
- [ ] Update import persistence and `mergeImportedAssetsIntoDraft` so the auto-assigned first daily photo reaches the draft without discarding unsaved adjustments for existing assets.
- [ ] Run `pnpm test -- src/main/pets/pet-pack-service.test.ts src/shared/contracts.test.ts` and `pnpm typecheck`.
- [ ] Commit with message `feat: simplify companion actions and first setup`.

### Batch 3: Settings hierarchy and product-wide copy pass

**Files:**
- Modify: `src/renderer/src/windows/SettingsShell.tsx`
- Modify: `src/renderer/src/components/CompanionPreferences.tsx`
- Modify: `src/renderer/src/components/ActionSlotEditor.tsx`
- Modify: `src/renderer/src/components/LifeStateEditor.tsx`
- Modify: `src/renderer/src/components/PetAssetEditor.tsx`
- Modify: `src/renderer/src/components/ReminderEditor.tsx`
- Modify: `src/renderer/src/components/WorkScheduleEditor.tsx`
- Modify: `src/renderer/src/components/AudioSettings.tsx`
- Modify: `src/renderer/src/dialogues/dialogue-library.ts`
- Modify: `src/renderer/src/styles/global.css`
- Modify: `src/main/tray/tray-controller.ts`
- Modify: `src/main/index.ts`
- Modify: user-visible validation/error strings under `src/main/images`, `src/main/audio`, `src/main/pets`, and `src/main/reminders`
- Update: affected tests that assert exact error copy without changing their behavioral coverage

**Interfaces:**
- `CompanionPreferences` receives `onPreview(pace: CompanionPace): void` and renders three descriptive choice cards.
- Advanced photo adjustment is presented through native `<details>` progressive disclosure; no new navigation state or routing layer is introduced.

- [ ] Move the first-success path to the top: name, `导入照片`, `桌面上的大小`, companion choice, and `保存并使用`. Show a concise one-photo empty state and keep activation available after automatic daily assignment.
- [ ] Group photo purposes and short actions under `行为与照片`; place normalization, visible bounds, baseline, and head-hotspot controls under a closed `高级：调整照片` disclosure.
- [ ] Rename user-facing `工作` concepts to `专注` while preserving internal identifiers and schedule behavior; rename ordinary `素材` labels to `照片` and retain technical metadata only inside the advanced disclosure.
- [ ] Rewrite every visible product string found by `rg -n "[\\p{Han}]" src/renderer src/main` according to the spec: buttons predict results, empty states state the next action, confirmations describe deletion consequences, and errors state what happened plus what the user can do.
- [ ] Replace dialogue pools with short action-specific lines. Remove generic coaching and template-like lines such as `给你一点好心情`, `今天也轻轻松松`, `慢慢来，做好眼前这一点`, and `新的清醒时间开始`; keep automatic actions mostly silent.
- [ ] Add compact CSS for pace cards, quick-start guidance, semantic section headings, and details disclosure without changing the transparent pet window contract.
- [ ] Run `pnpm lint`, `pnpm typecheck`, and affected exact-message core tests.
- [ ] Commit with message `feat: clarify settings and companion copy`.

### Batch 4: Milestone verification, comprehensive review, and consolidated fix

**Files:**
- Modify only files needed to resolve findings from the single milestone review.

- [ ] Run the full allowed unit suite: `pnpm test`.
- [ ] Run static verification: `pnpm lint` and `pnpm typecheck`.
- [ ] Run the production build: `pnpm build`.
- [ ] Run the non-visual Electron startup smoke check: `DEAR_COMPANION_BUILD_SMOKE=1 pnpm exec electron ./out/main/index.js`; expect exit code 0 without an immediate startup failure.
- [ ] Review the complete milestone diff once for the 2026-08-19 spec, offline/privacy boundaries, typed IPC sender validation, timer cleanup, stale callbacks, copy consistency, first-photo persistence, and focused-file quality.
- [ ] Apply one consolidated fix pass for all review findings, then repeat `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the non-visual startup smoke check.
- [ ] If no fix was needed, do not create an empty commit. If fixes were needed, commit them together with message `fix: complete companion presence milestone`.

## Manual UI verification awaiting the user

- Confirm natural mode shows a subtle ambient action within 15 seconds and a clear autonomous action in about two idle minutes.
- Hover, click, and move away repeatedly; confirm autonomous movement is postponed briefly rather than reset indefinitely.
- Confirm reduced-motion mode keeps subtle life feedback but removes waddle, bounce, and window displacement.
- Confirm every pet context-menu action has an immediate and understandable result, including scheduled versus manual focus behavior.
- Create a pet with one transparent photo; confirm it can be saved and shown without opening advanced controls.
- Confirm pace preview actions are representative and do not silently save or change the current life state.
- Read the complete settings, tray, reminders, errors, and dialogue flows on Windows and macOS; flag any unclear, inconsistent, overly cute, or AI-like copy.
- Confirm settings hierarchy, transparent window motion, context menu, tray, file dialogs, and native confirmation prompts look and behave correctly on both supported operating systems.
