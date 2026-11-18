import { useCallback, useEffect, useRef } from 'react'

// Drop an .mp3/.ogg/.m4a into src/assets/sounds/music/ and it becomes the round track.
const tracks = Object.values(
  import.meta.glob('../assets/sounds/music/*.{mp3,ogg,m4a}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
export const musicTrackUrl = tracks[0] ?? null
export const hasMusicTrack = Boolean(musicTrackUrl)

// Music follows the round: plays while running, pauses with it, rewinds when it ends.
export function useRoundMusic({ enabled, volume, roundStatus }) {
  const audioRef = useRef(null)
  const playingRef = useRef(false)

  const getAudio = useCallback(() => {
    if (!musicTrackUrl) return null
    if (!audioRef.current) {
      const audio = new Audio(musicTrackUrl)
      audio.loop = true
      audio.preload = 'auto'
      audioRef.current = audio
    }
    return audioRef.current
  }, [])

  // Call from the Start/Resume click so mobile autoplay rules allow playback later.
  // If the round has not started yet (e.g. during the countdown), stay silent.
  const unlock = useCallback(() => {
    if (!enabled) return
    const audio = getAudio()
    if (!audio) return
    void audio
      .play()
      .then(() => {
        if (!playingRef.current) audio.pause()
      })
      .catch(() => {})
  }, [enabled, getAudio])

  useEffect(() => {
    const audio = audioRef.current ?? (enabled ? getAudio() : null)
    if (!audio) return
    audio.volume = volume
    playingRef.current = enabled && roundStatus === 'running'
    if (playingRef.current) {
      void audio.play().catch(() => {
        /* Blocked autoplay or decode failure must never affect training. */
      })
      return
    }
    audio.pause()
    if (roundStatus !== 'running' && roundStatus !== 'paused')
      audio.currentTime = 0
  }, [enabled, volume, roundStatus, getAudio])

  useEffect(
    () => () => {
      audioRef.current?.pause()
      audioRef.current = null
    },
    [],
  )

  return { unlock }
}
