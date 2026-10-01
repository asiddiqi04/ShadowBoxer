export const DEFAULT_SPEED = 'casual'

// Timing changes with pace; punch shape and confidence requirements do not.
export const speedProfiles = Object.freeze({
  form: Object.freeze({ frameIntervalMs: 80, cooldownMs: 480, motionWindowMs: 650, comboDelayMs: 1000, uppercutConfirmMs: 140, minMotion: 0.04 }),
  casual: Object.freeze({ frameIntervalMs: 50, cooldownMs: 300, motionWindowMs: 350, comboDelayMs: 650, uppercutConfirmMs: 80, minMotion: 0.1 }),
  intense: Object.freeze({ frameIntervalMs: 25, cooldownMs: 160, motionWindowMs: 220, comboDelayMs: 350, uppercutConfirmMs: 45, minMotion: 0.12 }),
})

export const isValidSpeed = (speed) => typeof speed === 'string' && Object.hasOwn(speedProfiles, speed)
export const getSpeedProfile = (speed = DEFAULT_SPEED) => speedProfiles[speed] ?? speedProfiles[DEFAULT_SPEED]
