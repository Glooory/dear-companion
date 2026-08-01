import { useEffect } from 'react'
import type { RestSystemApi } from '@shared/contracts'

export function useAudioPlayback(
  api: Pick<RestSystemApi, 'onAudioPlaybackRequested' | 'reportAudioPlaybackFailure'>,
  enabled: boolean
): void {
  useEffect(() => {
    let cancelCurrent: (() => void) | null = null
    const unsubscribe = api.onAudioPlaybackRequested((request) => {
      cancelCurrent?.()
      cancelCurrent = null
      if (!enabled) return
      if (request.source.kind === 'builtin') {
        cancelCurrent = playBuiltIn(request.cue)
        return
      }
      const assetId = request.source.assetId
      const audio = new Audio(`app://renderer/audio-assets/${encodeURIComponent(assetId)}`)
      let fallbackPlayed = false
      const timeout = window.setTimeout(() => audio.pause(), request.maxDurationMs)
      const fail = (): void => {
        if (fallbackPlayed) return
        fallbackPlayed = true
        audio.pause()
        playBuiltIn(request.cue)
        api.reportAudioPlaybackFailure(request.requestId, assetId)
      }
      audio.addEventListener('error', fail, { once: true })
      void audio.play().catch(fail)
      cancelCurrent = () => {
        window.clearTimeout(timeout)
        audio.removeEventListener('error', fail)
        audio.pause()
        audio.src = ''
      }
    })
    return () => {
      unsubscribe()
      cancelCurrent?.()
    }
  }, [api, enabled])
}

function playBuiltIn(cue: 'reminder' | 'crying'): () => void {
  const context = new AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = cue === 'reminder' ? 'sine' : 'triangle'
  oscillator.frequency.value = cue === 'reminder' ? 660 : 240
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.46)
  const close = (): void => { void context.close().catch(() => undefined) }
  oscillator.addEventListener('ended', close, { once: true })
  return () => {
    oscillator.removeEventListener('ended', close)
    try { oscillator.stop() } catch { /* already stopped */ }
    close()
  }
}
