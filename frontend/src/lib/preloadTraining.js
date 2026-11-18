import { poseModelConfig } from './poseModelConfig'

// The training screen (PoseDetector + TensorFlow.js) is a separate chunk.
// Memoised so React.lazy and the preloader share one download; a failed load
// is forgotten so the next attempt retries.
let detectorModule
export const loadPoseDetector = () =>
  (detectorModule ??= import('../components/PoseDetector').catch((error) => {
    detectorModule = undefined
    throw error
  }))

// Fetch each model manifest and its weight shards so they land in the HTTP
// cache (served immutable) before PoseDetector asks TensorFlow.js for them.
const warmModel = async (manifestUrl) => {
  const response = await fetch(manifestUrl, { priority: 'low' })
  if (!response.ok) return
  const manifest = await response.json()
  const base = new URL(manifestUrl, window.location.href)
  await Promise.all(
    (manifest.weightsManifest ?? [])
      .flatMap((group) => group.paths)
      .map(async (file) => {
        const shard = await fetch(new URL(file, base), { priority: 'low' })
        if (shard.ok) await shard.arrayBuffer()
      }),
  )
}

const constrainedNetwork = () => {
  const connection = navigator.connection
  return Boolean(
    connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ''),
  )
}

let started = false
// Downloads only: no camera, WebGL or model initialisation happens here.
export const preloadTraining = () => {
  if (started) return
  started = true
  const code = loadPoseDetector().catch(() => {})
  if (constrainedNetwork()) return
  void code.then(() =>
    Promise.all(
      [poseModelConfig.detectorModelUrl, poseModelConfig.landmarkModelUrl].map(
        (url) => warmModel(url).catch(() => {}),
      ),
    ),
  )
}

// Preload once the menu has painted and the main thread is idle.
export const preloadTrainingWhenIdle = () => {
  // Safari has no requestIdleCallback; a short extra delay stands in for it.
  const hasIdle = typeof window.requestIdleCallback === 'function'
  let idle
  const timer = setTimeout(() => {
    idle = hasIdle
      ? window.requestIdleCallback(preloadTraining, { timeout: 3000 })
      : setTimeout(preloadTraining, 500)
  }, 500)
  return () => {
    clearTimeout(timer)
    if (idle === undefined) return
    if (hasIdle) window.cancelIdleCallback(idle)
    else clearTimeout(idle)
  }
}
