import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrainingService } from '../frontend/src/training/trainingService.js'
import { speedProfiles } from '../frontend/src/training/speedProfiles.js'
const setup = (random = () => 0) => {
  let time = 0,
    wall = Date.UTC(2026, 9, 2),
    id = 0
  const engine = createTrainingService({
    now: () => time,
    wallNow: () => wall,
    random,
    createId: () => `id-${++id}`,
  })
  return {
    engine,
    advance: (ms) => {
      time += ms
    },
    wall: (ms) => {
      wall = ms
    },
  }
}
const frame = (time, x = 120, side = 'left') => ({
  time,
  keypoints: [
    { name: 'nose', x: 150, y: 80 },
    { name: `${side}_shoulder`, x: 100, y: 100 },
    { name: `${side === 'left' ? 'right' : 'left'}_shoulder`, x: 200, y: 100 },
    { name: `${side}_elbow`, x: 150, y: 100 },
    { name: `${side}_wrist`, x, y: 100 },
    { name: `${side}_hip`, x: 100, y: 220 },
  ],
})
test('independent engines have separate clocks, punch counters and combos', () => {
  const a = setup(),
    b = setup(() => 0.5)
  a.engine.startRound('form')
  b.engine.startRound('intense')
  for (const [i, x] of [120, 126, 132, 140, 260].entries()) {
    a.advance(i ? 100 : 600)
    a.engine.submitFrame(frame(600 + i * 100, x))
  }
  assert.equal(a.engine.getState().punchCounts.jab, 1)
  assert.equal(b.engine.getState().punchCounts.jab, 0)
  assert.equal(a.engine.getState().comboStepIndex, 1)
  assert.equal(b.engine.getState().comboStepIndex, 0)
  assert.equal(a.engine.getState().round.timeLeftSeconds, 179)
  assert.equal(b.engine.getState().round.timeLeftSeconds, 180)
  a.engine.resetRound()
  assert.equal(b.engine.getState().round.status, 'running')
})
test('elapsed clock starts at zero and ignores wall clock adjustments and pauses', () => {
  const { engine, advance, wall } = setup()
  const started = engine.startRound()
  advance(12345)
  wall(0)
  assert.equal(engine.getState().round.timeLeftSeconds, 168)
  engine.pauseRound()
  advance(50000)
  assert.equal(engine.getState().round.timeLeftSeconds, 168)
  engine.resumeRound()
  advance(7655)
  assert.equal(engine.getState().round.timeLeftSeconds, 160)
  engine.pauseRound()
  advance(10000)
  const { session } = engine.endRound()
  assert.equal(session.durationSeconds, 20)
  assert.equal(session.id, started.round.id)
  assert.equal(session.endedAt, new Date(0).toISOString())
})
test('timeout and repeated end return the same deeply immutable completion', () => {
  const { engine, advance } = setup()
  engine.startRound()
  advance(200000)
  const completed = engine.getState().session.completedSession
  assert.equal(completed.durationSeconds, 180)
  assert.equal(engine.endRound().session, completed)
  assert.throws(() => {
    completed.details.punchCounts.jab = 9
  }, TypeError)
  engine.pauseRound()
  engine.resumeRound()
  assert.equal(engine.endRound().session, completed)
  engine.resetRound()
  engine.startRound()
  advance(1000)
  engine.endRound()
  assert.equal(completed.durationSeconds, 180)
})
test('late inference cannot mutate reset, ended or resumed rounds; pause clears motion', () => {
  const { engine, advance } = setup()
  engine.startRound()
  const token = engine.getGeneration()
  advance(600)
  engine.submitFrame(frame(600), token)
  engine.pauseRound()
  engine.resumeRound()
  advance(100)
  assert.equal(engine.submitFrame(frame(700, 260), token).accepted, false)
  engine.submitFrame(frame(700, 260), engine.getGeneration())
  assert.equal(engine.getState().punchCounts.jab, 0)
  engine.resetRound()
  engine.startRound()
  assert.equal(engine.submitFrame(frame(700, 260), token).accepted, false)
  engine.endRound()
  assert.equal(
    engine.submitFrame(frame(700), engine.getGeneration()).accepted,
    false,
  )
})
for (const [speed, profile] of Object.entries(speedProfiles)) {
  test(`${speed} preserves sampling and combo release timing`, () => {
    const { engine, advance } = setup()
    assert.equal(
      engine.startRound(speed).round.frameIntervalMs,
      profile.frameIntervalMs,
    )
    for (const [i, x] of [120, 125, 130, 140, 260].entries()) {
      advance(i ? 100 : 600)
      engine.submitFrame(frame(600 + i * 100, x, 'right'))
    }
    assert.equal(engine.getState().comboResult, 'failed')
    advance(profile.comboDelayMs - 1)
    assert.equal(engine.getState().comboResult, 'failed')
    engine.pauseRound()
    advance(5000)
    engine.resumeRound()
    assert.equal(engine.getState().comboResult, 'failed')
    advance(1)
    assert.equal(engine.getState().comboResult, 'idle')
  })
}
test('invalid speed and duplicate start preserve the running round', () => {
  const { engine } = setup()
  const state = engine.startRound('intense')
  assert.throws(() => engine.startRound('turbo'))
  assert.deepEqual(engine.startRound('casual'), state)
})
test('reset or new start at timeout retains a completion for exactly-once delivery', () => {
  for (const action of ['resetRound', 'startRound']) {
    const { engine, advance } = setup()
    engine.startRound()
    advance(180001)
    engine[action]()
    const completed = engine.takeCompletions()
    assert.equal(completed.length, 1)
    assert.equal(completed[0].durationSeconds, 180)
    assert.deepEqual(engine.takeCompletions(), [])
  }
})
