import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPunchToCombo,
  initialComboStats,
} from '../frontend/src/training/comboService.js'

const comboState = () => ({
  currentCombo: ['jab', 'cross'],
  comboStepIndex: 0,
  comboStats: initialComboStats(),
  comboResult: 'idle',
  comboLockedUntil: null,
  lastPunchEvent: null,
})

test('applyPunchToCombo advances and completes a matching combo', () => {
  const afterJab = applyPunchToCombo(
    comboState(),
    { type: 'jab', side: 'left', score: 90 },
    { nowMs: 1000, id: 'event-1' },
  )
  const afterCross = applyPunchToCombo(
    afterJab,
    { type: 'cross', side: 'right', score: 92 },
    { nowMs: 1100, id: 'event-2' },
  )

  assert.equal(afterJab.comboStepIndex, 1)
  assert.equal(afterJab.comboStats.succeeded, 0)
  assert.equal(afterCross.comboResult, 'success')
  assert.equal(afterCross.comboStepIndex, 2)
  assert.equal(afterCross.comboStats.succeeded, 1)
  assert.equal(afterCross.comboStats.total, 1)
  assert.equal(afterCross.lastPunchEvent.matched, true)
})

test('applyPunchToCombo records a failure for the wrong punch', () => {
  const afterHook = applyPunchToCombo(
    comboState(),
    { type: 'hook', side: 'left', score: 80 },
    { nowMs: 1000, id: 'event-1' },
  )

  assert.equal(afterHook.comboResult, 'failed')
  assert.equal(afterHook.comboStepIndex, 0)
  assert.equal(afterHook.comboStats.failed, 1)
  assert.equal(afterHook.comboStats.total, 1)
  assert.equal(afterHook.lastPunchEvent.matched, false)
})
