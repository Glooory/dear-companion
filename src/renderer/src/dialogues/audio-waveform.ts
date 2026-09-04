export interface WaveformOptions {
  barCount?: number;
  minHeight?: number;
}

/**
 * Computes downsampled amplitude bars (0.0 to 1.0) from multi-channel PCM audio data.
 */
export function computeWaveformBars(channels: readonly Float32Array[], options: WaveformOptions = {}): number[] {
  const barCount = Math.max(1, options.barCount ?? 64);
  const minHeight = Math.max(0, Math.min(1, options.minHeight ?? 0.08));

  if (!channels || channels.length === 0) {
    return Array.from({ length: barCount }, () => minHeight);
  }

  const sampleCount = channels[0]?.length ?? 0;
  if (sampleCount === 0) {
    return Array.from({ length: barCount }, () => minHeight);
  }

  const channelCount = channels.length;
  const rawBars = new Float32Array(barCount);
  let globalMax = 0;

  for (let bar = 0; bar < barCount; bar++) {
    const start = Math.floor((bar / barCount) * sampleCount);
    const end = Math.max(start + 1, Math.floor(((bar + 1) / barCount) * sampleCount));

    let barMax = 0;
    for (let c = 0; c < channelCount; c++) {
      const channel = channels[c]!;
      const limit = Math.min(end, channel.length);
      for (let s = start; s < limit; s++) {
        const val = Math.abs(channel[s] ?? 0);
        if (val > barMax) {
          barMax = val;
        }
      }
    }

    rawBars[bar] = barMax;
    if (barMax > globalMax) {
      globalMax = barMax;
    }
  }

  // Normalize bars so the tallest bar is 1.0, scaled with perceptual curve
  const result: number[] = [];
  const normalizer = globalMax > 0.001 ? 1 / globalMax : 1;

  for (let bar = 0; bar < barCount; bar++) {
    if (globalMax <= 0.001) {
      result.push(minHeight);
    } else {
      const normalized = (rawBars[bar] ?? 0) * normalizer;
      // Mild non-linear expansion to give better visibility to quiet speech
      const shaped = Math.pow(normalized, 0.85);
      const withFloor = minHeight + shaped * (1 - minHeight);
      result.push(Number(Math.min(1, Math.max(minHeight, withFloor)).toFixed(3)));
    }
  }

  return result;
}
