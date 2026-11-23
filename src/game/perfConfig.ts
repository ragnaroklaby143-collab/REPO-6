export type QualityTier = 'software' | 'low' | 'medium' | 'high';

export interface DeviceCapabilityInput {
  isSoftwareGl: boolean;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  hasCoarsePointer?: boolean;
}

export interface RenderProfile {
  tier: QualityTier;
  maxPixelRatio: number;
  minPixelRatio: number;
  initialPixelRatio: number;
  antialias: boolean;
  maxAnisotropy: number;
  terrainSegments: number;
  enableBumpMap: boolean;
  groundTexSize: number;
  moteCount: number;
  vfxQualityScale: number;
  shadowMapEnabled: boolean;
  allowCutsceneCssFilter: boolean;
  statusParticleIntervalSec: number;
  orbIndicatorIntervalMs: number;
}

export interface AdaptiveDprInput {
  currentDpr: number;
  avgFrameMs: number;
  minDpr: number;
  maxDpr: number;
  isSoftwareGl: boolean;
  highLoadWindows: number;
  lowLoadWindows: number;
}

export interface AdaptiveDprResult {
  nextDpr: number;
  highLoadWindows: number;
  lowLoadWindows: number;
  changed: boolean;
}

export interface RttSampleResult {
  rttMs: number;
  jitterMs: number;
  minRttMs: number;
  clockOffsetMs: number;
  wasOutlier: boolean;
}

/**
 * Classifies client device capabilities into a rendering quality tier.
 * Software WebGL uses strict minimal work at pixelRatio 1.
 * Phones (coarse pointer or compact viewport) default to 'low' or 'medium'
 * to sustain smooth 60fps without thermal throttling or GPU fill-rate stalls.
 */
export function detectQualityTier(input: DeviceCapabilityInput): QualityTier {
  if (input.isSoftwareGl) return 'software';

  const minSide = Math.min(input.viewportWidth, input.viewportHeight);
  const maxSide = Math.max(input.viewportWidth, input.viewportHeight);
  const cores = input.hardwareConcurrency ?? 4;
  const mem = input.deviceMemoryGb ?? 4;
  const isPhoneSized = minSide <= 540 || maxSide <= 900 && Boolean(input.hasCoarsePointer);

  if (mem <= 2 || cores <= 2) {
    return 'low';
  }

  if (input.hasCoarsePointer && isPhoneSized) {
    if (cores >= 8 && mem >= 6 && minSide >= 412) {
      return 'medium';
    }
    return 'low';
  }

  if (input.hasCoarsePointer || minSide < 780 || cores <= 4 || mem <= 4) {
    return 'medium';
  }

  return 'high';
}

export function resolveRenderProfile(
  tier: QualityTier,
  devicePixelRatio = 1,
): RenderProfile {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

  switch (tier) {
    case 'software':
      return {
        tier,
        maxPixelRatio: 1,
        minPixelRatio: 1,
        initialPixelRatio: 1,
        antialias: false,
        maxAnisotropy: 1,
        terrainSegments: 24,
        enableBumpMap: false,
        groundTexSize: 256,
        moteCount: 16,
        vfxQualityScale: 0.55,
        shadowMapEnabled: false,
        allowCutsceneCssFilter: false,
        statusParticleIntervalSec: 0.24,
        orbIndicatorIntervalMs: 140,
      };
    case 'low':
      return {
        tier,
        maxPixelRatio: Math.min(safeDpr, 1.35),
        minPixelRatio: 0.8,
        initialPixelRatio: Math.min(safeDpr, 1.15),
        antialias: false,
        maxAnisotropy: 1,
        terrainSegments: 28,
        enableBumpMap: false,
        groundTexSize: 256,
        moteCount: 20,
        vfxQualityScale: 0.65,
        shadowMapEnabled: false,
        allowCutsceneCssFilter: false,
        statusParticleIntervalSec: 0.22,
        orbIndicatorIntervalMs: 120,
      };
    case 'medium':
      return {
        tier,
        maxPixelRatio: Math.min(safeDpr, 1.6),
        minPixelRatio: 0.9,
        initialPixelRatio: Math.min(safeDpr, 1.4),
        antialias: true,
        maxAnisotropy: 2,
        terrainSegments: 36,
        enableBumpMap: true,
        groundTexSize: 384,
        moteCount: 30,
        vfxQualityScale: 0.85,
        shadowMapEnabled: false,
        allowCutsceneCssFilter: true,
        statusParticleIntervalSec: 0.16,
        orbIndicatorIntervalMs: 110,
      };
    case 'high':
    default:
      return {
        tier: 'high',
        maxPixelRatio: Math.min(safeDpr, 2),
        minPixelRatio: 1,
        initialPixelRatio: Math.min(safeDpr, 2),
        antialias: true,
        maxAnisotropy: 4,
        terrainSegments: 48,
        enableBumpMap: true,
        groundTexSize: 512,
        moteCount: 44,
        vfxQualityScale: 1,
        shadowMapEnabled: true,
        allowCutsceneCssFilter: true,
        statusParticleIntervalSec: 0.11,
        orbIndicatorIntervalMs: 100,
      };
  }
}

