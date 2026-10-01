import { useCallback, useEffect, useRef, useState } from 'react';
import Timer from './components/Timer';
import ComboDisplay from './components/ComboDisplay';
import PoseDetector from './components/PoseDetector';
import SessionHistory from './components/SessionHistory';
import {
  endTrainingRound,
  getTrainingState,
  listSessions,
  pauseTrainingRound,
  resetTrainingRound,
  resumeTrainingRound,
  startTrainingRound,
  submitTrainingFrame,
} from './lib/api';

const createDefaultTrainingState = () => ({
  round: {
    status: 'loading',
    speed: 'casual',
    frameIntervalMs: 50,
    isRunning: false,
    startedAt: null,
    endedAt: null,
    durationSeconds: 180,
    elapsedSeconds: 0,
    timeLeftSeconds: 180,
  },
  currentCombo: [],
  comboStepIndex: 0,
  comboStats: { succeeded: 0, failed: 0, total: 0 },
  comboResult: 'idle',
  lastPunchEvent: null,
  punchCounts: { jab: 0, cross: 0, hook: 0, uppercut: 0 },
  debugRows: [],
  session: { lastSavedSession: null },
});

const getSessionReadyMessage = (count) =>
  count > 0
    ? `Loaded ${count} saved session${count === 1 ? '' : 's'} from local storage.`
    : 'SQLite is ready. Finish a round to store your first session.';

function App() {
  const [trainingState, setTrainingState] = useState(createDefaultTrainingState);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [selectedSpeed, setSelectedSpeed] = useState('casual');
  const [trainingError, setTrainingError] = useState('');
  const [showRoundToast, setShowRoundToast] = useState(false);
  const [savedSessions, setSavedSessions] = useState([]);
  const [sessionStatus, setSessionStatus] = useState({
    tone: 'loading',
    message: 'Loading saved sessions from local storage...',
  });
  const lastSavedSessionIdRef = useRef(null);

  const isRunning = trainingState.round.isRunning;
  const roundStatus = trainingState.round.status;

  const syncSessionStatus = (tone, message) => {
    setSessionStatus({ tone, message });
  };

  const loadSavedSessions = useCallback(async () => {
    syncSessionStatus('loading', 'Loading saved sessions from local SQLite...');
    try {
      const sessions = await listSessions();
      setSavedSessions(sessions);
      syncSessionStatus('ready', getSessionReadyMessage(sessions.length));
    } catch (error) {
      syncSessionStatus('error', error.message || 'Unable to load saved sessions.');
    }
  }, []);

  const applyTrainingState = useCallback(
    (nextState) => {
      if (!nextState) return;

      setTrainingState(nextState);
      setTrainingError('');

      const savedSession = nextState.session?.lastSavedSession;
      if (savedSession?.id && savedSession.id !== lastSavedSessionIdRef.current) {
        lastSavedSessionIdRef.current = savedSession.id;
        setShowRoundToast(true);
        void loadSavedSessions();
      }
    },
    [loadSavedSessions]
  );

  const handleTrainingError = useCallback((error) => {
    setTrainingError(error.message || 'Training API request failed.');
  }, []);

  const loadTrainingState = useCallback(async () => {
    try {
      const state = await getTrainingState();
      applyTrainingState(state);
    } catch (error) {
      handleTrainingError(error);
    }
  }, [applyTrainingState, handleTrainingError]);

  useEffect(() => {
    void loadSavedSessions();
    void loadTrainingState();
  }, [loadSavedSessions, loadTrainingState]);

  useEffect(() => {
    if (!isRunning) return undefined;

    const interval = setInterval(() => {
      void loadTrainingState();
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, loadTrainingState]);

  const runTrainingAction = useCallback(
    async (action) => {
      setTrainingBusy(true);
      try {
        const result = await action();
        applyTrainingState(result?.state ?? result);
        if (result?.session && result.session.id !== lastSavedSessionIdRef.current) {
          lastSavedSessionIdRef.current = result.session.id;
          setShowRoundToast(true);
          void loadSavedSessions();
        }
        return result;
      } catch (error) {
        handleTrainingError(error);
        return null;
      } finally {
        setTrainingBusy(false);
      }
    },
    [applyTrainingState, handleTrainingError, loadSavedSessions]
  );

  const handleRoundStart = useCallback(() => {
    setShowRoundToast(false);
    void runTrainingAction(() => startTrainingRound(selectedSpeed));
  }, [runTrainingAction, selectedSpeed]);

  const handleRoundPause = useCallback(() => {
    void runTrainingAction(pauseTrainingRound);
  }, [runTrainingAction]);

  const handleRoundResume = useCallback(() => {
    void runTrainingAction(resumeTrainingRound);
  }, [runTrainingAction]);

  const handleRoundReset = useCallback(() => {
    setShowRoundToast(false);
    void runTrainingAction(resetTrainingRound);
    syncSessionStatus('ready', getSessionReadyMessage(savedSessions.length));
  }, [runTrainingAction, savedSessions.length]);

  const handleRoundEnd = useCallback(() => {
    void runTrainingAction(endTrainingRound);
  }, [runTrainingAction]);

  const handlePoseFrame = useCallback(
    async (frame) => {
      if (!isRunning) return null;

      try {
        const result = await submitTrainingFrame(frame);
        applyTrainingState(result.state);
        return result;
      } catch (error) {
        handleTrainingError(error);
        throw error;
      }
    },
    [applyTrainingState, handleTrainingError, isRunning]
  );

  useEffect(() => {
    if (!showRoundToast) return undefined;
    const timeout = setTimeout(() => setShowRoundToast(false), 2800);
    return () => clearTimeout(timeout);
  }, [showRoundToast]);

  const headerStatusClass = trainingError
    ? 'status-pill-error'
    : isRunning
      ? 'status-pill-live'
      : 'status-pill-idle';

  const headerStatusText = trainingError
    ? 'API Issue'
    : isRunning
      ? 'Round Live'
      : roundStatus === 'paused'
        ? 'Round Paused'
        : roundStatus === 'ended'
          ? 'Round Complete'
          : 'Round Ready';

  return (
    <div className="app-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="panel-card mb-6 p-6 sm:mb-8 sm:p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/85">
            Realtime Striking Lab
          </p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="display-title text-5xl text-orange-50 sm:text-6xl lg:text-7xl">
                Boxing Practice Arena
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-200/85 sm:text-base">
                Build rhythm, timing, and precision with live punch detection and rotating combo calls.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start lg:self-auto">
              <span className={`status-pill ${headerStatusClass}`}>{headerStatusText}</span>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-300">
                Backend Training API
              </span>
            </div>
          </div>
        </header>

        {trainingError && (
          <div className="mb-6 rounded-xl border border-rose-300/35 bg-rose-950/35 px-4 py-3 text-sm text-rose-100">
            Training API unavailable: {trainingError}
          </div>
        )}

        <div className="grid flex-1 gap-6 xl:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className="flex flex-col gap-6">
            <Timer
              round={trainingState.round}
              disabled={trainingBusy || roundStatus === 'loading'}
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
              statusMessage={sessionStatus.message}
              statusTone={sessionStatus.tone}
            />
          </aside>

          <section className="min-w-0">
            <PoseDetector
              apiError={trainingError}
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
          Round complete. Catch your breath and run it back.
        </div>
      )}
    </div>
  );
}

export default App;
