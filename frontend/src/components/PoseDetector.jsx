import { useEffect, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import * as poseDetection from '@tensorflow-models/pose-detection'
import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs-core'
import PoseRecording from './PoseRecording'
import { poseModelConfig } from '../lib/poseModelConfig'

const videoConstraints = {
  width: 640,
  height: 480,
  facingMode: 'user',
}

const punchLabels = [
  { key: 'jab', label: 'Jab' },
  { key: 'cross', label: 'Cross' },
  { key: 'hook', label: 'Hook' },
  { key: 'uppercut', label: 'Uppercut' },
]

const defaultPunchCounts = {
  jab: 0,
  cross: 0,
  hook: 0,
  uppercut: 0,
}

const getPoint = (keypoints, name, minScore = 0.5) =>
  keypoints?.find((pt) => pt.name === name && (pt.score ?? 1) >= minScore)

const drawPose = (keypoints, ctx, width, height) => {
  ctx.clearRect(0, 0, width, height)
  if (!keypoints) return

  // Mirror canvas so it matches the user's view.
  ctx.save()
  ctx.scale(-1, 1)
  ctx.translate(-width, 0)

  const connections = [
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'],
    ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'],
    ['right_elbow', 'right_wrist'],
    ['left_hip', 'right_hip'],
    ['left_shoulder', 'left_hip'],
    ['right_shoulder', 'right_hip'],
  ]

  connections.forEach(([from, to]) => {
    const a = getPoint(keypoints, from, 0.4)
    const b = getPoint(keypoints, to, 0.4)
    if (!a || !b) return
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    ctx.stroke()
  })

  keypoints.forEach((kp) => {
    if ((kp.score ?? 1) < 0.4) return
    ctx.beginPath()
    ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI)
    ctx.fillStyle = 'lime'
    ctx.fill()
  })

  ctx.restore()
}

const formatPunchName = (type) =>
  type ? type.charAt(0).toUpperCase() + type.slice(1) : 'None'

const toFrameKeypoint = (kp) => ({
  name: kp.name,
  x: kp.x,
  y: kp.y,
  z: kp.z,
  score: kp.score,
})

