# Smooth Interaction Return Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan in one continuous session. Repository policy forbids per-task subagents and UI automation.

**Goal:** Remove the white flash and abrupt geometry jump when an interaction photo returns to the life-state photo.

**Architecture:** Keep photo loading and visual swap ownership inside `PhotoTransition`, and expose a narrow completion callback so `PetShell` can keep an asset-swap action stable until the return transition settles. Separate idle, covering, and revealing CSS classes so only an active transition owns photo-transition animation, while geometry changes interpolate on the persistent frame.

**Tech Stack:** React, TypeScript, CSS animations, Electron, Vite

## Global Constraints

- Keep the application fully offline and preserve original imported assets.
- Do not change action slots, life-state rules, normalization metadata, IPC surfaces, or supported platforms.
- Do not add UI unit tests, component tests, snapshots, browser tests, or automated end-to-end tests.
- Agent verification is limited to allowed core tests, lint, typecheck/build, and a non-visual Electron startup smoke check.
- UI appearance and motion remain awaiting manual user verification.

---

### Task 1: Coordinate action completion with the photo return

**Files:**

- Modify: `src/renderer/src/windows/PetShell.tsx`
- Modify: `src/renderer/src/components/PhotoTransition.tsx`

**Interfaces:**

- `PhotoTransition` consumes optional `onTransitionComplete?: (assetId: string) => void`.
- `PhotoTransition` calls the callback after the requested asset is displayed and the reveal phase has completed, and also when the requested asset is already current.
- `PetShell` keeps an asset-swap action active until the action duration has elapsed and the base asset transition has completed.

- [ ] Add a transition-completion callback to `PhotoTransition`, using refs so callback identity changes do not restart an in-flight image load.
- [ ] Make load failure settle the transition callback for the last successfully displayed asset without replacing it by a new blank frame.
- [ ] Split `PetShell` action completion into an elapsed-duration phase and, for asset swaps, a return-to-base phase completed by `PhotoTransition`.
- [ ] Ensure a newer action, drag, visibility change, life-state change, or runtime flow invalidates stale completion callbacks.
- [ ] Run `pnpm typecheck`; expect both TypeScript projects to pass.

### Task 2: Remove competing animations and smooth geometry changes

**Files:**

- Modify: `src/renderer/src/components/PhotoTransition.tsx`
- Modify: `src/renderer/src/styles/global.css`

**Interfaces:**

- Photo frame phase classes are `photo-idle`, `photo-outgoing`, and `photo-incoming`.
- Idle frames have no photo-transition animation.

- [ ] Render `photo-idle` during the steady state, `photo-outgoing` only while covering, and `photo-incoming` only while revealing.
- [ ] Add a short transition for `left`, `top`, `width`, and `height` on the persistent photo frame.
- [ ] Keep action transforms on the frame only while the action is active; the reveal animation owns the return transform after the image changes.
- [ ] Reduce the opacity and hard white appearance of bubble/cloud veil fills while preserving their existing variants.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Run the repository's non-visual Electron startup smoke check documented or scripted in the project.
- [ ] Review the full milestone diff once for specification compliance, privacy/security boundaries, integration, and code quality; apply one consolidated fix pass if needed, then repeat final verification.
- [ ] Commit the coherent implementation batch with message `fix: smooth interaction photo return`.

## Manual UI verification awaiting the user

- Trigger an interaction using a different photo and confirm the return has no white flash.
- Confirm size, position, and scale return smoothly to the life-state photo.
- Trigger interactions rapidly and drag during an interaction; confirm no stale transition or frozen action remains.
- Confirm bubble, cloud, and star transitions still conceal large pose changes.
