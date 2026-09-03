import { describe, expect, it } from "vitest";
import { computeAssetGeometry } from "./image-normalization";

const asset = {
  width: 120,
  height: 240,
  alphaBounds: { x: 20, y: 30, width: 80, height: 180 },
  normalization: { scale: 1, offsetX: 0, offsetY: 0, baselineOffset: 0 },
};

describe("image normalization", () => {
  it("normalizes the visible person height and aligns the visible bottom", () => {
    expect(computeAssetGeometry(asset, 180, { width: 320, height: 320 })).toEqual({
      scale: 1,
      left: 100,
      top: 98,
      renderedWidth: 120,
      renderedHeight: 240,
      visibleHeight: 180,
    });
  });

  it("supports min/max target height and non-destructive per-asset adjustments", () => {
    const adjusted = {
      ...asset,
      normalization: { scale: 1.5, offsetX: 7, offsetY: -4, baselineOffset: 9 },
    };
    const geometry = computeAssetGeometry(adjusted, 80, { width: 200, height: 280, baselineY: 260 });

    expect(geometry.scale).toBeCloseTo(2 / 3);
    expect(geometry.visibleHeight).toBeCloseTo(120);
    expect(geometry.left).toBeCloseTo(67);
    expect(geometry.top).toBeCloseTo(125);
    expect(() => computeAssetGeometry(asset, 321, { width: 320, height: 320 })).toThrow("80 and 320");
  });

  it("gives differently padded assets the same visible baseline", () => {
    const first = computeAssetGeometry(asset, 180, { width: 320, height: 320, baselineY: 300 });
    const secondAsset = { ...asset, height: 300, alphaBounds: { x: 10, y: 90, width: 100, height: 180 } };
    const second = computeAssetGeometry(secondAsset, 180, { width: 320, height: 320, baselineY: 300 });

    expect(first.top + (asset.alphaBounds.y + asset.alphaBounds.height) * first.scale).toBe(300);
    expect(second.top + (secondAsset.alphaBounds.y + secondAsset.alphaBounds.height) * second.scale).toBe(300);
  });
});
