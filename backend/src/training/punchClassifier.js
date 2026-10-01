import { getSpeedProfile } from './speedProfiles.js'

export const punchTypes = ['jab', 'cross', 'hook', 'uppercut']

export const initialPunchCounts = () => ({
  jab: 0,
  cross: 0,
  hook: 0,
  uppercut: 0,
})

export const getPoint = (keypoints, name, minScore = 0.5) =>
  keypoints?.find((pt) => pt.name === name && (pt.score ?? 1) >= minScore)

export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export const angleDeg = (a, b, c, distance = dist2d) => {
  const ab = distance(a, b)
  const bc = distance(b, c)
  const ac = distance(a, c)
  if (ab === 0 || bc === 0) return 0
  const cos = (ab * ab + bc * bc - ac * ac) / (2 * ab * bc)
  const clamped = Math.min(1, Math.max(-1, cos))
  return (Math.acos(clamped) * 180) / Math.PI
}

const dist3d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

const armGeometry3D = (frame, side) => {
  const points = ['shoulder', 'elbow', 'wrist'].map((joint) =>
    getPoint(frame?.keypoints3D, `${side}_${joint}`))
  if (points.some((point) => !point || ![point.x, point.y, point.z].every(Number.isFinite))) {
    return null
  }
  const [shoulder, elbow, wrist] = points
  const armLength = dist3d(shoulder, elbow) + dist3d(elbow, wrist)
  if (armLength < 0.1) return null
  return {
    elbowAngle: angleDeg(shoulder, elbow, wrist, dist3d),
    reach: dist3d(shoulder, wrist),
    armLength,
  }
}

const armGeometry2D = (frame, side) => {
  const shoulder = getPoint(frame.keypoints, `${side}_shoulder`)
  const opposite = getPoint(frame.keypoints, side === 'left' ? 'right_shoulder' : 'left_shoulder')
  const elbow = getPoint(frame.keypoints, `${side}_elbow`)
  const wrist = getPoint(frame.keypoints, `${side}_wrist`)
  if (!shoulder || !opposite || !elbow || !wrist) return null
  const width = Math.max(1, dist2d(shoulder, opposite))
  return {
    elbowAngle: angleDeg(shoulder, elbow, wrist),
    reach: dist2d(shoulder, wrist) / width,
    wristHeight: (shoulder.y - wrist.y) / width,
    wristAcross: (wrist.x - shoulder.x) / width * Math.sign(opposite.x - shoulder.x),
    elbowOut: (shoulder.x - elbow.x) / width * Math.sign(opposite.x - shoulder.x),
    elbowHeight: (shoulder.y - elbow.y) / width,
    forearmFlat: Math.abs(wrist.y - elbow.y) <= Math.abs(wrist.x - elbow.x) * 0.55,
  }
}

const maxFrameGapMs = 250

