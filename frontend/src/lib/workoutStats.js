const DAY_MS = 24 * 60 * 60 * 1000

const totalPunches = (session) =>
  Object.values(session.details.punchCounts).reduce((sum, n) => sum + n, 0)

// Aggregates validated workout summaries (newest-first or any order).
export const summarizeWorkouts = (sessions, now = Date.now()) => {
  const weekStart = now - 7 * DAY_MS
  let punches = 0,
    seconds = 0,
    succeeded = 0,
    combos = 0,
    thisWeek = 0
  for (const session of sessions) {
    punches += totalPunches(session)
    seconds += session.durationSeconds
    succeeded += session.comboStats.succeeded
    combos += session.comboStats.total
    if (Date.parse(session.endedAt) >= weekStart) thisWeek++
  }
  return {
    rounds: sessions.length,
    roundsThisWeek: thisWeek,
    minutesTrained: Math.round(seconds / 60),
    totalPunches: punches,
    comboSuccessRate: combos ? Math.round((succeeded / combos) * 100) : null,
  }
}
