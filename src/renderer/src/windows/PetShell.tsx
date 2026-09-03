import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { clsx } from "clsx";
import { resolveAction, type ActionTemplate, type ResolvedAction } from "@shared/action-fallback";
import { createPeepApproachSteps, createPostureShiftSteps } from "@shared/companion-rhythm";
import type {
  ActionSlot,
  CompanionLifeState,
  CompanionSystemSnapshot,
  PetAsset,
  PetConfig,
  PetSystemSnapshot,
  RestSystemApi,
  RestSystemSnapshot,
} from "@shared/contracts";
import { WakeSequence } from "@shared/wake-sequence";
import { useAudioPlayback } from "../audio/use-audio-playback";
import { PhotoTransition } from "../components/PhotoTransition";
import { useDialogue } from "../dialogues/use-dialogue";
import { useBodyWaddleGesture } from "../interactions/use-body-waddle-gesture";
import { useCompanionPresence } from "../interactions/use-companion-presence";
import { usePetInteractions } from "../interactions/use-pet-interactions";
import { usePettingGesture } from "../interactions/use-petting-gesture";
import styles from "./PetShell.module.css";

const CLICK_ACTION_VARIANTS: readonly ActionTemplate[] = ["bounce", "curious-tilt", "wiggle", "nod"];
const PETTING_ACTION_VARIANTS: readonly ActionTemplate[] = ["petting-sink", "nuzzle", "purr-swell"];

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
    phase: "active" | "returning";
  } | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [heartVisible, setHeartVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(document.visibilityState === "visible");
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [dailyIndex, setDailyIndex] = useState(0);
  const actionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const actionCompletion = useRef<(() => void) | null>(null);
  const wakeSequence = useRef(new WakeSequence());
  const previousLifeState = useRef<CompanionLifeState | null>(null);
  const previousRuntimeState = useRef<string | null>(null);

  const activePet = useMemo(() => snapshot?.pets.find((pet) => pet.id === snapshot.activePetId) ?? null, [snapshot]);
  const lifeState = companionSnapshot?.runtime.lifeState ?? "daily-calm";
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
  const {
    dialogue,
    show: showDialogue,
    clear: clearDialogue,
  } = useDialogue(activePet?.interactionBubblesEnabled ?? true, activePet?.dialogueSettings, activePet?.id);
  useAudioPlayback(api, pageVisible);

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
      pendingCompletion?.();
    },
    [clearActionTimers]
  );

  const performResolvedAction = useCallback(
    (action: ResolvedAction, duration: number, complete?: () => void): void => {
      if (!activePet) return;
      clearActionTimers();
      api.cancelPettingGesture();
      actionCompletion.current = complete ?? null;
      setActionState({ petId: activePet.id, action, phase: "active" });
      setFrameIndex(0);
      actionTimers.current.push(
        setTimeout(() => {
          if (action.template === "asset-swap" && action.assetIds[0] !== baseAsset?.id) {
            setActionState((current) =>
              current?.petId === activePet.id && current.action === action
                ? { ...current, phase: "returning" }
                : current
            );
            return;
          }
          finishAction(complete);
        }, duration)
      );
    },
    [activePet, api, baseAsset?.id, clearActionTimers, finishAction]
  );

  const performCurrentPhotoAction = useCallback(
    (template: ActionTemplate, duration = 900): void => {
      if (!baseAsset) return;
      performResolvedAction(
        {
          slot: "idle",
          assetIds: [baseAsset.id],
          template,
          overlays: [],
          usedFallback: true,
        },
        duration
      );
    },
    [baseAsset, performResolvedAction]
  );

  const performWaddle = useCallback(
    (direction?: -1 | 1): void => {
      if (!baseAsset) return;
      if (direction === undefined) {
        const steps = createPeepApproachSteps(Math.random);
        performCurrentPhotoAction("peep-approach", 1_600);
        steps.forEach((deltaX, index) => {
          actionTimers.current.push(setTimeout(() => api.nudgePetBy(deltaX, 0), 180 + index * 180));
        });
      } else {
        const steps = createPostureShiftSteps(direction, Math.random);
        performCurrentPhotoAction("posture-shift", 800);
        steps.forEach((deltaX, index) => {
          actionTimers.current.push(setTimeout(() => api.nudgePetBy(deltaX, 0), 140 + index * 160));
        });
      }
    },
    [api, baseAsset, performCurrentPhotoAction]
  );

  const handlePrimaryClick = useCallback((): void => {
    if (!activePet || !baseAsset || runtimeActive) return;
    if (lifeState === "sleeping") {
      const stage = wakeSequence.current.registerClick(Date.now());
      if (stage === "murmur") {
        showDialogue("sleeping:murmur");
        performCurrentPhotoAction("sway", 700);
      } else if (stage === "stirring") {
        showDialogue("sleeping:stirring");
        const drowsyId = activePet.lifeStates.drowsy.assetIds[0];
        performResolvedAction(
          {
            slot: "idle",
            assetIds: drowsyId ? [drowsyId] : [baseAsset.id],
            template: drowsyId ? "asset-swap" : "nod",
            overlays: [],
            usedFallback: !drowsyId,
          },
          1_100
        );
      } else {
        showDialogue("sleeping:awake");
        finishAction();
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
      const variant = CLICK_ACTION_VARIANTS[Math.floor(Math.random() * CLICK_ACTION_VARIANTS.length)]!;
      performCurrentPhotoAction(variant, variant === "nod" ? 720 : 600);
    } else if (lifeState === "drowsy") {
      showDialogue("drowsy:click");
      performCurrentPhotoAction("nod", 800);
    } else if (lifeState === "working") {
      showDialogue("working:click");
      performCurrentPhotoAction("nod", 650);
    }
  }, [
    activePet,
    api,
    baseAsset,
    finishAction,
    lifeState,
    performCurrentPhotoAction,
    performResolvedAction,
    runtimeActive,
    showDialogue,
  ]);

  const handlePettingDetected = useCallback((): void => {
    if (!activePet || !baseAsset || runtimeActive) return;
    setHeartVisible(true);
    if (lifeState === "sleeping") {
      showDialogue("sleeping:touch");
      performCurrentPhotoAction("gentle-breathe", 900);
    } else if (lifeState === "daily-calm" || lifeState === "daily-playful") {
      showDialogue("daily:petting");
      const variant = PETTING_ACTION_VARIANTS[Math.floor(Math.random() * PETTING_ACTION_VARIANTS.length)]!;
      performCurrentPhotoAction(variant, activePet.actionTemplates.pettingDurationMs);
    } else if (lifeState === "drowsy") {
      showDialogue("drowsy:petting");
      performCurrentPhotoAction("scale-nod", 900);
    } else {
      showDialogue("working:petting");
      performCurrentPhotoAction("scale-nod", 650);
    }
  }, [activePet, baseAsset, lifeState, performCurrentPhotoAction, runtimeActive, showDialogue]);

  const pettingPointerMove = usePettingGesture({
    api,
    petId: activePet?.id ?? null,
    asset: baseAsset,
    targetHeight: activePet?.targetHeight ?? 180,
    active: Boolean(activePet && baseAsset && pageVisible && snapshot?.petWindow.visible && !runtimeActive),
    dependencyKey: `${lifeState}:${baseAsset?.id ?? ""}`,
    onDetected: handlePettingDetected,
  });
  const bodyWaddlePointerMove = useBodyWaddleGesture({
    asset: baseAsset,
    targetHeight: activePet?.targetHeight ?? 180,
    active: Boolean(
      activePet &&
      baseAsset &&
      pageVisible &&
      snapshot?.petWindow.visible &&
      !runtimeActive &&
      !actionState &&
      (lifeState === "daily-calm" || lifeState === "daily-playful") &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ),
    dependencyKey: `${activePet?.id ?? ""}:${lifeState}:${baseAsset?.id ?? ""}`,
    onDirection: performWaddle,
  });

  const isDraggingRef = useRef(false);
  const applyIgnoreRef = useRef<(nextIgnore: boolean) => void>(() => undefined);

  const handleDragSessionChange = useCallback((active: boolean, event?: PointerEvent<HTMLElement>): void => {
    isDraggingRef.current = active;
    if (active) {
      applyIgnoreRef.current(false);
    } else if (event) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const isInteractive = Boolean(target?.closest?.('[data-pet-interactive="true"]'));
      applyIgnoreRef.current(!isInteractive);
    } else {
      applyIgnoreRef.current(true);
    }
  }, []);

  const {
    state: interactionState,
    tilt,
    handlers: interactionHandlers,
  } = usePetInteractions({
    api,
    visible: Boolean((snapshot?.petWindow.visible || runtimeActive) && pageVisible),
    angryVelocity: activePet?.actionTemplates.dragAngryVelocity ?? 1_200,
    onAngry: (finish) => {
      showDialogue("angry");
      performCurrentPhotoAction("fast-shake", activePet?.actionTemplates.angryDurationMs ?? 1_040);
      finish();
    },
    onLand: () => {
      performCurrentPhotoAction("land", 380);
    },
    onPrimaryClick: handlePrimaryClick,
    onDragStarted: () => {
      wakeSequence.current.reset();
      api.cancelPettingGesture();
      finishAction();
    },
    onDragSessionChange: handleDragSessionChange,
    onLocalPointerMove: (event) => {
      const pettingCandidateActive = pettingPointerMove(event);
      bodyWaddlePointerMove(event, pettingCandidateActive);
    },
    runtimeState,
  });

  useEffect(() => {
    if (!pageVisible || !snapshot?.petWindow.visible) return;

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
  }, [api, pageVisible, snapshot?.petWindow.visible]);

  const performAmbient = useCallback((): void => {
    if (!activePet || !baseAsset) return;
    if (lifeState === "sleeping" || lifeState === "working" || reducedMotion) {
      performCurrentPhotoAction("gentle-breathe", 1_600);
    } else if (lifeState === "drowsy") {
      const roll = Math.random();
      if (roll < 0.45) performCurrentPhotoAction("drowsy-catch", 1_600);
      else if (roll < 0.75) performCurrentPhotoAction("nod", 900);
      else performCurrentPhotoAction("gentle-breathe", 1_600);
    } else {
      const templates: ActionTemplate[] = ["gentle-breathe", "nod", "rhythm-sway"];
      performCurrentPhotoAction(templates[Math.floor(Math.random() * templates.length)]!, 1_200);
    }
  }, [activePet, baseAsset, lifeState, performCurrentPhotoAction, reducedMotion]);

  const performPersonality = useCallback((): void => {
    if (Math.random() < 0.35) showDialogue("auto:cute");
    if (activePet && activePet.actionSlots.idle.length > 1 && Math.random() < 0.35) {
      const nextIndex = (dailyIndex + 1) % activePet.actionSlots.idle.length;
      const nextId = activePet.actionSlots.idle[nextIndex]!;
      setDailyIndex(nextIndex);
      performResolvedAction(
        { slot: "idle", assetIds: [nextId], template: "asset-swap", overlays: [], usedFallback: true },
        2_000
      );
    } else {
      const roll = Math.random();
      if (roll < 0.35) {
        performCurrentPhotoAction("stretch", 1_800);
      } else if (roll < 0.7) {
        performCurrentPhotoAction("rhythm-sway", 1_100);
      } else {
        performCurrentPhotoAction("curious-tilt", 800);
      }
    }
  }, [activePet, dailyIndex, performCurrentPhotoAction, performResolvedAction, showDialogue]);

  useCompanionPresence({
    enabled: Boolean(activePet && baseAsset && pageVisible && snapshot?.petWindow.visible && !runtimeActive),
    busy: interactionState !== "idle" || Boolean(actionState),
    pace: activePet?.companionPace ?? "natural",
    lifeState,
    reducedMotion,
    resetKey: activePet?.id ?? "none",
    onAmbient: performAmbient,
    onMotion: performWaddle,
    onPersonality: performPersonality,
  });

  useEffect(
    () =>
      api.onPetInteractionRequested((request) => {
        if (!activePet || !baseAsset || runtimeActive) return;
        if (request.type === "play-now") {
          if (lifeState !== "daily-calm" && lifeState !== "daily-playful") return;
          showDialogue("daily:click");
          performCurrentPhotoAction("bounce", 850);
          return;
        }
        if (request.pace === "quiet") performCurrentPhotoAction("gentle-breathe", 1_600);
        else if (request.pace === "natural") performCurrentPhotoAction("sway", 900);
        else performCurrentPhotoAction("bounce", 900);
      }),
    [activePet, api, baseAsset, lifeState, performCurrentPhotoAction, runtimeActive, showDialogue]
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
    const handleChange = (): void => setReducedMotion(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (previousLifeState.current === lifeState) return;
    previousLifeState.current = lifeState;
    if (lifeState === "drowsy") showDialogue("state:drowsy");
    else if (lifeState === "sleeping") showDialogue("state:sleeping");
    else if (lifeState === "working") showDialogue("state:working");
    else if (lifeState === "daily-calm") showDialogue("state:daily");
  }, [lifeState, showDialogue]);

  useEffect(() => {
    const prev = previousRuntimeState.current;
    previousRuntimeState.current = runtimeState;
    if (runtimeState === "crying") {
      showDialogue("system:crying", true);
    } else if (runtimeState === "celebrating") {
      showDialogue("system:completion", true);
    } else if (prev === "crying" || prev === "celebrating" || (prev !== null && runtimeState === null)) {
      clearDialogue();
    }
  }, [clearDialogue, runtimeState, showDialogue]);

  useEffect(() => {
    wakeSequence.current.reset();
    if (!pageVisible || !snapshot?.petWindow.visible || runtimeActive) {
      clearActionTimers();
      const timer = window.setTimeout(() => {
        setActionState(null);
        setHeartVisible(false);
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

  if (error) {
    return (
      <main className={clsx(styles.shell, styles.emptyRuntime)}>
        <button className={styles.emptyButton} type="button" onClick={openSettings} data-pet-interactive="true">
          打开设置
        </button>
      </main>
    );
  }

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
    : (resolvedAction?.assetIds[frameIndex] ?? resolvedAction?.assetIds[0] ?? baseAsset?.id);
  const desiredAsset = activePet?.assets.find((candidate) => candidate.id === desiredAssetId) ?? baseAsset;
  const template = resolvedAction?.template ?? (runtimeActive ? "gentle-breathe" : "still");
  const actorStyle = { "--pet-tilt-x": `${tilt.x}deg`, "--pet-tilt-y": `${tilt.y}deg` } as CSSProperties;
  const handlePhotoTransitionComplete = (): void => {
    if (!returningToBase) return;
    finishAction();
  };

  return (
    <main
      className={clsx(styles.shell, "pet-shell", `action-${template}`)}
      data-state={interactionState}
      {...interactionHandlers}
    >
      {activePet && desiredAsset && dailyFallbackAsset ? (
        <div className={clsx(styles.actor, "pet-actor")} style={actorStyle} aria-label={activePet.name}>
          <PhotoTransition
            key={`${activePet.id}:${pageVisible}:${snapshot?.petWindow.visible}:${runtimeActive}`}
            petId={activePet.id}
            asset={desiredAsset}
            fallbackAsset={dailyFallbackAsset}
            targetHeight={activePet.targetHeight}
            onTransitionComplete={handlePhotoTransitionComplete}
          />
          {resolvedAction?.overlays.includes("tears") && (
            <span className={styles.tearsWrap} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
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
            </span>
          )}
          {heartVisible && (
            <span className={styles.heartWrap} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30">
                <path
                  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                  fill="#F43F5E"
                />
              </svg>
            </span>
          )}
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
