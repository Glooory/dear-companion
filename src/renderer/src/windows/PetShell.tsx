import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { clsx } from "clsx";
import { resolveAction, type ResolvedAction } from "@shared/action-fallback";
import {
  determineAssetSwapStep,
  getInitialActionTimeout,
  getWeightShiftAmplitude,
  resolveMotion,
  resolveNextMotionDirection,
  scaleMotionDip,
  selectAmbientMotion,
  selectClickMotion,
  selectPersonalityMotion,
  shouldSwapPersonalityPhoto,
  unionMotionRect,
  type MotionDirection,
  type MotionTemplate,
} from "@shared/companion-motion";
import { createApproachPlan, createBodyPushSteps } from "@shared/companion-rhythm";
import {
  PET_WINDOW_HEIGHT,
  PET_WINDOW_WIDTH,
  type ActionSlot,
  type CompanionLifeState,
  type CompanionSystemSnapshot,
  type PetAsset,
  type PetConfig,
  type PettingGestureResult,
  type PetSystemSnapshot,
  type RestSystemApi,
  type RestSystemSnapshot,
} from "@shared/contracts";
import { computeHeadHotspotGeometry } from "@shared/head-hotspot";
import { computeAssetGeometry } from "@shared/image-normalization";
import { WAKE_SEQUENCE_EXPIRY_MS, WakeSequence } from "@shared/wake-sequence";
import { useAudioPlayback } from "../audio/use-audio-playback";
import { PhotoTransition } from "../components/PhotoTransition";
import { useDialogue } from "../dialogues/use-dialogue";
import { useBodyWaddleGesture } from "../interactions/use-body-waddle-gesture";
import { useCompanionPresence } from "../interactions/use-companion-presence";
import { usePetInteractions } from "../interactions/use-pet-interactions";
import { usePetPresenceTransition } from "../interactions/use-pet-presence-transition";
import { usePettingGesture } from "../interactions/use-petting-gesture";
import styles from "./PetShell.module.css";

interface PetShellProps {
  api: RestSystemApi;
}

