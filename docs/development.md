# Development

## Prerequisites

- Node.js 24
- pnpm 10.33.0 (the repository pins this version through `packageManager`)

## Commands

Run these commands from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm package:dir
```

`pnpm package:dir` builds an unpacked application in `release/` for local
smoke testing. It does not create installers, publish a release, or perform
any network-based update or telemetry work.

## Architecture and scope

Follow the repository boundaries and security requirements in
[AGENTS.md](../AGENTS.md). The product direction, supported platforms, local
data rules, and security model are in the
[design specification](superpowers/specs/2026-07-31-dear-companion-design.md).

Milestone 2 adds the offline pet system on top of the hardened desktop shell.
Settings schema v2 stores pet names, immutable asset records, alpha bounds,
non-destructive normalization metadata, action-slot assignments, and action
template parameters. A valid schema v1 file migrates in memory and is retained
as the last-good backup before schema v2 atomically replaces the primary file.

Imported copies live under `userData/pets/<pet-id>/assets/` with generated IDs;
the application never persists or logs the user's source path. Only actual PNG
or WebP bytes are accepted. The decoded image must contain visible content and
at least one transparent pixel, each file is limited to 20 MiB and 8192×8192,
and each pet pack is limited to 250 MiB. Renderers access assets only through
controlled `app://renderer/pet-assets/<pet-id>/<asset-id>` URLs.

## Manual phase-two checks

Run the unpacked application once from `release/` on a supported macOS or
Windows desktop, then verify:

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
5. Exercise single click, double click, hover tilt, ordinary drag, fast-drag
   protest, right-click menu, mapped blink, and missing-slot fallbacks. Verify
   the pending single click does not fire after a double click.
6. Hide and show the pet from settings and tray. Confirm hidden/invisible
   windows pause idle work, position and active pet survive restart, settings
   remains a singleton, and tray exit fully quits.
7. Move the pet near a display edge or onto a second display and confirm the
   phase-one safe-position recovery still works after restart/display removal.
8. Use the platform network inspector or firewall while exercising these
   flows; the production bundle must make no network requests.

## Later milestones

Reminders, rest sessions, rest cursor monitoring, audio, autostart, final tray
icons, installer publishing, and releases remain later milestones. This phase
does not add background removal, face detection, AI image generation, an
animation timeline, Linux support, cloud services, accounts, telemetry, remote
assets, or automatic updates.