const armMotion = (side, history, lastPunchTime, profile) => {
  const current = history.at(-1)
  const frames = []
  // Do not join separate punches, tracking gaps, or pauses into one motion.
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const frame = history[index]
    const gap = frames.length ? frames.at(-1).time - frame.time : 0
    if (frame.time <= lastPunchTime || current.time - frame.time > profile.motionWindowMs ||
      (frames.length && (gap <= 0 || gap > maxFrameGapMs))) break
    frames.push(frame)
  }
  const imageArms = frames.map((frame) => armGeometry2D(frame, side))
  const worldArms = frames.map((frame) => armGeometry3D(frame, side))
  const image = armGeometry2D(current, side)
  const world = armGeometry3D(current, side)
  const previousImage = imageArms[1]
  const previousWorld = worldArms[1]
  const recentImages = imageArms.slice(1).filter(Boolean)
  const recentWorlds = worldArms.slice(1).filter(Boolean)
  const imageGain = image && recentImages.length
    ? image.reach - Math.min(...recentImages.map((arm) => arm.reach)) : 0
  const elbowOpening = image && recentImages.length
    ? image.elbowAngle - Math.min(...recentImages.map((arm) => arm.elbowAngle)) : 0
  const worldGain = world && recentWorlds.length
    ? (world.reach - Math.min(...recentWorlds.map((arm) => arm.reach))) / world.armLength : 0
  // Measure the rise relative to the shoulder so whole-body movement does
  // not supply the uppercut trajectory. A high guard alone is insufficient.
  const roseFromShoulder = Boolean(image && recentImages.some(arm =>
    arm.wristHeight < 0 && image.wristHeight - arm.wristHeight > 0.35))
  // A hook first lifts/flares the elbow, then sweeps the fist inward.
  // Lateral drift by itself also occurs during straight-punch preparation.
  const sweptAcross = Boolean(image && previousImage && image.wristAcross > previousImage.wristAcross &&
    recentImages.some(arm => ((arm.elbowOut > 0.3 && arm.elbowHeight > -0.1) ||
      (arm.elbowOut > 0.5 && arm.forearmFlat)) &&
      image.wristAcross - arm.wristAcross > 0.25))

  // Camera tilt can make a straight punch travel upward in the image. Look
  // for elbow opening and reach, not forearm orientation relative to the floor.
  // Neither estimate gets to veto strong temporal evidence from the other.
  // A slightly bent endpoint is usable when the trajectory supplies strong
  // opening and reach evidence; the relaxed angle alone is not sufficient.
  const extendedImage = image && (image.elbowAngle >= 150 ||
    (image.elbowAngle >= 145 && elbowOpening > 60 && imageGain > 0.25))
  // Dropping the guarding arm and carrying a bent hook across the torso can
  // both look straight in projection. Neither establishes a 2D straight;
  // reliable 3D extension can still identify a downward-directed punch.
  const loweringArm = image && image.wristHeight < -0.75 &&
    -image.wristHeight > Math.abs(image.wristAcross) * 1.5
  const bentAcrossBody = image && image.wristAcross > 1 && world && world.elbowAngle <= 140
  const straight2D = Boolean(extendedImage && previousImage && !loweringArm && !bentAcrossBody &&
    imageGain > 0.18 && elbowOpening > 20 && image.reach >= previousImage.reach - 0.02)
  const straight3D = Boolean(world && previousWorld && world.elbowAngle >= 145 &&
    worldGain > 0.1 && (world.reach - previousWorld.reach) / world.armLength >= -0.015)
  const straightShape = Boolean((image && image.elbowAngle >= 150) || (world && world.elbowAngle >= 145))
  const uppercutFromLow = Boolean(image && recentImages.some((arm) =>
    arm.wristHeight < -0.2 && image.wristHeight - arm.wristHeight > 0.25))
  const openingIntoStraight = imageGain > 0.18 && elbowOpening > 35
  // The sideways/upward portion of a straight's recoil is not another
  // curved punch. Wait until the elbow stops closing before considering it.
  const returningFromStraight = Boolean(image && previousImage &&
    image.elbowAngle < previousImage.elbowAngle - 5 &&
    recentImages.some(arm => arm.elbowAngle >= 145 && arm.elbowAngle - image.elbowAngle > 20))
  // A compact uppercut can start at chin-height. Look for a rising path
  // whose elbow remains bent, rather than requiring a drop below the shoulder.
  const uppercutFromGuard = Boolean(image && image.elbowAngle >= 65 && image.elbowAngle <= 132 &&
    recentImages.some((arm) => arm.elbowAngle >= 65 && arm.elbowAngle <= 132 &&
      Math.abs(image.elbowAngle - arm.elbowAngle) <= 15 && image.wristHeight - arm.wristHeight > 0.25) &&
    frames.length >= 3 && current.time - frames.at(-1).time >= profile.uppercutConfirmMs &&
    elbowOpening <= 20)

  return { world, straight2D, straight3D, straightShape, uppercutFromLow, uppercutFromGuard,
    openingIntoStraight, returningFromStraight, roseFromShoulder, sweptAcross }
}