function PoseDetector({
  onReadyChange,
  getGeneration,
  debugRows = [],
  frameIntervalMs = 50,
  roundSpeed = 'casual',
  isRunning,
  lastPunchEvent,
  onPoseFrame,
  punchCounts = defaultPunchCounts,
}) {
  const webcamRef = useRef(null)
  const canvasRef = useRef(null)
  const captureRef = useRef(null)
  const live = useRef({})
  const [isRecording, setIsRecording] = useState(false)
  const [modelStatus, setModelStatus] = useState('Loading model...')
  const [modelError, setModelError] = useState('')
  const [modelAttempt, setModelAttempt] = useState(0)
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [stream, setStream] = useState(null)
  const [cameraStatus, setCameraStatus] = useState('Requesting camera access…')
  const [cameraReady, setCameraReady] = useState(false)
  const [showDebugOverlay, setShowDebugOverlay] = useState(false)
  const [recentPunchLabel, setRecentPunchLabel] = useState('')
  useEffect(() => {
    live.current = {
      isRunning,
      isRecording,
      cameraReady,
      frameIntervalMs,
      roundSpeed,
      onPoseFrame,
      getGeneration,
      onReadyChange,
    }
  }, [
    isRunning,
    isRecording,
    cameraReady,
    frameIntervalMs,
    roundSpeed,
    onPoseFrame,
    getGeneration,
    onReadyChange,
  ])
  useEffect(() => {
    onReadyChange(cameraReady && modelStatus === 'Ready')
  }, [cameraReady, modelStatus, onReadyChange])
  const cameraFailed = (error) => {
    setCameraReady(false)
    onReadyChange(false)
    setCameraStatus(
      error?.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access in site settings, then retry.'
        : 'Camera unavailable or in use. Connect a camera, close other camera apps, then retry.',
    )
  }
  useEffect(() => {
    if (!stream) return
    const video = webcamRef.current?.video
    const ready = () => {
      setCameraReady(true)
      setCameraStatus('Camera ready')
    }
    const lost = () => {
      setCameraReady(false)
      live.current.onReadyChange(false)
      setCameraStatus(
        'Camera disconnected or interrupted. Reconnect it, then retry.',
      )
    }
    const tracks = stream.getVideoTracks()
    tracks.forEach((track) => {
      track.addEventListener('ended', lost)
      track.addEventListener('mute', lost)
    })
    video?.addEventListener('loadeddata', ready)
    video?.addEventListener('playing', ready)
    video?.addEventListener('error', lost)
    if (video?.readyState >= 2) ready()
    return () => {
      tracks.forEach((track) => {
        track.removeEventListener('ended', lost)
        track.removeEventListener('mute', lost)
      })
      video?.removeEventListener('loadeddata', ready)
      video?.removeEventListener('playing', ready)
      video?.removeEventListener('error', lost)
      // react-webcam owns and releases these tracks on retry/unmount.
    }
  }, [stream])
  useEffect(() => {
    if (!lastPunchEvent?.punch) return
    setRecentPunchLabel(`${lastPunchEvent.punch} detected`)
    const timeout = setTimeout(() => setRecentPunchLabel(''), 900)
    return () => clearTimeout(timeout)
  }, [lastPunchEvent?.id, lastPunchEvent?.punch])

  useEffect(() => {
    let cancelled = false
    let detector
    let raf
    let pending
    let loadingTimeout
    let lastSubmitted = -Infinity
    const fail = (message) => {
      setModelError(message)
      setModelStatus('Tracking unavailable')
      live.current.onReadyChange(false)
    }
    const detectLoop = async () => {
      if (cancelled) return
      const video = webcamRef.current?.video
      const current = live.current
      if (
        !document.hidden &&
        current.cameraReady &&
        (current.isRunning || current.isRecording) &&
        video?.readyState >= 2
      ) {
        const frameTime = performance.now()
        const generation = current.getGeneration()
        const mediaTime = video.currentTime
        const capture = captureRef.current
        try {
          pending = detector.estimatePoses(video, { flipHorizontal: false })
          const poses = await pending
          if (cancelled) return
          const keypoints3D = poses[0]?.keypoints3D
          const keypoints = (poses[0]?.keypoints ?? []).map((kp, idx) => ({
            ...kp,
            z: keypoints3D?.[idx]?.z ?? kp.z,
          }))
          const recordedFrame = capture?.capture({
            time: frameTime,
            mediaTime,
            keypoints,
            keypoints3D,
            speed: current.roundSpeed,
            roundRunning: current.isRunning,
          })
          // Inference can finish after pause/reset/resume. The engine checks the captured generation too.
          if (
            generation === live.current.getGeneration() &&
            !document.hidden &&
            live.current.cameraReady
          ) {
            const canvas = canvasRef.current
            if (canvas) {
              canvas.width = video.videoWidth
              canvas.height = video.videoHeight
              drawPose(
                keypoints,
                canvas.getContext('2d'),
                canvas.width,
                canvas.height,
              )
            }
            if (
              current.isRunning &&
              keypoints.length &&
              frameTime - lastSubmitted >= current.frameIntervalMs
            ) {
              lastSubmitted = frameTime
              const result = current.onPoseFrame(
                {
                  time: frameTime,
                  keypoints: keypoints.map(toFrameKeypoint),
                  keypoints3D: keypoints3D?.map(toFrameKeypoint),
                },
                generation,
              )
              if (recordedFrame)
                recordedFrame.submittedToClassifier = result.accepted
            }
          }
        } catch {
          if (!cancelled)
            fail(
              'Pose tracking stopped. Retry the model; if it keeps failing, reload with graphics acceleration enabled.',
            )
          return
        } finally {
          pending = null
        }
      }
      raf = requestAnimationFrame(detectLoop)
    }
    const setup = async () => {
      try {
        setModelStatus('Loading model...')
        setModelError('')
        loadingTimeout = setTimeout(() => {
          if (cancelled) return
          fail('Model loading timed out. Check your connection and retry.')
          cancelled = true
        }, 45000)
        if (!(await tf.setBackend('webgl')))
          throw new Error('WebGL unavailable')
        await tf.ready()
        if (cancelled) return
        detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.BlazePose,
          poseModelConfig,
        )
        if (cancelled) {
          detector.dispose()
          return
        }
        setModelStatus('Ready')
        void detectLoop()
      } catch {
        if (!cancelled)
          fail(
            'Cannot load the pose model. Check your connection and graphics acceleration, then retry.',
          )
      } finally {
        clearTimeout(loadingTimeout)
      }
    }
    void setup()
    return () => {
      cancelled = true
      clearTimeout(loadingTimeout)
      cancelAnimationFrame(raf)
      // Never dispose tensors while an estimate is still using them.
      if (pending) void pending.catch(() => {}).then(() => detector?.dispose())
      else detector?.dispose()
    }
  }, [modelAttempt])

  const counts = { ...defaultPunchCounts, ...punchCounts }
  const totalPunches = counts.jab + counts.cross + counts.hook + counts.uppercut
  const status =
    modelStatus !== 'Ready'
      ? modelStatus
      : !cameraReady
        ? 'Camera unavailable'
        : !isRunning
          ? 'Paused'
          : recentPunchLabel || 'Running'
  const loweredStatus = status.toLowerCase()
  const statusStyle =
    loweredStatus.includes('error') || loweredStatus.includes('disconnected')
      ? 'status-pill-error'
      : isRunning
        ? 'status-pill-live'
        : 'status-pill-idle'

  return (
    <section className="panel-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">
            Live Tracking Feed
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Pose Detector
          </h2>
          <p className="mt-1 text-xs text-slate-300">
            Orthodox stance: left jab · right cross
          </p>
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
        <div
          role="alert"
          className="border-b border-rose-300/25 bg-rose-950/35 px-4 py-3 sm:px-6"
        >
          <p className="text-sm text-rose-100">Pose tracking is unavailable.</p>
          <p className="mt-1 break-words text-xs text-rose-200">{modelError}</p>
          <button
            type="button"
            onClick={() => setModelAttempt((attempt) => attempt + 1)}
            className="action-btn action-btn-secondary mt-3"
          >
            Retry model
          </button>
        </div>
      )}

      <div
        role="status"
        className="border-b border-white/10 px-4 py-3 text-sm text-slate-200"
      >
        {cameraStatus}
        {!cameraReady && (
          <button
            type="button"
            className="action-btn action-btn-secondary ml-3"
            onClick={() => {
              setCameraReady(false)
              onReadyChange(false)
              setStream(null)
              setCameraStatus('Requesting camera access…')
              setCameraAttempt((attempt) => attempt + 1)
            }}
          >
            Retry camera
          </button>
        )}
      </div>
      <PoseRecording
        webcamRef={webcamRef}
        captureRef={captureRef}
        modelReady={cameraReady && modelStatus === 'Ready'}
        onRecordingChange={setIsRecording}
      />

      <div className="p-3 sm:p-5">
        <div className="relative w-full overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
          <div className="relative aspect-[4/3] w-full">
            <Webcam
              key={cameraAttempt}
              ref={webcamRef}
              onUserMedia={setStream}
              onUserMediaError={cameraFailed}
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
                <span
                  className={`text-xs font-medium ${isRunning ? 'text-emerald-300' : 'text-slate-300'}`}
                >
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
                      <div
                        key={row.side}
                        className="rounded-lg border border-white/10 bg-white/5 p-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-cyan-100">
                            {row.side === 'left' ? 'Left Arm' : 'Right Arm'}
                          </span>
                          <span className="text-[0.58rem] uppercase tracking-[0.12em] text-slate-300">
                            {row.cooldownRemaining > 0
                              ? `CD ${row.cooldownRemaining}ms`
                              : row.recovered === false
                                ? 'Return to guard'
                                : 'Ready'}
                          </span>
                        </div>

                        <div className="mt-1 grid grid-cols-3 gap-1.5">
                          {[row.straightType, 'hook', 'uppercut'].map(
                            (type) => (
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
                            ),
                          )}
                        </div>

                        <div className="mt-1 text-[0.58rem] uppercase tracking-[0.1em] text-slate-300">
                          Best: {formatPunchName(row.bestType)}{' '}
                          {row.threshold
                            ? `(${row.bestScore}/${row.threshold})`
                            : ''}
                        </div>
                        <div className="mt-1 text-[0.56rem] uppercase tracking-[0.08em] text-slate-400">
                          Elbow {row.elbowAngle}deg | Forearm{' '}
                          {row.forearmAngleToHorizontal}deg to floor
                        </div>
                        {row.elbowAngle3D != null && (
                          <div className="mt-1 text-[0.56rem] uppercase tracking-[0.08em] text-slate-400">
                            3D elbow {row.elbowAngle3D}deg
                          </div>
                        )}
                        <div className="mt-1 text-[0.56rem] uppercase tracking-[0.08em] text-slate-400">
                          Straight evidence:{' '}
                          {row.cues?.straight2D
                            ? '2D'
                            : row.cues?.straight3D
                              ? '3D'
                              : 'None'}{' '}
                          | Uppercut path:{' '}
                          {row.cues?.uppercutFromLow
                            ? 'Low'
                            : row.cues?.uppercutFromGuard
                              ? 'Guard'
                              : 'None'}
                        </div>
                        <div className="mt-1 text-[0.56rem] uppercase tracking-[0.08em] text-slate-400">
                          {row.cues?.elbowMostlyStraight
                            ? 'Straight-arm'
                            : 'Bent-arm'}{' '}
                          |{' '}
                          {row.cues?.armParallelFloor
                            ? 'Parallel'
                            : row.cues?.armPerpendicularFloor
                              ? 'Perpendicular'
                              : 'Diagonal'}
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
                  <p className="display-title text-3xl text-orange-100 sm:text-4xl">
                    Detection Paused
                  </p>
                  <p className="mt-1 text-sm text-slate-200/90">
                    Start or resume the round to continue tracking your punches.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default PoseDetector
