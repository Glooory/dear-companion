import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { resolveAction, type ResolvedAction } from '@shared/action-fallback'
import type { ActionSlot, PetConfig, PetSystemApi, PetSystemSnapshot } from '@shared/contracts'
import { computeAssetGeometry } from '@shared/image-normalization'
import { usePetInteractions } from '../interactions/use-pet-interactions'

interface PetShellProps {
  api: PetSystemApi
}

export function PetShell({ api }: PetShellProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PetSystemSnapshot | null>(null)
  const [error, setError] = useState(false)
  const [actionState, setActionState] = useState<{ petId: string; action: ResolvedAction } | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [pageVisible, setPageVisible] = useState(document.visibilityState === 'visible')
  const actionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const activePet = useMemo(
    () => snapshot?.pets.find((pet) => pet.id === snapshot.activePetId) ?? null,
    [snapshot]
  )

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

    const duration = actionDuration(activePet, slot)
    actionTimers.current.push(setTimeout(finish, duration))
  }, [activePet, clearActionTimers])

  const {
    state: interactionState,
    tilt,
    triggerAction,
    handlers: interactionHandlers
  } = usePetInteractions({
    api,
    visible: Boolean(snapshot?.petWindow.visible && pageVisible),
    angryVelocity: activePet?.actionTemplates.dragAngryVelocity ?? 1_200,
    onAction: performAction
  })

  useEffect(() => {
    let cancelled = false
    void api.getPetSystemSnapshot().then(
      (next) => { if (!cancelled) setSnapshot(next) },
      () => { if (!cancelled) setError(true) }
    )
    const unsubscribe = api.onPetSystemChanged((next) => {
      if (!cancelled) {
        setSnapshot(next)
        setError(false)
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [api])

  useEffect(() => {
    const handleVisibility = (): void => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    if (!activePet || interactionState !== 'idle' || !pageVisible || !snapshot?.petWindow.visible) return
    const shouldBlink = Math.random() < 0.45
    const baseDelay = shouldBlink
      ? activePet.actionTemplates.blinkIntervalMs
      : activePet.actionTemplates.idleIntervalMs
    const delay = baseDelay * (0.8 + Math.random() * 0.4)
    const timer = setTimeout(() => {
      triggerAction(shouldBlink ? 'blink' : 'cute')
    }, delay)
    return () => clearTimeout(timer)
  }, [activePet, interactionState, pageVisible, snapshot?.petWindow.visible, triggerAction])

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

  const resolvedAction = activePet
    ? (
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

  return (
    <main
      className={`pet-shell action-${resolvedAction?.template ?? 'still'}`}
      data-state={interactionState}
      {...interactionHandlers}
    >
      {activePet && asset && geometry ? (
        <div className="pet-actor" style={actorStyle} aria-label={activePet.name}>
          <img
            className="pet-image"
            draggable={false}
            src={petAssetUrl(activePet.id, asset.id)}
            alt=""
            style={{
              left: geometry.left,
              top: geometry.top,
              width: geometry.renderedWidth,
              height: geometry.renderedHeight
            }}
          />
          {resolvedAction?.overlays.includes('tears') && <span className="pet-tears" aria-hidden="true">💧</span>}
          {(interactionState === 'angry' || resolvedAction?.overlays.includes('protest-bubble')) && (
            <span className="pet-protest" role="status">慢一点呀！</span>
          )}
        </div>
      ) : (
        <button className="pet-empty-button" type="button" onClick={openSettings}>
          添加宠物
        </button>
      )}
      <button className="pet-settings-button" type="button" onClick={openSettings}>设置</button>
    </main>
  )
}

function actionDuration(pet: PetConfig, slot: ActionSlot): number {
  if (slot === 'petting') return pet.actionTemplates.pettingDurationMs
  if (slot === 'angry') return pet.actionTemplates.angryDurationMs
  return pet.actionTemplates.cuteDurationMs
}

function petAssetUrl(petId: string, assetId: string): string {
  return `app://renderer/pet-assets/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`
}
