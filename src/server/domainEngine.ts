import type { AwakeningHostHelpers, AwakeningRoomState, AwakeningActor } from './awakeningEngine.ts';
import { applyDirectStun, landMarjohnFlight } from './awakeningEngine.ts';
import type {
  DomainCastState,
  DomainClashState,
  DomainExpansionState,
  DomainJmWebLineState,
  DomainKhenCloneState,
  GameModeId,
  KothZoneState,
} from '../shared/gameData.ts';
import {
  FIGHTER_BY_ID,
  MAP_BY_ID,
  getDamagePhase,
  getMapTerrainHeight,
  getObstacleSupportY,
  resolveObstacleCollisions,
} from '../shared/gameData.ts';
import {
  DOMAIN_CLASH_DURATION_SEC,
  DOMAIN_CONFIGS,
  DOMAIN_DAMEN_JACKPOT_HITS,
  PRIME_DOMAIN_CONFIG,
  addDomainCharge,
  areActorsAllied,
  canActivateDomain,
  canTriggerDomainClash,
  clampPositionToDomainBarrier,
  computePunchLaunchToFarEdge,
  distancePointToSegment2D,
  getDomainTierConfig,
  intersectLineWithCircle2D,
  resolveDamageDomainClashWinner,
  resolveDomainCastPhase,
  resolveJmLaserTouch,
  resolveNextJmBounceTarget,
  stepDomainClashBalance,
} from '../game/domainLogic.ts';

export interface DomainModeRoomState extends AwakeningRoomState {
  gameMode: GameModeId;
  castingDomain?: DomainCastState | null;
  activeDomain: DomainExpansionState | null;
  activeDomainClash: (DomainClashState & { p1Overdrive?: number }) | null;
  kothZone: KothZoneState | null;
  teamScores: { alpha: number; beta: number };
  modeTimer: number;
  raidBossId: string | null;
  phase: 'lobby' | 'countdown' | 'combat' | 'roundEnd' | 'victory';
  winnerId: string | null;
  roundWinnerId: string | null;
}

interface InternalKhenClone extends DomainKhenCloneState {
  vx: number;
  vz: number;
  attackCd: number;
  skillCd: number;
  dashCd: number;
  crescentCd: number;
  flankAngle: number;
}

interface InternalPrimeTremor {
  x: number;
  z: number;
  radius: number;
  elapsed: number;
  windup: number;
}

interface ActiveDomainRuntime {
  trappedIdSet: Set<string>;
  khenClones: InternalKhenClone[];
  jmWebLines: DomainJmWebLineState[];
  jmWebHitCooldowns: Record<string, number>;
  jmBodyHitCooldowns: Record<string, number>;
  jmDashFromX: number;
  jmDashFromZ: number;
  jmDashToX: number;
  jmDashToZ: number;
  jmLastDirX: number;
  jmLastDirZ: number;
  jmSegInputX: number;
  jmSegInputZ: number;
  jmDashElapsed: number;
  jmDashDuration: number;
  jmDashPauseTimer: number;
  jmHasDashSegment: boolean;
  marjohnTornadoTimer: number;
  primeTremorTimer: number;
  primeTremors: InternalPrimeTremor[];
  primeMeteorTimer: number;
  primeMeteors: InternalPrimeTremor[];
}

interface CastDomainRuntime {
  sealedCaptured: boolean;
  trappedIds: Set<string>;
}

const activeDomainRuntimeMap = new WeakMap<DomainExpansionState, ActiveDomainRuntime>();
const castDomainRuntimeMap = new WeakMap<DomainCastState, CastDomainRuntime>();

function getOrCreateActiveRuntime(dom: DomainExpansionState): ActiveDomainRuntime {
  let rt = activeDomainRuntimeMap.get(dom);
  if (!rt) {
    rt = {
      trappedIdSet: new Set<string>(dom.trappedIds ?? [dom.ownerId]),
      khenClones: [],
      jmWebLines: [],
      jmWebHitCooldowns: {},
      jmBodyHitCooldowns: {},
      jmDashFromX: dom.centerX,
      jmDashFromZ: dom.centerZ,
      jmDashToX: dom.centerX,
      jmDashToZ: dom.centerZ,
      jmLastDirX: 0.6,
      jmLastDirZ: 0.8,
      jmSegInputX: 0,
      jmSegInputZ: 0,
      jmDashElapsed: 0,
      jmDashDuration: 0.22,
      jmDashPauseTimer: 0.03,
      jmHasDashSegment: false,
      marjohnTornadoTimer: 0.4,
      primeTremorTimer: 0.18,
      primeTremors: [],
      primeMeteorTimer: 0.32,
      primeMeteors: [],
    };
    activeDomainRuntimeMap.set(dom, rt);
  }
  return rt;
}

function getOrCreateCastRuntime(cast: DomainCastState): CastDomainRuntime {
  let rt = castDomainRuntimeMap.get(cast);
  if (!rt) {
    rt = {
      sealedCaptured: false,
      trappedIds: new Set<string>(),
    };
    castDomainRuntimeMap.set(cast, rt);
  }
  return rt;
}

const KOTH_SPOTS: Array<{ x: number; z: number }> = [
  { x: 0, z: 0 },
  { x: -11.5, z: -9.5 },
  { x: 11.5, z: -9.5 },
  { x: -11.5, z: 9.5 },
  { x: 11.5, z: 9.5 },
  { x: 0, z: -13.0 },
  { x: 0, z: 13.0 },
];

export function createInitialKothZone(): KothZoneState {
  return {
    x: 0,
    z: 0,
    radius: 5.5,
    shiftRemaining: 30.0,
    scores: {},
    controllerId: null,
    controllerName: null,
    controllerTeam: null,
    contested: false,
  };
}

function emitDomainCastPacket(
  room: DomainModeRoomState,
  actor: AwakeningActor,
  centerX: number,
  centerZ: number,
  radius: number,
  castDuration: number,
  helpers: AwakeningHostHelpers
): void {
  const cfg = DOMAIN_CONFIGS[actor.fighterId];
  helpers.broadcastPacket?.(room, {
    type: 'domain:castStart',
    casterId: actor.playerId,
    casterName: actor.name,
    fighterId: actor.fighterId,
    skinId: actor.skinId,
    domainName: cfg.domainName,
    x: Number(centerX.toFixed(2)),
    z: Number(centerZ.toFixed(2)),
    radius,
    castDuration,
    primaryHex: cfg.primaryHex,
    timestamp: Date.now(),
  });
}

function startDamageDomainClash(
  room: DomainModeRoomState,
  p1: AwakeningActor,
  p2: AwakeningActor,
  centerX: number,
  centerZ: number,
  radius: number,
  helpers: AwakeningHostHelpers
): void {
  const p1Cfg = DOMAIN_CONFIGS[p1.fighterId];
  const p2Cfg = DOMAIN_CONFIGS[p2.fighterId];
  room.castingDomain = null;
  room.activeDomain = null;
  if (p1.fighterId === 'marjohn') landMarjohnFlight(p1);
  if (p2.fighterId === 'marjohn') landMarjohnFlight(p2);
  p1.iframeTimer = Math.max(p1.iframeTimer, 0.55);
  p2.iframeTimer = Math.max(p2.iframeTimer, 0.55);
  if (p1.actionState === 'stagger') {
    p1.actionState = 'idle';
    p1.actionTimer = 0;
    p1.isStunned = false;
    p1.stunnedTimer = 0;
  }
  if (p2.actionState === 'stagger') {
    p2.actionState = 'idle';
    p2.actionTimer = 0;
    p2.isStunned = false;
    p2.stunnedTimer = 0;
  }

  room.activeDomainClash = {
    id: helpers.makeId('dclash'),
    p1Id: p1.playerId,
    p2Id: p2.playerId,
    p1Name: p1.name,
    p2Name: p2.name,
    p1FighterId: p1.fighterId,
    p2FighterId: p2.fighterId,
    p1DomainName: p1Cfg.domainName,
    p2DomainName: p2Cfg.domainName,
    balance: 0,
    p1Mashes: 0,
    p2Mashes: 0,
    p1Damage: 0,
    p2Damage: 0,
    centerX: Number(centerX.toFixed(2)),
    centerZ: Number(centerZ.toFixed(2)),
    radius,
    remaining: DOMAIN_CLASH_DURATION_SEC,
    duration: DOMAIN_CLASH_DURATION_SEC,
  };

  helpers.pushEvent(room, {
    kind: 'domainClashStart',
    attackerId: p1.playerId,
    targetId: p2.playerId,
    fighterId: p2.fighterId,
    x: centerX,
    y: 1.4,
    z: centerZ,
    radius,
    colorHex: p2Cfg.primaryHex,
    hitStopMs: 95,
    callout: 'DOMAIN CLASH! MOST DAMAGE WINS!',
  });
}

