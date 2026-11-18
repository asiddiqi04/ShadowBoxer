import { useCallback, useEffect, useRef } from 'react'
import punchSoundUrl from '../assets/sounds/punchSound.ogg'
import incorrectPunchSoundUrl from '../assets/sounds/incorrect-punch-3.mp3'

const soundUrls = { punch: punchSoundUrl, incorrect: incorrectPunchSoundUrl }

export function usePunchSound({ enabled = true, volume = 1 } = {}) {
  const audioRef = useRef(null)
  const optionsRef = useRef({ enabled, volume })

  useEffect(() => {
    optionsRef.current = { enabled, volume }
    const gain = audioRef.current?.gain
    if (gain) gain.gain.value = volume
  }, [enabled, volume])

  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    let context
    try {
      context = new AudioContext()
    } catch {
      return
    }
    const gain = context.createGain()
    gain.gain.value = optionsRef.current.volume
    gain.connect(context.destination)
    const audio = { context, gain, buffers: {} }
    const controller = new AbortController()
    audioRef.current = audio

    for (const [name, url] of Object.entries(soundUrls)) {
      void fetch(url, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error('Sound unavailable')
          return response.arrayBuffer()
        })
        .then((bytes) => context.decodeAudioData(bytes))
        .then((buffer) => {
          audio.buffers[name] = buffer
        })
        .catch(() => {
          /* Audio failure must never interrupt tracking. */
        })
    }

    return () => {
      controller.abort()
      if (audioRef.current === audio) audioRef.current = null
      void context.close().catch(() => {})
    }
  }, [])

  // Called directly from Start/Resume so browser autoplay rules allow playback.
  const unlock = useCallback(() => {
    const context = audioRef.current?.context
    if (context && context.state !== 'closed')
      void context.resume().catch(() => {})
  }, [])

  const play = useCallback((punchEvent) => {
    const audio = audioRef.current
    if (!optionsRef.current.enabled) return
    // A locked combo ignores punches; it must not produce another failure cue.
    const incorrect =
      punchEvent?.expected && !punchEvent.matched && !punchEvent.comboLocked
    const buffer = audio?.buffers[incorrect ? 'incorrect' : 'punch']
    if (!buffer || audio.context.state !== 'running') return
    try {
      // A fresh source lets fast successive punches overlap without cutting off tails.
      const source = audio.context.createBufferSource()
      source.buffer = buffer
      source.connect(audio.gain)
      source.onended = () => source.disconnect()
      source.start()
    } catch {
      /* Keep detection available if the audio device becomes unavailable. */
    }
  }, [])

  // Countdown beeps are synthesized, so they need no extra audio files.
  const cue = useCallback((kind) => {
    const audio = audioRef.current
    if (!optionsRef.current.enabled || audio?.context.state !== 'running')
      return
    try {
      const { context } = audio
      const start = context.currentTime
      const length = kind === 'go' ? 0.45 : 0.15
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      oscillator.type = 'square'
      oscillator.frequency.value = kind === 'go' ? 1320 : 880
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(0.25, start + 0.01)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + length)
      oscillator.connect(envelope)
      envelope.connect(audio.gain)
      oscillator.onended = () => {
        oscillator.disconnect()
        envelope.disconnect()
      }
      oscillator.start(start)
      oscillator.stop(start + length)
    } catch {
      /* A missing audio device must never block the round. */
    }
  }, [])

  return { unlock, play, cue }
}
