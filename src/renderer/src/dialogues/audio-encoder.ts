export interface PcmAudioData {
  channels: readonly Float32Array[];
  sampleRate: number;
}

/**
 * Extracts channel data and sample rate from a Web Audio API AudioBuffer.
 */
export function extractPcmFromAudioBuffer(audioBuffer: AudioBuffer): PcmAudioData {
  const channels: Float32Array[] = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }
  return {
    channels,
    sampleRate: audioBuffer.sampleRate,
  };
}

/**
 * Encodes the entire PCM audio into a standard 16-bit PCM RIFF/WAVE byte buffer.
 */
export function encodeWav(pcm: PcmAudioData): Uint8Array {
  return sliceAndEncodeWav(pcm, 0);
}

/**
 * Trims PCM audio channels between startSeconds and endSeconds,
 * and encodes the resulting slice into a standard 16-bit PCM RIFF/WAVE byte buffer.
 */
export function sliceAndEncodeWav(pcm: PcmAudioData, startSeconds = 0, endSeconds?: number): Uint8Array {
  const sampleRate = Math.max(1, Math.round(pcm.sampleRate));
  const channelCount = Math.max(1, Math.min(2, pcm.channels.length));

  const totalSamples = pcm.channels[0]?.length ?? 0;
  if (totalSamples === 0) {
    throw new Error("Cannot encode empty audio");
  }

  const totalDuration = totalSamples / sampleRate;
  const clampedStart = Math.max(0, Math.min(startSeconds, totalDuration));
  const rawEnd = endSeconds === undefined ? totalDuration : endSeconds;
  const clampedEnd = Math.max(clampedStart, Math.min(rawEnd, totalDuration));

  const startSample = Math.min(totalSamples - 1, Math.floor(clampedStart * sampleRate));
  const endSample = Math.max(startSample + 1, Math.floor(clampedEnd * sampleRate));
  const sliceLength = endSample - startSample;

  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = sliceLength * blockAlign;
  const totalFileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(totalFileSize);
  const view = new DataView(buffer);

  // RIFF chunk
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample = 16

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM samples
  let offset = 44;
  for (let s = startSample; s < endSample; s++) {
    for (let c = 0; c < channelCount; c++) {
      const channel = pcm.channels[c]!;
      const sample = channel[s] ?? 0;
      // Clamp between -1.0 and 1.0
      const clamped = Math.max(-1, Math.min(1, sample));
      // Convert to 16-bit signed integer
      const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