export function handleDomainActivate(
  room: DomainModeRoomState,
  actor: AwakeningActor,
  helpers: AwakeningHostHelpers
): boolean {
  if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return false;
  if (room.activeDomainClash) return false;

  // 1. Check Clash against an actively Casting Domain
  const existingCast = room.castingDomain ?? null;
  if (existingCast) {
    const caster = room.actors.find((a) => a.playerId === existingCast.casterId);
    const allied = caster ? areActorsAllied(actor, caster, room.gameMode) : false;
    if (
      canActivateDomain({
        domainGauge: actor.domainGauge ?? 0,
        isKO: actor.isKO,
        isStunned: actor.isStunned,
        silencedTimer: actor.silencedTimer,
        castingDomainCasterId: existingCast.casterId,
        playerId: actor.playerId,
      }) &&
      canTriggerDomainClash({
        existingDomainElapsedSec: existingCast.elapsed,
        existingOwnerId: existingCast.casterId,
        challengerId: actor.playerId,
        areAllied: allied,
        isExistingCasting: true,
      }) &&
      caster &&
      !caster.isKO
    ) {
      actor.domainGauge = 0;
      const challengerTier = getDomainTierConfig(actor.fighterId);
      emitDomainCastPacket(
        room,
        actor,
        actor.x,
        actor.z,
        challengerTier.radius,
        challengerTier.castTotalSec,
        helpers
      );
      startDamageDomainClash(
        room,
        caster,
        actor,
        existingCast.centerX,
        existingCast.centerZ,
        Math.max(existingCast.radius, challengerTier.radius),
        helpers
      );
      return true;
    }
    return false;
  }

  // 2. Check Clash against an Active Domain inside the 1.5s clash window
  const existing = room.activeDomain;
  if (existing) {
    const existingOwner = room.actors.find((a) => a.playerId === existing.ownerId);
    const allied = existingOwner ? areActorsAllied(actor, existingOwner, room.gameMode) : false;
    const elapsedSec = Math.max(0, existing.duration - existing.remaining);
    if (
      canActivateDomain({
        domainGauge: actor.domainGauge ?? 0,
        isKO: actor.isKO,
        isStunned: actor.isStunned,
        silencedTimer: actor.silencedTimer,
        activeDomainOwnerId: existing.ownerId,
        playerId: actor.playerId,
      }) &&
      canTriggerDomainClash({
        existingDomainElapsedSec: elapsedSec,
        existingOwnerId: existing.ownerId,
        challengerId: actor.playerId,
        areAllied: allied,
      }) &&
      existingOwner &&
      !existingOwner.isKO
    ) {
      actor.domainGauge = 0;
      const challengerTier = getDomainTierConfig(actor.fighterId);
      emitDomainCastPacket(
        room,
        actor,
        actor.x,
        actor.z,
        challengerTier.radius,
        challengerTier.castTotalSec,
        helpers
      );
      startDamageDomainClash(
        room,
        existingOwner,
        actor,
        existing.centerX,
        existing.centerZ,
        Math.max(existing.radius, challengerTier.radius),
        helpers
      );
      return true;
    }
    return false;
  }

  // 3. Fresh Domain Cast
  if (
    !canActivateDomain({
      domainGauge: actor.domainGauge ?? 0,
      isKO: actor.isKO,
      isStunned: actor.isStunned,
      silencedTimer: actor.silencedTimer,
      activeDomainOwnerId: null,
      castingDomainCasterId: null,
      playerId: actor.playerId,
    })
  ) {
    return false;
  }

  startDomainCast(room, actor, helpers);
  return true;
}

function startDomainCast(
  room: DomainModeRoomState,
  actor: AwakeningActor,
  helpers: AwakeningHostHelpers
): void {
  const cfg = DOMAIN_CONFIGS[actor.fighterId];
  const tier = getDomainTierConfig(actor.fighterId);
  actor.domainGauge = 0;
  actor.domainJackpotActive = false;
  actor.domainJackpotHits = 0;

  const castState: DomainCastState = {
    id: helpers.makeId('dcast'),
    casterId: actor.playerId,
    ownerName: actor.name,
    fighterId: actor.fighterId,
    domainName: cfg.domainName,
    centerX: Number(actor.x.toFixed(2)),
    centerZ: Number(actor.z.toFixed(2)),
    radius: tier.radius,
    elapsed: 0,
    duration: tier.castTotalSec,
    phase: 'escape_window',
    primaryHex: cfg.primaryHex,
    secondaryHex: cfg.secondaryHex,
  };
  getOrCreateCastRuntime(castState);
  room.castingDomain = castState;

  // Entry stun on enemies caught inside the initial boundary circle
  const entryStunSec = tier.isCompactFast ? 0.38 : 0.65;
  for (const target of room.actors) {
    if (target.playerId === actor.playerId || target.isKO) continue;
    if (areActorsAllied(actor, target, room.gameMode)) continue;
    const dist = Math.hypot(target.x - castState.centerX, target.z - castState.centerZ);
    if (dist <= castState.radius && target.iframeTimer <= 0) {
      applyDirectStun(target, entryStunSec, false);
    }
  }

  // Emit lightweight network packet immediately so cut-in & circle appear with zero lag
  emitDomainCastPacket(
    room,
    actor,
    castState.centerX,
    castState.centerZ,
    castState.radius,
    tier.castTotalSec,
    helpers
  );

  helpers.pushEvent(room, {
    kind: 'domainCastStart',
    attackerId: actor.playerId,
    fighterId: actor.fighterId,
    x: castState.centerX,
    y: actor.y + 0.6,
    z: castState.centerZ,
    radius: castState.radius,
    colorHex: cfg.primaryHex,
    hitStopMs: 45,
    callout: `DOMAIN EXPANSION: ${cfg.domainName.toUpperCase()}!`,
  });
}

export function tryCancelCastingDomainOnHit(
  room: DomainModeRoomState,
  target: AwakeningActor,
  attacker: AwakeningActor,
  helpers: AwakeningHostHelpers
): boolean {
  const cast = room.castingDomain;
  if (!cast || cast.casterId !== target.playerId) return false;
  if (attacker.playerId === target.playerId) return false;
  if (cast.phase !== 'sealed_cancelable') return false;

  room.castingDomain = null;
  applyDirectStun(target, 0.55, false);
  helpers.pushEvent(room, {
    kind: 'domainCastCancel',
    attackerId: attacker.playerId,
    targetId: target.playerId,
    fighterId: target.fighterId,
    x: target.x,
    y: target.y + 1.4,
    z: target.z,
    colorHex: 0xf43f5e,
    hitStopMs: 75,
    callout: 'DOMAIN CAST BROKEN!',
  });
  return true;
}

export function getCastingDomainCasterSpeedMultiplier(
  room: DomainModeRoomState,
  actorId: string
): number {
  const cast = room.castingDomain;
  if (!cast || cast.casterId !== actorId) return 1.0;
  return resolveDomainCastPhase(cast.elapsed, cast.fighterId).casterSpeedMult;
}

export function recordDomainClashDamage(
  room: DomainModeRoomState,
  attackerId: string,
  dmg: number
): void {
  const dc = room.activeDomainClash;
  if (!dc || dmg <= 0) return;
  if (attackerId === dc.p1Id) {
    dc.p1Damage += dmg;
  } else if (attackerId === dc.p2Id) {
    dc.p2Damage += dmg;
  }
  const diff = dc.p2Damage - dc.p1Damage;
  dc.balance = Number(Math.max(-1, Math.min(1, diff / 65)).toFixed(3));
}

function activateDomainDirect(
  room: DomainModeRoomState,
  actor: AwakeningActor,
  helpers: AwakeningHostHelpers,
  overrideCenterX?: number,
  overrideCenterZ?: number,
  overrideRadius?: number,
  inheritedTrappedIds?: Set<string>
): void {
  const cfg = DOMAIN_CONFIGS[actor.fighterId];
  const tier = getDomainTierConfig(actor.fighterId);
  const centerX = overrideCenterX ?? actor.x;
  const centerZ = overrideCenterZ ?? actor.z;
  const radius = overrideRadius ?? tier.radius;
  actor.domainGauge = 0;
  actor.domainJackpotActive = false;
  actor.domainJackpotHits = 0;
  actor.iframeTimer = Math.max(actor.iframeTimer, 0.5);

  const trappedSet = new Set<string>([actor.playerId]);
  if (inheritedTrappedIds && inheritedTrappedIds.size > 0) {
    for (const tid of inheritedTrappedIds) trappedSet.add(tid);
  }
  for (const candidate of room.actors) {
    if (candidate.isKO) continue;
    if (Math.hypot(candidate.x - centerX, candidate.z - centerZ) <= radius + 0.15) {
      trappedSet.add(candidate.playerId);
    }
  }

  const khenClones: InternalKhenClone[] =
    actor.fighterId === 'khen'
      ? [0, 1, 2].map((idx) => {
          const ang = (idx / 3) * Math.PI * 2;
          const dist = Math.min(4.2, radius * 0.35);
          const cx = centerX + Math.cos(ang) * dist;
          const cz = centerZ + Math.sin(ang) * dist;
          const cy = getObstacleSupportY(room.mapId, cx, 1.5, cz, 0.42, room.obstacles);
          return {
            id: `${actor.playerId}-kclone-${idx}`,
            x: cx,
            y: cy,
            z: cz,
            rotY: ang + Math.PI,
            actionState: 'move',
            swingTimer: 0,
            vx: 0,
            vz: 0,
            attackCd: 0.25 + idx * 0.18,
            skillCd: 0.45 + idx * 0.55,
            dashCd: 0.6 + idx * 0.45,
            crescentCd: 1.2 + idx * 0.6,
            flankAngle: ang,
          };
        })
      : [];

  const domState: DomainExpansionState = {
    id: helpers.makeId('dom'),
    ownerId: actor.playerId,
    ownerName: actor.name,
    fighterId: actor.fighterId,
    domainName: cfg.domainName,
    centerX: Number(centerX.toFixed(2)),
    centerZ: Number(centerZ.toFixed(2)),
    radius,
    remaining: cfg.durationSec,
    duration: cfg.durationSec,
    sureHitTimer: 0.45,
    primaryHex: cfg.primaryHex,
    secondaryHex: cfg.secondaryHex,
    jackpotActive: false,
    jackpotHits: 0,
    trappedIds: Array.from(trappedSet),
    khenClones: khenClones.map((c) => ({
      id: c.id,
      x: Number(c.x.toFixed(2)),
      y: Number(c.y.toFixed(2)),
      z: Number(c.z.toFixed(2)),
      rotY: Number(c.rotY.toFixed(3)),
      actionState: c.actionState,
      swingTimer: Number(c.swingTimer.toFixed(2)),
    })),
    jmWebLines: [],
  };

  const rt = getOrCreateActiveRuntime(domState);
  rt.trappedIdSet = trappedSet;
  rt.khenClones = khenClones;
  room.activeDomain = domState;

  if (actor.fighterId === 'prime') {
    helpers.damageObstaclesInArea(room, centerX, centerZ, radius, 9999, cfg.primaryHex);
    actor.superArmor = true;
    actor.primeDomainBuff = true;
  } else if (actor.fighterId === 'khen') {
    actor.dashCooldown = 0;
    actor.dashCharges = 1;
    actor.dashRechargeRemaining = 0;
  } else if (actor.fighterId === 'marjohn') {
    actor.isFlying = true;
    actor.flightMax = Math.max(actor.flightMax || 9.0, cfg.durationSec);
    actor.flightRemaining = Math.max(actor.flightRemaining, cfg.durationSec);
    actor.flightCooldown = 0;
    actor.grounded = false;
  }

  // Immediately snap all actors to strict inside/outside perimeter upon activation
  enforceDomainBarriers(room);

  helpers.pushEvent(room, {
    kind: 'domainStart',
    attackerId: actor.playerId,
    fighterId: actor.fighterId,
    x: centerX,
    y: actor.y + 1.0,
    z: centerZ,
    radius,
    colorHex: cfg.primaryHex,
    hitStopMs: 80,
    callout: `DOMAIN EXPANSION: ${cfg.domainName.toUpperCase()}!`,
  });
}

