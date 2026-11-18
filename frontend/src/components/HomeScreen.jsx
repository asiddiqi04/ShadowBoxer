import { useState } from 'react'
import LoadingBar from './LoadingBar'
import { usePreloadProgress } from '../hooks/usePreloadProgress'

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

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-4 w-4">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}

function GoogleSignIn({ auth }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!auth.available || auth.loading || auth.user) return null
  const signIn = async () => {
    setError('')
    setBusy(true)
    try {
      await auth.signInWithGoogle()
    } catch (signInError) {
      setError(signInError.message)
      setBusy(false)
    }
  }
  return (
    <div className="relative">
      <button
        className="inline-flex items-center gap-2 rounded-[0.72rem] bg-white px-3.5 py-[0.58rem] text-[0.82rem] font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
        disabled={busy}
        onClick={() => void signIn()}
      >
        <GoogleIcon />
        <span className="hidden sm:inline">Sign in with Google</span>
        <span className="sm:hidden">Sign in</span>
      </button>
      {error && (
        <p
          role="status"
          className="absolute right-0 top-full mt-2 w-64 rounded-lg bg-rose-950/90 px-3 py-2 text-xs text-rose-100"
        >
          {error}
        </p>
      )}
    </div>
  )
}

// Phones: show the training download so it's worth waiting a moment before starting.
function TrainingPreload() {
  const { phase, percent } = usePreloadProgress()
  if (phase === 'skipped' || phase === 'error') return null
  const done = phase === 'done'
  return (
    <div className="mt-6 w-full max-w-xs sm:hidden">
      <LoadingBar
        label={done ? 'Ready to train' : 'Preparing training'}
        percent={done ? 100 : percent}
      />
    </div>
  )
}

function HomeScreen({
  onStart,
  onPrepare,
  onOpenSettings,
  onOpenHistory,
  stats,
  historyLabel,
  auth,
  importPrompt,
}) {
  const email = auth.user?.email
  return (
    <div className="flex flex-1 flex-col">
      <nav className="flex items-center justify-end gap-2">
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
        <GoogleSignIn auth={auth} />
        <button
          className="action-btn action-btn-ghost inline-flex items-center gap-2"
          onClick={onOpenSettings}
        >
          <GearIcon />
          Settings
        </button>
      </nav>

      <section className="flex flex-col items-center py-16 text-center sm:py-24">
        <h1 className="display-title text-6xl leading-none tracking-[0.06em] text-orange-50 sm:text-8xl lg:text-9xl">
          Shadow<span className="text-orange-400">Boxer</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-slate-300 sm:text-lg">
          Shadowbox in front of your webcam and see every punch counted.
        </p>
        <button
          className="action-btn action-btn-primary mt-8 px-10 py-4 text-base"
          onClick={onStart}
          onPointerEnter={onPrepare}
          onPointerDown={onPrepare}
          onFocus={onPrepare}
        >
          Start training
        </button>
        <TrainingPreload />
      </section>

      {importPrompt}

      <section className="panel-card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Your progress
          </h2>
          <button
            className="text-xs font-semibold text-slate-300 transition hover:text-white"
            onClick={onOpenHistory}
            title={historyLabel}
          >
            View history →
          </button>
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
      </section>
    </div>
  )
}

export default HomeScreen
