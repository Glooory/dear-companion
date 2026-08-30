import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { resolveAction, type ActionTemplate, type ResolvedAction } from '@shared/action-fallback'
import {
  createPeepApproachSteps,
  createPostureShiftSteps
} from '@shared/companion-rhythm'
import {
  PET_WINDOW_HEIGHT,
  PET_WINDOW_WIDTH,
  type ActionSlot,
  type CompanionLifeState,
  type CompanionSystemSnapshot,
  type PetAsset,
  type PetConfig,
  type PetSystemSnapshot,
  type RestSystemApi,
  type RestSystemSnapshot
} from '@shared/contracts'
import { computeAssetGeometry } from '@shared/image-normalization'
import { WakeSequence } from '@shared/wake-sequence'
import { usePetInteractions } from '../interactions/use-pet-interactions'
import { useBodyWaddleGesture } from '../interactions/use-body-waddle-gesture'
import { useCompanionPresence } from '../interactions/use-companion-presence'
import { usePettingGesture } from '../interactions/use-petting-gesture'
import { useAudioPlayback } from '../audio/use-audio-playback'
import { useDialogue } from '../dialogues/use-dialogue'
import { PhotoTransition } from '../components/PhotoTransition'

const CLICK_ACTION_VARIANTS: readonly ActionTemplate[] = ['bounce', 'curious-tilt', 'wiggle', 'nod']
const PETTING_ACTION_VARIANTS: readonly ActionTemplate[] = ['petting-sink', 'nuzzle', 'purr-swell']

interface PetShellProps { api: RestSystemApi }

