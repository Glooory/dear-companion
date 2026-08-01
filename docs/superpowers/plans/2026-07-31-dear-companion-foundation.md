# Dear Companion Foundation Implementation Plan

> **For agentic workers:** Execute this plan in one session with batched plan execution. Do not use `superpowers:subagent-driven-development`, per-task reviewers, or per-task review loops. Steps use checkbox (`- [ ]`) syntax for progress only.

**Goal:** Establish a secure, fully TypeScript Electron application shell with a transparent pet window, on-demand settings window, local settings persistence, display-safe positioning, tray controls, and cross-platform CI.

**Architecture:** electron-vite builds separate main, preload, and React renderer bundles. The Electron main process owns all privileged behavior; a narrow typed preload bridge connects two renderer modes selected by the `window` query parameter. Focused services manage settings, windows, display placement, tray state, and lifecycle.

**Tech Stack:** Node.js 24, pnpm 10.33, Electron, electron-vite, React, TypeScript, Vite, electron-builder, Vitest, ESLint

## Global Constraints

- Read `AGENTS.md` and `docs/superpowers/specs/2026-07-31-dear-companion-design.md` before implementation.
- Supported targets are Windows 10/11 x64 and macOS 13+ on Intel and Apple Silicon.
- Keep all application and business logic in TypeScript; do not introduce Rust or another native language.
- Production code must remain fully offline and must not load remote scripts, pages, telemetry, update checks, or network assets.
- Renderer processes use `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and a restrictive Content Security Policy.
- First installation has zero reminders; autostart and all sounds default to off.
- The testing boundary is non-negotiable and overrides broader testing suggestions from workflows, skills, templates, reviews, or CI conventions. Write unit tests only for necessary core logic and reusable shared methods. Do not add UI unit tests, React component tests, Playwright tests, snapshots, or automated end-to-end tests. Use manual checks for UI and platform behavior; do not propose exceptions.
- The token-efficiency and review boundary is non-negotiable. Execute continuously in 3–5 coherent batches, perform no per-task review, run one comprehensive review after all milestone coding and verification, consolidate findings into one fix pass, and re-review only unresolved Critical or Important findings. This overrides skills or workflows that mandate finer-grained review.
- Do not add pet photo import, animation behavior, reminders, cursor monitoring, or release publishing in this milestone; later milestone plans own those features.
- Use one commit per coherent batch; do not create micro-commits for review mechanics.

---

## Milestone Sequence

This plan is milestone 1 of 4:

1. **Foundation:** secure Electron shell, settings persistence, windows, tray, display placement, CI.
2. **Pet system:** pet packs, transparent image normalization, action fallbacks, daily interactions, optional blink frame.
3. **Rest system:** reminder CRUD and scheduling, snooze, rest session, cursor tolerance, sleep/time recovery, audio.
4. **Release hardening:** autostart completion, installers, unsigned install guidance, performance profiling, cross-platform acceptance, tagged draft releases.

Write each later plan only after the previous milestone is implemented and reviewed so it can reference real interfaces and paths.

---

## Planned File Structure

```text
.
├── .github/workflows/ci.yml              # Windows/macOS quality and build matrix
├── AGENTS.md                              # Repository-wide implementation rules
├── electron-builder.yml                  # Installer metadata, no publishing yet
├── electron.vite.config.ts               # Main/preload/renderer build configuration
├── eslint.config.mjs                     # TypeScript and React lint rules
├── package.json                           # Scripts and pinned package-manager metadata
├── pnpm-lock.yaml                         # Reproducible dependency graph
├── tsconfig.json                          # Project references
├── tsconfig.node.json                     # Main/preload/tooling types
├── tsconfig.web.json                      # Renderer types
├── vitest.config.ts                       # Core TypeScript unit tests only
├── src
│   ├── main
│   │   ├── index.ts                       # Electron entry point and lifecycle composition
│   │   ├── ipc/register-foundation-ipc.ts # Narrow IPC handlers and sender validation
│   │   ├── security/app-protocol.ts       # Packaged renderer protocol and path containment
│   │   ├── settings/default-settings.ts   # Immutable v1 defaults
│   │   ├── settings/settings-store.ts     # Atomic settings read/write/recovery
│   │   ├── settings/settings-store.test.ts
│   │   ├── tray/tray-controller.ts        # Tray menu and commands
│   │   ├── windows/display-placement.ts   # Pure display selection/clamping logic
│   │   ├── windows/display-placement.test.ts
│   │   ├── windows/window-manager.ts      # Pet/settings BrowserWindow ownership
│   │   ├── windows/window-options.ts      # Testable secure BrowserWindow options
│   │   └── windows/window-options.test.ts
│   ├── preload
│   │   ├── index.ts                       # contextBridge implementation
│   │   └── index.d.ts                     # Window global augmentation
│   ├── renderer
│   │   ├── index.html                     # CSP and renderer root
│   │   └── src
│   │       ├── App.tsx                    # Select pet/settings renderer by window kind
│   │       ├── main.tsx                   # React bootstrap
│   │       ├── styles/global.css           # Transparent pet and normal settings bases
│   │       ├── windows/PetShell.tsx        # Development pet-shell placeholder
│   │       └── windows/SettingsShell.tsx   # Foundation status/settings view
│   └── shared
│       ├── contracts.ts                   # Serializable settings and API types
│       ├── contracts.test.ts              # Default/validation contract tests
│       └── ipc-channels.ts                 # Closed channel constants
└── docs/development.md                     # Local commands and milestone limitations
```

---

### Task 1: Bootstrap the Electron TypeScript Toolchain

**Files:**
- Create: `.nvmrc`
- Create: `package.json`
- Create: `pnpm-lock.yaml` via pnpm
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `vitest.config.ts`
- Create: `eslint.config.mjs`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: None.
- Produces: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test`; electron-vite output at `out/main`, `out/preload`, and `out/renderer`.

