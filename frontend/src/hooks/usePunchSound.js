import { useCallback, useEffect, useRef } from 'react'
import punchSoundUrl from '../assets/sounds/punchSound.ogg'
import incorrectPunchSoundUrl from '../assets/sounds/incorrect-punch-3.mp3'

const soundUrls = { punch: punchSoundUrl, incorrect: incorrectPunchSoundUrl }

export function usePunchSound() {
  const audioRef = useRef(null)

  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    let context
    try {
      context = new AudioContext()
    } catch {
      return
    }
    const audio = { context, buffers: {} }
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
    // A locked combo ignores punches; it must not produce another failure cue.
    const incorrect =
      punchEvent?.expected && !punchEvent.matched && !punchEvent.comboLocked
    const buffer = audio?.buffers[incorrect ? 'incorrect' : 'punch']
    if (!buffer || audio.context.state !== 'running') return
    try {
      // A fresh source lets fast successive punches overlap without cutting off tails.
      const source = audio.context.createBufferSource()
      source.buffer = buffer
      source.connect(audio.context.destination)
      source.onended = () => source.disconnect()
      source.start()
    } catch {
      /* Keep detection available if the audio device becomes unavailable. */
    }
  }, [])

  return { unlock, play }
}
