export interface VoiceAudioHandle {
  volume: number;
  src: string;
  onended: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  play(): Promise<void>;
  pause(): void;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;

export class VoicePlaybackCoordinator {
  private startTimer: TimeoutHandle | null = null;
  private activeAudio: VoiceAudioHandle | null = null;
  private readonly fadingAudio = new Map<VoiceAudioHandle, IntervalHandle>();

  constructor(private readonly createAudio: (src: string) => VoiceAudioHandle) {}

  schedule(src: string, volume: number, delayMs = 80): void {
    this.stop();
    this.startTimer = setTimeout(
      () => {
        this.startTimer = null;
        const audio = this.createAudio(src);
        audio.volume = clampVolume(volume);
        audio.onended = () => this.release(audio);
        audio.onerror = () => this.release(audio);
        this.activeAudio = audio;
        void audio.play().catch(() => this.release(audio));
      },
      Math.max(0, delayMs)
    );
  }

  stop(): void {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    const audio = this.activeAudio;
    if (!audio) return;
    this.activeAudio = null;
    audio.onended = null;
    audio.onerror = null;
    let step = 0;
    const initialVolume = audio.volume;
    const interval = setInterval(() => {
      step += 1;
      audio.volume = Math.max(0, initialVolume * (1 - step / 5));
      if (step >= 5) this.release(audio);
    }, 10);
    this.fadingAudio.set(audio, interval);
  }

  dispose(): void {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.activeAudio) this.release(this.activeAudio);
    for (const audio of [...this.fadingAudio.keys()]) this.release(audio);
  }

  private release(audio: VoiceAudioHandle): void {
    const fadeTimer = this.fadingAudio.get(audio);
    if (fadeTimer) {
      clearInterval(fadeTimer);
      this.fadingAudio.delete(audio);
    }
    if (this.activeAudio === audio) this.activeAudio = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = "";
  }
}

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8;
}
