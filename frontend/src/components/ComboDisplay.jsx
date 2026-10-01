const formatPunch = (punch) =>
  punch ? punch.charAt(0).toUpperCase() + punch.slice(1) : '';

function ComboDisplay({
  isRunning,
  currentCombo,
  comboStepIndex,
  comboStats,
  comboResult,
  lastPunchEvent,
}) {
  const progressCount = Math.min(comboStepIndex, currentCombo.length);
  const isFailureHighlight =
    comboResult === 'failed' &&
    lastPunchEvent &&
    !lastPunchEvent.comboLocked &&
    !lastPunchEvent.matched;

  const feedbackTone = !lastPunchEvent
    ? 'punch-feedback-idle'
    : lastPunchEvent.comboLocked
      ? 'punch-feedback-neutral'
      : lastPunchEvent.matched
        ? 'punch-feedback-good'
        : 'punch-feedback-bad';

  return (
    <section className="panel-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">Combo Drill</p>
        <span className={`status-pill ${isRunning ? 'status-pill-live' : 'status-pill-idle'}`}>
          {isRunning ? 'Tracking' : 'Idle'}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-white">Current Combo</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-300">
        Progress {progressCount}/{currentCombo.length || 0}
      </p>

      <div className="mt-4 space-y-2">
        {currentCombo.length > 0 ? (
          currentCombo.map((move, index) => (
            <div
              key={`${move}-${index}`}
              className={`combo-chip ${
                index < comboStepIndex
                  ? 'combo-chip-complete'
                  : index === comboStepIndex
                    ? 'combo-chip-current'
                    : ''
              } ${
                isFailureHighlight && index === lastPunchEvent.expectedIndex ? 'combo-chip-missed' : ''
              }`}
            >
              <span className="combo-step">{String(index + 1).padStart(2, '0')}</span>
              <span className="font-semibold text-slate-50">{formatPunch(move)}</span>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-white/15 bg-slate-950/55 px-3 py-4 text-sm text-slate-300">
            Waiting to start. Hit <span className="font-semibold text-white">Start Round</span>.
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="combo-score combo-score-success">
          <p className="text-[0.64rem] uppercase tracking-[0.14em] text-emerald-200/85">Succeeded</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-100">{comboStats.succeeded}</p>
        </div>
        <div className="combo-score combo-score-failed">
          <p className="text-[0.64rem] uppercase tracking-[0.14em] text-rose-200/90">Failed</p>
          <p className="mt-1 text-2xl font-semibold text-rose-100">{comboStats.failed}</p>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border px-3 py-3 ${feedbackTone}`}>
        <p className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-300">Punch Feedback</p>
        {lastPunchEvent ? (
          <div key={lastPunchEvent.id} className="punch-feedback-pop mt-1 flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-white">{formatPunch(lastPunchEvent.punch)} registered</p>
            <p className="text-right text-xs font-medium text-slate-200">
              {lastPunchEvent.comboLocked
                ? 'Loading next combo'
                : lastPunchEvent.matched
                  ? 'Correct'
                  : `Expected ${formatPunch(lastPunchEvent.expected)}`}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-300">Throw a punch to see live registration.</p>
        )}
      </div>
    </section>
  );
}

export default ComboDisplay;
