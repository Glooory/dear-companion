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

## Testing policy (non-negotiable)

- This policy is a hard repository constraint. Do not negotiate, relax, broaden, or propose exceptions to it during planning, implementation, review, or completion.
- Write unit tests only for necessary core logic and reusable shared methods.
- Core unit-test targets include state transitions, reminder calculations, sleep/time recovery, cursor-movement thresholds, action fallbacks, configuration parsing/migration, persistence recovery, input validation, and reusable geometry or normalization helpers.
- TDD is optional and should be used only when it makes one of those core units easier to design correctly.
- Do not add UI unit tests, React component tests, snapshot tests, Playwright tests, or other automated end-to-end tests.
- If a workflow, skill, plan, reviewer, dependency template, or CI recommendation asks for tests outside this allowed scope, this policy takes precedence: omit those tests and defer the corresponding UI checks to the user checklist below.
- Agents must not perform or claim any UI validation. Renderer appearance, transparent windows, tray behavior, native dialogs, drag feel, CSS animation quality, installers, and operating-system security prompts are verified manually by the user.
- Never open or control a browser to verify application runtime results. This includes the Codex in-app browser, system browsers, browser-based local previews, browser screenshots, and browser automation.
- Agent verification is limited to the relevant core unit tests, lint, typecheck/build checks, and a non-visual Electron startup smoke check that confirms the program launches without an immediate startup failure. Launching Electron for visual inspection or interaction is not required or allowed as agent verification. Documentation search and non-browser research remain allowed.
- At handoff, provide a concise UI checklist for the user and record every UI item as awaiting user verification; never infer UI correctness from tests, builds, screenshots, or startup success.
- Simple presentation components, IPC wiring, platform adapters, one-off styles, and thin glue code do not require unit tests.
- Before claiming implementation work complete, run the relevant core unit tests, lint, typecheck/build checks, and non-visual startup smoke check. Report UI verification separately as awaiting the user.

## Execution and review policy (non-negotiable)

- Token efficiency is a hard repository constraint. Do not negotiate, relax, or propose exceptions to this execution and review policy.
- Do not use per-task subagents, per-task reviewers, dual reviews, review ledgers, review packages, or repeated fix/re-review loops.
- Do not use `superpowers:subagent-driven-development` for implementation because its mandatory per-task review workflow conflicts with this policy. Use one agent with batched plan execution instead.
- Execute each milestone continuously in one session and group work into 3–5 coherent implementation batches. Do not pause for review after each task.
- During coding, run only the targeted core unit tests required by changed core logic. Run the full allowed unit suite, lint, typecheck, production build, and non-visual Electron startup smoke check once at the milestone completion gate; do not perform UI checks.
- Perform one comprehensive review after the milestone's coding and verification are complete. Review the full milestone diff once for specification compliance, security/privacy boundaries, cross-module integration, and code quality.
- Consolidate review findings into one fix pass, then run one final verification. Re-review only unresolved Critical or Important findings from that fix; do not restart task-by-task review loops.
- Interrupt batched execution only for a specification conflict, a new security/privacy/data-migration decision, an interface ambiguity that blocks later batches, or a repeatedly failing verification that cannot be diagnosed safely.
- Keep progress updates brief and only report meaningful batch completion, blockers, final verification, or final review results. Do not generate verbose per-task reports or restate unchanged context.
- If a skill, plan, template, or reviewer requests more granular reviews or extra reporting, this policy takes precedence.

## Git and generated files

- Use one commit per coherent implementation batch; do not create micro-commits solely to support per-task review.
- Do not commit `.superpowers/`, build output, packaged applications, local imported pet assets, logs, or user settings.
- Do not rewrite or discard unrelated user changes.