- [ ] **Step 1: Pin the local runtime and create package metadata**

Create `.nvmrc`:

```text
24
```

Create `package.json` with the stable metadata and scripts below; dependency fields are populated by the install command in Step 2:

```json
{
  "name": "dear-companion",
  "version": "0.1.0",
  "description": "A private, offline desktop photo companion",
  "main": "./out/main/index.js",
  "type": "module",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "pnpm typecheck && electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "package:dir": "pnpm build && electron-builder --dir",
    "dist": "pnpm build && electron-builder --publish never"
  }
}
```

- [ ] **Step 2: Install the minimal dependency set and generate the lockfile**

Run:

```bash
pnpm add react react-dom write-file-atomic
pnpm add -D electron electron-vite vite @vitejs/plugin-react typescript @types/node @types/react @types/react-dom @types/write-file-atomic electron-builder vitest eslint @eslint/js globals typescript-eslint eslint-plugin-react-hooks
```

Expected: `package.json` contains resolved version ranges and `pnpm-lock.yaml` is created. Do not add an updater, router, state-management library, schema library, or CSS framework.

- [ ] **Step 3: Add build and TypeScript configuration**

Create `electron.vite.config.ts`:

```ts
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
```

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["node", "electron-vite/node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] },
    "skipLibCheck": true
  },
  "include": ["electron.vite.config.ts", "vitest.config.ts", "src/main/**/*.ts", "src/preload/**/*.ts", "src/shared/**/*.ts"]
}
```

Create `tsconfig.web.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/src/*"],
      "@shared/*": ["src/shared/*"]
    },
    "skipLibCheck": true
  },
  "include": ["src/renderer/src/**/*.ts", "src/renderer/src/**/*.tsx", "src/preload/index.d.ts", "src/shared/**/*.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true
  }
})
```

- [ ] **Step 4: Add lint and packaging configuration**

Create `eslint.config.mjs`:

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/**', 'release/**', 'coverage/**', '.superpowers/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', '*.ts', '*.mjs'],
    languageOptions: { globals: globals.node }
  }
)
```

Create `electron-builder.yml`:

```yaml
appId: com.glooory.dearcompanion
productName: Dear Companion
directories:
  output: release
files:
  - out/**
asar: true
mac:
  category: public.app-category.lifestyle
  target:
    - dmg
    - zip
win:
  target:
    - target: nsis
      arch:
        - x64
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- [ ] **Step 5: Add build-only entry files**

Create `src/main/index.ts`:

```ts
import { app } from 'electron'

void app.whenReady().then(() => {
  if (process.env.DEAR_COMPANION_BUILD_SMOKE === '1') app.quit()
})
```

Create `src/preload/index.ts`:

```ts
export {}
```

Create `src/renderer/src/App.tsx` and `main.tsx`:

```tsx
// App.tsx
export function App(): React.JSX.Element {
  return <main>Dear Companion foundation</main>
}

// main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
```

Create `src/renderer/index.html` with `#root`, the CSP below, and `<script type="module" src="/src/main.tsx"></script>`.

