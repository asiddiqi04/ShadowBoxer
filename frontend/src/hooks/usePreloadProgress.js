import { useSyncExternalStore } from 'react'
import { getPreloadSnapshot, subscribePreload } from '../lib/preloadTraining'

// { phase: idle | loading | done | skipped | error, percent } of the training preload.
export const usePreloadProgress = () =>
  useSyncExternalStore(subscribePreload, getPreloadSnapshot)
