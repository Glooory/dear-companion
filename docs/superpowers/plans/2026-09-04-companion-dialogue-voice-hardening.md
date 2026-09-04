# Companion Dialogue Voice Hardening Implementation Plan

**Goal:** Bring the current dialogue voice and flattened settings implementation into compliance with the approved 2026-09-04 specification.

**Architecture:** Keep recording and UI state in the renderer, but keep permission decisions, file validation, ownership, persistence, and cleanup in the Electron main process. Treat newly written voice files as drafts until `updatePet` atomically persists their references; cleanup compares the persisted reference set with the owned voice directory. Use a small reusable playback coordinator for deterministic start, fade, and disposal behavior.

**Tech Stack:** Electron 43, React 19, TypeScript 5.9, Vite, Vitest, CSS Modules, electron-builder.

**Spec:** `docs/superpowers/specs/2026-09-04-companion-dialogue-voice-design.md`

## Global constraints

- Remain fully offline and keep all imported media under the app data directory.
- Renderer processes remain sandboxed and receive only narrow typed preload methods.
- Use npm exclusively and add no new dependency unless the platform cannot meet a required behavior.
- Add automated tests only for core logic and reusable shared methods; do not add UI, component, snapshot, browser, or end-to-end tests.
- Execute in four coherent batches with one final comprehensive review and one consolidated fix pass.

## Batch 1: Versioned contracts and voice storage transaction

**Files:**

- Modify `src/shared/contracts.ts`, `src/shared/contracts.test.ts`, `src/shared/dialogue-settings.ts`, `src/shared/dialogue-settings.test.ts`.
- Create `src/main/audio/voice-audio-input.ts`, `src/main/audio/voice-audio-input.test.ts`.
- Modify `src/main/pets/pet-pack-service.ts`, `src/main/pets/pet-pack-service.test.ts`.
- Modify `src/main/settings/default-settings.ts`, `src/main/settings/settings-store.test.ts`.

**Interfaces:**

- `AppSettingsV6` is the only current settings type; `migrateAppSettings` converts strict V5 data to V6 defaults.
- `PetDialogueSettings.voiceEnabled` and `voiceVolume` become required after parsing.
- `detectVoiceAudioFormat(bytes)` returns `mp3 | wav | ogg | webm | m4a | null` based on content.
- `PetPackService.updatePet` validates every voice reference before settings persistence, then removes unreferenced owned voice files after success.
- `PetPackService.cleanupUnreferencedVoiceAssets(petId?)` removes draft/orphan voices without touching referenced files.

- [ ] Add failing V5-to-V6 migration, required-default, restore-preserves-voice, format-detection, ownership, rollback, orphan-cleanup, and pet-directory cleanup tests.
- [ ] Run the targeted tests and confirm failures are caused by the missing behavior.
- [ ] Implement strict V6 parsing/migration and stable candidate identity.
- [ ] Implement voice content validation, collision-safe writes, reference ownership checks, post-save cleanup, and retryable staged-directory cleanup.
- [ ] Run the targeted tests, typecheck, and commit the coherent batch.

## Batch 2: Permission, protocol, IPC, and packaging boundaries

**Files:**

- Modify `src/main/security/network-policy.ts`, `src/main/security/network-policy.test.ts`.
- Modify `src/main/security/app-protocol.ts`, `src/main/security/app-protocol.test.ts`.
- Modify `src/main/ipc/register-pet-system-ipc.ts`, its existing IPC tests if applicable, `src/main/index.ts`, `src/preload/index.ts`, `src/shared/ipc-channels.ts`, and `src/shared/contracts.ts`.
- Modify `src/main/windows/window-manager.ts` only if needed to identify the settings owner or run close cleanup.
- Modify `electron-builder.yml`.

**Interfaces:**

