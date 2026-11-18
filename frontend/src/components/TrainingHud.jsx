const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

const formatPunch = (punch) =>
  punch ? punch.charAt(0).toUpperCase() + punch.slice(1) : ''

// Everything a boxer needs mid-round, drawn over the video and readable from a distance.
function TrainingHud({ trainingState }) {
  const {
    round,
    currentCombo,
    comboStepIndex,
    comboStats,
    comboResult,
    lastPunchEvent,
    punchCounts,
  } = trainingState
  const timeLeft = round.timeLeftSeconds ?? round.durationSeconds
  const progress = Math.max(
    0,
    Math.min(100, (timeLeft / round.durationSeconds) * 100),
  )
  const totalPunches = Object.values(punchCounts).reduce((a, b) => a + b, 0)
  const missedIndex =
    comboResult === 'failed' &&
    lastPunchEvent &&
    !lastPunchEvent.comboLocked &&
    !lastPunchEvent.matched
      ? lastPunchEvent.expectedIndex
      : null
  const feedback = !lastPunchEvent
    ? null
    : lastPunchEvent.comboLocked
      ? { tone: 'text-cyan-100', text: 'Next combo coming…' }
      : lastPunchEvent.matched
        ? {
            tone: 'text-emerald-300',
            text: `${formatPunch(lastPunchEvent.punch)} ✓`,
          }
        : {
            tone: 'text-rose-300',
            text: `${formatPunch(lastPunchEvent.punch)}: expected ${formatPunch(lastPunchEvent.expected)}`,
          }

  return (
    <>
      <div className="absolute left-3 top-3 rounded-2xl bg-slate-950/70 px-3 py-2 backdrop-blur-md sm:left-4 sm:top-4 sm:px-4 stage:top-[max(4.25rem,calc(env(safe-area-inset-top)+3.75rem))]">
        <h2 className="display-title text-4xl leading-none tabular-nums text-white sm:text-5xl">
          {formatTime(timeLeft)}
        </h2>
        <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-white/15 sm:w-28">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-rose-500 transition-[width] duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="absolute right-3 top-3 flex gap-3 rounded-2xl bg-slate-950/70 px-3 py-2 text-center backdrop-blur-md sm:right-4 sm:top-4 sm:px-4 stage:top-[max(4.25rem,calc(env(safe-area-inset-top)+3.75rem))]">
        <div>
          <p className="display-title text-2xl leading-none sm:text-3xl text-white">
            {totalPunches}
          </p>
          <p className="text-[0.55rem] uppercase tracking-[0.14em] text-slate-300 sm:text-[0.6rem]">
            Punches
          </p>
        </div>
        <div className="w-px bg-white/15" />
        <div>
          <p className="display-title text-2xl leading-none sm:text-3xl text-emerald-300">
            {comboStats.succeeded}
          </p>
          <p className="text-[0.55rem] uppercase tracking-[0.14em] text-slate-300 sm:text-[0.6rem]">
            Landed
          </p>
        </div>
        <div>
          <p className="display-title text-2xl leading-none sm:text-3xl text-rose-300">
            {comboStats.failed}
          </p>
          <p className="text-[0.55rem] uppercase tracking-[0.14em] text-slate-300 sm:text-[0.6rem]">
            Missed
          </p>
        </div>
      </div>

      <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 sm:inset-x-4 sm:bottom-4 stage:bottom-[max(8.5rem,calc(env(safe-area-inset-bottom)+8rem))]">
        {feedback && (
          <p
            key={lastPunchEvent.id}
            className={`punch-feedback-pop rounded-full bg-slate-950/75 px-4 py-1 text-base font-semibold sm:text-sm backdrop-blur-md ${feedback.tone}`}
          >
            {feedback.text}
          </p>
        )}
        <div className="flex max-w-full flex-wrap justify-center gap-2 rounded-2xl bg-slate-950/70 p-2 backdrop-blur-md">
          {currentCombo.map((move, index) => {
            const state =
              index === missedIndex
                ? 'border-rose-400 bg-rose-900/70 text-rose-50'
                : index < comboStepIndex
                  ? 'border-emerald-400/60 bg-emerald-900/50 text-emerald-100'
                  : index === comboStepIndex
                    ? 'scale-105 border-amber-300 bg-amber-500/25 text-white shadow-[0_0_24px_rgba(251,191,36,0.35)]'
                    : 'border-white/15 bg-white/5 text-slate-300'
            return (
              <span
                key={`${move}-${index}`}
                className={`display-title rounded-xl border-2 px-3 py-1 text-4xl tracking-[0.06em] transition sm:px-5 ${state}`}
              >
                {formatPunch(move)}
              </span>
            )
          })}
        </div>
      </div>

      {round.status === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55">
          <p className="display-title rounded-2xl bg-black/60 px-8 py-4 text-5xl text-orange-50 backdrop-blur-md">
            Paused
          </p>
        </div>
      )}
    </>
  )
}

export default TrainingHud
