// Retains immutable completions across subsequent rounds; retries keep the same ID.
export const createCompletionQueue = (save, onChange = () => {}) => {
  const entries = new Map()
  const notify = () =>
    onChange(
      [...entries.values()].map(({ session, status }) => ({ session, status })),
    )
  const attempt = async (entry) => {
    if (entry.status === 'saving' || entry.status === 'saved') return
    entry.status = 'saving'
    notify()
    try {
      await save(entry.session)
      entry.status = 'saved'
    } catch {
      entry.status = 'error'
    }
    notify()
  }
  return {
    add(session) {
      if (!session || entries.has(session.id)) return
      const entry = { session, status: 'pending' }
      entries.set(session.id, entry)
      void attempt(entry)
    },
    retry() {
      return Promise.all(
        [...entries.values()]
          .filter((entry) => entry.status === 'error')
          .map(attempt),
      )
    },
    hasUnsaved: () =>
      [...entries.values()].some((entry) => entry.status !== 'saved'),
  }
}
