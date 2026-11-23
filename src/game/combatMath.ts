import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';
import type { MapId, MapObstacle, MatchAwakeningPhase } from '../shared/gameData.ts';
import { resolveObstacleCollisions } from '../shared/gameData.ts';

/**
 * Frame-rate independent exponential damping toward target.
 */
export function dampScalar(current: number, target: number, lambda: number, dt: number): number {
  const safeDt = Math.max(0, Math.min(dt, 0.1));
  if (lambda <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-lambda * safeDt));
}

/**
 * Frame-rate independent shortest-arc angular damping (radians).
 */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const safeDt = Math.max(0, Math.min(dt, 0.1));
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (lambda <= 0) return current;
  return current + diff * (1 - Math.exp(-lambda * safeDt));
}

/**
 * Computes ground contact shadow scale and opacity based on actor elevation above ground.
 */
export function computeContactShadowTransform(heightAboveGround: number): {
  scale: number;
  opacity: number;
} {
  const h = Math.max(0, heightAboveGround);
  const scale = Math.max(0.42, 1.0 - h * 0.085);
  const opacity = Math.max(0.14, 0.44 * (1.0 - Math.min(1, h * 0.14)));
  return { scale, opacity };
}

/**
 * Advances local actionTimer smoothly between 25Hz server snapshots so swings,
 * dashes, and skill animations progress smoothly at 60-144Hz.
 */
export function advanceActionTimer(
  actionState: string,
  actionTimer: number,
  dt: number
): number {
  if (actionTimer <= 0) return 0;
  if (
    actionState === 'idle' ||
    actionState === 'move' ||
    actionState === 'jump' ||
    actionState === 'guard'
  ) {
    return actionTimer;
  }
  return Math.max(0, actionTimer - Math.max(0, Math.min(dt, 0.05)));
}

/**
 * Computes smooth dual-frequency harmonic trauma-squared camera shake offsets.
 */
export function computeTraumaShake(
  trauma: number,
  elapsedSec: number
): { x: number; y: number; z: number; roll: number } {
  const t = Math.max(0, Math.min(1.2, trauma));
  if (t <= 0.001) return { x: 0, y: 0, z: 0, roll: 0 };
  const mag = t * t;
  const w1 = elapsedSec * 41.0;
  const w2 = elapsedSec * 57.0;
  return {
    x: (Math.sin(w1) * 0.65 + Math.cos(w2 * 0.77) * 0.35) * mag * 0.48,
    y: (Math.cos(w1 * 1.13) * 0.6 + Math.sin(w2) * 0.4) * mag * 0.36,
    z: (Math.sin(w2 * 0.91) * 0.7 + Math.cos(w1 * 0.63) * 0.3) * mag * 0.42,
    roll: Math.sin(w1 * 0.85) * mag * 0.032,
  };
}

/**
 * Computes horizontal pull-in fraction [0.25, 1.0] along the ray from lookTarget to camPos
 * against arena AABB obstacles so the camera smoothly glides clear of pillars/walls.
 */
