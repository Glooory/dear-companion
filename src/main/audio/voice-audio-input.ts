export type VoiceAudioFormat = "mp3" | "wav" | "ogg" | "webm" | "m4a";

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
    throw new VoiceAudioInputError("empty-file", "音频文件为空");
  }
  if (byteSize > MAX_VOICE_AUDIO_BYTES) {
    throw new VoiceAudioInputError("file-too-large", "音频文件大小不能超过 5 MB");
  }
}

export function detectVoiceAudioFormat(bytes: Uint8Array): VoiceAudioFormat | null {
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3") return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "mp3";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "wav";
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "OggS") return "ogg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3 &&
    ascii(bytes, 4, Math.min(bytes.length - 4, 64)).includes("webm")
  ) {
    return "webm";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (brand === "m4a " || brand === "m4a\0" || brand === "isom" || brand === "mp42") return "m4a";
  }
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