The CSP must be:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'">
```

- [ ] **Step 6: Verify the toolchain**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm exec vitest run --passWithNoTests
pnpm build
```

Expected: all commands exit 0 and `out/main/index.js`, `out/preload/index.js`, and `out/renderer/index.html` exist.

- [ ] **Step 7: Commit the scaffold**

```bash
git add .nvmrc package.json pnpm-lock.yaml electron.vite.config.ts electron-builder.yml tsconfig.json tsconfig.node.json tsconfig.web.json vitest.config.ts eslint.config.mjs src
git commit -m "build: scaffold electron application"
```

---

### Task 2: Define Serializable Settings and the Typed Preload API

**Files:**
- Create: `src/shared/contracts.ts`
- Create: `src/shared/contracts.test.ts`
- Create: `src/shared/ipc-channels.ts`
- Modify: `src/preload/index.ts`
- Create: `src/preload/index.d.ts`

**Interfaces:**
- Consumes: Electron `contextBridge` and `ipcRenderer` from Task 1.
- Produces: `AppSettingsV1`, `AppSettings`, `WindowKind`, `FoundationApi`, `parseAppSettings(value: unknown): AppSettings`, `IPC_CHANNELS`, and `window.dearCompanion`.

- [ ] **Step 1: Write contract tests for safe defaults and invalid data**

Create `src/shared/contracts.test.ts` with tests asserting:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_SETTINGS, parseAppSettings } from './contracts'

describe('parseAppSettings', () => {
  it('uses privacy-preserving first-run defaults', () => {
    expect(DEFAULT_APP_SETTINGS).toEqual({
      schemaVersion: 1,
      activePetId: null,
      petWindow: { x: null, y: null, displayId: null, height: 180, visible: true },
      autostartEnabled: false,
      audio: { reminderEnabled: false, cryingEnabled: false },
      reminders: []
    })
  })

  it('rejects settings with a non-empty unknown reminder payload', () => {
    expect(() => parseAppSettings({ ...DEFAULT_APP_SETTINGS, reminders: [{}] })).toThrow(
      'Unsupported reminder data in schema version 1'
    )
  })
})
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm vitest run src/shared/contracts.test.ts`

Expected: FAIL because `contracts.ts` does not exist.

- [ ] **Step 3: Implement the versioned contracts and parser**

Create `src/shared/contracts.ts` with these exact public shapes:

```ts
export type WindowKind = 'pet' | 'settings'

export interface PetWindowSettings {
  x: number | null
  y: number | null
  displayId: string | null
  height: number
  visible: boolean
}

export interface AppSettingsV1 {
  schemaVersion: 1
  activePetId: string | null
  petWindow: PetWindowSettings
  autostartEnabled: boolean
  audio: { reminderEnabled: boolean; cryingEnabled: boolean }
  reminders: readonly []
}

export type AppSettings = AppSettingsV1

export interface FoundationApi {
  getSettings(): Promise<AppSettings>
  setPetVisibility(visible: boolean): Promise<AppSettings>
  openSettings(): Promise<void>
  getWindowKind(): WindowKind
}
```

Export a deeply frozen `DEFAULT_APP_SETTINGS`. Implement `parseAppSettings` with explicit property checks rather than a new schema dependency. Accept only `schemaVersion === 1`, booleans in their exact fields, nullable finite coordinates, `height` between 80 and 260, and an empty reminders array. Return a newly allocated object so callers cannot mutate parsed input.

- [ ] **Step 4: Define closed IPC channels and the preload wrapper**

Create `src/shared/ipc-channels.ts`:

```ts
export const IPC_CHANNELS = {
  getSettings: 'foundation:get-settings',
  setPetVisibility: 'foundation:set-pet-visibility',
  openSettings: 'foundation:open-settings',
  getWindowKind: 'foundation:get-window-kind'
} as const
```

Implement `src/preload/index.ts` so it exposes exactly one `FoundationApi` object as `window.dearCompanion`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { FoundationApi } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/ipc-channels'

const api: FoundationApi = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setPetVisibility: (visible) => ipcRenderer.invoke(IPC_CHANNELS.setPetVisibility, visible),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.openSettings),
  getWindowKind: () => ipcRenderer.sendSync(IPC_CHANNELS.getWindowKind)
}

contextBridge.exposeInMainWorld('dearCompanion', api)
```

Do not expose `send`, `invoke`, `on`, Electron objects, or channel names. The synchronous window-kind call is local, constant-time, and returns no user data; all other operations remain asynchronous.

Create `src/preload/index.d.ts`:

