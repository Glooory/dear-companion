import { useCallback, useEffect, useRef, useState } from "react";
import { isDialogueCategory, type DialogueCategory } from "@shared/dialogue-catalog";
import { DialogueSelector } from "@shared/dialogue-selector";
import {
  resolveDialogueCandidates,
  type PetDialogueSettings,
  type ResolvedDialogueCandidate,
} from "@shared/dialogue-settings";
import { VoicePlaybackCoordinator } from "./voice-playback-coordinator";

export type DialogueTriggerKey = DialogueCategory | "system:crying" | "system:completion";

export interface DialoguePreviewOptions {
  text: string;
  voiceAssetId?: string;
  voiceTrimStart?: number;
  voiceTrimEnd?: number;
  voiceVolume?: number;
}

export function useDialogue(
  enabled: boolean,
  dialogueSettings?: PetDialogueSettings,
  petId?: string | null
): {
  dialogue: string | null;
  show(category: DialogueTriggerKey | string, required?: boolean): string | null;
  show(category: string, lines: readonly string[], required?: boolean): string | null;
  preview(options: DialoguePreviewOptions): void;
  clear(): void;
  hasVoiceForCategory(category: DialogueCategory): boolean;
} {
  const selector = useRef(new DialogueSelector());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voicePlayback] = useState(() => new VoicePlaybackCoordinator((src) => new Audio(src)));
  const [dialogue, setDialogue] = useState<string | null>(null);
  const previousPetId = useRef<string | null>(petId ?? null);

  const stopVoice = useCallback(() => {
    voicePlayback.stop();
  }, [voicePlayback]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stopVoice();
    setDialogue(null);
  }, [stopVoice]);

  useEffect(() => {
    if (previousPetId.current !== (petId ?? null)) {
      previousPetId.current = petId ?? null;
      selector.current.reset();
      clear();
    }
  }, [clear, petId]);

  const show = useCallback(
    (category: string, linesOrRequired?: readonly string[] | boolean, maybeRequired?: boolean): string | null => {
      const required = Array.isArray(linesOrRequired) ? Boolean(maybeRequired) : Boolean(linesOrRequired);

      let selected: string | null;
      let selectedCandidate: ResolvedDialogueCandidate | null = null;
      const effectiveCategory =
        category === "system:crying"
          ? "rest:crying"
          : category === "system:completion"
            ? "rest:completion"
            : category;

      if (Array.isArray(linesOrRequired)) {
        selected = selector.current.select({
          category,
          lines: linesOrRequired,
          now: Date.now(),
          random: Math.random,
          enabled: required || enabled,
        });
      } else if (isDialogueCategory(effectiveCategory)) {
        const candidates = resolveDialogueCandidates(effectiveCategory, dialogueSettings);
        selectedCandidate = selector.current.selectEntry({
          category: effectiveCategory,
          entries: candidates,
          getText: (candidate) => candidate.text,
          now: Date.now(),
          random: Math.random,
          enabled: required || enabled,
        });
        selected = selectedCandidate?.text ?? null;
      } else {
        selected = null;
      }

      if (!selected) return null;
      clear();
      setDialogue(selected);

      // Play voice if enabled and voiceAssetId exists
      const shouldPlayVoice =
        (required || enabled) &&
        Boolean(dialogueSettings?.voiceEnabled) &&
        Boolean(petId) &&
        Boolean(selectedCandidate?.voiceAssetId);

      if (shouldPlayVoice && petId && selectedCandidate?.voiceAssetId) {
        const assetId = selectedCandidate.voiceAssetId;
        const volume = Math.max(0, Math.min(1, dialogueSettings?.voiceVolume ?? 0.8));
        voicePlayback.schedule(
          `app://renderer/pet-voices/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`,
          volume,
          80,
          selectedCandidate.voiceTrimStart,
          selectedCandidate.voiceTrimEnd
        );
      }

      timer.current = setTimeout(() => {
        timer.current = null;
        stopVoice();
        setDialogue(null);
      }, 2_800);
      return selected;
    },
    [clear, dialogueSettings, enabled, petId, stopVoice, voicePlayback]
  );

  const hasVoiceForCategory = useCallback(
    (category: DialogueCategory): boolean => {
      if (!dialogueSettings?.voiceEnabled || !petId) return false;
      const candidates = resolveDialogueCandidates(category, dialogueSettings);
      return candidates.some((candidate) => Boolean(candidate.voiceAssetId));
    },
    [dialogueSettings, petId]
  );

  const preview = useCallback(
    (options: DialoguePreviewOptions): void => {
      const trimmed = options.text.trim();
      if (!trimmed) return;
      clear();
      setDialogue(trimmed);

      if (petId && options.voiceAssetId) {
        const volume = Math.max(0, Math.min(1, options.voiceVolume ?? dialogueSettings?.voiceVolume ?? 0.8));
        voicePlayback.schedule(
          `app://renderer/pet-voices/${encodeURIComponent(petId)}/${encodeURIComponent(options.voiceAssetId)}`,
          volume,
          80,
          options.voiceTrimStart,
          options.voiceTrimEnd
        );
      }

      timer.current = setTimeout(() => {
        timer.current = null;
        stopVoice();
        setDialogue(null);
      }, 2_800);
    },
    [clear, dialogueSettings?.voiceVolume, petId, stopVoice, voicePlayback]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      voicePlayback.dispose();
    },
    [voicePlayback]
  );

  return { dialogue, show, preview, clear, hasVoiceForCategory };
}
