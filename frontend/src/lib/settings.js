// Per-device preferences. localStorage is fine here: losing them only resets defaults.
const KEY = 'shadowboxer-settings'

export const defaultSettings = Object.freeze({
  soundEffects: true,
  soundEffectsVolume: 0.8,
  music: true,
  musicVolume: 0.4,
})

const clampVolume = (value, fallback) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback

export const normalizeSettings = (value) => ({
  soundEffects:
    typeof value?.soundEffects === 'boolean'
      ? value.soundEffects
      : defaultSettings.soundEffects,
  soundEffectsVolume: clampVolume(
    value?.soundEffectsVolume,
    defaultSettings.soundEffectsVolume,
  ),
  music:
    typeof value?.music === 'boolean' ? value.music : defaultSettings.music,
  musicVolume: clampVolume(value?.musicVolume, defaultSettings.musicVolume),
})

export const loadSettings = (storage = globalThis.localStorage) => {
  try {
    return normalizeSettings(JSON.parse(storage?.getItem(KEY) ?? 'null'))
  } catch {
    return { ...defaultSettings }
  }
}

export const saveSettings = (settings, storage = globalThis.localStorage) => {
  try {
    storage?.setItem(KEY, JSON.stringify(normalizeSettings(settings)))
  } catch {
    /* Private mode or blocked storage: settings still apply for this visit. */
  }
}
