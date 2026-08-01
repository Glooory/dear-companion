import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import type { ActionSlot, PetSystemApi } from '@shared/contracts'
import { isAngryDragRelease, type PointerSample } from '@shared/drag-gesture'
import { ClickIntentArbiter } from '@shared/interaction-intents'
import { transitionPetState, type PetState } from '@shared/pet-state-machine'

interface UsePetInteractionsOptions {
  api: Pick<PetSystemApi, 'movePetBy' | 'showPetContextMenu'>
  visible: boolean
  angryVelocity: number
  onAction: (slot: ActionSlot) => void
}

interface DragSession {
  lastScreenX: number
  lastScreenY: number
  samples: PointerSample[]
  moved: boolean
}

export function usePetInteractions({
  api,
  visible,
  angryVelocity,
  onAction
}: UsePetInteractionsOptions) {
  const [state, setState] = useState<PetState>(visible ? 'idle' : 'hidden')
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const drag = useRef<DragSession | null>(null)
  const suppressClick = useRef(false)
  const actionCallback = useRef(onAction)
  const clickArbiter = useRef<ClickIntentArbiter | null>(null)
  actionCallback.current = onAction

  if (!clickArbiter.current) clickArbiter.current = new ClickIntentArbiter(220)

  useEffect(() => () => clickArbiter.current?.dispose(), [])

  useEffect(() => {
    setState((current) => transitionPetState(current, { type: visible ? 'show' : 'hide' }))
    if (!visible) {
      drag.current = null
      setTilt({ x: 0, y: 0 })
      clickArbiter.current?.dispose()
    }
  }, [visible])

  const triggerAction = (slot: 'cute' | 'petting' | 'blink'): void => {
    setState((current) => {
      const next = transitionPetState(current, { type: 'action-start' })
      if (next === 'performingAction' && current !== 'performingAction') actionCallback.current(slot)
      return next
    })
  }

  const finishAction = (): void => {
    setState((current) => current === 'angry'
      ? transitionPetState(current, { type: 'anger-complete' })
      : transitionPetState(current, { type: 'action-complete' })
    )
  }

  const onPointerDown = (event: PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || state === 'hidden') return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      samples: [{ x: event.screenX, y: event.screenY, at: event.timeStamp }],
      moved: false
    }
    setState((current) => transitionPetState(current, { type: 'drag-start' }))
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>): void => {
    const session = drag.current
    if (session) {
      const rawDeltaX = event.screenX - session.lastScreenX
      const rawDeltaY = event.screenY - session.lastScreenY
      const deltaX = clamp(rawDeltaX, -256, 256)
      const deltaY = clamp(rawDeltaY, -256, 256)
      if (deltaX !== 0 || deltaY !== 0) {
        api.movePetBy(deltaX, deltaY)
        session.moved ||= Math.hypot(event.screenX - session.samples[0]!.x, event.screenY - session.samples[0]!.y) > 4
      }
      session.lastScreenX = event.screenX
      session.lastScreenY = event.screenY
      session.samples.push({ x: event.screenX, y: event.screenY, at: event.timeStamp })
      if (session.samples.length > 12) session.samples.shift()
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const normalizedX = rect.width > 0 ? (event.clientX - rect.left) / rect.width - 0.5 : 0
    const normalizedY = rect.height > 0 ? (event.clientY - rect.top) / rect.height - 0.5 : 0
    setTilt({ x: clamp(normalizedX * 7, -3.5, 3.5), y: clamp(normalizedY * -4, -2, 2) })
    setState((current) => transitionPetState(current, { type: 'hover-start' }))
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>): void => {
    const session = drag.current
    if (!session) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const angry = session.moved && isAngryDragRelease(session.samples, angryVelocity)
    suppressClick.current = session.moved
    setState((current) => transitionPetState(current, { type: 'drag-release', angry }))
    if (angry) actionCallback.current('angry')
  }

  const onClick = (): void => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    clickArbiter.current?.singleClick(() => triggerAction('cute'))
  }

  const onDoubleClick = (): void => {
    if (suppressClick.current) return
    clickArbiter.current?.doubleClick(() => triggerAction('petting'))
  }

  const onPointerLeave = (): void => {
    if (drag.current) return
    setTilt({ x: 0, y: 0 })
    setState((current) => transitionPetState(current, { type: 'hover-end' }))
  }

  const onContextMenu = (event: MouseEvent<HTMLElement>): void => {
    event.preventDefault()
    api.showPetContextMenu()
  }

  return {
    state,
    tilt,
    triggerAction,
    finishAction,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onPointerLeave,
      onClick,
      onDoubleClick,
      onContextMenu
    }
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
