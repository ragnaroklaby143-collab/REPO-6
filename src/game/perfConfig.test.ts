import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectQualityTier,
  resolveRenderProfile,
  stepAdaptivePixelRatio,
  quantizeNetFloat,
  shouldSendMovePacket,
  canSendWsPayload,
  updateRttJitterSample,
  computeAdaptiveInterpDelayMs,
} from './perfConfig.ts';

describe('perfConfig quality tiering', () => {
  it('forces software tier with pixelRatio 1 when software GL is detected', () => {
    const tier = detectQualityTier({
      isSoftwareGl: true,
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      hardwareConcurrency: 16,
      deviceMemoryGb: 16,
      hasCoarsePointer: false,
    });
    assert.equal(tier, 'software');
    const profile = resolveRenderProfile(tier, 2);
    assert.equal(profile.initialPixelRatio, 1);
    assert.equal(profile.maxPixelRatio, 1);
    assert.equal(profile.antialias, false);
  });

  it('assigns low tier for typical mobile phone portrait/landscape with coarse pointer', () => {
    const portraitTier = detectQualityTier({
      isSoftwareGl: false,
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 3,
      hardwareConcurrency: 6,
      deviceMemoryGb: 4,
      hasCoarsePointer: true,
    });
    assert.equal(portraitTier, 'low');

    const landscapeTier = detectQualityTier({
      isSoftwareGl: false,
      viewportWidth: 844,
      viewportHeight: 390,
      devicePixelRatio: 3,
      hardwareConcurrency: 6,
      deviceMemoryGb: 4,
      hasCoarsePointer: true,
    });
    assert.equal(landscapeTier, 'low');

    const profile = resolveRenderProfile('low', 3);
    assert.ok(profile.initialPixelRatio <= 1.2);
    assert.equal(profile.enableBumpMap, false);
    assert.equal(profile.groundTexSize, 256);
    assert.equal(profile.allowCutsceneCssFilter, false);
  });

  it('assigns high tier for capable desktop monitors', () => {
    const tier = detectQualityTier({
      isSoftwareGl: false,
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
      hasCoarsePointer: false,
    });
    assert.equal(tier, 'high');
    const profile = resolveRenderProfile(tier, 2);
    assert.equal(profile.terrainSegments, 48);
    assert.equal(profile.groundTexSize, 512);
    assert.equal(profile.maxPixelRatio, 2);
  });
});

describe('adaptive pixel ratio hysteresis', () => {
  it('never alters DPR on software GL', () => {
    const res = stepAdaptivePixelRatio({
      currentDpr: 1,
      avgFrameMs: 45,
      minDpr: 1,
      maxDpr: 1,
      isSoftwareGl: true,
      highLoadWindows: 5,
      lowLoadWindows: 0,
    });
    assert.equal(res.nextDpr, 1);
    assert.equal(res.changed, false);
  });

  it('requires 3 consecutive slow windows before stepping DPR down', () => {
    let state = stepAdaptivePixelRatio({
      currentDpr: 1.5,
      avgFrameMs: 28,
      minDpr: 0.85,
      maxDpr: 1.5,
      isSoftwareGl: false,
      highLoadWindows: 0,
      lowLoadWindows: 0,
    });
    assert.equal(state.changed, false);
    assert.equal(state.highLoadWindows, 1);

    state = stepAdaptivePixelRatio({
      currentDpr: state.nextDpr,
      avgFrameMs: 28,
      minDpr: 0.85,
      maxDpr: 1.5,
      isSoftwareGl: false,
      highLoadWindows: state.highLoadWindows,
      lowLoadWindows: state.lowLoadWindows,
    });
    assert.equal(state.changed, false);
    assert.equal(state.highLoadWindows, 2);

    state = stepAdaptivePixelRatio({
      currentDpr: state.nextDpr,
      avgFrameMs: 28,
      minDpr: 0.85,
      maxDpr: 1.5,
      isSoftwareGl: false,
      highLoadWindows: state.highLoadWindows,
      lowLoadWindows: state.lowLoadWindows,
    });
    assert.equal(state.changed, true);
    assert.ok(state.nextDpr < 1.5);
  });
});

describe('network latency & payload optimization', () => {
  it('quantizes floats cleanly without -0', () => {
    assert.equal(quantizeNetFloat(-0.0001, 2), 0);
    assert.equal(quantizeNetFloat(12.34567, 2), 12.35);
    assert.equal(quantizeNetFloat(Number.NaN, 2), 0);
  });

  it('suppresses redundant idle move heartbeats while sending start/stop immediately', () => {
    // Idle staying idle -> false even after 200ms
    assert.equal(
      shouldSendMovePacket({
        moveX: 0,
        moveZ: 0,
        prevMoveX: 0,
        prevMoveZ: 0,
        elapsedSinceLastSendMs: 500,
      }),
      false,
    );
    // Moving -> stopped -> true immediately
    assert.equal(
      shouldSendMovePacket({
        moveX: 0,
        moveZ: 0,
        prevMoveX: 0.5,
        prevMoveZ: 0,
        elapsedSinceLastSendMs: 10,
      }),
      true,
    );
    // Actively moving heartbeat after 110ms -> true
    assert.equal(
      shouldSendMovePacket({
        moveX: 0.8,
        moveZ: 0.2,
        prevMoveX: 0.8,
        prevMoveZ: 0.2,
        elapsedSinceLastSendMs: 120,
      }),
      true,
    );
  });

  it('drops non-critical move packets under WebSocket bufferbloat while keeping critical actions', () => {
    assert.equal(canSendWsPayload(16384, false), false);
    assert.equal(canSendWsPayload(16384, true), true);
    assert.equal(canSendWsPayload(1024, false), true);
  });

  it('rejects background-tab RTT spike outliers and tightens interpolation bounds', () => {
    const sample = updateRttJitterSample({
      clientSentAt: 1000,
      nowClient: 1950, // 950ms spike vs 35ms baseline
      serverTime: 1020,
      prevRttMs: 36,
      prevJitterMs: 5,
      prevMinRttMs: 32,
      prevClockOffsetMs: 10,
    });
    assert.equal(sample.wasOutlier, true);
    assert.equal(sample.jitterMs, 5);
    assert.ok(sample.rttMs < 100);
    assert.equal(computeAdaptiveInterpDelayMs(0), 50);
    assert.equal(computeAdaptiveInterpDelayMs(200), 130);
  });
});
