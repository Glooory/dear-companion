export interface PointerSample {
  x: number;
  y: number;
  at: number;
}

export function calculateDragVelocity(samples: readonly PointerSample[], windowMs = 160): number {
  const valid = samples.filter(isValidSample);
  if (valid.length < 2 || !Number.isFinite(windowMs) || windowMs <= 0) return 0;

  const last = valid.at(-1)!;
  const cutoff = last.at - windowMs;
  const first = valid.find((sample) => sample.at >= cutoff && sample.at < last.at);
  if (!first) return 0;

  const elapsedSeconds = (last.at - first.at) / 1_000;
  if (elapsedSeconds <= 0) return 0;
  return Math.hypot(last.x - first.x, last.y - first.y) / elapsedSeconds;
}

export function isAngryDragRelease(samples: readonly PointerSample[], threshold = 1_200, windowMs = 160): boolean {
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  return calculateDragVelocity(samples, windowMs) >= threshold;
}

function isValidSample(sample: PointerSample): boolean {
  return Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.at);
}
