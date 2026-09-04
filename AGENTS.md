# Dear Companion Repository Instructions

## Source of truth

- Read `docs/superpowers/specs/2026-07-31-dear-companion-design.md` before changing product behavior.
- Keep the first release inside that specification. Do not add cloud services, accounts, telemetry, automatic background removal, AI image generation, an animation timeline editor, or Linux support unless the specification is explicitly revised.
- When an implementation decision conflicts with the specification, stop and update the specification with the user before coding the conflicting behavior.

## Technology and architecture

- Use npm exclusively as the package manager (e.g., `npm run <script>`, `npm test`, `npm install`). Do not use `pnpm`, `yarn`, `bun`, or other package managers, and do not introduce alternative lockfiles (such as `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb`).
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

## UI/UX and microcopy principles

- **定位与语调**：作为面向家庭和日常桌面的轻量陪伴应用，文案应温和、自然、克制、真诚。避免把工具包装得过于严肃，也避免过度幼稚化。
- **拒绝“AI 味”与假大空**：
  - 严禁使用典型大模型营销套话与修饰词，如“专属打造”、“沉浸式体验”、“全方位守护”、“赋能专注”、“焕发全新生机”等。
  - 严禁空洞的假客套与客服腔，如“温馨提示”、“为了带给您更好的体验，请...”。有话直说，直接陈述事实或规则。
- **消除物理位置描述与操作废话**：
  - 严禁在界面文案中复述 UI 物理布局和手势，如“点击下方按钮添加”、“在左侧列表中选择伙伴进行编辑”、“如需修改请点击右侧”。
  - 空状态直接表达当前现状（如“还没有添加伙伴”），不把按钮的位置当操作指南念给用户听。
- **杜绝三层套娃与同义重复**：
  - 标签（Label）、副文案（Supporting copy）与气泡提示（Tooltip）分工明确：
    - **标签**：准确、精炼的名词，指示当前项目（如“显示高度”）。
    - **副文案 / 输入引导**：补充具体约束或建议范围（如“建议 180–240 px”）。
    - **Tooltip**：仅在存在隐性业务逻辑、生效机制或边界影响时才出现，绝不单纯把标签换个句子再复述一遍。
- **表单错误反馈保持克制轻量**：
  - 杜绝“Toast + 顶部横幅 + 输入框行内报错”的三层重复提示。
  - 校验失败时仅保留轻量全局 Toast（提示整体结论）与输入框下方的具体行内错误（定位具体字段与修复建议），不使用破坏页面布局与阅读流的顶部错误摘要横幅。保存校验失败时直接将焦点移动至首个出错字段。
- **消解工程与技术术语**：
  - 避免将技术实现细节与图形学术语暴露给普通用户（如“渲染视窗”、“Alpha 边界”、“Slot 槽位”、“数据持久化”）。
  - 使用贴近生活心智的词汇（如“桌面伙伴”、“照片主体”、“照片场景”、“本地保存”）。
- **气泡对白自然口语化、严防语义歧义**：
  - 伙伴对白保持生活碎片感与即时感，单句原则上不超过 10 个字，不长篇大论。
  - 状态与事件文案必须精准无歧义（例如休息结束庆祝时，必须明确表达“休息结束啦”，禁止使用“休息时间到啦”这类可被误解为“该开始休息了”的模糊表述）。
- **严防界面布局抖动（零累积布局偏移 / 防画面跳跃）**：
  - 条件展示的操作项（如根据编辑状态动态出现的“恢复默认”、“恢复内置对白”、“删除”等辅助操作按钮）：其所在的容器或行高必须通过 `min-height`、固定槽位（Slot）或预占位锁定高度与对齐方式，严禁因按钮出现/消失导致父级卡片高度变化或下方表单行上下突跳。
  - 动态状态文案与操作切换（如普通状态与二次确认状态切换）：容器应预留足够的横向与纵向尺寸，避免因文本换行或尺寸突增挤压左侧标题或引起整行内容重排。
  - 用户输入中的视窗稳定：用户正在聚焦输入的表单行，不得因输入过程中的校验态或辅助操作加载而发生尺寸突变或位移。

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
- For simple, low-impact requests or changes, do not write or require a specification or plan document. Once the user has approved the change, proceed directly to implementation. This does not waive the existing requirement to stay within the product specification or to stop when a proposed behavior conflicts with it.
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
