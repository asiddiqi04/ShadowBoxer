import { speedProfiles } from '../training/speedProfiles'
import { punchTypes } from '../training/punchClassifier'
import {
  MAX_COMBO_LENGTH,
  MIN_COMBO_LENGTH,
  STANCES,
} from '../training/roundConfig'
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

const punchLabels = {
  jab: 'Jab',
  cross: 'Cross',
  hook: 'Hook',
  uppercut: 'Uppercut',
}

const stanceBlurbs = {
  orthodox: 'Left hand leads. Left = jab, right = cross.',
  southpaw: 'Right hand leads. Right = jab, left = cross.',
}

const lengthOptions = Array.from(
  { length: MAX_COMBO_LENGTH - MIN_COMBO_LENGTH + 1 },
  (_, i) => MIN_COMBO_LENGTH + i,
)

const chip = (active) =>
  `cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-200 ${
    active
      ? 'border-orange-400 bg-orange-500/20 text-orange-100'
      : 'border-white/15 text-slate-300 hover:border-white/35 hover:text-white'
  }`

function Stance({ value, onChange }) {
  return (
    <div className="mt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span id="stance-label" className="text-sm font-semibold text-white">
          Stance
        </span>
        <div
          role="radiogroup"
          aria-labelledby="stance-label"
          className="flex gap-1.5"
        >
          {STANCES.map((stance) => (
            <label key={stance}>
              <input
                type="radio"
                name="stance"
                value={stance}
                checked={value === stance}
                onChange={() => onChange(stance)}
                className="peer sr-only"
              />
              <span className={chip(value === stance)}>
                {stance === 'southpaw' ? 'Southpaw' : 'Orthodox'}
              </span>
            </label>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">{stanceBlurbs[value]}</p>
    </div>
  )
}

function AdvancedSettings({ prefs, onChange }) {
  const { punchSet, comboLength } = prefs
  const togglePunch = (type) => {
    const next = punchSet.includes(type)
      ? punchSet.filter((punch) => punch !== type)
      : punchTypes.filter((punch) => punch === type || punchSet.includes(punch))
    // At least one punch must stay selected.
    if (next.length > 0) onChange({ ...prefs, punchSet: next })
  }
  const setLength = (key, raw) => {
    const value = Number(raw)
    const next = { ...comboLength, [key]: value }
    // Keep min <= max by dragging the other end along.
    if (key === 'min' && next.max < value) next.max = value
    if (key === 'max' && next.min > value) next.min = value
    onChange({ ...prefs, comboLength: next })
  }
  const select =
    'rounded-lg border border-white/20 bg-slate-900 px-2 py-1.5 text-sm text-white'

  return (
    <details className="group mt-5 rounded-2xl border border-white/10 bg-white/[0.03] open:bg-white/[0.05]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
        <span>Advanced settings</span>
        <span className="flex items-center gap-2 text-xs font-normal text-slate-400">
          <span className="group-open:hidden">
            {punchSet.length === punchTypes.length
              ? 'All punches'
              : `${punchSet.length} of ${punchTypes.length} punches`}{' '}
            ·{' '}
            {comboLength.min === comboLength.max
              ? comboLength.min
              : `${comboLength.min}-${comboLength.max}`}{' '}
            per combo
          </span>
          <span
            aria-hidden="true"
            className="text-base leading-none transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </span>
      </summary>
      <div className="space-y-5 px-4 pb-4">
        <fieldset>
          <legend className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Punches to practise
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {punchTypes.map((type) => {
              const checked = punchSet.includes(type)
              return (
                <label key={type}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePunch(type)}
                    className="peer sr-only"
                  />
                  <span className={chip(checked)}>{punchLabels[type]}</span>
                </label>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {punchSet.length === 1
              ? 'Single-punch drill. Pick more for combos.'
              : 'At least one punch must stay selected.'}
          </p>
        </fieldset>

        <fieldset>
          <legend className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Combo length
          </legend>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-300">
            <select
              aria-label="Shortest combo"
              value={comboLength.min}
              onChange={(event) => setLength('min', event.target.value)}
              className={select}
            >
              {lengthOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>to</span>
            <select
              aria-label="Longest combo"
              value={comboLength.max}
              onChange={(event) => setLength('max', event.target.value)}
              className={select}
            >
              {lengthOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>punches</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Default (2-3, all punches) uses the classic combo set.
          </p>
        </fieldset>
      </div>
    </details>
  )
}

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
  trainingPrefs,
  onTrainingPrefsChange,
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
    <div className="panel-card w-full max-w-xl p-4 sm:p-6">
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
        <div className="mt-3 grid grid-cols-3 gap-2">
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
              <span className="relative flex h-full flex-col rounded-2xl border-2 border-white/12 bg-white/[0.04] p-3 transition sm:p-4 group-hover:border-white/35 group-hover:bg-white/[0.08] peer-checked:border-orange-400 peer-checked:bg-orange-500/15 peer-checked:shadow-[0_0_0_4px_rgba(249,115,22,0.15)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-200">
                <span className="display-title text-xl tracking-[0.06em] text-white sm:text-2xl">
                  {pace.label}
                </span>
                <span className="mt-1 hidden text-xs text-slate-300 sm:block short:hidden">
                  {pace.blurb}
                </span>
                <span className="mt-1 text-[0.6rem] uppercase tracking-[0.1em] text-slate-400 sm:mt-3 sm:text-[0.65rem] sm:tracking-[0.12em]">
                  {comboGap(pace.value)}
                </span>
                <span
                  aria-hidden="true"
                  className={`absolute right-2 top-2 flex h-5 w-5 sm:right-3 sm:top-3 items-center justify-center rounded-full text-[0.7rem] font-bold ${
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

      <Stance
        value={trainingPrefs.stance}
        onChange={(stance) =>
          onTrainingPrefsChange({ ...trainingPrefs, stance })
        }
      />

      <AdvancedSettings
        prefs={trainingPrefs}
        onChange={onTrainingPrefsChange}
      />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          Stand about 2 m back, upper body in frame
        </p>
        <button
          disabled={!canStart}
          onClick={onStart}
          className="action-btn action-btn-primary shrink-0 whitespace-nowrap px-8 py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
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
