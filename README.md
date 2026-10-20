# ShadowBoxer

ShadowBoxer turns a webcam into an interactive boxing trainer. Practice orthodox jabs, crosses, hooks, and uppercuts, follow rotating combos, and track your rounds with pose detection that runs entirely in your browser.

## Features

- Real-time pose tracking and punch feedback, with separate sounds for registered punches and incorrect combo moves.
- Three-minute rounds with Form, Casual, and Intense pacing, plus pause, resume, and reset controls.
- Combo progress, punch counts, and workout summaries saved locally in your browser.
- Automatic pause when the tab is hidden or tracking becomes unavailable, with camera and model recovery controls.
- Optional local recordings with video, landmark data, and a blank labeling template for reviewing movement.

No account, backend server, database service, or environment variables are required.

## Run locally

Use a recent **Node.js 22** release (22.12 or later), npm, `curl`, and `tar`.

```sh
nvm use
npm ci
npm run dev
```

Open the URL printed by Vite and allow camera access. Start a round once the camera and pose model are ready. A modern browser with WebGL is required. Camera access requires HTTPS on public hosts; localhost also works.

Development and production builds automatically download two pinned BlazePose model archives and verify their SHA-256 checksums. The first run needs internet access. Subsequent runs verify cached archives in `.cache/pose-models/`; model weights and build output are generated, not committed. If an archive is corrupt, remove `.cache/pose-models/` and run `npm run models:prepare` again.

## Development and validation

```sh
npm run format:check     # Check formatting; use npm run format to apply it
npm run lint             # Frontend, scripts, and tests
npm test                 # Classifier, combos, timers, storage, recordings, model setup
npm run build            # Production output: frontend/dist
npm run preview          # Preview the production build locally
```

The production browser suite starts its own static server and uses a synthetic camera with the real pose models:

```sh
npx playwright install chromium
npm run test:browser
```

Run `npm run build` first. On Linux, use `npx playwright install --with-deps chromium` to install browser system dependencies too. Set `CHROME_PATH` to use an existing Chrome executable. For an actual three-minute offline round and recording-limit check, run `FULL_ROUND_SMOKE=1 npm run test:browser`. The default suite accelerates the round clock.

GitHub Actions runs formatting, lint, unit tests, a production build, and the browser suite on Ubuntu with Node 22. Automated camera tests do not replace testing real punches and audio on physical devices. An optional synthetic classifier benchmark is available with `npm run benchmark`.

## Stack and structure

| Layer                | Technology                                     |
| -------------------- | ---------------------------------------------- |
| Interface            | React 19, Tailwind CSS 4                       |
| Build                | Vite 7, npm workspaces                         |
| Pose detection       | TensorFlow.js, BlazePose, WebGL                |
| Browser capabilities | IndexedDB, Web Audio, MediaRecorder            |
| Validation           | ESLint, Prettier, Node test runner, Playwright |
| Hosting              | Static frontend on Vercel                      |

```text
frontend/
  src/
    assets/sounds/     Punch and incorrect-combo audio
    components/       Camera, round controls, combos, recordings, history
    hooks/            Audio playback
    lib/              Model configuration, recording exports, local persistence
    training/         Punch classifier, combo rules, speed profiles, round engine
scripts/              Model preparation, browser checks, static test server, benchmark
tests/                Automated unit and integration tests
.github/workflows/    Continuous integration
vercel.json           Build settings and response headers
```

The round engine is independent of React and persistence. Camera landmarks feed the classifier locally; React displays the round state. Completed summaries are saved to IndexedDB, and failed saves can be retried without duplicating a workout.

All four public scripts have a purpose: `prepare-pose-models.mjs` is required by development and builds, `browser-smoke.mjs` validates the production app, `static-server.mjs` serves that build for tests, and `benchmark-classifier.mjs` measures classifier performance without recordings.

## Privacy and browser storage

Camera frames, landmarks, and recordings stay on your device. Pose models are served from the app's own origin. The interface loads display fonts from Google Fonts.

History belongs to the current browser and site origin; it is not synced or backed up. Clearing site data, private browsing cleanup, or browser eviction can remove it. Unfinished rounds and unsaved results do not survive refresh. Download recording exports before leaving the page. Different Vercel preview domains have separate histories.

Recordings are silent and limited to three minutes. Supported browsers use H.264 MP4, with a labeled WebM fallback; training still works if recording is unavailable. The exported video is unmirrored. Landmark timestamps describe inference samples, not encoded video frames. The labeling template uses a 30 FPS timebase: convert video to constant 30 FPS before labeling, and verify its alignment with the landmarks.

## Deploy to Vercel

Import this repository using these settings. Keep the **Root Directory at the repository root**, because the workspace build needs the root scripts and lockfile.

| Setting               | Value                 |
| --------------------- | --------------------- |
| Framework Preset      | Vite                  |
| Root Directory        | Repository root (`.`) |
| Install Command       | `npm ci`              |
| Build Command         | `npm run build`       |
| Output Directory      | `frontend/dist`       |
| Node.js Version       | 22.x                  |
| Environment variables | None                  |

`vercel.json` sets the commands, output directory, security headers, and caching. Hashed assets use immutable caching; model files revalidate. Missing assets return 404. The build needs access to npm and Kaggle to download dependencies and the checksum-pinned model archives.

1. Create an HTTPS preview deployment and confirm both models load with a fresh browser cache.
2. Test a real camera and audio, all four punches, each pace, combos, pause/resume/reset, and a full round. Check history after refresh and recording downloads. Verify hidden-tab pause and recovery after denying camera access or interrupting model loading.
3. Test desktop Chromium, Safari/iOS, and Android Chrome before promoting the preview to production. After models load, verify a round also works offline.

Vercel's deployment history can restore a previous frontend release. Browser data is separate from deployments, so keep IndexedDB schema compatibility in mind when rolling back.

See the official [Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite), [project configuration reference](https://vercel.com/docs/project-configuration/vercel-json), and [Node.js version settings](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
