import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveBuild } from './static-server.mjs'

const buildRoot = path.resolve(
  process.env.BUILD_DIR ??
    fileURLToPath(new URL('../frontend/dist/', import.meta.url)),
)
const { server, url } = await serveBuild(buildRoot)
let browser
const requests = [],
  errors = []
try {
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--enable-unsafe-swiftshader',
    ],
  })
  console.log(
    `Browser: ${browser.version()}; synthetic camera, real BlazePose models`,
  )
  const context = await browser.newContext({
    permissions: ['camera'],
    viewport: { width: 1440, height: 1000 },
  })
  await context.addInitScript(() => {
    const now = performance.now.bind(performance)
    window.__offset = 0
    performance.now = () => now() + window.__offset
    for (const GL of [
      window.WebGLRenderingContext,
      window.WebGL2RenderingContext,
    ].filter(Boolean)) {
      const readPixels = GL.prototype.readPixels
      GL.prototype.readPixels = function (...args) {
        if (window.__failInference)
          throw new Error('Injected graphics readback failure')
        return readPixels.apply(this, args)
      }
    }
    const open = indexedDB.open.bind(indexedDB)
    indexedDB.open = (...args) => {
      if (window.__failStorage)
        throw new DOMException('Test storage failure', 'QuotaExceededError')
      return open(...args)
    }
  })
  context.on('request', (req) =>
    requests.push({ url: req.url(), method: req.method() }),
  )
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  await expect(
    page.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  await expect(page.getByRole('button', { name: 'Debug Off' })).toBeVisible()
  if (process.env.SMOKE_SCREENSHOT)
    await page.screenshot({
      path: process.env.SMOKE_SCREENSHOT,
      fullPage: true,
    })
  const home = await context.request.get(url)
  assert.equal(home.headers()['x-content-type-options'], 'nosniff')
  assert.equal(
    home.headers()['permissions-policy'],
    'camera=(self), microphone=()',
  )
  assert.equal(
    home.headers()['referrer-policy'],
    'strict-origin-when-cross-origin',
  )
  for (const model of ['detector', 'landmark-full']) {
    const response = await context.request.get(
      `${url}/models/blazepose/${model}/model.json`,
    )
    assert.equal(response.status(), 200)
    const manifest = await response.json()
    for (const group of manifest.weightsManifest)
      for (const shard of group.paths) {
        const result = await context.request.get(
          `${url}/models/blazepose/${model}/${shard}`,
        )
        assert.equal(result.status(), 200)
        assert.ok((await result.body()).length > 0)
      }
  }
  assert.equal(
    (await context.request.get(`${url}/models/missing.json`)).status(),
    404,
  )
  assert.equal(
    (await context.request.get(`${url}/assets/missing.js`)).status(),
    404,
  )
  console.log(
    'PASS model manifests/shards, missing-asset 404s and startup readiness',
  )
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Start Round', exact: true }).click()
  await expect(page.getByText('Round Live', { exact: true })).toBeVisible()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByText('Round Live', { exact: true })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByText('Round Paused', { exact: true })).toBeVisible()
  const clock = await page.locator('h2').first().textContent()
  await page.waitForTimeout(1200)
  assert.equal(await page.locator('h2').first().textContent(), clock)
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.evaluate(() => {
    window.__failStorage = true
  })
  await page.getByRole('button', { name: 'End', exact: true }).click()
  await expect(page.getByText(/completed workout\(s\) not saved/)).toBeVisible()
  assert.equal(
    await page
      .getByText('Workout saved in this browser.', { exact: true })
      .count(),
    0,
  )
  await page.getByRole('button', { name: 'Start Round', exact: true }).click()
  await expect(page.getByText(/completed workout\(s\) not saved/)).toBeVisible()
  await page.getByRole('button', { name: 'End', exact: true }).click()
  await page.evaluate(() => {
    window.__failStorage = false
  })
  await page.getByRole('button', { name: 'Retry storage', exact: true }).click()
  await expect(page.getByText('2 stored', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start Round', exact: true }).click()
  await page.evaluate(() => {
    window.__offset += 180001
  })
  await expect(page.getByText('Round Complete', { exact: true })).toBeVisible()
  await expect(page.getByText('3 stored', { exact: true })).toBeVisible()
  console.log(
    'PASS offline start/pause/resume/end, failed save retained across rounds, retry, elapsed-time expiry',
  )
  await context.setOffline(false)
  await page.reload()
  await expect(page.getByText('3 stored', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  const second = await context.newPage()
  second.on('pageerror', (error) => errors.push(error.message))
  await second.goto(url)
  await expect(
    second.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: 'Start Round', exact: true }).click()
  await expect(second.getByText('Round Ready', { exact: true })).toBeVisible()
  // Headless tabs do not reliably generate OS visibility changes: dispatch the browser event explicitly.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByText('Round Paused', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    delete document.hidden
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByText('Round Paused', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await second.getByRole('button', { name: 'Start Round', exact: true }).click()
  await Promise.all([
    page.getByRole('button', { name: 'End', exact: true }).click(),
    second.getByRole('button', { name: 'End', exact: true }).click(),
  ])
  await expect(
    second.getByText('Workout saved in this browser.', { exact: true }),
  ).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('5 stored', { exact: true })).toBeVisible()
  await second.close()
  console.log(
    'PASS refresh history, independent tabs, concurrent saves and hidden-tab explicit-resume policy',
  )
  await page
    .getByRole('button', { name: 'Record punches', exact: true })
    .click()
  await page.waitForTimeout(5000)
  await page
    .getByRole('button', { name: 'Stop recording', exact: true })
    .click()
  await expect(
    page.getByRole('link', { name: 'Download landmarks', exact: true }),
  ).toBeVisible()
  const data = await page
    .getByRole('link', { name: 'Download landmarks', exact: true })
    .evaluate(async (a) => (await fetch(a.href)).json())
  assert.equal(data.video.audio, false)
  assert.ok(data.summary.samples > 0, 'Real inference must complete')
  assert.ok(
    data.frames.every((frame, i) => !i || frame.time > data.frames[i - 1].time),
  )
  console.log(
    `PASS local recording/export: ${data.video.mimeType}, ${data.summary.samples} samples, ${data.summary.inferenceFps.toFixed(2)} inference FPS, camera-reported ${data.video.cameraFps} FPS`,
  )
  await page.getByRole('button', { name: 'Start Round', exact: true }).click()
  await page.evaluate(() => {
    const track = document.querySelector('video').srcObject.getVideoTracks()[0]
    track.stop()
    track.dispatchEvent(new Event('ended'))
  })
  await expect(page.getByText('Round Paused', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Retry camera', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeEnabled({ timeout: 30000 })
  await page.getByRole('button', { name: 'End', exact: true }).click()
  console.log('PASS camera disconnect auto-pause and retry')
  await page.getByRole('button', { name: 'Start Round', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByText('Round Ready', { exact: true })).toBeVisible()
  console.log('PASS reset confirmation/cancellation')
  await page.getByRole('button', { name: 'Start Round', exact: true }).click()
  await page.evaluate(() => {
    window.__failInference = true
  })
  await expect(
    page.getByText('Pose tracking stopped.', { exact: false }),
  ).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Round Paused', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeDisabled()
  await page.evaluate(() => {
    window.__failInference = false
  })
  await page.getByRole('button', { name: 'Retry model', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: 'End', exact: true }).click()
  console.log('PASS inference failure auto-pause and model retry')
  if (process.env.FULL_ROUND_SMOKE === '1') {
    console.log(
      'Starting real-time 180-second offline round and recording limit check…',
    )
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Start Round', exact: true }).click()
    await page
      .getByRole('button', { name: 'Record punches', exact: true })
      .click()
    await expect(page.getByText('Round Complete', { exact: true })).toBeVisible(
      { timeout: 195000 },
    )
    await expect(
      page.getByRole('button', { name: 'Record punches', exact: true }),
    ).toBeEnabled({ timeout: 10000 })
    const recording = await page
      .getByRole('link', { name: 'Download landmarks', exact: true })
      .evaluate(async (a) => (await fetch(a.href)).json())
    assert.ok(recording.durationMs >= 180000 && recording.durationMs < 182000)
    assert.ok(recording.frames.every((frame) => frame.time <= 180000))
    console.log(
      `PASS real-time offline round/recording expiry: ${recording.durationMs.toFixed(0)}ms, ${recording.summary.samples} samples, ${recording.summary.inferenceFps.toFixed(2)} inference FPS`,
    )
    await context.setOffline(false)
  }
  assert.equal(
    requests.filter(
      (r) =>
        /\/api\/|localhost:3001|kaggle|tfhub/.test(r.url) || r.method !== 'GET',
    ).length,
    0,
  )
  assert.deepEqual(errors, [])
  await context.close()

  for (const [name, init, text] of [
    [
      'permission denied',
      () => {
        navigator.mediaDevices.getUserMedia = async () => {
          throw new DOMException('denied', 'NotAllowedError')
        }
      },
      'Camera permission denied.',
    ],
    [
      'camera unavailable',
      () => {
        navigator.mediaDevices.getUserMedia = async () => {
          throw new DOMException('missing', 'NotFoundError')
        }
      },
      'Camera unavailable or in use.',
    ],
    [
      'unsupported recorder',
      () => {
        window.MediaRecorder = undefined
      },
      'Recording is unsupported in this browser.',
    ],
  ]) {
    const ctx = await browser.newContext({ permissions: ['camera'] })
    await ctx.addInitScript(init)
    const p = await ctx.newPage()
    await p.goto(url)
    await expect(p.getByText(text, { exact: false })).toBeVisible({
      timeout: 90000,
    })
    if (name === 'unsupported recorder') {
      await expect(
        p.getByRole('button', { name: 'Start Round', exact: true }),
      ).toBeEnabled({ timeout: 90000 })
      await expect(
        p.getByRole('button', { name: 'Record punches', exact: true }),
      ).toBeDisabled()
    } else
      await expect(
        p.getByRole('button', { name: 'Start Round', exact: true }),
      ).toBeDisabled()
    await ctx.close()
    console.log(`PASS ${name}`)
  }
  const graphics = await browser.newContext({ permissions: ['camera'] })
  await graphics.addInitScript(() => {
    for (const canvas of [HTMLCanvasElement, globalThis.OffscreenCanvas].filter(
      Boolean,
    )) {
      const getContext = canvas.prototype.getContext
      canvas.prototype.getContext = function (type, ...args) {
        if (/webgl/.test(type)) return null
        return getContext.call(this, type, ...args)
      }
    }
  })
  const graphicsPage = await graphics.newPage()
  await graphicsPage.goto(url)
  await expect(
    graphicsPage.getByText('Cannot load the pose model.', { exact: false }),
  ).toBeVisible({ timeout: 90000 })
  await expect(
    graphicsPage.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeDisabled()
  await graphics.close()
  console.log('PASS unavailable WebGL recovery message')
  const fallback = await browser.newContext({ permissions: ['camera'] })
  await fallback.addInitScript(() => {
    const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder)
    MediaRecorder.isTypeSupported = (type) =>
      !type.includes('mp4') && supported(type)
  })
  const fallbackPage = await fallback.newPage()
  await fallbackPage.goto(url)
  await expect(
    fallbackPage.getByRole('button', { name: 'Record punches', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  await fallbackPage
    .getByRole('button', { name: 'Record punches', exact: true })
    .click()
  await fallbackPage.waitForTimeout(1200)
  await fallbackPage
    .getByRole('button', { name: 'Stop recording', exact: true })
    .click()
  await expect(
    fallbackPage.getByRole('link', { name: 'Download WEBM', exact: true }),
  ).toBeVisible()
  const fallbackData = await fallbackPage
    .getByRole('link', { name: 'Download landmarks', exact: true })
    .evaluate(async (a) => (await fetch(a.href)).json())
  assert.match(fallbackData.video.mimeType, /webm/)
  await fallback.close()
  console.log('PASS labeled WebM fallback with matching metadata')
  const ctx = await browser.newContext({ permissions: ['camera'] })
  await ctx.route('**/models/**', (route) => route.abort())
  const p = await ctx.newPage()
  await p.goto(url)
  await expect(
    p.getByText('Cannot load the pose model.', { exact: false }),
  ).toBeVisible({ timeout: 90000 })
  await expect(
    p.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeDisabled()
  await ctx.unroute('**/models/**')
  await p.getByRole('button', { name: 'Retry model', exact: true }).click()
  await expect(
    p.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  await ctx.close()
  console.log('PASS failed model download and retry; no API traffic or uploads')
  let bytes = 0
  for (const model of ['detector', 'landmark-full']) {
    const root = path.join(buildRoot, 'models/blazepose', model)
    const manifest = JSON.parse(await readFile(path.join(root, 'model.json')))
    for (const file of [
      'model.json',
      ...manifest.weightsManifest.flatMap((group) => group.paths),
    ])
      bytes += (await stat(path.join(root, file))).size
  }
  console.log(
    `Model payload: ${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)} MiB)`,
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