/**
 * Hysteresis-driven dynamic pixel ratio controller.
 * Avoids thrashing resolution every frame: requires sustained slow frames to drop,
 * and sustained fast frames to step back up. Software WebGL stays locked at 1.
 */
export function stepAdaptivePixelRatio(input: AdaptiveDprInput): AdaptiveDprResult {
  if (input.isSoftwareGl) {
    return {
      nextDpr: 1,
      highLoadWindows: 0,
      lowLoadWindows: 0,
      changed: Math.abs(input.currentDpr - 1) > 0.001,
    };
  }

  const clampedCurrent = Math.max(input.minDpr, Math.min(input.maxDpr, input.currentDpr));
  let highLoadWindows = input.highLoadWindows;
  let lowLoadWindows = input.lowLoadWindows;
  let nextDpr = clampedCurrent;

  if (input.avgFrameMs > 23.5) {
    highLoadWindows += 1;
    lowLoadWindows = 0;
    if (highLoadWindows >= 3 && clampedCurrent > input.minDpr) {
      nextDpr = Math.max(input.minDpr, Math.round((clampedCurrent - 0.15) * 20) / 20);
      highLoadWindows = 0;
    }
  } else if (input.avgFrameMs < 14.5) {
    lowLoadWindows += 1;
    highLoadWindows = 0;
    if (lowLoadWindows >= 5 && clampedCurrent < input.maxDpr) {
      nextDpr = Math.min(input.maxDpr, Math.round((clampedCurrent + 0.1) * 20) / 20);
      lowLoadWindows = 0;
    }
  } else {
    highLoadWindows = 0;
    lowLoadWindows = 0;
  }

  return {
    nextDpr,
    highLoadWindows,
    lowLoadWindows,
    changed: Math.abs(nextDpr - input.currentDpr) >= 0.04,
  };
}

/**
 * Rounds floating-point telemetry cleanly to reduce WebSocket JSON payload size.
 */
