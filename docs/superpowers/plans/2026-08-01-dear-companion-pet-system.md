# Dear Companion Pet System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` in one continuous session. Do not use `superpowers:subagent-driven-development`, per-task reviewers, or per-task review loops. Checkboxes track execution, but implementation is committed in four coherent batches.

**Goal:** Add a secure, offline pet-pack system that imports user-prepared transparent PNG/WebP assets, stores non-destructive normalization metadata, renders the active pet, and implements the phase-two daily interaction state machine and settings workflow.

**Architecture:** Extend the global settings file to schema v2 and keep atomic backup/recovery in `SettingsStore`; an independent main-process `PetPackService` owns pet directories, image validation, safe copies, and resource resolution. Pure shared TypeScript modules own geometry, action fallback, interaction arbitration, drag velocity, and state transitions. The preload exposes only typed pet operations, while React renderers consume controlled `app://renderer/pet-assets/...` URLs and never receive arbitrary filesystem access.

**Tech Stack:** Node.js 24, pnpm 10.33, Electron 43, React 19, TypeScript 5.9, electron-vite, Vite, Vitest, ESLint, electron-builder; Electron `nativeImage` is used for PNG/WebP decoding so no image-processing dependency is added.

## Global Constraints

- The source of truth is `docs/superpowers/specs/2026-07-31-dear-companion-design.md`; phase two is limited to Pet System behavior.
- Supported targets remain Windows 10/11 x64 and macOS 13+ on Intel and Apple Silicon; do not add Linux support.
- Production remains fully offline; do not add cloud services, accounts, telemetry, update checks, remote pages, remote scripts, or remote assets.
- Accept only user-prepared transparent PNG/WebP images. Do not add background removal, face detection, AI generation, or an animation timeline editor.
- Preserve imported source files and copied assets. Store scale, offsets, alpha bounds, and foot baseline only as metadata.
- Renderer windows keep `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and receive only narrow typed preload methods.
- Main-process IPC validates the owned sender, payload shape, pet ID, asset ID, and resource ownership before privileged work.
- Single-file limit is 20 MiB, decoded width and height are each at most 8192 px, and one pet pack is at most 250 MiB.
- Default visible character height is 180 px and is constrained to 80–260 px.
- First-install reminders stay empty; autostart and sounds stay off. Do not implement reminders, rest sessions, cursor-rest monitoring, audio, autostart, installers, or release publishing.
- Automated tests cover only core schema/migration/persistence, image validation and alpha geometry, action fallback, state transitions, click/drag reusable logic, and other reusable pure helpers. Do not add UI, React, snapshot, Playwright, or end-to-end tests.
- Execute continuously in four coherent coding batches. During coding run only targeted core tests. At the completion gate run the full allowed unit suite, lint, typecheck, production build, and justified manual checks once.
- After coding and verification, review the complete `master...HEAD` milestone diff once for specification, security/privacy, migration compatibility, integration, and code quality. Consolidate findings into one fix pass and re-run final verification.

---

## Planned File Structure

```text
src/
├── main/
│   ├── images/
│   │   ├── image-decoder.ts                 # Electron nativeImage adapter and decoded alpha bytes
│   │   └── image-input.ts                   # Signature, limits, decoded-result validation
│   ├── ipc/
│   │   └── register-pet-system-ipc.ts       # Validated pet commands, picker, events, context menu
│   ├── pets/
│   │   └── pet-pack-service.ts              # Pet CRUD, safe import/copy, pack limits, asset lookup
│   ├── security/app-protocol.ts              # Controlled pet-asset URL branch
│   ├── settings/settings-store.ts            # v1→v2 migration persistence and recovery
│   ├── windows/window-manager.ts             # Owned-window lookup, movement, broadcast, visibility
│   └── index.ts                              # Phase-two composition
├── preload/
│   ├── index.ts                              # Narrow PetSystemApi wrapper
│   └── index.d.ts
├── renderer/src/
│   ├── interactions/use-pet-interactions.ts  # Pointer/click orchestration over pure helpers
│   ├── windows/PetShell.tsx                  # Imported asset, fallbacks, overlays, context menu
│   ├── windows/SettingsShell.tsx             # Pet creation/import/normalization/action assignment
│   └── styles/global.css                     # Settings editor and transform/opacity animations
└── shared/
    ├── action-fallback.ts                    # Deterministic slot resolution and template fallback
    ├── alpha-bounds.ts                       # Pure RGBA/BGRA alpha scanning
    ├── contracts.ts                          # AppSettingsV2 and PetSystemApi contracts/parser/migration
    ├── drag-gesture.ts                       # Reusable velocity and angry-threshold calculations
    ├── image-normalization.ts                # Pure target-height and aligned render geometry
    ├── interaction-intents.ts                # Single/double-click arbitration
    ├── ipc-channels.ts                       # Closed phase-two channel constants
    └── pet-state-machine.ts                  # Prioritized daily-state reducer with reserved tiers
