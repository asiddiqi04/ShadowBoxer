import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyPunch,
  angleDeg,
} from '../frontend/src/training/punchClassifier.js'
import { speedProfiles } from '../frontend/src/training/speedProfiles.js'

// 2D reference endpoints with synthetic trajectories and world positions.
// These exercise disagreement between projected and world-space elbow angles.
const references = {
  jab: {
    side: 'left',
    shoulder: [1125, 626],
    opposite: [1273, 664],
    nose: [1239, 563],
    elbows: [
      [1117, 730],
      [1150, 602],
      [1130, 562],
    ],
    wrists: [
      [1154, 590],
      [1140, 530],
      [1178, 450],
    ],
    worldAngle: 142,
  },
  cross: {
    side: 'right',
    shoulder: [1282, 592],
    opposite: [1131, 619],
    nose: [1198, 535],
    elbows: [
      [1295, 720],
      [1257, 568],
      [1282, 552],
    ],
    wrists: [
      [1240, 570],
      [1267, 500],
      [1229, 442],
    ],
    worldAngle: 157,
  },
}

const referenceFrame = (type, stage, time, world = true) => {
  const reference = references[type]
  const { side, shoulder, opposite, nose, elbows, wrists } = reference
  const other = side === 'left' ? 'right' : 'left'
  const keypoints = [
    ['nose', nose],
    [`${side}_shoulder`, shoulder],
    [`${other}_shoulder`, opposite],
    [`${side}_elbow`, elbows[stage]],
    [`${side}_wrist`, wrists[stage]],
    [`${side}_hip`, [shoulder[0], 1000]],
  ].map(([name, [x, y]]) => ({ name, x, y, score: 1 }))
  const angle = ([80, 115, reference.worldAngle][stage] * Math.PI) / 180
  const keypoints3D = world
    ? [
        { name: `${side}_shoulder`, x: 0, y: 0, z: 0 },
        { name: `${side}_elbow`, x: 0, y: 0, z: -0.3 },
        {
          name: `${side}_wrist`,
          x: 0,
          y: -0.3 * Math.sin(angle),
          z: -0.3 + 0.3 * Math.cos(angle),
        },
      ]
    : undefined
  return { time, keypoints, keypoints3D }
}

const replay = (frames, speed = 'casual') => {
  const events = []
  const history = []
  const lastPunchBySide = {}
  for (const frame of frames) {
    history.push(frame)
    const { punch } = classifyPunch(history, lastPunchBySide, speed)
    if (punch) {
      events.push({ ...punch, time: frame.time })
      lastPunchBySide[punch.side] = frame.time
    }
  }
  return events
}

for (const type of ['jab', 'cross']) {
  for (const world of [true, false]) {
    test(`${type} reference: rising extension, hold, and return yield one straight (${world ? '3D' : '2D'})`, () => {
      const stages = [0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0]
      const frames = stages.map((stage, index) =>
        referenceFrame(type, stage, 600 + index * 100, world),
      )
      const events = replay(frames)
      assert.deepEqual(
        events.map((event) => event.type),
        [type],
      )
      assert.equal(events[0].side, references[type].side)
      assert.equal(events[0].time, 1000)
    })
  }

  test(`${type} reference endpoint alone is not evidence of a new punch`, () => {
    const frames = Array.from({ length: 12 }, (_, index) =>
      referenceFrame(type, 2, 600 + index * 100),
    )
    assert.deepEqual(replay(frames), [])
  })

  test(`${type} reference works at different capture intervals and image scales`, () => {
    for (const interval of [80, 120, 160]) {
      for (const scale of [0.5, 1.5]) {
        const frames = [0, 0, 0, 1, 2].map((stage, index) => {
          const frame = referenceFrame(type, stage, 600 + index * interval)
          frame.keypoints = frame.keypoints.map((point) => ({
            ...point,
            x: point.x * scale,
            y: point.y * scale,
          }))
          return frame
        })
        assert.deepEqual(
          replay(frames).map((event) => event.type),
          [type],
        )
      }
    }
  })

  test(`${type} reference can repeat after returning to guard`, () => {
    const stages = [0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 1, 2]
    const frames = stages.map((stage, index) =>
      referenceFrame(type, stage, 600 + index * 100),
    )
    assert.deepEqual(
      replay(frames).map((event) => event.type),
      [type, type],
    )
  })
}

test('jab reference reproduces the conflicting 160-degree 2D / 142-degree 3D elbow readings', () => {
  const frame = referenceFrame('jab', 2, 1000)
  const point = (joint) =>
    frame.keypoints.find((point) => point.name === `left_${joint}`)
  assert.ok(
    Math.abs(
      angleDeg(point('shoulder'), point('elbow'), point('wrist')) - 160,
    ) < 2,
  )
  const history = [
    referenceFrame('jab', 0, 800),
    referenceFrame('jab', 1, 900),
    frame,
  ]
  const result = classifyPunch(history, {})
  assert.equal(result.debug[0].elbowAngle3D, 142)
  assert.equal(result.punch?.type, 'jab')
})

test('a visible straight can finish when noisy 3D reach stalls for the last frame', () => {
  const frames = [0, 0, 0, 1, 2].map((stage, index) =>
    referenceFrame('jab', stage, 600 + index * 100),
  )
  frames.at(-1).keypoints3D = structuredClone(frames.at(-2).keypoints3D)
  assert.deepEqual(
    replay(frames).map((event) => event.type),
    ['jab'],
  )
})