export function quantizeNetFloat(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Prevents idle WebSocket input floods while guaranteeing instant state changes
 * (start moving, stop moving, or significant direction/aim delta).
 */
export function shouldSendMovePacket(params: {
  moveX: number;
  moveZ: number;
  prevMoveX: number;
  prevMoveZ: number;
  aimYaw?: number;
  aimPitch?: number;
  prevAimYaw?: number;
  prevAimPitch?: number;
  elapsedSinceLastSendMs: number;
  heartbeatMs?: number;
}): boolean {
  const {
    moveX,
    moveZ,
    prevMoveX,
    prevMoveZ,
    aimYaw,
    aimPitch,
    prevAimYaw,
    prevAimPitch,
    elapsedSinceLastSendMs,
    heartbeatMs = 110,
  } = params;

  const isZero = Math.abs(moveX) < 0.001 && Math.abs(moveZ) < 0.001;
  const wasZero = Math.abs(prevMoveX) < 0.001 && Math.abs(prevMoveZ) < 0.001;

  // Immediate transition between stopped and moving
  if (isZero !== wasZero) return true;

  // Direction delta while moving
  if (Math.abs(moveX - prevMoveX) >= 0.035 || Math.abs(moveZ - prevMoveZ) >= 0.035) {
    return true;
  }

  // Aim changes while aiming
  if (aimYaw !== undefined && prevAimYaw !== undefined && Math.abs(aimYaw - prevAimYaw) >= 0.03) {
    return true;
  }
  if (aimPitch !== undefined && prevAimPitch !== undefined && Math.abs(aimPitch - prevAimPitch) >= 0.03) {
    return true;
  }

  // Keepalive only while actively moving
  if (!isZero && elapsedSinceLastSendMs >= heartbeatMs) {
    return true;
  }

  return false;
}

/**
 * Guards WebSocket outbound buffer against bufferbloat on congested mobile networks.
 * Critical actions (attacks, abilities, dashes, block toggles, stops) always queue;
 * redundant intermediate move samples are dropped if socket buffer exceeds threshold.
 */
export function canSendWsPayload(bufferedAmount: number, isCritical: boolean): boolean {
  if (isCritical) return true;
  return bufferedAmount <= 8192;
}

/**
 * Smooths RTT, jitter, and clock offset while rejecting abnormal background-tab
 * or packet-stall outliers so interpolation latency stays snappy.
 */
export function updateRttJitterSample(params: {
  clientSentAt: number;
  nowClient: number;
  serverTime: number;
  prevRttMs: number;
  prevJitterMs: number;
  prevMinRttMs: number;
  prevClockOffsetMs: number;
}): RttSampleResult {
  const {
    clientSentAt,
    nowClient,
    serverTime,
    prevRttMs,
    prevJitterMs,
    prevMinRttMs,
    prevClockOffsetMs,
  } = params;

  const rawRtt = Math.max(2, Math.min(2000, nowClient - clientSentAt));
  const nextMinRtt = prevMinRttMs <= 0 ? rawRtt : Math.min(prevMinRttMs * 1.002 + 0.05, rawRtt);

  const outlierCutoff = Math.max(220, nextMinRtt * 2.4);
  const wasOutlier = prevRttMs > 0 && rawRtt > outlierCutoff;

  if (wasOutlier) {
    return {
      rttMs: Math.round(prevRttMs * 0.85 + Math.min(rawRtt, outlierCutoff) * 0.15),
      jitterMs: prevJitterMs,
      minRttMs: nextMinRtt,
      clockOffsetMs: prevClockOffsetMs,
      wasOutlier: true,
    };
  }

  const rttMs = prevRttMs <= 0 ? rawRtt : Math.round(prevRttMs * 0.65 + rawRtt * 0.35);
  const absDelta = prevRttMs <= 0 ? 0 : Math.abs(rawRtt - prevRttMs);
  const jitterMs = prevJitterMs <= 0 ? absDelta * 0.5 : prevJitterMs * 0.72 + absDelta * 0.28;

  const estClockOffset = serverTime - (clientSentAt + rawRtt * 0.5);
  const clockOffsetMs =
    prevClockOffsetMs === 0
      ? estClockOffset
      : prevClockOffsetMs * 0.8 + estClockOffset * 0.2;

  return {
    rttMs,
    jitterMs,
    minRttMs: nextMinRtt,
    clockOffsetMs,
    wasOutlier: false,
  };
}

/**
 * Computes remote entity interpolation buffer delay from measured jitter.
 */
export function computeAdaptiveInterpDelayMs(jitterMs: number): number {
  const safeJitter = Number.isFinite(jitterMs) && jitterMs > 0 ? jitterMs : 0;
  return Math.max(45, Math.min(130, 50 + safeJitter * 1.35));
}
