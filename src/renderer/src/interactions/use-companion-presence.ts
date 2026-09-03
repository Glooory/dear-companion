import { useEffect, useRef, useState } from "react";
import { nextAmbientDelay, nextMotionDelay, PresenceDeadline } from "@shared/companion-presence";
import { nextAutoCuteDelay } from "@shared/companion-rhythm";
import type { CompanionLifeState, CompanionPace } from "@shared/contracts";

interface UseCompanionPresenceOptions {
  enabled: boolean;
  busy: boolean;
  pace: CompanionPace;
  lifeState: CompanionLifeState;
  reducedMotion: boolean;
  resetKey: string;
  onAmbient(): void;
  onMotion(): void;
  onPersonality(): void;
}

type Layer = "ambient" | "motion" | "personality";

export function useCompanionPresence(options: UseCompanionPresenceOptions): void {
  const [revision, setRevision] = useState(0);
  const deadlines = useRef({
    ambient: new PresenceDeadline(),
    motion: new PresenceDeadline(),
    personality: new PresenceDeadline(),
  });
  const callbacks = useRef({
    ambient: options.onAmbient,
    motion: options.onMotion,
    personality: options.onPersonality,
  });
  const contextKey = `${options.enabled}:${options.lifeState}:${options.pace}:${options.reducedMotion}:${options.resetKey}`;
  const previousContextKey = useRef<string | null>(null);

  useEffect(() => {
    callbacks.current = {
      ambient: options.onAmbient,
      motion: options.onMotion,
      personality: options.onPersonality,
    };
  }, [options.onAmbient, options.onMotion, options.onPersonality]);

  useEffect(() => {
    if (previousContextKey.current !== contextKey) {
      for (const deadline of Object.values(deadlines.current)) deadline.clear();
      previousContextKey.current = contextKey;
    }
    if (!options.enabled) return;
    const now = Date.now();
    const daily = options.lifeState === "daily-calm" || options.lifeState === "daily-playful";
    const motionEnabled = daily && !options.reducedMotion;
    const personalityEnabled = daily;
    const current = deadlines.current;

    current.ambient.arm(now, nextAmbientDelay(options.lifeState === "working" ? "quiet" : options.pace, Math.random));
    if (motionEnabled) current.motion.arm(now, nextMotionDelay(options.pace, Math.random));
    else current.motion.clear();
    if (personalityEnabled) current.personality.arm(now, nextAutoCuteDelay(options.pace, Math.random));
    else current.personality.clear();

    const active: Array<[Layer, PresenceDeadline]> = [["ambient", current.ambient]];
    if (motionEnabled) active.push(["motion", current.motion]);
    if (personalityEnabled) active.push(["personality", current.personality]);
    active.sort((left, right) => (left[1].dueAt ?? Infinity) - (right[1].dueAt ?? Infinity));
    const [layer, deadline] = active[0]!;
    const dueAt = deadline.dueAt ?? now;
    const wait = options.busy && dueAt <= now ? 1_000 + Math.round(Math.random() * 2_000) : Math.max(0, dueAt - now);

    const timer = window.setTimeout(() => {
      if (options.busy) {
        setRevision((value) => value + 1);
        return;
      }
      const firedAt = Date.now();
      if (!deadline.isDue(firedAt)) {
        setRevision((value) => value + 1);
        return;
      }
      if (layer === "ambient")
        deadline.consume(
          firedAt,
          nextAmbientDelay(options.lifeState === "working" ? "quiet" : options.pace, Math.random)
        );
      else if (layer === "motion") deadline.consume(firedAt, nextMotionDelay(options.pace, Math.random));
      else deadline.consume(firedAt, nextAutoCuteDelay(options.pace, Math.random));
      callbacks.current[layer]();
      setRevision((value) => value + 1);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [contextKey, options.busy, options.enabled, options.lifeState, options.pace, options.reducedMotion, revision]);
}
