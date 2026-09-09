import { describe, expect, it } from "vitest";
import { DEFAULT_BUBBLE_THEME, extractPetThemeColor } from "./pet-theme-color";

describe("extractPetThemeColor", () => {
  it("returns default theme for empty or too short buffer", () => {
    expect(extractPetThemeColor(new Uint8Array([]))).toEqual(DEFAULT_BUBBLE_THEME);
    expect(extractPetThemeColor(new Uint8Array([255, 255, 255]))).toEqual(DEFAULT_BUBBLE_THEME);
  });

  it("returns default theme for transparent pixels", () => {
    const data = new Uint8Array([
      255, 100, 50, 0,
      255, 100, 50, 20,
    ]);
    expect(extractPetThemeColor(data)).toEqual(DEFAULT_BUBBLE_THEME);
  });

  it("returns default theme for monochrome / grayscale pixels", () => {
    const data = new Uint8Array([
      20, 20, 20, 255,   // dark gray
      240, 240, 240, 255, // light gray
      128, 128, 128, 255, // mid gray
    ]);
    expect(extractPetThemeColor(data)).toEqual(DEFAULT_BUBBLE_THEME);
  });

  it("correctly extracts warm golden/orange hue for pet fur colors", () => {
    // Warm ginger fur: R=210, G=130, B=60 (approx 28° hue)
    const data = new Uint8Array([
      210, 130, 60, 255,
      220, 140, 70, 255,
      200, 120, 50, 255,
    ]);
    const result = extractPetThemeColor(data);
    expect(result.hue).toBeGreaterThanOrEqual(20);
    expect(result.hue).toBeLessThanOrEqual(35);
    expect(result.saturation).toBeGreaterThanOrEqual(22);
    expect(result.saturation).toBeLessThanOrEqual(36);
  });

  it("averages hues circularly across 0/360 degree red boundary", () => {
    // Red-purple (355°) and Red-orange (5°) should average to ~0°, not 180°
    // 355°: high R, low G, very slight B (e.g. 255, 10, 30)
    // 5°: high R, slight G, low B (e.g. 255, 30, 10)
    const data = new Uint8Array([
      255, 10, 30, 255,
      255, 30, 10, 255,
    ]);
    const result = extractPetThemeColor(data);
    expect(result.hue >= 350 || result.hue <= 10).toBe(true);
  });

  it("clamps saturation into the aesthetic safe range (22%-36%)", () => {
    // Highly saturated pure color
    const vivid = new Uint8Array([255, 0, 0, 255]);
    const result = extractPetThemeColor(vivid);
    expect(result.saturation).toBe(36);
  });
});
