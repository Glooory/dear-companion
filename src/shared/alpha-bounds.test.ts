import { describe, expect, it } from "vitest";
import { analyzeAlphaChannel, computeAlphaBounds } from "./alpha-bounds";

function pixels(width: number, height: number, alpha: readonly number[]): Uint8Array {
  const result = new Uint8Array(width * height * 4);
  alpha.forEach((value, index) => {
    result[index * 4 + 3] = value;
  });
  return result;
}

describe("alpha bounds", () => {
  it("ignores transparent margins around visible pixels", () => {
    expect(computeAlphaBounds(pixels(4, 3, [0, 0, 0, 0, 0, 255, 128, 0, 0, 0, 0, 0]), 4, 3)).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 1,
    });
  });

  it("supports a one-pixel subject and reports partial transparency", () => {
    expect(analyzeAlphaChannel(pixels(2, 2, [0, 0, 0, 1]), 2, 2)).toEqual({
      bounds: { x: 1, y: 1, width: 1, height: 1 },
      hasTransparency: true,
    });
  });

  it("reports a fully opaque image without a transparent pixel", () => {
    expect(analyzeAlphaChannel(pixels(2, 1, [255, 255]), 2, 1)).toEqual({
      bounds: { x: 0, y: 0, width: 2, height: 1 },
      hasTransparency: false,
    });
  });

  it("supports a configurable alpha offset", () => {
    expect(computeAlphaBounds(new Uint8Array([0, 7, 0, 0, 0, 9, 0, 0]), 2, 1, 4, 1)).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 1,
    });
  });

  it("rejects all-transparent and malformed buffers", () => {
    expect(() => computeAlphaBounds(pixels(1, 2, [0, 0]), 1, 2)).toThrow("fully transparent");
    expect(() => computeAlphaBounds(new Uint8Array(3), 1, 1)).toThrow("buffer length");
  });
});
