import sharp from "sharp";
import type { PetAssetFormat } from "../../shared/contracts";
import { ImageInputError, validateDecodedImage, type ValidatedDecodedImage } from "./image-input";

export interface ImageDecoder {
  decode(bytes: Buffer, format: PetAssetFormat): Promise<ValidatedDecodedImage>;
}

export class SharpImageDecoder implements ImageDecoder {
  async decode(bytes: Buffer, format: PetAssetFormat): Promise<ValidatedDecodedImage> {
    try {
      const image = sharp(bytes, {
        animated: false,
        failOn: "error",
        limitInputPixels: 8192 * 8192,
      });
      const metadata = await image.metadata();
      if (metadata.format !== format || !metadata.width || !metadata.height) {
        throw new ImageInputError("decode-failed", "无法读取该照片，请换一张 PNG 或 WebP 再试。");
      }
      const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return validateDecodedImage({
        width: info.width,
        height: info.height,
        bitmap: data,
        stride: info.channels,
        alphaOffset: info.channels - 1,
      });
    } catch (error) {
      if (error instanceof ImageInputError) throw error;
      throw new ImageInputError("decode-failed", "无法读取该照片，请换一张 PNG 或 WebP 再试。");
    }
  }
}