```ts
import type { FoundationApi } from '@shared/contracts'

declare global {
  interface Window {
    dearCompanion: FoundationApi
  }
}

export {}
```

- [ ] **Step 5: Run contract and type checks**

Run:

```bash
pnpm vitest run src/shared/contracts.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the contracts**

```bash
git add src/shared src/preload
git commit -m "feat: define foundation contracts and preload api"
```

---

### Task 3: Implement Atomic Local Settings Persistence

**Files:**
- Create: `src/main/settings/default-settings.ts`
- Create: `src/main/settings/settings-store.ts`
- Create: `src/main/settings/settings-store.test.ts`

**Interfaces:**
- Consumes: `AppSettings`, `DEFAULT_APP_SETTINGS`, and `parseAppSettings` from Task 2.
- Produces: `SettingsStore` with `load(): Promise<AppSettings>`, `save(settings: AppSettings): Promise<void>`, and `update(mutator: (current: AppSettings) => AppSettings): Promise<AppSettings>`.

- [ ] **Step 1: Write tests for first run, persistence, backup recovery, and serialized updates**

Use `mkdtemp`, a unique directory under `tmpdir()`, and cleanup in `afterEach`. Cover these behaviors:

```ts
it('returns defaults without writing on first load')
it('saves and reloads validated settings')
it('restores the backup when settings.json is corrupt')
it('throws when both primary and backup files are corrupt')
it('serializes concurrent updates so neither mutation is lost')
```

For concurrent updates, start two `store.update` calls without awaiting the first and assert the final state contains both the visibility and height changes.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm vitest run src/main/settings/settings-store.test.ts`

Expected: FAIL because `SettingsStore` does not exist.

- [ ] **Step 3: Implement defaults and the store**

Create `default-settings.ts` as a re-export of `DEFAULT_APP_SETTINGS` so the main process has a stable import boundary.

Implement `SettingsStore` with constructor `new SettingsStore(userDataPath: string)`. Use:

```text
<userDataPath>/settings.json
<userDataPath>/settings.backup.json
```

Rules:

1. `load` returns a cloned default when neither file exists.
2. `load` parses and validates the primary file.
3. If primary parsing fails, validate the backup, atomically restore it to primary, and return it.
4. If both present files fail, throw `SettingsRecoveryError` containing no raw file contents.
5. `save` validates before writing. If the existing primary is valid, atomically copy its serialized value to the backup, then atomically write the new primary with `write-file-atomic` and mode `0o600`.
6. `update` chains operations through a private promise queue and always returns the committed value.

Use this public skeleton and keep file parsing in private helpers:

```ts
export class SettingsStore {
  private updateQueue: Promise<void> = Promise.resolve()

  constructor(private readonly userDataPath: string) {}

  async load(): Promise<AppSettings> { /* read primary, then backup, then defaults */ }
  async save(settings: AppSettings): Promise<void> { /* validate, back up, atomic write */ }

  update(mutator: (current: AppSettings) => AppSettings): Promise<AppSettings> {
    const operation = this.updateQueue.then(async () => {
      const next = parseAppSettings(mutator(await this.load()))
      await this.save(next)
      return next
    })
    this.updateQueue = operation.then(() => undefined, () => undefined)
    return operation
  }
}
```

- [ ] **Step 4: Run tests and static checks**

Run:

```bash
pnpm vitest run src/main/settings/settings-store.test.ts
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit the settings store**

```bash
git add src/main/settings
git commit -m "feat: persist foundation settings safely"
```

---

### Task 4: Create Secure Window Options and the Application Protocol

**Files:**
- Create: `src/main/windows/window-options.ts`
- Create: `src/main/windows/window-options.test.ts`
- Create: `src/main/security/app-protocol.ts`
- Create: `src/main/windows/window-manager.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: electron-vite output paths and `WindowKind` from Task 2.
- Produces: `createPetWindowOptions(preloadPath: string): BrowserWindowConstructorOptions`, `createSettingsWindowOptions(preloadPath: string): BrowserWindowConstructorOptions`, `registerAppProtocol(rendererRoot: string): Promise<void>`, and `WindowManager` methods `showPet()`, `hidePet()`, `openSettings()`, `getWindowKind(webContentsId: number)`, `dispose()`.

- [ ] **Step 1: Write secure option tests**

Create tests that require these invariants:

```ts
expect(pet).toMatchObject({
  width: 320,
  height: 320,
  transparent: true,
  frame: false,
  resizable: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  show: false
})
expect(pet.webPreferences).toMatchObject({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true
})
expect(settings).toMatchObject({ width: 800, height: 640, show: false })
```

