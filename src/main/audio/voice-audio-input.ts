import { open } from "node:fs/promises";

export type VoiceAudioFormat = "mp3" | "wav" | "ogg" | "webm" | "m4a";

export const ALLOWED_VOICE_EXTENSIONS = new Set<VoiceAudioFormat>(["mp3", "wav", "ogg", "webm", "m4a"]);

export const MAX_VOICE_AUDIO_BYTES = 5 * 1024 * 1024;

export class VoiceAudioInputError extends Error {
  constructor(
    readonly code: "unsupported-type" | "empty-file" | "file-too-large" | "read-failed" | "copy-failed",
    message: string
  ) {
    super(message);
    this.name = "VoiceAudioInputError";
  }
}

export function validateVoiceAudioFileSize(byteSize: number): void {
  if (!Number.isSafeInteger(byteSize) || byteSize < 1) {
    throw new VoiceAudioInputError("empty-file", "音频文件为空，请选择其他文件。");
  }
  if (byteSize > MAX_VOICE_AUDIO_BYTES) {
    throw new VoiceAudioInputError("file-too-large", "音频文件超过 5 MB，请选择较小的文件。");
  }
}

export function detectVoiceAudioFormat(bytes: Uint8Array): VoiceAudioFormat | null {
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3") return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "mp3";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "wav";
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "OggS") {
    const content = ascii(bytes, 4, Math.min(bytes.length - 4, 4096));
    if (content.includes("theora")) return null;
    if (
      content.includes("OpusHead") ||
      content.includes("vorbis") ||
      content.includes("speex") ||
      content.includes("FLAC")
    ) {
      return "ogg";
    }
    return null;
  }
  if (bytes.length >= 8 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    const content = ascii(bytes, 4, Math.min(bytes.length - 4, 4096));
    if (content.includes("webm") || content.includes("matroska")) {
      if (content.includes("V_")) return null;
      if (content.includes("A_")) return "webm";
    }
    return null;
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const content = ascii(bytes, 8, Math.min(bytes.length - 8, 4096));
    if (
      content.includes("avc1") ||
      content.includes("hev1") ||
      content.includes("hvc1") ||
      content.includes("vp09") ||
      content.includes("av01")
    ) {
      return null;
    }
    const brand = ascii(bytes, 8, 4).toLowerCase();
    const isM4aBrand = brand === "m4a " || brand === "m4a\0" || brand === "isom" || brand === "mp42";
    if (isM4aBrand && (content.includes("mp4a") || brand === "m4a " || brand === "m4a\0")) {
      return "m4a";
    }
  }
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export async function readVoiceSourceFile(sourcePath: string): Promise<Buffer> {
  let file;
  try {
    file = await open(sourcePath, "r");
    const fileStat = await file.stat();
    if (!fileStat.isFile()) throw new VoiceAudioInputError("read-failed", "无法读取所选音频");
    validateVoiceAudioFileSize(fileStat.size);
    const bytes = await file.readFile();
    validateVoiceAudioFileSize(bytes.byteLength);
    return bytes;
  } catch (error) {
    if (error instanceof VoiceAudioInputError) throw error;
    throw new VoiceAudioInputError("read-failed", "无法读取所选音频");
  } finally {
    await file?.close().catch(() => undefined);
  }
}
