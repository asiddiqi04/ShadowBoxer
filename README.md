# ShadowBoxer

A local boxing trainer with webcam pose tracking, jab/cross/hook/uppercut classification, timed combo drills, session history, and MP4 recording with pose-landmark exports. The current stance is orthodox: left jab and right cross.

This is an in-progress local prototype built with React, Vite, Tailwind CSS, TensorFlow.js/BlazePose, Express, and SQLite.

## Requirements

- Node.js 22.12 or newer in the Node 22 series and npm (`.nvmrc` selects Node 22).
- A webcam and a browser with WebGL enabled. Chrome is the recommended starting point. Recording also requires H.264 MP4 support in the browser.
- Internet access to install dependencies and download the pose models on the first start/build.
- Bash, `curl`, and `tar` for the startup/model setup scripts. These are available on macOS and commonly on Linux. On Windows, use WSL for the development commands.

## Clone and run

```bash
git clone https://github.com/asiddiqi04/ShadowBoxer.git
cd ShadowBoxer
# If you use nvm:
nvm install
nvm use
npm ci
npm run dev
```

If Node 22 is already installed without nvm, skip the two nvm commands.

Open **http://localhost:5173** and allow camera access. The launcher starts both the frontend and the backend (http://localhost:3001). Choose **Form**, **Casual**, or **Intense**, then start a round. Stop the launcher with Ctrl+C.

The first start downloads checksum-verified BlazePose files into `frontend/public/models/blazepose/`. Later starts use the local copies. Pose estimation runs in the browser; extracted landmarks go to the local backend for punch classification and combo tracking. There is no external AI inference API or API key to configure.

If the model download fails, run `npm run models:prepare` and try again. For browser model errors, check graphics acceleration/WebGL and use **Retry model** in the app.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the frontend and backend together |
| `npm run dev:frontend` | Start only the Vite frontend |
| `npm run dev:backend` | Start only the Node backend |
| `npm run models:prepare` | Download/check the required pose models |
| `npm run lint` | Check frontend and backend source |
| `npm run build` | Build the frontend into `frontend/dist/`, including models |

The Vite development server proxies `/api` to localhost:3001. A production deployment must provide an API URL through `VITE_API_BASE_URL` at build time or route `/api` to the backend. A frontend build alone does not start the backend or provide session storage.

## Project layout

- `frontend/`: React/Vite UI, webcam capture, BlazePose, and recording/export.
- `backend/`: Express API, geometric classifiers, speed profiles, round/combination logic, and session storage.
- `database/schema.sql`: SQLite schema used to create a fresh local database automatically.
- `scripts/`: local launcher and model setup.

Sessions are stored in `database/data/sessions.sqlite`, which is created on first backend startup. Each clone starts with an empty history. The database, dependencies, generated builds, model downloads, personal recordings, and internal tuning/test tools are not included in the repository. The current backend maintains one active round and is intended for one local user at a time.

## Recording punches

Wait for the model to load, then select **Record punches**. Recording works with or without a running round. Stop recording and download the MP4 video, landmark JSON, and label template before leaving the page. Recordings are unmirrored, contain no audio, and stop automatically after three minutes.

The label template uses 30 FPS video frame numbers, starting at frame 0. Label either a moment (`frame`) or an interval (`startFrame` and `endFrame`), along with `type` (`jab`, `cross`, `hook`, or `uppercut`) and your anatomical `side` (`left` or `right`). Video frames and pose-inference samples have different rates; do not use the landmarks array index as a video frame number.