export function PetShell({ api }: PetShellProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PetSystemSnapshot | null>(null);
  const [companionSnapshot, setCompanionSnapshot] = useState<CompanionSystemSnapshot | null>(null);
  const [restSnapshot, setRestSnapshot] = useState<RestSystemSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [actionState, setActionState] = useState<{
    petId: string;
    action: ResolvedAction;
    direction: MotionDirection;
    phase: "active" | "returning";
  } | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [heartVisible, setHeartVisible] = useState(false);
  const [doubleHeart, setDoubleHeart] = useState(false);
  const [pageVisible, setPageVisible] = useState(document.visibilityState === "visible");
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [dailyIndex, setDailyIndex] = useState(0);
  const [motionRunId, setMotionRunId] = useState(0);
  const [heartRunId, setHeartRunId] = useState(0);
  const [displayedAssets, setDisplayedAssets] = useState<{
    current: PetAsset;
    outgoing: PetAsset | null;
  } | null>(null);

  const handleDisplayedAssetChange = useCallback(
    (current: PetAsset, outgoing: PetAsset | null): void => {
      setDisplayedAssets({ current, outgoing });
    },
    []
  );

  const actionLayerRef = useRef<HTMLDivElement | null>(null);
  const actionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const actionCompletion = useRef<(() => void) | null>(null);
  const wakeSequence = useRef(new WakeSequence());
  const [wakePhotoOverride, setWakePhotoOverride] = useState<string | null>(null);
  const wakeResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWakeDip = useRef(false);
  const previousLifeState = useRef<CompanionLifeState | null>(null);
  const previousRuntimeState = useRef<string | null>(null);
  const previousClickMotion = useRef<MotionTemplate | null>(null);
  const previousAmbientMotion = useRef<MotionTemplate | null>(null);
  const previousPersonalityMotion = useRef<MotionTemplate | null>(null);
  const previousMotionDirection = useRef<MotionDirection | null>(null);

  const resolveDirection = useCallback((template: MotionTemplate): MotionDirection => {
    const { direction, nextHistory } = resolveNextMotionDirection(
      template,
      previousMotionDirection.current,
      Math.random
    );
    previousMotionDirection.current = nextHistory;
    return direction;
  }, []);

  const activePet = useMemo(() => snapshot?.pets.find((pet) => pet.id === snapshot.activePetId) ?? null, [snapshot]);
  const lifeState = companionSnapshot?.runtime.lifeState ?? "daily-calm";
  const effectiveWakePhotoOverride = lifeState === "sleeping" ? wakePhotoOverride : null;

  const resetWakeSequence = useCallback((): void => {
    if (wakeResetTimer.current) {
      clearTimeout(wakeResetTimer.current);
      wakeResetTimer.current = null;
    }
    wakeSequence.current.reset();
    setWakePhotoOverride(null);
    pendingWakeDip.current = false;
  }, []);

  useEffect(() => {
    if (lifeState !== "sleeping") {
      if (wakeResetTimer.current) {
        clearTimeout(wakeResetTimer.current);
        wakeResetTimer.current = null;
      }
      wakeSequence.current.reset();
      pendingWakeDip.current = false;
      const timer = window.setTimeout(() => {
        setWakePhotoOverride(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [lifeState]);

  useEffect(() => {
    return () => {
      if (wakeResetTimer.current) {
        clearTimeout(wakeResetTimer.current);
      }
    };
  }, []);
  const runtimeState = restSnapshot?.runtime.session?.state ?? (restSnapshot?.runtime.prompt ? "reminding" : null);
  const runtimeActive = runtimeState !== null;
  const baseAsset = useMemo(
    () => (activePet ? resolveLifeAsset(activePet, lifeState, dailyIndex) : null),
    [activePet, dailyIndex, lifeState]
  );
  const dailyFallbackAsset = useMemo(
    () => activePet?.assets.find((asset) => asset.id === activePet.actionSlots.idle[0]) ?? null,
    [activePet]
  );
  const viewport = { width: window.innerWidth || PET_WINDOW_WIDTH, height: window.innerHeight || PET_WINDOW_HEIGHT };
  const visiblePersonRect = (() => {
    if (!activePet || !baseAsset) return null;
    const geometry = computeAssetGeometry(baseAsset, activePet.targetHeight, viewport);
    return {
      x: geometry.left + baseAsset.alphaBounds.x * geometry.scale,
      y: geometry.top + baseAsset.alphaBounds.y * geometry.scale,
      width: baseAsset.alphaBounds.width * geometry.scale,
      height: baseAsset.alphaBounds.height * geometry.scale,
    };
  })();
  const headHotspot =
    activePet && baseAsset ? computeHeadHotspotGeometry(baseAsset, activePet.targetHeight, viewport) : null;
  const {
    dialogue,
    show: showDialogue,
    preview: previewDialogue,
    clear: clearDialogue,
    hasVoiceForCategory,
  } = useDialogue(activePet?.interactionBubblesEnabled ?? true, activePet?.dialogueSettings, activePet?.id);

  const shouldPlayAudioCue = useCallback(
    (cue: "reminder" | "crying"): boolean => {
      if (cue === "crying" && hasVoiceForCategory("rest:crying")) {
        return false;
      }
      return true;
    },
    [hasVoiceForCategory]
  );
  const clearActionTimers = useCallback((): void => {
    actionTimers.current.forEach(clearTimeout);
    actionTimers.current = [];
  }, []);

  const finishAction = useCallback(
    (complete?: () => void): void => {
      clearActionTimers();
      const pendingCompletion = complete ?? actionCompletion.current;
      actionCompletion.current = null;
      setActionState(null);
      setFrameIndex(0);
      setHeartVisible(false);
      setDoubleHeart(false);
      pendingCompletion?.();
    },
    [clearActionTimers]
  );

  const performResolvedAction = useCallback(
    (action: ResolvedAction, direction: MotionDirection = 0, complete?: () => void): void => {
      if (!activePet) return;
      clearActionTimers();
      api.cancelPettingGesture();
      const motion = resolveMotion(action.template, reducedMotion);
      const resolvedAction = { ...action, template: motion.template };
      actionCompletion.current = complete ?? null;
      setMotionRunId((id) => id + 1);
      setActionState({ petId: activePet.id, action: resolvedAction, direction, phase: "active" });
      setFrameIndex(0);
      const initialTimeout = getInitialActionTimeout(resolvedAction.template, motion.durationMs);
      if (initialTimeout !== null) {
        actionTimers.current.push(
          setTimeout(() => {
            finishAction(complete);
          }, initialTimeout)
        );
      }
    },
    [activePet, api, clearActionTimers, finishAction, reducedMotion]
  );

  const performCurrentPhotoAction = useCallback(
    (template: MotionTemplate, direction: MotionDirection = 0, complete?: () => void): void => {
      const currentAssetId = effectiveWakePhotoOverride ?? baseAsset?.id;
      if (!currentAssetId) return;
      performResolvedAction(
        {
          slot: "idle",
          assetIds: [currentAssetId],
          template,
          overlays: [],
          usedFallback: true,
        },
        direction,
        complete
      );
    },
    [baseAsset, effectiveWakePhotoOverride, performResolvedAction]
  );

  const performApproach = useCallback(
    (direction?: -1 | 1): void => {
      if (!baseAsset) return;
      if (direction === undefined) {
        const resolvedDirection = resolveDirection("two-step-approach") as -1 | 1;
        const plan = createApproachPlan(Math.random, resolvedDirection);
        performCurrentPhotoAction("two-step-approach", resolvedDirection);
        for (const step of plan.steps) {
          actionTimers.current.push(
            setTimeout(() => api.nudgePetBy(step.deltaX, 0), step.atMs)
          );
        }
      } else {
        const steps = createBodyPushSteps(direction, Math.random);
        performCurrentPhotoAction("body-step", direction);
        steps.forEach((deltaX, index) => {
          actionTimers.current.push(setTimeout(() => api.nudgePetBy(deltaX, 0), 100 + index * 90));
        });
      }
    },
    [api, baseAsset, performCurrentPhotoAction, resolveDirection]
  );

  const currentDisplayedAssetId = displayedAssets?.current?.id;
  const handlePrimaryClick = useCallback((): void => {
    if (!activePet || !baseAsset || runtimeActive) return;
    if (lifeState === "sleeping") {
      const drowsyId = activePet.lifeStates.drowsy.assetIds[0] ?? null;
      const step = wakeSequence.current.registerClick(Date.now(), drowsyId);
      showDialogue(step.dialogueKey);
      if (wakeResetTimer.current) {
        clearTimeout(wakeResetTimer.current);
        wakeResetTimer.current = null;
      }
      if (step.stage === "murmur") {
        wakeResetTimer.current = setTimeout(() => {
          wakeSequence.current.reset();
          setWakePhotoOverride(null);
          pendingWakeDip.current = false;
        }, WAKE_SEQUENCE_EXPIRY_MS);
        performCurrentPhotoAction("wake-sway", resolveDirection("wake-sway"));
      } else if (step.stage === "stirring") {
        wakeResetTimer.current = setTimeout(() => {
          wakeSequence.current.reset();
          setWakePhotoOverride(null);
          pendingWakeDip.current = false;
        }, WAKE_SEQUENCE_EXPIRY_MS);
        setWakePhotoOverride(step.photoOverride);
        if (step.transitionThenDip) {
          if (currentDisplayedAssetId === step.photoOverride) {
            pendingWakeDip.current = false;
            performCurrentPhotoAction("drowsy-dip", resolveDirection("drowsy-dip"));
          } else {
            pendingWakeDip.current = true;
          }
        } else {
          pendingWakeDip.current = false;
          performCurrentPhotoAction("drowsy-dip", resolveDirection("drowsy-dip"));
        }
      } else {
        finishAction();
        resetWakeSequence();
        performCurrentPhotoAction("settle");
        void api
          .wakeCompanion()
          .then(setCompanionSnapshot)
          .catch(() => undefined);
      }
      return;
    }
    if (lifeState === "daily-calm" || lifeState === "daily-playful") {
      const dialogueKey = lifeState === "daily-calm" ? "daily:click" : "playful:click";
      showDialogue(dialogueKey);
      const motion = selectClickMotion(lifeState, previousClickMotion.current, Math.random);
      previousClickMotion.current = motion;
      performCurrentPhotoAction(motion, resolveDirection(motion));
    } else if (lifeState === "drowsy") {
      showDialogue("drowsy:click");
      performCurrentPhotoAction("drowsy-dip", resolveDirection("drowsy-dip"));
    } else if (lifeState === "working") {
      showDialogue("working:click");
      performCurrentPhotoAction("calm-lean", resolveDirection("calm-lean"));
    }
  }, [
    activePet,
    api,
    baseAsset,
    currentDisplayedAssetId,
    finishAction,
    lifeState,
    performCurrentPhotoAction,
    resetWakeSequence,
    resolveDirection,
    runtimeActive,
    showDialogue,
  ]);

  const handlePettingDetected = useCallback((result: PettingGestureResult): void => {
    if (!activePet || !baseAsset || runtimeActive) return;
    setHeartVisible(true);
    setDoubleHeart(Math.random() < 0.24);
    setHeartRunId((id) => id + 1);
    if (lifeState === "sleeping") {
      showDialogue("sleeping:touch");
      performCurrentPhotoAction("gentle-breathe");
    } else if (lifeState === "daily-calm" || lifeState === "daily-playful") {
      showDialogue("daily:petting");
      performCurrentPhotoAction("petting-lean", result.leanDirection);
    } else if (lifeState === "drowsy") {
      showDialogue("drowsy:petting");
      performCurrentPhotoAction("drowsy-dip", result.leanDirection || resolveDirection("drowsy-dip"));
    } else {
      showDialogue("working:petting");
      performCurrentPhotoAction("calm-lean", result.leanDirection);
    }
  }, [activePet, baseAsset, lifeState, performCurrentPhotoAction, resolveDirection, runtimeActive, showDialogue]);

  const cancelForPresenceTransition = useCallback((): void => {
    resetWakeSequence();
    api.cancelPettingGesture();
    clearActionTimers();
    actionCompletion.current = null;
    setActionState(null);
    setFrameIndex(0);
    setHeartVisible(false);
    setDoubleHeart(false);
    clearDialogue();
  }, [api, clearActionTimers, clearDialogue, resetWakeSequence]);

  const presence = usePetPresenceTransition({
    api,
    actorAvailable: snapshot === null ? null : Boolean(activePet && baseAsset && dailyFallbackAsset),
    requestedVisible: Boolean(snapshot?.petWindow.visible || runtimeActive),
    onTransitionRequested: cancelForPresenceTransition,
  });
  const presenceTransitionActive = presence.phase === "entering" || presence.phase === "exiting";
  useAudioPlayback(api, pageVisible && !presenceTransitionActive, shouldPlayAudioCue);

  const runtimeSlot: ActionSlot | null =
    runtimeState === "resting" || runtimeState === "celebrating" || runtimeState === "crying" ? "resting" : null;
  const resolvedAction =
    activePet && baseAsset
      ? runtimeActive
        ? runtimeSlot
          ? resolveAction(activePet, runtimeSlot, 0, baseAsset.id)
          : null
        : actionState?.petId === activePet.id
          ? actionState.action
          : null
      : null;
  const returningToBase = actionState?.petId === activePet?.id && actionState?.phase === "returning";
  const desiredAssetId = returningToBase
    ? baseAsset?.id
    : resolvedAction?.template === "asset-swap"
      ? (resolvedAction.assetIds[frameIndex] ?? resolvedAction.assetIds[0] ?? baseAsset?.id)
      : (effectiveWakePhotoOverride ?? resolvedAction?.assetIds[frameIndex] ?? resolvedAction?.assetIds[0] ?? baseAsset?.id);
  const desiredAsset = activePet?.assets.find((candidate) => candidate.id === desiredAssetId) ?? baseAsset;
  const activeDisplayedAsset =
    displayedAssets?.current && activePet?.assets.some((candidate) => candidate.id === displayedAssets.current.id)
      ? displayedAssets.current
      : (baseAsset ?? desiredAsset);
  const outgoingAsset = displayedAssets?.outgoing ?? null;
  const activeOutgoingAsset =
    outgoingAsset && activePet?.assets.some((candidate) => candidate.id === outgoingAsset.id)
      ? outgoingAsset
      : null;

  const currentGeometry =
    activePet && activeDisplayedAsset
      ? computeAssetGeometry(activeDisplayedAsset, activePet.targetHeight, viewport)
      : null;
  const currentPersonRect =
    currentGeometry && activeDisplayedAsset
      ? {
          x: currentGeometry.left + activeDisplayedAsset.alphaBounds.x * currentGeometry.scale,
          y: currentGeometry.top + activeDisplayedAsset.alphaBounds.y * currentGeometry.scale,
          width: activeDisplayedAsset.alphaBounds.width * currentGeometry.scale,
          height: activeDisplayedAsset.alphaBounds.height * currentGeometry.scale,
        }
      : visiblePersonRect;

  const outgoingGeometry =
    activePet && activeOutgoingAsset
      ? computeAssetGeometry(activeOutgoingAsset, activePet.targetHeight, viewport)
      : null;
  const outgoingPersonRect =
    outgoingGeometry && activeOutgoingAsset
      ? {
          x: outgoingGeometry.left + activeOutgoingAsset.alphaBounds.x * outgoingGeometry.scale,
          y: outgoingGeometry.top + activeOutgoingAsset.alphaBounds.y * outgoingGeometry.scale,
          width: activeOutgoingAsset.alphaBounds.width * outgoingGeometry.scale,
          height: activeOutgoingAsset.alphaBounds.height * outgoingGeometry.scale,
        }
      : null;

  const displayedPersonRect = unionMotionRect(currentPersonRect, outgoingPersonRect);
  const displayedHeadHotspot =
    activePet && activeDisplayedAsset
      ? computeHeadHotspotGeometry(activeDisplayedAsset, activePet.targetHeight, viewport)
      : headHotspot;

  const pettingPointerMove = usePettingGesture({
    api,
    petId: activePet?.id ?? null,
    asset: activeDisplayedAsset ?? baseAsset,
    targetHeight: activePet?.targetHeight ?? 180,
    active: Boolean(
      activePet &&
      baseAsset &&
      pageVisible &&
      snapshot?.petWindow.visible &&
      !runtimeActive &&
      !presenceTransitionActive
    ),
    dependencyKey: `${lifeState}:${activeDisplayedAsset?.id ?? baseAsset?.id ?? ""}`,
    onDetected: handlePettingDetected,
  });
  const bodyWaddlePointerMove = useBodyWaddleGesture({
    asset: activeDisplayedAsset ?? baseAsset,
    targetHeight: activePet?.targetHeight ?? 180,
    active: Boolean(
      activePet &&
      baseAsset &&
      pageVisible &&
      snapshot?.petWindow.visible &&
      !runtimeActive &&
      !presenceTransitionActive &&
      !actionState &&
      (lifeState === "daily-calm" || lifeState === "daily-playful") &&
      !reducedMotion
    ),
    dependencyKey: `${activePet?.id ?? ""}:${lifeState}:${activeDisplayedAsset?.id ?? baseAsset?.id ?? ""}`,
    onDirection: performApproach,
  });

  const isDraggingRef = useRef(false);
  const applyIgnoreRef = useRef<(nextIgnore: boolean) => void>(() => undefined);

  const handleDragSessionChange = useCallback((active: boolean, event?: PointerEvent<HTMLElement>): void => {
    isDraggingRef.current = active;
    if (active) {
      applyIgnoreRef.current(false);
      api.cancelPettingGesture();
      finishAction();
    } else if (event) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const isInteractive = Boolean(target?.closest?.('[data-pet-interactive="true"]'));
      applyIgnoreRef.current(!isInteractive);
    } else {
      applyIgnoreRef.current(true);
    }
  }, [api, finishAction]);

  const {
    state: interactionState,
    attention,
    handlers: interactionHandlers,
  } = usePetInteractions({
    api,
    visible: Boolean((snapshot?.petWindow.visible || runtimeActive) && pageVisible && !presenceTransitionActive),
    hoverRect: displayedPersonRect ?? visiblePersonRect,
    hoverEnabled: Boolean(pageVisible && !runtimeActive && !actionState && !presenceTransitionActive),
    reducedMotion,
    angryVelocity: activePet?.actionTemplates.dragAngryVelocity ?? 1_200,
    onAngry: (finish) => {
      showDialogue("angry");
      performCurrentPhotoAction("angry-shake", 0, finish);
    },
    onLand: () => {
      performCurrentPhotoAction("settle");
    },
    onPrimaryClick: handlePrimaryClick,
    onDragStarted: () => {
      resetWakeSequence();
      api.cancelPettingGesture();
      finishAction();
    },
    onDragSessionChange: handleDragSessionChange,
    onLocalPointerMove: (event) => {
      const pettingCandidateActive = pettingPointerMove(event);
      bodyWaddlePointerMove(event, pettingCandidateActive);
      return pettingCandidateActive;
    },
    runtimeState,
  });

  useEffect(() => {
    if (!pageVisible || !snapshot?.petWindow.visible || presenceTransitionActive) {
      if (presenceTransitionActive) api.setIgnoreMouseEvents(true);
      return;
    }

    let ignoring = false;
    const applyIgnore = (nextIgnore: boolean): void => {
      if (ignoring === nextIgnore) return;
      ignoring = nextIgnore;
      api.setIgnoreMouseEvents(nextIgnore);
    };
    applyIgnoreRef.current = applyIgnore;

    const initialInteractive = Boolean(document.querySelector('[data-pet-interactive="true"]:hover'));
    applyIgnore(!initialInteractive);

    const handleMouseMove = (event: MouseEvent): void => {
      if (isDraggingRef.current) {
        applyIgnore(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      const isInteractive = Boolean(target?.closest?.('[data-pet-interactive="true"]'));
      applyIgnore(!isInteractive);
    };

    const handleMouseLeave = (): void => {
      if (!isDraggingRef.current) {
        applyIgnore(true);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      applyIgnoreRef.current = () => undefined;
      applyIgnore(false);
    };
  }, [api, pageVisible, presenceTransitionActive, snapshot?.petWindow.visible]);

  const performAmbient = useCallback((): void => {
    if (!activePet || !baseAsset) return;
    const motion = selectAmbientMotion(
      lifeState,
      activePet.companionPace,
      previousAmbientMotion.current,
      Math.random
    );
    previousAmbientMotion.current = motion;
    performCurrentPhotoAction(motion, resolveDirection(motion));
  }, [activePet, baseAsset, lifeState, performCurrentPhotoAction, resolveDirection]);

  const performPersonality = useCallback((): void => {
    if (!activePet) return;
    const dialogueChance = activePet.companionPace === "quiet" ? 0.18 : activePet.companionPace === "lively" ? 0.3 : 0.24;
    if (Math.random() < dialogueChance) showDialogue("auto:cute");
    if (shouldSwapPersonalityPhoto(activePet.companionPace, activePet.actionSlots.idle.length > 1, Math.random)) {
      const nextIndex = (dailyIndex + 1) % activePet.actionSlots.idle.length;
      const nextId = activePet.actionSlots.idle[nextIndex]!;
      setDailyIndex(nextIndex);
      performResolvedAction(
        { slot: "idle", assetIds: [nextId], template: "asset-swap", overlays: [], usedFallback: true }
      );
    } else if (!reducedMotion) {
      const motion = selectPersonalityMotion(
        lifeState,
        activePet.companionPace,
        previousPersonalityMotion.current,
        Math.random
      );
      previousPersonalityMotion.current = motion;
      performCurrentPhotoAction(motion, resolveDirection(motion));
    }
  }, [activePet, dailyIndex, lifeState, performCurrentPhotoAction, performResolvedAction, reducedMotion, resolveDirection, showDialogue]);

  useCompanionPresence({
    enabled: Boolean(
      activePet &&
      baseAsset &&
      pageVisible &&
      snapshot?.petWindow.visible &&
      !runtimeActive &&
      !presenceTransitionActive
    ),
    busy: interactionState !== "idle" || Boolean(actionState),
    pace: activePet?.companionPace ?? "natural",
    lifeState,
    reducedMotion,
    resetKey: activePet?.id ?? "none",
    onAmbient: performAmbient,
    onMotion: performApproach,
    onPersonality: performPersonality,
  });

  useEffect(
    () =>
      api.onPetInteractionRequested((request) => {
        if (!activePet || !baseAsset || runtimeActive || presenceTransitionActive) return;
        if (request.type === "play-now") {
          if (lifeState !== "daily-calm" && lifeState !== "daily-playful") return;
          showDialogue("daily:click");
          performCurrentPhotoAction("playful-double-hop", resolveDirection("playful-double-hop"));
          return;
        }
        if (request.type === "quick-dialogue") {
          if (request.petId !== activePet.id) return;
          previewDialogue({
            text: request.text,
            voiceAssetId: request.voiceAssetId,
            voiceTrimStart: request.voiceTrimStart,
            voiceTrimEnd: request.voiceTrimEnd,
            voiceVolume: request.voiceVolume,
          });
          return;
        }
        if (request.type === "preview-dialogue") {
          if (request.petId !== activePet.id) return;
          previewDialogue({
            text: request.text,
            voiceAssetId: request.voiceAssetId,
            voiceTrimStart: request.voiceTrimStart,
            voiceTrimEnd: request.voiceTrimEnd,
            voiceVolume: request.voiceVolume,
          });
          performCurrentPhotoAction("calm-lean", resolveDirection("calm-lean"));
          return;
        }
        if (request.pace === "quiet") performCurrentPhotoAction("gentle-breathe");
        else if (request.pace === "natural") performCurrentPhotoAction("observe-lean", resolveDirection("observe-lean"));
        else performCurrentPhotoAction("playful-double-hop", resolveDirection("playful-double-hop"));
      }),
    [
      activePet,
      api,
      baseAsset,
      lifeState,
      performCurrentPhotoAction,
      presenceTransitionActive,
      previewDialogue,
      resolveDirection,
      runtimeActive,
      showDialogue,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.getPetSystemSnapshot(), api.getCompanionSystemSnapshot(), api.getRestSystemSnapshot()]).then(
      ([pet, companion, rest]) => {
        if (cancelled) return;
        setSnapshot(pet);
        setCompanionSnapshot(companion);
        setRestSnapshot(rest);
        setError(false);
      },
      () => {
        if (!cancelled) setError(true);
      }
    );
    const unsubscribePet = api.onPetSystemChanged((next) => {
      if (!cancelled) {
        setSnapshot(next);
        setError(false);
      }
    });
    const unsubscribeCompanion = api.onCompanionSystemChanged((next) => {
      if (!cancelled) {
        setCompanionSnapshot(next);
        setError(false);
      }
    });
    const unsubscribeRest = api.onRestSystemChanged((next) => {
      if (!cancelled) {
        setRestSnapshot(next);
        setError(false);
      }
    });
    return () => {
      cancelled = true;
      unsubscribePet();
      unsubscribeCompanion();
      unsubscribeRest();
    };
  }, [api]);

  useEffect(() => {
    api.setBubbleDialogue(dialogue);
  }, [api, dialogue]);

  useEffect(() => () => api.setBubbleDialogue(null), [api]);

  useEffect(() => {
    const handleVisibility = (): void => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (): void => {
      finishAction();
      setReducedMotion(query.matches);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [finishAction]);

  useEffect(() => {
    previousClickMotion.current = null;
    previousAmbientMotion.current = null;
    previousPersonalityMotion.current = null;
    previousMotionDirection.current = null;
  }, [activePet?.companionPace, activePet?.id, lifeState]);

  useEffect(() => {
    if (presenceTransitionActive) return;
    if (previousLifeState.current === lifeState) return;
    previousLifeState.current = lifeState;
    if (lifeState === "drowsy") showDialogue("state:drowsy");
    else if (lifeState === "sleeping") showDialogue("state:sleeping");
    else if (lifeState === "working") showDialogue("state:working");
    else if (lifeState === "daily-calm") showDialogue("state:daily");
  }, [lifeState, presenceTransitionActive, showDialogue]);

  useEffect(() => {
    if (presenceTransitionActive) return;
    const prev = previousRuntimeState.current;
    previousRuntimeState.current = runtimeState;
    if (runtimeState === "crying") {
      showDialogue("rest:crying", true);
    } else if (runtimeState === "celebrating") {
      showDialogue("rest:completion", true);
    } else if (prev === "crying" || prev === "celebrating" || (prev !== null && runtimeState === null)) {
      clearDialogue();
    }
  }, [clearDialogue, presenceTransitionActive, runtimeState, showDialogue]);

  useEffect(() => {
    if (wakeResetTimer.current) {
      clearTimeout(wakeResetTimer.current);
      wakeResetTimer.current = null;
    }
    wakeSequence.current.reset();
    pendingWakeDip.current = false;
    if (!pageVisible || !snapshot?.petWindow.visible || runtimeActive) {
      clearActionTimers();
      const timer = window.setTimeout(() => {
        setActionState(null);
        setHeartVisible(false);
        setDoubleHeart(false);
        setWakePhotoOverride(null);
        if (!pageVisible || !snapshot?.petWindow.visible) clearDialogue();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [
    activePet?.id,
    clearActionTimers,
    clearDialogue,
    lifeState,
    pageVisible,
    runtimeActive,
    snapshot?.petWindow.visible,
  ]);

  useEffect(() => () => clearActionTimers(), [clearActionTimers]);

  const openSettings = (event: React.MouseEvent): void => {
    event.stopPropagation();
    void api.openSettings().catch(() => undefined);
  };

  const motionOrigin = displayedPersonRect
    ? `${displayedPersonRect.x + displayedPersonRect.width / 2}px ${displayedPersonRect.y + displayedPersonRect.height}px`
    : "center bottom";
  const requestedTemplate: MotionTemplate = !pageVisible
    ? "still"
    : runtimeState === "crying"
      ? "crying-tremble"
      : runtimeState === "celebrating"
        ? "playful-double-hop"
        : (resolvedAction?.template ?? (runtimeActive ? "gentle-breathe" : "still"));
  const resolvedMotion = resolveMotion(requestedTemplate, reducedMotion);
  const template = resolvedMotion.template;
  const motionDirection = actionState?.direction ?? 0;
  const targetHeight = activePet?.targetHeight ?? 180;
  const motionX = motionDirection * scaleMotionDip(2, targetHeight);
  const shakeX = scaleMotionDip(4, targetHeight);
  const shiftAmplitude = getWeightShiftAmplitude(
    template === "working-shift" ? "working-shift" : "weight-shift",
    targetHeight
  );
  const shiftX = motionDirection * shiftAmplitude.horizontalDip;
  const shiftRotate = motionDirection * shiftAmplitude.rotationDeg;
  const actionStyle = {
    "--motion-duration": `${resolvedMotion.durationMs}ms`,
    "--motion-x": `${motionX}px`,
    "--motion-x-neg": `${-motionX}px`,
    "--motion-shift-x": `${shiftX}px`,
    "--motion-shift-rotate": `${shiftRotate}deg`,
    "--motion-rotate": `${motionDirection * 1.6}deg`,
    "--motion-rotate-soft": `${motionDirection * 0.8}deg`,
    "--motion-rotate-soft-neg": `${motionDirection * -0.8}deg`,
    "--motion-hop": `${scaleMotionDip(6, targetHeight)}px`,
    "--motion-hop-neg": `${-scaleMotionDip(6, targetHeight)}px`,
    "--motion-hop-small": `${scaleMotionDip(4, targetHeight)}px`,
    "--motion-hop-small-neg": `${-scaleMotionDip(4, targetHeight)}px`,
    "--motion-rise": `${scaleMotionDip(2, targetHeight)}px`,
    "--motion-rise-neg": `${-scaleMotionDip(2, targetHeight)}px`,
    "--motion-down": `${scaleMotionDip(3, targetHeight)}px`,
    "--motion-down-neg": `${-scaleMotionDip(3, targetHeight)}px`,
    "--motion-shake-x": `${shakeX}px`,
    "--motion-shake-x-neg": `${-shakeX}px`,
    "--motion-origin": motionOrigin,
  } as CSSProperties;
  const attentionStyle = {
    "--attention-x": `${attention.translateX}px`,
    "--attention-y": `${attention.translateY}px`,
    "--attention-rotate": `${attention.rotate}deg`,
    "--attention-duration": `${attention.transitionMs}ms`,
    "--motion-origin": motionOrigin,
  } as CSSProperties;
  const overlayX = displayedHeadHotspot
    ? displayedHeadHotspot.centerX + displayedHeadHotspot.radiusX * 0.45
    : displayedPersonRect
      ? displayedPersonRect.x + displayedPersonRect.width * 0.58
      : 0;
  const overlayY = displayedHeadHotspot
    ? displayedHeadHotspot.centerY - displayedHeadHotspot.radiusY * 0.2
    : displayedPersonRect
      ? displayedPersonRect.y + displayedPersonRect.height * 0.18
      : 0;
  const overlayStyle = {
    "--overlay-x": `${overlayX}px`,
    "--overlay-y": `${overlayY}px`,
    "--motion-origin": motionOrigin,
  } as CSSProperties;
  const handlePhotoTransitionComplete = (completedAssetId?: string): void => {
    if (pendingWakeDip.current) {
      pendingWakeDip.current = false;
      if (completedAssetId && completedAssetId === wakePhotoOverride) {
        performCurrentPhotoAction("drowsy-dip", resolveDirection("drowsy-dip"));
        return;
      }
    }
    if (!actionState || actionState.action.template !== "asset-swap") return;
    if (completedAssetId && completedAssetId !== actionState.action.assetIds[0] && actionState.phase === "active") {
      finishAction();
      return;
    }
    const needsReturn = actionState.action.assetIds[0] !== baseAsset?.id;
    const step = determineAssetSwapStep(actionState.phase, reducedMotion, needsReturn);
    if (step.action === "finish") {
      finishAction();
      return;
    }
    if (step.action === "return-immediately") {
      setActionState((current) =>
        current && current.petId === activePet?.id && current.phase === "active"
          ? { ...current, phase: "returning" }
          : current
      );
      return;
    }
    if (step.action === "hold-then-return") {
      actionTimers.current.push(
        setTimeout(() => {
          setActionState((current) =>
            current && current.petId === activePet?.id && current.phase === "active"
              ? { ...current, phase: "returning" }
              : current
          );
        }, step.holdMs)
      );
      return;
    }
  };

  useLayoutEffect(() => {
    const node = actionLayerRef.current;
    if (!node || template === "still" || template === "asset-swap" || !pageVisible) return;
    for (const animation of node.getAnimations()) {
      animation.cancel();
      animation.play();
    }
  }, [motionRunId, pageVisible, template]);

  if (error) {
    return (
      <main className={clsx(styles.shell, styles.emptyRuntime)}>
        <button className={styles.emptyButton} type="button" onClick={openSettings} data-pet-interactive="true">
          打开设置
        </button>
      </main>
    );
  }

  return (
    <main
      className={clsx(styles.shell, "pet-shell", `action-${template}`)}
      data-state={interactionState}
      data-presence={presence.phase}
      {...interactionHandlers}
    >
      {activePet && desiredAsset && dailyFallbackAsset ? (
        <div
          className={clsx(
            styles.presenceStage,
            presence.request?.kind === "enter" && styles.presenceEnter,
            presence.request?.kind === "exit" && styles.presenceExit
          )}
          onAnimationEnd={presence.handleAnimationEnd}
        >
          <div className={clsx(styles.actor, "pet-actor")} aria-label={activePet.name}>
            <div className={styles.attentionLayer} style={attentionStyle}>
              <div ref={actionLayerRef} className={styles.actionLayer} data-motion={template} style={actionStyle}>
                <PhotoTransition
                  key={activePet.id}
                  petId={activePet.id}
                  asset={desiredAsset}
                  fallbackAsset={dailyFallbackAsset}
                  targetHeight={activePet.targetHeight}
                  onTransitionComplete={handlePhotoTransitionComplete}
                  onDisplayedAssetChange={handleDisplayedAssetChange}
                />
                {displayedPersonRect && (
                  <div
                    className={styles.interactionHitbox}
                    data-pet-interactive="true"
                    data-pet-drag="true"
                    style={{
                      left: displayedPersonRect.x,
                      top: displayedPersonRect.y,
                      width: displayedPersonRect.width,
                      height: displayedPersonRect.height,
                    }}
                  />
                )}
              </div>
              <div className={styles.overlayLayer} style={overlayStyle} aria-hidden="true">
                {pageVisible && runtimeState === "crying" && (
                  <span className={styles.tearsWrap}>
                    <Tear className={styles.tearPrimary} />
                    <Tear className={styles.tearSecondary} />
                  </span>
                )}
                {pageVisible && heartVisible && (
                  <span key={heartRunId} className={styles.heartWrap}>
                    <Heart className={styles.heartPrimary} />
                    {doubleHeart && <Heart className={styles.heartSecondary} />}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.emptyRuntime}>
          <div className={styles.silhouetteContainer}>
            <svg
              className={styles.silhouetteSvg}
              viewBox="0 0 180 216"
              width="180"
              height="216"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                className={styles.silhouetteBody}
                d="M 90,12 A 44,44 0 0,1 134,56 C 134,74 126,90 114,98 C 122,102 138,108 148,116 A 11,11 0 1,1 138,136 C 134,140 136,150 136,162 C 136,174 133,188 130,196 C 128,203 124,206 112,206 C 100,206 96,203 95,196 C 94,190 92,186 90,186 C 88,186 86,190 85,196 C 84,203 80,206 68,206 C 56,206 52,203 50,196 C 47,188 44,174 44,162 C 44,150 46,140 42,136 A 11,11 0 1,1 32,116 C 42,108 58,102 66,98 C 54,90 46,74 46,56 A 44,44 0 0,1 90,12 Z"
                data-pet-interactive="true"
                data-pet-drag="true"
              />
            </svg>
            <button
              className={styles.emptyButton}
              type="button"
              data-pet-interactive="true"
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={openSettings}
            >
              <svg
                viewBox="0 0 16 16"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="8" y1="3" x2="8" y2="13" />
                <line x1="3" y1="8" x2="13" y2="8" />
              </svg>
              <span>添加伙伴</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function resolveLifeAsset(pet: PetConfig, state: CompanionLifeState, dailyIndex: number): PetAsset | null {
  const dailyIds = pet.actionSlots.idle;
  let ids: readonly string[] = dailyIds;
  if (state === "drowsy" && pet.lifeStates.drowsy.enabled && pet.lifeStates.drowsy.assetIds.length > 0)
    ids = pet.lifeStates.drowsy.assetIds;
  else if (state === "sleeping" && pet.lifeStates.sleeping.enabled && pet.lifeStates.sleeping.assetIds.length > 0)
    ids = pet.lifeStates.sleeping.assetIds;
  else if (state === "working" && pet.lifeStates.workingAssetIds.length > 0) ids = pet.lifeStates.workingAssetIds;
  const index = ids === dailyIds && ids.length > 0 ? dailyIndex % ids.length : 0;
  const id = ids[index] ?? dailyIds[0];
  return pet.assets.find((asset) => asset.id === id) ?? pet.assets.find((asset) => asset.id === dailyIds[0]) ?? null;
}

function Heart({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" width="30" height="30">
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill="#F43F5E"
      />
    </svg>
  );
}

function Tear({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none">
      <path
        d="M12 2.5C12 2.5 5 11.5 5 16C5 19.866 8.134 23 12 23C15.866 23 19 19.866 19 16C19 11.5 12 2.5 12 2.5Z"
        fill="#60A5FA"
      />
      <path
        d="M9.5 13.5C9 14.8 9.2 16.5 10.5 17.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}