export function PetShell({ api }: PetShellProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PetSystemSnapshot | null>(null)
  const [companionSnapshot, setCompanionSnapshot] = useState<CompanionSystemSnapshot | null>(null)
  const [restSnapshot, setRestSnapshot] = useState<RestSystemSnapshot | null>(null)
  const [displayNow, setDisplayNow] = useState(0)
  const [error, setError] = useState(false)
  const [actionState, setActionState] = useState<{
    petId: string
    action: ResolvedAction
    phase: 'active' | 'returning'
  } | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [heartVisible, setHeartVisible] = useState(false)
  const [pageVisible, setPageVisible] = useState(document.visibilityState === 'visible')
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [dailyIndex, setDailyIndex] = useState(0)
  const actionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const actionCompletion = useRef<(() => void) | null>(null)
  const wakeSequence = useRef(new WakeSequence())
  const previousLifeState = useRef<CompanionLifeState | null>(null)
  const previousRuntimeState = useRef<string | null>(null)

  const activePet = useMemo(
    () => snapshot?.pets.find((pet) => pet.id === snapshot.activePetId) ?? null,
    [snapshot]
  )
  const lifeState = companionSnapshot?.runtime.lifeState ?? 'daily-calm'
  const runtimeState = restSnapshot?.runtime.session?.state ?? (restSnapshot?.runtime.prompt ? 'reminding' : null)
  const runtimeActive = runtimeState !== null
  const baseAsset = useMemo(
    () => activePet ? resolveLifeAsset(activePet, lifeState, dailyIndex) : null,
    [activePet, dailyIndex, lifeState]
  )
  const dailyFallbackAsset = useMemo(
    () => activePet?.assets.find((asset) => asset.id === activePet.actionSlots.idle[0]) ?? null,
    [activePet]
  )
  const { dialogue, show: showDialogue, clear: clearDialogue } = useDialogue(
    activePet?.interactionBubblesEnabled ?? true,
    activePet?.dialogueSettings,
    activePet?.id
  )
  useAudioPlayback(api, pageVisible)

  const clearActionTimers = useCallback((): void => {
    actionTimers.current.forEach(clearTimeout)
    actionTimers.current = []
  }, [])

  const finishAction = useCallback((complete?: () => void): void => {
    clearActionTimers()
    const pendingCompletion = complete ?? actionCompletion.current
    actionCompletion.current = null
    setActionState(null)
    setFrameIndex(0)
    setHeartVisible(false)
    pendingCompletion?.()
  }, [clearActionTimers])

  const performResolvedAction = useCallback((
    action: ResolvedAction,
    duration: number,
    complete?: () => void
  ): void => {
    if (!activePet) return
    clearActionTimers()
    api.cancelPettingGesture()
    actionCompletion.current = complete ?? null
    setActionState({ petId: activePet.id, action, phase: 'active' })
    setFrameIndex(0)
    actionTimers.current.push(setTimeout(() => {
      if (action.template === 'asset-swap' && action.assetIds[0] !== baseAsset?.id) {
        setActionState((current) => current?.petId === activePet.id && current.action === action
          ? { ...current, phase: 'returning' }
          : current)
        return
      }
      finishAction(complete)
    }, duration))
  }, [activePet, api, baseAsset?.id, clearActionTimers, finishAction])

  const performCurrentPhotoAction = useCallback((template: ActionTemplate, duration = 900): void => {
    if (!baseAsset) return
    performResolvedAction({
      slot: 'idle', assetIds: [baseAsset.id], template, overlays: [], usedFallback: true
    }, duration)
  }, [baseAsset, performResolvedAction])

  const performWaddle = useCallback((direction?: -1 | 1): void => {
    if (!baseAsset) return
    if (direction === undefined) {
      const steps = createPeepApproachSteps(Math.random)
      performCurrentPhotoAction('peep-approach', 1_600)
      steps.forEach((deltaX, index) => {
        actionTimers.current.push(setTimeout(() => api.nudgePetBy(deltaX, 0), 180 + index * 180))
      })
    } else {
      const steps = createPostureShiftSteps(direction, Math.random)
      performCurrentPhotoAction('posture-shift', 800)
      steps.forEach((deltaX, index) => {
        actionTimers.current.push(setTimeout(() => api.nudgePetBy(deltaX, 0), 140 + index * 160))
      })
    }
  }, [api, baseAsset, performCurrentPhotoAction])

  const handlePrimaryClick = useCallback((): void => {
    if (!activePet || !baseAsset || runtimeActive) return
    if (lifeState === 'sleeping') {
      const stage = wakeSequence.current.registerClick(Date.now())
      if (stage === 'murmur') {
        showDialogue('sleeping:murmur')
        performCurrentPhotoAction('sway', 700)
      } else if (stage === 'stirring') {
        showDialogue('sleeping:stirring')
        const drowsyId = activePet.lifeStates.drowsy.assetIds[0]
        performResolvedAction({
          slot: 'idle', assetIds: drowsyId ? [drowsyId] : [baseAsset.id],
          template: drowsyId ? 'asset-swap' : 'nod', overlays: [], usedFallback: !drowsyId
        }, 1_100)
      } else {
        showDialogue('sleeping:awake')
        finishAction()
        void api.wakeCompanion().then(setCompanionSnapshot).catch(() => undefined)
      }
      return
    }
    if (lifeState === 'daily-calm' || lifeState === 'daily-playful') {
      const dialogueKey = lifeState === 'daily-calm' ? 'daily:click' : 'playful:click'
      showDialogue(dialogueKey)
      const variant = CLICK_ACTION_VARIANTS[Math.floor(Math.random() * CLICK_ACTION_VARIANTS.length)]!
      performCurrentPhotoAction(variant, variant === 'nod' ? 720 : 600)
    } else if (lifeState === 'drowsy') {
      showDialogue('drowsy:click')
      performCurrentPhotoAction('nod', 800)
    } else if (lifeState === 'working') {
      showDialogue('working:click')
      performCurrentPhotoAction('nod', 650)
    }
  }, [activePet, api, baseAsset, finishAction, lifeState, performCurrentPhotoAction, performResolvedAction, runtimeActive, showDialogue])

  const handlePettingDetected = useCallback((): void => {
    if (!activePet || !baseAsset || runtimeActive) return
    setHeartVisible(true)
    if (lifeState === 'sleeping') {
      showDialogue('sleeping:touch')
      performCurrentPhotoAction('gentle-breathe', 900)
    } else if (lifeState === 'daily-calm' || lifeState === 'daily-playful') {
      showDialogue('daily:petting')
      const variant = PETTING_ACTION_VARIANTS[Math.floor(Math.random() * PETTING_ACTION_VARIANTS.length)]!
      performCurrentPhotoAction(variant, activePet.actionTemplates.pettingDurationMs)
    } else if (lifeState === 'drowsy') {
      showDialogue('drowsy:petting')
      performCurrentPhotoAction('scale-nod', 900)
    } else {
      showDialogue('working:petting')
      performCurrentPhotoAction('scale-nod', 650)
    }
  }, [activePet, baseAsset, lifeState, performCurrentPhotoAction, runtimeActive, showDialogue])

  const pettingPointerMove = usePettingGesture({
    api,
    petId: activePet?.id ?? null,
    asset: baseAsset,
    targetHeight: activePet?.targetHeight ?? 180,
    active: Boolean(activePet && baseAsset && pageVisible && snapshot?.petWindow.visible && !runtimeActive),
    dependencyKey: `${lifeState}:${baseAsset?.id ?? ''}`,
    onDetected: handlePettingDetected
  })
  const bodyWaddlePointerMove = useBodyWaddleGesture({
    asset: baseAsset,
    targetHeight: activePet?.targetHeight ?? 180,
    active: Boolean(
      activePet && baseAsset && pageVisible && snapshot?.petWindow.visible && !runtimeActive &&
      !actionState && (lifeState === 'daily-calm' || lifeState === 'daily-playful') &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ),
    dependencyKey: `${activePet?.id ?? ''}:${lifeState}:${baseAsset?.id ?? ''}`,
    onDirection: performWaddle
  })

  const {
    state: interactionState,
    tilt,
    handlers: interactionHandlers
  } = usePetInteractions({
    api,
    visible: Boolean((snapshot?.petWindow.visible || runtimeActive) && pageVisible),
    angryVelocity: activePet?.actionTemplates.dragAngryVelocity ?? 1_200,
    onAngry: (finish) => {
      showDialogue('angry')
      performCurrentPhotoAction('fast-shake', activePet?.actionTemplates.angryDurationMs ?? 1_040)
      finish()
    },
    onLand: () => {
      performCurrentPhotoAction('land', 380)
    },
    onPrimaryClick: handlePrimaryClick,
    onDragStarted: () => {
      wakeSequence.current.reset()
      api.cancelPettingGesture()
      finishAction()
    },
    onLocalPointerMove: (event) => {
      const pettingCandidateActive = pettingPointerMove(event)
      bodyWaddlePointerMove(event, pettingCandidateActive)
    },
    runtimeState
  })

  const performAmbient = useCallback((): void => {
    if (!activePet || !baseAsset) return
    if (lifeState === 'sleeping' || lifeState === 'working' || reducedMotion) {
      performCurrentPhotoAction('gentle-breathe', 1_600)
    } else if (lifeState === 'drowsy') {
      const roll = Math.random()
      if (roll < 0.45) performCurrentPhotoAction('drowsy-catch', 1_600)
      else if (roll < 0.75) performCurrentPhotoAction('nod', 900)
      else performCurrentPhotoAction('gentle-breathe', 1_600)
    } else {
      const templates: ActionTemplate[] = ['gentle-breathe', 'nod', 'rhythm-sway']
      performCurrentPhotoAction(templates[Math.floor(Math.random() * templates.length)]!, 1_200)
    }
  }, [activePet, baseAsset, lifeState, performCurrentPhotoAction, reducedMotion])

  const performPersonality = useCallback((): void => {
    if (Math.random() < 0.35) showDialogue('auto:cute')
    if (activePet && activePet.actionSlots.idle.length > 1 && Math.random() < 0.35) {
      const nextIndex = (dailyIndex + 1) % activePet.actionSlots.idle.length
      const nextId = activePet.actionSlots.idle[nextIndex]!
      setDailyIndex(nextIndex)
      performResolvedAction({ slot: 'idle', assetIds: [nextId], template: 'asset-swap', overlays: [], usedFallback: true }, 2_000)
    } else {
      const roll = Math.random()
      if (roll < 0.35) {
        performCurrentPhotoAction('stretch', 1_800)
      } else if (roll < 0.7) {
        performCurrentPhotoAction('rhythm-sway', 1_100)
      } else {
        performCurrentPhotoAction('curious-tilt', 800)
      }
    }
  }, [activePet, dailyIndex, performCurrentPhotoAction, performResolvedAction, showDialogue])

  useCompanionPresence({
    enabled: Boolean(activePet && baseAsset && pageVisible && snapshot?.petWindow.visible && !runtimeActive),
    busy: interactionState !== 'idle' || Boolean(actionState),
    pace: activePet?.companionPace ?? 'natural',
    lifeState,
    reducedMotion,
    resetKey: activePet?.id ?? 'none',
    onAmbient: performAmbient,
    onMotion: performWaddle,
    onPersonality: performPersonality
  })

  useEffect(() => api.onPetInteractionRequested((request) => {
    if (!activePet || !baseAsset || runtimeActive) return
    if (request.type === 'play-now') {
      if (lifeState !== 'daily-calm' && lifeState !== 'daily-playful') return
      showDialogue('daily:click')
      performCurrentPhotoAction('bounce', 850)
      return
    }
    if (request.pace === 'quiet') performCurrentPhotoAction('gentle-breathe', 1_600)
    else if (request.pace === 'natural') performCurrentPhotoAction('sway', 900)
    else performCurrentPhotoAction('bounce', 900)
  }), [activePet, api, baseAsset, lifeState, performCurrentPhotoAction, runtimeActive, showDialogue])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      api.getPetSystemSnapshot(), api.getCompanionSystemSnapshot(), api.getRestSystemSnapshot()
    ]).then(([pet, companion, rest]) => {
      if (cancelled) return
      setSnapshot(pet); setCompanionSnapshot(companion); setRestSnapshot(rest); setError(false)
    }, () => { if (!cancelled) setError(true) })
    const unsubscribePet = api.onPetSystemChanged((next) => { if (!cancelled) { setSnapshot(next); setError(false) } })
    const unsubscribeCompanion = api.onCompanionSystemChanged((next) => { if (!cancelled) { setCompanionSnapshot(next); setError(false) } })
    const unsubscribeRest = api.onRestSystemChanged((next) => { if (!cancelled) { setRestSnapshot(next); setError(false) } })
    return () => {
      cancelled = true
      unsubscribePet(); unsubscribeCompanion(); unsubscribeRest()
    }
  }, [api])

  useEffect(() => {
    if (!pageVisible || !restSnapshot?.runtime.session || restSnapshot.runtime.session.state === 'celebrating') return
    const refresh = (): void => setDisplayNow(Date.now())
    const initialTimer = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 250)
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer) }
  }, [pageVisible, restSnapshot?.runtime.session])

  useEffect(() => {
    const handleVisibility = (): void => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (): void => setReducedMotion(query.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (previousLifeState.current === lifeState) return
    previousLifeState.current = lifeState
    if (lifeState === 'drowsy') showDialogue('state:drowsy')
    else if (lifeState === 'sleeping') showDialogue('state:sleeping')
    else if (lifeState === 'working') showDialogue('state:working')
    else if (lifeState === 'daily-calm') showDialogue('state:daily')
  }, [lifeState, showDialogue])

  useEffect(() => {
    const prev = previousRuntimeState.current
    previousRuntimeState.current = runtimeState
    if (runtimeState === 'crying') {
      showDialogue('system:crying', true)
    } else if (runtimeState === 'celebrating') {
      showDialogue('system:completion', true)
    } else if (prev === 'crying' || prev === 'celebrating' || (prev !== null && runtimeState === null)) {
      clearDialogue()
    }
  }, [clearDialogue, runtimeState, showDialogue])

  useEffect(() => {
    wakeSequence.current.reset()
    if (!pageVisible || !snapshot?.petWindow.visible || runtimeActive) {
      clearActionTimers()
      const timer = window.setTimeout(() => {
        setActionState(null)
        setHeartVisible(false)
        if (!pageVisible || !snapshot?.petWindow.visible) clearDialogue()
      }, 0)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [activePet?.id, clearActionTimers, clearDialogue, lifeState, pageVisible, runtimeActive, snapshot?.petWindow.visible])

  useEffect(() => () => clearActionTimers(), [clearActionTimers])

  const openSettings = (event: React.MouseEvent): void => {
    event.stopPropagation()
    void api.openSettings().catch(() => undefined)
  }

  if (error) return <main className="pet-shell pet-empty-shell"><button className="pet-settings-button" type="button" onClick={openSettings}>打开设置</button></main>

  const runtimeSlot: ActionSlot | null = runtimeState === 'resting' || runtimeState === 'celebrating' || runtimeState === 'crying'
    ? 'resting' : null
  const resolvedAction = activePet && baseAsset
    ? (runtimeActive
        ? (runtimeSlot ? resolveAction(activePet, runtimeSlot, 0, baseAsset.id) : null)
        : actionState?.petId === activePet.id ? actionState.action : null)
    : null
  const returningToBase = actionState?.petId === activePet?.id && actionState?.phase === 'returning'
  const desiredAssetId = returningToBase
    ? baseAsset?.id
    : resolvedAction?.assetIds[frameIndex] ?? resolvedAction?.assetIds[0] ?? baseAsset?.id
  const desiredAsset = activePet?.assets.find((candidate) => candidate.id === desiredAssetId) ?? baseAsset
  const template = resolvedAction?.template ?? (runtimeActive ? 'gentle-breathe' : 'still')
  const actorStyle = { '--pet-tilt-x': `${tilt.x}deg`, '--pet-tilt-y': `${tilt.y}deg` } as CSSProperties
  const petGeometry = activePet && desiredAsset
    ? computeAssetGeometry(desiredAsset, activePet.targetHeight, { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT })
    : null
  const visibleImageTop = petGeometry && desiredAsset
    ? petGeometry.top + desiredAsset.alphaBounds.y * petGeometry.scale
    : null
  const shellStyle = visibleImageTop === null
    ? undefined
    : { '--pet-visible-top': `${Math.max(0, Math.min(PET_WINDOW_HEIGHT, visibleImageTop))}px` } as CSSProperties
  const prompt = restSnapshot?.runtime.prompt ?? null
  const session = restSnapshot?.runtime.session ?? null
  const remainingSeconds = session ? Math.max(0, Math.ceil((session.endsAt - displayNow) / 1_000)) : 0
  const handlePhotoTransitionComplete = (): void => {
    if (!returningToBase) return
    finishAction()
  }

  const startRest = (): void => { if (prompt) void api.startPromptedRest(prompt.occurrenceId).then(setRestSnapshot).catch(() => undefined) }
  const snooze = (minutes: 5 | 10 | 15): void => { if (prompt) void api.snoozePrompt(prompt.occurrenceId, minutes).then(setRestSnapshot).catch(() => undefined) }
  const skipRest = (): void => { if (prompt) void api.skipPrompt(prompt.occurrenceId).then(setRestSnapshot).catch(() => undefined) }
  const endRest = (): void => { void api.endRestSession().then(setRestSnapshot).catch(() => undefined) }

  return (
    <main
      className={`pet-shell action-${template}`}
      data-state={interactionState}
      data-has-pet={visibleImageTop === null ? undefined : 'true'}
      style={shellStyle}
      {...interactionHandlers}
    >
      {activePet && desiredAsset && dailyFallbackAsset ? (
        <div className="pet-actor" style={actorStyle} aria-label={activePet.name}>
          <PhotoTransition
            key={`${activePet.id}:${pageVisible}:${snapshot?.petWindow.visible}:${runtimeActive}`}
            petId={activePet.id}
            asset={desiredAsset}
            fallbackAsset={dailyFallbackAsset}
            targetHeight={activePet.targetHeight}
            onTransitionComplete={handlePhotoTransitionComplete}
          />
          {resolvedAction?.overlays.includes('tears') && (
            <span className="pet-tears-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
                <path d="M12 2.5C12 2.5 5 11.5 5 16C5 19.866 8.134 23 12 23C15.866 23 19 19.866 19 16C19 11.5 12 2.5 12 2.5Z" fill="#60A5FA" />
                <path d="M9.5 13.5C9 14.8 9.2 16.5 10.5 17.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
              </svg>
            </span>
          )}
          {heartVisible && (
            <span className="pet-heart-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#F43F5E" />
              </svg>
            </span>
          )}
          {dialogue && !runtimeActive && <span className="pet-dialogue" role="status">{dialogue}</span>}
        </div>
      ) : <div className="pet-empty-runtime"><button className="pet-empty-button" type="button" onClick={openSettings}>添加伙伴</button></div>}
      {prompt && (
        <section className="rest-bubble" role="dialog" aria-label="休息提醒">
          <p>{prompt.message}</p>
          <div className="rest-actions">
            <button type="button" onClick={startRest}>开始休息</button>
            {([5, 10, 15] as const).map((minutes) => <button type="button" key={minutes} onClick={() => snooze(minutes)}>稍后 {minutes} 分钟</button>)}
            <button type="button" onClick={skipRest}>跳过</button>
          </div>
        </section>
      )}
      {session && (
        <section className={`rest-bubble rest-${session.state}`} role="status">
          {session.state === 'crying' ? <p>{dialogue ?? '还没休息够呢～'}</p> :
            session.state === 'celebrating' ? <p>{dialogue ?? '休息结束啦！'}</p> :
            <p>{session.message} · {formatCountdown(remainingSeconds)}</p>}
          {session.state !== 'celebrating' && <button type="button" onClick={endRest}>结束休息</button>}
        </section>
      )}
    </main>
  )
}

function resolveLifeAsset(pet: PetConfig, state: CompanionLifeState, dailyIndex: number): PetAsset | null {
  const dailyIds = pet.actionSlots.idle
  let ids: readonly string[] = dailyIds
  if (state === 'drowsy' && pet.lifeStates.drowsy.enabled && pet.lifeStates.drowsy.assetIds.length > 0) ids = pet.lifeStates.drowsy.assetIds
  else if (state === 'sleeping' && pet.lifeStates.sleeping.enabled && pet.lifeStates.sleeping.assetIds.length > 0) ids = pet.lifeStates.sleeping.assetIds
  else if (state === 'working' && pet.lifeStates.workingAssetIds.length > 0) ids = pet.lifeStates.workingAssetIds
  const index = ids === dailyIds && ids.length > 0 ? dailyIndex % ids.length : 0
  const id = ids[index] ?? dailyIds[0]
  return pet.assets.find((asset) => asset.id === id) ?? pet.assets.find((asset) => asset.id === dailyIds[0]) ?? null
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
