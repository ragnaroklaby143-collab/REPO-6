import type { FighterId, GameModeId, TeamId } from '../shared/gameData.ts';

export interface FighterDomainConfig {
  fighterId: FighterId;
  domainName: string;
  subtitle: string;
  radius: number;
  durationSec: number;
  sureHitIntervalSec: number;
  sureHitDamage: number;
  enemySlowFrac: number;
  primaryHex: number;
  secondaryHex: number;
  primaryCss: string;
}

export type DomainCastPhase = 'escape_window' | 'sealed_cancelable' | 'building' | 'complete';

export interface DomainTierConfig {
  fighterId: FighterId;
  radius: number;
  castTotalSec: number;
  escapeEndSec: number;
  sealEndSec: number;
  isCompactFast: boolean;
}

export interface DomainCastPhaseInfo {
  phase: DomainCastPhase;
  casterSpeedMult: number;
  barrierSealed: boolean;
  canHitCancel: boolean;
  canTriggerClash: boolean;
  remainingInPhase: number;
  progress: number;
}

export const DOMAIN_DURATION_SEC = 10.0;
export const DOMAIN_CLASH_WINDOW_SEC = 1.5;
export const DOMAIN_CLASH_DURATION_SEC = 5.5;
export const DOMAIN_CLASH_MASH_PUSH = 0.095;
export const DOMAIN_DAMEN_JACKPOT_HITS = 3;

export const DOMAIN_CONFIGS: Record<FighterId, FighterDomainConfig> = {
  khen: {
    fighterId: 'khen',
    domainName: 'Unlimited Shadow Void',
    subtitle: '45% Slow · 3 Autonomous Shadow Clones · -70% Dash CD',
    radius: 17.5,
    durationSec: DOMAIN_DURATION_SEC,
    sureHitIntervalSec: 0.75,
    sureHitDamage: 0,
    enemySlowFrac: 0.45,
    primaryHex: 0xa855f7,
    secondaryHex: 0x09090b,
    primaryCss: '#a855f7',
  },
  prime: {
    fighterId: 'prime',
    domainName: 'Malevolent Crater Shrine',
    subtitle: 'Compact Fast Domain · Seismic Magma Fissures · Super Armor',
    radius: 19.0,
    durationSec: DOMAIN_DURATION_SEC,
    sureHitIntervalSec: 0.5,
    sureHitDamage: 0,
    enemySlowFrac: 0.15,
    primaryHex: 0xf43f5e,
    secondaryHex: 0x450a0a,
    primaryCss: '#f43f5e',
  },
  damen: {
    fighterId: 'damen',
    domainName: 'Idle Deadeye Gamble',
    subtitle: 'Ricocheting Domain Bullets · 3 Hits = JACKPOT Unlimited Chi',
    radius: 18.0,
    durationSec: DOMAIN_DURATION_SEC,
    sureHitIntervalSec: 0.42,
    sureHitDamage: 0,
    enemySlowFrac: 0.1,
    primaryHex: 0xfacc15,
    secondaryHex: 0x78350f,
    primaryCss: '#facc15',
  },
  marjohn: {
    fighterId: 'marjohn',
    domainName: 'Horizon of the Calamity Typhoon',
    subtitle: 'Swirling Domain Tornadoes · Inward Gale Pull · Typhoon Flight',
    radius: 19.5,
    durationSec: DOMAIN_DURATION_SEC,
    sureHitIntervalSec: 0.55,
    sureHitDamage: 0,
    enemySlowFrac: 0.22,
    primaryHex: 0x22d3ee,
    secondaryHex: 0x0c4a6e,
    primaryCss: '#22d3ee',
  },
  jm: {
    fighterId: 'jm',
    domainName: 'Celestial Benevolent Sanctuary',
    subtitle: 'Compact Fast Domain · Edge-to-Edge Mirror Web · 0-Chi Kamehameha',
    radius: 18.5,
    durationSec: DOMAIN_DURATION_SEC,
    sureHitIntervalSec: 0.6,
    sureHitDamage: 0,
    enemySlowFrac: 0.12,
    primaryHex: 0xfef08a,
    secondaryHex: 0xf59e0b,
    primaryCss: '#fde047',
  },
};

