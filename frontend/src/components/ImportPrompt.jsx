function ImportPrompt({ guestImport }) {
  const { status, count, accept, dismiss } = guestImport
  if (status === 'idle') return null

  if (status === 'done')
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300/35 bg-emerald-950/30 px-5 py-4 text-sm text-emerald-100">
        <span>
          Imported {count} workout{count === 1 ? '' : 's'} to your account.
        </span>
        <button className="action-btn action-btn-ghost" onClick={dismiss}>
          Close
        </button>
      </div>
    )

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-cyan-300/35 bg-cyan-950/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-cyan-50">
        <p className="font-semibold">
          Import {count} workout{count === 1 ? '' : 's'} from this browser?
        </p>
        <p className="mt-1 text-xs text-cyan-100/80">
          {status === 'error'
            ? 'Import failed. Check your connection and try again.'
            : 'Guest history from this browser gets added to your account. A copy also stays here.'}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          className="action-btn action-btn-secondary disabled:opacity-50"
          disabled={status === 'importing'}
          onClick={() => void accept()}
        >
          {status === 'importing'
            ? 'Importing…'
            : status === 'error'
              ? 'Retry import'
              : 'Import'}
        </button>
        <button
          className="action-btn action-btn-ghost"
          disabled={status === 'importing'}
          onClick={dismiss}
        >
          Not now
        </button>
      </div>
    </section>
  )
}

export default ImportPrompt
