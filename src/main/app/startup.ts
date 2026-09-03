import type { AppSettings } from "../../shared/contracts";

interface StartupSettingsStore {
  load(): Promise<AppSettings>;
}

interface StartupTray {
  create(): void;
  refresh(settings: AppSettings): void;
}

interface PrepareTrayOptions {
  settingsStore: StartupSettingsStore;
  tray: StartupTray;
  isQuitting: () => boolean;
}

type StartupIntent = "second-instance" | "activate";

interface StartupIntentHandlers {
  secondInstance: () => void;
  activate: () => void;
}

interface FailedStartupActions {
  cleanup: () => void;
  report: () => void;
  quit: () => void;
}

export class StartupIntentQueue {
  private ready = false;
  private readonly pending = new Set<StartupIntent>();

  constructor(private readonly handlers: StartupIntentHandlers) {}

  request(intent: StartupIntent): void {
    if (this.ready) {
      this.run(intent);
      return;
    }
    this.pending.add(intent);
  }

  markReady(): void {
    if (this.ready) return;
    this.ready = true;

    for (const intent of ["second-instance", "activate"] as const) {
      if (!this.pending.delete(intent)) continue;
      this.run(intent);
    }
  }

  reset(): void {
    this.ready = false;
    this.pending.clear();
  }

  private run(intent: StartupIntent): void {
    if (intent === "second-instance") this.handlers.secondInstance();
    else this.handlers.activate();
  }
}

export async function prepareTray({
  settingsStore,
  tray,
  isQuitting,
}: PrepareTrayOptions): Promise<AppSettings | null> {
  const settings = await settingsStore.load();
  if (isQuitting()) return null;

  tray.create();
  tray.refresh(settings);
  return settings;
}

export async function runStartup(start: () => Promise<unknown>, onFailure: () => void): Promise<void> {
  try {
    await start();
  } catch {
    try {
      onFailure();
    } catch {
      // Startup failure handling must not create another unhandled rejection.
    }
  }
}

export function terminateFailedStartup({ cleanup, report, quit }: FailedStartupActions): void {
  try {
    try {
      cleanup();
    } catch {
      // Continue to local reporting and terminal quit.
    }

    try {
      report();
    } catch {
      // A failed local error surface must not prevent terminal quit.
    }
  } finally {
    quit();
  }
}
