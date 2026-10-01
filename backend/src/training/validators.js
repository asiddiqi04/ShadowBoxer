const isFiniteNumber = (value) => Number.isFinite(value)

const validateKeypoint = (keypoint) =>
  keypoint &&
  typeof keypoint === 'object' &&
  typeof keypoint.name === 'string' &&
  keypoint.name.trim() &&
  isFiniteNumber(keypoint.x) &&
  isFiniteNumber(keypoint.y) &&
  (keypoint.z == null || isFiniteNumber(keypoint.z)) &&
  (keypoint.score == null || isFiniteNumber(keypoint.score))

export const validatePoseFramePayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'Request body must be an object.' }
  }

  if (!Array.isArray(payload.keypoints) || payload.keypoints.length === 0) {
    return { ok: false, message: 'keypoints must be a non-empty array.' }
  }

  if (!payload.keypoints.every(validateKeypoint)) {
    return {
      ok: false,
      message: 'Each keypoint must include name, numeric x, and numeric y values.',
    }
  }

  if (payload.keypoints3D != null && (
    !Array.isArray(payload.keypoints3D) ||
    !payload.keypoints3D.every((point) => validateKeypoint(point) && isFiniteNumber(point.z))
  )) {
    return { ok: false, message: 'keypoints3D must contain named points with numeric x, y, and z values.' }
  }

  const time = isFiniteNumber(payload.time) && payload.time >= 0 ? payload.time : Date.now()
  const keypoints = payload.keypoints.map((keypoint) => ({
    name: keypoint.name,
    x: keypoint.x,
    y: keypoint.y,
    z: keypoint.z,
    score: keypoint.score,
  }))

  return {
    ok: true,
    value: {
      time,
      keypoints,
      keypoints3D: payload.keypoints3D?.map(({ name, x, y, z, score }) => ({ name, x, y, z, score })),
    },
  }
}
