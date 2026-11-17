import { useCallback, useEffect, useState } from 'react'
import { listSessions as listLocalSessions } from '../lib/sessionStorage'

const flagKey = (userId) => `shadowboxer-import-${userId}`
const readFlag = (userId) => {
  try {
    return localStorage.getItem(flagKey(userId))
  } catch {
    return null
  }
}
const writeFlag = (userId, value) => {
  try {
    localStorage.setItem(flagKey(userId), value)
  } catch {
    /* Without storage the offer may reappear next visit; imports stay idempotent. */
  }
}

// After sign-in, offer once per account to copy this browser's guest workouts.
export function useGuestImport({ userId, cloudStorage, onImported }) {
  const [state, setState] = useState({ status: 'idle', sessions: [] })

  useEffect(() => {
    if (!userId || !cloudStorage || readFlag(userId)) return
    let cancelled = false
    listLocalSessions()
      .then((sessions) => {
        if (!cancelled && sessions.length)
          setState({ status: 'offer', sessions, userId })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      setState({ status: 'idle', sessions: [] })
    }
  }, [userId, cloudStorage])

  const accept = useCallback(async () => {
    if (state.status !== 'offer' && state.status !== 'error') return
    setState((current) => ({ ...current, status: 'importing' }))
    try {
      await cloudStorage.saveSessions(state.sessions)
      writeFlag(state.userId, 'imported')
      setState((current) => ({ ...current, status: 'done' }))
      onImported?.()
    } catch {
      setState((current) => ({ ...current, status: 'error' }))
    }
  }, [state, cloudStorage, onImported])

  // "Not now" hides the offer for this visit only; it returns on the next load.
  const dismiss = useCallback(() => {
    setState({ status: 'idle', sessions: [] })
  }, [])

  return { ...state, count: state.sessions.length, accept, dismiss }
}