export function getDomainTierConfig(fighterId: FighterId): DomainTierConfig {
  const base = DOMAIN_CONFIGS[fighterId];
  const isCompactFast = fighterId === 'jm' || fighterId === 'prime';
  if (isCompactFast) {
    return {
      fighterId,
      radius: Number((base.radius * 0.7).toFixed(2)),
      castTotalSec: 2.5,
      escapeEndSec: 0.5,
      sealEndSec: 1.5,
      isCompactFast: true,
    };
  }
  return {
    fighterId,
    radius: base.radius,
    castTotalSec: 5.0,
    escapeEndSec: 1.0,
    sealEndSec: 3.0,
    isCompactFast: false,
  };
}

export function resolveDomainCastPhase(
  elapsedSec: number,
  fighterId: FighterId
): DomainCastPhaseInfo {
  const tier = getDomainTierConfig(fighterId);
  const t = Math.max(0, Number.isFinite(elapsedSec) ? elapsedSec : 0);
  if (t < tier.escapeEndSec) {
    return {
      phase: 'escape_window',
      casterSpeedMult: 0.5,
      barrierSealed: false,
      canHitCancel: false,
      canTriggerClash: true,
      remainingInPhase: Math.max(0, tier.escapeEndSec - t),
      progress: t / tier.castTotalSec,
    };
  }
  if (t < tier.sealEndSec) {
    return {
      phase: 'sealed_cancelable',
      casterSpeedMult: 0.5,
      barrierSealed: true,
      canHitCancel: true,
      canTriggerClash: true,
      remainingInPhase: Math.max(0, tier.sealEndSec - t),
      progress: t / tier.castTotalSec,
    };
  }
  if (t < tier.castTotalSec) {
    return {
      phase: 'building',
      casterSpeedMult: 0,
      barrierSealed: true,
      canHitCancel: false,
      canTriggerClash: true,
      remainingInPhase: Math.max(0, tier.castTotalSec - t),
      progress: t / tier.castTotalSec,
    };
  }
  return {
    phase: 'complete',
    casterSpeedMult: 1,
    barrierSealed: true,
    canHitCancel: false,
    canTriggerClash: true,
    remainingInPhase: 0,
    progress: 1,
  };
}

export function addDomainCharge(current: number, delta: number, rateMultiplier = 1.0): number {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeDelta = Math.max(0, Number.isFinite(delta) ? delta : 0) * Math.max(0, rateMultiplier);
  return Math.max(0, Math.min(100, Number((safeCurrent + safeDelta).toFixed(2))));
}

export function canActivateDomain(params: {
  domainGauge: number;
  isKO: boolean;
  isStunned: boolean;
  silencedTimer?: number;
  activeDomainOwnerId?: string | null;
  castingDomainCasterId?: string | null;
  playerId: string;
}): boolean {
  if (params.isKO || params.isStunned || (params.silencedTimer ?? 0) > 0) return false;
  if (params.domainGauge < 100 - 1e-6) return false;
  if (params.activeDomainOwnerId && params.activeDomainOwnerId === params.playerId) return false;
  if (params.castingDomainCasterId && params.castingDomainCasterId === params.playerId) return false;
  return true;
}

export function canTriggerDomainClash(params: {
  existingDomainElapsedSec: number;
  existingOwnerId: string;
  challengerId: string;
  areAllied: boolean;
  isExistingCasting?: boolean;
}): boolean {
  if (params.areAllied || params.existingOwnerId === params.challengerId) return false;
  if (params.isExistingCasting) return true;
  return params.existingDomainElapsedSec <= DOMAIN_CLASH_WINDOW_SEC + 0.001;
}

export function stepDomainClashBalance(
  balance: number,
  side: 'p1' | 'p2',
  push = DOMAIN_CLASH_MASH_PUSH
): number {
  const dir = side === 'p1' ? -1 : 1;
  return Math.max(-1, Math.min(1, balance + dir * push));
}

export function resolveDomainClashWinner(
  balance: number,
  p1Mashes: number,
  p2Mashes: number
): 'p1' | 'p2' {
  if (Math.abs(balance) >= 0.04) {
    return balance < 0 ? 'p1' : 'p2';
  }
  return p1Mashes >= p2Mashes ? 'p1' : 'p2';
}

export function resolveDamageDomainClashWinner(
  p1Damage: number,
  p2Damage: number,
  p1Mashes = 0,
  p2Mashes = 0
): 'p1' | 'p2' {
  const d1 = Number.isFinite(p1Damage) ? Math.max(0, p1Damage) : 0;
  const d2 = Number.isFinite(p2Damage) ? Math.max(0, p2Damage) : 0;
  if (Math.abs(d1 - d2) > 0.01) {
    return d1 > d2 ? 'p1' : 'p2';
  }
  return p1Mashes >= p2Mashes ? 'p1' : 'p2';
}

