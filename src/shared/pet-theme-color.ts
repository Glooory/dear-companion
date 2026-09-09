export interface PetThemeColor {
  hue: number;
  saturation: number;
  lightness: number;
  borderColor: string;
  textColor: string;
  isMonochrome: boolean;
}

export const DEFAULT_BUBBLE_THEME: PetThemeColor = {
  hue: 36,
  saturation: 0,
  lightness: 44,
  borderColor: "rgba(45, 42, 38, 0.16)",
  textColor: "#2d2a26",
  isMonochrome: true,
};

const NUM_HUE_BUCKETS = 24; // 15 degrees per bucket
const BUCKET_DEG = 360 / NUM_HUE_BUCKETS;

interface HueBucket {
  weight: number;
  sumSin: number;
  sumCos: number;
  sumSat: number;
  sumLit: number;
  count: number;
}

/**
 * Extracts the perceptual dominant theme color from raw RGBA pixel data
 * using 24-bucket hue quantization (Mode / Histogram Clustering).
 *
 * This prevents mixed colors (e.g. blue background + yellow fur) from cancelling
 * each other out into a muddy average, guaranteeing that the winning dominant
 * color faithfully matches what the human eye perceives at a glance.
 */
export function extractPetThemeColor(
  rgba: Uint8ClampedArray | Uint8Array,
  options?: { minAlpha?: number }
): PetThemeColor {
  const minAlpha = options?.minAlpha ?? 40;
  const len = rgba.length;
  if (len < 4) return DEFAULT_BUBBLE_THEME;

  const buckets: HueBucket[] = Array.from({ length: NUM_HUE_BUCKETS }, () => ({
    weight: 0,
    sumSin: 0,
    sumCos: 0,
    sumSat: 0,
    sumLit: 0,
    count: 0,
  }));

  let totalOpaque = 0;
  let totalChromatic = 0;

  for (let i = 0; i < len; i += 4) {
    const rawR = rgba[i];
    const rawG = rgba[i + 1];
    const rawB = rgba[i + 2];
    const a = rgba[i + 3];
    if (rawR === undefined || rawG === undefined || rawB === undefined || a === undefined || a < minAlpha) {
      continue;
    }
    totalOpaque++;

    const r = rawR / 255;
    const g = rawG / 255;
    const b = rawB / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;

    // Filter out pure black, pure white, and near-grayscale pixels
    if (d < 0.10 || l < 0.08 || l > 0.94) {
      continue;
    }

    let h: number;
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / d + 2) * 60;
    } else {
      h = ((r - g) / d + 4) * 60;
    }
    h = (h + 360) % 360;

    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    // Weight heavily favors vibrant, rich pixels that define the signature visual theme
    const midToneWeight = 1 - Math.abs(l - 0.5) * 0.6;
    const weight = Math.pow(s, 1.8) * midToneWeight * (a / 255);

    const bucketIndex = Math.floor(((h + BUCKET_DEG / 2) % 360) / BUCKET_DEG);
    const bucket = buckets[bucketIndex];
    if (bucket) {
      const rad = (h * Math.PI) / 180;
      bucket.weight += weight;
      bucket.sumSin += Math.sin(rad) * weight;
      bucket.sumCos += Math.cos(rad) * weight;
      bucket.sumSat += s;
      bucket.sumLit += l;
      bucket.count++;
      totalChromatic++;
    }
  }

  // If the image is mostly monochrome/grayscale, fall back cleanly
  if (totalOpaque === 0 || totalChromatic < 2 || totalChromatic / totalOpaque < 0.025) {
    return DEFAULT_BUBBLE_THEME;
  }

  // Find the winning dominant color bucket
  let bestBucket: HueBucket | null = null;
  let maxWeight = -1;
  for (const bucket of buckets) {
    if (bucket.weight > maxWeight && bucket.count > 0) {
      maxWeight = bucket.weight;
      bestBucket = bucket;
    }
  }

  if (!bestBucket || bestBucket.count === 0 || maxWeight <= 0) {
    return DEFAULT_BUBBLE_THEME;
  }

  // Precise circular mean hue within the dominant bucket
  let avgHue = (Math.atan2(bestBucket.sumSin, bestBucket.sumCos) * 180) / Math.PI;
  if (avgHue < 0) avgHue += 360;
  const finalHue = Math.round(avgHue) % 360;

  const avgSat = (bestBucket.sumSat / bestBucket.count) * 100;
  const avgLit = (bestBucket.sumLit / bestBucket.count) * 100;

  // 1:1 Border Color:
  // Reflects the dominant color faithfully. Clamped to visible lightness range for crispness on white.
  const borderSat = Math.max(50, Math.min(95, Math.round(avgSat * 1.15)));
  const borderLit = Math.max(38, Math.min(60, Math.round(avgLit)));
  const borderColor = `hsl(${finalHue}, ${borderSat}%, ${borderLit}%)`;

  // Option A Text Color:
  // If dominant color is naturally dark enough on white (L <= 30%), use directly!
  // Otherwise, deepen to a high-contrast ink tone (22% lightness) with identical hue.
  let textColor: string;
  if (avgLit <= 30 && avgSat >= 25) {
    const directTextSat = Math.max(35, Math.min(75, Math.round(avgSat)));
    textColor = `hsl(${finalHue}, ${directTextSat}%, ${Math.round(avgLit)}%)`;
  } else {
    const inkSat = Math.max(40, Math.min(75, Math.round(avgSat * 0.95)));
    textColor = `hsl(${finalHue}, ${inkSat}%, 22%)`;
  }

  return {
    hue: finalHue,
    saturation: borderSat,
    lightness: borderLit,
    borderColor,
    textColor,
    isMonochrome: false,
  };
}
