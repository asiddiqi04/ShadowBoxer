import { validateSession } from './sessionStorage.js'

const TABLE = 'workout_sessions'
const COLUMNS =
  'id, schema_version, started_at, ended_at, round_duration_seconds, duration_seconds, speed, combos_succeeded, combos_failed, combos_total, jabs, crosses, hooks, uppercuts'

export const toRow = (session) => {
  const value = validateSession(session)
  return {
    id: value.id,
    schema_version: value.schemaVersion,
    started_at: value.startedAt,
    ended_at: value.endedAt,
    round_duration_seconds: value.roundDurationSeconds,
    duration_seconds: value.durationSeconds,
    speed: value.details.speed,
    combos_succeeded: value.comboStats.succeeded,
    combos_failed: value.comboStats.failed,
    combos_total: value.comboStats.total,
    jabs: value.details.punchCounts.jab,
    crosses: value.details.punchCounts.cross,
    hooks: value.details.punchCounts.hook,
    uppercuts: value.details.punchCounts.uppercut,
  }
}

export const fromRow = (row) =>
  validateSession({
    schemaVersion: row.schema_version,
    id: row.id,
    // Postgres returns its own timestamp format; normalise to the ISO strings the app stores.
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: new Date(row.ended_at).toISOString(),
    roundDurationSeconds: row.round_duration_seconds,
    durationSeconds: Number(row.duration_seconds),
    comboStats: {
      succeeded: row.combos_succeeded,
      failed: row.combos_failed,
      total: row.combos_total,
    },
    details: {
      speed: row.speed,
      punchCounts: {
        jab: row.jabs,
        cross: row.crosses,
        hook: row.hooks,
        uppercut: row.uppercuts,
      },
    },
  })

const fail = (error, message) => {
  if (error) throw new Error(message, { cause: error })
}

// Same interface as the IndexedDB storage, scoped to the signed-in user by RLS.
export const createCloudSessionStorage = (supabase) => ({
  async saveSession(session) {
    const row = toRow(session)
    // First completion wins, matching local storage: retries never overwrite or duplicate.
    const { error } = await supabase
      .from(TABLE)
      .upsert(row, { onConflict: 'user_id,id', ignoreDuplicates: true })
    fail(
      error,
      'Workout could not be saved to your account. Retry when online.',
    )
    return fromRow(row)
  },
  async saveSessions(sessions) {
    if (!sessions.length) return 0
    const rows = sessions.map(toRow)
    const { error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true })
    fail(error, 'Workouts could not be imported. Retry when online.')
    return rows.length
  },
  async listSessions() {
    const { data, error } = await supabase
      .from(TABLE)
      .select(COLUMNS)
      .order('ended_at', { ascending: false })
    fail(error, 'Account history unavailable. Check your connection and retry.')
    return data.map(fromRow)
  },
  async getSession(id) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(COLUMNS)
      .eq('id', id)
      .maybeSingle()
    fail(error, 'Account history unavailable. Check your connection and retry.')
    return data ? fromRow(data) : null
  },
})
