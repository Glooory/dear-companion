export const AUTOMATIC_DIALOGUE_COOLDOWN_MS = 60_000;
export const DIALOGUE_DISPLAY_DURATION_MS = 3_000;
export const INTERACTION_DIALOGUE_COOLDOWN_MS = DIALOGUE_DISPLAY_DURATION_MS;

export class DialogueSelector {
  private readonly lastSelectedAt = new Map<string, number>();
  private recent: string[] = [];

  select(input: {
    category: string;
    lines: readonly string[];
    now: number;
    random: () => number;
    enabled?: boolean;
  }): string | null {
    return this.selectEntry({
      category: input.category,
      entries: input.lines,
      getText: (line) => line,
      now: input.now,
      random: input.random,
      enabled: input.enabled,
    });
  }

  selectEntry<T>(input: {
    category: string;
    entries: readonly T[];
    getText: (entry: T) => string;
    now: number;
    random: () => number;
    enabled?: boolean;
  }): T | null {
    if (input.enabled === false || !Number.isFinite(input.now) || input.entries.length === 0) return null;
    const entries = input.entries.filter((entry) => {
      const text = input.getText(entry);
      return typeof text === "string" && text.length > 0;
    });
    if (entries.length === 0) return null;
    const cooldown = input.category.startsWith("auto:")
      ? AUTOMATIC_DIALOGUE_COOLDOWN_MS
      : INTERACTION_DIALOGUE_COOLDOWN_MS;
    const last = this.lastSelectedAt.get(input.category);
    if (last !== undefined && input.now >= last && input.now - last < cooldown) return null;
    if (last !== undefined && input.now < last) this.lastSelectedAt.delete(input.category);
    const eligible = entries.filter((entry) => !this.recent.includes(input.getText(entry)));
    const pool = eligible.length > 0 ? eligible : [entries[0]!];
    const randomValue = input.random();
    const index = Number.isFinite(randomValue)
      ? Math.min(pool.length - 1, Math.max(0, Math.floor(randomValue * pool.length)))
      : 0;
    const selected = pool[index]!;
    const selectedText = input.getText(selected);
    this.lastSelectedAt.set(input.category, input.now);
    this.recent = [selectedText, ...this.recent.filter((line) => line !== selectedText)].slice(0, 2);
    return selected;
  }

  reset(): void {
    this.lastSelectedAt.clear();
    this.recent = [];
  }
}
