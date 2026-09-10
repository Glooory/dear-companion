import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsStore } from "../settings/settings-store";
import { AudioService } from "./audio-service";

const directories: string[] = [];

async function harness() {
  const userDataPath = await mkdtemp(join(tmpdir(), "dear-companion-audio-"));
  directories.push(userDataPath);
  const settingsStore = new SettingsStore(userDataPath);
  const ids = ["sound-1", "sound-2", "request-1", "request-2"][Symbol.iterator]();
  const onPlaybackRequested = vi.fn();
  const service = new AudioService({
    userDataPath,
    settingsStore,
    onPlaybackRequested,
    idFactory: () => ids.next().value ?? "fallback-id",
  });
  return { userDataPath, settingsStore, service, onPlaybackRequested };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("AudioService", () => {
  it("imports successful siblings with safe names and omits original paths", async () => {
    const { userDataPath, service } = await harness();
    const validPath = join(userDataPath, "family voice.dat");
    const invalidPath = join(userDataPath, "bad.mp3");
    await writeFile(validPath, Buffer.from("RIFFxxxxWAVEpayload"));
    await writeFile(invalidPath, Buffer.from("invalid"));
    const result = await service.importAssets([validPath, invalidPath]);
    expect(result.imported).toEqual([
      { id: "sound-1", fileName: "sound-1.wav", format: "wav", byteSize: 19, available: true },
    ]);
    expect(result.failures[0]).toMatchObject({ index: 1, code: "unsupported-type" });
    expect(JSON.stringify(result)).not.toContain(validPath);
    expect(await readFile(join(userDataPath, "audio", "assets", "sound-1.wav"))).toEqual(
      Buffer.from("RIFFxxxxWAVEpayload")
    );
    expect(await service.resolveAssetPath("sound-1")).toContain(join("audio", "assets", "sound-1.wav"));
    expect(await service.resolveAssetPath("../sound-1")).toBeNull();
  });

  it("validates source ownership, requests enabled playback, and falls back after failure", async () => {
    const { userDataPath, service, onPlaybackRequested } = await harness();
    const validPath = join(userDataPath, "tone.ogg");
    await writeFile(validPath, Buffer.from("OggSpayload"));
    await service.importAssets([validPath]);
    await service.updateSources({
      reminderSource: { kind: "imported", assetId: "sound-1" },
      cryingSource: { kind: "builtin", id: "soft-whimper" },
    });
    expect(await service.requestPlayback("reminder", false)).toBeNull();
    const request = await service.requestPlayback("reminder", true);
    expect(request?.source).toEqual({ kind: "imported", assetId: "sound-1" });
    await service.reportPlaybackFailure(request!.requestId, "sound-1");
    const fallback = await service.requestPlayback("reminder", true);
    expect(fallback?.source).toEqual({ kind: "builtin", id: "gentle-chime" });
    expect(onPlaybackRequested).toHaveBeenCalledTimes(2);
    await expect(
      service.updateSources({
        reminderSource: { kind: "imported", assetId: "missing" },
        cryingSource: { kind: "builtin", id: "soft-whimper" },
      })
    ).rejects.toThrow("Stale imported");
  });

  it("saves reminder voices, checks availability, requests playback with custom voice, and cleans up unreferenced voices", async () => {
    const { service, onPlaybackRequested } = await harness();
    const wavHeader = Buffer.from("RIFFxxxxWAVEtestpayload");
    const { voiceId } = await service.saveReminderVoice(wavHeader, "wav");
    expect(voiceId).toBeTruthy();

    const resolved = await service.resolveReminderVoicePath(voiceId);
    expect(resolved).toContain(join("audio", "reminder-voices"));
    expect(await service.resolveReminderVoicePath("non-existent")).toBeNull();

    const availability = await service.getReminderVoiceAvailability([voiceId, "unknown-id"]);
    expect(availability).toEqual({
      [voiceId]: true,
      "unknown-id": false,
    });

    const readBack = await service.readReminderVoice(voiceId);
    expect(readBack).not.toBeNull();
    expect(readBack?.ext).toBe("wav");
    expect(readBack?.data).toEqual(new Uint8Array(wavHeader));

    // Request playback with custom voice
    const request = await service.requestPlayback("reminder", true, {
      voiceAssetId: voiceId,
      voiceTrimStart: 0.5,
      voiceTrimEnd: 2.5,
    });
    expect(request?.source).toEqual({
      kind: "reminder-voice",
      voiceAssetId: voiceId,
      voiceTrimStart: 0.5,
      voiceTrimEnd: 2.5,
    });
    expect(onPlaybackRequested).toHaveBeenCalledWith(request);

    // Reporting failure on reminder voice returns false and does not mutate settingsStore
    const changed = await service.reportPlaybackFailure(request!.requestId, voiceId);
    expect(changed).toBe(false);

    // Subsequent playback for this failed voice falls back to default chime
    const failedVoiceFallback = await service.requestPlayback("reminder", true, {
      voiceAssetId: voiceId,
    });
    expect(failedVoiceFallback?.source).toEqual({ kind: "builtin", id: "gentle-chime" });

    // Request playback with missing custom voice falls back to default
    const fallbackRequest = await service.requestPlayback("reminder", true, {
      voiceAssetId: "deleted-voice-id",
    });
    expect(fallbackRequest?.source).toEqual({ kind: "builtin", id: "gentle-chime" });

    // Test cleanup
    await service.cleanupUnreferencedReminderVoices();
    expect(await service.resolveReminderVoicePath(voiceId)).toBeNull();
  });
});
