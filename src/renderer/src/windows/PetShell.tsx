import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { resolveAction, type ResolvedAction } from '@shared/action-fallback'
import type {
  ActionSlot,
  PetConfig,
  PetSystemSnapshot,
  RestSystemApi,
  RestSystemSnapshot
} from '@shared/contracts'
import { computeAssetGeometry } from '@shared/image-normalization'
import { usePetInteractions } from '../interactions/use-pet-interactions'
import { useAudioPlayback } from '../audio/use-audio-playback'

interface PetShellProps {
  api: RestSystemApi
}

export function PetShell({ api }: PetShellProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PetSystemSnapshot | null>(null)
  const [restSnapshot, setRestSnapshot] = useState<RestSystemSnapshot | null>(null)
  const [displayNow, setDisplayNow] = useState(0)
  const [error, setError] = useState(false)
  const [actionState, setActionState] = useState<{ petId: string; action: ResolvedAction } | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [pageVisible, setPageVisible] = useState(document.visibilityState === 'visible')
  const actionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const activePet = useMemo(
    () => snapshot?.pets.find((pet) => pet.id === snapshot.activePetId) ?? null,
    [snapshot]
  )
  const runtimeState = restSnapshot?.runtime.session?.state ?? (restSnapshot?.runtime.prompt ? 'reminding' : null)
  const runtimeActive = runtimeState !== null
  useAudioPlayback(api, pageVisible)

  const clearActionTimers = useCallback((): void => {
    actionTimers.current.forEach(clearTimeout)
    actionTimers.current = []
  }, [])

  const performAction = useCallback((slot: ActionSlot, complete: () => void): void => {
    if (!activePet) return
    clearActionTimers()
    const action = resolveAction(activePet, slot, Math.floor(Math.random() * 10_000))
    setActionState({ petId: activePet.id, action })
    setFrameIndex(0)
    const finish = (): void => {
      setActionState({ petId: activePet.id, action: resolveAction(activePet, 'idle') })
      setFrameIndex(0)
      complete()
    }

    if (action.template === 'blink-sequence') {
      actionTimers.current.push(
        setTimeout(() => setFrameIndex(1), 110),
        setTimeout(() => setFrameIndex(2), 230),
        setTimeout(finish, 380)
      )
      return
    }

    const duration = action.template === 'asset-swap'
      ? Math.max(actionDuration(activePet, slot), 1_800)
      : actionDuration(activePet, slot)
    actionTimers.current.push(setTimeout(finish, duration))
  }, [activePet, clearActionTimers])

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
    runtimeState
  })

  useEffect(() => {
    let cancelled = false
    void api.getPetSystemSnapshot().then(
      (next) => { if (!cancelled) setSnapshot(next) },
      () => { if (!cancelled) setError(true) }
    )
    void api.getRestSystemSnapshot().then(
      (next) => { if (!cancelled) setRestSnapshot(next) },
      () => { if (!cancelled) setError(true) }
    )
    const unsubscribe = api.onPetSystemChanged((next) => {
      if (!cancelled) {
        setSnapshot(next)
        setError(false)
      }
    })
    const unsubscribeRest = api.onRestSystemChanged((next) => {
      if (!cancelled) {
        setRestSnapshot(next)
        setError(false)
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
      unsubscribeRest()
    }
  }, [api])

  useEffect(() => {
    if (!pageVisible || !restSnapshot?.runtime.session || restSnapshot.runtime.session.state === 'celebrating') return
    const refresh = (): void => setDisplayNow(Date.now())
    const initialTimer = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 250)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [pageVisible, restSnapshot?.runtime.session])

  useEffect(() => {
    const handleVisibility = (): void => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    if (!activePet || runtimeActive || interactionState !== 'idle' || !pageVisible || !snapshot?.petWindow.visible) return
    const shouldBlink = Math.random() < 0.45
    const baseDelay = shouldBlink
      ? activePet.actionTemplates.blinkIntervalMs
      : activePet.actionTemplates.idleIntervalMs
    const delay = baseDelay * (0.8 + Math.random() * 0.4)
    const timer = setTimeout(() => {
      triggerAction(shouldBlink ? 'blink' : 'cute')
    }, delay)
    return () => clearTimeout(timer)
  }, [activePet, interactionState, pageVisible, runtimeActive, snapshot?.petWindow.visible, triggerAction])

  useEffect(() => {
    if (!pageVisible || !snapshot?.petWindow.visible) clearActionTimers()
  }, [clearActionTimers, pageVisible, snapshot?.petWindow.visible])

  useEffect(() => () => clearActionTimers(), [clearActionTimers])

  const openSettings = (event: React.MouseEvent): void => {
    event.stopPropagation()
    void api.openSettings().catch(() => undefined)
  }

  if (error) {
    return (
      <main className="pet-shell pet-empty-shell">
        <button className="pet-settings-button" type="button" onClick={openSettings}>打开设置</button>
      </main>
    )
  }

  const runtimeSlot: ActionSlot | null = runtimeState === 'resting' || runtimeState === 'celebrating'
    ? 'resting' : runtimeState === 'crying' ? 'crying' : null
  const resolvedAction = activePet
    ? (
        runtimeSlot ? resolveAction(activePet, runtimeSlot) :
        (interactionState === 'performingAction' || interactionState === 'angry') &&
        actionState?.petId === activePet.id
          ? actionState.action
          : resolveAction(activePet, 'idle')
      )
    : null
  const assetId = resolvedAction?.assetIds[frameIndex] ?? resolvedAction?.assetIds[0]
  const asset = activePet?.assets.find((candidate) => candidate.id === assetId)
  const geometry = asset
    ? computeAssetGeometry(asset, activePet!.targetHeight, { width: 320, height: 320 })
    : null
  const actorStyle = {
    '--pet-tilt-x': `${tilt.x}deg`,
    '--pet-tilt-y': `${tilt.y}deg`
  } as CSSProperties
  const prompt = restSnapshot?.runtime.prompt ?? null
  const session = restSnapshot?.runtime.session ?? null
  const remainingSeconds = session ? Math.max(0, Math.ceil((session.endsAt - displayNow) / 1_000)) : 0

  const startRest = (): void => {
    if (prompt) void api.startPromptedRest(prompt.occurrenceId).then(setRestSnapshot).catch(() => undefined)
  }
  const snooze = (minutes: 5 | 10 | 15): void => {
    if (prompt) void api.snoozePrompt(prompt.occurrenceId, minutes).then(setRestSnapshot).catch(() => undefined)
  }
  const endRest = (): void => {
    void api.endRestSession().then(setRestSnapshot).catch(() => undefined)
  }

  return (
    <main
      className={`pet-shell action-${resolvedAction?.template ?? 'still'}`}
      data-state={interactionState}
      {...interactionHandlers}
    >
      {activePet && asset && geometry ? (
        <div className="pet-actor" style={actorStyle} aria-label={activePet.name}>
          <span
            className="pet-image-frame"
            key={`${activePet.id}:${asset.id}`}
            style={{
              left: geometry.left,
              top: geometry.top,
              width: geometry.renderedWidth,
              height: geometry.renderedHeight
            }}
          >
            <img
              className="pet-image"
              draggable={false}
              src={petAssetUrl(activePet.id, asset.id)}
              alt=""
            />
          </span>
          {resolvedAction?.overlays.includes('tears') && <span className="pet-tears" aria-hidden="true">💧</span>}
          {(interactionState === 'angry' || resolvedAction?.overlays.includes('protest-bubble')) && (
            <span className="pet-protest" role="status">慢一点呀！</span>
          )}
        </div>
      ) : (
        <div className="pet-empty-runtime">
          <button className="pet-empty-button" type="button" onClick={openSettings}>添加宠物</button>
        </div>
      )}
      {prompt && (
        <section className="rest-bubble" role="dialog" aria-label="休息提醒">
          <p>{prompt.message}</p>
          <div className="rest-actions">
            <button type="button" onClick={startRest}>立即开始</button>
            {([5, 10, 15] as const).map((minutes) => (
              <button type="button" key={minutes} onClick={() => snooze(minutes)}>延后 {minutes} 分钟</button>
            ))}
          </div>
        </section>
      )}
      {session && (
        <section className={`rest-bubble rest-${session.state}`} role="status">
          {session.state === 'crying' ? <p>休息一下嘛，不要乱跑呀 💧</p> :
            session.state === 'celebrating' ? <p>休息完成啦！</p> :
            <p>{session.message} · {formatCountdown(remainingSeconds)}</p>}
          {session.state !== 'celebrating' && <button type="button" onClick={endRest}>结束本次休息</button>}
        </section>
      )}
    </main>
  )
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

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
