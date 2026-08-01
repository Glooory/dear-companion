# Dear Companion Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` in one continuous session. Do not use `superpowers:subagent-driven-development`, per-task reviewers, or per-task review loops. Execute and commit the four coherent batches below, then perform one completion gate and one comprehensive milestone review.

**Goal:** Finish the first distributable offline release with reliable startup recovery, optional native autostart, final application/tray artwork, unsigned Windows and macOS installers, and a tag-driven GitHub Actions draft-release pipeline.

**Architecture:** Keep operating-system integration in narrow Electron main-process services and expose only typed, validated preload methods. Build Windows x64, macOS Intel, and macOS Apple Silicon installers on matching native GitHub-hosted runners. Treat the approved Q-style girl illustration as a static build asset only; production remains offline and contains no image-generation feature. Automated verification stops at core unit tests, lint, typecheck/build, and non-visual startup smoke checks; every visual, installer, autostart, performance, and OS-security-prompt result remains awaiting user verification.

**Tech Stack:** Node.js 24, pnpm 10.33, Electron 43, React 19, TypeScript 5.9, electron-vite, Vitest, ESLint, electron-builder, sharp, GitHub Actions, and GitHub CLI. Do not add an updater, telemetry, cloud service, browser automation, UI test framework, signing service, or runtime image-generation dependency.

## Global Constraints

- Read `AGENTS.md`, `docs/superpowers/specs/2026-07-31-dear-companion-design.md`, and the three completed milestone plans before implementation.
- Start from the current clean `master`, create `codex/dear-companion-release-hardening`, and use an isolated worktree through `superpowers:using-git-worktrees`.
- Do not modify the completed phase-three plan. If implementation would conflict with the design specification, stop and revise the specification with the user before coding.
- Supported artifacts are Windows 10/11 x64, macOS 13+ Intel, and macOS 13+ Apple Silicon. Do not add Linux or a macOS universal binary in this milestone.
- Production stays fully offline: no updater, remote page/script/asset, telemetry, account, network-dependent resource, or automatic background removal.
- Autostart and every sound remain off by default. Autostart must be user-controlled and must never register the development Electron executable.
- The first release is unsigned and not notarized. Never store certificates, passwords, Apple credentials, or imported user assets in the repository or workflow artifacts.
- The app icon is a generic, non-personal, cute Q-style cartoon girl. It must not be derived from the user's daughter photos. Generating this one static repository asset is not permission to add AI image generation to the product.
- Automated tests remain limited to necessary core state, parsing, recovery, and security helpers. Do not add UI, React, snapshot, Playwright, browser, installer, or automated end-to-end tests.
- Never open or control a browser or launch Electron for visual interaction. Installer behavior, native prompts, tray appearance, icon quality, window behavior, autostart, and performance are manual user checks and must be reported as `等待用户验证`.
- Execute continuously in four batches. During coding run only targeted allowed tests. At the end run the full allowed suite, lint, typecheck, production build, and one non-visual startup smoke check; then review the full milestone diff once and perform one consolidated fix pass.

---

## Planned File Structure

```text
.github/workflows/
├── ci.yml                                  # Normal branch validation
└── release.yml                             # Native tag builds and draft release
build/
├── icon.png                                # 1024px generic Q-style girl source icon
└── tray-icon.svg                           # Simple monochrome tray source
docs/
├── installing-unsigned.md                  # Safe Windows/macOS installation guide
├── release-checklist.md                    # Manual acceptance and performance record
└── release-process.md                      # Version, tag, draft, and publication flow
resources/tray/
├── trayTemplate.png                        # macOS 1x template image
├── trayTemplate@2x.png                     # macOS 2x template image
└── tray-win.png                            # Windows tray image
scripts/
├── generate-icons.mjs                      # Deterministic sharp conversion
└── validate-release-tag.mjs                # Exact package-version/tag validation
src/main/
├── app/
│   ├── crash-recovery.ts                   # Pure one-rebuild recovery budget
│   └── launch-intent.ts                    # Pure startup-argument parsing
├── autostart/autostart-service.ts          # Electron login-item adapter
├── ipc/register-release-hardening-ipc.ts   # Validated autostart API
└── security/network-policy.ts              # Production remote-request denial
```

Core tests live beside `crash-recovery.ts`, `launch-intent.ts`, `network-policy.ts`, and the release-tag validator when implemented as an importable pure module. Electron adapters, workflows, artwork, React presentation, and documentation receive no automated tests.

---