export function handleDomainClashMash(
  room: DomainModeRoomState,
  playerId: string,
  helpers: AwakeningHostHelpers,
  explicitSide?: 'p1' | 'p2'
): void {
  const dc = room.activeDomainClash;
  if (!dc) return;

  let side: 'p1' | 'p2' | null = null;
  if (explicitSide && (room.isSoloPractice || room.isTrainingMode)) {
    side = explicitSide;
  } else if (playerId === dc.p1Id) {
    side = 'p1';
  } else if (playerId === dc.p2Id) {
    side = 'p2';
  }
  if (!side) return;

  if (side === 'p1') dc.p1Mashes += 1;
  else dc.p2Mashes += 1;
  if (dc.p1Damage === 0 && dc.p2Damage === 0) {
    dc.balance = Number(stepDomainClashBalance(dc.balance, side, 0.045).toFixed(3));
  }
  void helpers;
}

export function resolveDomainClash(
  room: DomainModeRoomState,
  helpers: AwakeningHostHelpers
): void {
  const dc = room.activeDomainClash;
  if (!dc) return;
  room.activeDomainClash = null;

  const p1 = room.actors.find((a) => a.playerId === dc.p1Id);
  const p2 = room.actors.find((a) => a.playerId === dc.p2Id);
  if (!p1 || !p2) return;
  if (p1.isKO && !p2.isKO) {
    activateDomainDirect(room, p2, helpers, dc.centerX, dc.centerZ, getDomainTierConfig(p2.fighterId).radius);
    return;
  }
  if (p2.isKO && !p1.isKO) {
    activateDomainDirect(room, p1, helpers, dc.centerX, dc.centerZ, getDomainTierConfig(p1.fighterId).radius);
    return;
  }
  if (p1.isKO || p2.isKO) return;

  const winSide = resolveDamageDomainClashWinner(dc.p1Damage, dc.p2Damage, dc.p1Mashes, dc.p2Mashes);
  const winner = winSide === 'p1' ? p1 : p2;
  const loser = winSide === 'p1' ? p2 : p1;
  const dx = loser.x - winner.x;
  const dz = loser.z - winner.z;
  const d = Math.max(0.01, Math.hypot(dx, dz));

  loser.domainGauge = 0;
  loser.vx = (dx / d) * 14.0;
  loser.vz = (dz / d) * 14.0;
  loser.yVel = 6.2;
  loser.grounded = false;
  loser.hp = Math.max(1, loser.hp - 14);
  loser.damagePhase = getDamagePhase(loser.hp, loser.maxHp, loser.isKO);

  const winTier = getDomainTierConfig(winner.fighterId);
  activateDomainDirect(room, winner, helpers, dc.centerX, dc.centerZ, winTier.radius);
  helpers.pushEvent(room, {
    kind: 'domainClashWin',
    attackerId: winner.playerId,
    targetId: loser.playerId,
    fighterId: winner.fighterId,
    x: (winner.x + loser.x) * 0.5,
    y: 1.4,
    z: (winner.z + loser.z) * 0.5,
    colorHex: DOMAIN_CONFIGS[winner.fighterId].primaryHex,
    hitStopMs: 95,
    callout: `${winner.name.toUpperCase()} WON THE CLASH! (${Math.round(dc.p1Damage)} vs ${Math.round(dc.p2Damage)} DMG)`,
  });
}

export function registerDamenDomainBulletHit(
  room: DomainModeRoomState,
  attacker: AwakeningActor,
  helpers: AwakeningHostHelpers
): void {
  const dom = room.activeDomain;
  if (!dom || dom.ownerId !== attacker.playerId || dom.fighterId !== 'damen') return;
  attacker.domainJackpotHits = (attacker.domainJackpotHits ?? 0) + 1;
  dom.jackpotHits = attacker.domainJackpotHits;
  if (!attacker.domainJackpotActive && attacker.domainJackpotHits >= DOMAIN_DAMEN_JACKPOT_HITS) {
    attacker.domainJackpotActive = true;
    dom.jackpotActive = true;
    attacker.mana = attacker.maxMana;
    helpers.pushEvent(room, {
      kind: 'domainJackpot',
      attackerId: attacker.playerId,
      fighterId: 'damen',
      x: attacker.x,
      y: attacker.y + 1.5,
      z: attacker.z,
      colorHex: 0xfacc15,
      hitStopMs: 75,
      callout: 'JACKPOT! UNLIMITED CHI & ARSENAL!',
    });
  }
}

export function respawnActorInMode(
  room: DomainModeRoomState,
  actor: AwakeningActor
): void {
  const arenaRadius = MAP_BY_ID[room.mapId].arenaRadius;
  const angle = Math.random() * Math.PI * 2;
  const rad = 7.5 + Math.random() * 6.0;
  const rawX = actor.team === 'alpha' ? -8.5 : actor.team === 'beta' ? 8.5 : Math.cos(angle) * rad;
  const rawZ = actor.team === 'alpha' || actor.team === 'beta' ? (actor.slotIndex % 2 === 0 ? -4 : 4) : Math.sin(angle) * rad;
  const safe = resolveObstacleCollisions(room.mapId, rawX, 0, rawZ, 0.55, room.obstacles);
  const clampedR = Math.hypot(safe.x, safe.z);
  const fx = clampedR > arenaRadius - 2 ? (safe.x / clampedR) * (arenaRadius - 2) : safe.x;
  const fz = clampedR > arenaRadius - 2 ? (safe.z / clampedR) * (arenaRadius - 2) : safe.z;

  actor.isKO = false;
  actor.koTime = null;
  actor.hp = actor.maxHp;
  actor.mana = Math.max(50, Math.round(actor.maxMana * 0.55));
  actor.stamina = actor.maxStamina;
  actor.stagger = 0;
  actor.isStunned = false;
  actor.stunnedTimer = 0;
  actor.stunImmunityTimer = 1.2;
  actor.iframeTimer = 1.4;
  actor.channelKind = null;
  actor.channelTimer = 0;
  actor.isOverdrive = false;
  actor.overdriveAnnounced = false;
  actor.damagePhase = 'NORMAL';
  actor.actionState = 'idle';
  actor.x = fx;
  actor.z = fz;
  actor.y = getObstacleSupportY(room.mapId, fx, 2.0, fz, 0.45, room.obstacles);
  actor.vx = 0;
  actor.yVel = 0;
  actor.vz = 0;
  actor.grounded = true;
}

function clampActorInsideBoundary(actor: AwakeningActor, cx: number, cz: number, maxR: number): void {
  const actorRadius = Math.max(0.45, actor.x * 0 + 0.52);
  const effectiveDomR = maxR + actorRadius;
  const clamped = clampPositionToDomainBarrier({
    x: actor.x,
    z: actor.z,
    centerX: cx,
    centerZ: cz,
    domainRadius: effectiveDomR,
    actorRadius,
    isInside: true,
  });
  if (clamped.clamped) {
    const dx = actor.x - cx;
    const dz = actor.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;
    actor.x = clamped.x;
    actor.z = clamped.z;
    const outVel = actor.vx * nx + actor.vz * nz;
    if (outVel > 0) {
      actor.vx -= nx * outVel;
      actor.vz -= nz * outVel;
    }
  }
}

function pushActorOutsideBoundary(actor: AwakeningActor, cx: number, cz: number, minR: number): void {
  const actorRadius = 0.52;
  const effectiveDomR = Math.max(0.5, minR - actorRadius);
  const clamped = clampPositionToDomainBarrier({
    x: actor.x,
    z: actor.z,
    centerX: cx,
    centerZ: cz,
    domainRadius: effectiveDomR,
    actorRadius,
    isInside: false,
  });
  if (clamped.clamped) {
    const dx = actor.x - cx;
    const dz = actor.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;
    actor.x = clamped.x;
    actor.z = clamped.z;
    const inVel = actor.vx * nx + actor.vz * nz;
    if (inVel < 0) {
      actor.vx -= nx * inVel;
      actor.vz -= nz * inVel;
    }
  }
}

