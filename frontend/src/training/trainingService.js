import {
  applyPunchToCombo,
  initialComboStats,
  pickRandomCombo,
  releaseComboIfReady,
} from './comboService.js'
import { classifyPunch, initialPunchCounts } from './punchClassifier.js'
import { validatePoseFramePayload } from './validators.js'
import {
  DEFAULT_SPEED,
  getSpeedProfile,
  isValidSpeed,
} from './speedProfiles.js'

export const ROUND_SECONDS = 180
const maxFrameHistory = 40

export class TrainingError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TrainingError'
  }
}

const createReadyState = (random = Math.random, speed = DEFAULT_SPEED) => ({
  id: null,
  status: 'ready',
  speed,
  roundDurationSeconds: ROUND_SECONDS,
  startedAt: null,
  startedAtMs: null,
  endedAt: null,
  endedAtMs: null,
  pausedAtMs: null,
  pausedDurationMs: 0,
  currentCombo: pickRandomCombo([], random),
  comboStepIndex: 0,
  comboStats: initialComboStats(),
  comboResult: 'idle',
  comboLockedUntil: null,
  lastPunchEvent: null,
  punchCounts: initialPunchCounts(),
  debugRows: [],
  frameHistory: [],
  lastPunchBySide: { left: 0, right: 0 },
  completedSession: null,
})

const elapsedMsForState = (state, nowMs) => {
  if (state.startedAtMs == null) return 0

  const endMs =
    state.status === 'running'
      ? nowMs
      : (state.pausedAtMs ?? state.endedAtMs ?? nowMs)

  return Math.max(0, endMs - state.startedAtMs - state.pausedDurationMs)
}

const serialize = (state, nowMs, generation) => {
  const elapsedMs = elapsedMsForState(state, nowMs)
  const durationMs = state.roundDurationSeconds * 1000
  const timeLeftSeconds = Math.max(
    0,
    Math.ceil((durationMs - elapsedMs) / 1000),
  )

  return {
    round: {
      id: state.id,
      generation,
      status: state.status,
      speed: state.speed,
      frameIntervalMs: getSpeedProfile(state.speed).frameIntervalMs,
      isRunning: state.status === 'running',
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      durationSeconds: state.roundDurationSeconds,
      elapsedSeconds: Math.floor(Math.min(elapsedMs, durationMs) / 1000),
      timeLeftSeconds,
    },
    currentCombo: [...state.currentCombo],
    comboStepIndex: state.comboStepIndex,
    comboStats: { ...state.comboStats },
    comboResult: state.comboResult,
    lastPunchEvent: state.lastPunchEvent ? { ...state.lastPunchEvent } : null,
    punchCounts: { ...state.punchCounts },
    debugRows: structuredClone(state.debugRows),
    session: {
      completedSession: state.completedSession,
    },
  }
}

const freeze = (value) => {
  for (const item of Object.values(value))
    if (item && typeof item === 'object') freeze(item)
  return Object.freeze(value)
}

