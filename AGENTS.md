# Dear Companion Repository Instructions

## Source of truth

- Read `docs/superpowers/specs/2026-07-31-dear-companion-design.md` before changing product behavior.
- Keep the first release inside that specification. Do not add cloud services, accounts, telemetry, automatic background removal, AI image generation, an animation timeline editor, or Linux support unless the specification is explicitly revised.
- When an implementation decision conflicts with the specification, stop and update the specification with the user before coding the conflicting behavior.

## Technology and architecture

- Use Electron, React, TypeScript, Vite, and electron-builder.
- Keep application and business logic in TypeScript. Do not introduce Rust or another native language without an approved design change.
- Keep Electron main-process modules focused: lifecycle, windows, tray, reminders, rest sessions, pet packs, settings, audio, and autostart should remain separate responsibilities.
- Renderer processes must not access Node.js or Electron APIs directly. Expose only narrow, typed functions through the preload bridge.
- Keep the application fully offline. Production code must not add remote pages, remote scripts, telemetry, update checks, or network-dependent assets.
- Treat imported photos and audio as private local data. Never log file contents or unnecessary original paths.

## Scope and behavior constraints

- Windows 10/11 x64 and macOS 13+ on Intel and Apple Silicon are the supported targets.
- First installation has zero reminders. A reminder exists only after the user explicitly creates and enables it.
- Autostart and all sounds default to off.
- Rest mode never locks the computer or blocks user input.
- The app accepts only user-prepared transparent PNG/WebP images; it does not perform background removal.
- Preserve original imported assets. Normalization and alignment edits are non-destructive metadata.

## Code quality

- Prefer small, focused files with explicit TypeScript interfaces.
- Validate IPC senders and payloads in the main process. Do not expose generic `ipcRenderer`, filesystem, shell, or command execution APIs.
- Use asynchronous I/O in the main process. Avoid blocking work and unnecessary long-lived timers.
- Keep dependencies minimal. Prefer platform or web APIs already available in Electron when they meet the requirement.
- Use `rg` for repository searches and `apply_patch` for manual file edits.

## Testing policy

- Testing is risk-driven; blanket TDD and arbitrary coverage targets are not required.
- Test state transitions, reminder calculations, sleep/time recovery, cursor-movement thresholds, action fallbacks, configuration parsing/migration, and input validation rigorously. Use TDD for these when it improves the design.
- Use component tests for behavior-rich forms, reminder empty states, and critical bubbles or countdown UI.
- Prefer integration tests and manual cross-platform checks for transparent windows, tray behavior, native dialogs, drag feel, CSS animation quality, installers, and operating-system security prompts.
- Simple presentation components, one-off styles, and thin glue code do not need tests unless they have meaningful branching or regression risk.
- Before claiming a task complete, run the smallest relevant checks plus any broader checks justified by its risk.

## Git and generated files

- Keep commits small and aligned with independently testable deliverables.
- Do not commit `.superpowers/`, build output, packaged applications, local imported pet assets, logs, or user settings.
- Do not rewrite or discard unrelated user changes.