```

Core tests live beside the corresponding modules as `*.test.ts`. Thin Electron adapters, IPC wiring, React components, and CSS receive focused manual checks instead of automated UI tests.

---

## Batch 1: Schema v2, Migration, and Pure Pet Core

**Files:**

- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/contracts.test.ts`
- Modify: `src/main/settings/settings-store.ts`
- Modify: `src/main/settings/settings-store.test.ts`
- Create: `src/shared/alpha-bounds.ts`
- Create: `src/shared/alpha-bounds.test.ts`
- Create: `src/shared/image-normalization.ts`
- Create: `src/shared/image-normalization.test.ts`
- Create: `src/shared/action-fallback.ts`
- Create: `src/shared/action-fallback.test.ts`
- Create: `src/shared/pet-state-machine.ts`
- Create: `src/shared/pet-state-machine.test.ts`
- Create: `src/shared/drag-gesture.ts`
- Create: `src/shared/drag-gesture.test.ts`
- Create: `src/shared/interaction-intents.ts`
- Create: `src/shared/interaction-intents.test.ts`
- Include: `docs/superpowers/plans/2026-08-01-dear-companion-pet-system.md`

**Interfaces:**

- `ActionSlot = 'idle' | 'cute' | 'petting' | 'angry' | 'crying' | 'resting' | 'blink'`.
- `PetAsset` stores `id`, `fileName`, `format`, `byteSize`, decoded `width`/`height`, `alphaBounds`, and `normalization: { scale, offsetX, offsetY, baselineOffset }`.
- `PetConfig` stores `id`, `name`, `targetHeight`, `assets`, `actionSlots: Record<ActionSlot, readonly string[]>`, and bounded `actionTemplates`.
- `AppSettingsV2` preserves every v1 field, changes `schemaVersion` to `2`, and adds `pets: readonly PetConfig[]`; `AppSettings` becomes `AppSettingsV2`.
- `migrateAppSettings(value: unknown): { settings: AppSettingsV2; migrated: boolean }` accepts strict v1 or v2 data. A migrated v1 has `pets: []` and `activePetId: null`, because v1 contains no verifiable pet configuration.
- `computeAlphaBounds(alphaBytes, width, height, stride, alphaOffset)` rejects length mismatches and all-transparent images and returns visible `{ x, y, width, height }`.
- `computeAssetGeometry(asset, targetHeight, viewport)` returns scale and top/left placement aligned to one shared baseline without changing image bytes.
- `resolveAction(pet, slot, randomIndex)` returns the selected asset IDs plus one named fallback template and overlays; blink without a frame resolves to breathing or nodding, never a simulated eyelid.
- `transitionPetState(state, event)` implements `idle`, `hovering`, `performingAction`, `dragging`, `angry`, and `hidden`, with explicit reserved priority constants for future reminding/resting/crying states.
- `calculateDragVelocity(samples)` and `isAngryDragRelease(samples, threshold)` use recent pointer samples and finite bounded input.
- `ClickIntentArbiter` delays a single-click callback and cancels it when a double-click arrives within the configured interval.

