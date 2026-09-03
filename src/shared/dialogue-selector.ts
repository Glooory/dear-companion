export const AUTOMATIC_DIALOGUE_COOLDOWN_MS = 60_000;
export const INTERACTION_DIALOGUE_COOLDOWN_MS = 4_000;

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
    if (input.enabled === false || !Number.isFinite(input.now) || input.lines.length === 0) return null;
    const lines = input.lines.filter((line) => typeof line === "string" && line.length > 0);
    if (lines.length === 0) return null;
    const cooldown = input.category.startsWith("auto:")
      ? AUTOMATIC_DIALOGUE_COOLDOWN_MS
      : INTERACTION_DIALOGUE_COOLDOWN_MS;
    const last = this.lastSelectedAt.get(input.category);
    if (last !== undefined && input.now >= last && input.now - last < cooldown) return null;
    if (last !== undefined && input.now < last) this.lastSelectedAt.delete(input.category);
    const eligible = lines.filter((line) => !this.recent.includes(line));
    const pool = eligible.length > 0 ? eligible : [lines[0]!];
    const randomValue = input.random();
    const index = Number.isFinite(randomValue)
      ? Math.min(pool.length - 1, Math.max(0, Math.floor(randomValue * pool.length)))
      : 0;
    const selected = pool[index]!;
    this.lastSelectedAt.set(input.category, input.now);
    this.recent = [selected, ...this.recent.filter((line) => line !== selected)].slice(0, 2);
    return selected;
  }

  reset(): void {
    this.lastSelectedAt.clear();
    this.recent = [];
  }
}
