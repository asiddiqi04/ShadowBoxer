import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPunch } from '../frontend/src/training/punchClassifier.js'

const baseKeypoints = ({ leftWristX, leftWristZ = 0 }) => [
  { name: 'nose', x: 150, y: 80, score: 1 },
  { name: 'left_shoulder', x: 100, y: 100, score: 1 },
  { name: 'right_shoulder', x: 200, y: 100, score: 1 },
  { name: 'left_elbow', x: 150, y: 100, score: 1 },
  { name: 'left_wrist', x: leftWristX, y: 100, z: leftWristZ, score: 1 },
  { name: 'left_hip', x: 100, y: 220, score: 1 },
]

const frame = (leftWristX, time, leftWristZ = 0.05) => ({
  time,
  keypoints: baseKeypoints({ leftWristX, leftWristZ }),
})

test('classifyPunch detects a high-scoring jab from keypoint history', () => {
  const history = [
    frame(120, 100),
    frame(126, 200),
    frame(132, 300),
    frame(140, 400, 0.05),
    frame(260, 500, 0),
  ]

  const result = classifyPunch(history, { left: 0, right: 0 })

  assert.equal(result.punch.type, 'jab')
  assert.equal(result.punch.side, 'left')
  assert.ok(result.punch.score >= 68)
  assert.equal(result.debug[0].bestType, 'jab')
})

test('classifyPunch returns no punch for low-motion keypoints', () => {
  const history = [
    frame(120, 100),
    frame(121, 200),
    frame(122, 300),
    frame(123, 400),
    frame(124, 500),
  ]

  const result = classifyPunch(history, { left: 0, right: 0 })

  assert.equal(result.punch, null)
})

// The arm points into the camera: its 2D projection folds back on itself,
// while its world-space elbow is nearly straight at full extension.
const forwardFrame = (side, time, wristZ, wristY = 0) => {
  const sign = side === 'left' ? 1 : -1
  const opposite = side === 'left' ? 'right' : 'left'
  const keypoints3D = [
    { name: 'nose', x: 0, y: -0.15, z: 0 },
    { name: `${side}_shoulder`, x: sign * 0.18, y: 0, z: 0 },
    { name: `${opposite}_shoulder`, x: -sign * 0.18, y: 0, z: 0 },
    { name: `${side}_elbow`, x: sign * 0.22, y: 0.02, z: -0.28 },
    { name: `${side}_wrist`, x: sign * 0.18, y: wristY, z: wristZ },
    { name: `${side}_hip`, x: sign * 0.18, y: 0.45, z: 0 },
  ].map((point) => ({ ...point, score: 1 }))
  return {
    time,
    keypoints3D,
    keypoints: keypoints3D.map((point) => ({
      ...point,
      x: 320 + point.x * 300,
      y: 180 + point.y * 300,
    })),
  }
}

for (const [side, type] of [
  ['left', 'jab'],
  ['right', 'cross'],
]) {
  test(`orthodox ${side} straight into the camera registers as ${type}`, () => {
    const history = [
      forwardFrame(side, 600, -0.18, -0.15),
      forwardFrame(side, 700, -0.32, -0.08),
      forwardFrame(side, 800, -0.58),
    ]
    const result = classifyPunch(history, {})
    assert.equal(result.punch?.type, type)
    assert.equal(result.punch.side, side)
    assert.ok(result.debug[0].elbowAngle3D >= 145)
    assert.ok(result.debug[0].elbowAngle < 145)
    assert.equal(classifyPunch(history, { [side]: 700 }).punch, null)
  })

  test(`${type} extension accumulates across short frame intervals`, () => {
    const history = [-0.4, -0.44, -0.48, -0.52, -0.56].map((z, index) =>
      forwardFrame(side, 600 + index * 40, z),
    )
    assert.equal(classifyPunch(history, {}).punch?.type, type)
  })

  test(`${side} held arm, retraction, and body sway do not register a straight`, () => {
    const held = [600, 700, 800].map((time) => forwardFrame(side, time, -0.58))
    assert.equal(classifyPunch(held, {}).punch, null)
    const retracting = [-0.58, -0.54, -0.5].map((z, index) =>
      forwardFrame(side, 600 + index * 100, z),
    )
    assert.equal(classifyPunch(retracting, {}).punch, null)
    const swaying = held.map((frame, index) => ({
      ...frame,
      keypoints3D: frame.keypoints3D.map((point) => ({
        ...point,
        z: point.z - index * 0.1,
      })),
    }))
    assert.equal(classifyPunch(swaying, {}).punch, null)
  })
}

test('stale 3D motion across a pause does not register a punch', () => {
  const history = [
    forwardFrame('left', 600, -0.18),
    forwardFrame('left', 700, -0.32),
    forwardFrame('left', 2000, -0.58),
  ]
  assert.equal(classifyPunch(history, {}).punch, null)
})

test('low-confidence world landmarks are not used to assert a straight arm', () => {
  const history = [-0.18, -0.32, -0.58].map((z, index) =>
    forwardFrame('left', 600 + index * 100, z),
  )
  history
    .at(-1)
    .keypoints3D.find((point) => point.name === 'left_elbow').score = 0.1
  const result = classifyPunch(history, {})
  assert.equal(result.punch, null)
  assert.equal(result.debug[0].elbowAngle3D, null)
})

const curvedFrame = (type, time, moving = false) => ({
  time,
  keypoints: [
    { name: 'nose', x: 150, y: 80 },
    { name: 'left_shoulder', x: 100, y: 100 },
    { name: 'right_shoulder', x: 200, y: 100 },
    { name: 'left_hip', x: 100, y: 220 },
    {
      name: 'left_elbow',
      x: type === 'hook' ? 100 : 180,
      y: type === 'hook' ? 120 : 100,
    },
    {
      name: 'left_wrist',
      x: type === 'hook' ? (moving ? 180 : 120) : 180,
      y: type === 'hook' ? 120 : moving ? 20 : 200,
    },
  ],
})

for (const type of ['hook', 'uppercut']) {
  test(`${type} still registers during its characteristic motion`, () => {
    const history = [600, 700, 800, 900, 1000].map((time, index) =>
      curvedFrame(type, time, index === 4),
    )
    assert.equal(classifyPunch(history, {}).punch?.type, type)
    const withWorldLandmarks = history.map((frame) => ({
      ...frame,
      keypoints3D: frame.keypoints.map((point) => ({
        ...point,
        x: point.x / 300,
        y: point.y / 300,
        z: 0,
      })),
    }))
    assert.equal(classifyPunch(withWorldLandmarks, {}).punch?.type, type)
  })

  test(`a stationary ${type} pose does not repeatedly count as a punch`, () => {
    const history = [600, 700, 800, 900, 1000].map((time) =>
      curvedFrame(type, time, true),
    )
    assert.equal(classifyPunch(history, {}).punch, null)
  })
}
