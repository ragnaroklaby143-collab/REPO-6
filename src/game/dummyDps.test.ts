import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DUMMY_DPS_IDLE_RESET_SEC,
  createDummyDpsTracker,
  recordDummyDamageHit,
  refreshDummyDps,
  resetDummyDpsTracker,
} from './dummyDps';

test('dummyDps computes initial single-hit and sustained rolling 3s DPS accurately', () => {
  const tracker = createDummyDpsTracker();
  assert.equal(refreshDummyDps(tracker, 1.0), 0);

  // First hit of 30 dmg uses minimum 1.0s denominator => 30.0 DPS
  const dps1 = recordDummyDamageHit(tracker, 10.0, 30);
  assert.equal(dps1, 30);
  assert.equal(tracker.burstDamage, 30);
  assert.equal(tracker.peakDps, 30);

  // Second hit of 30 dmg at 10.5s => 60 / 1.0 = 60.0 DPS
  const dps2 = recordDummyDamageHit(tracker, 10.5, 30);
  assert.equal(dps2, 60);
  assert.equal(tracker.burstDamage, 60);
  assert.equal(tracker.peakDps, 60);

  // Hit at 12.0s of 30 dmg => span = 2.0s, sum = 90 => 45.0 DPS
  const dps3 = recordDummyDamageHit(tracker, 12.0, 30);
  assert.equal(dps3, 45);
  assert.equal(tracker.burstDamage, 90);
  assert.equal(tracker.peakDps, 60);
});

test('dummyDps expires old samples beyond 3s window and resets after idle timeout', () => {
  const tracker = createDummyDpsTracker();
  recordDummyDamageHit(tracker, 10.0, 60);
  recordDummyDamageHit(tracker, 12.5, 30);

  // At 13.5s, 10.0 sample (< 10.5s) is pruned; only 30 dmg remains => 30 / 1.0 = 30 DPS
  assert.equal(refreshDummyDps(tracker, 13.5), 30);

  // After > 3.5s since lastHitAt (12.5 + 3.6 = 16.1), currentDps drops to 0 while peakDps persists until reset
  assert.equal(refreshDummyDps(tracker, 12.5 + DUMMY_DPS_IDLE_RESET_SEC + 0.1), 0);
  assert.equal(tracker.peakDps, 60);

  // New hit after idle starts a fresh burstDamage tally
  recordDummyDamageHit(tracker, 16.5, 24);
  assert.equal(tracker.burstDamage, 24);
  assert.equal(tracker.currentDps, 24);

  resetDummyDpsTracker(tracker);
  assert.equal(tracker.currentDps, 0);
  assert.equal(tracker.peakDps, 0);
  assert.equal(tracker.burstDamage, 0);
});
