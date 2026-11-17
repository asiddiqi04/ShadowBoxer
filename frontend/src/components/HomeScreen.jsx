import { useState } from 'react'

const steps = [
  {
    title: 'Set up your space',
    body: 'Stand 1.5–2 m back with head, shoulders, and hips in frame.',
  },
  {
    title: 'Pick a pace',
    body: 'Form, Casual, or Intense. Every round runs three minutes.',
  },
  {
    title: 'Throw the call',
    body: 'Follow the combo prompts in orthodox stance as punches register live.',
  },
]

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function Stat({ label, value }) {
  return (
    <div className="px-1 py-2 sm:px-5">
      <p className="display-title text-4xl leading-none text-white sm:text-5xl">
        {value}
      </p>
      <p className="mt-2 text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
    </div>
  )
}

function GuestSync({ auth, onOpenSettings }) {
  const [error, setError] = useState('')
  if (!auth.available || auth.loading || auth.user) return null
  const google = async () => {
    setError('')
    try {
      await auth.signInWithGoogle()
    } catch (signInError) {
      setError(signInError.message)
    }
  }
  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-300">
        Keep your rounds safe.{' '}
        <span className="text-slate-400">
          Sign in to sync your history across devices.
        </span>
        {error && (
          <span role="status" className="mt-1 block text-xs text-rose-200">
            {error}
          </span>
        )}
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          className="action-btn action-btn-secondary"
          onClick={() => void google()}
        >
          Continue with Google
        </button>
        <button
          className="action-btn action-btn-ghost"
          onClick={onOpenSettings}
        >
          Use email
        </button>
      </div>
    </div>
  )
}

function HomeScreen({
  onStart,
  onOpenSettings,
  stats,
  historyLabel,
  auth,
  importPrompt,
}) {
  const email = auth.user?.email
  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex items-center justify-between gap-4">
        <span className="display-title text-2xl tracking-[0.12em] text-orange-50">
          Shadow<span className="text-orange-400">Boxer</span>
        </span>
        <div className="flex items-center gap-2">
          {email && (
            <span
              className="hidden items-center gap-2 rounded-full border border-white/12 bg-slate-950/50 py-1 pl-1 pr-3 text-xs text-slate-200 sm:inline-flex"
              title={email}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-rose-500 text-[0.7rem] font-bold uppercase text-white">
                {email[0]}
              </span>
              <span className="max-w-[12rem] truncate">{email}</span>
            </span>
          )}
          <button
            className="action-btn action-btn-ghost inline-flex items-center gap-2"
            onClick={onOpenSettings}
          >
            <GearIcon />
            Settings
          </button>
        </div>
      </nav>

      <section className="py-14 text-center sm:py-20 lg:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/85">
            Realtime striking lab
          </p>
          <h1 className="display-title mt-4 text-6xl leading-[0.9] text-orange-50 sm:text-7xl lg:text-8xl">
            Your webcam is
            <br />
            <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-rose-400 bg-clip-text text-transparent">
              your corner coach
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-slate-300 sm:text-lg">
            Throw combos, get instant feedback on every jab, cross, hook, and
            uppercut, and build rhythm round after round.
          </p>
          <button
            className="action-btn action-btn-primary mt-8 px-8 py-4 text-base"
            onClick={onStart}
          >
            Start training
          </button>
        </div>
      </section>

      {importPrompt}

      <section className="panel-card mt-2 p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs uppercase tracking-[0.22em] text-cyan-100/85">
            Your progress
          </h2>
          <span className="text-xs text-slate-400">{historyLabel}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-white/10">
          <Stat label="Rounds" value={stats.rounds} />
          <Stat label="This week" value={stats.roundsThisWeek} />
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
        {!stats.rounds && (
          <p className="mt-4 text-sm text-slate-400">
            Finish your first round to start tracking progress.
          </p>
        )}
        <GuestSync auth={auth} onOpenSettings={onOpenSettings} />
      </section>

      <section className="mt-12 pb-4">
        <h2 className="text-xs uppercase tracking-[0.22em] text-cyan-100/85">
          How it works
        </h2>
        <ol className="mt-5 grid gap-6 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="border-t border-white/12 pt-4">
              <span className="display-title text-2xl text-orange-400">
                0{index + 1}
              </span>
              <p className="mt-1 text-sm font-semibold text-white">
                {step.title}
              </p>
              <p className="mt-1.5 text-sm text-slate-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

export default HomeScreen
