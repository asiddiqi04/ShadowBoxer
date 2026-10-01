export const comboLibrary = [
  ['jab', 'cross'],
  ['jab', 'cross', 'hook'],
  ['uppercut', 'hook'],
  ['jab', 'jab', 'cross'],
  ['cross', 'hook', 'uppercut'],
]

export const comboToKey = (combo) => combo.join('-')

export const pickRandomCombo = (previousCombo = [], random = Math.random) => {
  const previousKey = comboToKey(previousCombo)
  let candidate = comboLibrary[Math.floor(random() * comboLibrary.length)]

  if (comboLibrary.length === 1) return [...candidate]

  let guard = 0
  while (comboToKey(candidate) === previousKey && guard < 12) {
    candidate = comboLibrary[Math.floor(random() * comboLibrary.length)]
    guard += 1
  }

  return [...candidate]
}

export const initialComboStats = () => ({
  succeeded: 0,
  failed: 0,
  total: 0,
})

export const releaseComboIfReady = (state, nowMs, random = Math.random) => {
  if (!state.comboLockedUntil || nowMs < state.comboLockedUntil) return state

  return {
    ...state,
    currentCombo: pickRandomCombo(state.currentCombo, random),
    comboStepIndex: 0,
    comboLockedUntil: null,
    comboResult: 'idle',
  }
}

export const applyPunchToCombo = (state, punch, options = {}) => {
  const nowMs = options.nowMs ?? Date.now()
  const lockDelayMs = options.lockDelayMs ?? 850
  const id = options.id ?? `${nowMs}-${Math.random().toString(36).slice(2, 8)}`
  const releasedState = releaseComboIfReady(state, nowMs, options.random)
  const comboLocked = Boolean(releasedState.comboLockedUntil && nowMs < releasedState.comboLockedUntil)
  const expectedIndex = releasedState.comboStepIndex
  const expected = releasedState.currentCombo[expectedIndex] ?? null
  const matched = !comboLocked && expected ? punch.type === expected : false
  const lastPunchEvent = {
    id,
    punch: punch.type,
    side: punch.side,
    score: punch.score,
    expected,
    expectedIndex,
    matched,
    comboLocked,
    detectedAt: new Date(nowMs).toISOString(),
  }

  if (comboLocked) {
    return {
      ...releasedState,
      lastPunchEvent,
    }
  }

  if (matched) {
    const nextStep = expectedIndex + 1
    if (nextStep >= releasedState.currentCombo.length) {
      const succeeded = releasedState.comboStats.succeeded + 1
      const failed = releasedState.comboStats.failed
      return {
        ...releasedState,
        comboStepIndex: nextStep,
        comboStats: {
          succeeded,
          failed,
          total: succeeded + failed,
        },
        comboResult: 'success',
        comboLockedUntil: nowMs + lockDelayMs,
        lastPunchEvent,
      }
    }

    return {
      ...releasedState,
      comboStepIndex: nextStep,
      comboResult: 'active',
      lastPunchEvent,
    }
  }

  const succeeded = releasedState.comboStats.succeeded
  const failed = releasedState.comboStats.failed + 1
  return {
    ...releasedState,
    comboStepIndex: 0,
    comboStats: {
      succeeded,
      failed,
      total: succeeded + failed,
    },
    comboResult: 'failed',
    comboLockedUntil: nowMs + lockDelayMs,
    lastPunchEvent,
  }
}