- [ ] Extend the strict parser with IDs limited to lowercase UUID-style tokens (`^[a-z0-9][a-z0-9-]{0,63}$`), names of 1–80 trimmed characters, unique pet/asset IDs, internal filenames only, finite bounded normalization values, valid slot references, target height 80–260, and an active pet reference that exists and has at least one idle asset.
- [ ] Add migration tests for pristine v1, populated foundation v1, strict v2 round-trip cloning, malformed pets, duplicate IDs, stale asset references, invalid numeric metadata, and stale active pet IDs.
- [ ] Change `SettingsStore` reads to retain migration status. When a valid primary is v1, validate the migrated v2 fully, atomically save the original valid v1 as backup, then atomically replace the primary with v2. If either write fails, leave the original primary recoverable and throw `SettingsRecoveryError` without file contents or paths.
- [ ] Extend persistence tests to prove successful migration, migration backup content, migration write failure safety, backup recovery from v1, and preservation of concurrent update semantics.
- [ ] Implement and test alpha bounds for transparent margins, a one-pixel subject, fully opaque alpha, all-transparent rejection, invalid buffer length, and both RGBA/BGRA layouts through configurable alpha offset.
- [ ] Implement and test normalization at 180 px, min/max target heights, per-asset scale, horizontal/vertical offsets, baseline offset, nonzero dimensions, and visible-bottom alignment across differently padded images.
- [ ] Implement and test every action slot, deterministic asset selection, all specified idle fallbacks, blink-frame sequence (`idle → blink → idle`), and missing-blink nod/breathe fallback.
- [ ] Implement and test state priority and transitions, including hidden dominance, drag interruption of hover/action, angry release, lower-priority rejection, completion back to idle, and future reserved priority ordering.
- [ ] Implement and test reusable drag velocity/threshold logic and single-versus-double click arbitration using injected timers.
- [ ] Run only the affected core tests, then commit the plan and core as `feat: define pet system core and settings schema`.

Targeted verification:

```bash
pnpm vitest run src/shared/contracts.test.ts src/main/settings/settings-store.test.ts src/shared/alpha-bounds.test.ts src/shared/image-normalization.test.ts src/shared/action-fallback.test.ts src/shared/pet-state-machine.test.ts src/shared/drag-gesture.test.ts src/shared/interaction-intents.test.ts
```

---

## Batch 2: PetPackService, Image Import, and Controlled Asset Access

**Files:**

- Create: `src/main/images/image-input.ts`
- Create: `src/main/images/image-input.test.ts`
- Create: `src/main/images/image-decoder.ts`
- Create: `src/main/pets/pet-pack-service.ts`
- Create: `src/main/pets/pet-pack-service.test.ts`
- Modify: `src/main/security/app-protocol.ts`
- Modify: `src/main/security/app-protocol.test.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**

- `detectImageFormat(bytes: Uint8Array): 'png' | 'webp' | null` checks PNG magic or RIFF/WEBP structure and never trusts the extension or supplied MIME.
- `validateImageFileSize(byteSize)` enforces `1..20 * 1024 * 1024`.
- `validateDecodedImage({ format, width, height, bitmap })` enforces nonempty decode, `1..8192` dimensions, exact four-byte pixel length, at least one visible pixel, and at least one non-opaque pixel; it returns alpha bounds.
- `ElectronImageDecoder.decode(bytes, expectedFormat)` calls `nativeImage.createFromBuffer(bytes, { scaleFactor: 1 })`, checks nonempty decoded size, obtains the supported-platform bitmap, and passes only decoded facts into pure validation. Supported Windows/macOS targets are little-endian and use alpha byte offset 3; the adapter rejects unexpected bitmap lengths.
- `PetPackService.createPet(name)`, `deletePet(petId)`, `importAssets(petId, sourcePaths)`, `updatePet(input)`, `setActivePet(petId)`, `getSnapshot()`, and `resolveAssetPath(petId, assetId)` own all pet data mutations.
- Imported copies live at `<userData>/pets/<petId>/assets/<generatedAssetId>.<png|webp>` with mode `0o600`; IDs and filenames are generated internally. Copy uses exclusive creation and cleanup on failure. Original paths are neither persisted nor logged.
- `PetSystemApi` exposes `getPetSystemSnapshot`, `createPet`, `deletePet`, `chooseAndImportPetAssets(petId)`, `updatePet`, `setActivePet`, `setTargetHeight`, `setPetVisibility`, `movePetBy`, `showPetContextMenu`, and `onPetSystemChanged`. It exposes no path, MIME, filesystem, generic IPC, shell, or command method.
- Controlled URLs use `app://renderer/pet-assets/<petId>/<assetId>`; protocol resolution delegates to `PetPackService.resolveAssetPath`, verifies the real path stays inside the generated asset directory, and returns 403/404 without revealing local paths.