const hasRecovered = (side, history, lastPunchTime) => {
  const punchIndex = history.findIndex((frame) => frame.time === lastPunchTime)
  if (!lastPunchTime || punchIndex < 0) return true
  const punchedImage = armGeometry2D(history[punchIndex], side)
  const punchedWorld = armGeometry3D(history[punchIndex], side)
  // Shorter cooldowns must not count one continuing extension twice. Require
  // observable recoil between the previous detection and the current frame.
  return history.slice(punchIndex + 1, -1).some((frame) => {
    const image = armGeometry2D(frame, side)
    const world = armGeometry3D(frame, side)
    return (image && punchedImage && (image.reach < punchedImage.reach - 0.12 ||
      image.elbowAngle < punchedImage.elbowAngle - 20 || image.wristHeight < punchedImage.wristHeight - 0.18)) ||
      (world && punchedWorld && world.reach < punchedWorld.reach - punchedWorld.armLength * 0.08)
  })
}

export const scorePunchForSide = (side, history, lastPunchBySide, speed = 'casual') => {
  if (history.length < 3) return { detection: null, debug: null }
  const current = history[history.length - 1]
  const prev = history[history.length - 2]
  const older = history[history.length - 5]
  const now = current.time
  const profile = getSpeedProfile(speed)
  const lastPunchTime = lastPunchBySide[side] ?? 0
  const cooldownRemaining = lastPunchTime > 0 ? Math.max(0, profile.cooldownMs - (now - lastPunchTime)) : 0

  const kps = current.keypoints
  const prevKps = prev?.keypoints
  const oldKps = older?.keypoints

  const wrist = getPoint(kps, `${side}_wrist`)
  const elbow = getPoint(kps, `${side}_elbow`)
  const shoulder = getPoint(kps, `${side}_shoulder`)
  const hip = getPoint(kps, `${side}_hip`)
  const oppShoulder = getPoint(kps, side === 'left' ? 'right_shoulder' : 'left_shoulder')
  const nose = getPoint(kps, 'nose', 0.3)

  if (!wrist || !elbow || !shoulder || !hip || !oppShoulder || !nose) {
    return { detection: null, debug: null }
  }

  const shoulderWidth = Math.max(1, dist2d(shoulder, oppShoulder))
  const prevWrist = prevKps ? getPoint(prevKps, `${side}_wrist`, 0.25) : null
  const olderWrist = oldKps ? getPoint(oldKps, `${side}_wrist`, 0.25) : null

  // Normalize motion to 100 ms so higher capture rates do not make hooks and
  // uppercuts appear slower just because each individual step is smaller.
  const elapsed = current.time - prev.time
  const motionScale = elapsed > 0 && elapsed <= maxFrameGapMs ? Math.min(4, 100 / elapsed) : 0
  const vel = prevWrist ? dist2d(wrist, prevWrist) / shoulderWidth * motionScale : 0
  const lateralMove = prevWrist ? (wrist.x - prevWrist.x) / shoulderWidth * motionScale : 0
  const verticalMove = prevWrist ? (prevWrist.y - wrist.y) / shoulderWidth * motionScale : 0
  const lateralAbs = Math.abs(lateralMove)
  const verticalAbs = Math.abs(verticalMove)
  const extensionNow = dist2d(wrist, shoulder) / shoulderWidth
  const extensionPrev = prevWrist ? dist2d(prevWrist, shoulder) / shoulderWidth : extensionNow
  const extensionDelta = extensionNow - extensionPrev
  const depthDelta =
    prevWrist && wrist.z != null && prevWrist.z != null ? prevWrist.z - wrist.z : 0

  const elbowAngle = angleDeg(shoulder, elbow, wrist)
  const elbowBent = elbowAngle >= 80 && elbowAngle <= 132
  const elbowMostlyStraight = elbowAngle >= 150
  const forearmDx = wrist.x - elbow.x
  const forearmDy = wrist.y - elbow.y
  const forearmRawAngle = Math.abs((Math.atan2(forearmDy, forearmDx) * 180) / Math.PI)
  const forearmAngleToHorizontal = Math.min(forearmRawAngle, Math.abs(180 - forearmRawAngle))
  const armParallelFloor = forearmAngleToHorizontal <= 28
  const armPerpendicularFloor = forearmAngleToHorizontal >= 62
  const nearCenter = Math.abs(wrist.x - nose.x) / shoulderWidth < 0.5
  const nearHead = wrist.y < nose.y + 0.25 * shoulderWidth
  const shoulderHeightBand = Math.abs(wrist.y - shoulder.y) < 0.35 * shoulderWidth
  const lowPrep = olderWrist ? olderWrist.y - shoulder.y > 0.45 * shoulderWidth : false
  const risingFromLow = olderWrist
    ? olderWrist.y - shoulder.y > 0.3 * shoulderWidth && olderWrist.y - wrist.y > 0.18 * shoulderWidth
    : false
  const verticalBurst = verticalMove > 0.3
  const lateralBurst = lateralAbs > 0.24
  const lateralDominant = lateralBurst && lateralAbs > verticalAbs + 0.05
  const verticalDominant = verticalBurst && verticalMove > lateralAbs + 0.04

  let hookScore = 0
  if (armParallelFloor) hookScore += 28
  if (elbowBent) hookScore += 24
  if (!armParallelFloor) hookScore -= 16
  if (!elbowBent) hookScore -= 14
  if (shoulderHeightBand) hookScore += 22
  if (lateralDominant) hookScore += 22
  if (vel > 0.28) hookScore += 14
  if (extensionDelta > 0.08 && extensionDelta < 0.28) hookScore += 12
  if (depthDelta > -0.02 && depthDelta < 0.04) hookScore += 8
  if (!nearCenter) hookScore += 8
  if (verticalAbs < 0.24) hookScore += 10
  if (!lowPrep) hookScore += 6
  if (elbowMostlyStraight) hookScore -= 14
  if (armPerpendicularFloor) hookScore -= 20
  if (verticalDominant) hookScore -= 20
  if (risingFromLow) hookScore -= 10
  if (depthDelta > 0.035) hookScore -= 8

  let upperScore = 0
  if (armPerpendicularFloor) upperScore += 28
  if (elbowBent) upperScore += 22
  if (!armPerpendicularFloor) upperScore -= 16
  if (!elbowBent) upperScore -= 14
  if (lowPrep) upperScore += 26
  if (verticalDominant) upperScore += 24
  if (risingFromLow) upperScore += 14
  if (elbowAngle >= 80 && elbowAngle <= 130) upperScore += 15
  if (nearHead) upperScore += 10
  if (depthDelta > 0.005) upperScore += 8
  if (lateralAbs < 0.2) upperScore += 10
  if (!shoulderHeightBand) upperScore += 6
  if (extensionNow < 1.6) upperScore += 6
  if (lateralDominant) upperScore -= 18
  if (elbowMostlyStraight) upperScore -= 28
  if (armParallelFloor) upperScore -= 14
  if (shoulderHeightBand && lateralAbs > 0.2) upperScore -= 10
  if (extensionDelta > 0.3) upperScore -= 8

  if (lateralDominant && elbowBent && verticalAbs < 0.25) {
    hookScore += 10
    upperScore -= 6
  }
  if (verticalDominant && lowPrep && risingFromLow) {
    upperScore += 12
    hookScore -= 8
  }

  // Pose labels are anatomical; mirroring the preview does not swap hands.
  // Orthodox stance: left lead hand = jab, right rear hand = cross.
  const straightType = side === 'left' ? 'jab' : 'cross'
  const motion = armMotion(side, history, lastPunchTime, profile)
  // A confirmed lateral arc with a bent world-space elbow takes precedence
  // over a straight-looking projection. Diagonal sweeps need a flatter
  // forearm so rising jabs do not qualify from incidental sideways motion.
  const sweepingBentArm = Boolean(motion.sweptAcross && lateralAbs > profile.minMotion &&
    (lateralDominant || forearmAngleToHorizontal <= 45) &&
    forearmAngleToHorizontal <= 60 && elbowAngle >= 40 && motion.world &&
    motion.world.elbowAngle >= 65 && motion.world.elbowAngle <= 140 && !motion.returningFromStraight)
  const straightEligible = (motion.straight2D && !sweepingBentArm) || motion.straight3D
  const straightScore = straightEligible ? 100 : 0
  const curvedArm = !motion.straightShape && !motion.returningFromStraight
  // Rising from a high guard is also the beginning of a jab/cross. Do not
  // commit an uppercut (and start the cooldown) before its trajectory is clear.
  // A camera-facing uppercut can open dramatically in 2D while staying bent
  // in 3D. Allow that projection only with an upright forearm and a rise
  // from shoulder level or lower. Keep the straight/recoil vetoes above.
  const risingBentArm = Boolean(motion.roseFromShoulder && forearmAngleToHorizontal >= 70 &&
    elbowAngle >= 40 && elbowAngle <= 132 && motion.world &&
    motion.world.elbowAngle >= 65 && motion.world.elbowAngle <= 132)
  const uppercutEligible = curvedArm && (risingBentArm ||
    ((motion.uppercutFromLow || motion.uppercutFromGuard) && !motion.openingIntoStraight &&
      elbowAngle >= 65 && elbowAngle <= 132))
  // Replace the 2D not-bent penalty (-14) with bent-arm evidence (+22)
  // only when this trajectory also has reliable world-space confirmation.
  if (risingBentArm && !elbowBent) upperScore += 36
  if (sweepingBentArm) hookScore = Math.max(hookScore, 100)
  const scoreByType = {
    [straightType]: Math.round(straightScore),
    hook: Math.round(hookScore),
    uppercut: Math.round(upperScore),
  }
  const candidates = [
    { type: straightType, score: scoreByType[straightType], side, eligible: straightEligible },
    // Lateral drift alone can score as a hook while a jab leaves guard.
    // Require its bent-arm shape and exclude an arm opening into a straight.
    { type: 'hook', score: scoreByType.hook, side,
      eligible: sweepingBentArm || (curvedArm && elbowBent && !motion.openingIntoStraight &&
        lateralAbs > profile.minMotion && lateralAbs > verticalAbs) },
    { type: 'uppercut', score: scoreByType.uppercut, side,
      eligible: uppercutEligible && verticalMove > profile.minMotion && verticalMove > lateralAbs },
  ].filter((candidate) => candidate.eligible)
    .map(({ type, score, side }) => ({ type, score, side }))

  const best = candidates.reduce((acc, cur) => (cur.score > acc.score ? cur : acc), {
    type: null,
    score: 0,
    side,
  })

  const threshold = {
    jab: 68,
    cross: 68,
    hook: 62,
    uppercut: 64,
  }

  const recovered = hasRecovered(side, history, lastPunchTime)
  const canDetect = cooldownRemaining === 0 && recovered
  const detection =
    canDetect && best.type && best.score >= threshold[best.type]
      ? best
      : null

  return {
    detection,
    debug: {
      side,
      straightType,
      scoreByType,
      bestType: best.type,
      bestScore: best.score,
      threshold: best.type ? threshold[best.type] : null,
      cooldownRemaining: Math.round(cooldownRemaining),
      recovered,
      cues: {
        lateralDominant,
        verticalDominant,
        lowPrep,
        armParallelFloor,
        armPerpendicularFloor,
        elbowMostlyStraight,
        straight2D: motion.straight2D,
        straight3D: motion.straight3D,
        uppercutFromLow: motion.uppercutFromLow,
        uppercutFromGuard: motion.uppercutFromGuard,
        openingIntoStraight: motion.openingIntoStraight,
        returningFromStraight: motion.returningFromStraight,
        risingBentArm,
        sweepingBentArm,
      },
      elbowAngle3D: motion.world ? Math.round(motion.world.elbowAngle) : null,
      elbowAngle: Math.round(elbowAngle),
      forearmAngleToHorizontal: Math.round(forearmAngleToHorizontal),
    },
  }
}

export const classifyPunch = (history, lastPunchBySide, speed = 'casual') => {
  const left = scorePunchForSide('left', history, lastPunchBySide, speed)
  const right = scorePunchForSide('right', history, lastPunchBySide, speed)
  const candidates = [left.detection, right.detection].filter(Boolean)
  const punch = candidates.length
    ? candidates.reduce((acc, cur) => (cur.score > acc.score ? cur : acc))
    : null

  return {
    punch,
    debug: [left.debug, right.debug].filter(Boolean),
  }
}
