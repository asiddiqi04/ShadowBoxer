const formatTimestamp = (value) => {
  if (!value) return 'Unknown time'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const formatAccuracy = (comboStats) => {
  const total = comboStats?.total ?? 0
  if (!total) return 'No combos logged yet'

  const percent = Math.round((comboStats.succeeded / total) * 100)
  return `${percent}% accuracy`
}

function SessionHistory({ sessions, statusMessage, statusTone }) {
  const statusToneClass = {
    loading: 'border-cyan-300/35 bg-cyan-950/25 text-cyan-100',
    ready: 'border-emerald-300/35 bg-emerald-950/25 text-emerald-100',
    saving: 'border-amber-300/35 bg-amber-950/25 text-amber-100',
    error: 'border-rose-300/35 bg-rose-950/30 text-rose-100',
  }[statusTone] ?? 'border-slate-300/20 bg-slate-950/40 text-slate-200'

  return (
    <section className="panel-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">Session Vault</p>
          <h3 className="mt-2 text-lg font-semibold text-white">Saved Sessions</h3>
        </div>
        <span className="metric-chip">{sessions.length} stored</span>
      </div>

      <div className={`mt-4 rounded-xl border px-3 py-3 text-sm ${statusToneClass}`}>
        {statusMessage}
      </div>

      <div className="mt-4 space-y-3">
        {sessions.length > 0 ? (
          sessions.slice(0, 5).map((session) => (
            <article
              key={session.id}
              className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 shadow-[0_10px_24px_rgba(2,6,23,0.18)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{formatTimestamp(session.startedAt)}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                    {session.roundDurationSeconds}s round
                  </p>
                </div>
                <span className="rounded-full border border-cyan-300/25 bg-cyan-950/30 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                  {formatAccuracy(session.comboStats)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/20 px-3 py-2">
                  <p className="text-[0.62rem] uppercase tracking-[0.14em] text-emerald-200/80">
                    Succeeded
                  </p>
                  <p className="mt-1 text-xl font-semibold text-emerald-100">
                    {session.comboStats.succeeded}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-300/20 bg-rose-950/20 px-3 py-2">
                  <p className="text-[0.62rem] uppercase tracking-[0.14em] text-rose-200/80">Failed</p>
                  <p className="mt-1 text-xl font-semibold text-rose-100">{session.comboStats.failed}</p>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-white/12 bg-slate-950/45 px-4 py-5 text-sm text-slate-300">
            No saved rounds yet. Finish a session and it will be written to local SQLite automatically.
          </div>
        )}
      </div>
    </section>
  )
}

export default SessionHistory
