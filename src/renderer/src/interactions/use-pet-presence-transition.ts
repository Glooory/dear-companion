import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type AnimationEvent } from "react";
import type { PetPresenceTransitionRequest, PetSystemApi } from "@shared/contracts";

export type PetPresencePhase = "entering" | "visible" | "exiting" | "hidden";
const RENDERER_TRANSITION_TIMEOUT_MS = 350;

export function usePetPresenceTransition({
  api,
  actorAvailable,
  requestedVisible,
  onTransitionRequested,
}: {
  api: Pick<
    PetSystemApi,
    "onPetPresenceTransitionRequested" | "reportPetPresenceTransitionReady" | "reportPetPresenceTransitionComplete"
  >;
  actorAvailable: boolean | null;
  requestedVisible: boolean;
  onTransitionRequested(): void;
}) {
  const [request, setRequest] = useState<PetPresenceTransitionRequest | null>(null);

  const complete = useCallback(
    (id: number): void => {
      api.reportPetPresenceTransitionComplete(id);
      setRequest((current) => (current?.id === id ? null : current));
    },
    [api]
  );

  useEffect(
    () =>
      api.onPetPresenceTransitionRequested((next) => {
        onTransitionRequested();
        setRequest(next);
      }),
    [api, onTransitionRequested]
  );

  useLayoutEffect(() => {
    if (request?.kind === "enter") api.reportPetPresenceTransitionReady(request.id);
  }, [api, request]);

  useEffect(() => {
    if (!request || actorAvailable !== false) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) complete(request.id);
    });
    return () => {
      cancelled = true;
    };
  }, [actorAvailable, complete, request]);

  useEffect(() => {
    if (!request) return;
    const timer = window.setTimeout(() => complete(request.id), RENDERER_TRANSITION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [complete, request]);

  const phase = useMemo<PetPresencePhase>(() => {
    if (request?.kind === "enter") return "entering";
    if (request?.kind === "exit") return "exiting";
    return requestedVisible ? "visible" : "hidden";
  }, [request, requestedVisible]);

  const handleAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLElement>): void => {
      if (event.target !== event.currentTarget || !request || !isExpectedAnimation(request, event.animationName))
        return;
      complete(request.id);
    },
    [complete, request]
  );

  return { request, phase, handleAnimationEnd };
}

function isExpectedAnimation(request: PetPresenceTransitionRequest, animationName: string): boolean {
  const expected = request.kind === "enter" ? "presenceFadeIn" : "presenceFadeOut";
  return animationName.includes(expected);
}
