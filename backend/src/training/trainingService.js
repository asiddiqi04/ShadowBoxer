import { randomUUID } from 'node:crypto'
import { createSession, validateSessionPayload } from '../sessionStore.js'
import {
  applyPunchToCombo,
  initialComboStats,
  pickRandomCombo,
  releaseComboIfReady,
} from './comboService.js'
import { classifyPunch, initialPunchCounts } from './punchClassifier.js'
import { DEFAULT_SPEED, getSpeedProfile, isValidSpeed } from './speedProfiles.js'

export const ROUND_SECONDS = 180
const maxFrameHistory = 40

export class TrainingError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'TrainingError'
    this.statusCode = statusCode
  }
}

const createReadyState = (random = Math.random, speed = DEFAULT_SPEED) => ({
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
  lastSavedSession: null,
})

const elapsedMsForState = (state, nowMs) => {
  if (!state.startedAtMs) return 0

  const endMs =
    state.status === 'running'
      ? nowMs
      : state.pausedAtMs ?? state.endedAtMs ?? nowMs

  return Math.max(0, endMs - state.startedAtMs - state.pausedDurationMs)
}

const serialize = (state, nowMs) => {
  const elapsedMs = elapsedMsForState(state, nowMs)
  const durationMs = state.roundDurationSeconds * 1000
  const timeLeftSeconds = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000))

  return {
    round: {
      status: state.status,
      speed: state.speed,
      frameIntervalMs: getSpeedProfile(state.speed).frameIntervalMs,
      isRunning: state.status === 'running',
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      durationSeconds: state.roundDurationSeconds,
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      timeLeftSeconds,
    },
    currentCombo: [...state.currentCombo],
    comboStepIndex: state.comboStepIndex,
    comboStats: { ...state.comboStats },
    comboResult: state.comboResult,
    lastPunchEvent: state.lastPunchEvent,
    punchCounts: { ...state.punchCounts },
    debugRows: state.debugRows,
    session: {
      lastSavedSession: state.lastSavedSession,
    },
  }
}

export const createTrainingService = ({ now = Date.now, random = Math.random } = {}) => {
  let state = createReadyState(random)

  const persistCompletedSession = (endedAtMs) => {
    if (!state.startedAt || state.lastSavedSession) return state.lastSavedSession

    const endedAt = new Date(endedAtMs).toISOString()
    const payload = {
      id: randomUUID(),
      startedAt: state.startedAt,
      endedAt,
      roundDurationSeconds: state.roundDurationSeconds,
      comboStats: state.comboStats,
      details: {
        source: 'backend-training-service',
        speed: state.speed,
        latestResult: state.comboResult,
        lastPunchEvent: state.lastPunchEvent,
        punchCounts: state.punchCounts,
      },
    }

    const validated = validateSessionPayload(payload)
    if (!validated.ok) {
      throw new TrainingError(validated.message, 500)
    }

    state.lastSavedSession = createSession(validated.value)
    return state.lastSavedSession
  }

  const endRoundInternal = (nowMs) => {
    if (!state.startedAt || state.status === 'ready') return null
    if (state.status === 'ended') return state.lastSavedSession

    state = {
      ...state,
      status: 'ended',
      endedAt: new Date(nowMs).toISOString(),
      endedAtMs: nowMs,
      pausedAtMs: null,
      comboLockedUntil: null,
    }

    return persistCompletedSession(nowMs)
  }

  const refreshState = () => {
    const nowMs = now()
    state = releaseComboIfReady(state, nowMs, random)

    const elapsedMs = elapsedMsForState(state, nowMs)
    if (state.status === 'running' && elapsedMs >= state.roundDurationSeconds * 1000) {
      endRoundInternal(nowMs)
    }

    return serialize(state, now())
  }

  const startRound = (speed = DEFAULT_SPEED) => {
    if (!isValidSpeed(speed)) {
      throw new TrainingError('Choose a round speed: form, casual, or intense.')
    }
    const nowMs = now()
    state = {
      ...createReadyState(random, speed),
      status: 'running',
      startedAt: new Date(nowMs).toISOString(),
      startedAtMs: nowMs,
    }

    return serialize(state, nowMs)
  }

  const pauseRound = () => {
    const nowMs = now()
    refreshState()
    if (state.status !== 'running') return serialize(state, nowMs)

    state = {
      ...state,
      status: 'paused',
      pausedAtMs: nowMs,
    }

    return serialize(state, nowMs)
  }

  const resumeRound = () => {
    const nowMs = now()
    refreshState()
    if (state.status !== 'paused') return serialize(state, nowMs)

    state = {
      ...state,
      status: 'running',
      pausedDurationMs: state.pausedDurationMs + Math.max(0, nowMs - state.pausedAtMs),
      pausedAtMs: null,
      frameHistory: [],
    }

    return serialize(state, nowMs)
  }

  const resetRound = () => {
    state = createReadyState(random, state.speed)
    return serialize(state, now())
  }

  const endRound = () => {
    const nowMs = now()
    const session = endRoundInternal(nowMs)
    return {
      state: serialize(state, nowMs),
      session,
    }
  }

  const submitFrame = (frame) => {
    const nowMs = now()
    refreshState()

    if (state.status !== 'running') {
      throw new TrainingError('A running round is required before submitting pose frames.', 409)
    }

    const frameEntry = {
      keypoints: frame.keypoints,
      keypoints3D: frame.keypoints3D,
      time: frame.time,
    }
    const frameHistory = [...state.frameHistory, frameEntry].slice(-maxFrameHistory)
    const classification = classifyPunch(frameHistory, state.lastPunchBySide, state.speed)

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
        [classification.punch.type]: state.punchCounts[classification.punch.type] + 1,
      }

      const comboState = applyPunchToCombo(state, classification.punch, {
        nowMs,
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
      state: serialize(state, nowMs),
      punchEvent,
    }
  }

  return {
    getState: refreshState,
    startRound,
    pauseRound,
    resumeRound,
    resetRound,
    endRound,
    submitFrame,
  }
}

export const trainingService = createTrainingService()
