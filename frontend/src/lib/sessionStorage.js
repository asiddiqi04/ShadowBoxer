import { isValidSpeed } from '../training/speedProfiles.js'

const isNonNegativeInteger = (value) =>
  Number.isSafeInteger(value) && value >= 0
export const validateSession = (session) => {
  if (
    !session ||
    session.schemaVersion !== 1 ||
    typeof session.id !== 'string' ||
    !session.id.trim() ||
    !['startedAt', 'endedAt'].every(
      (key) =>
        typeof session[key] === 'string' &&
        Number.isFinite(Date.parse(session[key])),
    ) ||
    session.roundDurationSeconds !== 180 ||
    !Number.isFinite(session.durationSeconds) ||
    session.durationSeconds < 0 ||
    session.durationSeconds > 180 ||
    !['succeeded', 'failed', 'total'].every((key) =>
      isNonNegativeInteger(session.comboStats?.[key]),
    ) ||
    session.comboStats.total !==
      session.comboStats.succeeded + session.comboStats.failed ||
    !isValidSpeed(session.details?.speed) ||
    !['jab', 'cross', 'hook', 'uppercut'].every((key) =>
      isNonNegativeInteger(session.details?.punchCounts?.[key]),
    )
  ) {
    throw new Error(
      'Invalid workout summary. Your existing history has not been changed.',
    )
  }
  // Keep only the versioned summary; never persist recordings or arbitrary details.
  return {
    schemaVersion: 1,
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    roundDurationSeconds: session.roundDurationSeconds,
    durationSeconds: session.durationSeconds,
    comboStats: {
      succeeded: session.comboStats.succeeded,
      failed: session.comboStats.failed,
      total: session.comboStats.total,
    },
    details: {
      speed: session.details.speed,
      punchCounts: Object.fromEntries(
        ['jab', 'cross', 'hook', 'uppercut'].map((key) => [
          key,
          session.details.punchCounts[key],
        ]),
      ),
    },
  }
}

export const createSessionStorage = ({
  indexedDB = globalThis.indexedDB,
  name = 'shadowboxer-workouts',
} = {}) => {
  const open = () =>
    new Promise((resolve, reject) => {
      if (!indexedDB)
        return reject(
          new Error(
            'Browser history is unavailable. Enable site storage and retry.',
          ),
        )
      const request = indexedDB.open(name, 1)
      let abandoned = false
      const fail = () => {
        abandoned = true
        reject(
          new Error(
            'Cannot open browser history. Close other ShadowBoxer tabs or enable site storage, then retry.',
          ),
        )
      }
      request.onupgradeneeded = () =>
        request.result.createObjectStore('sessions', { keyPath: 'id' })
      request.onerror = fail
      request.onblocked = fail
      request.onsuccess = () => {
        if (abandoned) return request.result.close()
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
    })
  const transaction = async (mode, operation) => {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', mode)
      let result
      tx.oncomplete = () => {
        db.close()
        resolve(result)
      }
      tx.onabort = tx.onerror = () => {
        db.close()
        reject(
          new Error(
            'Browser history could not be saved or read. Check available storage and retry.',
          ),
        )
      }
      operation(tx.objectStore('sessions'), (value) => {
        result = value
      })
    })
  }
  return {
    async saveSession(session) {
      const value = validateSession(session)
      return transaction('readwrite', (store, done) => {
        const get = store.get(value.id)
        get.onsuccess = () => {
          // First completion wins, even across tabs and concurrent retries.
          if (get.result) done(get.result)
          else {
            store.add(value)
            done(value)
          }
        }
      }).then(validateSession)
    },
    async listSessions() {
      const values = await transaction('readonly', (store, done) => {
        store.getAll().onsuccess = (event) => done(event.target.result)
      })
      return values
        .map(validateSession)
        .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))
    },
    async getSession(id) {
      const value = await transaction('readonly', (store, done) => {
        store.get(id).onsuccess = (event) => done(event.target.result)
      })
      return value ? validateSession(value) : null
    },
  }
}

const storage = createSessionStorage()
export const { saveSession, listSessions, getSession } = storage
