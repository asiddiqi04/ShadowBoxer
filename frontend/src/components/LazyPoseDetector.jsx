import { Component, Suspense, lazy, useState } from 'react'
import { loadPoseDetector } from '../lib/preloadTraining'
import { usePreloadProgress } from '../hooks/usePreloadProgress'
import LoadingBar from './LoadingBar'

const stageClass =
  'relative mx-auto flex aspect-[4/3] w-full max-w-[calc((100svh-12rem)*4/3)] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-center text-sm text-slate-300 stage:fixed stage:inset-0 stage:aspect-auto stage:max-w-none stage:rounded-none stage:border-0'

class LoadBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={stageClass} role="alert">
        <div className="space-y-3">
          <p>Cannot load the training screen. Check your connection.</p>
          <button
            className="action-btn action-btn-secondary"
            onClick={this.props.onRetry}
          >
            Retry loading
          </button>
        </div>
      </div>
    )
  }
}

function LoadingStage() {
  const { phase, percent } = usePreloadProgress()
  return (
    <div className={stageClass} role="status">
      <LoadingBar
        className="max-w-xs"
        label="Loading training"
        percent={phase === 'loading' ? percent : null}
      />
    </div>
  )
}

// PoseDetector pulls in TensorFlow.js; keep it out of the menu's bundle.
function LazyPoseDetector(props) {
  const [attempt, setAttempt] = useState(0)
  const [Detector, setDetector] = useState(() => lazy(loadPoseDetector))
  const retry = () => {
    setDetector(() => lazy(loadPoseDetector))
    setAttempt((value) => value + 1)
  }
  return (
    <LoadBoundary key={attempt} onRetry={retry}>
      <Suspense fallback={<LoadingStage />}>
        <Detector {...props} />
      </Suspense>
    </LoadBoundary>
  )
}

export default LazyPoseDetector