export function intersectLineWithCircle2D(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  r: number
): {
  tMin: number;
  tMax: number;
  entryX: number;
  entryZ: number;
  exitX: number;
  exitZ: number;
} {
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const ox = px - cx;
  const oz = pz - cz;
  const b = ox * ux + oz * uz;
  const c = ox * ox + oz * oz - r * r;
  const disc = Math.max(0, b * b - c);
  const root = Math.sqrt(disc);
  const tMin = -b - root;
  const tMax = -b + root;
  return {
    tMin,
    tMax,
    entryX: px + ux * tMin,
    entryZ: pz + uz * tMin,
    exitX: px + ux * tMax,
    exitZ: pz + uz * tMax,
  };
}

export function computeEdgeToEdgeMirrorTeleport(params: {
  fromX: number;
  fromZ: number;
  moveX: number;
  moveZ: number;
  centerX: number;
  centerZ: number;
  radius: number;
}): {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  dirX: number;
  dirZ: number;
  chordLength: number;
} {
  const moveLen = Math.hypot(params.moveX, params.moveZ);
  const dirX = moveLen > 0.001 ? params.moveX / moveLen : 0;
  const dirZ = moveLen > 0.001 ? params.moveZ / moveLen : -1;
  const edgeR = Math.max(2.0, params.radius - 0.85);

  // Clamp origin inside the usable domain circle first
  const offX = params.fromX - params.centerX;
  const offZ = params.fromZ - params.centerZ;
  const offLen = Math.hypot(offX, offZ);
  const clampedX =
    offLen > edgeR && offLen > 0.001 ? params.centerX + (offX / offLen) * edgeR : params.fromX;
  const clampedZ =
    offLen > edgeR && offLen > 0.001 ? params.centerZ + (offZ / offLen) * edgeR : params.fromZ;

  const hit = intersectLineWithCircle2D(
    clampedX,
    clampedZ,
    dirX,
    dirZ,
    params.centerX,
    params.centerZ,
    edgeR
  );

  // If already near the forward edge in our travel direction, mirror to the opposite boundary edge
  // along our movement direction so edge-to-edge criss-crossing stays continuous across the dome!
  const remainingForward = Math.hypot(hit.exitX - clampedX, hit.exitZ - clampedZ);
  const startX = remainingForward < 2.2 ? hit.entryX : clampedX;
  const startZ = remainingForward < 2.2 ? hit.entryZ : clampedZ;
  const endX = hit.exitX;
  const endZ = hit.exitZ;

  return {
    startX,
    startZ,
    endX,
    endZ,
    dirX,
    dirZ,
    chordLength: Math.hypot(endX - startX, endZ - startZ),
  };
}

export function distancePointToSegment2D(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): { dist: number; t: number; closestX: number; closestZ: number } {
  const vx = x2 - x1;
  const vz = z2 - z1;
  const lenSq = vx * vx + vz * vz;
  if (lenSq <= 1e-8) {
    return {
      dist: Math.hypot(px - x1, pz - z1),
      t: 0,
      closestX: x1,
      closestZ: z1,
    };
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (pz - z1) * vz) / lenSq));
  const closestX = x1 + vx * t;
  const closestZ = z1 + vz * t;
  return {
    dist: Math.hypot(px - closestX, pz - closestZ),
    t,
    closestX,
    closestZ,
  };
}

export function computePunchLaunchToFarEdge(
  enemyX: number,
  enemyZ: number,
  dirX: number,
  dirZ: number,
  centerX: number,
  centerZ: number,
  radius: number
): { targetX: number; targetZ: number; launchVx: number; launchVz: number } {
  const len = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / len;
  const uz = dirZ / len;
  const edgeR = Math.max(2.0, radius - 0.9);
  const hit = intersectLineWithCircle2D(enemyX, enemyZ, ux, uz, centerX, centerZ, edgeR);
  const distToEdge = Math.max(2.5, Math.hypot(hit.exitX - enemyX, hit.exitZ - enemyZ));
  const speed = Math.min(34, Math.max(16, distToEdge * 2.1));
  return {
    targetX: hit.exitX,
    targetZ: hit.exitZ,
    launchVx: ux * speed,
    launchVz: uz * speed,
  };
}

export function areActorsAllied(
  a: { playerId: string; team?: TeamId | null },
  b: { playerId: string; team?: TeamId | null },
  gameMode: GameModeId
): boolean {
  if (a.playerId === b.playerId) return true;
  if (gameMode !== 'squad_clash' && gameMode !== 'raid_boss') return false;
  if (!a.team || !b.team) return false;
  return a.team === b.team;
}

