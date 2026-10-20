import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPoseRecording,
  createLabelTemplate,
  MAX_RECORDING_MS,
} from '../frontend/src/lib/poseRecording.js'

const createSession = () =>
  createPoseRecording({
    id: 'test-recording',
    startedAt: '2026-09-29T00:00:00Z',
    originMs: 1000,
    videoTime: 5,
    width: 640,
    height: 480,
    cameraFps: 30,
    mimeType: 'video/webm',
  })

const points = (x) => [
  { name: 'nose', x: 150, y: 80 },
  { name: 'left_shoulder', x: 100, y: 100 },
  { name: 'right_shoulder', x: 200, y: 100 },
  { name: 'left_elbow', x: 150, y: 100 },
  { name: 'left_wrist', x, y: 100 },
  { name: 'left_hip', x: 100, y: 220 },
]

test('captures independent copies of 2D/3D points and monotonic recording-relative times', () => {
  const session = createSession()
  const keypoints = points(120)
  const keypoints3D = [
    { name: 'left_wrist', x: 0.1, y: 0.2, z: -0.3, score: 0.9 },
  ]
  assert.equal(session.capture({ time: 999 }), null)
  const frame = session.capture({
    time: 1100,
    mediaTime: 5.1,
    keypoints,
    keypoints3D,
    roundRunning: false,
    speed: 'casual',
  })
  keypoints[0].x = 999
  keypoints3D[0].z = 999
  assert.equal(frame.time, 100)
  assert.ok(Math.abs(frame.mediaTimeMs - 100) < 0.001)
  assert.equal(frame.keypoints[0].x, 150)
  assert.equal(frame.keypoints3D[0].z, -0.3)
  assert.equal(frame.submittedToClassifier, false)
  assert.equal(session.capture({ time: 1100 }), null)
  session.capture({ time: 1200, mediaTime: 5.2, keypoints: [] })
  const data = session.stop(1300)
  assert.equal(data.durationMs, 300)
  assert.equal(data.summary.samples, 2)
  assert.equal(data.summary.trackedSamples, 1)
  assert.equal(data.summary.inferenceFps, 10)
  assert.equal(data.video.mirrored, false)
  assert.equal(session.capture({ time: 1400 }), null)
  assert.equal(session.stop(2000).durationMs, 300)
})

test('capture has a duration limit and labels are never inferred from predictions', () => {
  const session = createSession()
  assert.equal(session.capture({ time: 1000 + MAX_RECORDING_MS + 1 }), null)
  const template = createLabelTemplate('test-recording')
  assert.deepEqual(template.labels, [])
  assert.equal(template.fps, 30)
  assert.equal(template.frameIndexBase, 0)
})
