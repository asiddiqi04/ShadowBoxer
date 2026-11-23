import { punchTypes } from './punchClassifier.js'

export const STANCES = ['orthodox', 'southpaw']
export const DEFAULT_STANCE = 'orthodox'

export const MIN_COMBO_LENGTH = 1
export const MAX_COMBO_LENGTH = 6
export const DEFAULT_COMBO_LENGTH = Object.freeze({ min: 2, max: 3 })

export const isValidStance = (stance) => STANCES.includes(stance)

// Keeps canonical punch order so two equal sets always serialise the same way.
export const normalizePunchSet = (punchSet) => {
  if (!Array.isArray(punchSet)) return null
  const selected = punchTypes.filter((type) => punchSet.includes(type))
  // Duplicates and unknown punch names make the lengths differ.
  return selected.length > 0 && selected.length === punchSet.length
    ? selected
    : null
}

export const normalizeComboLength = (comboLength) => {
  const { min, max } = comboLength ?? {}
  const valid = (value) =>
    Number.isInteger(value) &&
    value >= MIN_COMBO_LENGTH &&
    value <= MAX_COMBO_LENGTH
  return valid(min) && valid(max) && min <= max ? { min, max } : null
}

export const isDefaultComboOptions = (options) =>
  !options ||
  (options.punchSet.length === punchTypes.length &&
    options.comboLength.min === DEFAULT_COMBO_LENGTH.min &&
    options.comboLength.max === DEFAULT_COMBO_LENGTH.max)

// Returns { ok, value } where value always has every field filled in, or
// { ok: false, message } for input the UI should never produce.
export const normalizeRoundConfig = (config = {}) => {
  const punchSet =
    config.punchSet === undefined
      ? [...punchTypes]
      : normalizePunchSet(config.punchSet)
  if (!punchSet) return { ok: false, message: 'Choose at least one punch.' }

  const comboLength =
    config.comboLength === undefined
      ? { ...DEFAULT_COMBO_LENGTH }
      : normalizeComboLength(config.comboLength)
  if (!comboLength) {
    return {
      ok: false,
      message: `Combo length must be ${MIN_COMBO_LENGTH}-${MAX_COMBO_LENGTH} punches.`,
    }
  }

  const stance = config.stance ?? DEFAULT_STANCE
  if (!isValidStance(stance)) {
    return { ok: false, message: 'Choose orthodox or southpaw stance.' }
  }

  const seed = config.seed ?? null
  if (seed !== null && !Number.isInteger(seed)) {
    return { ok: false, message: 'Round seed must be an integer.' }
  }

  return { ok: true, value: { punchSet, comboLength, stance, seed } }
}

// Small, fast, deterministic PRNG (mulberry32). Both players in a match build
// one from the shared seed, so they receive the same combo sequence.
export const createSeededRandom = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
