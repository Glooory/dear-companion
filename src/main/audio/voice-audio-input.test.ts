import { describe, expect, it } from "vitest";
import { detectVoiceAudioFormat, validateVoiceAudioFileSize } from "./voice-audio-input";

describe("voice audio input", () => {
  it("detects every supported format from content", () => {
    expect(detectVoiceAudioFormat(Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]))).toBe("mp3");
    expect(detectVoiceAudioFormat(Buffer.from("RIFFxxxxWAVEfmt ....data"))).toBe("wav");
    expect(detectVoiceAudioFormat(Buffer.from("OggS\0\0OpusHead"))).toBe("ogg");
    expect(detectVoiceAudioFormat(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from("webm....A_OPUS")]))).toBe(
      "webm"
    );
    expect(detectVoiceAudioFormat(Buffer.from("....ftypM4A ....mp4a"))).toBe("m4a");
  });

  it("rejects renamed or unsupported content", () => {
    expect(detectVoiceAudioFormat(Buffer.from("not audio"))).toBeNull();
    expect(detectVoiceAudioFormat(Buffer.from("OggS....theora"))).toBeNull();
    expect(detectVoiceAudioFormat(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from("webm....V_VP9")]))).toBeNull();
    expect(detectVoiceAudioFormat(Buffer.from("....ftypisom....avc1"))).toBeNull();
  });

  it("enforces the five megabyte voice limit", () => {
    expect(() => validateVoiceAudioFileSize(1)).not.toThrow();
    expect(() => validateVoiceAudioFileSize(5 * 1024 * 1024)).not.toThrow();
    expect(() => validateVoiceAudioFileSize(0)).toThrow("为空");
    expect(() => validateVoiceAudioFileSize(5 * 1024 * 1024 + 1)).toThrow("5 MB");
  });
});
