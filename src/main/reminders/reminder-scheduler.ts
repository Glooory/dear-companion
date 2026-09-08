import type { ReminderOccurrence, ReminderPrompt, ReminderSchedule } from "../../shared/contracts";
import { dueReminderOccurrences, nextEnabledOccurrence } from "../../shared/reminder-time";

export interface ReminderSchedulerOptions {
  loadSchedules(): Promise<readonly ReminderSchedule[]>;
  now?: () => number;
  monotonicNow?: () => number;
  timezoneOffset?: () => number;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
  isRestActive(): boolean;
  onPrompt(prompt: ReminderPrompt): void | Promise<void>;
  onPromptDismissed?(occurrenceId: string): void;
  onError?(error: { code: string; message: string }): void;
  onHealthy?(): void;
}

interface SnoozeEntry {
  occurrence: ReminderOccurrence;
  dueAt: number;
}

export class ReminderScheduler {
  private schedules: readonly ReminderSchedule[] = [];
  private handled = new Set<string>();
  private snoozes = new Map<string, SnoozeEntry>();
  private queue: ReminderOccurrence[] = [];
  private activePrompt: ReminderPrompt | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastScanAt = 0;
  private lastWall = 0;
  private lastMonotonic = 0;
  private lastTimezoneOffset = 0;
  private errorBroadcast = false;
  private readonly now: () => number;
  private readonly monotonicNow: () => number;
  private readonly timezoneOffset: () => number;
  private readonly createTimeout: NonNullable<ReminderSchedulerOptions["setTimeout"]>;
  private readonly cancelTimeout: NonNullable<ReminderSchedulerOptions["clearTimeout"]>;

  constructor(private readonly options: ReminderSchedulerOptions) {
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.timezoneOffset = options.timezoneOffset ?? (() => new Date().getTimezoneOffset());
    this.createTimeout = options.setTimeout ?? setTimeout;
    this.cancelTimeout = options.clearTimeout ?? clearTimeout;
  }

  async start(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    this.clearWake();
    try {
      const schedules = await this.options.loadSchedules();
      const validIds = new Set(schedules.filter((schedule) => schedule.enabled).map((schedule) => schedule.id));
      this.schedules = schedules.map(cloneSchedule);
      this.queue = this.queue.filter((item) => validIds.has(item.scheduleId));
      for (const [id, snooze] of this.snoozes) if (!validIds.has(snooze.occurrence.scheduleId)) this.snoozes.delete(id);
      if (this.activePrompt && !validIds.has(this.activePrompt.scheduleId)) {
        const dismissed = this.activePrompt.occurrenceId;
        this.activePrompt = null;
        this.options.onPromptDismissed?.(dismissed);
        this.showNextPrompt();
      }
      const now = this.now();
      if (this.lastScanAt === 0) this.lastScanAt = now;
      this.recordClock(now);
      this.errorBroadcast = false;
      this.options.onHealthy?.();
      this.scheduleWake(now);
    } catch {
      this.schedules = [];
      this.queue = [];
      this.snoozes.clear();
      if (!this.errorBroadcast) {
        this.errorBroadcast = true;
        this.options.onError?.({ code: "reminder-service-unavailable", message: "休息提醒暂时不可用。请再试一次。" });
      }
    }
  }

  snooze(occurrenceId: string, minutes: 5 | 10 | 15): void {
    if (![5, 10, 15].includes(minutes) || this.activePrompt?.occurrenceId !== occurrenceId) {
      throw new Error("Reminder occurrence is not active");
    }
    const occurrence = stripPrompt(this.activePrompt);
    this.snoozes.set(occurrenceId, { occurrence, dueAt: this.now() + minutes * 60_000 });
    this.finishActivePrompt();
    this.reschedule();
  }

  resolvePrompt(occurrenceId: string): void {
    if (this.activePrompt?.occurrenceId !== occurrenceId) throw new Error("Reminder occurrence is not active");
    this.finishActivePrompt();
    this.reschedule();
  }

  handleResume(now = this.now()): void {
    if (this.disposed || !Number.isFinite(now)) return;
    for (const occurrence of dueReminderOccurrences(this.schedules, this.lastScanAt, now, this.handled)) {
      this.handled.add(occurrence.occurrenceId);
    }
    for (const [id, snooze] of this.snoozes) if (snooze.dueAt <= now) this.snoozes.delete(id);
    this.lastScanAt = now;
    this.recordClock(now);
    this.reschedule();
  }

  getActivePrompt(): ReminderPrompt | null {
    return this.activePrompt ? { ...this.activePrompt, sounds: { ...this.activePrompt.sounds } } : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearWake();
    this.queue = [];
    this.snoozes.clear();
    this.activePrompt = null;
  }

