import { useCallback, useEffect, useState } from 'react'
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient'

const redirectTo = () => `${window.location.origin}${window.location.pathname}`

export function useAuth() {
  const [client, setClient] = useState(null)
  const [user, setUser] = useState(null)
  // Guests are known immediately; configured builds wait for the stored session.
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    let subscription
    getSupabase()
      .then(async (supabase) => {
        if (cancelled) return
        setClient(supabase)
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!cancelled) setUser(session?.user ?? null)
        })
        subscription = data.subscription
        const { data: sessionData } = await supabase.auth.getSession()
        if (!cancelled) setUser(sessionData.session?.user ?? null)
        // Strip the one-time auth code from the address bar after sign-in.
        if (new URLSearchParams(window.location.search).has('code'))
          window.history.replaceState(null, '', redirectTo())
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'Account service unavailable. You can keep training as a guest.',
          )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  const signInWithEmail = useCallback(
    async (email) => {
      if (!client) throw new Error('Accounts are unavailable right now.')
      const { error: authError } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo() },
      })
      if (authError) throw new Error(authError.message)
    },
    [client],
  )

  const signInWithGoogle = useCallback(async () => {
    if (!client) throw new Error('Accounts are unavailable right now.')
    const { error: authError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo() },
    })
    if (authError) throw new Error(authError.message)
  }, [client])

  const signOut = useCallback(async () => {
    if (!client) return
    await client.auth.signOut()
  }, [client])

  return {
    available: isSupabaseConfigured && !error,
    client,
    user,
    loading,
    error,
    signInWithEmail,
    signInWithGoogle,
    signOut,
  }
}