Also assert both windows receive the supplied preload path and neither enables `webviewTag`, `allowRunningInsecureContent`, or experimental features.

- [ ] **Step 2: Run the option tests and verify failure**

Run: `pnpm vitest run src/main/windows/window-options.test.ts`

Expected: FAIL because `window-options.ts` does not exist.

- [ ] **Step 3: Implement the option builders**

Return fresh option objects. Set pet background color to `#00000000`, disable the menu bar, and use a normal focusable window so clicks and drag interactions can be added later. Set the settings window minimum size to 680×520.

Use one shared secure preference object:

```ts
const secureWebPreferences = (preload: string): WebPreferences => ({
  preload,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  webviewTag: false
})
```

- [ ] **Step 4: Register a contained packaged-app protocol**

Before `app.whenReady`, register the `app` scheme as standard and secure. After readiness, `registerAppProtocol(rendererRoot)` must serve only files under the resolved renderer root.

For `app://renderer/index.html?window=pet`, resolve `/index.html` under `rendererRoot`; reject decoded paths containing null bytes or escaping the root; use `net.fetch(pathToFileURL(resolvedPath).toString())` only after containment succeeds. Return a `403` response for rejected paths and `404` for absent files.

The handler structure is:

```ts
protocol.handle('app', async (request) => {
  const url = new URL(request.url)
  if (url.host !== 'renderer') return new Response('Forbidden', { status: 403 })
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  const resolvedPath = resolve(rendererRoot, relativePath)
  if (relativePath.includes('\0') || !isPathInside(rendererRoot, resolvedPath)) {
    return new Response('Forbidden', { status: 403 })
  }
  try {
    return await net.fetch(pathToFileURL(resolvedPath).toString())
  } catch {
    return new Response('Not found', { status: 404 })
  }
})
```

Development windows load `${process.env.ELECTRON_RENDERER_URL}?window=pet` or `?window=settings`. Packaged windows load `app://renderer/index.html?window=pet` or `?window=settings`.

- [ ] **Step 5: Implement WindowManager**

`WindowManager` owns at most one pet window and one settings window. The pet window is created once and hidden instead of destroyed. The settings window is created on demand and set to `null` on `closed`. Both deny navigation and new windows. On `ready-to-show`, show only the window requested by the caller.

`getWindowKind(webContentsId)` returns the kind only for a currently owned webContents ID and throws for all other senders.

The class surface must stay:

```ts
export class WindowManager {
  private petWindow: BrowserWindow | null = null
  private settingsWindow: BrowserWindow | null = null

  async showPet(): Promise<void> { /* create once, then show */ }
  hidePet(): void { this.petWindow?.hide() }
  async openSettings(): Promise<void> { /* create or focus singleton */ }
  getWindowKind(webContentsId: number): WindowKind { /* exact owned-ID match */ }
  dispose(): void { /* remove listeners and destroy owned windows */ }
}
```

- [ ] **Step 6: Compose the first visible application**

Update `src/main/index.ts` to:

1. acquire a single-instance lock;
2. register the secure scheme before readiness;
3. create `SettingsStore(app.getPath('userData'))`;
4. register the packaged protocol;
5. create `WindowManager`;
6. show the pet window when `settings.petWindow.visible` is true;
7. open settings on first run when `activePetId === null`;
8. dispose windows on quit.

Compose dependencies in this order:

```ts
const settingsStore = new SettingsStore(app.getPath('userData'))
const windowManager = new WindowManager({ settingsStore, preloadPath, rendererRoot })
const settings = await settingsStore.load()
if (settings.petWindow.visible) await windowManager.showPet()
if (settings.activePetId === null) await windowManager.openSettings()
```

At this milestone the settings shell and transparent pet placeholder may appear together on first run. Later pet-pack work replaces that placeholder.

- [ ] **Step 7: Verify unit checks and visually smoke-test development mode**

Run:

```bash
pnpm vitest run src/main/windows/window-options.test.ts
pnpm typecheck
pnpm build
pnpm dev
```

Expected: tests and build pass; a transparent 320×320 pet window and an 800×640 settings window appear; neither has DevTools opened automatically. Close the app from the terminal after checking.

- [ ] **Step 8: Commit secure window creation**

```bash
git add src/main
git commit -m "feat: create secure application windows"
```

---

### Task 5: Keep the Pet Window on a Visible Display