- [ ] Test signature detection, empty/oversize file rejection, corrupt decode metadata, dimensions above 8192, missing partial transparency, all-transparent input, valid transparent input, and pack-size arithmetic at the 250 MiB boundary.
- [ ] Implement `ElectronImageDecoder` without adding a dependency. Keep file reads asynchronous; do not log bytes or source paths.
- [ ] Test `PetPackService` with an injected decoder and temporary user-data directory: safe generated names, successful multi-file import, per-file understandable failures without rolling back successful siblings, no settings mutation before the copy succeeds, pack-capacity rejection, cleanup after a failed save, ownership validation, and immutable copied bytes after metadata edits.
- [ ] Implement pet CRUD and metadata updates through `SettingsStore.update`. Require at least one mapped idle asset before `setActivePet`; deleting the active pet clears `activePetId` but does not affect other packs.
- [ ] Extend the application protocol with the controlled asset route and security tests for malformed IDs, cross-pet asset guesses, traversal, symlink escape, missing assets, and successful contained access.
- [ ] Define closed pet IPC channels and implement preload wrappers and event cleanup. Event subscriptions return an unsubscribe function and accept only the single documented change event.
- [ ] Run only the affected core tests, then commit as `feat: import and store transparent pet assets`.

Targeted verification:

```bash
pnpm vitest run src/main/images/image-input.test.ts src/main/pets/pet-pack-service.test.ts src/main/security/app-protocol.test.ts src/shared/contracts.test.ts src/main/settings/settings-store.test.ts
```

---

## Batch 3: Validated IPC, Window Interaction, and Active Pet Rendering

**Files:**

