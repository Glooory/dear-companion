# Development

## Prerequisites

- Node.js 24
- npm

## Commands

Run these commands from the repository root:

```bash
npm install
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm run icons:generate
npm run release:validate-tag -- v0.1.0
npm run package:dir
npm run dist
```

`npm run icons:generate` deterministically generates committed tray PNGs from
`build/tray-icon.svg`. `npm run package:dir` builds an unpacked current-platform
application, while `npm run dist` builds the current-platform installer. Neither
command publishes a release. `npm run release:validate-tag -- vX.Y.Z` requires an
exact match with `package.json`; `v0.1.0` is the first-release example.

## Architecture and scope

Follow the repository boundaries and security requirements in
[AGENTS.md](../AGENTS.md). The product direction, supported platforms, local
data rules, and security model are in the
[design specification](superpowers/specs/2026-07-31-dear-companion-design.md).

The release-hardened runtime keeps lifecycle, windows, tray, reminders, rest,
pet packs, settings, audio, autostart, network policy, and crash recovery in
focused main-process modules. Settings schema v3 stores pet names,
immutable asset records, alpha bounds,
non-destructive normalization metadata, action-slot assignments, and action
template parameters together with reminder schedules and audio metadata. A valid
schema v1 or v2 file migrates with zero reminders and built-in sound sources; the
original valid file is retained as the last-good backup before schema v3
atomically replaces the primary file.

Imported copies live under `userData/pets/<pet-id>/assets/` with generated IDs;
the application never persists or logs the user's source path. Only actual PNG
or WebP bytes are accepted. The decoded image must contain visible content and
at least one transparent pixel, each file is limited to 20 MiB and 8192×8192,
and each pet pack is limited to 250 MiB. Renderers access assets only through
controlled `app://renderer/pet-assets/<pet-id>/<asset-id>` URLs.

Reminder occurrences use local calendar time rather than fixed 24-hour
intervals. Missing spring-forward times are skipped, repeated fall-back times
share one deterministic occurrence ID, sleep/resume does not catch up missed
prompts, and 5/10/15-minute snoozes remain memory-only. A live rest session also
remains memory-only: it records an absolute `endsAt`, samples cursor movement at
about 250 ms, and never pauses, resets, or extends the end time after movement.

Imported MP3, WAV, and OGG copies live under `userData/audio/assets/` with
generated IDs and mode `0600`. Files are recognized by container signature,
limited to 20 MiB, never retain the original path, and play for at most 30
seconds through controlled `app://renderer/audio-assets/<asset-id>` URLs. A
decode/playback failure marks the copy unavailable and silently falls back to
the corresponding built-in tone. Reminder and crying sounds are independently
enabled per reminder and default to off.

Release hardening adds packaged-only, user-controlled autostart; exact launch
intent parsing; one-attempt pet renderer recovery with a stable safe mode;
production denial of remote HTTP/WebSocket and unexpected permission requests;
packaged tray resources; unsigned native installer configuration; and a
tag-driven three-platform draft-release workflow. No updater, signing service,
telemetry, account, remote asset, or runtime image-generation dependency is
present.

## User UI checklist — 等待用户验证

Use the reusable [release acceptance checklist](release-checklist.md) on
Windows x64, macOS Intel, and macOS Apple Silicon. Every renderer, icon, tray,
installer, autostart, performance, system-prompt, and cross-platform item is
`等待用户验证` until a user records it there.

All items below require manual user verification; agent checks do not validate
renderer appearance, native menus, input feel, platform prompts, or OS behavior.

The detailed phase-three list below remains useful for functional coverage:

1. Confirm first run opens the singleton settings window with zero reminders.
   Create a named pet and import user-prepared transparent PNG and WebP files
   through the native picker.
2. Confirm corrupt, opaque, fully transparent, wrong-format, over-20-MiB, and
   over-8192-pixel inputs show understandable per-file failures without losing
   successful sibling imports. Confirm the 250-MiB pack limit when suitable
   fixtures are available.
3. Preview alpha cropping and a common visible height. Change scale, horizontal
   offset, vertical offset, and foot baseline, save, restart, and confirm the
   copied image bytes remain unchanged while the visual alignment persists.
4. Assign at least one idle image and optional cute, petting, angry, crying,
   resting, and blink images. Set the active pet and confirm the transparent,
   borderless, always-on-top window displays the imported local asset.
   Delete a disposable pet and confirm its local copied assets are removed
   without affecting another configured pet.
5. Exercise single click, double click, hover tilt, ordinary drag, fast-drag
   protest, right-click menu, mapped blink, and missing-slot fallbacks. Verify
   the pending single click does not fire after a double click.
6. Hide and show the pet from settings and tray. Confirm hidden/invisible
   windows pause idle work, position and active pet survive restart, settings
   remains a singleton, and tray exit fully quits.
7. Move the pet near a display edge or onto a second display and confirm the
   phase-one safe-position recovery still works after restart/display removal.
8. Create, edit, enable/disable, and delete reminders. Confirm a new draft is
   not saved until an explicit time is selected and Save is pressed.
9. Confirm local-time triggering, deterministic simultaneous prompts, and
   5/10/15-minute snooze. Exercise countdown, manual end, sleep/resume, and
   sensitive/standard/relaxed movement; crying should last about three seconds
   without extending the timer.
10. Verify mapped and fallback rest/crying visuals, hidden-pet temporary prompt
    visibility, and the tray/context-menu “结束本次休息” action.
11. Verify built-in and imported MP3/WAV/OGG sound sources, independent sound
    toggles, the 30-second cap, and silent built-in fallback after a bad file.
12. Repeat relevant behavior on supported Windows and macOS hosts. Use the
   platform network inspector or firewall while exercising these
   flows; the production bundle must make no network requests.

## Agent verification boundary

Agent verification is limited to necessary core tests, lint, typecheck,
production build, deterministic asset generation, command-line packaging checks,
and a non-visual startup smoke environment. Agents do not open or control a
browser and do not open Electron for visual or interactive inspection.

Code signing, notarization, automatic updates, Linux, a universal macOS binary,
persistent prompt/snooze/session recovery, arbitrary thresholds or snooze
durations, input blocking, screen locking, background removal, runtime AI,
cloud services, accounts, telemetry, remote assets and statistics remain
explicitly deferred.