- `classifyPermissionRequest(input)` permits only main-frame `media/audio` requests from the owned settings window and exact renderer origin.
- All other permissions remain denied through both Electron permission handlers.
- Voice import returns validated draft metadata; direct renderer deletion of persisted voice files is removed.
- A narrow cleanup/status API may expose only pet and voice identifiers, never paths.

- [ ] Add failing permission-decision and protocol ownership tests.
- [ ] Implement restricted microphone permission handlers and settings-window identity checks.
- [ ] Add the macOS microphone usage description.
- [ ] Align IPC/preload contracts with transactional voice cleanup and unavailable-status reporting.
- [ ] Run targeted tests, typecheck, and commit the coherent batch.

## Batch 3: Playback and recorder resource safety

**Files:**

- Create `src/renderer/src/dialogues/voice-playback-coordinator.ts` and `src/renderer/src/dialogues/voice-playback-coordinator.test.ts` as reusable core logic without React rendering.
- Modify `src/renderer/src/dialogues/use-dialogue.ts`.
- Modify `src/renderer/src/components/VoiceRecorderPopover.tsx` and `.module.css`.
- Modify `src/renderer/src/components/DialogueLineEditor.tsx` as needed for volume and availability state.

**Interfaces:**

- `VoicePlaybackCoordinator` owns one delayed start, one active audio object, and all fade timers; `schedule`, `stop`, and `dispose` are deterministic.
- Recorder state includes `requesting`, rejects duplicate starts, uses an operation token after every await, and releases streams, audio elements, timers, event handlers, and blob URLs on every exit path.

- [ ] Add failing coordinator tests for 80 ms scheduling, replacement fade, bubble-close stop, play rejection, end/error cleanup, and disposal.
- [ ] Implement the coordinator and integrate it into `useDialogue` so automatic bubble timeout also stops voice playback.
- [ ] Implement recorder cancellation guards, complete stream cleanup, semantic progress, coarse live status, save-state close protection, and volume-aware audition.
- [ ] Run targeted tests, typecheck, and commit the coherent batch.

## Batch 4: UI semantics, responsive hierarchy, and copy

**Files:**

- Modify `src/renderer/src/windows/SettingsShell.tsx` and `.module.css`.
- Modify `src/renderer/src/components/DialogueSettingsEditor.tsx` and `.module.css`.
- Modify `src/renderer/src/components/DialogueLineEditor.tsx` and `.module.css`.
- Modify `src/renderer/src/components/VoiceRecorderPopover.tsx` and `.module.css`.

**Behavior:**

- Both navigation levels expose `tablist`, `tab`, selected state, keyboard arrow navigation, and labelled panels.
- Scenario counts say `N 个时机`; dialogue cards say `N 句`.
- Voice actions use visible `试听`, `更换`, and `删除` labels with practical desktop hit areas.
- Narrow widths place editing and metadata on separate rows without clipping.
- The recorder modal traps focus, restores the opener focus, adapts its title for add/replace, and distinguishes draft use from outer settings persistence.
- Copy lists all supported formats and accurately describes restore and unsaved outcomes.
- Muted small text meets 4.5:1 contrast; reduced-motion behavior remains intact.

- [ ] Implement semantic tab behavior and the responsive line layout.
- [ ] Implement labelled voice controls, unsaved status, availability state, modal focus behavior, progress ring, corrected copy, and contrast adjustments.
- [ ] Run lint and typecheck, then commit the coherent batch.

## Milestone completion gate

- [ ] Run the complete allowed unit suite once.
- [ ] Run lint, typecheck, production build, and the non-visual Electron startup smoke check once.
- [ ] Review the full milestone diff once for specification compliance, privacy/security boundaries, cross-module integration, and code quality.
- [ ] Apply one consolidated fix pass for all findings.
- [ ] Repeat the complete verification gate once and recheck only unresolved Critical or Important findings.
- [ ] Hand off every visual, operating-system permission, audio-device, and interaction-quality item as awaiting user verification.