- Create: `src/main/ipc/register-pet-system-ipc.ts`
- Modify: `src/main/ipc/register-foundation-ipc.ts`
- Modify: `src/main/windows/window-manager.ts`
- Modify: `src/main/tray/tray-controller.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/src/interactions/use-pet-interactions.ts`
- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/global.css`

**Interfaces:**

- `WindowManager.getOwnedWindow(id)`, `movePetBy(dx, dy)`, `broadcastPetSystemChanged(snapshot)`, and `isPetVisible()` operate only on owned windows. Movement clamps finite deltas and relies on existing debounced placement persistence.
- `registerPetSystemIpc` validates the sender before every operation; pet mutation/import/context-menu methods are settings-window-only except movement and pet context menu, which are pet-window-only.
- The native picker is `dialog.showOpenDialog(settingsWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Transparent images', extensions: ['png', 'webp'] }] })`; returned paths remain inside the main process.
- Pet context menu has controlled `显示/隐藏`, `设置…`, and `退出 Dear Companion` commands supplied by composition callbacks.
- `PetShell` derives asset URL and `computeAssetGeometry` from the current snapshot, resolves click actions through `resolveAction`, and renders only transform/opacity animations and CSS overlays.

- [ ] Add `WindowManager` owned-window and bounded movement helpers without exposing a BrowserWindow or generic capability to preload.
- [ ] Register pet IPC after constructing `PetPackService`; validate exact payload fields with shared parsers, reject unknown fields/IDs, attach the native file picker only to the owned settings window, and broadcast a fresh snapshot after committed mutations.
- [ ] Update composition so the asset protocol receives the resolver before windows load, foundation visibility changes broadcast visibility state, tray state refreshes after pet changes, and every registration is cleaned up during quit/startup failure.
- [ ] Replace the native drag region with pointer-driven drag: pointer down enters `dragging`, movement sends bounded deltas, pointer up uses recent pure velocity samples, and a fast release enters `angry` for a short protest. Existing WindowManager persistence remains the only position store.
- [ ] Implement single-click cute and double-click petting with `ClickIntentArbiter`; double-click cancels the pending single action. Hover tilt uses only pointer coordinates relative to the pet window and never queries global cursor position.
- [ ] Schedule low-frequency idle breathing/nod/sway/cute actions with one timeout between short animations. Pause and clear timers while hidden or `document.visibilityState !== 'visible'`.
- [ ] Render explicit action assets when mapped and specified idle fallbacks otherwise. Blink scheduling switches `idle → blink → idle` only when a blink asset exists; without one, schedule nod/breathe and render no eyelid layer. Angry and crying fallbacks use controlled bubble/tear overlays.
- [ ] Add a right-click handler that suppresses the renderer menu and requests the native controlled menu. Respect reduced motion and keep animation properties to transform and opacity.
- [ ] Manually smoke-check the pet renderer in development mode, run typecheck plus the relevant core interaction tests, then commit as `feat: render and interact with the active pet`.

Targeted verification:

```bash
pnpm vitest run src/shared/action-fallback.test.ts src/shared/pet-state-machine.test.ts src/shared/drag-gesture.test.ts src/shared/interaction-intents.test.ts
pnpm typecheck
```

---

## Batch 4: Pet Settings Workflow and Documentation

**Files:**

- Modify: `src/renderer/src/windows/SettingsShell.tsx`
- Create: `src/renderer/src/components/PetAssetEditor.tsx`
- Create: `src/renderer/src/components/ActionSlotEditor.tsx`
- Modify: `src/renderer/src/styles/global.css`
- Modify: `docs/development.md`

**Interfaces:**

- Settings edits use whole validated `PetUpdateInput` values containing name, target height, asset normalization entries, slot assignments, and action template parameters. The main process resolves IDs against current persisted assets and returns the committed snapshot.
- Each preview uses the same `computeAssetGeometry` helper and controlled URL as the pet window, so alpha crop, visible height, offsets, and foot baseline match runtime rendering.
- Import returns `{ imported: PetAsset[]; failures: { reason: ImageImportErrorCode; message: string }[] }`; it never returns original source paths or file contents.

- [ ] Replace the foundation pet empty card with pet creation and selection. Validate nonblank 1–80 character names in the renderer for immediate feedback and again in the main process.
- [ ] Add native-picker import, per-file success/failure summaries, and clear Chinese messages for invalid type, corrupt decode, no transparency, fully transparent content, 20 MiB limit, 8192 px limit, and 250 MiB pack limit.
- [ ] Add asset previews based on alpha geometry with controls for scale, horizontal offset, vertical offset, and foot baseline. Constrain inputs to shared ranges and save non-destructive metadata only.
- [ ] Add assignment controls for idle, cute, petting, angry, crying, resting, and blink. Disable active-pet selection until idle has a valid mapped asset and explain why.
- [ ] Add the 80–260 px default character height control and current-active-pet selector. After successful changes, use the returned snapshot rather than optimistic persisted state.
- [ ] Preserve phase-one visibility and zero-reminder sections, privacy copy, load retry behavior, and settings-window singleton behavior.
- [ ] Update development documentation with schema v2 data layout, pet asset limits, phase-two manual checks, and explicit exclusions for later phases.
- [ ] Run typecheck and a focused development smoke check, then commit as `feat: add pet setup and normalization workflow`.

Targeted verification:

```bash
pnpm typecheck
```

---

## Phase-Two Completion Gate

- [ ] Run the full allowed suite once: `pnpm test`.
- [ ] Run static checks once: `pnpm lint` and `pnpm typecheck`.
- [ ] Run the production build once: `pnpm build`.
- [ ] Run a focused development manual check on the available macOS host: create a pet; import valid transparent PNG and WebP; verify understandable rejection for invalid/corrupt/opaque/oversize fixtures available locally; edit scale/offsets/baseline; map slots; select the active pet; restart; verify active pet/config/position recovery; exercise click/double-click competition, hover, drag, fast-drag anger, blink/fallback, hide/show pause, transparency, and native context menu.
- [ ] Record Windows-only and any fixture-dependent checks that cannot be executed; do not substitute UI automation.
- [ ] Inspect `git diff master...HEAD` exactly once for design-spec coverage, offline/privacy boundaries, IPC/resource authorization, migration/recovery behavior, action/state integration, and code quality.
- [ ] Consolidate all review findings into one fix pass, add a single coherent fix commit if changes are needed, and re-run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- [ ] Re-review only unresolved Critical or Important findings, if any.
- [ ] Confirm `git status --short` is clean, leave `codex/dear-companion-pet-system` unmerged, and preserve the worktree for user confirmation.