## Batch 1: Startup, Autostart, Offline Policy, and Crash Recovery

**Files:**

- Create: `src/main/app/launch-intent.ts`
- Create: `src/main/app/launch-intent.test.ts`
- Create: `src/main/app/crash-recovery.ts`
- Create: `src/main/app/crash-recovery.test.ts`
- Create: `src/main/autostart/autostart-service.ts`
- Create: `src/main/security/network-policy.ts`
- Create: `src/main/security/network-policy.test.ts`
- Create: `src/main/ipc/register-release-hardening-ipc.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/shared/contracts.test.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/windows/window-manager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/windows/SettingsShell.tsx`
- Modify: `src/renderer/src/styles/global.css`

**Autostart contract and behavior:**

- Add `AutostartStatus` with `supported`, `requested`, `effective`, and a sanitized optional error code; add `getAutostartStatus()` and `setAutostartEnabled(enabled)` to the narrow preload API.
- `AutostartService` uses `app.getLoginItemSettings()` and `app.setLoginItemSettings()` only when `app.isPackaged` and the platform is Windows or macOS. Development returns unsupported and never mutates OS login items.
- macOS uses the main app service and `openAtLogin`; do not use deprecated `openAsHidden`. Windows registers `process.execPath` with the single `--autostart` argument.
- When the user toggles autostart, change the OS setting first, read it back, then persist `autostartEnabled` only after success. If settings persistence fails, attempt to restore the previous OS value and return a sanitized failure.
- On ordinary startup, reconcile the persisted preference to the effective OS setting rather than silently re-enabling an entry the user disabled in System Settings or Task Manager.
- `parseLaunchIntent(argv, loginItemSettings)` recognizes only the owned `--autostart` flag and the macOS login-item signal. An autostart launch must not open Settings; it shows the pet only when an active pet exists and persisted visibility is true, otherwise it remains tray-only while reminders continue running.

**Recovery and offline boundaries:**

- `CrashRecoveryBudget` allows one automatic pet renderer rebuild after `render-process-gone`. A second failure in the same app lifetime enters a stable tray/settings-only safe state and must not loop. Reset the budget only after a newly created pet renderer reaches its ready state.
- `WindowManager` preserves settings, tray access, and current configuration during safe mode. Expose a sanitized status/retry path rather than renderer crash details.
- Attach production session handlers that deny `http:`, `https:`, `ws:`, and `wss:` requests and deny unexpected permission requests. Allow only the app's owned local protocol and required local development origins in development.
- `classifyApplicationUrl` is the pure test target. The Electron session adapter remains thin and untested.
- Do not add an auto-updater or any network fallback.

- [ ] Test launch-intent parsing for normal launch, Windows autostart, macOS login launch, unrelated arguments, repeated flags, and unsupported platforms.
- [ ] Test the crash budget for first rebuild, successful-ready reset, repeated failure safe mode, retry, and idempotent transitions.
- [ ] Test URL classification for owned app URLs, development localhost only when explicitly enabled, remote HTTP/WebSocket URLs, file URLs, malformed input, and lookalike schemes/hosts.
- [ ] Extend contract/input tests for exact autostart payloads, cloned status results, invalid booleans, and sanitized errors.
- [ ] Wire the settings toggle without UI tests and ensure startup/disposal removes every session, IPC, and renderer event listener it owns.
- [ ] Run the affected core tests and commit as `feat: harden startup and runtime recovery`.

Targeted verification:

```bash
pnpm vitest run src/main/app/launch-intent.test.ts src/main/app/crash-recovery.test.ts src/main/security/network-policy.test.ts src/shared/contracts.test.ts
```

---

## Batch 2: Final Artwork, Tray Resources, and Installer Configuration

**Files:**

- Create: `build/icon.png`
- Create: `build/tray-icon.svg`
- Create: `scripts/generate-icons.mjs`
- Create: `resources/tray/trayTemplate.png`
- Create: `resources/tray/trayTemplate@2x.png`
- Create: `resources/tray/tray-win.png`
- Modify: `src/main/tray/tray-controller.ts`
- Modify: `electron-builder.yml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` only if package metadata changes it
- Create: `docs/installing-unsigned.md`
- Create: `docs/release-process.md`

**Artwork requirements:**

