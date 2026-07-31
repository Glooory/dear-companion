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

Milestone 1 is a desktop foundation: it starts a hardened Electron shell,
persists local window visibility and placement, provides a singleton settings
window, and exposes show, hide, settings, and quit through the tray. The first
run has `activePetId: null`, so settings opens to the empty-state view with zero
reminders.

The visible pet is a temporary CSS development placeholder, and the tray uses
a temporary inline SVG asset. Both are foundation-only visuals; replace them
with the final pet rendering and platform icons in later milestones.

## Manual foundation checks

Run the unpacked application once from `release/` on a supported macOS or
Windows desktop, then verify:

1. The pet window is transparent, borderless, and stays above normal windows.
2. On first run, settings opens because `activePetId` is null and it reports
   zero reminders.
3. Reopening settings focuses the existing settings window instead of creating
   a second one; closing settings does not quit the application.
4. Hide and show the pet with the tray, restart the app, and confirm the saved
   visibility is restored.
5. Move the pet near a display edge, then remove or change that display; the
   pet falls back to a visible position on the remaining display.
6. Choose the tray exit command and confirm the application fully quits.
7. Use the platform network inspector or firewall while exercising these
   flows; the production bundle must make no network requests.

## Later milestones

Photo import, pet interactions and animations, reminders and rest sessions,
autostart, final pet and tray icons, installer packaging, and release
publishing are intentionally excluded from this foundation milestone. Do not
add cloud services, accounts, telemetry, remote assets, or automatic updates.
