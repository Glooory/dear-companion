import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { resolveAction, type ActionTemplate, type ResolvedAction } from '@shared/action-fallback'
import { nextAutoCuteDelay } from '@shared/companion-rhythm'
import type {
  ActionSlot,
  CompanionLifeState,
  CompanionSystemSnapshot,
  PetAsset,
  PetConfig,
  PetSystemSnapshot,
  RestSystemApi,
  RestSystemSnapshot
} from '@shared/contracts'
import { WakeSequence } from '@shared/wake-sequence'
import { usePetInteractions } from '../interactions/use-pet-interactions'
import { usePettingGesture } from '../interactions/use-petting-gesture'
import { useAudioPlayback } from '../audio/use-audio-playback'
import { DIALOGUES } from '../dialogues/dialogue-library'
import { useDialogue } from '../dialogues/use-dialogue'
import { PhotoTransition, type PhotoVeil } from '../components/PhotoTransition'

interface PetShellProps { api: RestSystemApi }

export function PetShell({ api }: PetShellProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PetSystemSnapshot | null>(null)
  const [companionSnapshot, setCompanionSnapshot] = useState<CompanionSystemSnapshot | null>(null)
  const [restSnapshot, setRestSnapshot] = useState<RestSystemSnapshot | null>(null)
  const [displayNow, setDisplayNow] = useState(0)
  const [error, setError] = useState(false)
  const [actionState, setActionState] = useState<{ petId: string; action: ResolvedAction } | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [heartVisible, setHeartVisible] = useState(false)
  const [pageVisible, setPageVisible] = useState(document.visibilityState === 'visible')
  const [dailyIndex, setDailyIndex] = useState(0)
  const actionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const wakeSequence = useRef(new WakeSequence())
  const previousLifeState = useRef<CompanionLifeState | null>(null)

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
  const { dialogue, show: showDialogue, clear: clearDialogue } = useDialogue(
    activePet?.interactionBubblesEnabled ?? true
  )
  useAudioPlayback(api, pageVisible)

  const clearActionTimers = useCallback((): void => {
    actionTimers.current.forEach(clearTimeout)
    actionTimers.current = []
  }, [])

  const finishAction = useCallback((complete?: () => void): void => {
    clearActionTimers()
    setActionState(null)
    setFrameIndex(0)
    setHeartVisible(false)
    complete?.()
  }, [clearActionTimers])

  const performResolvedAction = useCallback((
    action: ResolvedAction,
    duration: number,
    complete?: () => void
  ): void => {
    if (!activePet) return
    clearActionTimers()
    setActionState({ petId: activePet.id, action })
    setFrameIndex(0)
    if (action.template === 'blink-sequence') {
      actionTimers.current.push(
        setTimeout(() => setFrameIndex(1), 110),
        setTimeout(() => setFrameIndex(2), 230),
        setTimeout(() => finishAction(complete), 380)
      )
      return
    }
    actionTimers.current.push(setTimeout(() => finishAction(complete), duration))
  }, [activePet, clearActionTimers, finishAction])

  const performCurrentPhotoAction = useCallback((template: ActionTemplate, duration = 900): void => {
    if (!baseAsset) return
    performResolvedAction({
      slot: 'cute', assetIds: [baseAsset.id], template, overlays: [], usedFallback: true
    }, duration)
  }, [baseAsset, performResolvedAction])

  const performAction = useCallback((slot: ActionSlot, complete: () => void): void => {
    if (!activePet || !baseAsset) return
    const action = resolveAction(activePet, slot, Math.floor(Math.random() * 10_000), baseAsset.id)
    if (slot === 'angry') showDialogue('angry', DIALOGUES.angry)
    const duration = action.template === 'asset-swap'
      ? Math.max(actionDuration(activePet, slot), 1_800)
      : actionDuration(activePet, slot)
    performResolvedAction(action, duration, complete)
  }, [activePet, baseAsset, performResolvedAction, showDialogue])

  const handlePrimaryClick = useCallback((): void => {
    if (!activePet || !baseAsset || runtimeActive) return
    if (lifeState === 'sleeping') {
      const stage = wakeSequence.current.registerClick(Date.now())
      if (stage === 'murmur') {
        showDialogue('sleeping:murmur', DIALOGUES.sleepingMurmur)
        performCurrentPhotoAction('sway', 700)
      } else if (stage === 'stirring') {
        showDialogue('sleeping:stirring', DIALOGUES.sleepingStirring)
        const drowsyId = activePet.lifeStates.drowsy.assetIds[0]
        performResolvedAction({
          slot: 'cute', assetIds: drowsyId ? [drowsyId] : [baseAsset.id],
          template: drowsyId ? 'asset-swap' : 'nod', overlays: [], usedFallback: !drowsyId
        }, 1_100)
      } else {
        showDialogue('sleeping:awake', DIALOGUES.sleepingWake)
        finishAction()
        void api.wakeCompanion().then(setCompanionSnapshot).catch(() => undefined)
      }
      return
    }
    if (lifeState === 'daily-calm') {
      showDialogue('daily:click', DIALOGUES.dailyClick)
      performAction('cute', () => undefined)
    } else if (lifeState === 'daily-playful') {
      showDialogue('playful:click', DIALOGUES.playfulClick)
      if (activePet.actionSlots.idle.length > 1) {
        const nextIndex = (dailyIndex + 1) % activePet.actionSlots.idle.length
        const nextId = activePet.actionSlots.idle[nextIndex]!
        setDailyIndex(nextIndex)
        performResolvedAction({ slot: 'cute', assetIds: [nextId], template: 'asset-swap', overlays: [], usedFallback: true }, 1_200)
      } else performCurrentPhotoAction('bounce', 850)
    } else if (lifeState === 'drowsy') {
      showDialogue('drowsy:click', DIALOGUES.drowsyClick)
      performCurrentPhotoAction('nod', 800)
    } else if (lifeState === 'working') {
      showDialogue('working:click', DIALOGUES.workingClick)
      performCurrentPhotoAction('nod', 650)
    }
  }, [activePet, api, baseAsset, dailyIndex, finishAction, lifeState, performAction, performCurrentPhotoAction, performResolvedAction, runtimeActive, showDialogue])

  const handlePettingDetected = useCallback((): void => {
    if (!activePet || !baseAsset || runtimeActive) return
    setHeartVisible(true)
    if (lifeState === 'sleeping') {
      showDialogue('sleeping:touch', DIALOGUES.sleepingTouch)
      performCurrentPhotoAction('gentle-breathe', 900)
    } else if (lifeState === 'daily-calm' || lifeState === 'daily-playful') {
      showDialogue('daily:petting', DIALOGUES.dailyPetting)
      const action = resolveAction(activePet, 'petting', Math.floor(Math.random() * 10_000), baseAsset.id)
      performResolvedAction(action, activePet.actionTemplates.pettingDurationMs)
    } else if (lifeState === 'drowsy') {
      showDialogue('drowsy:petting', DIALOGUES.drowsyPetting)
      performCurrentPhotoAction('scale-nod', 900)
    } else {
      showDialogue('working:petting', DIALOGUES.workingPetting)
      performCurrentPhotoAction('scale-nod', 650)
    }
  }, [activePet, baseAsset, lifeState, performCurrentPhotoAction, performResolvedAction, runtimeActive, showDialogue])

  const pettingPointerMove = usePettingGesture({
    api,
    petId: activePet?.id ?? null,
    asset: baseAsset,
    targetHeight: activePet?.targetHeight ?? 180,
    active: Boolean(activePet && baseAsset && pageVisible && snapshot?.petWindow.visible && !runtimeActive),
    dependencyKey: `${lifeState}:${baseAsset?.id ?? ''}`,
    onDetected: handlePettingDetected
  })

  const {
    state: interactionState,
    tilt,
    triggerAction,
    handlers: interactionHandlers
  } = usePetInteractions({
    api,
    visible: Boolean((snapshot?.petWindow.visible || runtimeActive) && pageVisible),
    angryVelocity: activePet?.actionTemplates.dragAngryVelocity ?? 1_200,
    onAction: performAction,
    onPrimaryClick: handlePrimaryClick,
    onDragStarted: () => {
      wakeSequence.current.reset()
      api.cancelPettingGesture()
    },
    onLocalPointerMove: pettingPointerMove,
    runtimeState
  })

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
    if (previousLifeState.current === lifeState) return
    previousLifeState.current = lifeState
    if (lifeState === 'drowsy') showDialogue('state:drowsy', DIALOGUES.drowsyEnter)
    else if (lifeState === 'sleeping') showDialogue('state:sleeping', DIALOGUES.sleepingEnter)
    else if (lifeState === 'working') showDialogue('state:working', DIALOGUES.workingEnter)
    else if (lifeState === 'daily-calm') showDialogue('state:daily', DIALOGUES.dailyEnter)
  }, [lifeState, showDialogue])

  useEffect(() => {
    if (runtimeState === 'crying') showDialogue('system:crying', DIALOGUES.crying, true)
    if (runtimeState === 'celebrating') showDialogue('system:completion', DIALOGUES.reminderCompletion, true)
  }, [runtimeState, showDialogue])

  useEffect(() => {
    if (!activePet || runtimeActive || interactionState !== 'idle' || !pageVisible ||
        !snapshot?.petWindow.visible || (lifeState !== 'daily-calm' && lifeState !== 'daily-playful')) return
    const timer = setTimeout(() => {
      showDialogue('auto:cute', DIALOGUES.dailyCute)
      triggerAction('cute')
    }, nextAutoCuteDelay(activePet.companionPace, Math.random))
    return () => clearTimeout(timer)
  }, [activePet, interactionState, lifeState, pageVisible, runtimeActive, showDialogue, snapshot?.petWindow.visible, triggerAction])

  useEffect(() => {
    wakeSequence.current.reset()
    if (!pageVisible || !snapshot?.petWindow.visible || runtimeActive) {
      clearActionTimers(); setActionState(null); setHeartVisible(false)
      if (!pageVisible || !snapshot?.petWindow.visible) clearDialogue()
    }
  }, [activePet?.id, clearActionTimers, clearDialogue, lifeState, pageVisible, runtimeActive, snapshot?.petWindow.visible])

  useEffect(() => () => clearActionTimers(), [clearActionTimers])

  const openSettings = (event: React.MouseEvent): void => {
    event.stopPropagation()
    void api.openSettings().catch(() => undefined)
  }

  if (error) return <main className="pet-shell pet-empty-shell"><button className="pet-settings-button" type="button" onClick={openSettings}>打开设置</button></main>

  const runtimeSlot: ActionSlot | null = runtimeState === 'resting' || runtimeState === 'celebrating'
    ? 'resting' : runtimeState === 'crying' ? 'crying' : null
  const resolvedAction = activePet && baseAsset
    ? (runtimeSlot
        ? resolveAction(activePet, runtimeSlot, 0, baseAsset.id)
        : actionState?.petId === activePet.id
          ? actionState.action
          : null)
    : null
  const desiredAssetId = resolvedAction?.assetIds[frameIndex] ?? resolvedAction?.assetIds[0] ?? baseAsset?.id
  const desiredAsset = activePet?.assets.find((candidate) => candidate.id === desiredAssetId) ?? baseAsset
  const template = resolvedAction?.template ?? (runtimeActive ? 'gentle-breathe' : 'still')
  const actorStyle = { '--pet-tilt-x': `${tilt.x}deg`, '--pet-tilt-y': `${tilt.y}deg` } as CSSProperties
  const prompt = restSnapshot?.runtime.prompt ?? null
  const session = restSnapshot?.runtime.session ?? null
  const remainingSeconds = session ? Math.max(0, Math.ceil((session.endsAt - displayNow) / 1_000)) : 0
  const veil: PhotoVeil = lifeState === 'sleeping' || lifeState === 'drowsy' ? 'clouds' : (lifeState === 'daily-playful' ? 'stars' : 'bubbles')

  const startRest = (): void => { if (prompt) void api.startPromptedRest(prompt.occurrenceId).then(setRestSnapshot).catch(() => undefined) }
  const snooze = (minutes: 5 | 10 | 15): void => { if (prompt) void api.snoozePrompt(prompt.occurrenceId, minutes).then(setRestSnapshot).catch(() => undefined) }
  const endRest = (): void => { void api.endRestSession().then(setRestSnapshot).catch(() => undefined) }

  return (
    <main className={`pet-shell action-${template}`} data-state={interactionState} {...interactionHandlers}>
      {activePet && desiredAsset ? (
        <div className="pet-actor" style={actorStyle} aria-label={activePet.name}>
          <PhotoTransition key={activePet.id} petId={activePet.id} asset={desiredAsset} targetHeight={activePet.targetHeight} veil={veil} />
          {resolvedAction?.overlays.includes('tears') && <span className="pet-tears" aria-hidden="true">💧</span>}
          {heartVisible && <span className="pet-heart" aria-hidden="true">♥</span>}
          {dialogue && !prompt && <span className="pet-dialogue" role="status">{dialogue}</span>}
        </div>
      ) : <div className="pet-empty-runtime"><button className="pet-empty-button" type="button" onClick={openSettings}>添加宠物</button></div>}
      {prompt && (
        <section className="rest-bubble" role="dialog" aria-label="休息提醒">
          <p>{prompt.message}</p>
          <div className="rest-actions"><button type="button" onClick={startRest}>立即开始</button>{([5, 10, 15] as const).map((minutes) => <button type="button" key={minutes} onClick={() => snooze(minutes)}>延后 {minutes} 分钟</button>)}</div>
        </section>
      )}
      {session && (
        <section className={`rest-bubble rest-${session.state}`} role="status">
          {session.state === 'crying' ? <p>{dialogue ?? '休息一下嘛，不要乱跑呀 💧'}</p> :
            session.state === 'celebrating' ? <p>{dialogue ?? '休息完成啦！'}</p> :
            <p>{session.message} · {formatCountdown(remainingSeconds)}</p>}
          {session.state !== 'celebrating' && <button type="button" onClick={endRest}>结束本次休息</button>}
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

function actionDuration(pet: PetConfig, slot: ActionSlot): number {
  if (slot === 'petting') return pet.actionTemplates.pettingDurationMs
  if (slot === 'angry') return pet.actionTemplates.angryDurationMs
  return pet.actionTemplates.cuteDurationMs
}