**Files:**
- Create: `src/main/windows/display-placement.ts`
- Create: `src/main/windows/display-placement.test.ts`
- Modify: `src/main/windows/window-manager.ts`

**Interfaces:**
- Consumes: Electron `Display.bounds`/`workArea`, stored `PetWindowSettings`, and `SettingsStore.update`.
- Produces: `Rect`, `DisplaySnapshot`, `chooseDisplay(displays, savedDisplayId, savedPoint)`, and `clampRectToWorkArea(rect, workArea, margin = 8)`.

- [ ] **Step 1: Write boundary tests**

Cover:

```ts
it('uses the saved display when it still exists')
it('uses the display containing the saved point when the id changed')
it('falls back to the primary display when the saved display disappeared')
it('keeps every edge inside the work area with an 8 DIP margin')
it('places a missing position at the primary work-area bottom-right')
```

Use negative coordinates in one fixture to represent a monitor to the left of the primary display.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm vitest run src/main/windows/display-placement.test.ts`

Expected: FAIL because the placement module does not exist.

- [ ] **Step 3: Implement pure placement functions**

Use only plain serializable rectangles and display snapshots. Do not import Electron into the pure module. A 320×320 pet window with no saved location should resolve to:

```ts
{
  x: workArea.x + workArea.width - 320 - 8,
  y: workArea.y + workArea.height - 320 - 8,
  width: 320,
  height: 320
}
```

- [ ] **Step 4: Integrate placement and persistence**

Before showing the pet, map `screen.getAllDisplays()` to `DisplaySnapshot`, choose a display, clamp the bounds, then call `setBounds`.

Listen for pet-window `moved` and `resized` events. Debounce persistence by 250 ms and update `x`, `y`, and the nearest display ID. On `display-removed` and `display-metrics-changed`, re-clamp the pet immediately. Cancel pending debounce timers during disposal.

Keep the Electron adapter thin:

```ts
const persistBounds = debounce(async () => {
  const [x, y] = petWindow.getPosition()
  const nearest = screen.getDisplayNearestPoint({ x, y })
  await settingsStore.update((current) => ({
    ...current,
    petWindow: { ...current.petWindow, x, y, displayId: String(nearest.id) }
  }))
}, 250)
```

- [ ] **Step 5: Verify logic and dual-display behavior**

Run:

```bash
pnpm vitest run src/main/windows/display-placement.test.ts
pnpm typecheck
pnpm dev
```

Expected: unit tests pass. Manual check: drag the placeholder partly off screen and restart; it returns fully visible. If a second display is available, move the pet there, disconnect it, and confirm fallback to the primary display.

- [ ] **Step 6: Commit display-safe placement**

```bash
git add src/main/windows
git commit -m "feat: persist safe pet window placement"
```

---

### Task 6: Register Validated Foundation IPC

**Files:**
- Create: `src/main/ipc/register-foundation-ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/windows/window-manager.ts`

**Interfaces:**
- Consumes: `IPC_CHANNELS`, `SettingsStore`, and `WindowManager` from earlier tasks.
- Produces: `registerFoundationIpc({ settingsStore, windowManager }): () => void`, returning a cleanup function that removes only its own handlers.

- [ ] **Step 1: Implement sender validation before privileged work**

For every handler, call `windowManager.getWindowKind(event.sender.id)`. Reject unknown IDs before reading settings or changing windows. Do not validate by a string prefix alone.

Handler behavior:

```text
foundation:get-settings       -> validated AppSettings
foundation:set-pet-visibility -> require boolean, persist, show/hide, return settings
foundation:open-settings      -> open/focus settings, return void
foundation:get-window-kind    -> 'pet' | 'settings'
```

The visibility handler must persist first; if persistence fails, do not change the current window state.

Register handlers explicitly:

```ts
ipcMain.handle(IPC_CHANNELS.getSettings, (event) => {
  windowManager.getWindowKind(event.sender.id)
  return settingsStore.load()
})

