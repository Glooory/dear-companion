import { describe, expect, it } from "vitest";
import { detectVoiceAudioFormat, validateVoiceAudioFileSize } from "./voice-audio-input";

describe("voice audio input", () => {
  it("detects every supported format from content", () => {
    expect(detectVoiceAudioFormat(Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]))).toBe("mp3");
    expect(detectVoiceAudioFormat(Buffer.from("RIFFxxxxWAVEfmt "))).toBe("wav");
    expect(detectVoiceAudioFormat(Buffer.from("OggS\0\0\0\0"))).toBe("ogg");
    expect(detectVoiceAudioFormat(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from("webm")]))).toBe("webm");
    expect(detectVoiceAudioFormat(Buffer.from("....ftypM4A "))).toBe("m4a");
  });

  it("rejects renamed or unsupported content", () => {
    expect(detectVoiceAudioFormat(Buffer.from("not audio"))).toBeNull();
  });

  it("enforces the five megabyte voice limit", () => {
    expect(() => validateVoiceAudioFileSize(1)).not.toThrow();
    expect(() => validateVoiceAudioFileSize(5 * 1024 * 1024)).not.toThrow();
    expect(() => validateVoiceAudioFileSize(0)).toThrow("为空");
    expect(() => validateVoiceAudioFileSize(5 * 1024 * 1024 + 1)).toThrow("5 MB");
  });
});
