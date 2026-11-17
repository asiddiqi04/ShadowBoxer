import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCloudSessionStorage,
  fromRow,
  toRow,
} from '../frontend/src/lib/cloudSessionStorage.js'
import {
  defaultSettings,
  loadSettings,
  saveSettings,
} from '../frontend/src/lib/settings.js'
import { summarizeWorkouts } from '../frontend/src/lib/workoutStats.js'
import { createTrainingService } from '../frontend/src/training/trainingService.js'

const session = (id) => {
  const engine = createTrainingService({ createId: () => id })
  engine.startRound('intense')
  return engine.endRound().session
}

// Minimal stand-in for the PostgREST query builder, keyed like the (user_id, id) primary key.
const fakeSupabase = ({ failWith } = {}) => {
  const rows = new Map()
  const calls = []
  const result = (data) => Promise.resolve({ data, error: failWith ?? null })
  return {
    rows,
    calls,
    from(table) {
      assert.equal(table, 'workout_sessions')
      return {
        upsert(value, options) {
          calls.push(options)
          if (!failWith)
            for (const row of [value].flat())
              if (!rows.has(row.id)) rows.set(row.id, { ...row })
          return result(null)
        },
        select() {
          const sorted = () =>
            [...rows.values()].sort(
              (a, b) => Date.parse(b.ended_at) - Date.parse(a.ended_at),
            )
          return {
            order: () => result(failWith ? null : sorted()),
            eq: (_column, id) => ({
              maybeSingle: () => result(rows.get(id) ?? null),
            }),
          }
        },
      }
    },
  }
}

test('cloud rows round-trip to the validated session summary', () => {
  const original = session('round-trip')
  const row = toRow(original)
  assert.equal(row.speed, 'intense')
  assert.equal('user_id' in row, false, 'user_id comes from auth.uid()')
  assert.deepEqual(fromRow(row), original)
  // Postgres timestamp formatting and numeric strings normalise back to the app format.
  assert.deepEqual(
    fromRow({
      ...row,
      started_at: row.started_at.replace('T', ' ').replace('Z', '+00:00'),
      duration_seconds: String(row.duration_seconds),
    }),
    original,
  )
  assert.throws(() => toRow({ id: 'bad' }), /Invalid/)
})

test('cloud saves are first-wins and imports never duplicate', async () => {
  const client = fakeSupabase()
  const storage = createCloudSessionStorage(client)
  const original = session('a')
  await storage.saveSession(original)
  await storage.saveSession({ ...original, durationSeconds: 5 })
  await storage.saveSessions([original, session('b')])
  assert.equal(client.rows.size, 2)
  assert.deepEqual(await storage.getSession('a'), original)
  assert.equal((await storage.listSessions()).length, 2)
  assert.ok(
    client.calls.every(
      (options) =>
        options.ignoreDuplicates && options.onConflict === 'user_id,id',
    ),
  )
  assert.equal(await storage.getSession('missing'), null)
})

test('cloud failures surface as errors the completion queue can retry', async () => {
  const storage = createCloudSessionStorage(
    fakeSupabase({ failWith: { message: 'offline' } }),
  )
  await assert.rejects(storage.saveSession(session('x')), /your account/)
  await assert.rejects(storage.listSessions(), /Account history unavailable/)
})

test('settings fall back to defaults and clamp invalid stored values', () => {
  const memory = new Map()
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  }
  assert.deepEqual(loadSettings(storage), defaultSettings)
  saveSettings(
    { ...defaultSettings, soundEffects: false, musicVolume: 3 },
    storage,
  )
  assert.deepEqual(loadSettings(storage), {
    ...defaultSettings,
    soundEffects: false,
    musicVolume: 1,
  })
  memory.set('shadowboxer-settings', '{not json')
  assert.deepEqual(loadSettings(storage), defaultSettings)
  const blocked = {
    getItem() {
      throw new Error('SecurityError')
    },
    setItem() {
      throw new Error('SecurityError')
    },
  }
  assert.deepEqual(loadSettings(blocked), defaultSettings)
  assert.doesNotThrow(() => saveSettings(defaultSettings, blocked))
})

test('workout stats aggregate rounds, punches, and combo success', () => {
  const now = Date.parse('2026-11-16T12:00:00Z')
  const make = (endedAt, punches, succeeded, failed) => ({
    endedAt,
    durationSeconds: 180,
    comboStats: { succeeded, failed, total: succeeded + failed },
    details: { punchCounts: { jab: punches, cross: 0, hook: 0, uppercut: 0 } },
  })
  assert.deepEqual(summarizeWorkouts([], now), {
    rounds: 0,
    roundsThisWeek: 0,
    minutesTrained: 0,
    totalPunches: 0,
    comboSuccessRate: null,
  })
  assert.deepEqual(
    summarizeWorkouts(
      [
        make('2026-11-15T12:00:00Z', 40, 3, 1),
        make('2026-10-01T12:00:00Z', 20, 0, 0),
      ],
      now,
    ),
    {
      rounds: 2,
      roundsThisWeek: 1,
      minutesTrained: 6,
      totalPunches: 60,
      comboSuccessRate: 75,
    },
  )
})
