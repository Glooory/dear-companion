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
      20, 20, 20, 255,
      240, 240, 240, 255,
      128, 128, 128, 255,
    ]);
    const result = extractPetThemeColor(data);
    expect(result.isMonochrome).toBe(true);
    expect(result.textColor).toBe("#2d2a26");
  });

  it("extracts dominant blue even when mixed with other colored noise without muddying", () => {
    // 6 blue pixels (approx 213°) and 2 warm yellow/orange pixels (approx 35°)
    // With bucket quantization, the blue bucket wins clearly without being pulled towards green!
    const data = new Uint8Array([
      50, 130, 230, 255,
      60, 140, 240, 255,
      45, 125, 225, 255,
      55, 135, 235, 255,
      50, 130, 230, 255,
      60, 140, 240, 255,
      220, 140, 50, 255, // yellow/orange noise
      210, 130, 40, 255, // yellow/orange noise
    ]);
    const result = extractPetThemeColor(data);
    expect(result.isMonochrome).toBe(false);
    expect(result.hue).toBeGreaterThanOrEqual(200);
    expect(result.hue).toBeLessThanOrEqual(225);
    expect(result.borderColor).toContain("hsl(");
    // Lightness is ~55%, so text is deepened to high-contrast ink (22%)
    expect(result.textColor).toContain("22%)");
  });

  it("uses direct text color when dominant color is naturally dark (Option A)", () => {
    // Deep midnight navy (L ~ 24%): R=20, G=45, B=100
    const data = new Uint8Array([
      20, 45, 100, 255,
      25, 50, 105, 255,
      18, 42, 95, 255,
    ]);
    const result = extractPetThemeColor(data);
    expect(result.isMonochrome).toBe(false);
    expect(result.hue).toBeGreaterThanOrEqual(200);
    expect(result.hue).toBeLessThanOrEqual(230);
    // Naturally dark, so textColor keeps the natural dark lightness (< 30%)
    expect(result.textColor).toContain("24%)");
  });

  it("averages hues circularly across 0/360 degree red boundary within bucket", () => {
    const data = new Uint8Array([
      255, 10, 30, 255,
      255, 30, 10, 255,
    ]);
    const result = extractPetThemeColor(data);
    expect(result.hue >= 350 || result.hue <= 10).toBe(true);
  });
});