ipcMain.handle(IPC_CHANNELS.setPetVisibility, async (event, visible: unknown) => {
  windowManager.getWindowKind(event.sender.id)
  if (typeof visible !== 'boolean') throw new TypeError('visible must be a boolean')
  const settings = await settingsStore.update((current) => ({
    ...current,
    petWindow: { ...current.petWindow, visible }
  }))
  if (visible) await windowManager.showPet()
  else windowManager.hidePet()
  return settings
})
```

- [ ] **Step 2: Compose registration and cleanup**

Register the three asynchronous channels with `ipcMain.handle`. Register `getWindowKind`, which backs the preload's local synchronous lookup, with a named `ipcMain.on` listener that assigns `event.returnValue`. Register everything once after WindowManager construction. Invoke the returned cleanup function during `before-quit`. Ensure second-instance activation shows the pet and focuses settings if it is already open.

Cleanup removes only the functions registered by this module:

```ts
return () => {
  ipcMain.removeHandler(IPC_CHANNELS.getSettings)
  ipcMain.removeHandler(IPC_CHANNELS.setPetVisibility)
  ipcMain.removeHandler(IPC_CHANNELS.openSettings)
  ipcMain.removeListener(IPC_CHANNELS.getWindowKind, getWindowKindListener)
}
```

- [ ] **Step 3: Run static and build checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: PASS. This task has thin wiring and explicit validation but no separate unit test requirement.

- [ ] **Step 4: Commit IPC registration**

```bash
git add src/main/ipc src/main/index.ts src/main/windows/window-manager.ts
git commit -m "feat: register validated foundation ipc"
```

---

### Task 7: Build the Pet and Settings Renderer Shells

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/styles/global.css`
- Create: `src/renderer/src/windows/PetShell.tsx`
- Create: `src/renderer/src/windows/SettingsShell.tsx`

**Interfaces:**
- Consumes: `window.dearCompanion.getWindowKind()`, `getSettings()`, `setPetVisibility()`, and `openSettings()`.
- Produces: separate pet/settings render trees without a routing dependency.

- [ ] **Step 1: Implement the settings shell**

Render these foundation sections only:

- Header: `Dear Companion` and `本地离线桌面伙伴`.
- Empty pet card: `还没有添加宠物照片` and disabled `下一阶段添加照片` button.
- Reminder card: `尚未设置提醒` with explanatory copy; no reminder creation UI yet.
- Foundation controls: pet visibility toggle and a read-only default height value of `180 px`.
- Privacy note: `照片和设置只保存在这台电脑上`.

Use local loading and error state. Do not add a component framework or global state library.

Keep the Electron API behind an explicit prop boundary:

```tsx
export function SettingsShell({ api }: { api: FoundationApi }): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  // load once; update the visibility toggle only after the Promise resolves
  return <main aria-busy={settings === null}>{/* exact sections listed above */}</main>
}
```

- [ ] **Step 2: Implement the pet shell placeholder**

The pet shell contains a CSS-only rounded silhouette labeled `Dear Companion` and a small `设置` button that calls `openSettings`. It is a development/foundation placeholder, not a permanent bundled pet.

Pet-window CSS requirements:

```css
html[data-window='pet'],
html[data-window='pet'] body,
html[data-window='pet'] #root {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
}
```

Settings mode uses an opaque neutral background. Respect `prefers-reduced-motion`; the placeholder must not animate when reduced motion is requested.

- [ ] **Step 3: Select the shell by the trusted preload value**

`App` calls `getWindowKind()` synchronously, sets `document.documentElement.dataset.window`, and renders only the matching shell. It must not trust the query string directly.

```tsx
export function App(): React.JSX.Element {
  const kind = window.dearCompanion.getWindowKind()
  document.documentElement.dataset.window = kind
  return kind === 'pet'
    ? <PetShell api={window.dearCompanion} />
    : <SettingsShell api={window.dearCompanion} />
}
```