export function enforceDomainBarrierForActor(
  room: DomainModeRoomState,
  actor: AwakeningActor
): void {
  if (actor.isKO) return;
  const actorR = 0.55;
  if (room.activeDomain) {
    const dom = room.activeDomain;
    const rt = getOrCreateActiveRuntime(dom);
    const isInside = actor.playerId === dom.ownerId || rt.trappedIdSet.has(actor.playerId);
    const res = clampPositionToDomainBarrier({
      x: actor.x,
      z: actor.z,
      centerX: dom.centerX,
      centerZ: dom.centerZ,
      domainRadius: dom.radius,
      actorRadius: actorR,
      isInside,
    });
    if (res.clamped) {
      const dx = actor.x - dom.centerX;
      const dz = actor.z - dom.centerZ;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d;
      const nz = dz / d;
      actor.x = res.x;
      actor.z = res.z;
      const radialVel = actor.vx * nx + actor.vz * nz;
      if ((isInside && radialVel > 0) || (!isInside && radialVel < 0)) {
        actor.vx -= nx * radialVel;
        actor.vz -= nz * radialVel;
      }
    }
    return;
  }

  if (room.castingDomain) {
    const cast = room.castingDomain;
    const phaseInfo = resolveDomainCastPhase(cast.elapsed, cast.fighterId);
    if (phaseInfo.barrierSealed) {
      const rt = getOrCreateCastRuntime(cast);
      const isInside = actor.playerId === cast.casterId || rt.trappedIds.has(actor.playerId);
      const res = clampPositionToDomainBarrier({
        x: actor.x,
        z: actor.z,
        centerX: cast.centerX,
        centerZ: cast.centerZ,
        domainRadius: cast.radius,
        actorRadius: actorR,
        isInside,
      });
      if (res.clamped) {
        const dx = actor.x - cast.centerX;
        const dz = actor.z - cast.centerZ;
        const d = Math.hypot(dx, dz) || 1;
        const nx = dx / d;
        const nz = dz / d;
        actor.x = res.x;
        actor.z = res.z;
        const radialVel = actor.vx * nx + actor.vz * nz;
        if ((isInside && radialVel > 0) || (!isInside && radialVel < 0)) {
          actor.vx -= nx * radialVel;
          actor.vz -= nz * radialVel;
        }
      }
    }
    return;
  }

  if (room.activeDomainClash) {
    const dc = room.activeDomainClash;
    if (actor.playerId === dc.p1Id || actor.playerId === dc.p2Id) {
      const res = clampPositionToDomainBarrier({
        x: actor.x,
        z: actor.z,
        centerX: dc.centerX,
        centerZ: dc.centerZ,
        domainRadius: dc.radius,
        actorRadius: actorR,
        isInside: true,
      });
      if (res.clamped) {
        actor.x = res.x;
        actor.z = res.z;
      }
    }
  }
}

export function enforceDomainBarriers(room: DomainModeRoomState): void {
  if (!room.activeDomain && !room.castingDomain && !room.activeDomainClash) return;
  for (const actor of room.actors) {
    enforceDomainBarrierForActor(room, actor);
  }
}

function tickKhenShadowClones(
  room: DomainModeRoomState,
  dom: DomainExpansionState,
  rt: ActiveDomainRuntime,
  owner: AwakeningActor,
  dt: number,
  helpers: AwakeningHostHelpers
): void {
  const enemies = room.actors.filter(
    (a) => a.playerId !== owner.playerId && !a.isKO && !areActorsAllied(owner, a, room.gameMode)
  );

  for (let i = 0; i < rt.khenClones.length; i++) {
    const clone = rt.khenClones[i];
    clone.attackCd = Math.max(0, clone.attackCd - dt);
    clone.skillCd = Math.max(0, clone.skillCd - dt);
    clone.dashCd = Math.max(0, clone.dashCd - dt);
    clone.crescentCd = Math.max(0, clone.crescentCd - dt);
    clone.swingTimer = Math.max(0, clone.swingTimer - dt);

    // Pick closest enemy inside domain (or nearest living enemy)
    let target: AwakeningActor | null = null;
    let bestScore = Infinity;
    for (const e of enemies) {
      const distToCenter = Math.hypot(e.x - dom.centerX, e.z - dom.centerZ);
      const distToClone = Math.hypot(e.x - clone.x, e.z - clone.z);
      const score = distToCenter <= dom.radius + 1.5 ? distToClone : distToClone + 30;
      if (score < bestScore) {
        bestScore = score;
        target = e;
      }
    }

    if (!target) {
      // Orbit around Khen gracefully
      clone.flankAngle += dt * 1.6;
      const goalX = owner.x + Math.cos(clone.flankAngle) * 3.2;
      const goalZ = owner.z + Math.sin(clone.flankAngle) * 3.2;
      const dx = goalX - clone.x;
      const dz = goalZ - clone.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.35) {
        clone.x += (dx / d) * 10.5 * dt;
        clone.z += (dz / d) * 10.5 * dt;
        clone.rotY = Math.atan2(dx, dz);
        clone.actionState = 'move';
      } else {
        clone.actionState = 'idle';
      }
      clone.y = getObstacleSupportY(room.mapId, clone.x, 1.5, clone.z, 0.4, room.obstacles);
      continue;
    }

    clone.flankAngle += dt * (i % 2 === 0 ? 1.15 : -1.15);
    const desiredOffsetAngle = Math.atan2(clone.z - target.z, clone.x - target.x) + (i - 1) * 0.45;
    const flankX = target.x + Math.cos(desiredOffsetAngle) * 1.85;
    const flankZ = target.z + Math.sin(desiredOffsetAngle) * 1.85;
    const distToEnemy = Math.hypot(target.x - clone.x, target.z - clone.z);

    // Clones randomly execute Khen's real skills (Shadow Blink, Crescent Wave, Phantom Blitz)!
    if (clone.skillCd <= 0 && distToEnemy <= dom.radius * 1.65) {
      const dx = target.x - clone.x;
      const dz = target.z - clone.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      const ux = dx / d;
      const uz = dz / d;
      const ang = Math.atan2(ux, uz);
      clone.rotY = ang;

      const skillPick = Math.floor(Math.random() * 3);
      if (skillPick === 0) {
        // Skill 1 (Slot 2): Shadow Blink — drop Void Decoy at origin, warp behind/beside target & AoE slash
        clone.skillCd = 1.85 + Math.random() * 0.65;
        clone.swingTimer = 0.34;
        clone.actionState = 'skill';
        const originX = clone.x;
        const originY = clone.y;
        const originZ = clone.z;
        room.zones.push({
          id: helpers.makeId('zone'),
          ownerId: owner.playerId,
          fighterId: 'khen',
          kind: 'voidDecoy',
          x: originX,
          y: originY,
          z: originZ,
          radius: 1.7,
          remaining: 2.0,
          maxDuration: 2.0,
          colorHex: 0xa855f7,
          tickTimer: 0,
          hitCooldowns: {},
        });
        const dest = clampPositionToDomainBarrier({
          x: target.x - ux * 1.45,
          z: target.z - uz * 1.45,
          centerX: dom.centerX,
          centerZ: dom.centerZ,
          domainRadius: dom.radius,
          actorRadius: 0.75,
          isInside: true,
        });
        clone.x = dest.x;
        clone.z = dest.z;
        clone.y = getObstacleSupportY(room.mapId, clone.x, 1.5, clone.z, 0.4, room.obstacles);
        clone.rotY = Math.atan2(target.x - clone.x, target.z - clone.z);
        helpers.pushEvent(room, {
          kind: 'shockwave',
          attackerId: owner.playerId,
          fighterId: 'khen',
          x: clone.x,
          y: clone.y + 0.9,
          z: clone.z,
          originX,
          originY: originY + 0.9,
          originZ,
          dirX: ux,
          dirZ: uz,
          colorHex: 0xa855f7,
          abilitySlot: 2,
          isComboLink: true,
        });
        for (const foe of enemies) {
          const fdx = foe.x - clone.x;
          const fdz = foe.z - clone.z;
          const fd = Math.hypot(fdx, fdz);
          if (fd <= 3.2 && Math.abs(foe.y - clone.y) <= 2.4) {
            helpers.applyHit(
              room,
              owner,
              foe,
              10,
              13,
              4.8,
              fd > 0.05 ? fdx / fd : ux,
              fd > 0.05 ? fdz / fd : uz,
              0xa855f7,
              true,
              false,
              false,
              false,
              false
            );
          }
        }
      } else if (skillPick === 1) {
        // Skill 2 (Slot 3): Crescent Wave — twin purple blades + Void Silence Trap anchor
        clone.skillCd = 1.95 + Math.random() * 0.7;
        clone.swingTimer = 0.32;
        clone.actionState = 'skill';
        for (const off of [-0.14, 0.14]) {
          const pAng = ang + off;
          room.projectiles.push({
            id: helpers.makeId('proj'),
            ownerId: owner.playerId,
            fighterId: 'khen',
            skinId: owner.skinId,
            kind: 'crescent',
            x: clone.x + Math.sin(pAng) * 0.95,
            y: clone.y + 1.05,
            z: clone.z + Math.cos(pAng) * 0.95,
            vx: Math.sin(pAng) * 23.0,
            vz: Math.cos(pAng) * 23.0,
            rotY: pAng,
            colorHex: 0xa855f7,
            originX: clone.x,
            originY: clone.y + 1.05,
            originZ: clone.z,
            maxRange: dom.radius * 1.25,
            age: 0,
            maxAge: 0.75,
            damage: 8,
            staggerDamage: 12,
            knockback: 4.5,
            hitIds: new Set(),
          });
        }
        room.zones.push({
          id: helpers.makeId('zone'),
          ownerId: owner.playerId,
          fighterId: 'khen',
          kind: 'voidAnchor',
          x: target.x,
          y: target.y,
          z: target.z,
          radius: 3.1,
          remaining: 1.9,
          maxDuration: 1.9,
          colorHex: 0xa855f7,
          tickTimer: 0,
          hitCooldowns: {},
        });
        helpers.pushEvent(room, {
          kind: 'shockwave',
          attackerId: owner.playerId,
          fighterId: 'khen',
          x: clone.x,
          y: clone.y + 0.9,
          z: clone.z,
          dirX: ux,
          dirZ: uz,
          colorHex: 0xa855f7,
          abilitySlot: 3,
          isComboLink: true,
        });
      } else {
        // Skill 3 (Slot 4): Phantom Blitz — void corridor slash dash through the enemy!
        clone.skillCd = 2.35 + Math.random() * 0.75;
        clone.swingTimer = 0.36;
        clone.actionState = 'ultimate';
        const originX = clone.x;
        const originY = clone.y;
        const originZ = clone.z;
        const midX = clone.x + ux * 4.2;
        const midZ = clone.z + uz * 4.2;

        for (const foe of enemies) {
          if (Math.abs(foe.y - clone.y) > 2.6) continue;
          const edx = foe.x - originX;
          const edz = foe.z - originZ;
          const along = edx * ux + edz * uz;
          const perp = Math.abs(edx * -uz + edz * ux);
          if (along > -0.6 && along <= 8.8 && perp <= 2.3) {
            helpers.applyHit(
              room,
              owner,
              foe,
              12,
              16,
              6.8,
              ux,
              uz,
              0xa855f7,
              true,
              false,
              false,
              false,
              false
            );
          }
        }

        const blitzDest = clampPositionToDomainBarrier({
          x: originX + ux * 6.8,
          z: originZ + uz * 6.8,
          centerX: dom.centerX,
          centerZ: dom.centerZ,
          domainRadius: dom.radius,
          actorRadius: 0.75,
          isInside: true,
        });
        clone.x = blitzDest.x;
        clone.z = blitzDest.z;
        clone.y = getObstacleSupportY(room.mapId, clone.x, 1.5, clone.z, 0.4, room.obstacles);
        helpers.pushEvent(room, {
          kind: 'shockwave',
          attackerId: owner.playerId,
          fighterId: 'khen',
          x: midX,
          y: originY + 0.15,
          z: midZ,
          originX,
          originY: originY + 1.0,
          originZ,
          dirX: ux,
          dirZ: uz,
          colorHex: 0xa855f7,
          abilitySlot: 4,
          isComboLink: true,
        });
      }
    } else if (distToEnemy <= 2.65 && clone.attackCd <= 0) {
      clone.attackCd = 0.72;
      clone.swingTimer = 0.28;
      clone.actionState = 'attack';
      const dx = target.x - clone.x;
      const dz = target.z - clone.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      clone.rotY = Math.atan2(dx, dz);
      helpers.pushEvent(room, {
        kind: 'crescentSlash',
        attackerId: owner.playerId,
        fighterId: 'khen',
        x: target.x,
        y: target.y + 1.05,
        z: target.z,
        dirX: dx / d,
        dirZ: dz / d,
        colorHex: 0xa855f7,
      });
      helpers.applyHit(
        room,
        owner,
        target,
        7,
        9,
        4.2,
        dx / d,
        dz / d,
        0xa855f7,
        false,
        false,
        false,
        false,
        false
      );
    } else if (distToEnemy > 5.0 && clone.dashCd <= 0) {
      clone.dashCd = 1.65;
      clone.actionState = 'dash';
      const dx = flankX - clone.x;
      const dz = flankZ - clone.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      clone.vx = (dx / d) * 22.0;
      clone.vz = (dz / d) * 22.0;
      clone.rotY = Math.atan2(dx, dz);
    } else {
      const dx = flankX - clone.x;
      const dz = flankZ - clone.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.25) {
        clone.vx += ((dx / d) * 14.5 - clone.vx) * Math.min(1, dt * 10);
        clone.vz += ((dz / d) * 14.5 - clone.vz) * Math.min(1, dt * 10);
        clone.rotY = Math.atan2(target.x - clone.x, target.z - clone.z);
        if (clone.swingTimer <= 0) clone.actionState = 'move';
      } else {
        clone.vx *= Math.exp(-8 * dt);
        clone.vz *= Math.exp(-8 * dt);
        if (clone.swingTimer <= 0) clone.actionState = 'idle';
      }
    }

    clone.x += clone.vx * dt;
    clone.z += clone.vz * dt;
    clone.vx *= Math.exp(-3.5 * dt);
    clone.vz *= Math.exp(-3.5 * dt);

    // Keep AI clones inside Khen's domain boundary
    const rCenter = Math.hypot(clone.x - dom.centerX, clone.z - dom.centerZ);
    if (rCenter > dom.radius - 0.8) {
      clone.x = dom.centerX + ((clone.x - dom.centerX) / rCenter) * (dom.radius - 0.8);
      clone.z = dom.centerZ + ((clone.z - dom.centerZ) / rCenter) * (dom.radius - 0.8);
    }
    clone.y = getObstacleSupportY(room.mapId, clone.x, 1.5, clone.z, 0.4, room.obstacles);
  }

  dom.khenClones = rt.khenClones.map((c) => ({
    id: c.id,
    x: Number(c.x.toFixed(2)),
    y: Number(c.y.toFixed(2)),
    z: Number(c.z.toFixed(2)),
    rotY: Number(c.rotY.toFixed(3)),
    actionState: c.actionState,
    swingTimer: Number(c.swingTimer.toFixed(2)),
  }));
}

