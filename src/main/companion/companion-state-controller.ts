import type {
  AppSettings,
  CompanionLifeState,
  CompanionRuntimeSnapshot,
  ManualLifeSelection,
  PetConfig
} from '../../shared/contracts'
import { MINIMUM_AWAKE_MS, nextRhythmStep } from '../../shared/companion-rhythm'
import { resolveCompanionState } from '../../shared/companion-state'
import { isWorkScheduleActive, nextWorkBoundary } from '../../shared/work-schedule-time'

interface Dependencies {
  loadSettings(): Promise<AppSettings>
  onChanged(snapshot: CompanionRuntimeSnapshot): void
  now?: () => number
  monotonicNow?: () => number
  timezoneOffset?: () => number
  random?: () => number
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

const CLOCK_CHECK_INTERVAL_MS = 30_000
const CLOCK_CHANGE_TOLERANCE_MS = 2_000

export class CompanionStateController {
  private settings: AppSettings | null = null
  private automaticState: CompanionLifeState = 'daily-calm'
  private lifeState: CompanionLifeState = 'daily-calm'
  private manualSelection: ManualLifeSelection = 'auto'
  private manualWorkActive = false
  private scheduledWorkActive = false
  private systemSuspended = false
  private awakeUntil = 0
  private nextTransitionAt: number | null = null
  private pendingAutomaticState: CompanionLifeState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private readonly now: () => number
  private readonly monotonicNow: () => number
  private readonly timezoneOffset: () => number
  private readonly random: () => number
  private readonly setTimer: NonNullable<Dependencies['setTimer']>
  private readonly clearTimer: NonNullable<Dependencies['clearTimer']>
  private lastWall = 0
  private lastMonotonic = 0
  private lastTimezoneOffset = 0

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now
    this.monotonicNow = dependencies.monotonicNow ?? (() => performance.now())
    this.timezoneOffset = dependencies.timezoneOffset ?? (() => new Date().getTimezoneOffset())
    this.random = dependencies.random ?? Math.random
    this.setTimer = dependencies.setTimer ?? setTimeout
    this.clearTimer = dependencies.clearTimer ?? clearTimeout
  }

  async start(): Promise<void> {
    await this.refresh()
  }

  async refresh(): Promise<void> {
    if (this.disposed) return
    const settings = await this.dependencies.loadSettings()
    if (this.disposed) return
    this.settings = settings
    const available = this.availableStates()
    if ((this.manualSelection === 'drowsy' && !available.drowsy) ||
        (this.manualSelection === 'sleeping' && !available.sleeping)) {
      this.manualSelection = 'auto'
    }
    if ((this.automaticState === 'drowsy' && !available.drowsy) ||
        (this.automaticState === 'sleeping' && !available.sleeping)) {
      this.automaticState = 'daily-calm'
    }
    this.recompute(true)
  }

  getSnapshot(): CompanionRuntimeSnapshot {
    return {
      lifeState: this.lifeState,
      manualSelection: this.manualSelection,
      manualWorkActive: this.manualWorkActive,
      scheduledWorkActive: this.scheduledWorkActive,
      systemSuspended: this.systemSuspended,
      nextTransitionAt: this.nextTransitionAt,
      available: { ...this.availableStates() }
    }
  }

  selectManualState(selection: ManualLifeSelection): void {
    if (this.disposed || !this.settings || this.systemSuspended) return
    this.manualSelection = selection
    this.recompute(true)
  }

  setManualWork(active: boolean): void {
    if (this.disposed || !this.settings || this.systemSuspended) return
    this.manualWorkActive = active
    this.recompute(true)
  }

  wakeFromSleep(): void {
    if (this.disposed || !this.settings || this.systemSuspended ||
        this.manualWorkActive || this.scheduledWorkActive || this.lifeState !== 'sleeping') return
    this.manualSelection = 'auto'
    this.automaticState = 'daily-calm'
    this.awakeUntil = this.now() + MINIMUM_AWAKE_MS
    this.recompute(true)
  }

  setSystemSuspended(suspended: boolean): void {
    if (this.disposed || this.systemSuspended === suspended) return
    this.systemSuspended = suspended
    if (!suspended) {
      this.manualSelection = 'auto'
      this.automaticState = 'daily-calm'
    }
    this.recompute(true)
  }

  handleResume(): void {
    if (this.disposed || !this.settings) return
    this.manualSelection = 'auto'
    this.manualWorkActive = false
    this.automaticState = 'daily-calm'
    this.awakeUntil = 0
    this.recompute(true)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancelTimer()
    this.settings = null
  }

