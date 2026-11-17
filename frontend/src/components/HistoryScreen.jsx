const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const formatDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : dateFormat.format(date)
}

const formatDuration = (seconds) => {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const punchTotal = (session) =>
  Object.values(session.details.punchCounts).reduce((a, b) => a + b, 0)

function Stat({ label, value }) {
  return (
    <div className="px-1 py-2 sm:px-5">
      <p className="display-title text-4xl leading-none text-white">{value}</p>
      <p className="mt-2 text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
    </div>
  )
}

function HistoryScreen({
  sessions,
  stats,
  historyLabel,
  error,
  onRetry,
  onBack,
}) {
  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex items-center justify-between gap-4">
        <button className="action-btn action-btn-ghost" onClick={onBack}>
          ← Menu
        </button>
        <span className="text-xs text-slate-400">{historyLabel}</span>
      </nav>

      <h1 className="display-title mt-8 text-5xl text-orange-50 sm:text-6xl">
        Workout history
      </h1>

      <section className="panel-card mt-6 p-6">
        <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-5 sm:divide-x sm:divide-white/10">
          <Stat label="Rounds" value={stats.rounds} />
          <Stat label="This week" value={stats.roundsThisWeek} />
          <Stat label="Minutes" value={stats.minutesTrained} />
          <Stat label="Punches" value={stats.totalPunches} />
          <Stat
            label="Combo success"
            value={
              stats.comboSuccessRate == null
                ? '—'
                : `${stats.comboSuccessRate}%`
            }
          />
        </div>
      </section>

      {error && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-300/35 bg-rose-950/30 px-5 py-4 text-sm text-rose-100">
          <span>{error}</span>
          <button className="action-btn action-btn-secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      <section className="mt-6 pb-6">
        {sessions.length ? (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45">
            {sessions.map((session) => {
              const { succeeded, failed, total } = session.comboStats
              return (
                <li
                  key={session.id}
                  className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] sm:items-center"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-sm font-semibold text-white">
                      {formatDate(session.startedAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {session.details.speed[0].toUpperCase()}
                      {session.details.speed.slice(1)} pace
                    </p>
                  </div>
                  <p className="text-sm text-slate-300">
                    <span className="text-slate-500">Time </span>
                    {formatDuration(session.durationSeconds)}
                  </p>
                  <p className="text-sm text-slate-300">
                    <span className="text-slate-500">Punches </span>
                    {punchTotal(session)}
                  </p>
                  <p className="text-sm text-slate-300">
                    <span className="text-emerald-300">{succeeded}</span>
                    <span className="text-slate-500"> / </span>
                    <span className="text-rose-300">{failed}</span>
                    <span className="text-slate-500"> combos</span>
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {total ? `${Math.round((succeeded / total) * 100)}%` : '—'}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-white/10 bg-slate-950/45 px-5 py-8 text-center text-sm text-slate-400">
            No rounds yet. Finish a round and it will show up here.
          </p>
        )}
      </section>
    </div>
  )
}

export default HistoryScreen