- Use the image-generation skill once to create a static 1024×1024 transparent PNG: a friendly Q-style cartoon little girl, large readable face, simple silhouette, warm expression, restrained palette, no text, no logo, no realistic identity, and no personal reference photo.
- Keep important features inside a generous safe area so automatic ICNS/ICO conversion remains readable at small sizes. Record icon appearance as awaiting user verification; the agent must not inspect it through a browser or claim visual correctness.
- Create a separate monochrome tray-head silhouette. Do not reuse the colorful app icon as a macOS template image.
- `scripts/generate-icons.mjs` uses the existing `sharp` dependency to deterministically render the required tray PNG sizes. It must fail clearly when the source is absent and must not read user-imported assets.

**Packaging requirements:**

- Configure `directories.buildResources: build` and let electron-builder derive platform icons from `build/icon.png`.
- Include only the generated tray runtime directory through `extraResources`. Resolve tray assets from a development path or `process.resourcesPath` after packaging; set the macOS images as template images.
- Keep `asar: true`. Produce Windows NSIS x64 and macOS DMG artifacts selected by each native build job; use a stable artifact pattern such as `Dear-Companion-${version}-${os}-${arch}.${ext}`.
- Keep the NSIS installer assisted and per-user unless the existing specification explicitly requires otherwise. Do not add an updater or publish provider.
- Add complete package metadata needed by the native installers. Do not embed certificates or signing credentials.
- `docs/installing-unsigned.md` explains the normal Windows “More info / Run anyway” path and macOS right-click “Open” or Privacy & Security approval. Do not recommend disabling system security or recursively clearing quarantine attributes.
- `docs/release-process.md` documents unsigned status, future signing secret names, version/tag alignment, draft review, and manual publication. Signing/notarization remains inactive in this release.

- [ ] Generate and commit the static app/tray assets; do not add runtime generation code or a new dependency.
- [ ] Replace the temporary inline tray SVG while retaining a safe non-crashing missing-resource fallback.
- [ ] Run `pnpm icons:generate` twice and verify that the second run produces no git diff.
- [ ] Build unpacked output locally only as a non-visual packaging check; do not open or interact with the packaged app.
- [ ] Commit as `build: add release assets and installer configuration`.

Targeted verification:

```bash
pnpm icons:generate
git diff --exit-code -- resources/tray
pnpm typecheck
pnpm build
pnpm package:dir
```

---

## Batch 3: Native GitHub Actions Draft Releases

**Files:**

- Create: `scripts/validate-release-tag.mjs`
- Create: `scripts/validate-release-tag.test.ts` if the validator exposes nontrivial reusable parsing
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Modify: `package.json`
- Modify: `docs/release-process.md`

**Workflow topology:**

- Trigger on pushed tags matching `v*`, set minimal `contents: write` permission only where the release job needs it, and add tag-scoped concurrency to prevent duplicate release mutation.
- A validation job requires the tag to equal `v${package.json.version}` exactly and rejects malformed or mismatched tags before packaging.
- Build three native jobs:
  - Windows x64 on `windows-latest`.
  - macOS Intel on `macos-15-intel` with `--mac --x64`.
  - macOS Apple Silicon on `macos-15` with `--mac --arm64`.
- Each job checks out the tagged commit, installs the pinned pnpm/Node versions with a frozen lockfile, runs the allowed verification, builds the matching installer with `--publish never`, and runs the packaged executable in `DEAR_COMPANION_BUILD_SMOKE=1` mode without displaying or interacting with UI.
- On macOS, verify the packaged executable architecture with a command-line architecture check before uploading. Upload only installers and necessary release documents, never unpacked applications, imported pet/audio data, logs, settings, or credentials.
- An Ubuntu release job downloads the three artifacts, generates `SHA256SUMS.txt`, includes `INSTALLING-UNSIGNED.md`, and uses the preinstalled `gh` CLI to create a draft GitHub Release for the verified tag. If a draft already exists, upload with `--clobber` so a rerun is idempotent.
- Use official `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, and `actions/download-artifact` actions. Do not add a third-party release action.
- Reserve/document future secret names for macOS and Windows signing, but absent secrets must yield the intended unsigned artifacts and must never cause a signing prompt.

- [ ] Keep ordinary CI focused on lint, typecheck, allowed core unit tests, and production build for Windows/macOS.
- [ ] Implement tag validation and its unit test only if it contains reusable parsing beyond a direct script comparison.
- [ ] Add path quoting and artifact-existence checks that work with spaces in `Dear Companion` executable names.
- [ ] Validate workflow YAML and scripts locally without pushing a tag or attempting a live release.
- [ ] Commit as `ci: build unsigned draft releases`.

Targeted verification:

```bash
pnpm release:validate-tag -- v0.1.0
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The execution agent must not create or push a tag, publish a release, or claim hosted runner success. Those are repository-owner actions after the plan is merged and a remote exists.

