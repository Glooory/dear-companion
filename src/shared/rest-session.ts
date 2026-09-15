import type { RestSessionSnapshot } from "./contracts";

export type RestSessionEvent =
  | { type: "movement" }
  | { type: "tick" }
  | { type: "resume" }
  | { type: "manual-end" }
  | { type: "celebration-complete" };

export const CRYING_DURATION_MS = 3_000;

export function remainingRestMilliseconds(endsAt: number, now: number, startedAt = 0): number {
  if (![endsAt, now, startedAt].every(Number.isFinite) || endsAt < startedAt) return 0;
  return Math.min(Math.max(endsAt - now, 0), endsAt - startedAt);
}

export function transitionRestSession(
  session: RestSessionSnapshot | null,
  event: RestSessionEvent,
  now: number
): RestSessionSnapshot | null {
  if (!session || !Number.isFinite(now)) return session;
  if (event.type === "manual-end" || event.type === "celebration-complete") return null;
  if (now >= session.endsAt) {
    return { ...session, state: "celebrating", cryingUntil: null };
  }
  if (event.type === "movement" && session.state !== "celebrating") {
    const nextCryingUntil = Math.max(session.cryingUntil ?? 0, now + CRYING_DURATION_MS);
    return { ...session, state: "crying", cryingUntil: nextCryingUntil };
  }
  if (session.state === "crying" && session.cryingUntil !== null && now >= session.cryingUntil) {
    return { ...session, state: "resting", cryingUntil: null };
  }
  if (event.type === "resume" && session.state !== "celebrating") {
    return { ...session, state: "resting", cryingUntil: null };
  }
  return { ...session };
}
