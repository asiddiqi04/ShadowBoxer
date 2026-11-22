import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPunch } from '../frontend/src/training/punchClassifier.js'
import {
  pickRandomCombo,
  comboLibrary,
} from '../frontend/src/training/comboService.js'
import {
  createSeededRandom,
  normalizeRoundConfig,
} from '../frontend/src/training/roundConfig.js'
import { createTrainingService } from '../frontend/src/training/trainingService.js'

const setup = (options = {}) => {
  let time = 0
  let id = 0
  const engine = createTrainingService({
    now: () => time,
    wallNow: () => Date.UTC(2026, 10, 21) + time,
    createId: () => `id-${++id}`,
    ...options,
  })
  return {
    engine,
    advance: (ms) => {
      time += ms
    },
  }
}

// Plays `count` rounds' worth of combos by always throwing the expected punch
// and returns the sequence of combos the engine presented.
const combosSeen = (engine, advance, count) => {
  const seen = []
  for (let i = 0; i < count; i += 1) {
    const { currentCombo } = engine.getState()
    seen.push(currentCombo.join('-'))
    // A guaranteed-wrong punch locks the combo and moves to the next one.
    advance(5000)
    engine.getState()
  }
  return seen
}

test('seeded RNG is deterministic and in [0, 1)', () => {
  const a = createSeededRandom(42)
  const b = createSeededRandom(42)
  const first = Array.from({ length: 20 }, a)
  assert.deepEqual(first, Array.from({ length: 20 }, b))
  assert.ok(first.every((value) => value >= 0 && value < 1))
  assert.notDeepEqual(first, Array.from({ length: 20 }, createSeededRandom(43)))
})

test('default options keep using the curated combo library', () => {
  const random = createSeededRandom(7)
  for (let i = 0; i < 50; i += 1) {
    const combo = pickRandomCombo([], random)
    assert.ok(comboLibrary.some((c) => c.join() === combo.join()))
  }
})

test('generated combos only use the selected punches and length range', () => {
  const options = {
    punchSet: ['jab', 'cross'],
    comboLength: { min: 3, max: 4 },
  }
  const random = createSeededRandom(1)
  const lengths = new Set()
  for (let i = 0; i < 200; i += 1) {
    const combo = pickRandomCombo([], random, options)
    lengths.add(combo.length)
    assert.ok(combo.every((punch) => options.punchSet.includes(punch)))
  }
  assert.deepEqual([...lengths].sort(), [3, 4])
})

test('a single-punch drill still returns a combo', () => {
  const combo = pickRandomCombo(['hook'], () => 0.5, {
    punchSet: ['hook'],
    comboLength: { min: 1, max: 1 },
  })
  assert.deepEqual(combo, ['hook'])
})

test('normalizeRoundConfig fills defaults and rejects bad input', () => {
  const defaults = normalizeRoundConfig({})
  assert.equal(defaults.ok, true)
  assert.deepEqual(defaults.value.punchSet, [
    'jab',
    'cross',
    'hook',
    'uppercut',
  ])
  assert.equal(defaults.value.stance, 'orthodox')
  assert.equal(defaults.value.seed, null)

  // Punch sets are canonicalised so equal sets compare equal.
  assert.deepEqual(
    normalizeRoundConfig({ punchSet: ['hook', 'jab'] }).value.punchSet,
    ['jab', 'hook'],
  )
  assert.equal(normalizeRoundConfig({ punchSet: [] }).ok, false)
  assert.equal(normalizeRoundConfig({ punchSet: ['kick'] }).ok, false)
  assert.equal(normalizeRoundConfig({ punchSet: ['jab', 'jab'] }).ok, false)
  assert.equal(
    normalizeRoundConfig({ comboLength: { min: 4, max: 2 } }).ok,
    false,
  )
  assert.equal(
    normalizeRoundConfig({ comboLength: { min: 0, max: 2 } }).ok,
    false,
  )
  assert.equal(normalizeRoundConfig({ stance: 'sideways' }).ok, false)
  assert.equal(normalizeRoundConfig({ seed: 1.5 }).ok, false)
})

