import { useState } from 'react'

function AccountPanel({ auth, compact = false }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState({ tone: 'idle', message: '' })

  if (!auth.available) {
    if (compact) return null
    return (
      <p className="text-sm text-slate-400">
        {auth.error ||
          'Accounts are not enabled on this build. Workouts are saved in this browser.'}
      </p>
    )
  }

  if (auth.loading)
    return <p className="text-sm text-slate-400">Checking your account…</p>

  if (auth.user)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/85">
            Signed in
          </p>
          <p className="truncate text-sm font-semibold text-white">
            {auth.user.email}
          </p>
        </div>
        <button
          className="action-btn action-btn-ghost"
          onClick={() => void auth.signOut()}
        >
          Sign out
        </button>
      </div>
    )

  const submit = async (event) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    setStatus({ tone: 'sending', message: 'Sending sign-in link…' })
    try {
      await auth.signInWithEmail(address)
      setStatus({
        tone: 'sent',
        message: `Check ${address} for a sign-in link. Open it in this browser.`,
      })
    } catch (error) {
      setStatus({ tone: 'error', message: error.message })
    }
  }

  const google = async () => {
    setStatus({ tone: 'sending', message: 'Opening Google…' })
    try {
      await auth.signInWithGoogle()
    } catch (error) {
      setStatus({ tone: 'error', message: error.message })
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-300">
        Optional. Sign in to keep your workout history across devices and track
        progress over time. Camera video never leaves your device either way.
      </p>
      <button
        type="button"
        className="action-btn action-btn-ghost mt-4 w-full"
        disabled={status.tone === 'sending'}
        onClick={() => void google()}
      >
        Continue with Google
      </button>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <label className="sr-only" htmlFor="account-email">
          Email address
        </label>
        <input
          id="account-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none"
        />
        <button
          type="submit"
          className="action-btn action-btn-secondary disabled:opacity-50"
          disabled={status.tone === 'sending'}
        >
          Email me a link
        </button>
      </form>
      {status.message && (
        <p
          role="status"
          className={`mt-2 text-xs ${status.tone === 'error' ? 'text-rose-200' : 'text-cyan-100'}`}
        >
          {status.message}
        </p>
      )}
    </div>
  )
}

export default AccountPanel
