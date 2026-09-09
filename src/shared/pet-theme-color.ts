export interface PetThemeColor {
  hue: number;
  saturation: number;
  lightness: number;
}

export const DEFAULT_BUBBLE_THEME: PetThemeColor = {
  hue: 36,
  saturation: 28,
  lightness: 46,
};

/**
 * Extracts a balanced theme color from raw RGBA pixel data.
 * Clamps saturation to a calm, aesthetic range (22%-36%)
 * to avoid overly vivid or neon colors on the desktop.
 */
export function extractPetThemeColor(
  rgba: Uint8ClampedArray | Uint8Array,
  options?: { minAlpha?: number }
): PetThemeColor {
  const minAlpha = options?.minAlpha ?? 60;
  const len = rgba.length;
  if (len < 4) return DEFAULT_BUBBLE_THEME;

  let sumSin = 0;
  let sumCos = 0;
  let totalWeight = 0;
  let totalSat = 0;
  let chromaticCount = 0;

  for (let i = 0; i < len; i += 4) {
    const rawR = rgba[i];
    const rawG = rgba[i + 1];
    const rawB = rgba[i + 2];
    const a = rgba[i + 3];
    if (rawR === undefined || rawG === undefined || rawB === undefined || a === undefined || a < minAlpha) {
      continue;
    }

    const r = rawR / 255;
    const g = rawG / 255;
    const b = rawB / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;

    // Skip almost pure black, pure white, or completely desaturated pixels
    if (d < 0.07 || l < 0.08 || l > 0.94) {
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

    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const weight = s * (a / 255);
    const rad = (h * Math.PI) / 180;

    sumSin += Math.sin(rad) * weight;
    sumCos += Math.cos(rad) * weight;
    totalSat += s;
    totalWeight += weight;
    chromaticCount++;
  }

  if (totalWeight < 0.5 || chromaticCount === 0) {
    return DEFAULT_BUBBLE_THEME;
  }

  let avgHue = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  if (avgHue < 0) avgHue += 360;

  const rawAvgSat = (totalSat / chromaticCount) * 100;
  const clampedSat = Math.max(22, Math.min(36, Math.round(rawAvgSat)));

  return {
    hue: Math.round(avgHue) % 360,
    saturation: clampedSat,
    lightness: 46,
  };
}
