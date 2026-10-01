import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(currentDir, '..', '..')
const databaseDir = path.join(repositoryRoot, 'database')
const dataDir = path.join(databaseDir, 'data')
const schemaPath = path.join(databaseDir, 'schema.sql')
const databasePath = process.env.SESSION_DATABASE_PATH
  ? path.resolve(process.env.SESSION_DATABASE_PATH)
  : path.join(dataDir, 'sessions.sqlite')

fs.mkdirSync(path.dirname(databasePath), { recursive: true })

const schemaSql = fs.readFileSync(schemaPath, 'utf8')
const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.exec(schemaSql)

const insertSessionStatement = db.prepare(`
  INSERT INTO sessions (
    id,
    started_at,
    ended_at,
    round_duration_seconds,
    succeeded_count,
    failed_count,
    total_combos,
    details_json
  ) VALUES (
    @id,
    @started_at,
    @ended_at,
    @round_duration_seconds,
    @succeeded_count,
    @failed_count,
    @total_combos,
    @details_json
  )
`)

const listSessionsStatement = db.prepare(`
  SELECT
    id,
    started_at,
    ended_at,
    round_duration_seconds,
    succeeded_count,
    failed_count,
    total_combos,
    details_json,
    created_at
  FROM sessions
  ORDER BY datetime(created_at) DESC, rowid DESC
`)

const getSessionStatement = db.prepare(`
  SELECT
    id,
    started_at,
    ended_at,
    round_duration_seconds,
    succeeded_count,
    failed_count,
    total_combos,
    details_json,
    created_at
  FROM sessions
  WHERE id = ?
`)

const toSessionRecord = (row) => ({
  id: row.id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  roundDurationSeconds: row.round_duration_seconds,
  comboStats: {
    succeeded: row.succeeded_count,
    failed: row.failed_count,
    total: row.total_combos,
  },
  details: row.details_json ? JSON.parse(row.details_json) : {},
  createdAt: row.created_at,
})

const isIsoDateString = (value) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

const toNonNegativeInteger = (value) =>
  Number.isInteger(value) && value >= 0 ? value : null

export const validateSessionPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'Request body must be an object.' }
  }

  const startedAt = payload.startedAt
  const endedAt = payload.endedAt
  const roundDurationSeconds = toNonNegativeInteger(payload.roundDurationSeconds)
  const succeeded = toNonNegativeInteger(payload.comboStats?.succeeded)
  const failed = toNonNegativeInteger(payload.comboStats?.failed)

  if (!isIsoDateString(startedAt)) {
    return { ok: false, message: 'startedAt must be a valid ISO date string.' }
  }

  if (!isIsoDateString(endedAt)) {
    return { ok: false, message: 'endedAt must be a valid ISO date string.' }
  }

  if (roundDurationSeconds == null) {
    return { ok: false, message: 'roundDurationSeconds must be a non-negative integer.' }
  }

  if (succeeded == null || failed == null) {
    return { ok: false, message: 'comboStats.succeeded and comboStats.failed must be non-negative integers.' }
  }

  const details =
    payload.details && typeof payload.details === 'object' && !Array.isArray(payload.details)
      ? payload.details
      : {}

  return {
    ok: true,
    value: {
      id: typeof payload.id === 'string' && payload.id.trim() ? payload.id : randomUUID(),
      startedAt,
      endedAt,
      roundDurationSeconds,
      comboStats: {
        succeeded,
        failed,
        total: succeeded + failed,
      },
      details,
    },
  }
}

export const createSession = (payload) => {
  insertSessionStatement.run({
    id: payload.id,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    round_duration_seconds: payload.roundDurationSeconds,
    succeeded_count: payload.comboStats.succeeded,
    failed_count: payload.comboStats.failed,
    total_combos: payload.comboStats.total,
    details_json: JSON.stringify(payload.details ?? {}),
  })

  return getSessionById(payload.id)
}

export const listSessions = () => listSessionsStatement.all().map(toSessionRecord)

export const getSessionById = (id) => {
  const row = getSessionStatement.get(id)
  return row ? toSessionRecord(row) : null
}

export const getDatabasePath = () => databasePath