export const PRIME_DOMAIN_CONFIG = {
  m1SpeedMult: 1.3,
  dashCdMult: 0.6,
  geyserWindupSec: 0.45,
  geyserIntervalSec: 0.56,
  geyserRadius: 3.15,
  meteorWindupSec: 0.55,
  meteorIntervalSec: 0.65,
  meteorRadius: 3.35,
} as const;

export function clampPositionToDomainBarrier(params: {
  x: number;
  z: number;
  centerX: number;
  centerZ: number;
  domainRadius: number;
  actorRadius?: number;
  isInside: boolean;
}): { x: number; z: number; clamped: boolean } {
  const actorR = params.actorRadius ?? 0.55;
  const dx = params.x - params.centerX;
  const dz = params.z - params.centerZ;
  const dist = Math.hypot(dx, dz);

  if (params.isInside) {
    const maxR = Math.max(0.75, params.domainRadius - actorR);
    if (dist <= maxR) {
      return { x: params.x, z: params.z, clamped: false };
    }
    const nx = dist > 1e-4 ? dx / dist : 1;
    const nz = dist > 1e-4 ? dz / dist : 0;
    return {
      x: params.centerX + nx * maxR,
      z: params.centerZ + nz * maxR,
      clamped: true,
    };
  }

  const minR = params.domainRadius + actorR;
  if (dist >= minR) {
    return { x: params.x, z: params.z, clamped: false };
  }
  const nx = dist > 1e-4 ? dx / dist : 1;
  const nz = dist > 1e-4 ? dz / dist : 0;
  return {
    x: params.centerX + nx * minR,
    z: params.centerZ + nz * minR,
    clamped: true,
  };
}

export function pickRandomJmEdgeTarget(params: {
  fromX: number;
  fromZ: number;
  centerX: number;
  centerZ: number;
  domainRadius: number;
  rand?: () => number;
}): { x: number; z: number; edgeR: number } {
  const rand = params.rand ?? Math.random;
  const edgeR = Math.max(2.0, params.domainRadius - 0.85);
  const dx = params.fromX - params.centerX;
  const dz = params.fromZ - params.centerZ;
  const curAng = Math.hypot(dx, dz) > 0.2 ? Math.atan2(dz, dx) : rand() * Math.PI * 2;
  // Sweep across the domain chord: offset between +1.35 rad (~77 deg) and +4.93 rad (~282 deg)
  const deltaAng = 1.35 + rand() * 3.58;
  const nextAng = curAng + deltaAng;
  return {
    x: params.centerX + Math.cos(nextAng) * edgeR,
    z: params.centerZ + Math.sin(nextAng) * edgeR,
    edgeR,
  };
}

/**
 * Computes JM's next edge-to-edge dash target inside Celestial Benevolent Sanctuary:
 * - If holding joystick/WASD (`moveX, moveZ`), dashes directly in that direction; if already
 *   pressed against the front domain wall while holding forward/diagonal into it, reflects off
 *   the circular wall so holding a diagonal continuously bounces diagonally back and forth!
 * - If joystick is neutral/idle, reflects `lastDir` off the boundary wall (with slight angular
 *   spread when nearly dead-on radial so auto-bounce continuously weaves a laser web).
 */