test('engine rejects an invalid round config', () => {
  const { engine } = setup()
  assert.throws(
    () => engine.startRound('casual', 60, { punchSet: [] }),
    /at least one punch/,
  )
})

test('two engines with the same seed see the same combo sequence', () => {
  const config = { seed: 12345, punchSet: ['jab', 'cross', 'hook'] }
  const runs = [0.1, 0.9].map((unused) => {
    // The injected RNG differs per engine; the seed must override it.
    const { engine, advance } = setup({ random: () => unused })
    engine.startRound('casual', 60, config)
    return combosSeen(engine, advance, 8)
  })
  assert.deepEqual(runs[0], runs[1])
})

test('different seeds give different sequences', () => {
  const sequence = (seed) => {
    const { engine, advance } = setup()
    engine.startRound('casual', 600, {
      seed,
      punchSet: ['jab', 'cross', 'hook', 'uppercut'],
      comboLength: { min: 2, max: 4 },
    })
    return combosSeen(engine, advance, 8)
  }
  assert.notDeepEqual(sequence(1), sequence(2))
})

test('completed sessions record the round config', () => {
  const { engine, advance } = setup()
  engine.startRound('casual', 60, {
    stance: 'southpaw',
    punchSet: ['jab', 'cross'],
    comboLength: { min: 2, max: 2 },
  })
  advance(61_000)
  const { details } = engine.getState().session.completedSession
  assert.equal(details.stance, 'southpaw')
  assert.deepEqual(details.punchSet, ['jab', 'cross'])
  assert.deepEqual(details.comboLength, { min: 2, max: 2 })
})

test('reset keeps the config and replays the same seeded sequence', () => {
  const { engine, advance } = setup()
  engine.startRound('casual', 600, { seed: 99 })
  const first = engine.getState().currentCombo.join('-')
  advance(1000)
  engine.endRound()
  engine.resetRound()
  engine.startRound('casual', 600, { seed: 99 })
  assert.equal(engine.getState().currentCombo.join('-'), first)
})

// --- Southpaw -------------------------------------------------------------

const keypoints = (side, wristX) => [
  { name: 'nose', x: 150, y: 80, score: 1 },
  { name: 'left_shoulder', x: 100, y: 100, score: 1 },
  { name: 'right_shoulder', x: 200, y: 100, score: 1 },
  { name: `${side}_elbow`, x: 150, y: 100, score: 1 },
  { name: `${side}_wrist`, x: wristX, y: 100, z: 0.05, score: 1 },
  { name: `${side}_hip`, x: side === 'left' ? 100 : 200, y: 220, score: 1 },
]

// The left-hand jab fixture from classifier.test.mjs, mirrored for the right.
const straightHistory = (side) => {
  const xs = [120, 126, 132, 140, 260]
  const mirrored = side === 'right'
  return xs.map((x, i) => ({
    time: (i + 1) * 100,
    keypoints: keypoints(side, mirrored ? 300 - x : x).map((point) =>
      i === xs.length - 1 && point.name === `${side}_wrist`
        ? { ...point, z: 0 }
        : point,
    ),
  }))
}

const classify = (side, stance) =>
  classifyPunch(straightHistory(side), { left: 0, right: 0 }, 'casual', stance)
    .punch

test('orthodox: left straight is the jab, right straight is the cross', () => {
  assert.equal(classify('left', 'orthodox').type, 'jab')
  assert.equal(classify('right', 'orthodox').type, 'cross')
})

test('southpaw: right straight is the jab, left straight is the cross', () => {
  assert.equal(classify('right', 'southpaw').type, 'jab')
  assert.equal(classify('left', 'southpaw').type, 'cross')
})

