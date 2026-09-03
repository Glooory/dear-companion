import { describe, expect, it } from "vitest";
import {
  detectImageFormat,
  ImageInputError,
  MAX_IMAGE_BYTES,
  MAX_PET_PACK_BYTES,
  validateDecodedImage,
  validateImageFileSize,
  validatePetPackSize,
} from "./image-input";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("image input validation", () => {
  it("detects actual PNG and WebP signatures instead of extensions", () => {
    expect(detectImageFormat(png)).toBe("png");
    expect(detectImageFormat(webp)).toBe("webp");
    expect(detectImageFormat(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("enforces the exact single-file byte boundary", () => {
    expect(() => validateImageFileSize(MAX_IMAGE_BYTES)).not.toThrow();
    expectCode(() => validateImageFileSize(0), "empty-file");
    expectCode(() => validateImageFileSize(MAX_IMAGE_BYTES + 1), "file-too-large");
  });

  it("accepts a valid decoded image with transparent background", () => {
    expect(
      validateDecodedImage({
        width: 2,
        height: 2,
        bitmap: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 0]),
      })
    ).toEqual({ width: 2, height: 2, alphaBounds: { x: 0, y: 0, width: 2, height: 2 } });
  });

  it("rejects corrupt dimensions, oversized dimensions, opacity, and empty alpha", () => {
    expectCode(() => validateDecodedImage({ width: 0, height: 1, bitmap: new Uint8Array() }), "decode-failed");
    expectCode(
      () => validateDecodedImage({ width: 8193, height: 1, bitmap: new Uint8Array() }),
      "dimensions-too-large"
    );
    expectCode(
      () => validateDecodedImage({ width: 1, height: 1, bitmap: new Uint8Array([0, 0, 0, 255]) }),
      "no-transparency"
    );
    expectCode(
      () => validateDecodedImage({ width: 1, height: 1, bitmap: new Uint8Array([0, 0, 0, 0]) }),
      "fully-transparent"
    );
  });

  it("enforces the exact pack byte boundary", () => {
    expect(() => validatePetPackSize(MAX_PET_PACK_BYTES - 1, 1)).not.toThrow();
    expectCode(() => validatePetPackSize(MAX_PET_PACK_BYTES, 1), "pack-too-large");
  });
});

function expectCode(callback: () => void, code: string): void {
  try {
    callback();
    throw new Error("Expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ImageInputError);
    expect((error as ImageInputError).code).toBe(code);
  }
}