export function resolveNextJmBounceTarget(params: {
  fromX: number;
  fromZ: number;
  centerX: number;
  centerZ: number;
  domainRadius: number;
  moveX: number;
  moveZ: number;
  lastDirX?: number;
  lastDirZ?: number;
  fallbackYaw?: number;
}): {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  edgeR: number;
  isWallReflection: boolean;
} {
  const edgeR = Math.max(2.2, params.domainRadius - 0.85);
  const offX = params.fromX - params.centerX;
  const offZ = params.fromZ - params.centerZ;
  const offLen = Math.hypot(offX, offZ);
  const startX =
    offLen > edgeR && offLen > 1e-4 ? params.centerX + (offX / offLen) * edgeR : params.fromX;
  const startZ =
    offLen > edgeR && offLen > 1e-4 ? params.centerZ + (offZ / offLen) * edgeR : params.fromZ;

  // Outward boundary normal at current location
  const nx = offLen > 0.15 ? offX / offLen : 0;
  const nz = offLen > 0.15 ? offZ / offLen : 1;
  const nearWall = offLen >= edgeR - 1.35;

  const moveLen = Math.hypot(params.moveX, params.moveZ);
  const hasInput = moveLen > 0.12;

  let ux = 0;
  let uz = 1;
  let isWallReflection = false;

  if (hasInput) {
    const ix = params.moveX / moveLen;
    const iz = params.moveZ / moveLen;
    const intoWallDot = ix * nx + iz * nz;
    if (nearWall && intoWallDot > 0.18) {
      // Reflect player's held direction off the circular barrier normal so holding diagonal bounces cleanly
      let rx = ix - 2 * intoWallDot * nx;
      let rz = iz - 2 * intoWallDot * nz;
      const rLen = Math.hypot(rx, rz) || 1;
      rx /= rLen;
      rz /= rLen;
      // If nearly head-on perpendicular into the wall, add a crisp diagonal bounce angle
      const cross = Math.abs(rx * nz - rz * nx);
      if (cross < 0.24) {
        const sign = (params.lastDirX ?? 0) * nz - (params.lastDirZ ?? 0) * nx >= 0 ? 1 : -1;
        const rot = 0.42 * sign;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const drx = rx * cos - rz * sin;
        const drz = rx * sin + rz * cos;
        rx = drx;
        rz = drz;
      }
      ux = rx;
      uz = rz;
      isWallReflection = true;
    } else {
      ux = ix;
      uz = iz;
    }
  } else {
    // Idle auto-bounce: reflect previous travel vector across circular wall normal
    const prevLen = Math.hypot(params.lastDirX ?? 0, params.lastDirZ ?? 0);
    let lx =
      prevLen > 0.05
        ? (params.lastDirX ?? 0) / prevLen
        : Math.sin(params.fallbackYaw ?? 0.55);
    let lz =
      prevLen > 0.05
        ? (params.lastDirZ ?? 1) / prevLen
        : Math.cos(params.fallbackYaw ?? 0.55);

    if (nearWall) {
      const dot = lx * nx + lz * nz;
      if (dot > 0.05) {
        lx = lx - 2 * dot * nx;
        lz = lz - 2 * dot * nz;
      } else if (dot > -0.25) {
        lx = -nx;
        lz = -nz;
      }
      const nLen = Math.hypot(lx, lz) || 1;
      lx /= nLen;
      lz /= nLen;
      // Slight angular spread when reflection is almost strictly radial so web criss-crosses organically
      const cross = Math.abs(lx * nz - lz * nx);
      if (cross < 0.28) {
        const rot = 0.48;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const rx = lx * cos - lz * sin;
        const rz = lx * sin + lz * cos;
        lx = rx;
        lz = rz;
      }
      isWallReflection = true;
    }
    ux = lx;
    uz = lz;
  }

  let hit = intersectLineWithCircle2D(startX, startZ, ux, uz, params.centerX, params.centerZ, edgeR);
  let chord = Math.hypot(hit.exitX - startX, hit.exitZ - startZ);

  // Safety guard: if exit chord is tiny (< 2.0m), steer toward opposite hemisphere
  if (chord < 2.0) {
    const inwardX = offLen > 0.15 ? -nx : ux;
    const inwardZ = offLen > 0.15 ? -nz : uz;
    const rot = 0.45;
    ux = inwardX * Math.cos(rot) - inwardZ * Math.sin(rot);
    uz = inwardX * Math.sin(rot) + inwardZ * Math.cos(rot);
    hit = intersectLineWithCircle2D(startX, startZ, ux, uz, params.centerX, params.centerZ, edgeR);
    chord = Math.hypot(hit.exitX - startX, hit.exitZ - startZ);
    if (chord > 0.01) {
      ux = (hit.exitX - startX) / chord;
      uz = (hit.exitZ - startZ) / chord;
    }
  }

  return {
    x: hit.exitX,
    z: hit.exitZ,
    dirX: ux,
    dirZ: uz,
    edgeR,
    isWallReflection,
  };
}

export function resolveJmLaserTouch<
  T extends { x1: number; z1: number; x2: number; z2: number }
>(
  px: number,
  pz: number,
  lines: T[],
  hitRadius = 1.15
): { hit: true; index: number; closestX: number; closestZ: number } | { hit: false } {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const seg = distancePointToSegment2D(px, pz, line.x1, line.z1, line.x2, line.z2);
    if (seg.dist <= hitRadius) {
      return {
        hit: true,
        index: i,
        closestX: seg.closestX,
        closestZ: seg.closestZ,
      };
    }
  }
  return { hit: false };
}

