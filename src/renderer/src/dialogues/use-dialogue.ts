import { useCallback, useEffect, useRef, useState } from "react";
import { isDialogueCategory, SYSTEM_DIALOGUES, type DialogueCategory } from "@shared/dialogue-catalog";
import { DialogueSelector } from "@shared/dialogue-selector";
import { ADDRESS_PLACEHOLDER, resolveDialogueLines, type PetDialogueSettings } from "@shared/dialogue-settings";

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
  const [dialogue, setDialogue] = useState<string | null>(null);
  const previousPetId = useRef<string | null>(petId ?? null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setDialogue(null);
  }, []);

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

      let lines: readonly string[];
      if (Array.isArray(linesOrRequired)) {
        lines = linesOrRequired;
      } else if (isDialogueCategory(category)) {
        lines = resolveDialogueLines(category, dialogueSettings);
      } else if (category === "system:crying") {
        const address = dialogueSettings?.address.trim() ?? "";
        lines = SYSTEM_DIALOGUES.crying.map((line) => line.replaceAll(ADDRESS_PLACEHOLDER, address));
      } else if (category === "system:completion") {
        const address = dialogueSettings?.address.trim() ?? "";
        lines = SYSTEM_DIALOGUES.reminderCompletion.map((line) => line.replaceAll(ADDRESS_PLACEHOLDER, address));
      } else {
        lines = [];
      }

      if (lines.length === 0) return null;

      const selected = selector.current.select({
        category,
        lines,
        now: Date.now(),
        random: Math.random,
        enabled: required || enabled,
      });

      if (!selected) return null;
      clear();
      setDialogue(selected);
      timer.current = setTimeout(() => {
        timer.current = null;
        setDialogue(null);
      }, 2_800);
      return selected;
    },
    [clear, dialogueSettings, enabled]
  );

  useEffect(() => () => clear(), [clear]);

  return { dialogue, show, clear };
}