test('stance defaults to orthodox', () => {
  const punch = classifyPunch(straightHistory('left'), {
    left: 0,
    right: 0,
  }).punch
  assert.equal(punch.type, 'jab')
})

test('southpaw only changes the straight-punch names, not the detection', () => {
  const orthodox = classify('left', 'orthodox')
  const southpaw = classify('left', 'southpaw')
  assert.equal(orthodox.side, southpaw.side)
  assert.equal(orthodox.score, southpaw.score)
})

// --- Preferences and persistence -------------------------------------------

import {
  loadTrainingPrefs,
  normalizeTrainingPrefs,
  saveTrainingPrefs,
} from '../frontend/src/lib/trainingPrefs.js'
import { validateSession } from '../frontend/src/lib/sessionStorage.js'
import { fromRow, toRow } from '../frontend/src/lib/cloudSessionStorage.js'

const memoryStorage = () => {
  const data = new Map()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
}

test('training prefs round-trip and fall back to defaults when invalid', () => {
  const storage = memoryStorage()
  assert.equal(loadTrainingPrefs(storage).stance, 'orthodox')

  saveTrainingPrefs(
    {
      speed: 'intense',
      roundSeconds: 300,
      stance: 'southpaw',
      punchSet: ['cross', 'jab'],
      comboLength: { min: 1, max: 3 },
    },
    storage,
  )
  assert.deepEqual(loadTrainingPrefs(storage), {
    speed: 'intense',
    roundSeconds: 300,
    stance: 'southpaw',
    punchSet: ['jab', 'cross'],
    comboLength: { min: 1, max: 3 },
  })

  storage.setItem('shadowboxer-training-prefs', '{not json')
  assert.equal(loadTrainingPrefs(storage).stance, 'orthodox')
  const fallback = normalizeTrainingPrefs({
    speed: 'warp',
    roundSeconds: 45,
  })
  assert.equal(fallback.speed, 'casual')
  assert.equal(fallback.roundSeconds, 180)
  assert.deepEqual(
    normalizeTrainingPrefs({ stance: 'x', punchSet: [] }).punchSet,
    ['jab', 'cross', 'hook', 'uppercut'],
  )
})

const savedSession = (details = {}) => ({
  schemaVersion: 1,
  id: 's1',
  startedAt: '2026-11-21T10:00:00.000Z',
  endedAt: '2026-11-21T10:01:00.000Z',
  roundDurationSeconds: 60,
  durationSeconds: 60,
  comboStats: { succeeded: 3, failed: 1, total: 4 },
  details: {
    speed: 'casual',
    punchCounts: { jab: 5, cross: 4, hook: 0, uppercut: 0 },
    ...details,
  },
})

test('sessions without round settings (older history) stay valid', () => {
  const value = validateSession(savedSession())
  assert.equal(value.details.stance, undefined)
  assert.equal('punchSet' in value.details, false)
  const row = toRow(savedSession())
  assert.equal(row.stance, null)
  assert.equal('stance' in fromRow(row).details, false)
})

test('round settings survive local validation and the cloud row mapping', () => {
  const original = savedSession({
    stance: 'southpaw',
    punchSet: ['jab', 'cross'],
    comboLength: { min: 2, max: 4 },
  })
  assert.deepEqual(validateSession(original), original)
  const row = toRow(original)
  assert.equal(row.stance, 'southpaw')
  assert.deepEqual(row.punch_set, ['jab', 'cross'])
  assert.equal(row.combo_length_min, 2)
  assert.equal(row.combo_length_max, 4)
  assert.deepEqual(fromRow(row), original)
})

test('partial or invalid round settings are rejected', () => {
  assert.throws(() => validateSession(savedSession({ stance: 'southpaw' })))
  assert.throws(() =>
    validateSession(
      savedSession({
        stance: 'lefty',
        punchSet: ['jab'],
        comboLength: { min: 1, max: 1 },
      }),
    ),
  )
})
