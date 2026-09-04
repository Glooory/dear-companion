import { useCallback, useEffect, useRef, useState } from "react";
import { isDialogueCategory, SYSTEM_DIALOGUES, type DialogueCategory } from "@shared/dialogue-catalog";
import { DialogueSelector } from "@shared/dialogue-selector";
import {
  ADDRESS_PLACEHOLDER,
  resolveDialogueCandidates,
  type PetDialogueSettings,
  type ResolvedDialogueCandidate,
} from "@shared/dialogue-settings";
import { VoicePlaybackCoordinator } from "./voice-playback-coordinator";

export type DialogueTriggerKey = DialogueCategory | "system:crying" | "system:completion";

export function useDialogue(
  enabled: boolean,
  dialogueSettings?: PetDialogueSettings,
  petId?: string | null
): {
  dialogue: string | null;
  show(category: DialogueTriggerKey | string, required?: boolean): string | null;
  show(category: string, lines: readonly string[], required?: boolean): string | null;
  clear(): void;
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

      if (Array.isArray(linesOrRequired)) {
        selected = selector.current.select({
          category,
          lines: linesOrRequired,
          now: Date.now(),
          random: Math.random,
          enabled: required || enabled,
        });
      } else if (isDialogueCategory(category)) {
        const candidates = resolveDialogueCandidates(category, dialogueSettings);
        selectedCandidate = selector.current.selectEntry({
          category,
          entries: candidates,
          getText: (candidate) => candidate.text,
          now: Date.now(),
          random: Math.random,
          enabled: required || enabled,
        });
        selected = selectedCandidate?.text ?? null;
      } else if (category === "system:crying") {
        const address = dialogueSettings?.address.trim() ?? "";
        selected = selector.current.select({
          category,
          lines: SYSTEM_DIALOGUES.crying.map((line) => line.replaceAll(ADDRESS_PLACEHOLDER, address)),
          now: Date.now(),
          random: Math.random,
          enabled: required || enabled,
        });
      } else if (category === "system:completion") {
        const address = dialogueSettings?.address.trim() ?? "";
        selected = selector.current.select({
          category,
          lines: SYSTEM_DIALOGUES.reminderCompletion.map((line) => line.replaceAll(ADDRESS_PLACEHOLDER, address)),
          now: Date.now(),
          random: Math.random,
          enabled: required || enabled,
        });
      } else {
        selected = null;
      }

      if (!selected) return null;
      clear();
      setDialogue(selected);

      // Play voice if enabled and voiceAssetId exists
      if (enabled && dialogueSettings?.voiceEnabled && petId && selectedCandidate?.voiceAssetId) {
        const assetId = selectedCandidate.voiceAssetId;
        const volume = Math.max(0, Math.min(1, dialogueSettings.voiceVolume ?? 0.8));
        voicePlayback.schedule(
          `app://renderer/pet-voices/${encodeURIComponent(petId)}/${encodeURIComponent(assetId)}`,
          volume
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

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      voicePlayback.dispose();
    },
    [voicePlayback]
  );

  return { dialogue, show, clear };
}
