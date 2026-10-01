import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs';
import '@mediapipe/pose';
import PoseRecording from './PoseRecording';
import { poseModelConfig } from '../lib/poseModelConfig';

const videoConstraints = {
  width: 640,
  height: 480,
  facingMode: 'user',
};

const punchLabels = [
  { key: 'jab', label: 'Jab' },
  { key: 'cross', label: 'Cross' },
  { key: 'hook', label: 'Hook' },
  { key: 'uppercut', label: 'Uppercut' },
];

const defaultPunchCounts = {
  jab: 0,
  cross: 0,
  hook: 0,
  uppercut: 0,
};

const getPoint = (keypoints, name, minScore = 0.5) =>
  keypoints?.find((pt) => pt.name === name && (pt.score ?? 1) >= minScore);

const drawPose = (keypoints, ctx, width, height) => {
  ctx.clearRect(0, 0, width, height);
  if (!keypoints) return;

  // Mirror canvas so it matches the user's view.
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-width, 0);

  const connections = [
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'],
    ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'],
    ['right_elbow', 'right_wrist'],
    ['left_hip', 'right_hip'],
    ['left_shoulder', 'left_hip'],
    ['right_shoulder', 'right_hip'],
  ];

  connections.forEach(([from, to]) => {
    const a = getPoint(keypoints, from, 0.4);
    const b = getPoint(keypoints, to, 0.4);
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  keypoints.forEach((kp) => {
    if ((kp.score ?? 1) < 0.4) return;
    ctx.beginPath();
    ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = 'lime';
    ctx.fill();
  });

  ctx.restore();
};

const formatPunchName = (type) =>
  type ? type.charAt(0).toUpperCase() + type.slice(1) : 'None';

const toFrameKeypoint = (kp) => ({
  name: kp.name,
  x: kp.x,
  y: kp.y,
  z: kp.z,
  score: kp.score,
});

function PoseDetector({
  apiError = '',
  debugRows = [],
  frameIntervalMs = 50,
  roundSpeed = 'casual',
  isRunning,
  lastPunchEvent,
  onPoseFrame,
  punchCounts = defaultPunchCounts,
}) {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const lastSubmittedFrameRef = useRef(0);
  const frameRequestInFlightRef = useRef(false);
  const runningRef = useRef(isRunning);
  const frameIntervalRef = useRef(frameIntervalMs);
  const onPoseFrameRef = useRef(onPoseFrame);
  const captureRef = useRef(null);
  const roundSpeedRef = useRef(roundSpeed);
  const [isRecording, setIsRecording] = useState(false);
  const [modelStatus, setModelStatus] = useState('Loading model...');
  const [modelError, setModelError] = useState('');
  const [modelAttempt, setModelAttempt] = useState(0);
  const [showDebugOverlay, setShowDebugOverlay] = useState(true);
  const [recentPunchLabel, setRecentPunchLabel] = useState('');

  useEffect(() => {
    onPoseFrameRef.current = onPoseFrame;
  }, [onPoseFrame]);

  useEffect(() => {
    runningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    frameIntervalRef.current = frameIntervalMs;
  }, [frameIntervalMs]);

  useEffect(() => {
    roundSpeedRef.current = roundSpeed;
  }, [roundSpeed]);

  useEffect(() => {
    if (!lastPunchEvent?.punch) return undefined;

    setRecentPunchLabel(`${lastPunchEvent.punch} detected`);
    const timeout = setTimeout(() => setRecentPunchLabel(''), 900);
    return () => clearTimeout(timeout);
  }, [lastPunchEvent?.id, lastPunchEvent?.punch]);

  useEffect(() => {
    let cancelled = false;
    let ownedDetector = null;

    const setupDetector = async () => {
      try {
        setModelStatus('Loading model...');
        setModelError('');
        const supported = await tf.setBackend('webgl');
        if (!supported) throw new Error('WebGL could not start. Enable graphics acceleration in your browser and retry.');
        await tf.ready();
        if (cancelled) return;
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.BlazePose,
          poseModelConfig
        );
        if (cancelled) {
          detector.dispose();
          return;
        }
        ownedDetector = detector;
        detectorRef.current = detector;
        setModelStatus('Ready');
        detectLoop();
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setModelError(err.message || 'Unable to load the pose model.');
        setModelStatus('Error loading model');
      }
    };

    const submitFrame = async (keypoints, keypoints3D, frameTime, recordedFrame) => {
      if (!runningRef.current || !onPoseFrameRef.current) return;
      if (frameRequestInFlightRef.current) return;
      if (frameTime - lastSubmittedFrameRef.current < frameIntervalRef.current) return;

      lastSubmittedFrameRef.current = frameTime;
      frameRequestInFlightRef.current = true;
      if (recordedFrame) recordedFrame.submittedToClassifier = true;

      try {
        await onPoseFrameRef.current({
          time: frameTime,
          keypoints: keypoints.map(toFrameKeypoint),
          keypoints3D: keypoints3D?.map(toFrameKeypoint),
        });
      } catch {
        // App already displays the API error; keep the capture loop alive.
      } finally {
        frameRequestInFlightRef.current = false;
      }
    };

    const detectLoop = async () => {
      if (cancelled) return;
      if (!webcamRef.current || !detectorRef.current) {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      const video = webcamRef.current.video;
      if (video && video.readyState === 4) {
        const frameTime = performance.now();
        const mediaTime = video.currentTime;
        const capture = captureRef.current;
        let poses;
        try {
          poses = await ownedDetector.estimatePoses(video, { flipHorizontal: false });
        } catch (err) {
          if (!cancelled) {
            console.error(err);
            setModelError(err.message || 'Pose tracking stopped.');
            setModelStatus('Error running model');
          }
          return;
        }
        if (cancelled) return;
        if (poses.length > 0) {
          const keypoints2D = poses[0].keypoints;
          const keypoints3D = poses[0].keypoints3D;
          const keypoints = keypoints2D.map((kp, idx) => ({
            ...kp,
            z: keypoints3D?.[idx]?.z ?? kp.z,
          }));

          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            drawPose(keypoints, ctx, canvas.width, canvas.height);
          }

          const recordedFrame = capture?.capture({
            time: frameTime, mediaTime, keypoints, keypoints3D,
            speed: roundSpeedRef.current, roundRunning: runningRef.current,
          });
          void submitFrame(keypoints, keypoints3D, frameTime, recordedFrame);
        } else {
          capture?.capture({
            time: frameTime, mediaTime, keypoints: [], keypoints3D: [],
            speed: roundSpeedRef.current, roundRunning: runningRef.current,
          });
        }
      }

      rafRef.current = requestAnimationFrame(detectLoop);
    };

    setupDetector();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (detectorRef.current === ownedDetector) detectorRef.current = null;
      ownedDetector?.dispose();
    };
  }, [modelAttempt]);

  const counts = { ...defaultPunchCounts, ...punchCounts };
  const totalPunches = counts.jab + counts.cross + counts.hook + counts.uppercut;
  const status = modelStatus !== 'Ready'
    ? modelStatus
    : apiError
      ? 'API disconnected'
      : !isRunning
        ? 'Paused'
        : recentPunchLabel || 'Running';
  const loweredStatus = status.toLowerCase();
  const statusStyle = loweredStatus.includes('error') || loweredStatus.includes('disconnected')
    ? 'status-pill-error'
    : isRunning
      ? 'status-pill-live'
      : 'status-pill-idle';

  return (
    <section className="panel-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">Live Tracking Feed</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Pose Detector</h2>
          <p className="mt-1 text-xs text-slate-300">Orthodox stance: left jab · right cross</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-pill ${statusStyle}`}>{status}</span>
          <span className="metric-chip">Total: {totalPunches}</span>
          <button
            type="button"
            onClick={() => setShowDebugOverlay((prev) => !prev)}
            className="rounded-md border border-cyan-300/35 bg-cyan-950/35 px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-900/45"
          >
            Debug {showDebugOverlay ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {modelError && (
        <div role="alert" className="border-b border-rose-300/25 bg-rose-950/35 px-4 py-3 sm:px-6">
          <p className="text-sm text-rose-100">Pose tracking is unavailable.</p>
          <p className="mt-1 break-words text-xs text-rose-200">{modelError}</p>
          <button type="button" onClick={() => setModelAttempt((attempt) => attempt + 1)} className="action-btn action-btn-secondary mt-3">Retry model</button>
        </div>
      )}

      <PoseRecording webcamRef={webcamRef} captureRef={captureRef} modelReady={modelStatus === 'Ready'} onRecordingChange={setIsRecording} />

      <div className="p-3 sm:p-5">
        <div className="relative w-full overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
          <div className="relative aspect-[4/3] w-full">
            <Webcam
              ref={webcamRef}
              mirrored
              audio={false}
              width={640}
              height={480}
              videoConstraints={videoConstraints}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0"
              style={{ width: '100%', height: '100%' }}
            />

            <div className="absolute left-3 right-3 top-3 rounded-xl border border-white/15 bg-slate-950/65 p-3 backdrop-blur-sm sm:left-4 sm:right-auto sm:w-[20rem]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-300">
                  Punch Counts
                </span>
                <span className={`text-xs font-medium ${isRunning ? 'text-emerald-300' : 'text-slate-300'}`}>
                  {isRunning ? 'Capturing' : 'Paused'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {punchLabels.map((punch) => (
                  <div
                    key={punch.key}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-2"
                  >
                    <div className="text-[0.65rem] uppercase tracking-wide text-slate-300">
                      {punch.label}
                    </div>
                    <div className="text-lg font-semibold leading-tight text-white">
                      {counts[punch.key]}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {showDebugOverlay && (
              <div className="absolute bottom-3 right-3 z-20 w-[20rem] max-w-[calc(100%-1.5rem)] rounded-xl border border-cyan-300/35 bg-slate-950/82 p-3 text-[11px] text-cyan-50 shadow-[0_12px_24px_rgba(8,47,73,0.35)] backdrop-blur-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                    Classifier Debug
                  </span>
                  <span className="text-[0.58rem] uppercase tracking-[0.14em] text-slate-300">
                    Backend
                  </span>
                </div>

                <div className="space-y-2">
                  {debugRows.length > 0 ? (
                    debugRows.map((row) => (
                      <div key={row.side} className="rounded-lg border border-white/10 bg-white/5 p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-cyan-100">
                            {row.side === 'left' ? 'Left Arm' : 'Right Arm'}
                          </span>
                          <span className="text-[0.58rem] uppercase tracking-[0.12em] text-slate-300">
                            {row.cooldownRemaining > 0 ? `CD ${row.cooldownRemaining}ms` : row.recovered === false ? 'Return to guard' : 'Ready'}
                          </span>
                        </div>

                        <div className="mt-1 grid grid-cols-3 gap-1.5">
                          {[row.straightType, 'hook', 'uppercut'].map((type) => (
                            <div
                              key={type}
                              className={`rounded px-1.5 py-1 ${
                                row.bestType === type
                                  ? 'border border-cyan-300/45 bg-cyan-700/35 text-cyan-50'
                                  : 'border border-white/10 bg-slate-900/65 text-slate-200'
                              }`}
                            >
                              <div className="text-[0.52rem] uppercase tracking-[0.08em]">
                                {type}
                              </div>
                              <div className="mt-0.5 text-[0.72rem] font-semibold leading-none">
                                {row.scoreByType?.[type] ?? '-'}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-1 text-[0.58rem] uppercase tracking-[0.1em] text-slate-300">
                          Best: {formatPunchName(row.bestType)} {row.threshold ? `(${row.bestScore}/${row.threshold})` : ''}
                        </div>
                        <div className="mt-1 text-[0.56rem] uppercase tracking-[0.08em] text-slate-400">
                          Elbow {row.elbowAngle}deg | Forearm {row.forearmAngleToHorizontal}deg to floor
                        </div>
                        {row.elbowAngle3D != null && (
                          <div className="mt-1 text-[0.56rem] uppercase tracking-[0.08em] text-slate-400">
                            3D elbow {row.elbowAngle3D}deg
                          </div>
                        )}
                        <div className="mt-1 text-[0.56rem] uppercase tracking-[0.08em] text-slate-400">
                          Straight evidence: {row.cues?.straight2D ? '2D' : row.cues?.straight3D ? '3D' : 'None'} |{' '}
                          Uppercut path: {row.cues?.uppercutFromLow ? 'Low' : row.cues?.uppercutFromGuard ? 'Guard' : 'None'}
                        </div>
                        <div className="mt-1 text-[0.56rem] uppercase tracking-[0.08em] text-slate-400">
                          {row.cues?.elbowMostlyStraight ? 'Straight-arm' : 'Bent-arm'} |{' '}
                          {row.cues?.armParallelFloor ? 'Parallel' : row.cues?.armPerpendicularFloor ? 'Perpendicular' : 'Diagonal'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[0.62rem] uppercase tracking-[0.1em] text-slate-300">
                      Need more motion for debug scores...
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isRunning && !isRecording && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 px-4">
                <div className="rounded-2xl border border-white/20 bg-black/60 px-6 py-5 text-center backdrop-blur-md">
                  <p className="display-title text-3xl text-orange-100 sm:text-4xl">Detection Paused</p>
                  <p className="mt-1 text-sm text-slate-200/90">
                    Start or resume the round to continue sending pose frames.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default PoseDetector;
