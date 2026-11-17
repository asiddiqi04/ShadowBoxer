# ShadowBoxer

ShadowBoxer turns a webcam into an interactive boxing trainer. Practice orthodox jabs, crosses, hooks, and uppercuts, follow rotating combos, and track your rounds with pose detection that runs entirely in your browser.

## Features

- Real-time pose tracking and punch feedback, with separate sounds for registered punches and incorrect combo moves.
- Three-minute rounds with Form, Casual, and Intense pacing, plus pause, resume, and reset controls.
- Combo progress, punch counts, and workout summaries saved in your browser, or in your account when you sign in.
- An opening menu that requests camera access only after you choose **Start training**.
- Settings for sound effects and round music (on/off and volume), remembered on each device.
- Optional accounts (Google or email magic link) via Supabase, with cross-device history and a one-time import of guest workouts.
- Automatic pause when the tab is hidden or tracking becomes unavailable, with camera and model recovery controls.

Accounts are optional. Without Supabase environment variables, the app runs guest-only with no backend.

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
npm run test:dev-tools   # Recording/debug checks against a local dev server
```

Run `npm run build` first. On Linux, use `npx playwright install --with-deps chromium` to install browser system dependencies too. Set `CHROME_PATH` to use an existing Chrome executable. For an actual three-minute offline round check, run `FULL_ROUND_SMOKE=1 npm run test:browser`. The default suite accelerates the round clock.

GitHub Actions runs formatting, lint, unit tests, a production build, and both browser suites on Ubuntu with Node 22. Automated camera tests do not replace testing real punches and audio on physical devices. An optional synthetic classifier benchmark is available with `npm run benchmark`.

## Stack and structure

| Layer                | Technology                                                |
| -------------------- | --------------------------------------------------------- |
| Interface            | React 19, Tailwind CSS 4                                  |
| Build                | Vite 7, npm workspaces                                    |
| Pose detection       | TensorFlow.js, BlazePose, WebGL                           |
| Browser capabilities | IndexedDB, Web Audio (MediaRecorder in local development) |
| Validation           | ESLint, Prettier, Node test runner, Playwright            |
| Hosting              | Static frontend on Vercel                                 |

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

The scripts each have a purpose: `prepare-pose-models.mjs` is required by development and builds, `browser-smoke.mjs` validates the production app, `static-server.mjs` serves that build for tests, `dev-tools-smoke.mjs` checks local-only recording/debug tools, and `benchmark-classifier.mjs` measures classifier performance without recordings.

## Accounts with Supabase (optional)

Signed-in users' completed workout summaries are stored in the `workout_sessions` table. Row-level security limits each user to their own rows. Rows can be read, added, and deleted, but never edited. Guests keep using IndexedDB. After signing in, a guest is offered a one-time import of their browser history. Duplicates are skipped, and a copy stays in the browser.

1. Create a Supabase project. In the SQL editor, run `supabase/migrations/20261116000000_workout_sessions.sql`, or use `supabase db push` with the Supabase CLI.
2. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the project URL and the **anon/publishable** key from Project Settings → API. Never use the `service_role` key in the frontend.
3. Under Authentication → URL Configuration, set the Site URL to your production domain. Add `http://localhost:5173/**` and your Vercel preview pattern (for example, `https://*-<team>.vercel.app/**`) to Redirect URLs.
4. Google sign-in: create a Google Cloud OAuth client (type: web application). Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI, then paste the client ID and secret into Authentication → Providers → Google.
5. In Vercel, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Preview and Production, then redeploy. These are build-time variables.

Magic links use the PKCE flow, so open the link in the same browser that requested it. The Supabase client is loaded on demand, so guest builds never download it.

## Round music

Put one `.mp3`, `.ogg`, or `.m4a` file in `frontend/src/assets/sounds/music/`. It loops while a round runs, pauses with the round, and restarts on the next round. The **Round music** setting appears only when a track is present.

## Privacy and browser storage

Camera frames and landmarks stay on your device. Deployed builds do not include recording or export controls. Pose models are served from the app's own origin. The interface loads display fonts from Google Fonts.

Guest history belongs to the current browser and site origin; it is not synced or backed up. Clearing site data, private browsing cleanup, or browser eviction can remove it. Unfinished rounds and unsaved results do not survive refresh. Different Vercel preview domains have separate histories.

## Local development tools

`npm run dev` enables the classifier debug overlay and punch-testing recorder. Both Vercel Preview and Production deployments use `npm run build`, which removes the recorder and debug UI from the shipped JavaScript. There is no deployed toggle or URL parameter to enable them. The round engine only retains diagnostic rows when local development explicitly enables them.

Local recordings are silent and limited to three minutes. Download recording exports before leaving the page. Supported browsers use H.264 MP4, with a labeled WebM fallback; training still works if recording is unavailable. The exported video is unmirrored. Landmark timestamps describe inference samples, not encoded video frames. The labeling template uses a 30 FPS timebase: convert video to constant 30 FPS before labeling, and verify its alignment with the landmarks.

## Deploy to Vercel

Import this repository using these settings. Keep the **Root Directory at the repository root**, because the workspace build needs the root scripts and lockfile.

| Setting               | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| Framework Preset      | Vite                                                    |
| Root Directory        | Leave blank (repository root)                           |
| Install Command       | `npm ci`                                                |
| Build Command         | `npm run build`                                         |
| Output Directory      | `frontend/dist`                                         |
| Node.js Version       | 22.x                                                    |
| Environment variables | Optional: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

`vercel.json` sets the commands, output directory, security headers, and caching. Hashed assets use immutable caching; model files revalidate. Missing assets return 404. The build needs access to npm and Kaggle to download dependencies and the checksum-pinned model archives.

1. Enable Vercel Authentication with All Deployments protection while testing privately. Create a Preview deployment from `codex/vercel-guest-readiness` and confirm both models load with a fresh browser cache.
2. Test a real camera and audio, all four punches, each pace, combos, pause/resume/reset, and a full round. Check history after refresh and confirm that recording/export and debug controls are absent. Verify hidden-tab pause and recovery after denying camera access or interrupting model loading.
3. Test desktop Chromium, Safari/iOS, and Android Chrome before promoting the preview to production. After models load, verify a round also works offline.

Vercel's deployment history can restore a previous frontend release. Browser data is separate from deployments, so keep IndexedDB schema compatibility in mind when rolling back.

See the official [Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite), [project configuration reference](https://vercel.com/docs/project-configuration/vercel-json), and [Node.js version settings](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