test('a slow uppercut rising from below the shoulder retains its bent elbow', () => {
  // Lift both elbow and wrist together, keeping a 90-degree elbow. This
  // should remain an uppercut even when its endpoint is near the face.
  const frames = [0, 0, 0, 30, 60, 90, 90, 90, 90, 90, 90].map(
    (rise, index) => ({
      time: 600 + index * 100,
      keypoints: [
        { name: 'nose', x: 150, y: 70 },
        { name: 'left_shoulder', x: 100, y: 100 },
        { name: 'right_shoulder', x: 200, y: 100 },
        { name: 'left_hip', x: 100, y: 250 },
        { name: 'left_elbow', x: 140, y: 200 - rise },
        { name: 'left_wrist', x: 190 - rise / 2, y: 180 - rise },
      ],
    }),
  )
  assert.deepEqual(
    replay(frames).map((event) => event.type),
    ['uppercut'],
  )
})

test('raising an already straight arm does not count as extending a punch', () => {
  const frames = [0, 0, 0, 20, 40, 60].map((rotation, index) => {
    const angle = (rotation * Math.PI) / 180
    return {
      time: 600 + index * 100,
      keypoints: [
        { name: 'nose', x: 150, y: 70 },
        { name: 'left_shoulder', x: 100, y: 100 },
        { name: 'right_shoulder', x: 200, y: 100 },
        { name: 'left_hip', x: 100, y: 250 },
        {
          name: 'left_elbow',
          x: 100 + 60 * Math.cos(angle),
          y: 100 - 60 * Math.sin(angle),
        },
        {
          name: 'left_wrist',
          x: 100 + 120 * Math.cos(angle),
          y: 100 - 120 * Math.sin(angle),
        },
      ],
    }
  })
  assert.deepEqual(replay(frames), [])
})

test('a tracking gap cannot connect guard and endpoint into a new punch', () => {
  const frames = [
    referenceFrame('jab', 0, 600),
    referenceFrame('jab', 1, 700),
    referenceFrame('jab', 2, 2000),
  ]
  assert.deepEqual(replay(frames), [])
})

for (const speed of Object.keys(speedProfiles)) {
  test(`${speed}: reference straights do not become uppercuts`, () => {
    const interval = { form: 180, casual: 90, intense: 45 }[speed]
    for (const type of ['jab', 'cross']) {
      const frames = [0, 0, 0, 1, 2, 2, 2, 1, 0].map((stage, index) =>
        referenceFrame(type, stage, 600 + index * interval),
      )
      assert.deepEqual(
        replay(frames, speed).map((event) => event.type),
        [type],
      )
    }
  })

  for (const side of ['left', 'right']) {
    test(`${speed}: compact ${side} uppercut can start above the shoulder`, () => {
      const interval = speedProfiles[speed].frameIntervalMs
      const other = side === 'left' ? 'right' : 'left'
      const frames = [0, 0, 0, 10, 20, 30, 30, 30, 30, 30, 30, 30].map(
        (rise, index) => ({
          time: 600 + index * interval,
          keypoints: [
            { name: 'nose', x: 150, y: 70 },
            { name: `${side}_shoulder`, x: 100, y: 100 },
            { name: `${other}_shoulder`, x: 200, y: 100 },
            { name: `${side}_hip`, x: 100, y: 250 },
            { name: `${side}_elbow`, x: 155, y: 125 - rise },
            // Forearm remains perpendicular to the upper arm (90-degree elbow).
            { name: `${side}_wrist`, x: 175 - 0.8 * rise, y: 81 - rise },
          ],
        }),
      )
      const events = replay(frames, speed)
      assert.deepEqual(
        events.map((event) => event.type),
        ['uppercut'],
      )
      assert.equal(events[0].side, side)
      const withWorld = frames.map((frame) => ({
        ...frame,
        keypoints3D: frame.keypoints.map((point) => ({
          ...point,
          x: point.x / 300,
          y: point.y / 300,
          z: 0,
        })),
      }))
      assert.deepEqual(
        replay(withWorld, speed).map((event) => event.type),
        ['uppercut'],
      )
    })
  }
}

test('intense counts two quick jabs after recoil, within the casual cooldown', () => {
  const frames = [0, 0, 0, 1, 2, 1, 0, 0, 1, 2].map((stage, index) =>
    referenceFrame('jab', stage, 600 + index * 40),
  )
  const events = replay(frames, 'intense')
  assert.deepEqual(
    events.map((event) => event.type),
    ['jab', 'jab'],
  )
  assert.equal(events[1].time - events[0].time, 200)
  assert.equal(replay(frames, 'casual').length, 1)
})

test('intense does not double-count one continuing extension', () => {
  const frames = [0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2].map((stage, index) => {
    const frame = referenceFrame('cross', stage, 600 + index * 40)
    if (index > 4) {
      frame.keypoints3D = frame.keypoints3D.map((point) => ({
        ...point,
        y: point.y * (1 + (index - 4) * 0.08),
        z: point.z * (1 + (index - 4) * 0.08),
      }))
    }
    return frame
  })
  assert.deepEqual(
    replay(frames, 'intense').map((event) => event.type),
    ['cross'],
  )
})