---

## Batch 4: Release Acceptance, Performance Record, and Handoff

**Files:**

- Create: `docs/release-checklist.md`
- Modify: `docs/release-process.md`
- Modify: `docs/development.md`
- Modify: `README.md` if it exists and contains release/install guidance

**Documentation and acceptance:**

- Separate agent-verifiable checks from user-verifiable checks. Every UI/OS item starts as unchecked and labeled `等待用户验证`.
- Provide a compact table for each target: Windows x64, macOS Intel, and macOS Apple Silicon. Record OS version, artifact name, SHA-256 match, install/launch result, unsigned warning path, tray/icon appearance, and uninstall behavior.
- Manual functional checks cover first launch with zero reminders, pet-pack import, normalized display size, blink/action/fallback behavior, drag/position restore, tray/settings, reminder creation, snooze, rest countdown, cursor-triggered crying, optional audio, sleep/time recovery, autostart enable/disable across reboot/login, renderer recovery, offline operation, and multiple displays.
- Manual performance checks use Task Manager or Activity Monitor after a documented idle settling period and during representative action/rest activity. Record idle memory and CPU per platform against the specification targets of approximately 200 MiB memory and under 1% idle CPU; record and explain deviations rather than silently passing them.
- Document the first-release sequence: update `package.json` version, complete local automated checks, commit, create/push matching `vX.Y.Z` tag, wait for the native workflow, manually validate all three artifacts, inspect checksums/notes, then publish the draft.
- Make clear that a successful build or startup smoke check does not validate appearance, installer UX, autostart behavior, performance, or OS security prompts.

- [ ] Update development documentation to reflect final runtime modules, packaging commands, and the strict verification boundary.
- [ ] Ensure all release instructions use the generic version and also show `v0.1.0` as the first-release example.
- [ ] Run the milestone completion gate below once.
- [ ] Review the complete milestone diff once for specification compliance, security/privacy, cross-platform behavior, workflow permissions, artifact boundaries, recovery behavior, and code quality.
- [ ] Consolidate findings into one fix pass, rerun final verification once, and re-review only unresolved Critical or Important findings.
- [ ] Commit as `docs: add release acceptance and publishing guide`.

---

## Milestone Completion Gate

Run once after all four batches:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
DEAR_COMPANION_BUILD_SMOKE=1 pnpm exec electron out/main/index.js
git status --short
```

If `pnpm package:dir` is needed to prove packaged resource resolution, run it non-visually and use the same smoke environment against the packaged executable. Do not open the Electron window, a browser, an installer, or a local preview.

Expected automated handoff evidence:

- Allowed core unit suite passes.
- Lint passes.
- Typecheck and production build pass.
- Electron exits successfully in the non-visual startup smoke mode without an immediate startup failure.
- Final git status contains no accidental build output, packaged application, logs, settings, credentials, or imported personal assets.

Expected manual handoff status:

- All renderer appearance and interaction: `等待用户验证`.
- App and tray icon appearance: `等待用户验证`.
- Windows/macOS installer and unsigned security prompts: `等待用户验证`.
- Autostart across real login/reboot: `等待用户验证`.
- Windows/macOS performance and cross-platform acceptance: `等待用户验证`.
- Hosted tag workflow and draft GitHub Release: `等待用户验证` until the user pushes the first tag.

---

## Explicitly Deferred

- Code signing, Apple notarization, paid certificates, and automatic credential provisioning.
- Automatic update checks or update delivery.
- Linux packages or a macOS universal binary.
- Cloud services, accounts, sync, telemetry, remote assets, or crash upload.
- Automatic background removal, runtime AI image generation, animation timeline editing, and support for unprepared photos.
- Automated UI, browser, installer, autostart, performance, or end-to-end validation.

## Reference Documentation

- Electron login items: <https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows>
- electron-builder multi-platform builds: <https://www.electron.build/multi-platform-build.html>
- electron-builder icons: <https://www.electron.build/icons.html>
- GitHub-hosted runner labels: <https://docs.github.com/actions/using-github-hosted-runners/about-github-hosted-runners>
- GitHub workflow artifacts: <https://docs.github.com/actions/using-workflows/storing-workflow-data-as-artifacts>
- GitHub CLI release creation: <https://cli.github.com/manual/gh_release_create>
