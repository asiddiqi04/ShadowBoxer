import { useEffect, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import * as poseDetection from '@tensorflow-models/pose-detection'
import '@tensorflow/tfjs-backend-webgl'
import * as tf from '@tensorflow/tfjs-core'
import PoseRecording from './PoseRecording'
import { poseModelConfig } from '../lib/poseModelConfig'
import { usePreloadProgress } from '../hooks/usePreloadProgress'
import LoadingBar from './LoadingBar'

const videoConstraints = {
  width: 640,
  height: 480,
  facingMode: 'user',
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
  stance = 'orthodox',
  isRunning,
  previewing = false,
  onPoseFrame,
  hud = null,
  panel = null,
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
  useEffect(() => {
    live.current = {
      isRunning,
      previewing,
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
    previewing,
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
        // The countdown runs inference without scoring: it warms up the model (and shows the dev skeleton).
        (current.isRunning ||
          current.previewing ||
          (import.meta.env.DEV && current.isRecording)) &&
        video?.readyState >= 2
      ) {
        const frameTime = performance.now()
        const generation = current.getGeneration()
        const mediaTime = video.currentTime
        const capture = import.meta.env.DEV ? captureRef.current : null
        try {
          pending = detector.estimatePoses(video, { flipHorizontal: false })
          const poses = await pending
          if (cancelled) return
          const keypoints3D = poses[0]?.keypoints3D
          const keypoints = (poses[0]?.keypoints ?? []).map((kp, idx) => ({
            ...kp,
            z: keypoints3D?.[idx]?.z ?? kp.z,
          }))
          const recordedFrame = import.meta.env.DEV
            ? capture?.capture({
                time: frameTime,
                mediaTime,
                keypoints,
                keypoints3D,
                speed: current.roundSpeed,
                roundRunning: current.isRunning,
              })
            : null
          // Inference can finish after pause/reset/resume. The engine checks the captured generation too.
          if (
            generation === live.current.getGeneration() &&
            !document.hidden &&
            live.current.cameraReady
          ) {
            // Skeleton overlay is a local dev tool: production skips the drawing entirely.
            const canvas = import.meta.env.DEV ? canvasRef.current : null
            if (canvas) {
              // Resizing reallocates the canvas (slow on iOS): only do it when the video size changes.
              if (canvas.width !== video.videoWidth)
                canvas.width = video.videoWidth
              if (canvas.height !== video.videoHeight)
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

  const modelLoading = !modelError && modelStatus !== 'Ready'
  const preload = usePreloadProgress()

  return (
    <section className="training-stage flex flex-col gap-3 stage:fixed stage:inset-0 stage:z-0 stage:gap-2 stage:px-3 stage:pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))]">
      {import.meta.env.DEV && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDebugOverlay((prev) => !prev)}
            className="rounded-md border border-cyan-300/35 bg-cyan-950/35 px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-900/45"
          >
            Debug {showDebugOverlay ? 'On' : 'Off'}
          </button>
        </div>
      )}

      {modelError && (
        <div
          role="alert"
          className="relative z-20 rounded-2xl border border-rose-300/30 bg-rose-950/40 px-4 py-3 stage:bg-rose-950/90"
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

      {(!cameraReady || modelLoading) && (
        <div
          role="status"
          className="relative z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 stage:bg-slate-950/85"
        >
          {!cameraReady ? (
            <span>{cameraStatus}</span>
          ) : (
            // Download progress while the preload runs, then a sweep while the model warms up.
            <LoadingBar
              label={
                preload.phase === 'loading'
                  ? 'Downloading the pose model'
                  : 'Loading the pose model'
              }
              percent={preload.phase === 'loading' ? preload.percent : null}
            />
          )}
          {!cameraReady && (
            <button
              type="button"
              className="action-btn action-btn-secondary"
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
      )}
      {import.meta.env.DEV && (
        <PoseRecording
          webcamRef={webcamRef}
          captureRef={captureRef}
          stance={stance}
          modelReady={cameraReady && modelStatus === 'Ready'}
          onRecordingChange={setIsRecording}
        />
      )}

      <div className="relative mx-auto w-full min-w-0 max-w-[calc((100svh-12rem)*4/3)] stage:absolute stage:inset-0 stage:max-w-none">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-white/12 bg-black shadow-[0_24px_60px_rgba(0,0,0,0.5)] stage:aspect-auto stage:h-full stage:rounded-none stage:border-0">
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
            className="absolute inset-0 h-full w-full object-cover short:object-contain"
          />
          {import.meta.env.DEV && (
            <canvas
              ref={canvasRef}
              // Cropped exactly like the video (object-cover) so the skeleton stays aligned.
              className="pointer-events-none absolute inset-0 h-full w-full object-cover short:object-contain"
            />
          )}
          {hud}
          {import.meta.env.DEV && showDebugOverlay && (
            <div className="absolute bottom-3 right-3 z-20 w-[20rem] max-w-[calc(100%-1.5rem)] rounded-xl border border-cyan-300/35 bg-slate-950/82 p-3 text-[11px] text-cyan-50 shadow-[0_12px_24px_rgba(8,47,73,0.35)] backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-cyan-200">
                  Classifier Debug
                </span>
                <span className="text-[0.58rem] uppercase tracking-[0.14em] text-slate-300">
                  Local engine
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
        </div>
        {panel}
      </div>
    </section>
  )
}

export default PoseDetector
