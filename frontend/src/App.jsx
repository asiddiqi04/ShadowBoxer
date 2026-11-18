import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PoseDetector from './components/LazyPoseDetector'
import TrainingHud from './components/TrainingHud'
import Countdown from './components/Countdown'
import RoundSetup from './components/RoundSetup'
import HistoryScreen from './components/HistoryScreen'
import HomeScreen from './components/HomeScreen'
import SettingsDialog from './components/SettingsDialog'
import ImportPrompt from './components/ImportPrompt'
import * as browserHistory from './lib/sessionStorage'
import { createCloudSessionStorage } from './lib/cloudSessionStorage'
import { loadSettings, saveSettings } from './lib/settings'
import { summarizeWorkouts } from './lib/workoutStats'
import { createTrainingService } from './training/trainingService'
import { DEFAULT_ROUND_SECONDS } from './training/roundLength'
import { createCompletionQueue } from './lib/completionQueue'
import { usePunchSound } from './hooks/usePunchSound'
import { hasMusicTrack, useRoundMusic } from './hooks/useRoundMusic'
import { useAuth } from './hooks/useAuth'
import { useGuestImport } from './hooks/useGuestImport'
import { preloadTraining, preloadTrainingWhenIdle } from './lib/preloadTraining'

const COUNTDOWN_SECONDS = 5

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
  const {
    unlock: unlockPunchSound,
    play: playPunchSound,
    cue: playCue,
  } = usePunchSound({
    enabled: settings.soundEffects,
    volume: settings.soundEffectsVolume,
  })
  const [engine] = useState(() =>
    createTrainingService({ includeDebug: import.meta.env.DEV }),
  )
  const [trainingState, setTrainingState] = useState(() => engine.getState())
  const [selectedSpeed, setSelectedSpeed] = useState('casual')
  const [roundSeconds, setRoundSeconds] = useState(DEFAULT_ROUND_SECONDS)
  // Countdown before starting or resuming: { endsAt, action, speed, seconds }, else null.
  const [countdown, setCountdown] = useState(null)
  const [countdownLeft, setCountdownLeft] = useState(COUNTDOWN_SECONDS)
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
      if (!document.hidden) return
      setCountdown(null)
      run(engine.pauseRound)
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
      if (ready) return
      setCountdown(null)
      if (engine.getState().round.isRunning) run(engine.pauseRound)
    },
    [engine, run],
  )
  const handleRoundStart = () => {
    if (trackingReady && !document.hidden) {
      unlockPunchSound()
      unlockMusic()
      setCountdownLeft(COUNTDOWN_SECONDS)
      setCountdown({
        endsAt: performance.now() + COUNTDOWN_SECONDS * 1000,
        action: 'start',
        speed: selectedSpeed,
        seconds: roundSeconds,
      })
    }
  }
  const cancelCountdown = () => setCountdown(null)
  useEffect(() => {
    if (!countdown) return
    let shown = null
    // Returns true once the round has started.
    const tick = () => {
      const left = Math.ceil((countdown.endsAt - performance.now()) / 1000)
      if (left <= 0) {
        setCountdown(null)
        playCue('go')
        run(() =>
          countdown.action === 'resume'
            ? engine.resumeRound()
            : engine.startRound(countdown.speed, countdown.seconds),
        )
        return true
      }
      if (left !== shown) {
        shown = left
        setCountdownLeft(left)
        if (left <= 3) playCue('tick')
      }
      return false
    }
    if (tick()) return
    const timer = setInterval(() => {
      if (tick()) clearInterval(timer)
    }, 100)
    return () => clearInterval(timer)
  }, [countdown, engine, run, playCue])
  const handleRoundResume = () => {
    if (trackingReady && !document.hidden) {
      unlockPunchSound()
      unlockMusic()
      setCountdownLeft(COUNTDOWN_SECONDS)
      setCountdown({
        endsAt: performance.now() + COUNTDOWN_SECONDS * 1000,
        action: 'resume',
      })
    }
  }
  const openSettings = () => {
    setCountdown(null)
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
    setCountdown(null)
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
  const onMenu = view === 'home' || view === 'history'
  // Download the training code and pose models while the menu is open; the
  // camera is still only requested once PoseDetector mounts.
  useEffect(() => {
    if (onMenu) return preloadTrainingWhenIdle()
  }, [onMenu])
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
    : isRunning || countdown
      ? 'status-pill-live'
      : 'status-pill-idle'

  const headerStatusText = trainingError
    ? 'Training Issue'
    : countdown
      ? 'Get Ready'
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

  const historyLabel = signedIn
    ? 'Synced to your account'
    : 'Saved in this browser'
  const retryHistory = () => {
    void queue.retry()
    void loadSavedSessions()
  }

  if (onMenu)
    return (
      <div className="app-shell">
        <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {view === 'home' ? (
            <HomeScreen
              onStart={() => setView('train')}
              onPrepare={preloadTraining}
              onOpenSettings={openSettings}
              onOpenHistory={() => setView('history')}
              stats={stats}
              historyLabel={historyLabel}
              auth={auth}
              importPrompt={<ImportPrompt guestImport={guestImport} />}
            />
          ) : (
            <HistoryScreen
              sessions={savedSessions}
              stats={stats}
              historyLabel={historyLabel}
              error={historyError}
              onRetry={retryHistory}
              onBack={() => setView('home')}
            />
          )}
        </main>
        {settingsDialog}
      </div>
    )

  const roundActive = roundStatus === 'running' || roundStatus === 'paused'
  const saveToneClass = {
    error: 'bg-rose-400',
    saving: 'bg-amber-300',
    ready: 'bg-emerald-400',
  }[sessionStatus.tone]

  return (
    <div className="app-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8 stage:h-[100svh] stage:min-h-0 stage:overflow-hidden stage:p-0">
        <header className="mx-auto mb-4 flex w-full max-w-[calc((100svh-12rem)*4/3)] items-center justify-between gap-3 stage:fixed stage:inset-x-0 stage:top-0 stage:z-30 stage:mb-0 stage:max-w-none stage:bg-gradient-to-b stage:from-black/75 stage:to-transparent stage:px-3 stage:pb-8 stage:pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <button
              className="action-btn action-btn-ghost"
              onClick={exitTraining}
            >
              ← Menu
            </button>
            <h1 className="display-title hidden text-2xl tracking-[0.12em] text-orange-50 sm:block stage:hidden">
              Shadow<span className="text-orange-400">Boxer</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-pill ${headerStatusClass} stage:hidden`}>
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
          <div className="mb-4 rounded-xl border border-rose-300/35 bg-rose-950/35 px-4 py-3 text-sm text-rose-100 stage:fixed stage:inset-x-3 stage:top-16 stage:z-30">
            Training issue: {trainingError}
          </div>
        )}

        <PoseDetector
          onReadyChange={handleTrackingReady}
          getGeneration={engine.getGeneration}
          debugRows={trainingState.debugRows}
          isRunning={isRunning}
          previewing={Boolean(countdown)}
          onPoseFrame={handlePoseFrame}
          frameIntervalMs={trainingState.round.frameIntervalMs}
          roundSpeed={trainingState.round.speed}
          hud={
            countdown ? (
              <Countdown secondsLeft={countdownLeft} />
            ) : (
              roundActive && <TrainingHud trainingState={trainingState} />
            )
          }
          panel={
            !roundActive &&
            !countdown && (
              <div
                className={`absolute inset-0 z-10 flex overflow-y-auto rounded-3xl bg-slate-950/60 p-4 backdrop-blur-sm sm:p-6 stage:rounded-none stage:px-3 stage:pb-24 ${
                  // Phones: leave room for the camera/model loading status above the setup card.
                  trackingReady
                    ? 'stage:pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.75rem))]'
                    : 'stage:pt-[max(9rem,calc(env(safe-area-inset-top)+8.25rem))]'
                }`}
              >
                <div className="m-auto w-full max-w-xl">
                  <RoundSetup
                    selectedSpeed={selectedSpeed}
                    onSpeedChange={setSelectedSpeed}
                    roundSeconds={roundSeconds}
                    onRoundSecondsChange={setRoundSeconds}
                    onStart={handleRoundStart}
                    canStart={trackingReady}
                    lastRound={
                      roundStatus === 'ended'
                        ? {
                            punchCounts: trainingState.punchCounts,
                            comboStats: trainingState.comboStats,
                          }
                        : null
                    }
                  />
                </div>
              </div>
            )
          }
        />

        <div className="mx-auto mt-4 flex w-full max-w-[calc((100svh-12rem)*4/3)] flex-wrap items-center justify-between gap-3 stage:fixed stage:inset-x-0 stage:bottom-0 stage:z-30 stage:mt-0 stage:max-w-none stage:flex-col-reverse stage:flex-nowrap stage:items-stretch stage:gap-2 stage:bg-gradient-to-t stage:from-black/80 stage:to-transparent stage:px-3 stage:pt-10 stage:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="flex min-w-0 items-center gap-2 text-xs text-slate-300 stage:justify-center stage:text-[0.7rem]">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${saveToneClass ?? 'bg-slate-400'}`}
            />
            <span>{sessionStatus.message}</span>
            <span className="text-slate-500">
              {savedSessions.length === 1
                ? '1 round saved'
                : `${savedSessions.length} rounds saved`}
            </span>
            {(failed || historyError) && (
              <button
                className="action-btn action-btn-secondary ml-1"
                onClick={retryHistory}
              >
                Retry storage
              </button>
            )}
          </p>
          {countdown && (
            <div className="flex flex-wrap gap-2 stage:mx-auto stage:grid stage:w-full stage:max-w-lg stage:[&>button]:py-3 stage:[&>button]:text-sm">
              <button
                onClick={cancelCountdown}
                className="action-btn action-btn-ghost px-6"
              >
                Cancel
              </button>
            </div>
          )}
          {roundActive && !countdown && (
            <div className="flex flex-wrap gap-2 stage:mx-auto stage:grid stage:w-full stage:max-w-lg stage:grid-cols-3 stage:[&>button]:py-3 stage:[&>button]:text-sm">
              {roundStatus === 'paused' ? (
                <button
                  disabled={!trackingReady}
                  onClick={handleRoundResume}
                  className="action-btn action-btn-primary px-6 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={handleRoundPause}
                  className="action-btn action-btn-warning px-6"
                >
                  Pause
                </button>
              )}
              <button
                onClick={handleRoundEnd}
                className="action-btn action-btn-secondary"
              >
                End
              </button>
              <button
                onClick={handleRoundReset}
                className="action-btn action-btn-ghost"
              >
                Reset
              </button>
            </div>
          )}
        </div>
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