export function computeObstacleCameraPullIn(
  lookX: number,
  lookY: number,
  lookZ: number,
  destX: number,
  destY: number,
  destZ: number,
  obstacles: MapObstacle[],
  mapId: MapId,
  getTerrainHeight: (mapId: MapId, x: number, z: number) => number
): number {
  let minT = 1.0;
  const dx = destX - lookX;
  const dy = destY - lookY;
  const dz = destZ - lookZ;

  for (const obs of obstacles) {
    const pad = 0.55;
    const minX = obs.x - (obs.halfW + pad);
    const maxX = obs.x + (obs.halfW + pad);
    const minZ = obs.z - (obs.halfD + pad);
    const maxZ = obs.z + (obs.halfD + pad);
    const baseY = getTerrainHeight(mapId, obs.x, obs.z);
    const minY = baseY - 0.5;
    const maxY = baseY + obs.topY + pad;

    let tEnter = 0.0;
    let tExit = 1.0;

    if (Math.abs(dx) < 1e-6) {
      if (lookX < minX || lookX > maxX) continue;
    } else {
      const tx1 = (minX - lookX) / dx;
      const tx2 = (maxX - lookX) / dx;
      tEnter = Math.max(tEnter, Math.min(tx1, tx2));
      tExit = Math.min(tExit, Math.max(tx1, tx2));
    }

    if (Math.abs(dy) < 1e-6) {
      if (lookY < minY || lookY > maxY) continue;
    } else {
      const ty1 = (minY - lookY) / dy;
      const ty2 = (maxY - lookY) / dy;
      tEnter = Math.max(tEnter, Math.min(ty1, ty2));
      tExit = Math.min(tExit, Math.max(ty1, ty2));
    }

    if (Math.abs(dz) < 1e-6) {
      if (lookZ < minZ || lookZ > maxZ) continue;
    } else {
      const tz1 = (minZ - lookZ) / dz;
      const tz2 = (maxZ - lookZ) / dz;
      tEnter = Math.max(tEnter, Math.min(tz1, tz2));
      tExit = Math.min(tExit, Math.max(tz1, tz2));
    }

    if (tEnter <= tExit && tEnter > 0.05 && tEnter < minT) {
      minT = Math.max(0.32, tEnter - 0.06);
    }
  }

  return minT;
}

export interface LockedCameraRig {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  yaw: number;
  elevationDeg: number;
}

/**
 * Computes the MLBB-style angled isometric top-down MOBA camera tracking the player
 * while subtly biasing framing toward the center of the arena (0,0) and balancing
 * front/rear visibility with zero back-edge cutoff.
 */
export function computeLockedTopDownCamera(
  playerX: number,
  playerY: number,
  playerZ: number,
  isFlying = false,
  pitchRad = 1.01, // ~57.9 deg crisp angled MOBA pitch
  distance = 17.6,
  isPortrait = false
): LockedCameraRig {
  const effectiveDist = (isFlying ? distance + 2.8 : distance) + (isPortrait ? 3.4 : 0);
  const centerBias = isPortrait ? 0.16 : 0.24;
  const maxBiasX = isPortrait ? 2.6 : 6.0;
  const maxBiasZ = isPortrait ? 3.8 : 5.4;
  const rawOffsetX = -playerX * centerBias;
  const rawOffsetZ = -playerZ * centerBias;
  const biasOffsetX = Math.max(-maxBiasX, Math.min(maxBiasX, rawOffsetX));
  const biasOffsetZ = Math.max(-maxBiasZ, Math.min(maxBiasZ, rawOffsetZ));
  const rearFramingZ = isPortrait ? 1.15 : 0.95;

  const lookX = playerX + biasOffsetX;
  const lookY = playerY + 1.0;
  const lookZ = playerZ + biasOffsetZ + rearFramingZ;
  const horiz = Math.cos(pitchRad) * effectiveDist;
  const vert = Math.sin(pitchRad) * effectiveDist;
  return {
    camX: lookX,
    camY: lookY + vert,
    camZ: lookZ + horiz,
    lookX,
    lookY,
    lookZ,
    yaw: Math.PI,
    elevationDeg: (pitchRad * 180) / Math.PI,
  };
}

export interface CenterCameraTarget {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  targetYaw: number;
  elevationDeg: number;
}

/**
 * Computes an angled 3rd-person arena camera positioned behind/outward from the player
 * and pointed inward toward the middle of the map (0, 0, 0).
 * Keeps a small deadzone around exact (0, 0) so crossing center doesn't whip 180 degrees.
 */
