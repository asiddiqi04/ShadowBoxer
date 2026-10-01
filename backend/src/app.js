import cors from 'cors'
import express from 'express'
import {
  createSession,
  getDatabasePath,
  getSessionById,
  listSessions,
  validateSessionPayload,
} from './sessionStore.js'
import { trainingService, TrainingError } from './training/trainingService.js'
import { validatePoseFramePayload } from './training/validators.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    databasePath: getDatabasePath(),
  })
})

app.get('/api/training/state', (_req, res) => {
  res.json({ state: trainingService.getState() })
})

app.post('/api/training/start', (req, res) => {
  try {
    res.json({ state: trainingService.startRound(req.body?.speed) })
  } catch (error) {
    if (error instanceof TrainingError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }
    throw error
  }
})

app.post('/api/training/pause', (_req, res) => {
  res.json({ state: trainingService.pauseRound() })
})

app.post('/api/training/resume', (_req, res) => {
  res.json({ state: trainingService.resumeRound() })
})

app.post('/api/training/reset', (_req, res) => {
  res.json({ state: trainingService.resetRound() })
})

app.post('/api/training/end', (_req, res) => {
  const result = trainingService.endRound()
  res.json(result)
})

app.post('/api/training/frame', (req, res) => {
  const validated = validatePoseFramePayload(req.body)

  if (!validated.ok) {
    res.status(400).json({ error: validated.message })
    return
  }

  try {
    const result = trainingService.submitFrame(validated.value)
    res.json(result)
  } catch (error) {
    if (error instanceof TrainingError) {
      res.status(error.statusCode).json({ error: error.message })
      return
    }

    throw error
  }
})

app.get('/api/sessions', (_req, res) => {
  res.json({ sessions: listSessions() })
})

app.get('/api/sessions/:id', (req, res) => {
  const session = getSessionById(req.params.id)
  if (!session) {
    res.status(404).json({ error: 'Session not found.' })
    return
  }

  res.json({ session })
})

app.post('/api/sessions', (req, res) => {
  const validated = validateSessionPayload(req.body)

  if (!validated.ok) {
    res.status(400).json({ error: validated.message })
    return
  }

  const session = createSession(validated.value)
  res.status(201).json({ session })
})

export default app