function pushJmWebLine(
  rt: ActiveDomainRuntime,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): void {
  if (Math.hypot(x2 - x1, z2 - z1) < 0.45) return;
  rt.jmWebLines.push({
    x1: Number(x1.toFixed(2)),
    z1: Number(z1.toFixed(2)),
    x2: Number(x2.toFixed(2)),
    z2: Number(z2.toFixed(2)),
    life: 999,
    maxLife: 999,
  });
  if (rt.jmWebLines.length > 28) rt.jmWebLines.shift();
}

function tickJmMirrorTeleportDomain(
  room: DomainModeRoomState,
  dom: DomainExpansionState,
  rt: ActiveDomainRuntime,
  owner: AwakeningActor,
  dt: number,
  helpers: AwakeningHostHelpers
): void {
  // Permanent laser lines stay on the ground for the full Domain duration until touched by an enemy.
  for (const tid of Object.keys(rt.jmWebHitCooldowns)) {
    rt.jmWebHitCooldowns[tid] = Math.max(0, rt.jmWebHitCooldowns[tid] - dt);
  }
  for (const tid of Object.keys(rt.jmBodyHitCooldowns)) {
    rt.jmBodyHitCooldowns[tid] = Math.max(0, rt.jmBodyHitCooldowns[tid] - dt);
  }

  // Touch-triggered explosion: touching ANY laser line detonates ONLY that line and leaves all others intact!
  for (const target of room.actors) {
    if (target.playerId === owner.playerId || target.isKO) continue;
    if (areActorsAllied(owner, target, room.gameMode)) continue;
    if ((rt.jmWebHitCooldowns[target.playerId] ?? 0) > 0) continue;
    const distDom = Math.hypot(target.x - dom.centerX, target.z - dom.centerZ);
    if (distDom > dom.radius + 0.6) continue;
    const groundY = getMapTerrainHeight(room.mapId, target.x, target.z);
    if (target.y - groundY > 2.4) continue;

    const touch = resolveJmLaserTouch(target.x, target.z, rt.jmWebLines, 1.15);
    if (touch.hit) {
      rt.jmWebLines.splice(touch.index, 1);
      rt.jmWebHitCooldowns[target.playerId] = 0.34;
      const dx = target.x - touch.closestX;
      const dz = target.z - touch.closestZ;
      const d = Math.hypot(dx, dz);
      const dirX = d > 0.05 ? dx / d : Math.sin(target.rotY + Math.PI);
      const dirZ = d > 0.05 ? dz / d : Math.cos(target.rotY + Math.PI);
      helpers.pushEvent(room, {
        kind: 'jmLaserDetonate',
        attackerId: owner.playerId,
        targetId: target.playerId,
        fighterId: 'jm',
        x: touch.closestX,
        y: groundY + 0.55,
        z: touch.closestZ,
        dirX,
        dirZ,
        radius: 2.6,
        colorHex: 0x22d3ee,
        hitStopMs: 30,
        callout: 'LASER DETONATION!',
      });
      const hit = helpers.applyHit(
        room,
        owner,
        target,
        12,
        16,
        8.5,
        dirX,
        dirZ,
        0x22d3ee,
        true,
        false,
        false,
        false,
        false
      );
      if (hit && !target.isKO) {
        target.yVel = Math.max(target.yVel, 4.2);
        target.grounded = false;
      }
    }
  }

  // Player-controlled directional edge-to-edge hyper-speed bouncing (and continuous auto-bounce when joystick idle),
  // plus enemy body-impact knock-to-edge & opposite-edge rebound!
  const dashLockedOut =
    owner.isKO ||
    owner.actionState === 'stagger' ||
    owner.actionState === 'clash' ||
    owner.actionState === 'headlock' ||
    owner.channelKind === 'jm_kamehameha' ||
    owner.channelKind === 'jm_kamehameha_charge' ||
    owner.channelKind === 'jm_sky_peak';

  if (dashLockedOut) {
    owner.jmDashActive = false;
    rt.jmHasDashSegment = false;
  } else {
    owner.jmDashActive = true;
    const isCastingSkillOrM1 =
      owner.actionState === 'attack' ||
      owner.actionState === 'skill' ||
      owner.actionState === 'ultimate';

    const curMoveMag = Math.hypot(owner.moveX, owner.moveZ);
    const curInputX = curMoveMag > 0.15 ? owner.moveX / curMoveMag : 0;
    const curInputZ = curMoveMag > 0.15 ? owner.moveZ / curMoveMag : 0;

    // Allow responsive mid-flight redirect when player actively tilts joystick to a new direction
    if (rt.jmHasDashSegment && rt.jmDashElapsed >= 0.09 && curMoveMag > 0.25) {
      const segInputMag = Math.hypot(rt.jmSegInputX, rt.jmSegInputZ);
      const changedSteering =
        segInputMag < 0.1
          ? curInputX * rt.jmLastDirX + curInputZ * rt.jmLastDirZ < 0.45
          : curInputX * rt.jmSegInputX + curInputZ * rt.jmSegInputZ < 0.45;
      if (changedSteering) {
        pushJmWebLine(rt, rt.jmDashFromX, rt.jmDashFromZ, owner.x, owner.z);
        rt.jmHasDashSegment = false;
        rt.jmDashPauseTimer = 0;
      }
    }

    if (!rt.jmHasDashSegment) {
      rt.jmDashPauseTimer -= dt;
      if (rt.jmDashPauseTimer <= 0) {
        const clampedStart = clampPositionToDomainBarrier({
          x: owner.x,
          z: owner.z,
          centerX: dom.centerX,
          centerZ: dom.centerZ,
          domainRadius: dom.radius,
          actorRadius: 0.75,
          isInside: true,
        });
        const nextEdge = resolveNextJmBounceTarget({
          fromX: clampedStart.x,
          fromZ: clampedStart.z,
          centerX: dom.centerX,
          centerZ: dom.centerZ,
          domainRadius: dom.radius,
          moveX: owner.moveX,
          moveZ: owner.moveZ,
          lastDirX: rt.jmLastDirX,
          lastDirZ: rt.jmLastDirZ,
          fallbackYaw: owner.rotY,
        });
        const chordDist = Math.hypot(nextEdge.x - clampedStart.x, nextEdge.z - clampedStart.z);
        rt.jmDashFromX = clampedStart.x;
        rt.jmDashFromZ = clampedStart.z;
        rt.jmDashToX = nextEdge.x;
        rt.jmDashToZ = nextEdge.z;
        rt.jmLastDirX = nextEdge.dirX;
        rt.jmLastDirZ = nextEdge.dirZ;
        rt.jmSegInputX = curInputX;
        rt.jmSegInputZ = curInputZ;
        rt.jmDashElapsed = 0;
        rt.jmDashDuration = Math.max(0.16, Math.min(0.3, chordDist / 56.0));
        rt.jmHasDashSegment = true;
      }
    }

    if (rt.jmHasDashSegment) {
      const prevX = owner.x;
      const prevZ = owner.z;
      rt.jmDashElapsed += dt;
      const t = Math.min(1, rt.jmDashElapsed / Math.max(0.08, rt.jmDashDuration));
      const curX = rt.jmDashFromX + (rt.jmDashToX - rt.jmDashFromX) * t;
      const curZ = rt.jmDashFromZ + (rt.jmDashToZ - rt.jmDashFromZ) * t;
      const dx = rt.jmDashToX - rt.jmDashFromX;
      const dz = rt.jmDashToZ - rt.jmDashFromZ;
      const dirLen = Math.hypot(dx, dz) || 1;
      const dirX = dx / dirLen;
      const dirZ = dz / dirLen;

      const safeCur = resolveObstacleCollisions(room.mapId, curX, owner.y, curZ, 0.45, room.obstacles);
      owner.x = safeCur.x;
      owner.z = safeCur.z;
      owner.y = getObstacleSupportY(room.mapId, owner.x, owner.y, owner.z, 0.42, room.obstacles);
      owner.vx = dirX * 18.0;
      owner.vz = dirZ * 18.0;
      if (!isCastingSkillOrM1) {
        owner.rotY = Math.atan2(dirX, dirZ);
      }

      // Check enemy collision along JM's dash path: knock enemy to edge & rebound JM to opposite edge!
      let reboundedEnemy = false;
      for (const target of room.actors) {
        if (target.playerId === owner.playerId || target.isKO) continue;
        if (areActorsAllied(owner, target, room.gameMode)) continue;
        if ((rt.jmBodyHitCooldowns[target.playerId] ?? 0) > 0) continue;
        if (Math.abs(target.y - owner.y) > 2.6) continue;
        const seg = distancePointToSegment2D(target.x, target.z, prevX, prevZ, owner.x, owner.z);
        if (seg.dist <= 1.65) {
          rt.jmBodyHitCooldowns[target.playerId] = 0.45;
          reboundedEnemy = true;

          // Record laser line up to impact point
          pushJmWebLine(rt, rt.jmDashFromX, rt.jmDashFromZ, owner.x, owner.z);

          const hit = helpers.applyHit(
            room,
            owner,
            target,
            12,
            16,
            8.0,
            dirX,
            dirZ,
            0xfef08a,
            true,
            false,
            false,
            false,
            false
          );
          if (hit && !target.isKO) {
            const launch = computePunchLaunchToFarEdge(
              target.x,
              target.z,
              dirX,
              dirZ,
              dom.centerX,
              dom.centerZ,
              dom.radius
            );
            target.vx = launch.launchVx;
            target.vz = launch.launchVz;
            target.yVel = Math.max(target.yVel, 4.8);
            target.grounded = false;
          }

          helpers.pushEvent(room, {
            kind: 'jmMirrorTeleport',
            attackerId: owner.playerId,
            targetId: target.playerId,
            fighterId: 'jm',
            originX: rt.jmDashFromX,
            originY: owner.y + 0.65,
            originZ: rt.jmDashFromZ,
            x: owner.x,
            y: owner.y + 0.65,
            z: owner.z,
            dirX,
            dirZ,
            colorHex: 0xfef08a,
            hitStopMs: 32,
          });

          // Immediately rebound JM to the opposite edge of the domain!
          const edgeR = Math.max(2.2, dom.radius - 0.85);
          const oppDirX = -dirX;
          const oppDirZ = -dirZ;
          const oppHit = intersectLineWithCircle2D(
            owner.x,
            owner.z,
            oppDirX,
            oppDirZ,
            dom.centerX,
            dom.centerZ,
            edgeR
          );
          const oppDist = Math.hypot(oppHit.exitX - owner.x, oppHit.exitZ - owner.z);
          rt.jmDashFromX = owner.x;
          rt.jmDashFromZ = owner.z;
          rt.jmDashToX = oppHit.exitX;
          rt.jmDashToZ = oppHit.exitZ;
          rt.jmLastDirX = oppDirX;
          rt.jmLastDirZ = oppDirZ;
          // Clear segInput so player continuing to hold forward doesn't interrupt the rebound flight
          rt.jmSegInputX = 0;
          rt.jmSegInputZ = 0;
          rt.jmDashElapsed = 0;
          rt.jmDashDuration = Math.max(0.14, Math.min(0.28, oppDist / 56.0));
          rt.jmHasDashSegment = true;
          owner.empoweredM1Ready = true;
          break;
        }
      }

      if (!reboundedEnemy && t >= 1) {
        rt.jmHasDashSegment = false;
        rt.jmDashPauseTimer = 0.03;
        owner.vx = 0;
        owner.vz = 0;

        // Leave a permanent glowing golden-cyan laser line on the floor for the full Domain duration
        pushJmWebLine(rt, rt.jmDashFromX, rt.jmDashFromZ, owner.x, owner.z);

        // Empower JM's hands on edge rebound so his next skill or M1 fires an extra golden crescent wave!
        owner.empoweredM1Ready = true;

        helpers.pushEvent(room, {
          kind: 'jmMirrorTeleport',
          attackerId: owner.playerId,
          fighterId: 'jm',
          originX: rt.jmDashFromX,
          originY: owner.y + 0.65,
          originZ: rt.jmDashFromZ,
          x: owner.x,
          y: owner.y + 0.65,
          z: owner.z,
          dirX,
          dirZ,
          colorHex: 0xfef08a,
        });
      }
    }
  }

  dom.jmWebLines = rt.jmWebLines.map((l) => ({
    x1: l.x1,
    z1: l.z1,
    x2: l.x2,
    z2: l.z2,
    life: l.life,
    maxLife: l.maxLife,
  }));
}

