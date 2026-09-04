import { describe, expect, it } from "vitest";
import { encodeWav, sliceAndEncodeWav } from "./audio-encoder";

describe("audio-encoder", () => {
  it("throws for empty audio data", () => {
    expect(() => sliceAndEncodeWav({ channels: [], sampleRate: 44100 })).toThrow();
    expect(() => sliceAndEncodeWav({ channels: [new Float32Array(0)], sampleRate: 44100 })).toThrow();
  });

  it("encodes valid 16-bit PCM RIFF/WAVE header and format", () => {
    const sampleRate = 44100;
    const duration = 1.0;
    const length = sampleRate * duration;
    const channel = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      channel[i] = Math.sin((i / sampleRate) * 440 * 2 * Math.PI);
    }

    const wavBytes = sliceAndEncodeWav({ channels: [channel], sampleRate });
    expect(wavBytes.byteLength).toBe(44 + length * 2); // 44 byte header + 16-bit mono

    // Format detection test
    const isWav =
      wavBytes.length >= 12 &&
      String.fromCharCode(...wavBytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...wavBytes.subarray(8, 12)) === "WAVE";
    expect(isWav).toBe(true);

    // Check RIFF header fields
    const view = new DataView(wavBytes.buffer);
    const text = String.fromCharCode(...wavBytes.subarray(0, 4));
    expect(text).toBe("RIFF");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // 1 channel
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint16(34, true)).toBe(16); // 16 bits
    expect(String.fromCharCode(...wavBytes.subarray(36, 40))).toBe("data");
    expect(view.getUint32(40, true)).toBe(length * 2);
  });

  it("accurately trims audio between startSeconds and endSeconds", () => {
    const sampleRate = 1000;
    const duration = 5.0; // 5 seconds = 5000 samples
    const totalSamples = sampleRate * duration;
    const channel = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      channel[i] = i; // Store index to verify sliced content
    }

    // Slice 1.0s to 3.0s = 2000 samples
    const wavBytes = sliceAndEncodeWav({ channels: [channel], sampleRate }, 1.0, 3.0);

    const expectedSamples = 2000;
    expect(wavBytes.byteLength).toBe(44 + expectedSamples * 2);

    const view = new DataView(wavBytes.buffer);
    expect(view.getUint32(40, true)).toBe(expectedSamples * 2);
  });

  it("handles out of bound start/end gracefully by clamping", () => {
    const sampleRate = 1000;
    const channel = new Float32Array(1000); // 1.0 second
    const wavBytes = sliceAndEncodeWav({ channels: [channel], sampleRate }, -2, 10);
    expect(wavBytes.byteLength).toBe(44 + 1000 * 2);
  });

  it("encodes stereo audio properly with 2 interleaved channels", () => {
    const sampleRate = 8000;
    const length = 800; // 0.1s
    const left = new Float32Array(length).fill(0.5);
    const right = new Float32Array(length).fill(-0.5);

    const wavBytes = sliceAndEncodeWav({ channels: [left, right], sampleRate });
    expect(wavBytes.byteLength).toBe(44 + length * 2 * 2); // 2 channels * 2 bytes

    const view = new DataView(wavBytes.buffer);
    expect(view.getUint16(22, true)).toBe(2); // 2 channels
    expect(view.getInt16(44, true)).toBeGreaterThan(0); // Left channel sample
    expect(view.getInt16(46, true)).toBeLessThan(0); // Right channel sample
  });

  it("encodes entire PCM audio without slicing when using encodeWav", () => {
    const sampleRate = 8000;
    const channel = new Float32Array(800);
    const wavBytes = encodeWav({ channels: [channel], sampleRate });
    expect(wavBytes.byteLength).toBe(44 + 800 * 2);
  });
});
