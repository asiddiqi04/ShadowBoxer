const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const buildApiUrl = (path) => `${apiBaseUrl}${path}`

const request = async (path, options = {}) => {
  const response = await fetch(buildApiUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(body.error ?? 'Request failed.')
  }

  return body
}

export const listSessions = async () => {
  const body = await request('/api/sessions')
  return body.sessions ?? []
}

export const createSession = async (payload) => {
  const body = await request('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  return body.session
}

export const getTrainingState = async () => {
  const body = await request('/api/training/state')
  return body.state
}

export const startTrainingRound = async (speed = 'casual') => {
  const body = await request('/api/training/start', { method: 'POST', body: JSON.stringify({ speed }) })
  return body.state
}

export const pauseTrainingRound = async () => {
  const body = await request('/api/training/pause', { method: 'POST' })
  return body.state
}

export const resumeTrainingRound = async () => {
  const body = await request('/api/training/resume', { method: 'POST' })
  return body.state
}

export const resetTrainingRound = async () => {
  const body = await request('/api/training/reset', { method: 'POST' })
  return body.state
}

export const endTrainingRound = async () => {
  return request('/api/training/end', { method: 'POST' })
}

export const submitTrainingFrame = async (payload) => {
  return request('/api/training/frame', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
