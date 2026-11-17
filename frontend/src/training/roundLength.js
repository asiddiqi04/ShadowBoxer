// Round lengths are chosen in 30-second steps from 30 s to 10 minutes.
export const ROUND_LENGTH_STEP = 30
export const MIN_ROUND_SECONDS = 30
export const MAX_ROUND_SECONDS = 600
export const DEFAULT_ROUND_SECONDS = 180

export const isValidRoundLength = (seconds) =>
  Number.isSafeInteger(seconds) &&
  seconds >= MIN_ROUND_SECONDS &&
  seconds <= MAX_ROUND_SECONDS &&
  seconds % ROUND_LENGTH_STEP === 0

export const clampRoundLength = (seconds) =>
  Math.min(
    MAX_ROUND_SECONDS,
    Math.max(
      MIN_ROUND_SECONDS,
      Math.round(seconds / ROUND_LENGTH_STEP) * ROUND_LENGTH_STEP,
    ),
  )

export const formatRoundLength = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
