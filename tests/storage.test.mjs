import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { createSessionStorage } from '../frontend/src/lib/sessionStorage.js'
import { createCompletionQueue } from '../frontend/src/lib/completionQueue.js'
import { createTrainingService } from '../frontend/src/training/trainingService.js'
const session = (id) => {
  const engine = createTrainingService({ createId: () => id })
  engine.startRound()
  return engine.endRound().session
}
test('independent concurrent saves and retries survive reopening without duplicates', async () => {
  const indexedDB = new IDBFactory()
  const a = createSessionStorage({ indexedDB }),
    b = createSessionStorage({ indexedDB })
  const original = session('a')
  await Promise.all([
    a.saveSession(original),
    b.saveSession(session('b')),
    b.saveSession(original),
  ])
  const reopened = createSessionStorage({ indexedDB })
  assert.equal((await reopened.listSessions()).length, 2)
  assert.deepEqual(await reopened.getSession('a'), original)
  await reopened.saveSession({ ...original, durationSeconds: 50 })
  assert.deepEqual(await reopened.getSession('a'), original)
})
test('records are validated on save and load', async () => {
  const indexedDB = new IDBFactory()
  const storage = createSessionStorage({ indexedDB })
  await assert.rejects(storage.saveSession({ id: 'bad' }), /Invalid/)
  await storage.saveSession(session('good'))
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('shadowboxer-workouts', 1)
    req.onsuccess = () => resolve(req.result)
  })
  await new Promise((resolve) => {
    const tx = db.transaction('sessions', 'readwrite')
    tx.objectStore('sessions').put({ id: 'bad' })
    tx.oncomplete = resolve
  })
  await assert.rejects(storage.listSessions(), /Invalid/)
  db.close()
})
test('unavailable storage does not break the engine; failed completions survive a new round and retry once', async () => {
  const unavailable = createSessionStorage({ indexedDB: null })
  await assert.rejects(unavailable.listSessions(), /unavailable/)
  let fail = true,
    calls = 0,
    entries = []
  const queue = createCompletionQueue(
    async () => {
      calls++
      if (fail) throw new Error('quota')
    },
    (value) => {
      entries = value
    },
  )
  const first = session('first'),
    second = session('second')
  queue.add(first)
  queue.add(first)
  queue.add(second)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(queue.hasUnsaved(), true)
  assert.deepEqual(
    entries.map((entry) => entry.status),
    ['error', 'error'],
  )
  fail = false
  await Promise.all([queue.retry(), queue.retry()])
  assert.equal(calls, 4)
  assert.equal(queue.hasUnsaved(), false)
  queue.add(first)
  assert.equal(calls, 4)
})