  private wake(): void {
    if (this.disposed) return;
    this.wakeTimer = null;
    const now = this.now();
    const elapsedWall = now - this.lastWall;
    const elapsedMonotonic = this.monotonicNow() - this.lastMonotonic;
    const clockChanged =
      Math.abs(elapsedWall - elapsedMonotonic) > 2_000 || this.timezoneOffset() !== this.lastTimezoneOffset;
    const scanStart = clockChanged ? now - 60_000 : this.lastScanAt;
    const due = dueReminderOccurrences(this.schedules, scanStart, now, this.handled);
    for (const occurrence of due) {
      this.handled.add(occurrence.occurrenceId);
      if (now - occurrence.scheduledFor > 60_000 || this.options.isRestActive()) continue;
      this.enqueueOccurrence(occurrence);
    }
    for (const [id, snooze] of this.snoozes) {
      if (snooze.dueAt > now) continue;
      this.snoozes.delete(id);
      if (now - snooze.dueAt <= 60_000 && !this.options.isRestActive()) this.enqueueOccurrence(snooze.occurrence);
    }
    this.lastScanAt = now;
    this.recordClock(now);
    this.showNextPrompt();
    this.scheduleWake(now);
  }

  private enqueueOccurrence(occurrence: ReminderOccurrence): void {
    if (
      this.activePrompt?.occurrenceId === occurrence.occurrenceId ||
      this.queue.some((item) => item.occurrenceId === occurrence.occurrenceId)
    )
      return;
    this.queue.push(occurrence);
    this.queue.sort((a, b) => a.scheduledFor - b.scheduledFor || a.scheduleId.localeCompare(b.scheduleId));
  }

  private showNextPrompt(): void {
    if (this.activePrompt || this.options.isRestActive()) return;
    const next = this.queue.shift();
    if (!next) return;
    this.activePrompt = { ...next, sounds: { ...next.sounds }, triggeredAt: this.now() };
    void Promise.resolve(this.options.onPrompt(this.getActivePrompt()!)).catch(() => {
      this.options.onError?.({ code: "reminder-prompt-failed", message: "这条休息提醒没有显示出来。请再试一次。" });
    });
  }

  private finishActivePrompt(): void {
    const prompt = this.activePrompt;
    if (!prompt) return;
    this.activePrompt = null;
    this.options.onPromptDismissed?.(prompt.occurrenceId);
    this.showNextPrompt();
  }

  private reschedule(): void {
    this.clearWake();
    this.scheduleWake(this.now());
  }

  private scheduleWake(now: number): void {
    if (this.disposed) return;
    const nextOccurrence = nextEnabledOccurrence(this.schedules, now);
    const nextSnooze = [...this.snoozes.values()].reduce<number | null>(
      (nearest, entry) => (nearest === null ? entry.dueAt : Math.min(nearest, entry.dueAt)),
      null
    );
    const nextDue = Math.min(
      nextOccurrence?.scheduledFor ?? Number.POSITIVE_INFINITY,
      nextSnooze ?? Number.POSITIVE_INFINITY
    );
    const delay = Math.max(1, Math.min(30_000, Number.isFinite(nextDue) ? nextDue - now : 30_000));
    this.wakeTimer = this.createTimeout(() => this.wake(), delay);
  }

  private clearWake(): void {
    if (this.wakeTimer !== null) this.cancelTimeout(this.wakeTimer);
    this.wakeTimer = null;
  }

  private recordClock(now: number): void {
    this.lastWall = now;
    this.lastMonotonic = this.monotonicNow();
    this.lastTimezoneOffset = this.timezoneOffset();
  }
}

function cloneSchedule(schedule: ReminderSchedule): ReminderSchedule {
  return { ...schedule, weekdays: [...schedule.weekdays], sounds: { ...schedule.sounds } };
}

function stripPrompt(prompt: ReminderPrompt): ReminderOccurrence {
  return {
    occurrenceId: prompt.occurrenceId,
    scheduleId: prompt.scheduleId,
    scheduledFor: prompt.scheduledFor,
    restDurationMinutes: prompt.restDurationMinutes,
    cursorTolerance: prompt.cursorTolerance,
    message: prompt.message,
    sounds: { ...prompt.sounds },
    ...(prompt.voiceAssetId ? { voiceAssetId: prompt.voiceAssetId } : {}),
    ...(prompt.voiceAssetId && prompt.voiceTrimStart !== undefined ? { voiceTrimStart: prompt.voiceTrimStart } : {}),
    ...(prompt.voiceAssetId && prompt.voiceTrimEnd !== undefined ? { voiceTrimEnd: prompt.voiceTrimEnd } : {}),
  };
}
