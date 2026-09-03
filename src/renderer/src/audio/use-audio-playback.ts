import { useEffect } from "react";
import type { RestSystemApi } from "@shared/contracts";

export function useAudioPlayback(
  api: Pick<RestSystemApi, "onAudioPlaybackRequested" | "reportAudioPlaybackFailure">,
  enabled: boolean
): void {
  useEffect(() => {
    let cancelCurrent: (() => void) | null = null;
    const unsubscribe = api.onAudioPlaybackRequested((request) => {
      cancelCurrent?.();
      cancelCurrent = null;
      if (!enabled) return;
      if (request.source.kind === "builtin") {
        cancelCurrent = playBuiltIn(request.cue);
        return;
      }
      const assetId = request.source.assetId;
      const audio = new Audio(`app://renderer/audio-assets/${encodeURIComponent(assetId)}`);
      let fallbackPlayed = false;
      const timeout = window.setTimeout(() => audio.pause(), request.maxDurationMs);
      const fail = (): void => {
        if (fallbackPlayed) return;
        fallbackPlayed = true;
        audio.pause();
        playBuiltIn(request.cue);
        api.reportAudioPlaybackFailure(request.requestId, assetId);
      };
      audio.addEventListener("error", fail, { once: true });
      void audio.play().catch(fail);
      cancelCurrent = () => {
        window.clearTimeout(timeout);
        audio.removeEventListener("error", fail);
        audio.pause();
        audio.src = "";
      };
    });
    return () => {
      unsubscribe();
      cancelCurrent?.();
    };
  }, [api, enabled]);
}

export function playAudioSource(
  cue: "reminder" | "crying",
  source: import("@shared/contracts").AudioSource,
  onEnded?: () => void
): () => void {
  if (source.kind === "builtin") {
    return playBuiltIn(cue, onEnded);
  }
  const audio = new Audio(`app://renderer/audio-assets/${encodeURIComponent(source.assetId)}`);
  let stopped = false;
  const finish = (): void => {
    if (stopped) return;
    stopped = true;
    onEnded?.();
  };
  const fail = (): void => {
    if (stopped) return;
    stopped = true;
    playBuiltIn(cue, onEnded);
  };
  audio.addEventListener("ended", finish, { once: true });
  audio.addEventListener("error", fail, { once: true });
  void audio.play().catch(fail);
  return () => {
    stopped = true;
    audio.removeEventListener("ended", finish);
    audio.removeEventListener("error", fail);
    audio.pause();
    audio.src = "";
    onEnded?.();
  };
}

export function playBuiltIn(cue: "reminder" | "crying", onEnded?: () => void): () => void {
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextClass();

  let stopped = false;
  const safeClose = (): void => {
    if (stopped) return;
    stopped = true;
    onEnded?.();
    void context.close().catch(() => undefined);
  };

  if (cue === "reminder") {
    const osc1 = context.createOscillator();
    const gain1 = context.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(783.99, context.currentTime);
    gain1.gain.setValueAtTime(0.0001, context.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.38, context.currentTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
    osc1.connect(gain1).connect(context.destination);
    osc1.start(context.currentTime);
    osc1.stop(context.currentTime + 0.42);

    const osc2 = context.createOscillator();
    const gain2 = context.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1046.5, context.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.0001, context.currentTime);
    gain2.gain.setValueAtTime(0.0001, context.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.42, context.currentTime + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.75);
    osc2.connect(gain2).connect(context.destination);
    osc2.start(context.currentTime + 0.12);
    osc2.stop(context.currentTime + 0.78);

    osc2.addEventListener("ended", safeClose, { once: true });
    return () => {
      osc2.removeEventListener("ended", safeClose);
      try {
        osc1.stop();
      } catch {
        /* already stopped */
      }
      try {
        osc2.stop();
      } catch {
        /* already stopped */
      }
      safeClose();
    };
  } else {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    const t = context.currentTime;
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.linearRampToValueAtTime(260, t + 0.15);
    osc.frequency.linearRampToValueAtTime(310, t + 0.28);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.55);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    gain.gain.setValueAtTime(0.32, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);

    osc.connect(gain).connect(context.destination);
    osc.start(t);
    osc.stop(t + 0.6);

    osc.addEventListener("ended", safeClose, { once: true });
    return () => {
      osc.removeEventListener("ended", safeClose);
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      safeClose();
    };
  }
}
