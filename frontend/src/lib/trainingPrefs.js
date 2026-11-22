import { punchTypes } from '../training/punchClassifier.js'
import {
  DEFAULT_COMBO_LENGTH,
  DEFAULT_STANCE,
  normalizeComboLength,
  normalizePunchSet,
  isValidStance,
} from '../training/roundConfig.js'
import { DEFAULT_SPEED, isValidSpeed } from '../training/speedProfiles.js'
import {
  DEFAULT_ROUND_SECONDS,
  isValidRoundLength,
} from '../training/roundLength.js'

// Remembered between visits. Kept apart from audio settings so a bad value in
// one can never reset the other.
const KEY = 'shadowboxer-training-prefs'

export const defaultTrainingPrefs = Object.freeze({
  speed: DEFAULT_SPEED,
  roundSeconds: DEFAULT_ROUND_SECONDS,
  stance: DEFAULT_STANCE,
  punchSet: Object.freeze([...punchTypes]),
  comboLength: Object.freeze({ ...DEFAULT_COMBO_LENGTH }),
})

export const normalizeTrainingPrefs = (value) => ({
  speed: isValidSpeed(value?.speed) ? value.speed : DEFAULT_SPEED,
  roundSeconds: isValidRoundLength(value?.roundSeconds)
    ? value.roundSeconds
    : DEFAULT_ROUND_SECONDS,
  stance: isValidStance(value?.stance) ? value.stance : DEFAULT_STANCE,
  punchSet: normalizePunchSet(value?.punchSet) ?? [
    ...defaultTrainingPrefs.punchSet,
  ],
  comboLength: normalizeComboLength(value?.comboLength) ?? {
    ...DEFAULT_COMBO_LENGTH,
  },
})

export const loadTrainingPrefs = (storage = globalThis.localStorage) => {
  try {
    return normalizeTrainingPrefs(JSON.parse(storage?.getItem(KEY) ?? 'null'))
  } catch {
    return normalizeTrainingPrefs(null)
  }
}

export const saveTrainingPrefs = (prefs, storage = globalThis.localStorage) => {
  try {
    storage?.setItem(KEY, JSON.stringify(normalizeTrainingPrefs(prefs)))
  } catch {
    /* Private mode or blocked storage: prefs still apply for this visit. */
  }
}