export const createTrainingService = ({
  now = () => performance.now(),
  wallNow = Date.now,
  random = Math.random,
  createId = () => globalThis.crypto.randomUUID(),
} = {}) => {
  let state = createReadyState(random)
  let generation = 0
  let completions = []
  const snapshot = () => serialize(state, now(), generation)

  const complete = () => {
    if (state.completedSession) return state.completedSession
    state.completedSession = freeze({
      schemaVersion: 1,
      id: state.id,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      roundDurationSeconds: state.roundDurationSeconds,
      durationSeconds: Math.min(
        ROUND_SECONDS,
        elapsedMsForState(state, now()) / 1000,
      ),
      comboStats: { ...state.comboStats },
      details: { speed: state.speed, punchCounts: { ...state.punchCounts } },
    })
    completions.push(state.completedSession)
    return state.completedSession
  }

  const endRoundInternal = (nowMs) => {
    if (!state.startedAt || state.status === 'ready') return null
    if (state.status === 'ended') return state.completedSession
    const elapsed = elapsedMsForState(state, nowMs)
    generation += 1

    state = {
      ...state,
      status: 'ended',
      endedAt: new Date(wallNow()).toISOString(),
      endedAtMs:
        state.startedAtMs +
        state.pausedDurationMs +
        Math.min(elapsed, ROUND_SECONDS * 1000),
      frameHistory: [],
      pausedAtMs: null,
      comboLockedUntil: null,
    }

    return complete()
  }

  const refreshState = () => {
    const nowMs = now()
    if (state.status === 'running')
      state = releaseComboIfReady(state, nowMs, random)

    const elapsedMs = elapsedMsForState(state, nowMs)
    if (
      state.status === 'running' &&
      elapsedMs >= state.roundDurationSeconds * 1000
    ) {
      endRoundInternal(nowMs)
    }

    return snapshot()
  }

  const startRound = (speed = DEFAULT_SPEED) => {
    if (!isValidSpeed(speed)) {
      throw new TrainingError('Choose a round speed: form, casual, or intense.')
    }
    refreshState()
    if (state.status === 'running' || state.status === 'paused')
      return snapshot()
    const nowMs = now()
    generation += 1
    state = {
      ...createReadyState(random, speed),
      id: createId(),
      status: 'running',
      startedAt: new Date(wallNow()).toISOString(),
      startedAtMs: nowMs,
    }

    return snapshot()
  }

  const pauseRound = () => {
    const nowMs = now()
    refreshState()
    if (state.status !== 'running') return snapshot()

    generation += 1
    state = {
      ...state,
      frameHistory: [],
      status: 'paused',
      pausedAtMs: nowMs,
    }

    return snapshot()
  }

  const resumeRound = () => {
    const nowMs = now()
    refreshState()
    if (state.status !== 'paused') return snapshot()

    generation += 1
    state = {
      ...state,
      comboLockedUntil:
        state.comboLockedUntil == null
          ? null
          : state.comboLockedUntil + nowMs - state.pausedAtMs,
      status: 'running',
      pausedDurationMs:
        state.pausedDurationMs + Math.max(0, nowMs - state.pausedAtMs),
      pausedAtMs: null,
      frameHistory: [],
    }

    return snapshot()
  }

  const resetRound = () => {
    refreshState()
    generation += 1
    state = createReadyState(random, state.speed)
    return snapshot()
  }

  const endRound = () => {
    const nowMs = now()
    const session = endRoundInternal(nowMs)
    return {
      state: snapshot(),
      session,
    }
  }

  const submitFrame = (frame, runGeneration = generation) => {
    const nowMs = now()
    refreshState()

    if (state.status !== 'running' || runGeneration !== generation)
      return { state: snapshot(), punchEvent: null, accepted: false }
    const validated = validatePoseFramePayload(frame)
    if (!validated.ok) throw new TrainingError(validated.message)
    frame = validated.value
    if (
      frame.time < state.startedAtMs ||
      frame.time > nowMs ||
      (state.frameHistory.length &&
        frame.time <= state.frameHistory.at(-1).time)
    ) {
      return { state: snapshot(), punchEvent: null, accepted: false }
    }

    const frameEntry = {
      keypoints: frame.keypoints,
      keypoints3D: frame.keypoints3D,
      time: frame.time,
    }
    const frameHistory = [...state.frameHistory, frameEntry].slice(
      -maxFrameHistory,
    )
    const classification = classifyPunch(
      frameHistory,
      state.lastPunchBySide,
      state.speed,
    )

    state = {
      ...state,
      frameHistory,
      debugRows: classification.debug,
    }

    let punchEvent = null
    if (classification.punch) {
      state.lastPunchBySide = {
        ...state.lastPunchBySide,
        [classification.punch.side]: frameEntry.time,
      }
      state.punchCounts = {
        ...state.punchCounts,
        [classification.punch.type]:
          state.punchCounts[classification.punch.type] + 1,
      }

      const comboState = applyPunchToCombo(state, classification.punch, {
        nowMs,
        wallNowMs: wallNow(),
        id: createId(),
        random,
        lockDelayMs: getSpeedProfile(state.speed).comboDelayMs,
      })
      state = {
        ...state,
        currentCombo: comboState.currentCombo,
        comboStepIndex: comboState.comboStepIndex,
        comboStats: comboState.comboStats,
        comboResult: comboState.comboResult,
        comboLockedUntil: comboState.comboLockedUntil,
        lastPunchEvent: comboState.lastPunchEvent,
      }
      punchEvent = state.lastPunchEvent
    }

    return {
      state: snapshot(),
      punchEvent,
      accepted: true,
    }
  }

  return {
    getState: refreshState,
    getGeneration: () => generation,
    takeCompletions: () => {
      const completed = completions
      completions = []
      return completed
    },
    startRound,
    pauseRound,
    resumeRound,
    resetRound,
    endRound,
    submitFrame,
  }
}
