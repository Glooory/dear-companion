import type { AudioAssetFormat, AudioImportErrorCode } from "../../shared/contracts";

export const MAX_AUDIO_FILE_BYTES = 20 * 1024 * 1024;

export class AudioInputError extends Error {
  constructor(
    readonly code: AudioImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AudioInputError";
  }
}

export function validateAudioFileSize(byteSize: number): void {
  if (!Number.isInteger(byteSize) || byteSize < 1) {
    throw new AudioInputError("empty-file", "音频文件为空");
  }
  if (byteSize > MAX_AUDIO_FILE_BYTES) {
    throw new AudioInputError("file-too-large", "音频文件不能超过 20 MiB");
  }
}

export function detectAudioFormat(bytes: Uint8Array): AudioAssetFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return "mp3";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "wav";
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "OggS") return "ogg";
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
