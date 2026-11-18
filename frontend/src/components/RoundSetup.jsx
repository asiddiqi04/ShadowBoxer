import { speedProfiles } from '../training/speedProfiles'
import {
  MAX_ROUND_SECONDS,
  MIN_ROUND_SECONDS,
  ROUND_LENGTH_STEP,
  clampRoundLength,
  formatRoundLength,
} from '../training/roundLength'

const presets = [60, 120, 180, 300, 600]

function RoundLength({ value, onChange }) {
  const step = (delta) => onChange(clampRoundLength(value + delta))
  const stepButton =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-white/15 bg-white/[0.04] text-xl font-bold text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <div className="mt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <label
          htmlFor="round-length"
          className="text-sm font-semibold text-white"
        >
          Round length
        </label>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {presets.map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => onChange(seconds)}
              aria-pressed={value === seconds}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                value === seconds
                  ? 'border-orange-400 bg-orange-500/20 text-orange-100'
                  : 'border-white/15 text-slate-300 hover:border-white/35 hover:text-white'
              }`}
            >
              {seconds / 60} min
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Shorter round"
          className={stepButton}
          disabled={value <= MIN_ROUND_SECONDS}
          onClick={() => step(-ROUND_LENGTH_STEP)}
        >
          −
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p
            aria-live="polite"
            className="display-title text-center text-4xl leading-none tabular-nums text-white"
          >
            {formatRoundLength(value)}
          </p>
          <input
            id="round-length"
            type="range"
            min={MIN_ROUND_SECONDS}
            max={MAX_ROUND_SECONDS}
            step={ROUND_LENGTH_STEP}
            value={value}
            aria-valuetext={formatRoundLength(value)}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full cursor-pointer accent-orange-500"
          />
        </div>
        <button
          type="button"
          aria-label="Longer round"
          className={stepButton}
          disabled={value >= MAX_ROUND_SECONDS}
          onClick={() => step(ROUND_LENGTH_STEP)}
        >
          +
        </button>
      </div>
    </div>
  )
}

const paces = [
  {
    value: 'form',
    label: 'Form',
    blurb: 'Slow and deliberate. Clean technique.',
  },
  { value: 'casual', label: 'Casual', blurb: 'Steady rhythm. A good default.' },
  {
    value: 'intense',
    label: 'Intense',
    blurb: 'Fast hands. Rapid-fire combos.',
  },
]

const comboGap = (speed) =>
  `${speedProfiles[speed].comboDelayMs / 1000} s between combos`

function SummaryStat({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2 text-center">
      <p className={`display-title text-3xl leading-none ${tone}`}>{value}</p>
      <p className="mt-1 text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
    </div>
  )
}

// Shown before a round (and after one ends); hidden while the round is live.
function RoundSetup({
  selectedSpeed,
  onSpeedChange,
  roundSeconds,
  onRoundSecondsChange,
  onStart,
  canStart,
  lastRound,
}) {
  const totalPunches = lastRound
    ? Object.values(lastRound.punchCounts).reduce((a, b) => a + b, 0)
    : 0
  const combos = lastRound?.comboStats
  const successRate = combos?.total
    ? `${Math.round((combos.succeeded / combos.total) * 100)}%`
    : '—'

  return (
    <div className="panel-card w-full max-w-xl p-5 sm:p-6">
      {lastRound && (
        <div className="mb-5 border-b border-white/10 pb-5">
          <h3 className="display-title text-3xl text-orange-50">
            Nice work. Round finished
          </h3>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <SummaryStat label="Punches" value={totalPunches} />
            <SummaryStat
              label="Landed"
              value={combos.succeeded}
              tone="text-emerald-300"
            />
            <SummaryStat
              label="Missed"
              value={combos.failed}
              tone="text-rose-300"
            />
            <SummaryStat label="Success" value={successRate} />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            {[
              ['jab', 'Jabs'],
              ['cross', 'Crosses'],
              ['hook', 'Hooks'],
              ['uppercut', 'Uppercuts'],
            ]
              .map(([key, label]) => `${label} ${lastRound.punchCounts[key]}`)
              .join(' · ')}
          </p>
        </div>
      )}

      <h3 className="text-xs uppercase tracking-[0.22em] text-cyan-100/85">
        Round setup
      </h3>
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold text-white">
          Choose your pace
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {paces.map((pace) => (
            <label key={pace.value} className="group cursor-pointer">
              <input
                type="radio"
                name="round-speed"
                value={pace.value}
                checked={selectedSpeed === pace.value}
                onChange={() => onSpeedChange(pace.value)}
                className="peer sr-only"
              />
              <span className="relative flex h-full flex-col rounded-2xl border-2 border-white/12 bg-white/[0.04] p-4 transition group-hover:border-white/35 group-hover:bg-white/[0.08] peer-checked:border-orange-400 peer-checked:bg-orange-500/15 peer-checked:shadow-[0_0_0_4px_rgba(249,115,22,0.15)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-200">
                <span className="display-title text-2xl tracking-[0.06em] text-white">
                  {pace.label}
                </span>
                <span className="mt-1 text-xs text-slate-300">
                  {pace.blurb}
                </span>
                <span className="mt-3 text-[0.65rem] uppercase tracking-[0.12em] text-slate-400">
                  {comboGap(pace.value)}
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full text-[0.7rem] font-bold ${
                    selectedSpeed === pace.value
                      ? 'bg-orange-500 text-white'
                      : 'border border-white/25'
                  }`}
                >
                  {selectedSpeed === pace.value ? '✓' : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <RoundLength value={roundSeconds} onChange={onRoundSecondsChange} />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          Stand about 2 m back, upper body in frame · Orthodox stance
        </p>
        <button
          disabled={!canStart}
          onClick={onStart}
          className="action-btn action-btn-primary px-8 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start Round
        </button>
      </div>
      {!canStart && (
        <p role="status" className="mt-2 text-right text-xs text-amber-200">
          Waiting for the camera and pose model…
        </p>
      )}
    </div>
  )
}

export default RoundSetup