export function computeCenterFacingCamera(
  playerX: number,
  playerY: number,
  playerZ: number,
  prevYaw: number,
  isFlying = false,
  pitchRad = 0.78,
  distance = 16.4,
  isPortrait = false
): CenterCameraTarget {
  const r = Math.hypot(playerX, playerZ);
  const deadzone = 0.85;
  const targetYaw = r >= deadzone ? Math.atan2(-playerX, -playerZ) : prevYaw;

  const effectiveDist = (isFlying ? distance + 2.6 : distance) + (isPortrait ? 3.2 : 0);
  const fwdX = Math.sin(targetYaw);
  const fwdZ = Math.cos(targetYaw);

  // Balanced forward lead keeps buildings, platforms, and incoming foes clear ahead & behind
  const forwardLead = isPortrait ? 1.4 : 1.9;
  const lookX = playerX + fwdX * forwardLead;
  const lookY = playerY + (isFlying ? 1.35 : 1.05);
  const lookZ = playerZ + fwdZ * forwardLead;

  const horiz = Math.cos(pitchRad) * effectiveDist;
  const vert = Math.sin(pitchRad) * effectiveDist;

  return {
    camX: lookX - fwdX * horiz,
    camY: lookY + vert,
    camZ: lookZ - fwdZ * horiz,
    lookX,
    lookY,
    lookZ,
    targetYaw,
    elevationDeg: (pitchRad * 180) / Math.PI,
  };
}