export function tickDomainAndModes(
  room: DomainModeRoomState,
  dt: number,
  helpers: AwakeningHostHelpers
): void {
  // 0. Domain Cast Timeline (5.0s standard vs 2.5s JM/Prime)
  if (room.castingDomain) {
    const cast = room.castingDomain;
    const rt = getOrCreateCastRuntime(cast);
    const caster = room.actors.find((a) => a.playerId === cast.casterId);
    if (!caster || caster.isKO) {
      room.castingDomain = null;
    } else {
      cast.elapsed += dt;
      const phaseInfo = resolveDomainCastPhase(cast.elapsed, cast.fighterId);
      if (phaseInfo.phase === 'complete') {
        room.castingDomain = null;
        activateDomainDirect(
          room,
          caster,
          helpers,
          cast.centerX,
          cast.centerZ,
          cast.radius,
          rt.sealedCaptured ? rt.trappedIds : undefined
        );
      } else {
        cast.phase = phaseInfo.phase;
        if (phaseInfo.barrierSealed) {
          if (!rt.sealedCaptured) {
            rt.sealedCaptured = true;
            rt.trappedIds.add(caster.playerId);
            for (const other of room.actors) {
              if (other.playerId === caster.playerId || other.isKO) continue;
              if (Math.hypot(other.x - cast.centerX, other.z - cast.centerZ) <= cast.radius) {
                rt.trappedIds.add(other.playerId);
              }
            }
          }
          // Sealed barrier: caster and trapped enemies stay inside; escaped enemies stay outside
          for (const actor of room.actors) {
            if (actor.isKO) continue;
            const inside = actor.playerId === caster.playerId || rt.trappedIds.has(actor.playerId);
            if (inside) {
              clampActorInsideBoundary(actor, cast.centerX, cast.centerZ, Math.max(1.5, cast.radius - 0.55));
            } else {
              pushActorOutsideBoundary(actor, cast.centerX, cast.centerZ, cast.radius + 0.55);
            }
          }
        }
      }
    }
  }

  // 1. Damage-Based Domain Clash Arena
  if (room.activeDomainClash) {
    const dc = room.activeDomainClash;
    const p1 = room.actors.find((a) => a.playerId === dc.p1Id);
    const p2 = room.actors.find((a) => a.playerId === dc.p2Id);
    if (!p1 || !p2 || p1.isKO || p2.isKO) {
      resolveDomainClash(room, helpers);
    } else {
      // Keep duelists inside the contested clash perimeter
      const maxClashR = Math.max(4.0, dc.radius - 0.6);
      clampActorInsideBoundary(p1, dc.centerX, dc.centerZ, maxClashR);
      clampActorInsideBoundary(p2, dc.centerX, dc.centerZ, maxClashR);
      if (p1?.isBot && !p1.isDummy && Math.random() < dt * 5.0) {
        dc.p1Mashes += 1;
      }
      if (p2?.isBot && !p2.isDummy && Math.random() < dt * 5.0) {
        dc.p2Mashes += 1;
      }
      dc.remaining -= dt;
      if (dc.remaining <= 0) {
        resolveDomainClash(room, helpers);
      }
    }
  }

  // 2. Active Domain Expansion Environment Effects (Zero unavoidable sure-hit auto-damage!)
  if (room.activeDomain) {
    const dom = room.activeDomain;
    const rt = getOrCreateActiveRuntime(dom);
    const owner = room.actors.find((a) => a.playerId === dom.ownerId);
    if (!owner || owner.isKO) {
      if (owner) {
        owner.domainJackpotActive = false;
        owner.domainJackpotHits = 0;
        owner.superArmor = false;
        owner.jmDashActive = false;
        owner.primeDomainBuff = false;
        if (dom.fighterId === 'marjohn') {
          landMarjohnFlight(owner);
        }
      }
      room.activeDomain = null;
    } else {
      const cfg = DOMAIN_CONFIGS[dom.fighterId];
      dom.remaining -= dt;

      const ownerDist = Math.hypot(owner.x - dom.centerX, owner.z - dom.centerZ);
      const ownerInside = ownerDist <= dom.radius;

      // Fighter-specific continuous Domain traits
      if (dom.fighterId === 'prime' && ownerInside) {
        owner.superArmor = true;
        owner.primeDomainBuff = true;
      } else if (dom.fighterId === 'khen' && ownerInside) {
        if (owner.dashCooldown > 0) {
          owner.dashCooldown = Math.max(0, owner.dashCooldown - dt * 2.33);
        }
      } else if (dom.fighterId === 'marjohn') {
        owner.isFlying = true;
        owner.flightRemaining = Math.max(owner.flightRemaining, 1.5);
        owner.flightCooldown = 0;
        owner.grounded = false;
      } else if (dom.fighterId === 'jm' && ownerInside) {
        owner.hp = Math.min(owner.maxHp, owner.hp + 5.5 * dt);
        owner.mana = Math.min(owner.maxMana, owner.mana + 8.5 * dt);
        owner.damagePhase = getDamagePhase(owner.hp, owner.maxHp, owner.isKO);
      } else if (dom.fighterId === 'damen' && owner.domainJackpotActive) {
        owner.mana = owner.maxMana;
      }

      // Enemy slows / typhoon inward pull inside Domain
      for (const target of room.actors) {
        if (target.playerId === owner.playerId || target.isKO) continue;
        if (areActorsAllied(owner, target, room.gameMode)) continue;
        const dx = dom.centerX - target.x;
        const dz = dom.centerZ - target.z;
        const d = Math.hypot(dx, dz);
        if (d <= dom.radius) {
          if (dom.fighterId === 'khen') {
            target.slowTimer = Math.max(target.slowTimer, 0.35);
          } else if (dom.fighterId === 'marjohn' && d > 1.2) {
            target.vx += (dx / d) * 6.2 * dt;
            target.vz += (dz / d) * 6.2 * dt;
          }
        }
      }

      // Specialized Domain Reworks (dodgeable / skill-expressive, zero auto sure-hit!)
      if (dom.fighterId === 'khen') {
        tickKhenShadowClones(room, dom, rt, owner, dt, helpers);
      } else if (dom.fighterId === 'jm') {
        tickJmMirrorTeleportDomain(room, dom, rt, owner, dt, helpers);
      } else if (dom.fighterId === 'marjohn') {
        // Dodgeable swirling Domain Tornadoes
        rt.marjohnTornadoTimer -= dt;
        if (rt.marjohnTornadoTimer <= 0) {
          rt.marjohnTornadoTimer = 1.25;
          const target = helpers.findNearestTarget(room, owner, dom.radius + 4);
          const spawnAng = Math.random() * Math.PI * 2;
          const sx = dom.centerX + Math.cos(spawnAng) * (dom.radius * 0.78);
          const sz = dom.centerZ + Math.sin(spawnAng) * (dom.radius * 0.78);
          const sy = getMapTerrainHeight(room.mapId, sx, sz) + 0.9;
          const aimX = target ? target.x : dom.centerX;
          const aimZ = target ? target.z : dom.centerZ;
          const aimAng = Math.atan2(aimX - sx, aimZ - sz);
          room.projectiles.push({
            id: helpers.makeId('proj'),
            ownerId: owner.playerId,
            fighterId: 'marjohn',
            skinId: owner.skinId,
            kind: 'tornado',
            x: sx,
            y: sy,
            z: sz,
            vx: Math.sin(aimAng) * 14.5,
            vz: Math.cos(aimAng) * 14.5,
            rotY: aimAng,
            colorHex: 0x22d3ee,
            originX: sx,
            originY: sy,
            originZ: sz,
            isOverdrive: false,
            isHoming: true,
            age: 0,
            maxAge: 2.3,
            maxRange: dom.radius * 1.7,
            damage: 9,
            staggerDamage: 12,
            knockback: 4.5,
            hitIds: new Set(),
          });
        }
      } else if (dom.fighterId === 'prime') {
        // 1. Rapid-Snap Magma Geysers (0.45s crisp telegraph -> soaring molten rock eruption)
        rt.primeTremorTimer -= dt;
        if (rt.primeTremorTimer <= 0) {
          rt.primeTremorTimer = PRIME_DOMAIN_CONFIG.geyserIntervalSec;
          const enemies = room.actors.filter(
            (a) =>
              a.playerId !== owner.playerId &&
              !a.isKO &&
              !areActorsAllied(owner, a, room.gameMode) &&
              Math.hypot(a.x - dom.centerX, a.z - dom.centerZ) <= dom.radius
          );
          const pick = enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)] : null;
          const randAng = Math.random() * Math.PI * 2;
          const randRad = Math.random() * Math.max(2.0, dom.radius - 2.2);
          const tx = pick
            ? pick.x + (Math.random() - 0.5) * 2.2
            : dom.centerX + Math.cos(randAng) * randRad;
          const tz = pick
            ? pick.z + (Math.random() - 0.5) * 2.2
            : dom.centerZ + Math.sin(randAng) * randRad;
          const clamped = clampPositionToDomainBarrier({
            x: tx,
            z: tz,
            centerX: dom.centerX,
            centerZ: dom.centerZ,
            domainRadius: dom.radius,
            actorRadius: 1.5,
            isInside: true,
          });
          const ty = getMapTerrainHeight(room.mapId, clamped.x, clamped.z);
          rt.primeTremors.push({
            x: clamped.x,
            z: clamped.z,
            radius: PRIME_DOMAIN_CONFIG.geyserRadius,
            elapsed: 0,
            windup: PRIME_DOMAIN_CONFIG.geyserWindupSec,
          });
          helpers.spawnTelegraph(
            room,
            owner,
            'circle',
            clamped.x,
            ty,
            clamped.z,
            0,
            1,
            PRIME_DOMAIN_CONFIG.geyserRadius,
            0,
            0,
            PRIME_DOMAIN_CONFIG.geyserWindupSec,
            0xf97316
          );
        }
        for (let i = rt.primeTremors.length - 1; i >= 0; i--) {
          const tr = rt.primeTremors[i];
          tr.elapsed += dt;
          if (tr.elapsed >= tr.windup) {
            rt.primeTremors.splice(i, 1);
            const ty = getMapTerrainHeight(room.mapId, tr.x, tr.z);
            helpers.pushEvent(room, {
              kind: 'craterSlam',
              attackerId: owner.playerId,
              fighterId: 'prime',
              x: tr.x,
              y: ty + 0.25,
              z: tr.z,
              radius: tr.radius,
              colorHex: 0xf97316,
              callout: 'MAGMA GEYSER!',
            });
            for (const target of room.actors) {
              if (target.playerId === owner.playerId || target.isKO) continue;
              if (areActorsAllied(owner, target, room.gameMode)) continue;
              const d = Math.hypot(target.x - tr.x, target.z - tr.z);
              if (d <= tr.radius && target.y - ty <= 2.6) {
                const dirX = d > 0.05 ? (target.x - tr.x) / d : 0;
                const dirZ = d > 0.05 ? (target.z - tr.z) / d : 1;
                const hit = helpers.applyHit(room, owner, target, 13, 20, 6.5, dirX, dirZ, 0xf97316, true, false, false, false, false);
                if (hit) {
                  target.yVel = Math.max(target.yVel, 8.2);
                  target.grounded = false;
                }
              }
            }
          }
        }

        // 2. Sky-Falling Giant Meteor Fists raining onto telegraphed impact circles
        rt.primeMeteorTimer -= dt;
        if (rt.primeMeteorTimer <= 0) {
          rt.primeMeteorTimer = PRIME_DOMAIN_CONFIG.meteorIntervalSec;
          const target = helpers.findNearestTarget(room, owner, dom.radius);
          const ang = Math.random() * Math.PI * 2;
          const rawX = target && Math.hypot(target.x - dom.centerX, target.z - dom.centerZ) <= dom.radius
            ? target.x + target.vx * 0.28 + (Math.random() - 0.5) * 1.8
            : dom.centerX + Math.cos(ang) * (dom.radius * 0.45);
          const rawZ = target && Math.hypot(target.x - dom.centerX, target.z - dom.centerZ) <= dom.radius
            ? target.z + target.vz * 0.28 + (Math.random() - 0.5) * 1.8
            : dom.centerZ + Math.sin(ang) * (dom.radius * 0.45);
          const clamped = clampPositionToDomainBarrier({
            x: rawX,
            z: rawZ,
            centerX: dom.centerX,
            centerZ: dom.centerZ,
            domainRadius: dom.radius,
            actorRadius: 1.6,
            isInside: true,
          });
          const ty = getMapTerrainHeight(room.mapId, clamped.x, clamped.z);
          rt.primeMeteors.push({
            x: clamped.x,
            z: clamped.z,
            radius: PRIME_DOMAIN_CONFIG.meteorRadius,
            elapsed: 0,
            windup: PRIME_DOMAIN_CONFIG.meteorWindupSec,
          });
          helpers.spawnTelegraph(
            room,
            owner,
            'circle',
            clamped.x,
            ty,
            clamped.z,
            0,
            1,
            PRIME_DOMAIN_CONFIG.meteorRadius,
            0,
            0,
            PRIME_DOMAIN_CONFIG.meteorWindupSec,
            0xf43f5e
          );
          helpers.pushEvent(room, {
            kind: 'meteorFist',
            attackerId: owner.playerId,
            fighterId: 'prime',
            x: clamped.x,
            y: ty,
            z: clamped.z,
            radius: PRIME_DOMAIN_CONFIG.meteorRadius,
            colorHex: 0xf43f5e,
          });
        }
        for (let i = rt.primeMeteors.length - 1; i >= 0; i--) {
          const met = rt.primeMeteors[i];
          met.elapsed += dt;
          if (met.elapsed >= met.windup) {
            rt.primeMeteors.splice(i, 1);
            const ty = getMapTerrainHeight(room.mapId, met.x, met.z);
            helpers.pushEvent(room, {
              kind: 'craterSlam',
              attackerId: owner.playerId,
              fighterId: 'prime',
              x: met.x,
              y: ty + 0.3,
              z: met.z,
              radius: met.radius,
              colorHex: 0xf43f5e,
              hitStopMs: 25,
              callout: 'METEOR FIST!',
            });
            for (const target of room.actors) {
              if (target.playerId === owner.playerId || target.isKO) continue;
              if (areActorsAllied(owner, target, room.gameMode)) continue;
              const d = Math.hypot(target.x - met.x, target.z - met.z);
              if (d <= met.radius && target.y - ty <= 3.0) {
                const dirX = d > 0.05 ? (target.x - met.x) / d : 0;
                const dirZ = d > 0.05 ? (target.z - met.z) / d : 1;
                const hit = helpers.applyHit(room, owner, target, 15, 22, 8.0, dirX, dirZ, 0xf43f5e, true, false, false, true, false);
                if (hit) {
                  target.yVel = Math.max(target.yVel, 6.8);
                  target.grounded = false;
                }
              }
            }
          }
        }
      } else if (dom.fighterId === 'damen' && owner.domainJackpotActive) {
        // Dodgeable physical Jackpot bullets (no unavoidable auto-hit)
        dom.sureHitTimer -= dt;
        if (dom.sureHitTimer <= 0) {
          dom.sureHitTimer = 0.55;
          for (const target of room.actors) {
            if (target.playerId === owner.playerId || target.isKO) continue;
            if (areActorsAllied(owner, target, room.gameMode)) continue;
            if (Math.hypot(target.x - dom.centerX, target.z - dom.centerZ) > dom.radius) continue;
            const ang = Math.atan2(target.x - owner.x, target.z - owner.z);
            room.projectiles.push({
              id: helpers.makeId('proj'),
              ownerId: owner.playerId,
              fighterId: 'damen',
              skinId: owner.skinId,
              kind: 'magnum',
              x: owner.x + Math.sin(ang) * 1.1,
              y: owner.y + 1.45,
              z: owner.z + Math.cos(ang) * 1.1,
              vx: Math.sin(ang) * 28.0,
              vz: Math.cos(ang) * 28.0,
              rotY: ang,
              colorHex: 0xfacc15,
              originX: owner.x,
              originY: owner.y + 1.45,
              originZ: owner.z,
              isOverdrive: true,
              isHoming: false,
              pierceObstacles: true,
              bouncesRemaining: 2,
              age: 0,
              maxAge: 1.4,
              maxRange: dom.radius * 2.2,
              damage: 5,
              staggerDamage: 6,
              knockback: 2.2,
              hitIds: new Set(),
            });
          }
        }
      }

      // Enforce strict active domain barrier lock after all domain tick movements
      enforceDomainBarriers(room);

      if (dom.remaining <= 0) {
        room.activeDomain = null;
        owner.domainJackpotActive = false;
        owner.domainJackpotHits = 0;
        owner.superArmor = false;
        owner.jmDashActive = false;
        owner.primeDomainBuff = false;
        if (dom.fighterId === 'marjohn') {
          landMarjohnFlight(owner);
        }
        helpers.pushEvent(room, {
          kind: 'domainEnd',
          attackerId: owner.playerId,
          fighterId: dom.fighterId,
          x: dom.centerX,
          y: 1.0,
          z: dom.centerZ,
          colorHex: cfg.primaryHex,
          callout: `${dom.domainName.toUpperCase()} FADED`,
        });
      }
    }
  }

  // 3. Game Mode Specific Tick Rules (KOTH, Squad Clash, Raid Boss, Sudden Death)
  if (room.gameMode === 'koth') {
    room.modeTimer = Math.max(0, room.modeTimer - dt);
    if (!room.kothZone) {
      room.kothZone = createInitialKothZone();
    }
    const kz = room.kothZone;
    kz.shiftRemaining -= dt;
    if (kz.shiftRemaining <= 0) {
      const nextSpot = KOTH_SPOTS[Math.floor(Math.random() * KOTH_SPOTS.length)];
      kz.x = nextSpot.x;
      kz.z = nextSpot.z;
      kz.shiftRemaining = 30.0;
      helpers.pushEvent(room, {
        kind: 'kothCapture',
        x: kz.x,
        y: 1.2,
        z: kz.z,
        radius: kz.radius,
        colorHex: 0xfacc15,
        callout: 'HILL SHIFTED! CAPTURE THE NEW ZONE!',
      });
    }

    const insideActors: AwakeningActor[] = [];
    for (const actor of room.actors) {
      if (actor.isDummy) continue;
      if (actor.isKO) {
        if (actor.koTime !== null && room.matchTime - actor.koTime >= 2.5) {
          respawnActorInMode(room, actor);
        }
        continue;
      }
      if (Math.hypot(actor.x - kz.x, actor.z - kz.z) <= kz.radius) {
        insideActors.push(actor);
        kz.scores[actor.playerId] = Number(((kz.scores[actor.playerId] ?? 0) + dt * 2.0).toFixed(2));
        actor.mana = Math.min(actor.maxMana, actor.mana + 5.0 * dt);
        actor.domainGauge = addDomainCharge(actor.domainGauge ?? 0, 3.2 * dt);
      }
    }
    kz.contested = insideActors.length > 1;
    if (insideActors.length === 1) {
      kz.controllerId = insideActors[0].playerId;
      kz.controllerName = insideActors[0].name;
      kz.controllerTeam = insideActors[0].team ?? null;
    } else {
      kz.controllerId = null;
      kz.controllerName = null;
      kz.controllerTeam = null;
    }

    if (room.modeTimer <= 0) {
      let bestId: string | null = null;
      let bestScore = -1;
      for (const actor of room.actors) {
        if (actor.isDummy) continue;
        const sc = kz.scores[actor.playerId] ?? 0;
        if (sc > bestScore) {
          bestScore = sc;
          bestId = actor.playerId;
        }
      }
      room.phase = 'victory';
      room.winnerId = bestId ?? room.actors[0]?.playerId ?? null;
      room.roundWinnerId = room.winnerId;
    }
  } else if (room.gameMode === 'squad_clash') {
    for (const actor of room.actors) {
      if (actor.isDummy) continue;
      if (actor.isKO && actor.koTime !== null && room.matchTime - actor.koTime >= 2.3) {
        respawnActorInMode(room, actor);
      }
    }
    if (room.teamScores.alpha >= 10 || room.teamScores.beta >= 10) {
      const winTeam = room.teamScores.alpha >= 10 ? 'alpha' : 'beta';
      const captain = room.actors.find((a) => a.team === winTeam) ?? room.actors[0];
      room.phase = 'victory';
      room.winnerId = captain?.playerId ?? null;
      room.roundWinnerId = room.winnerId;
    }
  } else if (room.gameMode === 'raid_boss') {
    const boss = room.actors.find((a) => a.playerId === room.raidBossId || a.isRaidBoss);
    const raidersAlive = room.actors.filter((a) => !a.isDummy && !a.isRaidBoss && !a.isKO);
    if (boss && boss.isKO) {
      const mvp = room.actors
        .filter((a) => !a.isDummy && !a.isRaidBoss)
        .sort((a, b) => b.damageDealt - a.damageDealt)[0];
      room.phase = 'victory';
      room.winnerId = mvp?.playerId ?? null;
      room.roundWinnerId = room.winnerId;
    } else if (boss && raidersAlive.length === 0) {
      room.phase = 'victory';
      room.winnerId = boss.playerId;
      room.roundWinnerId = boss.playerId;
    }
  }
}

export function getModeAbilityCooldownFactor(room: DomainModeRoomState, actor: AwakeningActor): number {
  let factor = 1.0;
  if (room.gameMode === 'sudden_death') factor *= 0.5;
  if (actor.isRaidBoss) factor *= 0.8;
  return factor;
}

export function getDomainChargeMultiplier(room: DomainModeRoomState, actor: AwakeningActor): number {
  let mult = 1.0;
  if (actor.isRaidBoss) mult *= 1.65;
  if (
    room.gameMode === 'koth' &&
    room.kothZone &&
    Math.hypot(actor.x - room.kothZone.x, actor.z - room.kothZone.z) <= room.kothZone.radius
  ) {
    mult *= 2.0;
  }
  return mult;
}
