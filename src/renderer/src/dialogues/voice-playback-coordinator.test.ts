import { describe, expect, it, vi } from "vitest";
import { VoicePlaybackCoordinator, type VoiceAudioHandle } from "./voice-playback-coordinator";

function createAudio() {
  const play = vi.fn(async () => undefined);
  const pause = vi.fn();
  return {
    volume: 1,
    src: "voice",
    onended: null,
    onerror: null,
    play,
    pause,
  } satisfies VoiceAudioHandle;
}

describe("VoicePlaybackCoordinator", () => {
  it("starts after 80 ms and fades a replaced voice before pausing it", async () => {
    vi.useFakeTimers();
    const first = createAudio();
    const second = createAudio();
    const create = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const coordinator = new VoicePlaybackCoordinator(create);

    coordinator.schedule("first", 0.8);
    await vi.advanceTimersByTimeAsync(79);
    expect(first.play).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(first.play).toHaveBeenCalledOnce();

    coordinator.schedule("second", 0.6);
    await vi.advanceTimersByTimeAsync(50);
    expect(first.pause).toHaveBeenCalledOnce();
    expect(first.src).toBe("");
    await vi.advanceTimersByTimeAsync(30);
    expect(second.play).toHaveBeenCalledOnce();
    coordinator.dispose();
    vi.useRealTimers();
  });

  it("cancels delayed playback and stops active audio on dispose", async () => {
    vi.useFakeTimers();
    const audio = createAudio();
    const create = vi.fn(() => audio);
    const coordinator = new VoicePlaybackCoordinator(create);

    coordinator.schedule("voice", 0.8);
    coordinator.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(create).not.toHaveBeenCalled();

    coordinator.schedule("voice", 0.8, 0);
    await vi.advanceTimersByTimeAsync(0);
    coordinator.dispose();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.src).toBe("");
    vi.useRealTimers();
  });

  it("releases audio after play rejection, end, or error", async () => {
    vi.useFakeTimers();
    const rejected = createAudio();
    rejected.play.mockRejectedValueOnce(new Error("blocked"));
    const ended = createAudio();
    const errored = createAudio();
    const coordinator = new VoicePlaybackCoordinator(
      vi.fn().mockReturnValueOnce(rejected).mockReturnValueOnce(ended).mockReturnValueOnce(errored)
    );

    coordinator.schedule("rejected", 1, 0);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(rejected.src).toBe("");

    coordinator.schedule("ended", 1, 0);
    await vi.advanceTimersByTimeAsync(0);
    (ended.onended as ((event: Event) => unknown) | null)?.(new Event("ended"));
    expect(ended.src).toBe("");

    coordinator.schedule("errored", 1, 0);
    await vi.advanceTimersByTimeAsync(0);
    (errored.onerror as ((event: Event) => unknown) | null)?.(new Event("error"));
    expect(errored.src).toBe("");
    coordinator.dispose();
    vi.useRealTimers();
  });

  it("sets currentTime to trimStart and releases when reaching trimEnd", async () => {
    vi.useFakeTimers();
    const audio = {
      volume: 1,
      src: "trimmed-voice",
      currentTime: 0,
      onended: null,
      onerror: null,
      ontimeupdate: null as ((event: Event) => unknown) | null,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    } satisfies VoiceAudioHandle;

    const coordinator = new VoicePlaybackCoordinator(() => audio);
    coordinator.schedule("trimmed-voice", 1, 0, 0.5, 2.0);
    await vi.advanceTimersByTimeAsync(0);

    expect(audio.currentTime).toBe(0.5);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.ontimeupdate).toBeTypeOf("function");

    // Progress before trimEnd does not release
    audio.currentTime = 1.8;
    audio.ontimeupdate?.(new Event("timeupdate"));
    expect(audio.src).toBe("trimmed-voice");

    // Progress at or past trimEnd releases
    audio.currentTime = 2.0;
    audio.ontimeupdate?.(new Event("timeupdate"));
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.src).toBe("");

    coordinator.dispose();
    vi.useRealTimers();
  });
});