export function normalizeAngleRad(angle: number): number {
  let a = Number.isFinite(angle) ? angle : Math.PI;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function applyHorizontalCameraDrag(
  currentYaw: number,
  deltaXPx: number,
  sensitivity = 0.0065
): number {
  return normalizeAngleRad(currentYaw - deltaXPx * sensitivity);
}

/**
 * Computes an angled arena camera with player-controlled horizontal X-axis yaw rotation
 * (left/right drag rotates around player; default yaw = Math.PI faces -Z) and strictly
 * locked vertical Y-axis pitch/height angle.
 */
export function computeFreeHorizontalCamera(
  playerX: number,
  playerY: number,
  playerZ: number,
  isFlying = false,
  pitchRad = 0.62,
  distance = 19.6,
  isPortrait = false,
  yaw = Math.PI
): LockedCameraRig {
  const effectiveDist = (isFlying ? distance + 2.6 : distance) + (isPortrait ? 3.2 : 0);
  const rawFwdX = Math.sin(yaw);
  const rawFwdZ = Math.cos(yaw);
  const fwdX = Math.abs(rawFwdX) < 1e-12 ? 0 : rawFwdX;
  const fwdZ = Math.abs(rawFwdZ) < 1e-12 ? 0 : rawFwdZ;
  const lead = isPortrait ? 0.5 : 0.75;
  const lookX = playerX + fwdX * lead;
  const lookY = playerY + (isFlying ? 1.35 : 1.05);
  const lookZ = playerZ + fwdZ * lead;
  const horiz = Math.cos(pitchRad) * effectiveDist;
  const vert = Math.sin(pitchRad) * effectiveDist;

  return {
    camX: lookX - fwdX * horiz,
    camY: lookY + vert,
    camZ: lookZ - fwdZ * horiz,
    lookX,
    lookY,
    lookZ,
    yaw,
    elevationDeg: (pitchRad * 180) / Math.PI,
  };
}

export const STUN_MIN_SEC = 0.35;
export const STUN_NORMAL_MAX_SEC = 0.75;
export const STUN_HEAVY_ULT_MAX_SEC = 1.1;
export const STUN_RECOVERY_IMMUNITY_SEC = 1.35;

/**
 * Clamps any stun/stagger duration into strict anti-stunlock bounds:
 * - Normal skills: [0.35s .. 0.75s]
 * - Heavy Ultimates: [0.35s .. 1.10s]
 */
export function resolveCappedStunDuration(rawSec: number, isHeavyUltimate = false): number {
  const maxAllowed = isHeavyUltimate ? STUN_HEAVY_ULT_MAX_SEC : STUN_NORMAL_MAX_SEC;
  const safe = Number.isFinite(rawSec) ? rawSec : STUN_MIN_SEC;
  return Math.max(STUN_MIN_SEC, Math.min(maxAllowed, safe));
}

/**
 * Returns true only when a fighter is outside their post-stun recovery immunity window.
 */
export function canApplyStun(stunImmunityTimer = 0): boolean {
  return (stunImmunityTimer ?? 0) <= 0.001;
}

/**
 * Computes responsive scale factor [0.76 .. 1.18] for HUD controls & joysticks based on viewport size.
 */
export function computeHudScale(
  viewportW: number,
  viewportH: number,
  isCoarsePointer = false
): number {
  const minDim = Math.max(240, Math.min(viewportW, viewportH));
  const raw = minDim / (isCoarsePointer ? 410 : 780);
  const floor = isCoarsePointer ? 0.88 : 0.76;
  return Number(Math.max(floor, Math.min(1.18, raw)).toFixed(3));
}

/**
 * Exponential frame-rate independent camera damping factor: 1 - exp(-stiffness * dt).
 */
export function computeCameraDampFactor(dt: number, stiffness = 14): number {
  const safeDt = Math.max(0, Math.min(dt, 0.05));
  return 1 - Math.exp(-stiffness * safeDt);
}

/**
 * Sub-steps high-speed horizontal motion & obstacle/boundary collisions so 20-speed movement
 * and high-velocity dashes never tunnel or jitter against buildings.
 */
export function substepMotionAndCollision(
  mapId: MapId,
  x: number,
  y: number,
  z: number,
  vx: number,
  vz: number,
  dt: number,
  obstacles: Array<MapObstacle & { destroyed?: boolean }>,
  arenaRadius: number,
  radius = 0.48,
  maxStepDist = 0.22
): { x: number; z: number; substeps: number } {
  const safeDt = Math.max(0, Math.min(dt, 0.05));
  const totalDisp = Math.hypot(vx * safeDt, vz * safeDt);
  const substeps = Math.max(1, Math.min(16, Math.ceil(totalDisp / Math.max(0.05, maxStepDist))));
  const subDt = safeDt / substeps;
  let nx = x;
  let nz = z;

  for (let i = 0; i < substeps; i++) {
    nx += vx * subDt;
    nz += vz * subDt;
    const resolved = resolveObstacleCollisions(mapId, nx, y, nz, radius, obstacles);
    nx = resolved.x;
    nz = resolved.z;
    const r = Math.hypot(nx, nz);
    if (r > arenaRadius) {
      nx = (nx / r) * arenaRadius;
      nz = (nz / r) * arenaRadius;
    }
  }

  return { x: nx, z: nz, substeps };
}

/**
 * Frame-rate independent horizontal velocity acceleration & braking.
 * Produces identical acceleration curves at 30Hz server tick and 60-144Hz client prediction.
 */
export function stepHorizontalVelocity(
  vx: number,
  vz: number,
  moveX: number,
  moveZ: number,
  targetSpeed: number,
  dt: number,
  canMove: boolean,
  isAirborneMarjohn = false
): { vx: number; vz: number; moving: boolean } {
  const safeDt = Math.max(0, Math.min(dt, 0.05));
  const mag = Math.hypot(moveX, moveZ);
  if (canMove && mag > 0.06) {
    const scale = mag > 1 ? 1 / mag : 1;
    const nx = moveX * scale;
    const nz = moveZ * scale;
    const accelLambda = isAirborneMarjohn ? 26.0 : 20.0;
    return {
      vx: dampScalar(vx, nx * targetSpeed, accelLambda, safeDt),
      vz: dampScalar(vz, nz * targetSpeed, accelLambda, safeDt),
      moving: true,
    };
  }
  const decelLambda = 11.5;
  const decay = Math.exp(-decelLambda * safeDt);
  const nextVx = vx * decay;
  const nextVz = vz * decay;
  return {
    vx: Math.abs(nextVx) < 0.01 ? 0 : nextVx,
    vz: Math.abs(nextVz) < 0.01 ? 0 : nextVz,
    moving: false,
  };
}

/**
 * Smoothly reconciles client-predicted position against server state using velocity lead
 * and frame-rate independent exponential damping so normal movement has zero rubber-banding.
 */
export function reconcilePredictedPosition(params: {
  predX: number;
  predZ: number;
  serverX: number;
  serverZ: number;
  serverVx: number;
  serverVz: number;
  leadSec: number;
  dt: number;
}): { x: number; z: number; snapped: boolean } {
  const safeLead = Math.max(0, Math.min(params.leadSec, 0.09));
  const targetX = params.serverX + params.serverVx * safeLead;
  const targetZ = params.serverZ + params.serverVz * safeLead;
  const err = Math.hypot(targetX - params.predX, targetZ - params.predZ);

  if (err > 2.4) {
    return { x: targetX, z: targetZ, snapped: true };
  }
  if (err <= 0.14) {
    return { x: params.predX, z: params.predZ, snapped: false };
  }
  const lambda = err > 0.9 ? 11.0 : 5.2;
  return {
    x: dampScalar(params.predX, targetX, lambda, params.dt),
    z: dampScalar(params.predZ, targetZ, lambda, params.dt),
    snapped: false,
  };
}

/**
 * Returns true when an elapsed interval meets or exceeds a target FPS gate (e.g. 15 FPS minimap throttle).
 */
export function shouldThrottleUpdate(nowMs: number, lastMs: number, fps = 15): boolean {
  if (!Number.isFinite(lastMs) || lastMs <= 0) return true;
  const intervalMs = 1000 / Math.max(1, fps);
  return nowMs - lastMs >= intervalMs - 0.001;
}

/**
 * Projects world (x, z) coordinates onto normalized [4..96]% coordinates for the top-left MOBA minimap.
 */
export function projectToMinimapPercent(
  x: number,
  z: number,
  arenaRadius: number
): { leftPct: number; topPct: number } {
  const safeR = Math.max(10, arenaRadius);
  const nx = Math.max(-1, Math.min(1, x / safeR));
  const nz = Math.max(-1, Math.min(1, z / safeR));
  return {
    leftPct: 50 + nx * 44,
    topPct: 50 + nz * 44,
  };
}

/**
 * Deliberate touch/cursor threshold before a skill or M1 press enters manual hold-drag aiming.
 * Ensures quick taps always trigger instant nearest-enemy auto-aim without accidental drags.
 */
export const SKILL_DRAG_DISTANCE_PX = 15;
export const SKILL_HOLD_TIME_MS = 160;

export function shouldEnterDragAim(dragDistancePx: number, holdElapsedMs: number): boolean {
  return dragDistancePx >= SKILL_DRAG_DISTANCE_PX || holdElapsedMs >= SKILL_HOLD_TIME_MS;
}

/**
 * Applies damage to a destructible map structure and reports whether it broke.
 */
export function applyObstacleDamage(
  currentHp: number,
  damage: number
): { hp: number; destroyed: boolean } {
  const nextHp = Math.max(0, Math.round(currentHp - Math.max(0, damage)));
  return {
    hp: nextHp,
    destroyed: nextHp <= 0,
  };
}

/**
 * Selects the nearest alive opponent within maxRange from a reference origin.
 */
export function selectNearestTarget<T extends { playerId: string; x: number; z: number; isKO?: boolean }>(
  originX: number,
  originZ: number,
  selfId: string,
  candidates: T[],
  maxRange: number
): T | null {
  let best: T | null = null;
  let bestDist = maxRange;
  for (const c of candidates) {
    if (c.playerId === selfId || c.isKO) continue;
    const d = Math.hypot(c.x - originX, c.z - originZ);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * Converts a normalized drag/swipe vector (screen-space right = +dx, screen-space up = -dy)
 * into a clamped world-space ground aim point relative to the player.
 */
export function computeSwipeAimPoint(
  playerX: number,
  playerZ: number,
  normDragX: number,
  normDragY: number,
  maxRange: number
): { x: number; z: number; yaw: number } {
  const mag = Math.hypot(normDragX, normDragY);
  if (mag < 0.05) {
    return { x: playerX, z: playerZ - maxRange * 0.65, yaw: Math.PI };
  }
  const nx = normDragX / mag;
  const nz = normDragY / mag; // screen down (+dy) maps to +Z; screen up (-dy) maps to -Z
  const clampedFrac = Math.min(1, mag);
  const dist = Math.max(2.0, clampedFrac * maxRange);
  const aimX = playerX + nx * dist;
  const aimZ = playerZ + nz * dist;
  return {
    x: aimX,
    z: aimZ,
    yaw: Math.atan2(nx, nz),
  };
}

/**
 * Computes Storm Zone active state and shrinking radius based on matchTime (triggers at 60s),
 * or shuts the storm off once Awakening Orbs spawn.
 */
export function computeStormRadiusAtTime(
  matchTime: number,
  maxRadius: number,
  isTrainingMode = false,
  orbsSpawned = false
): { active: boolean; radius: number } {
  if (isTrainingMode || orbsSpawned || matchTime < 60.0) {
    return { active: false, radius: maxRadius };
  }
  const elapsed = matchTime - 60.0;
  return {
    active: true,
    radius: Math.max(4.0, maxRadius - AWAKENING_CONFIG.STORM_SHRINK_SPEED * elapsed),
  };
}

/**
 * Returns remaining seconds until Awakening Orbs spawn:
 * - 1v1 (initialActorCount <= 2): counts down to the 1:30 (90s) match mark.
 * - 3+ player match: counts down the 30.0s incoming delay once 2 survivors remain.
 */
export function computeAwakeningOrbCountdownSec(params: {
  isTrainingMode: boolean;
  phase: MatchAwakeningPhase;
  initialActorCount: number;
  matchTime: number;
  spawnTimeSec?: number;
  awakeningCountdown?: number | null;
}): number | null {
  if (params.isTrainingMode) return null;
  if (params.phase !== 'PRE_AWAKENING') return null;
  if (params.initialActorCount > 2) {
    if (typeof params.awakeningCountdown === 'number' && Number.isFinite(params.awakeningCountdown)) {
      return Math.max(0, Number(params.awakeningCountdown.toFixed(1)));
    }
    return null;
  }
  const target = params.spawnTimeSec ?? AWAKENING_CONFIG.TWO_PLAYER_SPAWN_TIME_SEC;
  return Math.max(0, Math.ceil(target - params.matchTime));
}

/**
 * Sanitizes incoming room chat text: strips ASCII control characters, collapses
 * whitespace runs, trims, and caps length at 160 characters. Returns null if empty.
 */
export function sanitizeChatText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Computes the world-space forward direction vector of a Three.js CircleGeometry(1, seg, -theta, 2*theta)
 * after rotateX(-PI/2), rotateY(coneRotateYAfterX), and group rotation.y = castYaw.
 * At castYaw = 0 (forward = +Z), coneRotateYAfterX = -PI/2 yields { x: 0, z: 1 }.
 */
export function computeConeForwardVector(
  coneRotateYAfterX: number,
  castYaw: number
): { x: number; z: number } {
  // Circle center starts at +X (1, 0, 0). rotateX(-PI/2) keeps (1, 0, 0).
  // rotateY(a) sends (1, 0, 0) -> (cos(a), 0, -sin(a)).
  const lx = Math.cos(coneRotateYAfterX);
  const lz = -Math.sin(coneRotateYAfterX);
  // Group rotateY(castYaw) sends (lx, 0, lz) -> (lx*cos(yaw) + lz*sin(yaw), 0, -lx*sin(yaw) + lz*cos(yaw)).
  const c = Math.cos(castYaw);
  const s = Math.sin(castYaw);
  return {
    x: Number((lx * c + lz * s).toFixed(6)),
    z: Number((-lx * s + lz * c).toFixed(6)),
  };
}

/**
 * Maps server countdown remaining seconds (up to 5.0s) into integer 5..1 or 0 ('FIGHT!').
 */
export function computeCountdownStep(countdown: number): number {
  if (!Number.isFinite(countdown) || countdown <= 0) return 0;
  return Math.max(1, Math.min(5, Math.ceil(countdown)));
}

/**
 * Selects the optimal target point within maxRange maximizing covered alive enemies
 * within clusterRadius (used when tapping Khen's Thousand-Shadow Domain).
 */
export function findBestEnemyClusterTarget<
  T extends { playerId: string; x: number; z: number; isKO?: boolean }
>(
  originX: number,
  originZ: number,
  selfId: string,
  candidates: T[],
  maxRange: number,
  clusterRadius: number
): { x: number; z: number; count: number } | null {
  const alive = candidates.filter((c) => c.playerId !== selfId && !c.isKO);
  if (alive.length === 0) return null;

  let bestX = alive[0].x;
  let bestZ = alive[0].z;
  let bestCount = -1;
  let bestDist = Infinity;

  for (const anchor of alive) {
    const dx = anchor.x - originX;
    const dz = anchor.z - originZ;
    const rawDist = Math.hypot(dx, dz);
    const scale = rawDist > maxRange && rawDist > 0.001 ? maxRange / rawDist : 1;
    const cx = originX + dx * scale;
    const cz = originZ + dz * scale;

    let count = 0;
    for (const member of alive) {
      if (Math.hypot(member.x - cx, member.z - cz) <= clusterRadius) {
        count += 1;
      }
    }

    const clampedDist = Math.hypot(cx - originX, cz - originZ);
    if (count > bestCount || (count === bestCount && clampedDist < bestDist)) {
      bestCount = count;
      bestDist = clampedDist;
      bestX = cx;
      bestZ = cz;
    }
  }

  return { x: bestX, z: bestZ, count: bestCount };
}

/**
 * Checks whether a target point (px, pz) sits inside a directional beam corridor.
 */
export function isPointInBeamCorridor(
  px: number,
  pz: number,
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  range: number,
  halfWidth: number
): boolean {
  const dx = px - originX;
  const dz = pz - originZ;
  const along = dx * dirX + dz * dirZ;
  const perp = Math.abs(dx * -dirZ + dz * dirX);
  return along >= -0.4 && along <= range && perp <= halfWidth;
}

/**
 * Checks whether a target point (px, pz) sits inside a directional fan cone.
 */
export function isPointInFanCone(
  px: number,
  pz: number,
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  range: number,
  minDot: number
): boolean {
  const dx = px - originX;
  const dz = pz - originZ;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return false;
  if (dist <= 0.85) return true;
  const dot = (dx / dist) * dirX + (dz / dist) * dirZ;
  return dot >= minDot;
}

/**
 * Smoothly curves a homing projectile velocity vector toward a target position at max turnRate (rad/s).
 */
export function stepHomingProjectileVelocity(
  vx: number,
  vz: number,
  px: number,
  pz: number,
  tx: number,
  tz: number,
  speed: number,
  turnRate: number,
  dt: number
): { vx: number; vz: number; rotY: number } {
  const safeDt = Math.max(0, Math.min(dt, 0.05));
  const dx = tx - px;
  const dz = tz - pz;
  const curYaw = Math.atan2(vx, vz);
  if (Math.hypot(dx, dz) < 0.05) {
    return { vx, vz, rotY: curYaw };
  }
  const desiredYaw = Math.atan2(dx, dz);
  let diff = desiredYaw - curYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxStep = Math.max(0, turnRate) * safeDt;
  const nextYaw = curYaw + Math.max(-maxStep, Math.min(maxStep, diff));
  return {
    vx: Math.sin(nextYaw) * speed,
    vz: Math.cos(nextYaw) * speed,
    rotY: nextYaw,
  };
}

/**
 * Enforces 20 ticks/sec (50ms) multiplayer snapshot broadcast cadence unless forceFlush is true.
 */
export function shouldBroadcastMultiplayerSnapshot(
  nowMs: number,
  lastBroadcastMs: number,
  forceFlush = false,
  intervalMs = 50
): boolean {
  if (forceFlush) return true;
  if (!Number.isFinite(lastBroadcastMs) || lastBroadcastMs <= 0) return true;
  return nowMs - lastBroadcastMs >= intervalMs - 0.5;
}

/**
 * Throttles heavy bot AI target/vision scans to 100ms (10 Hz) while allowing smooth movement every tick.
 */
export function shouldScanBotVision(
  timerSec: number,
  dtSec: number,
  scanIntervalSec = 0.1
): { shouldScan: boolean; nextTimerSec: number } {
  const safeDt = Math.max(0, Math.min(dtSec, 0.1));
  const next = timerSec - safeDt;
  if (next <= 0) {
    return { shouldScan: true, nextTimerSec: scanIntervalSec };
  }
  return { shouldScan: false, nextTimerSec: next };
}

export interface FrameTimeRing {
  samples: Float32Array;
  cursor: number;
  count: number;
  sumMs: number;
}

export function createFrameTimeRing(capacity = 30): FrameTimeRing {
  return {
    samples: new Float32Array(Math.max(4, capacity)),
    cursor: 0,
    count: 0,
    sumMs: 0,
  };
}

export function recordFrameTime(
  ring: FrameTimeRing,
  rawFrameMs: number
): { fps: number; frameTimeMs: number } {
  const clampedMs = Math.max(1, Math.min(250, rawFrameMs));
  const cap = ring.samples.length;
  if (ring.count < cap) {
    ring.samples[ring.cursor] = clampedMs;
    ring.sumMs += clampedMs;
    ring.count += 1;
  } else {
    ring.sumMs -= ring.samples[ring.cursor];
    ring.samples[ring.cursor] = clampedMs;
    ring.sumMs += clampedMs;
  }
  ring.cursor = (ring.cursor + 1) % cap;
  const avgMs = ring.sumMs / Math.max(1, ring.count);
  return {
    fps: Math.max(1, Math.round(1000 / Math.max(0.5, avgMs))),
    frameTimeMs: Number(avgMs.toFixed(1)),
  };
}

export const VOLLEY_DAMAGE_DECAY = [1.0, 0.5, 0.35] as const;

/**
 * Scales multi-bullet volley damage with diminishing returns and a per-target hit cap
 * so close-range shotgunning cannot 1-shot opponents.
 */
export function computeVolleyProjectileDamage(
  baseDamage: number,
  priorTargetHits: number,
  maxHitsPerTarget = 3
): number {
  if (baseDamage <= 0 || maxHitsPerTarget <= 0 || priorTargetHits >= maxHitsPerTarget) {
    return 0;
  }
  const idx = Math.max(0, Math.min(priorTargetHits, VOLLEY_DAMAGE_DECAY.length - 1));
  return Math.max(1, Math.round(baseDamage * VOLLEY_DAMAGE_DECAY[idx]));
}

/**
 * Returns tight, dodgeable projectile collision radii per projectile kind.
 */
export function resolveProjectileHitRadius(kind: string): number {
  if (kind === 'tornadoVortex') return 2.8;
  if (kind === 'windBlade') return 2.15;
  if (kind === 'lasso') return 1.95;
  if (kind === 'crescent' || kind === 'tornado' || kind === 'jmBeam') return 1.7;
  if (kind === 'magnum' || kind === 'solarRailgun') return 1.05;
  if (kind === 'bullet') return 0.85;
  return 1.2;
}
