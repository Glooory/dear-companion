import { randomUUID } from 'node:crypto'
import { CursorMovementAccumulator } from '../../shared/cursor-movement'
import type { ReminderPrompt, RestRuntimeSnapshot, RestSessionSnapshot } from '../../shared/contracts'
import { transitionRestSession } from '../../shared/rest-session'

export interface RestSessionControllerOptions {
  now?: () => number
  getCursorScreenPoint(): { x: number; y: number }
  setInterval?: (callback: () => void, delay: number) => ReturnType<typeof setInterval>
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void
  idFactory?: () => string
  onPromptConsumed(occurrenceId: string): void
  onCryingAudio(enabled: boolean): void
  onChanged(snapshot: RestRuntimeSnapshot): void
}

export class RestSessionController {
  private session: RestSessionSnapshot | null = null
  private accumulator: CursorMovementAccumulator | null = null
  private sampler: ReturnType<typeof setInterval> | null = null
  private celebrationTimer: ReturnType<typeof setTimeout> | null = null
  private readonly now: () => number
  private readonly createInterval: NonNullable<RestSessionControllerOptions['setInterval']>
  private readonly cancelInterval: NonNullable<RestSessionControllerOptions['clearInterval']>
  private readonly createTimeout: NonNullable<RestSessionControllerOptions['setTimeout']>
  private readonly cancelTimeout: NonNullable<RestSessionControllerOptions['clearTimeout']>
  private readonly idFactory: () => string

  constructor(private readonly options: RestSessionControllerOptions) {
    this.now = options.now ?? Date.now
    this.createInterval = options.setInterval ?? setInterval
    this.cancelInterval = options.clearInterval ?? clearInterval
    this.createTimeout = options.setTimeout ?? setTimeout
    this.cancelTimeout = options.clearTimeout ?? clearTimeout
    this.idFactory = options.idFactory ?? randomUUID
  }

  startFromPrompt(prompt: ReminderPrompt): RestSessionSnapshot {
    if (this.session) throw new Error('A rest session is already active')
    const startedAt = this.now()
    this.session = {
      sessionId: this.idFactory().toLowerCase(),
      scheduleId: prompt.scheduleId,
      startedAt,
      endsAt: startedAt + prompt.restDurationMinutes * 60_000,
      state: 'resting',
      cryingUntil: null,
      cursorTolerance: prompt.cursorTolerance,
      message: prompt.message,
      sounds: { ...prompt.sounds }
    }
    this.options.onPromptConsumed(prompt.occurrenceId)
    this.accumulator = new CursorMovementAccumulator(prompt.cursorTolerance)
    this.sampleCursor(startedAt)
    this.sampler = this.createInterval(() => this.tick(), 250)
    this.broadcast()
    return cloneSession(this.session)
  }

  endManually(): void {
    if (!this.session) return
    this.session = transitionRestSession(this.session, { type: 'manual-end' }, this.now())
    this.stopTimers()
    this.broadcast()
  }

  getSnapshot(): RestRuntimeSnapshot {
    return { serviceStatus: 'healthy', prompt: null, session: this.session ? cloneSession(this.session) : null }
  }

  handleResume(now = this.now()): void {
    if (!this.session) return
    this.accumulator?.reset()
    this.session = transitionRestSession(this.session, { type: 'resume' }, now)
    if (this.session?.state === 'celebrating') this.beginCelebration()
    this.broadcast()
  }

  dispose(): void {
    this.stopTimers()
    this.session = null
    this.accumulator = null
  }

  private tick(): void {
    if (!this.session) return
    const now = this.now()
    this.sampleCursor(now)
    const previousState = this.session.state
    this.session = transitionRestSession(this.session, { type: 'tick' }, now)
    if (this.session?.state === 'celebrating') this.beginCelebration()
    if (this.session?.state !== previousState) this.broadcast()
  }

  private sampleCursor(now: number): void {
    if (!this.session || this.session.state !== 'resting' || !this.accumulator) return
    const point = this.options.getCursorScreenPoint()
    if (this.accumulator.add({ ...point, timestamp: now })) {
      this.session = transitionRestSession(this.session, { type: 'movement' }, now)
      this.options.onCryingAudio(this.session?.sounds.crying ?? false)
      this.broadcast()
    }
  }

  private beginCelebration(): void {
    if (this.sampler !== null) this.cancelInterval(this.sampler)
    this.sampler = null
    if (this.celebrationTimer !== null) return
    this.celebrationTimer = this.createTimeout(() => {
      this.celebrationTimer = null
      this.session = transitionRestSession(this.session, { type: 'celebration-complete' }, this.now())
      this.broadcast()
    }, 2_000)
  }

  private stopTimers(): void {
    if (this.sampler !== null) this.cancelInterval(this.sampler)
    if (this.celebrationTimer !== null) this.cancelTimeout(this.celebrationTimer)
    this.sampler = null
    this.celebrationTimer = null
  }

  private broadcast(): void {
    this.options.onChanged(this.getSnapshot())
  }
}

function cloneSession(session: RestSessionSnapshot): RestSessionSnapshot {
  return { ...session, sounds: { ...session.sounds } }
}
