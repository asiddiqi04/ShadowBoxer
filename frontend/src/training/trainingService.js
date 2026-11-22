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
import { DEFAULT_ROUND_SECONDS, isValidRoundLength } from './roundLength.js'
import { createSeededRandom, normalizeRoundConfig } from './roundConfig.js'

export const ROUND_SECONDS = DEFAULT_ROUND_SECONDS
const maxFrameHistory = 40

export class TrainingError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TrainingError'
  }
}

const createReadyState = (
  random = Math.random,
  speed = DEFAULT_SPEED,
  roundDurationSeconds = DEFAULT_ROUND_SECONDS,
  config = null,
) => ({
  id: null,
  status: 'ready',
  speed,
  roundDurationSeconds,
  config,
  comboOptions: config
    ? { punchSet: config.punchSet, comboLength: config.comboLength }
    : null,
  startedAt: null,
  startedAtMs: null,
  endedAt: null,
  endedAtMs: null,
  pausedAtMs: null,
  pausedDurationMs: 0,
  currentCombo: pickRandomCombo(
    [],
    random,
    config && { punchSet: config.punchSet, comboLength: config.comboLength },
  ),
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
  includeDebug = false,
} = {}) => {
  let state = createReadyState(random)
  // Combos draw from this RNG. A round with a seed gets its own deterministic
  // generator so two players with the same seed see the same combo sequence.
  let comboRandom = random
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
        state.roundDurationSeconds,
        elapsedMsForState(state, now()) / 1000,
      ),
      comboStats: { ...state.comboStats },
      details: {
        speed: state.speed,
        punchCounts: { ...state.punchCounts },
        ...(state.config && {
          stance: state.config.stance,
          punchSet: [...state.config.punchSet],
          comboLength: { ...state.config.comboLength },
        }),
      },
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
        Math.min(elapsed, state.roundDurationSeconds * 1000),
      frameHistory: [],
      pausedAtMs: null,
      comboLockedUntil: null,
    }

    return complete()
  }

  const refreshState = () => {
    const nowMs = now()
    if (state.status === 'running')
      state = releaseComboIfReady(state, nowMs, comboRandom)

    const elapsedMs = elapsedMsForState(state, nowMs)
    if (
      state.status === 'running' &&
      elapsedMs >= state.roundDurationSeconds * 1000
    ) {
      endRoundInternal(nowMs)
    }

    return snapshot()
  }

  const startRound = (
    speed = DEFAULT_SPEED,
    roundSeconds = DEFAULT_ROUND_SECONDS,
    roundConfig = undefined,
  ) => {
    if (!isValidSpeed(speed)) {
      throw new TrainingError('Choose a round speed: form, casual, or intense.')
    }
    if (!isValidRoundLength(roundSeconds)) {
      throw new TrainingError(
        'Choose a round length between 30 seconds and 10 minutes, in 30-second steps.',
      )
    }
    const normalized =
      roundConfig === undefined ? null : normalizeRoundConfig(roundConfig)
    if (normalized && !normalized.ok)
      throw new TrainingError(normalized.message)
    refreshState()
    if (state.status === 'running' || state.status === 'paused')
      return snapshot()
    const nowMs = now()
    generation += 1
    const config = normalized?.value ?? null
    comboRandom =
      config?.seed != null ? createSeededRandom(config.seed) : random
    state = {
      ...createReadyState(comboRandom, speed, roundSeconds, config),
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
    comboRandom =
      state.config?.seed != null
        ? createSeededRandom(state.config.seed)
        : random
    state = createReadyState(
      comboRandom,
      state.speed,
      state.roundDurationSeconds,
      state.config,
    )
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
      state.config?.stance,
    )

    state = {
      ...state,
      frameHistory,
      debugRows: includeDebug ? classification.debug : [],
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
        random: comboRandom,
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
