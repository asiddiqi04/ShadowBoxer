import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Exercise tools through the local dev server, never a deployable build.
const server = await createServer({
  root: fileURLToPath(new URL('../frontend/', import.meta.url)),
  configFile: fileURLToPath(
    new URL('../frontend/vite.config.js', import.meta.url),
  ),
  server: { host: '127.0.0.1', port: 0 },
})
let browser
try {
  await server.listen()
  const url = server.resolvedUrls.local[0]
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
  const context = await browser.newContext({ permissions: ['camera'] })
  await context.addInitScript(() => {
    const now = performance.now.bind(performance)
    window.__offset = 0
    performance.now = () => now() + window.__offset
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  await page
    .getByRole('button', { name: 'Start training', exact: true })
    .click()
  const recordButton = page.getByRole('button', {
    name: 'Record punches',
    exact: true,
  })
  await expect(recordButton).toBeEnabled({ timeout: 90000 })
  // Local builds keep the keypoint/skeleton overlay.
  await expect(page.locator('canvas')).toHaveCount(1)
  await page.getByRole('button', { name: 'Debug Off', exact: true }).click()
  await expect(
    page.getByText('Classifier Debug', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Debug On', exact: true }).click()
  await expect(page.getByText('Classifier Debug', { exact: true })).toHaveCount(
    0,
  )
  await recordButton.click()
  await page.waitForTimeout(5000)
  await page
    .getByRole('button', { name: 'Stop recording', exact: true })
    .click()
  const landmarks = page.getByRole('link', {
    name: 'Download landmarks',
    exact: true,
  })
  await expect(landmarks).toBeVisible()
  const data = await landmarks.evaluate(async (a) =>
    (await fetch(a.href)).json(),
  )
  assert.equal(data.video.audio, false)
  assert.ok(data.summary.samples > 0, 'Real inference must complete')
  assert.ok(
    data.frames.every((frame, i) => !i || frame.time > data.frames[i - 1].time),
  )
  await expect(
    page.getByRole('link', { name: /^Download (MP4|WEBM)$/ }),
  ).toBeVisible()
  console.log(
    `PASS local debug toggle and recording/export: ${data.video.mimeType}, ${data.summary.samples} samples`,
  )

  await recordButton.click()
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    window.__offset += 180001
  })
  await expect(recordButton).toBeEnabled({ timeout: 10000 })
  const limited = await landmarks.evaluate(async (a) =>
    (await fetch(a.href)).json(),
  )
  assert.ok(limited.durationMs >= 180000 && limited.durationMs < 185000)
  assert.ok(limited.frames.every((frame) => frame.time <= 180000))
  assert.deepEqual(errors, [])
  await context.close()
  console.log('PASS local recording duration limit with accelerated clock')

  const unsupported = await browser.newContext({ permissions: ['camera'] })
  await unsupported.addInitScript(() => {
    window.MediaRecorder = undefined
  })
  const unsupportedPage = await unsupported.newPage()
  await unsupportedPage.goto(url)
  await unsupportedPage
    .getByRole('button', { name: 'Start training', exact: true })
    .click()
  await expect(
    unsupportedPage.getByText('Recording is unsupported in this browser.', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(
    unsupportedPage.getByRole('button', { name: 'Start Round', exact: true }),
  ).toBeEnabled({ timeout: 90000 })
  await expect(
    unsupportedPage.getByRole('button', {
      name: 'Record punches',
      exact: true,
    }),
  ).toBeDisabled()
  await unsupported.close()
  console.log('PASS unavailable local recorder does not prevent training')

  const fallback = await browser.newContext({ permissions: ['camera'] })
  await fallback.addInitScript(() => {
    const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder)
    MediaRecorder.isTypeSupported = (type) =>
      !type.includes('mp4') && supported(type)
  })
  const fallbackPage = await fallback.newPage()
  await fallbackPage.goto(url)
  await fallbackPage
    .getByRole('button', { name: 'Start training', exact: true })
    .click()
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
  console.log('PASS local WebM fallback with matching metadata')
} finally {
  await browser?.close()
  await server.close()
}
