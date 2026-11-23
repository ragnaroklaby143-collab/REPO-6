export const DUMMY_DPS_WINDOW_SEC = 3.0;
export const DUMMY_DPS_IDLE_RESET_SEC = 3.5;

export interface DummyDamageSample {
  time: number;
  amount: number;
}

export interface DummyDpsTracker {
  samples: DummyDamageSample[];
  burstDamage: number;
  peakDps: number;
  currentDps: number;
  firstBurstHitAt: number | null;
  lastHitAt: number;
}

export function createDummyDpsTracker(): DummyDpsTracker {
  return {
    samples: [],
    burstDamage: 0,
    peakDps: 0,
    currentDps: 0,
    firstBurstHitAt: null,
    lastHitAt: -999,
  };
}

export function resetDummyDpsTracker(tracker: DummyDpsTracker): void {
  tracker.samples.length = 0;
  tracker.burstDamage = 0;
  tracker.peakDps = 0;
  tracker.currentDps = 0;
  tracker.firstBurstHitAt = null;
  tracker.lastHitAt = -999;
}

function pruneAndComputeDps(tracker: DummyDpsTracker, nowSec: number): number {
  const cutoff = nowSec - DUMMY_DPS_WINDOW_SEC;
  while (tracker.samples.length > 0 && tracker.samples[0].time < cutoff) {
    tracker.samples.shift();
  }
  if (tracker.samples.length === 0) {
    tracker.currentDps = 0;
    return 0;
  }

  let windowSum = 0;
  for (let i = 0; i < tracker.samples.length; i++) {
    windowSum += tracker.samples[i].amount;
  }

  const earliestInWindow = tracker.samples[0].time;
  const elapsedInWindow = Math.min(DUMMY_DPS_WINDOW_SEC, Math.max(1.0, nowSec - earliestInWindow));
  const dps = Number((windowSum / elapsedInWindow).toFixed(1));
  tracker.currentDps = dps;
  if (dps > tracker.peakDps) {
    tracker.peakDps = dps;
  }
  return dps;
}

export function recordDummyDamageHit(
  tracker: DummyDpsTracker,
  nowSec: number,
  amount: number
): number {
  const safeAmount = Math.max(0, amount);
  if (safeAmount <= 0) {
    return refreshDummyDps(tracker, nowSec);
  }

  if (
    tracker.firstBurstHitAt === null ||
    nowSec - tracker.lastHitAt > DUMMY_DPS_IDLE_RESET_SEC
  ) {
    tracker.samples.length = 0;
    tracker.burstDamage = 0;
    tracker.firstBurstHitAt = nowSec;
  }

  tracker.samples.push({ time: nowSec, amount: safeAmount });
  tracker.burstDamage += safeAmount;
  tracker.lastHitAt = nowSec;
  return pruneAndComputeDps(tracker, nowSec);
}

export function refreshDummyDps(tracker: DummyDpsTracker, nowSec: number): number {
  if (tracker.lastHitAt < 0) {
    tracker.currentDps = 0;
    return 0;
  }
  if (nowSec - tracker.lastHitAt > DUMMY_DPS_IDLE_RESET_SEC) {
    tracker.samples.length = 0;
    tracker.currentDps = 0;
    return 0;
  }
  return pruneAndComputeDps(tracker, nowSec);
}