- [ ] **Step 4: Run static and manual visual checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm dev
```

Expected: static checks pass. Manual check: the empty pet card and zero-reminder copy render correctly; pet background is transparent; settings is opaque; the settings button focuses a single settings window; the visibility toggle hides the pet only after persistence succeeds and remains correct after restart. Review the error branch to confirm it preserves the current toggle when persistence rejects.

- [ ] **Step 5: Commit renderer shells**

```bash
git add src/renderer
git commit -m "feat: add pet and settings application shells"
```

---

### Task 8: Add Tray Controls and Desktop Lifecycle Behavior

**Files:**
- Create: `src/main/tray/tray-controller.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/windows/window-manager.ts`

**Interfaces:**
- Consumes: `WindowManager`, `SettingsStore`, and a packaged tray icon path supplied by the composition root.
- Produces: `TrayController.create()`, `TrayController.refresh(settings)`, and `TrayController.dispose()`.

- [ ] **Step 1: Implement the tray menu**

Create one Tray instance with menu items:

```text
显示宠物 / 隐藏宠物  (label reflects persisted visibility)
设置…
separator
退出 Dear Companion
```

Visibility actions persist first and then show/hide, matching IPC semantics. Clicking the tray icon on Windows shows the pet; clicking it on macOS opens the menu. Use a simple temporary monochrome tray asset created from an inline nativeImage data URL; the release-hardening milestone replaces it with final platform icons.

Keep menu creation state-derived:

```ts
const menu = Menu.buildFromTemplate([
  {
    label: settings.petWindow.visible ? '隐藏宠物' : '显示宠物',
    click: () => void setVisibility(!settings.petWindow.visible)
  },
  { label: '设置…', click: () => void windowManager.openSettings() },
  { type: 'separator' },
  { label: '退出 Dear Companion', click: requestQuit }
])
tray.setContextMenu(menu)
```

The composition root supplies `requestQuit`, which sets `isQuitting = true` before calling `app.quit()`.

Define the foundation-only icon in the same file so there is no missing binary asset:

```ts
const traySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="black"/><circle cx="6" cy="7" r="1" fill="white"/><circle cx="10" cy="7" r="1" fill="white"/></svg>'
const trayIcon = nativeImage.createFromDataURL(
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(traySvg)}`
)

- [ ] **Step 2: Make closing behavior explicit**

- Closing the settings window destroys only that window.
- The transparent pet window has no normal close button and remains owned until app quit.
- `window-all-closed` does not quit because the tray may be the only visible surface.
- Only the tray `退出` action or an operating-system quit event sets `isQuitting = true` and calls `app.quit()`.
- macOS `activate` shows the pet and opens settings only when no pet is configured.

- [ ] **Step 3: Verify lifecycle manually**

Run: `pnpm dev`

Expected: closing settings leaves the tray and pet alive; hiding the pet leaves the tray alive; `设置…` reopens one settings window; `退出 Dear Companion` terminates every process.

Run afterward:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Commit tray and lifecycle support**

```bash
git add src/main/tray src/main/index.ts src/main/windows/window-manager.ts
git commit -m "feat: add tray and desktop lifecycle"
```

---

### Task 9: Add Cross-Platform CI and Development Documentation

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docs/development.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: all package scripts from Task 1.
- Produces: reproducible Windows/macOS validation on pull requests and main-branch pushes; local onboarding documentation.

- [ ] **Step 1: Extend ignored generated files**

Add:

```gitignore
node_modules/
out/
release/
coverage/
*.log
.DS_Store
```

Keep the existing `.superpowers/` rule.

- [ ] **Step 2: Create the CI matrix**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [master, main]

jobs:
  validate:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

Do not package installers or publish releases in this milestone.

- [ ] **Step 3: Document development and current limitations**

Create `docs/development.md` covering:

- prerequisites: Node 24 and pnpm 10.33;
- commands: install, dev, test, lint, typecheck, build, package directory;
- architecture links to `AGENTS.md` and the design spec;
- the milestone-1 behavior and temporary CSS pet/tray assets;
- manual checks for transparency, settings singleton, tray, restart persistence, and display fallback;
- explicit note that photo import, interactions, reminders, autostart, final icons, packaging, and publishing belong to later milestones.

- [ ] **Step 4: Run the complete local foundation verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm package:dir
```

Expected: all commands exit 0. `release/` contains an unpacked application for the current platform and remains ignored by Git.

Manual verification:

1. Launch the packaged directory application.
2. Confirm no network requests are made.
3. Confirm first run shows settings because `activePetId` is null.
4. Confirm settings says there are zero reminders.
5. Confirm pet visibility persists across restart.
6. Confirm settings remains a singleton and tray exit fully quits.

- [ ] **Step 5: Commit CI and documentation**

```bash
git add .github/workflows/ci.yml docs/development.md .gitignore
git commit -m "ci: validate foundation on windows and macos"
```

---

## Milestone 1 Acceptance Gate

Do not begin the pet-system plan until all of the following are true:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm package:dir` pass locally.
- Windows and macOS GitHub Actions validation passes.
- Renderer security options match the tested invariants.
- Settings first-run defaults contain no reminders, sounds are off, and autostart is off.
- Corrupt primary settings recover from a valid backup without losing the last good configuration.
- Pet position is fully visible after restart, monitor removal, and negative-coordinate display layouts.
- Pet visibility persists; settings is a singleton; closing settings does not quit; tray exit does quit.
- The production bundle makes no network requests.
- The temporary pet/tray visuals are clearly documented as foundation-only assets.

After this gate passes, write `docs/superpowers/plans/2026-07-31-dear-companion-pet-system.md` against the implemented interfaces rather than pre-planning it from assumptions.
