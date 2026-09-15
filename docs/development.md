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

The release-hardened runtime keeps lifecycle, multi-window orchestration, tray,
reminders, rest, pet packs, settings, audio, autostart, network policy, and
crash recovery in focused main-process modules. Settings schema v8 stores pet
configurations, immutable asset records, alpha bounds, non-destructive
normalization metadata, head hotspot geometry, simplified action slots (`idle`,
`resting`), life states (`drowsy`, `sleeping`, `workingAssetIds`), companion
pace, dialogue customization and voice bindings, quick dialogue references,
fixed and segmented interval reminder schedules, work schedules, and audio
metadata. Linear migration safely upgrades valid schemas from v1 through v7 to
v8; the original valid file is retained as the last-good backup before schema v8
atomically replaces the primary file.

### Multi-window architecture

The runtime manages three distinct transparent/singleton window types:

- **Pet window (`PetShell`)**: Transparent, borderless, always-on-top window
  rendering the active pet. Dynamic click-through (`setIgnoreMouseEvents` with
  forwarding) ensures transparent pixel regions do not block desktop clicks.
  Renders cartoon-physics body motion (breathing, weight-shift, tiptoe, stretch,
  peep-approach), smooth cross-fade photo transitions, hover tilts, dragging,
  and petting gestures in the designated head hotspot.
- **Bubble window (`BubbleShell`)**: Independent transparent, borderless,
  always-on-top window positioned dynamically relative to the pet (top/bottom
  clamped to visible screen bounds). Decoupled from the pet window to isolate
  rendering and hit-testing. Features auto-width text measurement, pet-extracted
  theme colors, dialogue display with tail positioning, and rest session
  controls with a persistent countdown and urge-to-rest cues.
- **Settings window (`SettingsShell`)**: Singleton modal settings dialog with 5
  organized tabs (伙伴管理, 行为与状态, 自定义对白, 声音与提醒, 使用指南).
  Remembers window bounds and restores smoothly upon tray or menu invocation.

### Asset and data management

Imported photo copies live under `userData/pets/<pet-id>/assets/` with generated
IDs; the application never persists or logs the user's source path. Only actual
PNG or WebP bytes are accepted. The decoded image must contain visible content
and at least one transparent pixel, each file is limited to 20 MiB and
8192×8192, and each pet pack is limited to 250 MiB. Renderers access assets only
through controlled `app://renderer/pet-assets/<pet-id>/<asset-id>` URLs.

Imported MP3, WAV, and OGG copies live under `userData/audio/assets/` with
generated IDs and mode `0600`. Dialogue voice recordings and imported audio
(MP3, WAV, OGG, WebM, M4A) are capped at 8 seconds for recordings and 5 MiB for
imports. General audio files are recognized by container signature, limited to
20 MiB, never retain the original path, and play for at most 30 seconds through
controlled `app://renderer/audio-assets/<asset-id>` URLs. A decode/playback
failure marks the copy unavailable and falls back to built-in tones. Reminder,
crying, and dialogue voice sounds are independently toggled and default to off.

### Reminders and rest sessions

Reminder occurrences use local calendar time rather than fixed 24-hour
intervals. Reminders support two modes:

- **Fixed time mode (`fixed`)**: Triggers at a specific calendar hour and minute.
- **Segmented interval mode (`interval`)**: Repeats at regular intervals (15–240
  min) across up to three user-defined time windows within the day.

Missing spring-forward times are skipped, repeated fall-back times share one
deterministic occurrence ID, sleep/resume does not catch up missed prompts, and
5/10/15-minute snoozes remain memory-only.

A live rest session also remains memory-only: it records an absolute `endsAt`,
samples cursor movement at about 250 ms, and never pauses, resets, or extends
the total rest end time after movement. If movement exceeds tolerance, an
urge-to-rest crying state is displayed; ongoing movement extends the visual
crying cue, which smoothly recovers ~3 seconds after motion stops, while the
underlying rest countdown runs undisturbed.

### System integration and security

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

The functional coverage list below verifies all key features:

1. Confirm first run opens the singleton settings window with zero reminders,
   all sounds off, and autostart off. Create a named pet and import
   user-prepared transparent PNG and WebP files through the native picker.
2. Confirm corrupt, opaque, fully transparent, wrong-format, over-20-MiB, and
   over-8192-pixel inputs show understandable per-file failures without losing
   successful sibling imports. Confirm the 250-MiB pack limit when suitable
   fixtures are available.
3. Preview alpha cropping and common visible height. Adjust scale, horizontal
   offset, vertical offset, and ground line (baseline), save, restart, and
   confirm the copied image bytes remain unchanged while the visual alignment
   persists.
4. Configure life states (daily companion, drowsy, sleeping, and optional
   working photos). Configure head hotspot geometry and confirm mouse
   hovering and reciprocating movement triggers petting feedback.
5. Exercise companion motions: breathing, weight shift, tiptoe, stretch,
   peep-approach, and body waddle. Verify smooth cross-fade transition when
   photos switch.
6. Verify single click, double click, hover tilt, normal drag, fast-drag
   protest, right-click menu, and 3-click gentle waking from sleep. Verify
   click-through on transparent areas of the pet window.
7. Test the dialogue system: customize owner address (`[称呼]`), edit built-in
   dialogues, add custom lines, record 8-second voice audio, use the waveform
   trimmer, and preview playback. Configure quick dialogues and trigger them
   from the companion context menu.
8. Create, edit, enable/disable, and delete reminders in both fixed-time and
   segmented interval modes. Confirm a new draft is not saved until explicit
   settings are configured and Save is pressed.
9. Exercise rest sessions: confirm countdown timer stability in the bubble
   window, manual end, sleep/resume, and mouse tolerance detection. Continuous
   mouse movement should extend the gentle urge-to-rest crying state and recover
   ~3 seconds after stopping without extending the total countdown.
10. Hide and show the pet from settings and tray. Confirm hidden pet temporarily
    appears during reminders and recovers state afterward. Confirm singleton
    settings window, bounds memory, and tray exit.
11. Move the pet near display edges or onto secondary monitors; confirm safe
    placement recovery after restart or display disconnect.
12. Verify built-in and imported sound sources, independent toggles, and
    silent fallback upon corrupt audio.
13. Repeat relevant behavior on supported Windows and macOS hosts. Use platform
    network inspection; the production bundle must make zero network requests.

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
