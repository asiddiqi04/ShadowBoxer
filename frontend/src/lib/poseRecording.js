export const MAX_RECORDING_MS = 180000

const copyPoints = (points) => (points ?? []).map(({ name, x, y, z, score }) => ({ name, x, y, z, score }))

// This buffer records inference samples, not every encoded video frame. Use
// monotonic capture times rather than inference completion or HTTP arrival.
export const createPoseRecording = ({ id, startedAt, originMs, videoTime, width, height, cameraFps, mimeType }) => {
  let active = true
  let completed = null
  const frames = []
  const metadata = {
    schemaVersion: 1,
    id,
    startedAt,
    stance: 'orthodox',
    model: { name: 'BlazePose', runtime: 'tfjs', modelType: 'full' },
    video: { width, height, cameraFps, mimeType, mirrored: false, audio: false },
    coordinates: { keypoints: 'image x/y in pixels; z in meters when available', keypoints3D: 'world x/y/z in meters', sides: 'anatomical' },
    timing: {
      unit: 'milliseconds',
      origin: 'MediaRecorder.start call',
      alignment: 'approximate; browser video encoding may introduce a start offset',
      sampling: 'every completed pose inference, independently of training API throttling',
    },
  }
  return {
    capture({ time, mediaTime, keypoints, keypoints3D, speed, roundRunning }) {
      const relativeTime = time - originMs
      if (!active || relativeTime < 0 || relativeTime > MAX_RECORDING_MS ||
        (frames.length && relativeTime <= frames.at(-1).time)) return null
      const frame = {
        time: relativeTime,
        mediaTimeMs: (mediaTime - videoTime) * 1000,
        keypoints: copyPoints(keypoints),
        keypoints3D: copyPoints(keypoints3D),
        speed,
        roundRunning,
        submittedToClassifier: false,
      }
      frames.push(frame)
      return frame
    },
    get frameCount() { return frames.length },
    stop(time) {
      if (completed) return completed
      active = false
      const durationMs = Math.max(0, time - originMs)
      completed = {
        ...metadata,
        durationMs,
        frames,
        summary: {
          samples: frames.length,
          trackedSamples: frames.filter((frame) => frame.keypoints.length > 0).length,
          inferenceFps: frames.length > 1 ? (frames.length - 1) * 1000 / (frames.at(-1).time - frames[0].time) : 0,
        },
      }
      return completed
    },
  }
}

export const createLabelTemplate = (id) => ({
  schemaVersion: 2,
  recordingId: id,
  timeUnit: 'video frames',
  fps: 30,
  frameIndexBase: 0,
  labels: [],
})
