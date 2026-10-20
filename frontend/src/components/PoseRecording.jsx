import { useEffect, useRef, useState } from 'react'
import {
  createLabelTemplate,
  createPoseRecording,
  MAX_RECORDING_MS,
} from '../lib/poseRecording'

const mimeTypes = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]
const supportedType = () =>
  typeof MediaRecorder !== 'undefined' &&
  typeof MediaRecorder.isTypeSupported === 'function'
    ? mimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
    : null
const jsonBlob = (value) =>
  new Blob([JSON.stringify(value)], { type: 'application/json' })

function PoseRecording({
  webcamRef,
  captureRef,
  modelReady,
  onRecordingChange,
}) {
  const recorderRef = useRef(null)
  const timerRef = useRef(null)
  const urlsRef = useRef([])
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState({ seconds: 0, samples: 0 })
  const [exports, setExports] = useState(null)
  const [error, setError] = useState('')
  const mimeType = supportedType()
  const stopRef = useRef(null)
  useEffect(() => {
    if (!modelReady) stopRef.current?.()
  }, [modelReady])
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stopRef.current?.()
    }
    const leaving = (event) => {
      if (exports || phase === 'recording') {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('beforeunload', leaving)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('beforeunload', leaving)
    }
  }, [exports, phase])
  // Keep previous download URLs alive until React has replaced their links.
  useEffect(() => {
    const currentUrls = new Set(exports?.downloads.map((file) => file.url))
    const old = urlsRef.current.filter((url) => !currentUrls.has(url))
    const timer = setTimeout(() => {
      old.forEach((url) => URL.revokeObjectURL(url))
      urlsRef.current = urlsRef.current.filter((url) => !old.includes(url))
    }, 1000)
    return () => clearTimeout(timer)
  }, [exports])

  useEffect(
    () => () => {
      clearInterval(timerRef.current)
      captureRef.current?.stop(performance.now())
      captureRef.current = null
      const recorder = recorderRef.current
      if (recorder) {
        recorder.onstop = null
        recorder.ondataavailable = null
        recorder.onerror = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      // The stream belongs to Webcam; stopping a recording must not stop it.
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    },
    [captureRef],
  )

  const stop = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    clearInterval(timerRef.current)
    captureRef.current?.stop(performance.now())
    captureRef.current = null
    setPhase('stopping')
    recorder.stop()
    onRecordingChange(false)
  }

  useEffect(() => {
    stopRef.current = stop
  })

  const start = () => {
    setError('')
    const video = webcamRef.current?.video
    if (
      !modelReady ||
      !video ||
      video.readyState < 2 ||
      !video.srcObject?.active
    ) {
      setError('Wait for the camera and pose model to be ready.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError(
        'This browser cannot record video. Try a recent Chrome, Firefox, or Safari.',
      )
      return
    }
    let session
    try {
      if (!mimeType) {
        setError(
          'Recording is unsupported in this browser. Training is still available.',
        )
        return
      }
      const recorder = new MediaRecorder(video.srcObject, { mimeType })
      const chunks = []
      const id = `boxing-${new Date().toISOString().replace(/[:.]/g, '-')}`
      const originMs = performance.now()
      session = createPoseRecording({
        id,
        originMs,
        startedAt: new Date().toISOString(),
        videoTime: video.currentTime,
        width: video.videoWidth,
        height: video.videoHeight,
        cameraFps:
          video.srcObject.getVideoTracks()[0]?.getSettings().frameRate ?? null,
        mimeType: recorder.mimeType,
      })
      recorder.ondataavailable = ({ data }) => {
        if (data.size) chunks.push(data)
      }
      recorder.onerror = () => {
        setError(
          'Recording stopped unexpectedly. Download available data, then retry.',
        )
        stopRef.current?.()
      }
      recorder.onstop = () => {
        clearInterval(timerRef.current)
        const data = session.stop(performance.now())
        if (captureRef.current === session) captureRef.current = null
        onRecordingChange(false)
        const actualType = recorder.mimeType || mimeType
        data.video.mimeType = actualType
        const videoBlob = new Blob(chunks, { type: actualType })
        const extension = actualType.includes('mp4') ? 'mp4' : 'webm'
        const files = [
          {
            label: `Download ${extension.toUpperCase()}`,
            name: `${id}.${extension}`,
            blob: videoBlob,
          },
          {
            label: 'Download landmarks',
            name: `${id}.landmarks.json`,
            blob: jsonBlob(data),
          },
          {
            label: 'Download label template',
            name: `${id}.labels.json`,
            blob: jsonBlob(createLabelTemplate(id)),
          },
        ]
        const downloads = files.map(({ blob, ...file }) => ({
          ...file,
          url: URL.createObjectURL(blob),
        }))
        urlsRef.current.push(...downloads.map((file) => file.url))
        setExports({
          downloads,
          samples: data.summary.trackedSamples,
          fps: data.summary.inferenceFps,
          cameraFps: data.video.cameraFps,
        })
        if (!videoBlob.size || !data.summary.trackedSamples)
          setError(
            'The recording has no video or tracked poses. Check the camera and try again after downloading it.',
          )
        setPhase('ready')
      }
      recorder.start(1000)
      recorderRef.current = recorder
      captureRef.current = session
      setPhase('recording')
      setProgress({ seconds: 0, samples: 0 })
      onRecordingChange(true)
      timerRef.current = setInterval(() => {
        const elapsed = performance.now() - originMs
        setProgress({
          seconds: Math.floor(elapsed / 1000),
          samples: session.frameCount,
        })
        if (elapsed >= MAX_RECORDING_MS) stop()
      }, 250)
    } catch {
      session?.stop(performance.now())
      captureRef.current = null
      onRecordingChange(false)
      setPhase('idle')
      setError('Unable to start recording. Check camera access and retry.')
    }
  }

  return (
    <div className="border-b border-white/10 bg-slate-950/30 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">
            Record punches for tuning
          </h3>
          <p className="mt-1 text-xs text-slate-300">
            Record up to 3 minutes of local video and pose data. No round
            needed. No audio.
          </p>
        </div>
        {phase === 'recording' ? (
          <button
            type="button"
            className="action-btn action-btn-warning"
            onClick={stop}
          >
            Stop recording
          </button>
        ) : (
          <button
            type="button"
            className="action-btn action-btn-secondary disabled:opacity-50"
            onClick={start}
            disabled={!modelReady || !mimeType || phase === 'stopping'}
          >
            {phase === 'stopping' ? 'Preparing downloads…' : 'Record punches'}
          </button>
        )}
      </div>
      {!mimeType && (
        <p className="mt-2 text-xs text-amber-200">
          Recording is unsupported in this browser. Training remains available.
        </p>
      )}
      {mimeType?.includes('webm') && (
        <p className="mt-2 text-xs text-slate-300">
          Recording format: WebM (MP4 unavailable).
        </p>
      )}
      {phase === 'recording' && (
        <p role="status" className="mt-2 text-sm text-rose-200">
          Recording · {progress.seconds}s · {progress.samples} pose samples
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {exports && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-3">
            {exports.downloads.map((file) => (
              <a
                className="text-sm text-cyan-200 underline"
                key={file.name}
                href={file.url}
                download={file.name}
              >
                {file.label}
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-300">
            {exports.samples} tracked samples · {exports.fps.toFixed(1)}{' '}
            measured pose FPS. Save all three files before recording again or
            leaving this page. Camera-reported rate:{' '}
            {exports.cameraFps ?? 'unknown'} FPS; encoded video may vary.
            Landmark timestamps are authoritative. Convert video to constant 30
            FPS before using the frame-based label template (frame 0 origin).
          </p>
          <p className="mt-1 text-xs text-slate-400">
            The exported video is unmirrored. Files stay in this browser until
            you download them.
          </p>
        </div>
      )}
    </div>
  )
}

export default PoseRecording
