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

// Progress for the loading bars: phase is idle | loading | done | skipped | error,
// percent only ever increases. The code chunk counts for the first 10%.
const CODE_SHARE = 10
let snapshot = { phase: 'idle', percent: 0 }
const listeners = new Set()
const publish = (next) => {
  const percent = Math.min(100, Math.max(snapshot.percent, next.percent ?? 0))
  if (next.phase === snapshot.phase && percent === snapshot.percent) return
  snapshot = { phase: next.phase ?? snapshot.phase, percent }
  listeners.forEach((listener) => listener())
}
export const subscribePreload = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getPreloadSnapshot = () => snapshot

const BYTES = { float32: 4, int32: 4, float16: 2, uint16: 2, uint8: 1, bool: 1 }
// Shard bytes declared by a manifest (independent of HTTP compression).
const manifestBytes = (manifest) =>
  (manifest.weightsManifest ?? [])
    .flatMap((group) => group.weights)
    .reduce(
      (sum, weight) =>
        sum +
        (weight.shape ?? []).reduce((count, size) => count * size, 1) *
          (BYTES[weight.quantization?.dtype ?? weight.dtype] ?? 4),
      0,
    )

// Fetch each model manifest and its weight shards so they land in the HTTP
// cache (served immutable) before PoseDetector asks TensorFlow.js for them.
const warmModels = async (manifestUrls) => {
  const manifests = await Promise.all(
    manifestUrls.map(async (url) => {
      const response = await fetch(url, { priority: 'low' })
      if (!response.ok) throw new Error(`Model manifest ${response.status}`)
      return { url, manifest: await response.json() }
    }),
  )
  const total = manifests.reduce((sum, m) => sum + manifestBytes(m.manifest), 0)
  let loaded = 0
  const report = () =>
    publish({
      percent:
        CODE_SHARE +
        Math.floor(((100 - CODE_SHARE) * loaded) / Math.max(total, 1)),
    })
  await Promise.all(
    manifests.flatMap(({ url, manifest }) => {
      const base = new URL(url, window.location.href)
      return (manifest.weightsManifest ?? [])
        .flatMap((group) => group.paths)
        .map(async (file) => {
          const shard = await fetch(new URL(file, base), { priority: 'low' })
          if (!shard.ok) throw new Error(`Model shard ${shard.status}`)
          if (!shard.body) {
            loaded += (await shard.arrayBuffer()).byteLength
            return report()
          }
          const reader = shard.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            loaded += value.byteLength
            report()
          }
        })
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
  publish({ phase: 'loading' })
  void loadPoseDetector()
    .then(() => {
      if (constrainedNetwork()) return publish({ phase: 'skipped' })
      publish({ percent: CODE_SHARE })
      return warmModels([
        poseModelConfig.detectorModelUrl,
        poseModelConfig.landmarkModelUrl,
      ]).then(() => publish({ phase: 'done', percent: 100 }))
    })
    .catch(() => {
      // Training still loads on demand; allow a later attempt to preload again.
      started = false
      publish({ phase: 'error' })
    })
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
