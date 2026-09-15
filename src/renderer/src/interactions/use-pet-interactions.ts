import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { computeHoverPose, type HoverPose, type MotionRect } from "@shared/companion-motion";
import type { PetSystemApi } from "@shared/contracts";
import { isAngryDragRelease, type PointerSample } from "@shared/drag-gesture";
import { transitionPetState, type PetState } from "@shared/pet-state-machine";

interface UsePetInteractionsOptions {
  api: Pick<PetSystemApi, "movePetBy" | "showPetContextMenu">;
  visible: boolean;
  hoverRect: MotionRect | null;
  hoverEnabled: boolean;
  reducedMotion: boolean;
  angryVelocity: number;
  onAngry?: (finishAction: () => void) => void;
  onLand?: () => void;
  onPrimaryClick(): void;
  onDragStarted?(): void;
  onDragSessionChange?(active: boolean, event?: PointerEvent<HTMLElement>): void;
  onLocalPointerMove?(event: PointerEvent<HTMLElement>): boolean;
  runtimeState?: "reminding" | "resting" | "crying" | "celebrating" | null;
}

interface DragSession {
  startX: number;
  startY: number;
  lastScreenX: number;
  lastScreenY: number;
  samples: PointerSample[];
  moved: boolean;
}

export function usePetInteractions({
  api,
  visible,
  hoverRect,
  hoverEnabled,
  reducedMotion,
  angryVelocity,
  onAngry,
  onLand,
  onPrimaryClick,
  onDragStarted,
  onDragSessionChange,
  onLocalPointerMove,
  runtimeState = null,
}: UsePetInteractionsOptions) {
  const [state, setState] = useState<PetState>(visible ? "idle" : "hidden");
  const [previousVisible, setPreviousVisible] = useState(visible);
  const [previousRuntimeState, setPreviousRuntimeState] = useState(runtimeState);
  const [attention, setAttention] = useState<HoverPose & { transitionMs: number }>({
    translateX: 0,
    translateY: 0,
    rotate: 0,
    transitionMs: 110,
  });
  const drag = useRef<DragSession | null>(null);
  const attentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const primaryClickArmed = useRef(false);

  if (previousRuntimeState !== runtimeState) {
    setPreviousRuntimeState(runtimeState);
    setState(visible ? "idle" : "hidden");
  } else if (!runtimeState && previousVisible !== visible) {
    setPreviousVisible(visible);
    setState(visible ? "idle" : "hidden");
  }

  useEffect(() => {
    if (!visible) {
      if (drag.current) {
        drag.current = null;
        onDragSessionChange?.(false);
      }
    }
  }, [onDragSessionChange, visible]);

  const clearAttentionTimer = useCallback((): void => {
    if (attentionTimer.current) clearTimeout(attentionTimer.current);
    attentionTimer.current = null;
  }, []);

  const resetAttention = useCallback(
    (delayMs = 0): void => {
      clearAttentionTimer();
      attentionTimer.current = setTimeout(() => {
        attentionTimer.current = null;
        setAttention({ translateX: 0, translateY: 0, rotate: 0, transitionMs: 220 });
      }, delayMs);
    },
    [clearAttentionTimer]
  );

  useEffect(() => () => clearAttentionTimer(), [clearAttentionTimer]);

  useEffect(() => {
    if (!visible || runtimeState || !hoverEnabled || reducedMotion) resetAttention();
  }, [hoverEnabled, reducedMotion, resetAttention, runtimeState, visible]);

  const finishAction = useCallback((): void => {
    setState((current) =>
      current === "angry"
        ? transitionPetState(current, { type: "anger-complete" })
        : transitionPetState(current, { type: "action-complete" })
    );
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLElement>): void => {
    primaryClickArmed.current = false;
    if (event.button !== 0 || state === "hidden") return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('[data-pet-drag="true"]')) return;
    event.preventDefault();
    if (!runtimeState) {
      primaryClickArmed.current = true;
    }
    clearAttentionTimer();
    setAttention({ translateX: 0, translateY: 0, rotate: 0, transitionMs: 80 });
    onDragSessionChange?.(true, event);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer was already captured or closed
    }
    drag.current = {
      startX: event.screenX,
      startY: event.screenY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      samples: [{ x: event.screenX, y: event.screenY, at: event.timeStamp }],
      moved: false,
    };
    if (!runtimeState) {
      setState((current) => transitionPetState(current, { type: "drag-start" }));
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>): void => {
    const session = drag.current;
    if (session) {
      const rawDeltaX = event.screenX - session.lastScreenX;
      const rawDeltaY = event.screenY - session.lastScreenY;
      const deltaX = clamp(rawDeltaX, -256, 256);
      const deltaY = clamp(rawDeltaY, -256, 256);
      if (deltaX !== 0 || deltaY !== 0) {
        if (!runtimeState) {
          setAttention({
            translateX: 0,
            translateY: 0,
            rotate: clamp(-deltaX * 0.12, -1.2, 1.2),
            transitionMs: 80,
          });
          resetAttention(80);
        }
        api.movePetBy(deltaX, deltaY);
        const moved = Math.hypot(event.screenX - session.startX, event.screenY - session.startY) > 4;
        if (!session.moved && moved) onDragStarted?.();
        session.moved ||= moved;
        if (moved) primaryClickArmed.current = false;
      }
      session.lastScreenX = event.screenX;
      session.lastScreenY = event.screenY;
      session.samples.push({ x: event.screenX, y: event.screenY, at: event.timeStamp });
      if (session.samples.length > 12) session.samples.shift();
      return;
    }

    const pettingCandidateActive = onLocalPointerMove?.(event) ?? false;

    const target = event.target as HTMLElement | null;
    const isOverPet = Boolean(target?.closest?.('[data-pet-drag="true"]'));
    if (!isOverPet || !hoverEnabled || reducedMotion || runtimeState || pettingCandidateActive) {
      resetAttention(80);
      setState((current) => (current === "hovering" ? transitionPetState(current, { type: "hover-end" }) : current));
      return;
    }

    clearAttentionTimer();
    setAttention({ ...computeHoverPose({ x: event.clientX, y: event.clientY }, hoverRect), transitionMs: 110 });
    setState((current) => transitionPetState(current, { type: "hover-start" }));
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>): void => {
    const session = drag.current;
    if (!session) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore if pointer capture was already released
      }
    }
    onDragSessionChange?.(false, event);
    const angry = !runtimeState && session.moved && isAngryDragRelease(session.samples, angryVelocity);
    suppressClick.current = session.moved;
    if (session.moved)
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    if (!runtimeState) {
      setState((current) => transitionPetState(current, { type: "drag-release", angry }));
      if (angry) onAngry?.(finishAction);
      else if (session.moved) onLand?.();
      resetAttention(80);
    }
  };

  const onClick = (event: MouseEvent<HTMLElement>): void => {
    const armed = primaryClickArmed.current;
    primaryClickArmed.current = false;
    if (runtimeState) return;
    const target = event.target as HTMLElement | null;
    if (!armed && !target?.closest?.('[data-pet-drag="true"]')) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onPrimaryClick();
  };

  const onPointerLeave = (): void => {
    if (drag.current) return;
    resetAttention(80);
    setState((current) => (current === "hovering" ? transitionPetState(current, { type: "hover-end" }) : current));
  };

  const onContextMenu = (event: MouseEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('[data-pet-interactive="true"]')) return;
    event.preventDefault();
    api.showPetContextMenu();
  };

  return {
    state: runtimeState ?? (visible ? state : "hidden"),
    attention: visible ? attention : { translateX: 0, translateY: 0, rotate: 0, transitionMs: 0 },
    finishAction,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        primaryClickArmed.current = false;
        onPointerUp(event);
      },
      onPointerLeave,
      onClick,
      onContextMenu,
    },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
