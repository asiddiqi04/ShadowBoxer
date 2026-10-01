export const ROUND_SECONDS = 180;

const speeds = [
  { value: 'form', label: 'Form rounds', pace: 'Slow' },
  { value: 'casual', label: 'Casual', pace: 'Medium' },
  { value: 'intense', label: 'Intense', pace: 'Fast' },
];

const formatTime = (seconds) => {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
};

function Timer({
  round,
  disabled = false,
  selectedSpeed = 'casual',
  onSpeedChange,
  onRoundEnd,
  onRoundPause,
  onRoundReset,
  onRoundResume,
  onRoundStart,
}) {
  const status = round?.status ?? 'ready';
  const isRunning = round?.isRunning ?? false;
  const durationSeconds = round?.durationSeconds ?? ROUND_SECONDS;
  const timeLeft = round?.timeLeftSeconds ?? durationSeconds;
  const hasStarted = Boolean(round?.startedAt) && status !== 'ready';
  const progressPercent = Math.max(0, Math.min(100, (timeLeft / durationSeconds) * 100));
  const statusText = isRunning
    ? 'Live'
    : status === 'paused'
      ? 'Paused'
      : status === 'ended'
        ? 'Done'
        : 'Ready';

  return (
    <section className="panel-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">Round Clock</p>
        <span className={`status-pill ${isRunning ? 'status-pill-live' : 'status-pill-idle'}`}>
          {statusText}
        </span>
      </div>

      <h2 className="display-title mt-4 text-[3.45rem] leading-none text-white sm:text-[4rem]">
        {formatTime(timeLeft)}
      </h2>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-700/60">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isRunning
              ? 'bg-gradient-to-r from-orange-400 via-amber-300 to-rose-500'
              : 'bg-gradient-to-r from-cyan-400 to-blue-500'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {(status === 'ready' || status === 'ended' || !hasStarted) ? (
        <fieldset disabled={disabled} className="mt-5">
          <legend className="text-xs uppercase tracking-[0.15em] text-cyan-100/85">Round speed</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {speeds.map((speed) => (
              <label key={speed.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="round-speed"
                  value={speed.value}
                  checked={selectedSpeed === speed.value}
                  onChange={() => onSpeedChange?.(speed.value)}
                  className="peer sr-only"
                />
                <span className="flex h-full flex-col rounded-lg border border-white/15 bg-white/5 px-2 py-3 text-center text-xs text-slate-200 peer-checked:border-cyan-300 peer-checked:bg-cyan-900/50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-200 peer-disabled:opacity-50">
                  <span className="font-semibold">{speed.label}</span>
                  <span className="mt-1 text-slate-300">{speed.pace}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">Choose your pace before starting the round.</p>
        </fieldset>
      ) : (
        <p className="mt-4 text-sm text-cyan-100">
          {speeds.find((speed) => speed.value === round.speed)?.label ?? 'Casual'} pace
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {(status === 'ready' || status === 'ended' || !hasStarted) && (
          <button
            disabled={disabled}
            onClick={onRoundStart}
            className="action-btn action-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Round
          </button>
        )}

        {status === 'paused' && (
          <button
            disabled={disabled}
            onClick={onRoundResume}
            className="action-btn action-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Resume
          </button>
        )}

        {isRunning && (
          <button
            disabled={disabled}
            onClick={onRoundPause}
            className="action-btn action-btn-warning disabled:cursor-not-allowed disabled:opacity-50"
          >
            Pause
          </button>
        )}

        {hasStarted && status !== 'ended' && (
          <button
            disabled={disabled}
            onClick={onRoundEnd}
            className="action-btn action-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            End
          </button>
        )}

        {hasStarted && (
          <button
            disabled={disabled}
            onClick={onRoundReset}
            className="action-btn action-btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        )}
      </div>
    </section>
  );
}

export default Timer;
