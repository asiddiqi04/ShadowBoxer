import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveBuild } from './static-server.mjs'

const buildRoot = path.resolve(
  process.env.BUILD_DIR ??
    fileURLToPath(new URL('../frontend/dist/', import.meta.url)),
)
// Production artifacts must not ship the recording implementation or debug UI.
for (const file of await readdir(path.join(buildRoot, 'assets'))) {
  if (!file.endsWith('.js')) continue
  const source = await readFile(path.join(buildRoot, 'assets', file), 'utf8')
  assert.doesNotMatch(
    source,
    /MediaRecorder|Record punches for tuning|Classifier Debug|Download landmarks/,
  )
}
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
    window.__cameraRequests = 0
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    )
    navigator.mediaDevices.getUserMedia = (...args) => {
      window.__cameraRequests++
      return getUserMedia(...args)
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
  // The opening menu must not touch the camera; only Start training may request it.
  await expect(
    page.getByRole('button', { name: 'Start training', exact: true }),
  ).toBeVisible()
  await page.waitForTimeout(1000)
  assert.equal(await page.evaluate(() => window.__cameraRequests), 0)
  await expect(page.locator('video')).toHaveCount(0)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Sound effects' }).uncheck()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(
    page.getByRole('switch', { name: 'Sound effects' }),
  ).not.toBeChecked()
  await page.getByRole('switch', { name: 'Sound effects' }).check()
  await page.keyboard.press('Escape')
  console.log('PASS menu defers camera access; settings persist across reloads')
  await page
    .getByRole('button', { name: 'Start training', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  assert.ok((await page.evaluate(() => window.__cameraRequests)) >= 1)
  await expect(page.getByRole('button', { name: /^Debug / })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Record punches', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('Classifier Debug', { exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByRole('link', { name: /^Download / })).toHaveCount(0)
  console.log(
    'PASS production build excludes recording/export implementation and debug controls',
  )
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
  await page
    .getByRole('button', { name: 'Start training', exact: true })
    .click()
  await expect(page.getByText('3 stored', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  const second = await context.newPage()
  second.on('pageerror', (error) => errors.push(error.message))
  await second.goto(url)
  await second
    .getByRole('button', { name: 'Start training', exact: true })
    .click()
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
    console.log('Starting real-time 180-second offline round check…')
    await context.setOffline(true)
    const started = Date.now()
    await page.getByRole('button', { name: 'Start Round', exact: true }).click()
    await expect(page.getByText('Round Complete', { exact: true })).toBeVisible(
      { timeout: 195000 },
    )
    const elapsed = Date.now() - started
    assert.ok(elapsed >= 180000 && elapsed < 195000)
    console.log(`PASS real-time offline round expiry: ${elapsed}ms`)
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
  ]) {
    const ctx = await browser.newContext({ permissions: ['camera'] })
    await ctx.addInitScript(init)
    const p = await ctx.newPage()
    await p.goto(url)
    await p.getByRole('button', { name: 'Start training', exact: true }).click()
    await expect(p.getByText(text, { exact: false })).toBeVisible({
      timeout: 90000,
    })
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
  await graphicsPage
    .getByRole('button', { name: 'Start training', exact: true })
    .click()
  await expect(
    graphicsPage.getByText('Cannot load the pose model.', { exact: false }),
  ).toBeVisible({ timeout: 90000 })
  await expect(
    graphicsPage.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeDisabled()
  await graphics.close()
  console.log('PASS unavailable WebGL recovery message')
  const noRecorder = await browser.newContext({ permissions: ['camera'] })
  await noRecorder.addInitScript(() => {
    Object.defineProperty(window, 'MediaRecorder', {
      get() {
        throw new Error('Production must not access recording APIs')
      },
    })
  })
  const noRecorderPage = await noRecorder.newPage()
  const recorderErrors = []
  noRecorderPage.on('pageerror', (error) => recorderErrors.push(error.message))
  await noRecorderPage.goto(url)
  await noRecorderPage
    .getByRole('button', { name: 'Start training', exact: true })
    .click()
  await expect(
    noRecorderPage.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  await noRecorderPage
    .getByRole('button', { name: 'Start Round', exact: true })
    .click()
  await expect(
    noRecorderPage.getByText('Round Live', { exact: true }),
  ).toBeVisible()
  await noRecorderPage.getByRole('button', { name: 'End', exact: true }).click()
  assert.deepEqual(recorderErrors, [])
  await noRecorder.close()
  console.log('PASS production training never accesses MediaRecorder')
  const ctx = await browser.newContext({ permissions: ['camera'] })
  await ctx.route('**/models/**', (route) => route.abort())
  const p = await ctx.newPage()
  await p.goto(url)
  await p.getByRole('button', { name: 'Start training', exact: true }).click()
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
