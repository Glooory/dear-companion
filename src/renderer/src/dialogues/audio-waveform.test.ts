import { describe, expect, it } from "vitest";
import { computeWaveformBars } from "./audio-waveform";

describe("audio-waveform", () => {
  it("returns minHeight floor for empty or zero-length audio", () => {
    expect(computeWaveformBars([])).toHaveLength(64);
    expect(computeWaveformBars([], { barCount: 32 })).toHaveLength(32);
    expect(computeWaveformBars([new Float32Array(0)], { barCount: 16 })).toHaveLength(16);
    const bars = computeWaveformBars([], { barCount: 10, minHeight: 0.1 });
    expect(bars.every((b) => b === 0.1)).toBe(true);
  });

  it("handles complete silence without dividing by zero", () => {
    const silentChannel = new Float32Array(1000);
    const bars = computeWaveformBars([silentChannel], { barCount: 20, minHeight: 0.08 });
    expect(bars).toHaveLength(20);
    expect(bars.every((b) => b === 0.08)).toBe(true);
  });

  it("normalizes active signals so peak reaches 1.0", () => {
    const samples = new Float32Array(1000);
    // Fill with a sine wave or peak
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((i / 1000) * Math.PI * 4) * 0.5;
    }
    const bars = computeWaveformBars([samples], { barCount: 30 });
    expect(bars).toHaveLength(30);
    const maxBar = Math.max(...bars);
    expect(maxBar).toBeCloseTo(1.0, 2);
    expect(Math.min(...bars)).toBeGreaterThanOrEqual(0.08);
  });

  it("combines multiple channels by taking the peak across channels", () => {
    const ch1 = new Float32Array([0.2, 0.2, 0.2, 0.2]);
    const ch2 = new Float32Array([0.8, 0.1, 0.1, 0.1]);
    const bars = computeWaveformBars([ch1, ch2], { barCount: 2 });
    expect(bars).toHaveLength(2);
    // The first bar contains ch2's 0.8, so it should peak at 1.0
    expect(bars[0]).toBeCloseTo(1.0, 2);
  });
});
