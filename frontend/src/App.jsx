import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Timer from './components/Timer'
import ComboDisplay from './components/ComboDisplay'
import PoseDetector from './components/PoseDetector'
import SessionHistory from './components/SessionHistory'
import HomeScreen from './components/HomeScreen'
import SettingsDialog from './components/SettingsDialog'
import ImportPrompt from './components/ImportPrompt'
import * as browserHistory from './lib/sessionStorage'
import { createCloudSessionStorage } from './lib/cloudSessionStorage'
import { loadSettings, saveSettings } from './lib/settings'
import { summarizeWorkouts } from './lib/workoutStats'
import { createTrainingService } from './training/trainingService'
import { createCompletionQueue } from './lib/completionQueue'
import { usePunchSound } from './hooks/usePunchSound'
import { hasMusicTrack, useRoundMusic } from './hooks/useRoundMusic'
import { useAuth } from './hooks/useAuth'
import { useGuestImport } from './hooks/useGuestImport'

function App() {
  const [settings, setSettings] = useState(loadSettings)
  const updateSettings = useCallback((next) => {
    setSettings(next)
    saveSettings(next)
  }, [])
  const [view, setView] = useState('home')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const auth = useAuth()
  const userId = auth.user?.id ?? null
  const cloudStorage = useMemo(
    () =>
      userId && auth.client ? createCloudSessionStorage(auth.client) : null,
    [userId, auth.client],
  )
  // Signed-in workouts go to Supabase; guests keep IndexedDB. Null while auth resolves.
  const storage = auth.loading ? null : (cloudStorage ?? browserHistory)
  const storageRef = useRef(null)
  const signedIn = Boolean(cloudStorage)
  const { unlock: unlockPunchSound, play: playPunchSound } = usePunchSound({
    enabled: settings.soundEffects,
    volume: settings.soundEffectsVolume,
  })
  const [engine] = useState(() =>
    createTrainingService({ includeDebug: import.meta.env.DEV }),
  )
  const [trainingState, setTrainingState] = useState(() => engine.getState())
  const [selectedSpeed, setSelectedSpeed] = useState('casual')
  const [trainingError, setTrainingError] = useState('')
  const [trackingReady, setTrackingReady] = useState(false)
  const [showRoundToast, setShowRoundToast] = useState(false)
  const [savedSessions, setSavedSessions] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [completions, setCompletions] = useState([])
  const mounted = useRef(false)
  const historyRequest = useRef(0)
  const historyChannel = useRef(null)
  const [queue] = useState(() =>
    createCompletionQueue(
      async (session) => {
        const target = storageRef.current
        if (!target) throw new Error('Workout storage is still loading.')
        return target.saveSession(session)
      },
      (entries) => {
        if (mounted.current) setCompletions(entries)
      },
    ),
  )
  const isRunning = trainingState.round.isRunning
  const roundStatus = trainingState.round.status
  const { unlock: unlockMusic } = useRoundMusic({
    enabled: hasMusicTrack && settings.music,
    volume: settings.musicVolume,
    roundStatus,
  })
  const loadSavedSessions = useCallback(async () => {
    const target = storageRef.current
    if (!target) return
    const request = ++historyRequest.current
    try {
      const sessions = await target.listSessions()
      if (mounted.current && request === historyRequest.current) {
        setSavedSessions(sessions)
        setHistoryError('')
      }
    } catch {
      if (mounted.current && request === historyRequest.current)
        setHistoryError(
          target === browserHistory
            ? 'History unavailable. Enable browser storage and retry. Training remains available.'
            : 'Account history unavailable. Check your connection and retry. Training remains available.',
        )
    }
  }, [])
  useEffect(() => {
    storageRef.current = storage
    setSavedSessions([])
    setHistoryError('')
    void loadSavedSessions()
  }, [storage, loadSavedSessions])
  const guestImport = useGuestImport({
    userId,
    cloudStorage,
    onImported: loadSavedSessions,
  })
  const applyTrainingState = useCallback(
    (state) => {
      setTrainingState(state)
      for (const session of engine.takeCompletions()) queue.add(session)
      queue.add(state.session.completedSession)
    },
    [queue, engine],
  )
  const run = useCallback(
    (action) => {
      try {
        const result = action()
        applyTrainingState(result.state ?? result)
        setTrainingError('')
      } catch {
        setTrainingError('Unable to update the round. Reset and try again.')
      }
    },
    [applyTrainingState],
  )
  useEffect(() => {
    mounted.current = true
    const channel =
      typeof BroadcastChannel === 'function'
        ? new BroadcastChannel('shadowboxer-history')
        : null
    historyChannel.current = channel
    if (channel)
      channel.onmessage = () => {
        void loadSavedSessions()
      }
    const onFocus = () => {
      void loadSavedSessions()
    }
    const onHidden = () => {
      if (document.hidden) run(engine.pauseRound)
    }
    const onLeave = (event) => {
      const status = engine.getState().round.status
      // Expiry may happen between the last UI tick and navigation.
      for (const session of engine.takeCompletions()) queue.add(session)
      if (status === 'running' || status === 'paused' || queue.hasUnsaved()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('beforeunload', onLeave)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      mounted.current = false
      channel?.close()
      historyChannel.current = null
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('beforeunload', onLeave)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [engine, queue, run, loadSavedSessions])
  useEffect(() => {
    if (!isRunning) return
    // Publish at 10Hz, independently of inference; countdown derives from elapsed time.
    const timer = setInterval(() => applyTrainingState(engine.getState()), 100)
    return () => clearInterval(timer)
  }, [engine, isRunning, applyTrainingState])
  const savedCount = completions.filter(
    (entry) => entry.status === 'saved',
  ).length
  useEffect(() => {
    if (!savedCount) return
    setShowRoundToast(true)
    historyChannel.current?.postMessage('saved')
    void loadSavedSessions()
    const timer = setTimeout(() => setShowRoundToast(false), 2800)
    return () => clearTimeout(timer)
  }, [savedCount, loadSavedSessions])
  const handleTrackingReady = useCallback(
    (ready) => {
      setTrackingReady(ready)
      if (!ready && engine.getState().round.isRunning) run(engine.pauseRound)
    },
    [engine, run],
  )
  const handleRoundStart = () => {
    if (trackingReady && !document.hidden) {
      unlockPunchSound()
      unlockMusic()
      run(() => engine.startRound(selectedSpeed))
    }
  }
  const handleRoundResume = () => {
    if (trackingReady && !document.hidden) {
      unlockPunchSound()
      unlockMusic()
      run(engine.resumeRound)
    }
  }
  const openSettings = () => {
    if (engine.getState().round.isRunning) run(engine.pauseRound)
    setSettingsOpen(true)
  }
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const exitTraining = () => {
    if (
      ['running', 'paused'].includes(roundStatus) &&
      !window.confirm(
        'Leave training and discard this unfinished round? Completed workouts stay saved.',
      )
    )
      return
    if (roundStatus !== 'ready') run(engine.resetRound)
    // Unmounting the detector stops the camera; it is requested again on return.
    setTrackingReady(false)
    setView('home')
  }
  const handleRoundPause = () => run(engine.pauseRound)
  const handleRoundEnd = () => run(engine.endRound)
  const handleRoundReset = () => {
    if (
      ['running', 'paused'].includes(roundStatus) &&
      !window.confirm(
        'Discard this unfinished round? Completed workouts stay saved. Refreshing also discards unfinished progress.',
      )
    )
      return
    run(engine.resetRound)
  }
  const handlePoseFrame = useCallback(
    (frame, generation) => {
      const result = engine.submitFrame(frame, generation)
      if (result.accepted && result.punchEvent)
        playPunchSound(result.punchEvent)
      return result
    },
    [engine, playPunchSound],
  )
  const stats = useMemo(() => summarizeWorkouts(savedSessions), [savedSessions])
  const where = signedIn ? 'to your account' : 'in this browser'
  const failed = completions.filter((entry) => entry.status === 'error').length
  const saving = completions.some((entry) => entry.status === 'saving')
  const sessionStatus = failed
    ? {
        tone: 'error',
        message: `${failed} completed workout(s) not saved. Kept in memory; retry before leaving.`,
      }
    : saving
      ? { tone: 'saving', message: `Saving workout ${where}…` }
      : historyError
        ? { tone: 'error', message: historyError }
        : {
            tone: 'ready',
            message: savedCount
              ? `Workout saved ${where}.`
              : `Finish a round to save it ${where}.`,
          }

  const headerStatusClass = trainingError
    ? 'status-pill-error'
    : isRunning
      ? 'status-pill-live'
      : 'status-pill-idle'

  const headerStatusText = trainingError
    ? 'Training Issue'
    : isRunning
      ? 'Round Live'
      : roundStatus === 'paused'
        ? 'Round Paused'
        : roundStatus === 'ended'
          ? 'Round Complete'
          : 'Round Ready'

  const settingsDialog = settingsOpen && (
    <SettingsDialog
      settings={settings}
      onChange={updateSettings}
      onClose={closeSettings}
      hasMusic={hasMusicTrack}
      auth={auth}
    />
  )

  if (view === 'home')
    return (
      <div className="app-shell">
        <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <HomeScreen
            onStart={() => setView('train')}
            onOpenSettings={openSettings}
            stats={stats}
            historyLabel={
              signedIn ? 'Synced to your account' : 'Saved in this browser'
            }
            auth={auth}
            importPrompt={<ImportPrompt guestImport={guestImport} />}
          />
        </main>
        {settingsDialog}
      </div>
    )

  return (
    <div className="app-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="panel-card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <button
              className="action-btn action-btn-ghost"
              onClick={exitTraining}
            >
              ← Menu
            </button>
            <h1 className="display-title text-3xl text-orange-50 sm:text-4xl">
              ShadowBoxer
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`status-pill ${headerStatusClass}`}>
              {headerStatusText}
            </span>
            <button
              className="action-btn action-btn-ghost"
              onClick={openSettings}
            >
              Settings
            </button>
          </div>
        </header>

        {trainingError && (
          <div className="mb-6 rounded-xl border border-rose-300/35 bg-rose-950/35 px-4 py-3 text-sm text-rose-100">
            Training issue: {trainingError}
          </div>
        )}

        <div className="grid flex-1 gap-6 xl:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className="flex flex-col gap-6">
            <Timer
              round={trainingState.round}
              canStart={trackingReady}
              selectedSpeed={selectedSpeed}
              onSpeedChange={setSelectedSpeed}
              onRoundEnd={handleRoundEnd}
              onRoundPause={handleRoundPause}
              onRoundReset={handleRoundReset}
              onRoundResume={handleRoundResume}
              onRoundStart={handleRoundStart}
            />
            <ComboDisplay
              isRunning={isRunning}
              currentCombo={trainingState.currentCombo}
              comboStepIndex={trainingState.comboStepIndex}
              comboStats={trainingState.comboStats}
              comboResult={trainingState.comboResult}
              lastPunchEvent={trainingState.lastPunchEvent}
            />
            <SessionHistory
              sessions={savedSessions}
              signedIn={signedIn}
              statusMessage={sessionStatus.message}
              statusTone={sessionStatus.tone}
              onRetry={
                failed || historyError
                  ? () => {
                      void queue.retry()
                      void loadSavedSessions()
                    }
                  : null
              }
            />
          </aside>

          <section className="min-w-0">
            <PoseDetector
              onReadyChange={handleTrackingReady}
              getGeneration={engine.getGeneration}
              debugRows={trainingState.debugRows}
              isRunning={isRunning}
              lastPunchEvent={trainingState.lastPunchEvent}
              onPoseFrame={handlePoseFrame}
              frameIntervalMs={trainingState.round.frameIntervalMs}
              roundSpeed={trainingState.round.speed}
              punchCounts={trainingState.punchCounts}
            />
          </section>
        </div>

        <footer className="mt-6 text-center text-xs uppercase tracking-[0.16em] text-slate-400 sm:mt-8">
          Keep your guard up, reset your stance, and throw clean shots.
        </footer>
      </main>

      {showRoundToast && (
        <div className="pointer-events-none fixed right-4 top-4 z-50 rounded-xl border border-emerald-300/40 bg-emerald-950/80 px-4 py-3 text-sm font-medium text-emerald-100 shadow-[0_12px_28px_rgba(16,185,129,0.35)] backdrop-blur-md">
          Round complete and saved {where}.
        </div>
      )}
      {settingsDialog}
    </div>
  )
}

export default App