  private recompute(publish: boolean): void {
    this.cancelTimer()
    if (!this.settings || this.disposed) return
    const now = this.now()
    this.recordClock(now)
    const wasWorking = this.lifeState === 'working'
    this.scheduledWorkActive = this.settings.workSchedules.some((schedule) =>
      isWorkScheduleActive(schedule, now)
    )
    const workActive = this.manualWorkActive || this.scheduledWorkActive
    if (!this.systemSuspended && wasWorking !== workActive) {
      this.manualSelection = 'auto'
      this.automaticState = 'daily-calm'
    }
    const available = this.availableStates()
    this.lifeState = resolveCompanionState({
      current: this.lifeState,
      automaticState: this.automaticState,
      manualSelection: this.manualSelection,
      manualWorkActive: this.manualWorkActive,
      scheduledWorkActive: this.scheduledWorkActive,
      systemSuspended: this.systemSuspended,
      available
    })
    if (!this.systemSuspended && this.settings.petWindow.visible) this.scheduleNext(now)
    if (publish) this.dependencies.onChanged(this.getSnapshot())
  }

  private scheduleNext(now: number): void {
    if (!this.settings) return
    const workBoundary = nextWorkBoundary(this.settings.workSchedules, now)
    let rhythmBoundary: number | null = null
    this.pendingAutomaticState = null
    if (!this.manualWorkActive && !this.scheduledWorkActive) {
      const pet = this.activePet()
      const step = nextRhythmStep({
        state: this.manualSelection === 'auto' ? this.automaticState : this.lifeState,
        pace: pet?.companionPace ?? 'natural',
        available: this.availableStates(),
        now,
        awakeUntil: this.awakeUntil
      }, this.random)
      rhythmBoundary = step.dueAt
      this.pendingAutomaticState = step.state
    }
    const dueAt = [workBoundary, rhythmBoundary]
      .filter((value): value is number => value !== null && value > now)
      .sort((a, b) => a - b)[0] ?? null
    this.nextTransitionAt = dueAt
    if (dueAt === null) return
    this.armTimer(dueAt, rhythmBoundary, now)
  }

  private handleTimer(expected: number, rhythmBoundary: number | null): void {
    if (this.disposed || this.nextTransitionAt !== expected) return
    this.timer = null
    const now = this.now()
    const elapsedWall = now - this.lastWall
    const elapsedMonotonic = this.monotonicNow() - this.lastMonotonic
    const clockChanged = Math.abs(elapsedWall - elapsedMonotonic) > CLOCK_CHANGE_TOLERANCE_MS ||
      this.timezoneOffset() !== this.lastTimezoneOffset
    this.recordClock(now)
    if (clockChanged) {
      this.recompute(true)
      return
    }
    if (now < expected) {
      this.armTimer(expected, rhythmBoundary, now)
      return
    }
    if (rhythmBoundary === expected && this.pendingAutomaticState) {
      this.automaticState = this.pendingAutomaticState
      if (this.manualSelection !== 'auto') this.manualSelection = 'auto'
      if (this.automaticState === 'daily-calm' && this.lifeState === 'sleeping') {
        this.awakeUntil = this.now() + MINIMUM_AWAKE_MS
      }
    }
    this.recompute(true)
  }

  private armTimer(expected: number, rhythmBoundary: number | null, now: number): void {
    const delay = Math.max(0, Math.min(CLOCK_CHECK_INTERVAL_MS, expected - now))
    this.timer = this.setTimer(() => this.handleTimer(expected, rhythmBoundary), delay)
  }

  private recordClock(now: number): void {
    this.lastWall = now
    this.lastMonotonic = this.monotonicNow()
    this.lastTimezoneOffset = this.timezoneOffset()
  }

  private activePet(): PetConfig | null {
    if (!this.settings?.activePetId) return null
    return this.settings.pets.find((pet) => pet.id === this.settings!.activePetId) ?? null
  }

  private availableStates(): { drowsy: boolean; sleeping: boolean } {
    const pet = this.activePet()
    return {
      drowsy: Boolean(pet?.lifeStates.drowsy.enabled && pet.lifeStates.drowsy.assetIds.length > 0),
      sleeping: Boolean(pet?.lifeStates.sleeping.enabled && pet.lifeStates.sleeping.assetIds.length > 0)
    }
  }

  private cancelTimer(): void {
    if (this.timer) this.clearTimer(this.timer)
    this.timer = null
    this.nextTransitionAt = null
    this.pendingAutomaticState = null
  }
}
