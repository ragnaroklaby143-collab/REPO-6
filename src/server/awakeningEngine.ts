import { AWAKENING_CONFIG, getAwakenedAbility } from '../shared/awakeningConfig.ts';
import type {
  AbilitySlot,
  ArenaActorState,
  ArenaPickup,
  ArenaZoneKind,
  ArenaZoneState,
  AwakeningBannerState,
  AwakeningCutsceneState,
  AwakeningDebugAction,
  AwakeningOrbState,
  ChannelKind,
  ClashState,
  CombatEvent,
  FighterId,
  GameModeId,
  HeadlockState,
  KoCause,
  MapId,
  MatchAwakeningPhase,
  ObstacleState,
  ProjectileState,
  RoomState,
  ServerMessage,
  TelegraphKind,
  TelegraphState,
} from '../shared/gameData.ts';
import {
  FIGHTER_BY_ID,
  MAP_BY_ID,
  findObstacleAtPoint,
  getDamagePhase,
  getMapTerrainHeight,
  getObstacleSupportY,
  resolveObstacleCollisions,
} from '../shared/gameData.ts';
import {
  canApplyStun,
  findBestEnemyClusterTarget,
  isPointInBeamCorridor,
  isPointInFanCone,
  resolveCappedStunDuration,
} from '../game/combatMath.ts';
import type { ClashTugState } from '../game/awakeningLogic.ts';
import {
  applyAwakeningSurge,
  createClashTugState,
  findFarthestValidOrbPair,
  registerClashMash,
  selectTacticalOrbPair,
  shouldSpawnAwakeningOrbs,
  stepClashTugOfWar,
} from '../game/awakeningLogic.ts';
import {
  addDomainCharge,
  areActorsAllied,
  clampPositionToDomainBarrier,
} from '../game/domainLogic.ts';
import {
  resolveJmAwakenedSlot6Variant,
  resolveSkyAutoComboOutcome,
} from '../game/jmComboLogic.ts';

export interface AwakeningActor extends ArenaActorState {
  moveX: number;
  moveZ: number;
  aimYaw: number;
  aimPitch: number;
  isFlying: boolean;
  flightRemaining: number;
  flightMax: number;
  flightCooldown: number;
  speedBoostTimer: number;
  superArmor: boolean;
  dashCooldown: number;
  dashMaxCooldown: number;
  targetId: string | null;
  windupTriggered: boolean;
  landedCurrentAction: boolean;
  pendingHoldHeavy: boolean;
  pendingComboLink: boolean;
  lastM1At: number;
  lastHitAt: number;
  lastDamagedAt: number;
  lastAbilitySlot: AbilitySlot | null;
  lastAbilityAt: number;
  iframeTimer: number;
  parryStartedAt: number;
  prevBlockHeld: boolean;
  clashCooldown: number;
  frenzyInside: boolean;
  overdriveAnnounced: boolean;
  lastOriginX: number;
  lastOriginY: number;
  lastOriginZ: number;
  lastCastSlot: AbilitySlot | null;
  pendingAimX: number | null;
  pendingAimZ: number | null;
  pendingHoldVariant: boolean;
  stage2Slot: AbilitySlot | null;
  stage2Timer: number;
  stage2Label: string;
  stage2PendingCooldown: number;
  rushFatigue: number;
  rushFatigueDecayTimer: number;
  empoweredM1Ready: boolean;
  perfectEvadeTimer: number;
  evadeRewardedThisDash: boolean;
  dashEruptedThisDash: boolean;
  dashRechargeTimer: number;
  activeTelegraphId: string | null;
  awakened: boolean;
  awakeningTransformTimer: number;
  silencedTimer: number;
  snareMarkedTimer: number;
  slowTimer: number;
  typhoonFlankTimer?: number;
  channelKind: ChannelKind | null;
  channelTimer: number;
  channelDuration: number;
  channelTickTimer: number;
  channelStep: number;
  channelTargetX: number;
  channelTargetZ: number;
  stunnedTimer: number;
  skyComboPrompt?: boolean;
  skyComboStep?: number;
  skyComboMashes?: number;
  skyComboTargetId?: string | null;
}

export interface AwakeningRoomState {
  roomCode: string;
  phase: RoomState['phase'];
  mapId: MapId;
  isSoloPractice: boolean;
  isTrainingMode: boolean;
  matchTime: number;
  actors: AwakeningActor[];
  initialActorCount: number;
  obstacles: ObstacleState[];
  zones: Array<ArenaZoneState & { tickTimer: number; hitCooldowns: Record<string, number> }>;
  projectiles: Array<
    ProjectileState & {
      age: number;
      maxAge: number;
      maxRange?: number;
      damage: number;
      staggerDamage: number;
      knockback: number;
      hitIds: Set<string>;
      volleyHitCounts?: Map<string, number>;
      volleyMaxHits?: number;
      visualOnly?: boolean;
      pierceObstacles?: boolean;
      isVortex?: boolean;
      isHoming?: boolean;
      bouncesRemaining?: number;
    }
  >;
  telegraphs: Array<TelegraphState & { elapsed: number; windup: number }>;
  activeClash: ClashState | null;
  activeHeadlock: HeadlockState | null;
  pickups: ArenaPickup[];
  stormActive: boolean;
  stormRadius: number;
  stormMaxRadius?: number;
  stormCenterX?: number;
  stormCenterZ?: number;
  stormTickTimer?: number;
  awakeningPhase: MatchAwakeningPhase;
  awakeningCountdown?: number | null;
  awakeningOrbs: AwakeningOrbState[];
  awakeningBanner: AwakeningBannerState | null;
  awakeningCutscene: (AwakeningCutsceneState & {
    tug: ClashTugState;
    botMashTimer: number;
    hasSyncedAudio: boolean;
    lastAudioSyncAt: number;
  }) | null;
  awakeningDelayedHits: Array<{
    remaining: number;
    run: () => void;
  }>;
  castingDomain?: {
    casterId: string;
    centerX: number;
    centerZ: number;
    radius: number;
    phase: string;
    trappedIds?: string[];
  } | null;
  activeDomain?: {
    ownerId: string;
    fighterId: FighterId;
    centerX?: number;
    centerZ?: number;
    radius?: number;
    trappedIds?: string[];
  } | null;
  activeDomainClash?: {
    p1Id: string;
    p2Id: string;
    centerX: number;
    centerZ: number;
    radius: number;
  } | null;
  gameMode?: GameModeId;
}

function clampActorToDomainBarrier(room: AwakeningRoomState, actor: AwakeningActor, actorRadius = 0.48): void {
  if (room.activeDomainClash) {
    const dc = room.activeDomainClash;
    const isInside = actor.playerId === dc.p1Id || actor.playerId === dc.p2Id;
    const clamped = clampPositionToDomainBarrier({
      x: actor.x,
      z: actor.z,
      centerX: dc.centerX,
      centerZ: dc.centerZ,
      domainRadius: dc.radius,
      actorRadius,
      isInside,
    });
    actor.x = clamped.x;
    actor.z = clamped.z;
  }
  if (room.activeDomain) {
    const dom = room.activeDomain;
    const cx = dom.centerX;
    const cz = dom.centerZ;
    const dr = dom.radius;
    if (typeof cx === 'number' && typeof cz === 'number' && typeof dr === 'number') {
      const trapped = dom.trappedIds ?? [dom.ownerId];
      const isInside = actor.playerId === dom.ownerId || trapped.includes(actor.playerId);
      const clamped = clampPositionToDomainBarrier({
        x: actor.x,
        z: actor.z,
        centerX: cx,
        centerZ: cz,
        domainRadius: dr,
        actorRadius,
        isInside,
      });
      actor.x = clamped.x;
      actor.z = clamped.z;
    }
  }
  if (room.castingDomain && room.castingDomain.phase !== 'escape_window') {
    const cast = room.castingDomain;
    const trapped = cast.trappedIds ?? [cast.casterId];
    const isInside = actor.playerId === cast.casterId || trapped.includes(actor.playerId);
    const clamped = clampPositionToDomainBarrier({
      x: actor.x,
      z: actor.z,
      centerX: cast.centerX,
      centerZ: cast.centerZ,
      domainRadius: cast.radius,
      actorRadius,
      isInside,
    });
    actor.x = clamped.x;
    actor.z = clamped.z;
  }
}

export interface AwakeningHostHelpers {
  makeId: (prefix: string) => string;
  pushEvent: (room: AwakeningRoomState, ev: Omit<CombatEvent, 'id' | 't'>) => void;
  spawnZone: (
    room: AwakeningRoomState,
    owner: AwakeningActor,
    kind: ArenaZoneKind,
    x: number,
    y: number,
    z: number,
    radius: number,
    duration: number,
    colorHex: number,
    endX?: number,
    endZ?: number
  ) => ArenaZoneState;
  spawnTelegraph: (
    room: AwakeningRoomState,
    actor: AwakeningActor,
    kind: TelegraphKind,
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    radius: number,
    length: number,
    angleHalf: number,
    windup: number,
    colorHex: number
  ) => void;
  clearActorTelegraph: (room: AwakeningRoomState, actor: AwakeningActor) => void;
  findNearestTarget: (room: AwakeningRoomState, actor: AwakeningActor, maxRange: number) => AwakeningActor | null;
  findPreferredTarget: (room: AwakeningRoomState, actor: AwakeningActor, maxRange: number) => AwakeningActor | null;
  clampAimPoint: (
    room: AwakeningRoomState,
    actor: AwakeningActor,
    rawX: number,
    rawZ: number,
    maxRange: number
  ) => { x: number; z: number };
  computeDynamicDamage: (
    actor: AwakeningActor,
    target: AwakeningActor,
    baseDamage: number,
    slot: AbilitySlot
  ) => { dmg: number; isBackstab: boolean; isCrit: boolean; staggerBonus: number };
  applyHit: (
    room: AwakeningRoomState,
    attacker: AwakeningActor,
    target: AwakeningActor,
    damage: number,
    staggerDamage: number,
    knockback: number,
    dirX: number,
    dirZ: number,
    colorHex: number,
    isHeavy: boolean,
    isPull?: boolean,
    isUltimate?: boolean,
    isCrit?: boolean,
    isBackstab?: boolean
  ) => boolean;
  damageObstacle: (
    room: AwakeningRoomState,
    obs: ObstacleState,
    dmg: number,
    hitX: number,
    hitY: number,
    hitZ: number,
    colorHex: number
  ) => void;
  damageObstaclesInArea: (
    room: AwakeningRoomState,
    x: number,
    z: number,
    radius: number,
    dmg: number,
    colorHex: number
  ) => void;
  eliminateActor: (
    room: AwakeningRoomState,
    attacker: AwakeningActor | null,
    target: AwakeningActor,
    cause: KoCause
  ) => void;
  spawnPrimeVolcanoTurret?: (
    room: AwakeningRoomState,
    actor: AwakeningActor,
    x: number,
    z: number
  ) => void;
  broadcastPacket?: (room: AwakeningRoomState, msg: ServerMessage) => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeAng(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function landMarjohnFlight(actor: AwakeningActor): void {
  if (actor.fighterId !== 'marjohn') return;
  actor.isFlying = false;
  actor.flightRemaining = 0;
  actor.typhoonFlankTimer = 0;
  actor.grounded = false;
  actor.yVel = Math.min(actor.yVel, 0);
}

export function applyDirectStun(
  target: AwakeningActor,
  durationSec: number,
  isHeavyUltimate = false
): void {
  if (target.isKO || target.actionState === 'clash') return;
  if (!canApplyStun(target.stunImmunityTimer)) return;
  const capped = resolveCappedStunDuration(durationSec, isHeavyUltimate);
  target.isStunned = true;
  target.stunnedTimer = Math.max(target.stunnedTimer, capped);
  target.actionState = 'stagger';
  target.actionTimer = Math.max(target.actionTimer, capped);
  target.actionDuration = Math.max(target.actionDuration, capped);
  target.shieldActive = false;
  target.parryWindow = false;
  target.blockHeld = false;
  target.superArmor = false;
}

export function resetRoomAwakeningState(room: AwakeningRoomState): void {
  room.awakeningPhase = 'PRE_AWAKENING';
  room.awakeningCountdown = null;
  room.awakeningOrbs = [];
  room.awakeningBanner = null;
  room.awakeningCutscene = null;
  room.awakeningDelayedHits = [];
}

export function spawnAwakeningOrbs(
  room: AwakeningRoomState,
  helpers: AwakeningHostHelpers,
  force = false
): void {
  if (!force && room.awakeningPhase !== 'PRE_AWAKENING') return;
  const arenaRadius = MAP_BY_ID[room.mapId].arenaRadius;
  const [ptA, ptB] = selectTacticalOrbPair(
    room.mapId,
    room.obstacles,
    arenaRadius,
    Math.round(room.matchTime * 17 + room.actors.length * 7)
  );

  room.awakeningPhase = 'ORBS_ACTIVE';
  room.awakeningCountdown = null;
  // Remove the storm as soon as Awakening Orbs spawn
  room.stormActive = false;
  room.stormRadius = arenaRadius;
  const orbLife = AWAKENING_CONFIG.ORB_LIFESPAN_SEC;
  room.awakeningOrbs = [
    { id: helpers.makeId('aorb'), x: ptA.x, y: ptA.y, z: ptA.z, active: true, fadeTimer: 0, remaining: orbLife, maxDuration: orbLife },
    { id: helpers.makeId('aorb'), x: ptB.x, y: ptB.y, z: ptB.z, active: true, fadeTimer: 0, remaining: orbLife, maxDuration: orbLife },
  ];
  room.awakeningBanner = {
    id: helpers.makeId('aban'),
    text: 'AWAKENING ORBS HAVE APPEARED',
    subtext: `Claim a crystal within ${orbLife}s to unlock your Awakened Form!`,
    colorHex: 0x38bdf8,
    remaining: AWAKENING_CONFIG.BANNER_DURATION_SEC,
  };
  helpers.pushEvent(room, {
    kind: 'awakeningOrbsSpawn',
    x: 0,
    y: 1.5,
    z: 0,
    colorHex: 0x38bdf8,
    callout: 'AWAKENING ORBS HAVE APPEARED',
  });
}

export function awakenActorImmediate(
  room: AwakeningRoomState,
  actor: AwakeningActor,
  helpers: AwakeningHostHelpers,
  showBanner = true
): void {
  if (actor.awakened || actor.isKO) return;
  applyAwakeningSurge(actor);
  if (actor.fighterId === 'marjohn') {
    actor.flightMax = AWAKENING_CONFIG.MARJOHN_FLIGHT_MAX_SEC;
    actor.flightRemaining = actor.flightMax;
    actor.flightCooldown = 0;
  }
  actor.awakeningTransformTimer = AWAKENING_CONFIG.FIRST_TRANSFORM_LOCK_SEC;
  actor.iframeTimer = Math.max(actor.iframeTimer, AWAKENING_CONFIG.FIRST_TRANSFORM_LOCK_SEC);
  actor.silencedTimer = 0;

  const kit = AWAKENING_CONFIG.AWAKENED_KITS[actor.fighterId];
  if (showBanner) {
    room.awakeningBanner = {
      id: helpers.makeId('aban'),
      text: `${actor.name.toUpperCase()} HAS AWAKENED`,
      subtext: kit.awakenedTitle,
      colorHex: kit.auraPrimaryHex,
      remaining: AWAKENING_CONFIG.BANNER_DURATION_SEC,
    };
  }
  helpers.pushEvent(room, {
    kind: 'awakeningTransform',
    attackerId: actor.playerId,
    fighterId: actor.fighterId,
    x: actor.x,
    y: actor.y + 1.1,
    z: actor.z,
    colorHex: kit.auraPrimaryHex,
    hitStopMs: 65,
    callout: `${actor.name.toUpperCase()} HAS AWAKENED!`,
  });
}

export function beginAwakeningCutscene(
  room: AwakeningRoomState,
  p1: AwakeningActor,
  p2: AwakeningActor,
  helpers: AwakeningHostHelpers
): void {
  if (room.awakeningPhase === 'CUTSCENE') return;

  // Apply Awakening surge cleanly to both if either wasn't awakened yet
  if (!p1.awakened) applyAwakeningSurge(p1);
  if (!p2.awakened) applyAwakeningSurge(p2);
  for (const act of [p1, p2]) {
    if (act.fighterId === 'marjohn' && act.flightMax <= 0) {
      act.flightMax = AWAKENING_CONFIG.MARJOHN_FLIGHT_MAX_SEC;
      act.flightRemaining = act.flightMax;
      act.flightCooldown = 0;
    }
  }

  // Consume any remaining crystals
  for (const orb of room.awakeningOrbs) {
    orb.active = false;
    orb.fadeTimer = 0;
  }

  // Clear in-progress clashes/headlocks/telegraphs/projectiles cleanly
  room.activeClash = null;
  room.activeHeadlock = null;
  room.telegraphs = [];
  room.projectiles = [];
  room.awakeningDelayedHits = [];
  room.awakeningPhase = 'CUTSCENE';

  // Ensure storm is cleared for the awakening cutscene & duel
  room.stormActive = false;
  room.stormRadius = MAP_BY_ID[room.mapId].arenaRadius;

  // Position fighters at opposite ends of open center lane facing each other
  const startDist = AWAKENING_CONFIG.WALK_START_HALF_DISTANCE;
  p1.x = -startDist;
  p1.z = 0;
  p1.y = getObstacleSupportY(room.mapId, p1.x, 0, p1.z, 0.45, room.obstacles);
  p1.vx = 0;
  p1.yVel = 0;
  p1.vz = 0;
  p1.grounded = true;
  p1.isFlying = false;
  p1.rotY = Math.PI * 0.5;

  p2.x = startDist;
  p2.z = 0;
  p2.y = getObstacleSupportY(room.mapId, p2.x, 0, p2.z, 0.45, room.obstacles);
  p2.vx = 0;
  p2.yVel = 0;
  p2.vz = 0;
  p2.grounded = true;
  p2.isFlying = false;
  p2.rotY = -Math.PI * 0.5;

  for (const act of [p1, p2]) {
    act.actionState = 'move';
    act.actionTimer = 0;
    act.actionDuration = 0;
    act.abilitySlot = null;
    act.shieldActive = false;
    act.parryWindow = false;
    act.blockHeld = false;
    act.superArmor = false;
    act.silencedTimer = 0;
    act.channelKind = null;
    act.channelTimer = 0;
    act.channelDuration = 0;
    act.channelTickTimer = 0;
    act.channelStep = 0;
    act.stunnedTimer = 0;
    act.iframeTimer = 30.0;
    act.moveX = 0;
    act.moveZ = 0;
  }

  const csId = helpers.makeId('cutscene');
  room.awakeningCutscene = {
    id: csId,
    p1Id: p1.playerId,
    p2Id: p2.playerId,
    p1Name: p1.name,
    p2Name: p2.name,
    p1FighterId: p1.fighterId,
    p2FighterId: p2.fighterId,
    p1SkinId: p1.skinId,
    p2SkinId: p2.skinId,
    clockSec: 0,
    clashBalance: 0,
    p1Taps: 0,
    p2Taps: 0,
    p1Overdrive: 1,
    p2Overdrive: 1,
    outcome: null,
    fadeMusicOut: false,
    resolved: false,
    tug: createClashTugState(),
    botMashTimer: 0,
    hasSyncedAudio: false,
    lastAudioSyncAt: Date.now(),
  };

  helpers.pushEvent(room, {
    kind: 'awakeningCutsceneStart',
    attackerId: p1.playerId,
    targetId: p2.playerId,
    x: 0,
    y: 1.5,
    z: 0,
    colorHex: 0xfacc15,
    callout: 'AWAKENED CLASH!',
  });
}

export function cancelCutsceneGracefully(
  room: AwakeningRoomState,
  helpers: AwakeningHostHelpers
): void {
  if (!room.awakeningCutscene) return;
  room.awakeningCutscene = null;
  if (room.awakeningPhase === 'CUTSCENE') {
    room.awakeningPhase = 'AWAKENED_DUEL';
  }
  const fullRadius = MAP_BY_ID[room.mapId].arenaRadius;
  room.stormCenterX = 0;
  room.stormCenterZ = 0;
  room.stormMaxRadius = fullRadius;
  room.stormRadius = fullRadius;
  room.stormTickTimer = 0.5;
  for (const act of room.actors) {
    if (!act.isKO) {
      act.iframeTimer = Math.min(act.iframeTimer, 0.25);
      act.actionState = act.grounded ? 'idle' : 'jump';
    }
  }
  helpers.pushEvent(room, {
    kind: 'awakeningClashEnd',
    x: 0,
    y: 1.2,
    z: 0,
    colorHex: 0xf43f5e,
    callout: 'CLASH INTERRUPTED',
  });
}

export function skipCutsceneToClash(
  room: AwakeningRoomState,
  helpers: AwakeningHostHelpers
): void {
  const cs = room.awakeningCutscene;
  if (!cs || cs.resolved) return;
  const clashStart = AWAKENING_CONFIG.TIMELINE.CLASH_START_AT;
  if (cs.clockSec >= clashStart) return;

  cs.clockSec = clashStart;
  cs.hasSyncedAudio = false;
  cs.lastAudioSyncAt = Date.now();
  cs.tug = createClashTugState();
  cs.clashBalance = 0;
  cs.p1Taps = 0;
  cs.p2Taps = 0;

  const p1 = room.actors.find((a) => a.playerId === cs.p1Id);
  const p2 = room.actors.find((a) => a.playerId === cs.p2Id);
  const sepHalf = AWAKENING_CONFIG.CLASH_SEPARATION_DISTANCE * 0.5;
  if (p1) {
    p1.x = -sepHalf;
    p1.z = 0;
    p1.rotY = Math.PI * 0.5;
    p1.actionState = 'ultimate';
    p1.vx = 0;
  }
  if (p2) {
    p2.x = sepHalf;
    p2.z = 0;
    p2.rotY = -Math.PI * 0.5;
    p2.actionState = 'ultimate';
    p2.vx = 0;
  }
  helpers.pushEvent(room, {
    kind: 'shockwave',
    x: 0,
    y: 1.4,
    z: 0,
    colorHex: 0xfacc15,
    callout: 'SKIP TO CLASH DUEL — MASH NOW!',
  });
}

export function resolveCutsceneClash(
  room: AwakeningRoomState,
  helpers: AwakeningHostHelpers,
  skipped = false
): void {
  const cs = room.awakeningCutscene;
  if (!cs || cs.resolved) return;
  cs.resolved = true;

  const p1 = room.actors.find((a) => a.playerId === cs.p1Id && !a.isKO);
  const p2 = room.actors.find((a) => a.playerId === cs.p2Id && !a.isKO);
  if (!p1 || !p2) {
    cancelCutsceneGracefully(room, helpers);
    return;
  }

  let outcome = cs.tug.outcome;
  if (!outcome) {
    if (skipped && cs.p1Taps === 0 && cs.p2Taps === 0) {
      outcome = 'tie';
    } else if (Math.abs(cs.tug.balance) < 0.02 && cs.p1Taps === cs.p2Taps) {
      outcome = 'tie';
    } else {
      outcome = cs.tug.balance <= 0 ? (cs.p1Taps >= cs.p2Taps || cs.tug.balance < -0.02 ? 'p1' : 'p2') : 'p2';
    }
  }
  cs.outcome = outcome;
  cs.fadeMusicOut = skipped;

  // Release invulnerability so knockback & clash damage land cleanly
  p1.iframeTimer = 0;
  p2.iframeTimer = 0;
  p1.shieldActive = false;
  p2.shieldActive = false;

  if (outcome === 'tie') {
    p1.vx = -AWAKENING_CONFIG.CLASH_KNOCKBACK * 0.85;
    p1.vz = 0;
    p1.yVel = 4.6;
    p1.grounded = false;
    p1.actionState = 'stagger';
    p1.actionTimer = 0.45;
    p1.actionDuration = 0.45;

    p2.vx = AWAKENING_CONFIG.CLASH_KNOCKBACK * 0.85;
    p2.vz = 0;
    p2.yVel = 4.6;
    p2.grounded = false;
    p2.actionState = 'stagger';
    p2.actionTimer = 0.45;
    p2.actionDuration = 0.45;

    helpers.pushEvent(room, {
      kind: 'awakeningClashEnd',
      x: 0,
      y: 1.4,
      z: 0,
      colorHex: 0xffffff,
      hitStopMs: AWAKENING_CONFIG.CLASH_HITSTOP_MS,
      damage: 0,
      callout: 'EVEN CLASH — STANDOFF!',
    });
  } else {
    const winner = outcome === 'p1' ? p1 : p2;
    const loser = outcome === 'p1' ? p2 : p1;
    const dirX = loser.x >= winner.x ? 1 : -1;
    const dmg = AWAKENING_CONFIG.CLASH_DAMAGE;
    const loserStun = resolveCappedStunDuration(0.72, false);

    winner.actionState = 'idle';
    winner.actionTimer = 0;
    winner.iframeTimer = 0.35;
    winner.damageDealt += dmg;
    winner.domainGauge = addDomainCharge(winner.domainGauge ?? 0, 50);

    loser.hp = Math.max(0, loser.hp - dmg);
    loser.damagePhase = getDamagePhase(loser.hp, loser.maxHp, loser.isKO);
    loser.lastDamagedAt = room.matchTime;
    loser.vx = dirX * AWAKENING_CONFIG.CLASH_KNOCKBACK;
    loser.vz = 0;
    loser.yVel = AWAKENING_CONFIG.CLASH_UPWARD_VEL;
    loser.grounded = false;
    loser.actionState = 'stagger';
    loser.actionTimer = loserStun;
    loser.actionDuration = loserStun;

    helpers.pushEvent(room, {
      kind: 'awakeningClashEnd',
      attackerId: winner.playerId,
      targetId: loser.playerId,
      fighterId: winner.fighterId,
      x: (winner.x + loser.x) * 0.5,
      y: 1.45,
      z: 0,
      dirX,
      dirZ: 0,
      colorHex: AWAKENING_CONFIG.AWAKENED_KITS[winner.fighterId].auraPrimaryHex,
      damage: dmg,
      hitStopMs: AWAKENING_CONFIG.CLASH_HITSTOP_MS,
      callout: `${winner.name.toUpperCase()} OVERPOWERS! +50% DOMAIN`,
    });

    if (loser.hp <= 0) {
      helpers.eliminateActor(room, winner, loser, 'clash');
    }
  }

  room.awakeningPhase = 'AWAKENED_DUEL';
  room.awakeningCutscene = null;
  const fullRadius = MAP_BY_ID[room.mapId].arenaRadius;
  room.stormCenterX = 0;
  room.stormCenterZ = 0;
  room.stormMaxRadius = fullRadius;
  room.stormRadius = fullRadius;
  room.stormTickTimer = 0.5;
}

export function handleAwakeningMash(
  room: AwakeningRoomState,
  playerId: string,
  helpers: AwakeningHostHelpers,
  explicitSide?: 'p1' | 'p2'
): void {
  const cs = room.awakeningCutscene;
  if (!cs || cs.resolved) return;
  if (cs.clockSec < AWAKENING_CONFIG.TIMELINE.CLASH_START_AT - 0.15) return;

  let side: 'p1' | 'p2' | null = null;
  if (explicitSide && (room.isSoloPractice || room.isTrainingMode)) {
    side = explicitSide;
  } else if (playerId === cs.p1Id) {
    side = 'p1';
  } else if (playerId === cs.p2Id) {
    side = 'p2';
  }
  if (!side) return;

  registerClashMash(cs.tug, side, cs.tug.elapsed);
  cs.clashBalance = Number(cs.tug.balance.toFixed(3));
  cs.p1Taps = cs.tug.p1Taps;
  cs.p2Taps = cs.tug.p2Taps;
  cs.p1Overdrive = Number(cs.tug.p1OverdriveMult.toFixed(2));
  cs.p2Overdrive = Number(cs.tug.p2OverdriveMult.toFixed(2));

  if (cs.tug.resolved) {
    resolveCutsceneClash(room, helpers, false);
  }
}

export function syncCutsceneAudioClock(
  room: AwakeningRoomState,
  playerId: string,
  clockSec: number,
  helpers: AwakeningHostHelpers
): void {
  const cs = room.awakeningCutscene;
  if (!cs || cs.resolved) return;
  // Authority from P1 (or first connected human) keeps server state tightly aligned to audio.currentTime
  const p1 = room.actors.find((a) => a.playerId === cs.p1Id);
  const acceptFrom = p1 && !p1.isBot ? cs.p1Id : cs.p2Id;
  if (playerId !== acceptFrom && playerId !== cs.p1Id) return;
  if (Number.isFinite(clockSec) && clockSec >= cs.clockSec - 0.1 && clockSec <= 30) {
    cs.clockSec = Math.max(cs.clockSec, clockSec);
    cs.hasSyncedAudio = true;
    cs.lastAudioSyncAt = Date.now();
    if (cs.clockSec >= AWAKENING_CONFIG.TIMELINE.CLASH_END_AT) {
      resolveCutsceneClash(room, helpers, false);
    }
  }
}

/**
 * Returns true if the room is currently in CUTSCENE (caller should pause matchTimer & standard combat loop).
 */
export function tickAwakeningRoom(
  room: AwakeningRoomState,
  dt: number,
  helpers: AwakeningHostHelpers
): boolean {
  if (room.awakeningBanner) {
    room.awakeningBanner.remaining -= dt;
    if (room.awakeningBanner.remaining <= 0) {
      room.awakeningBanner = null;
    }
  }

  // Tick active Awakening Orb 20s lifespan & fade out expired/leftover orbs
  let expiredDuelOrb = false;
  for (const orb of room.awakeningOrbs) {
    if (orb.active && typeof orb.remaining === 'number') {
      orb.remaining = Math.max(0, orb.remaining - dt);
      if (orb.remaining <= 0) {
        orb.active = false;
        orb.fadeTimer = AWAKENING_CONFIG.ORB_FADEOUT_SEC;
        if (!orb.id.startsWith('npc-aorb-')) {
          expiredDuelOrb = true;
        }
      }
    }
    if (!orb.active && orb.fadeTimer > 0) {
      orb.fadeTimer = Math.max(0, orb.fadeTimer - dt);
    }
  }
  if (
    expiredDuelOrb &&
    room.awakeningPhase === 'ORBS_ACTIVE' &&
    !room.awakeningOrbs.some((o) => o.active && !o.id.startsWith('npc-aorb-'))
  ) {
    room.awakeningPhase = 'AWAKENED_DUEL';
    room.awakeningBanner = {
      id: helpers.makeId('aban'),
      text: 'AWAKENING ORBS EXPIRED!',
      subtext: 'The 20s Awakening window closed — finish the fight!',
      colorHex: 0xf43f5e,
      remaining: AWAKENING_CONFIG.BANNER_DURATION_SEC,
    };
  }
  if (room.awakeningOrbs.length > 0 && room.awakeningOrbs.every((o) => !o.active && o.fadeTimer <= 0)) {
    room.awakeningOrbs = [];
  }

  // Decrement per-actor awakening timers
  for (const a of room.actors) {
    if (a.awakeningTransformTimer > 0) a.awakeningTransformTimer = Math.max(0, a.awakeningTransformTimer - dt);
    if (a.silencedTimer > 0) a.silencedTimer = Math.max(0, a.silencedTimer - dt);
    if (a.snareMarkedTimer > 0) a.snareMarkedTimer = Math.max(0, a.snareMarkedTimer - dt);
  }

  // Delayed impact tasks (e.g., Khen mirage echo strikes)
  for (let i = room.awakeningDelayedHits.length - 1; i >= 0; i--) {
    const t = room.awakeningDelayedHits[i];
    t.remaining -= dt;
    if (t.remaining <= 0) {
      room.awakeningDelayedHits.splice(i, 1);
      t.run();
    }
  }

  // Check Cutscene state
  if (room.awakeningPhase === 'CUTSCENE') {
    const cs = room.awakeningCutscene;
    if (!cs) {
      room.awakeningPhase = 'AWAKENED_DUEL';
      return false;
    }
    const p1 = room.actors.find((a) => a.playerId === cs.p1Id);
    const p2 = room.actors.find((a) => a.playerId === cs.p2Id);
    if (!p1 || !p2 || p1.isKO || p2.isKO) {
      cancelCutsceneGracefully(room, helpers);
      return false;
    }

    // Fallback server clock progression if no client audio heartbeat arrived recently (e.g. muted/bot/headless test)
    const sinceSyncMs = Date.now() - cs.lastAudioSyncAt;
    if (!cs.hasSyncedAudio || sinceSyncMs > 320) {
      cs.clockSec += dt;
    }

    // Choreography positioning during 0:00-0:12 walk and 0:15-0:18 clash
    const T = AWAKENING_CONFIG.TIMELINE;
    if (cs.clockSec < T.PANEL_1_AT) {
      const u = clamp(cs.clockSec / Math.max(0.1, T.PANEL_1_AT), 0, 1);
      const halfDist =
        AWAKENING_CONFIG.WALK_START_HALF_DISTANCE +
        (AWAKENING_CONFIG.WALK_MEET_HALF_DISTANCE - AWAKENING_CONFIG.WALK_START_HALF_DISTANCE) * u;
      p1.x = -halfDist;
      p1.z = 0;
      p1.rotY = Math.PI * 0.5;
      p1.actionState = 'move';
      p1.vx = 1.4;
      p1.vz = 0;

      p2.x = halfDist;
      p2.z = 0;
      p2.rotY = -Math.PI * 0.5;
      p2.actionState = 'move';
      p2.vx = -1.4;
      p2.vz = 0;
    } else if (cs.clockSec < T.CLASH_START_AT) {
      p1.actionState = 'idle';
      p2.actionState = 'idle';
      p1.vx = 0;
      p2.vx = 0;
    } else {
      const sepHalf = AWAKENING_CONFIG.CLASH_SEPARATION_DISTANCE * 0.5;
      p1.x = -sepHalf;
      p1.z = 0;
      p1.rotY = Math.PI * 0.5;
      p1.actionState = 'ultimate';
      p1.vx = 0;

      p2.x = sepHalf;
      p2.z = 0;
      p2.rotY = -Math.PI * 0.5;
      p2.actionState = 'ultimate';
      p2.vx = 0;

      // Bot auto-mash simulation (~7 taps/s with jitter)
      for (const [side, actor] of [
        ['p1', p1],
        ['p2', p2],
      ] as const) {
        if (actor.isBot && !actor.isDummy) {
          const chance = dt * AWAKENING_CONFIG.BOT_MASH_RATE_HZ * (1 - AWAKENING_CONFIG.BOT_MASH_JITTER * 0.5 + Math.random() * AWAKENING_CONFIG.BOT_MASH_JITTER);
          if (Math.random() < chance) {
            registerClashMash(cs.tug, side, cs.tug.elapsed);
          }
        }
      }

      const outcome = stepClashTugOfWar(cs.tug, dt, T.CLASH_END_AT - T.CLASH_START_AT);
      cs.clashBalance = Number(cs.tug.balance.toFixed(3));
      cs.p1Taps = cs.tug.p1Taps;
      cs.p2Taps = cs.tug.p2Taps;
      cs.p1Overdrive = Number(cs.tug.p1OverdriveMult.toFixed(2));
      cs.p2Overdrive = Number(cs.tug.p2OverdriveMult.toFixed(2));

      if (outcome || cs.clockSec >= T.CLASH_END_AT) {
        resolveCutsceneClash(room, helpers, false);
      }
    }

    return true;
  }

  // Check spawn condition during PRE_AWAKENING (exclude Temple NPC Boss from match duel count)
  const aliveActors = room.actors.filter((a) => !a.isKO && !a.isDummy && !a.isNpcBoss);
  if (
    !room.isTrainingMode &&
    room.awakeningPhase === 'PRE_AWAKENING' &&
    room.initialActorCount > 2
  ) {
    if (aliveActors.length === AWAKENING_CONFIG.MULTI_PLAYER_ALIVE_TRIGGER) {
      if (room.awakeningCountdown === null || room.awakeningCountdown === undefined) {
        room.awakeningCountdown = AWAKENING_CONFIG.MULTI_PLAYER_SPAWN_DELAY_SEC;
        room.awakeningBanner = {
          id: helpers.makeId('aban'),
          text: 'FINAL 2 SURVIVORS!',
          subtext: `Awakening Orbs incoming in ${AWAKENING_CONFIG.MULTI_PLAYER_SPAWN_DELAY_SEC.toFixed(1)}s`,
          colorHex: 0x38bdf8,
          remaining: 3.4,
        };
      } else {
        room.awakeningCountdown = Math.max(0, room.awakeningCountdown - dt);
      }
    } else {
      room.awakeningCountdown = null;
    }
  } else if (room.awakeningPhase !== 'PRE_AWAKENING') {
    room.awakeningCountdown = null;
  }

  if (
    shouldSpawnAwakeningOrbs({
      isTrainingMode: room.isTrainingMode,
      phase: room.awakeningPhase,
      initialActorCount: room.initialActorCount,
      aliveCount: aliveActors.length,
      matchTime: room.matchTime,
      countdownRemaining: room.awakeningCountdown,
    })
  ) {
    spawnAwakeningOrbs(room, helpers);
  }

  // If 1 or fewer alive while orbs active -> fade leftover regular orbs cleanly (keep Temple NPC boss drop orb!)
  if (room.awakeningPhase === 'ORBS_ACTIVE' && aliveActors.length <= 1) {
    for (const orb of room.awakeningOrbs) {
      if (orb.active && !orb.id.startsWith('npc-aorb-')) {
        orb.active = false;
        orb.fadeTimer = AWAKENING_CONFIG.ORB_FADEOUT_SEC;
      }
    }
    return false;
  }

  // Check orb pickups during ORBS_ACTIVE OR whenever a Temple NPC Boss drop orb (npc-aorb-*) is active
  if (room.awakeningOrbs.length > 0) {
    const pickupsThisFrame: Array<{ actor: AwakeningActor; orb: AwakeningOrbState }> = [];
    const claimedOrbIds = new Set<string>();
    const claimedActorIds = new Set<string>();

    for (const orb of room.awakeningOrbs) {
      if (!orb.active) continue;
      const isNpcDrop = orb.id.startsWith('npc-aorb-');
      if (room.awakeningPhase !== 'ORBS_ACTIVE' && !isNpcDrop) continue;
      for (const actor of aliveActors) {
        if (actor.awakened || claimedActorIds.has(actor.playerId) || claimedOrbIds.has(orb.id)) continue;
        const distXZ = Math.hypot(actor.x - orb.x, actor.z - orb.z);
        const distY = Math.abs(actor.y + 0.9 - orb.y);
        if (distXZ <= AWAKENING_CONFIG.ORB_PICKUP_RADIUS && distY <= 3.2) {
          claimedOrbIds.add(orb.id);
          claimedActorIds.add(actor.playerId);
          pickupsThisFrame.push({ actor, orb });
        }
      }
    }

    if (pickupsThisFrame.length > 0) {
      const alreadyAwakenedActor = aliveActors.find((a) => a.awakened) ?? null;

      for (const { actor, orb } of pickupsThisFrame) {
        orb.active = false;
        orb.fadeTimer = 0;
        helpers.pushEvent(room, {
          kind: 'awakeningPickup',
          attackerId: actor.playerId,
          fighterId: actor.fighterId,
          x: orb.x,
          y: orb.y,
          z: orb.z,
          colorHex: AWAKENING_CONFIG.AWAKENED_KITS[actor.fighterId].auraPrimaryHex,
        });
      }

      if (pickupsThisFrame.length >= 2) {
        // Simultaneous same-frame pickup -> both awaken & immediately run cutscene
        const a1 = pickupsThisFrame[0].actor;
        const a2 = pickupsThisFrame[1].actor;
        awakenActorImmediate(room, a1, helpers, false);
        awakenActorImmediate(room, a2, helpers, false);
        const ordered = a1.slotIndex <= a2.slotIndex ? [a1, a2] : [a2, a1];
        beginAwakeningCutscene(room, ordered[0], ordered[1], helpers);
        return true;
      }

      const collector = pickupsThisFrame[0].actor;
      if (alreadyAwakenedActor && alreadyAwakenedActor.playerId !== collector.playerId) {
        // 2nd survivor grabbed remaining orb -> awaken & launch Cutscene!
        awakenActorImmediate(room, collector, helpers, false);
        const ordered =
          alreadyAwakenedActor.slotIndex <= collector.slotIndex
            ? [alreadyAwakenedActor, collector]
            : [collector, alreadyAwakenedActor];
        beginAwakeningCutscene(room, ordered[0], ordered[1], helpers);
        return true;
      } else {
        // 1st survivor -> immediate transform flash, hunt the other before they reach orb #2!
        awakenActorImmediate(room, collector, helpers, true);
      }
    }
  }

  return false;
}

export function handleAwakeningDebug(
  room: AwakeningRoomState,
  action: AwakeningDebugAction,
  helpers: AwakeningHostHelpers
): void {
  const nonDummy = room.actors.filter((a) => !a.isDummy && !a.isKO);
  const p1 = nonDummy[0] ?? room.actors[0];
  const p2 = nonDummy[1] ?? room.actors[1];

  if (action === 'spawnOrbs') {
    spawnAwakeningOrbs(room, helpers, true);
    return;
  }
  if (action === 'awakenP1' && p1) {
    if (!p1.awakened) {
      awakenActorImmediate(room, p1, helpers, true);
    } else if (room.isTrainingMode) {
      // Allow re-triggering the dramatic awakening surge burst in Training Area
      const kit = AWAKENING_CONFIG.AWAKENED_KITS[p1.fighterId];
      p1.awakeningTransformTimer = AWAKENING_CONFIG.FIRST_TRANSFORM_LOCK_SEC;
      p1.hp = p1.maxHp;
      p1.mana = p1.maxMana;
      p1.stamina = p1.maxStamina;
      for (let i = 0; i < p1.cooldowns.length; i++) p1.cooldowns[i] = 0;
      helpers.pushEvent(room, {
        kind: 'awakeningTransform',
        attackerId: p1.playerId,
        fighterId: p1.fighterId,
        x: p1.x,
        y: p1.y + 1.1,
        z: p1.z,
        colorHex: kit.auraPrimaryHex,
        hitStopMs: 65,
        callout: `${p1.name.toUpperCase()} SURGED!`,
      });
    }
    return;
  }
  if (action === 'awakenP2' && p2) {
    awakenActorImmediate(room, p2, helpers, true);
    return;
  }
  if (action === 'triggerCutscene' && p1 && p2) {
    beginAwakeningCutscene(room, p1, p2, helpers);
    return;
  }
  if (action === 'setTime89') {
    room.matchTime = 89.0;
    return;
  }
  if (action === 'fillDomain') {
    if (p1) {
      p1.domainGauge = 100;
    }
    return;
  }
  if (action === 'resetCooldowns') {
    for (const a of room.actors) {
      for (let i = 0; i < a.cooldowns.length; i++) a.cooldowns[i] = 0;
      a.dashCooldown = 0;
      a.grabCooldown = 0;
      a.flightCooldown = 0;
      a.flightRemaining = a.flightMax;
      a.mana = a.maxMana;
      a.stamina = a.maxStamina;
      a.silencedTimer = 0;
      a.stunImmunityTimer = 0;
    }
  }
}

export function setupAwakenedAbilityWindup(
  room: AwakeningRoomState,
  actor: AwakeningActor,
  slot: 0 | 2 | 3 | 4 | 6,
  castDirX: number,
  castDirZ: number,
  clampedAim: { x: number; z: number } | null,
  helpers: AwakeningHostHelpers
): void {
  const kit = AWAKENING_CONFIG.AWAKENED_KITS[actor.fighterId];
  const ab = getAwakenedAbility(actor.fighterId, slot);
  if (!ab) return;
  const specColor = kit.auraPrimaryHex;
  const aimDest = clampedAim ?? {
    x: actor.x + castDirX * Math.min(ab.aimRange ?? 8.5, 7.5),
    z: actor.z + castDirZ * Math.min(ab.aimRange ?? 8.5, 7.5),
  };

  if (slot === 0) {
    const isSingleRanged =
      actor.fighterId === 'damen' ||
      actor.fighterId === 'marjohn' ||
      (actor.fighterId === 'jm' && actor.isFlying);
    if (isSingleRanged) {
      actor.comboStep = ((actor.comboStep % 3) + 1) as 1 | 2 | 3;
    } else {
      if (room.matchTime - actor.lastM1At <= 1.6) {
        actor.comboStep = ((actor.comboStep % 4) + 1) as 1 | 2 | 3 | 4;
      } else {
        actor.comboStep = 1;
      }
    }
    actor.lastM1At = room.matchTime;
    const is4th = !isSingleRanged && actor.comboStep === 4;
    actor.m1Variant = is4th ? 'heavy' : 'light';
    actor.pendingHoldHeavy = is4th;
    if (actor.fighterId === 'prime' && is4th) {
      actor.superArmor = true;
    }
    actor.actionState = 'attack';
    actor.actionDuration = ab.duration;
    actor.actionTimer = ab.duration;
    if (!isSingleRanged) {
      if (actor.fighterId === 'jm' && is4th) {
        actor.superArmor = true;
        actor.vx = castDirX * 26.0;
        actor.vz = castDirZ * 26.0;
      } else {
        actor.vx = castDirX * (is4th ? 16.0 : 6.2);
        actor.vz = castDirZ * (is4th ? 16.0 : 6.2);
      }
    }
    helpers.pushEvent(room, {
      kind: 'cast',
      attackerId: actor.playerId,
      fighterId: actor.fighterId,
      x: actor.x,
      y: actor.y + 1.1,
      z: actor.z,
      dirX: castDirX,
      dirZ: castDirZ,
      colorHex: specColor,
      abilitySlot: 0,
      comboStep: actor.comboStep,
      m1Variant: actor.m1Variant,
    });
    return;
  }

  actor.actionState = slot >= 4 ? 'ultimate' : 'skill';
  const jmSanctuaryFastCharge =
    actor.fighterId === 'jm' &&
    slot === 6 &&
    room.activeDomain?.ownerId === actor.playerId &&
    room.activeDomain.fighterId === 'jm';
  actor.actionDuration = jmSanctuaryFastCharge ? Math.max(0.28, ab.duration * 0.5) : ab.duration;
  actor.actionTimer = actor.actionDuration;

  if (actor.fighterId === 'marjohn') {
    if (slot === 2) {
      const dx = aimDest.x - actor.x;
      const dz = aimDest.z - actor.z;
      const d = Math.max(0.1, Math.hypot(dx, dz));
      actor.yVel = 8.4;
      actor.grounded = false;
      actor.vx = (dx / d) * Math.min(22.0, d / Math.max(0.16, ab.windup));
      actor.vz = (dz / d) * Math.min(22.0, d / Math.max(0.16, ab.windup));
      helpers.spawnTelegraph(room, actor, 'circle', aimDest.x, 0, aimDest.z, castDirX, castDirZ, ab.range, 0, 0, ab.windup, specColor);
    } else if (slot === 3 || slot === 4) {
      helpers.spawnTelegraph(room, actor, 'circle', aimDest.x, 0, aimDest.z, castDirX, castDirZ, ab.range, 0, 0, ab.windup, specColor);
    } else if (slot === 6) {
      actor.iframeTimer = Math.max(actor.iframeTimer, ab.windup + 0.25);
      helpers.spawnTelegraph(room, actor, 'circle', actor.x, 0, actor.z, castDirX, castDirZ, AWAKENING_CONFIG.MARJOHN_TYPHOON_RADIUS, 0, 0, ab.windup, specColor);
    }
  } else if (actor.fighterId === 'prime') {
    if (slot === 2) {
      actor.superArmor = true;
      actor.iframeTimer = Math.max(actor.iframeTimer, 0.35);
      actor.vx = castDirX * AWAKENING_CONFIG.PRIME_RUSH_SPEED;
      actor.vz = castDirZ * AWAKENING_CONFIG.PRIME_RUSH_SPEED;
      helpers.spawnTelegraph(room, actor, 'line', actor.x, 0, actor.z, castDirX, castDirZ, 2.5, 9.5, 0, ab.windup, specColor);
    } else if (slot === 3) {
      actor.superArmor = true;
      helpers.spawnTelegraph(room, actor, 'cone', actor.x, 0, actor.z, castDirX, castDirZ, 0, ab.range, 0.52, ab.windup, specColor);
    } else if (slot === 4) {
      actor.yVel = 7.8;
      actor.grounded = false;
      helpers.spawnTelegraph(room, actor, 'circle', aimDest.x, 0, aimDest.z, castDirX, castDirZ, ab.range, 0, 0, ab.windup, specColor);
    } else if (slot === 6) {
      actor.superArmor = true;
      actor.iframeTimer = Math.max(actor.iframeTimer, ab.windup + 0.2);
      helpers.spawnTelegraph(room, actor, 'circle', actor.x, 0, actor.z, castDirX, castDirZ, AWAKENING_CONFIG.PRIME_METEOR_RADIUS, 0, 0, ab.windup, specColor);
    }
  } else if (actor.fighterId === 'damen') {
    if (slot === 2) {
      actor.iframeTimer = Math.max(actor.iframeTimer, 0.38);
      const rx = Math.hypot(actor.moveX, actor.moveZ) > 0.1 ? actor.moveX : -castDirX;
      const rz = Math.hypot(actor.moveX, actor.moveZ) > 0.1 ? actor.moveZ : -castDirZ;
      const mag = Math.max(0.01, Math.hypot(rx, rz));
      actor.vx = (rx / mag) * 18.0;
      actor.vz = (rz / mag) * 18.0;
    } else if (slot === 3 || slot === 4) {
      helpers.spawnTelegraph(room, actor, 'cone', actor.x, 0, actor.z, castDirX, castDirZ, 0, ab.range, 0.46, ab.windup, specColor);
    } else if (slot === 6) {
      helpers.spawnTelegraph(room, actor, 'cone', actor.x, 0, actor.z, castDirX, castDirZ, 0, ab.range, AWAKENING_CONFIG.DAMEN_ARSENAL_CONE_HALF, ab.windup, specColor);
    }
  } else if (actor.fighterId === 'khen') {
    if (slot === 2) {
      actor.iframeTimer = Math.max(actor.iframeTimer, 0.25);
      helpers.spawnTelegraph(room, actor, 'circle', aimDest.x, 0, aimDest.z, castDirX, castDirZ, 3.4, 0, 0, ab.windup, specColor);
    } else if (slot === 4) {
      helpers.spawnTelegraph(room, actor, 'line', actor.x, 0, actor.z, castDirX, castDirZ, 3.0, 11.5, 0, ab.windup, specColor);
    } else if (slot === 6) {
      actor.iframeTimer = Math.max(actor.iframeTimer, ab.duration);
      const domainCenter =
        clampedAim ??
        findBestEnemyClusterTarget(
          actor.x,
          actor.z,
          actor.playerId,
          room.actors,
          ab.aimRange ?? 14.0,
          AWAKENING_CONFIG.KHEN_OMNISLASH_RADIUS
        ) ?? { x: actor.x + castDirX * 6, z: actor.z + castDirZ * 6 };
      actor.pendingAimX = domainCenter.x;
      actor.pendingAimZ = domainCenter.z;
      helpers.spawnTelegraph(room, actor, 'circle', domainCenter.x, 0, domainCenter.z, castDirX, castDirZ, AWAKENING_CONFIG.KHEN_OMNISLASH_RADIUS, 0, 0, ab.windup, specColor);
    }
  } else if (actor.fighterId === 'jm') {
    if (slot === 3) {
      helpers.spawnTelegraph(room, actor, 'circle', actor.x, 0, actor.z, castDirX, castDirZ, AWAKENING_CONFIG.JM_DIVINE_NOVA_RADIUS, 0, 0, ab.windup, specColor);
    } else if (slot === 4) {
      helpers.spawnTelegraph(room, actor, 'line', actor.x, 0, actor.z, castDirX, castDirZ, ab.aimRadius ?? 3.0, ab.range, 0, ab.windup, specColor);
    } else if (slot === 6) {
      const slot6Mode = resolveJmAwakenedSlot6Variant(actor.isFlying);
      if (slot6Mode === 'super_kamehameha') {
        const windupSec =
          room.activeDomain?.ownerId === actor.playerId && room.activeDomain.fighterId === 'jm'
            ? Math.max(0.12, ab.windup * 0.5)
            : ab.windup;
        helpers.spawnTelegraph(room, actor, 'line', actor.x, 0, actor.z, castDirX, castDirZ, AWAKENING_CONFIG.JM_KAMEHAMEHA_WIDTH, AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE, 0, windupSec, specColor);
      }
    }
  }

  helpers.pushEvent(room, {
    kind: 'cast',
    attackerId: actor.playerId,
    fighterId: actor.fighterId,
    x: actor.x,
    y: actor.y + 1.05,
    z: actor.z,
    dirX: castDirX,
    dirZ: castDirZ,
    colorHex: specColor,
    abilitySlot: slot,
    callout: slot >= 4 ? `${ab.name.toUpperCase()}!` : undefined,
  });
}

export function executeAwakenedAbilityImpact(
  room: AwakeningRoomState,
  actor: AwakeningActor,
  slot: 0 | 2 | 3 | 4 | 6,
  helpers: AwakeningHostHelpers
): void {
  const kit = AWAKENING_CONFIG.AWAKENED_KITS[actor.fighterId];
  const ab = getAwakenedAbility(actor.fighterId, slot);
  if (!ab) return;
  helpers.clearActorTelegraph(room, actor);

  const fx = Math.sin(actor.rotY);
  const fz = Math.cos(actor.rotY);
  const arenaRadius = MAP_BY_ID[room.mapId].arenaRadius;
  const color = kit.auraPrimaryHex;
  const aimPt =
    actor.pendingAimX !== null && actor.pendingAimZ !== null
      ? { x: actor.pendingAimX, z: actor.pendingAimZ }
      : { x: actor.x + fx * Math.min(ab.aimRange ?? 6.5, 6.5), z: actor.z + fz * Math.min(ab.aimRange ?? 6.5, 6.5) };

  // ====================== 1. MARJOHN (Calamity Wind Sovereign) ======================
  if (actor.fighterId === 'marjohn') {
    if (slot === 0) {
      // Gale Cleave Volley: piercing crescent storm blade; 3rd hit pulls inward
      const pull = actor.comboStep === 3;
      room.projectiles.push({
        id: helpers.makeId('proj'),
        ownerId: actor.playerId,
        fighterId: 'marjohn',
        skinId: actor.skinId,
        kind: 'windBlade',
        x: actor.x + fx * 0.9,
        y: actor.y + 1.05,
        z: actor.z + fz * 0.9,
        vx: fx * AWAKENING_CONFIG.MARJOHN_BLADE_SPEED,
        vz: fz * AWAKENING_CONFIG.MARJOHN_BLADE_SPEED,
        rotY: actor.rotY,
        colorHex: color,
        originX: actor.x,
        originY: actor.y + 1.05,
        originZ: actor.z,
        isOverdrive: true,
        age: 0,
        maxAge: 0.65,
        maxRange: AWAKENING_CONFIG.MARJOHN_BLADE_RANGE,
        damage: ab.damage + (pull ? 4 : 0),
        staggerDamage: ab.staggerDamage,
        knockback: pull ? -9.5 : ab.knockback,
        hitIds: new Set(),
      });
      actor.landedCurrentAction = true;
      return;
    }
    if (slot === 2) {
      // Thunderhead Vault: Blink overhead + wider cyclone slam + lightning strike
      const safe = resolveObstacleCollisions(room.mapId, aimPt.x, actor.y, aimPt.z, 0.48, room.obstacles);
      actor.x = safe.x;
      actor.z = safe.z;
      clampActorToDomainBarrier(room, actor, 0.48);
      actor.y = getObstacleSupportY(room.mapId, actor.x, 0, actor.z, 0.42, room.obstacles);
      actor.yVel = 0;
      actor.grounded = true;
      helpers.damageObstaclesInArea(room, actor.x, actor.z, ab.range, ab.damage * 1.5, color);
      helpers.pushEvent(room, {
        kind: 'lightning',
        attackerId: actor.playerId,
        fighterId: 'marjohn',
        x: actor.x,
        y: actor.y + 0.2,
        z: actor.z,
        radius: ab.range,
        colorHex: 0x38bdf8,
        hitStopMs: 65,
        abilitySlot: 2,
        callout: 'THUNDERHEAD VAULT!',
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - actor.x, t.z - actor.z);
        if (d <= ab.range && Math.abs(t.y - actor.y) <= 3.5) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage, 2);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage + calc.staggerBonus, ab.knockback, d > 0.05 ? (t.x - actor.x) / d : fx, d > 0.05 ? (t.z - actor.z) / d : fz, color, true, false, false, calc.isCrit, calc.isBackstab)) {
            actor.landedCurrentAction = true;
            t.yVel = Math.max(t.yVel, 7.8);
            t.grounded = false;
          }
        }
      }
      return;
    }
    if (slot === 3) {
      // Maelstrom Prison: Twin orbiting tornadoes trap & shred + launch
      helpers.spawnZone(room, actor, 'maelstromTornado', aimPt.x, 0, aimPt.z, AWAKENING_CONFIG.MARJOHN_MAELSTROM_RADIUS, AWAKENING_CONFIG.MARJOHN_MAELSTROM_DURATION, color);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'marjohn',
        x: aimPt.x,
        y: 0.25,
        z: aimPt.z,
        radius: AWAKENING_CONFIG.MARJOHN_MAELSTROM_RADIUS,
        colorHex: color,
        abilitySlot: 3,
        callout: 'MAELSTROM PRISON!',
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - aimPt.x, t.z - aimPt.z);
        if (d <= ab.range) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage * 0.65, 3);
          if (helpers.applyHit(room, actor, t, calc.dmg, 24, 6.0, d > 0.05 ? (t.x - aimPt.x) / d : fx, d > 0.05 ? (t.z - aimPt.z) / d : fz, color, true, true)) {
            actor.landedCurrentAction = true;
          }
        }
      }
      return;
    }
    if (slot === 4) {
      // Empowered Tempest: Larger funnel with faster suction
      helpers.damageObstaclesInArea(room, aimPt.x, aimPt.z, ab.range, ab.damage * 1.6, color);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'marjohn',
        x: aimPt.x,
        y: 0.25,
        z: aimPt.z,
        radius: ab.range,
        colorHex: color,
        abilitySlot: 4,
        hitStopMs: 85,
        callout: 'EMPOWERED TEMPEST!',
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - aimPt.x, t.z - aimPt.z);
        if (d <= ab.range) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage, 4);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage, ab.knockback, d > 0.05 ? (t.x - aimPt.x) / d : fx, d > 0.05 ? (t.z - aimPt.z) / d : fz, color, true, false, true, calc.isCrit, calc.isBackstab)) {
            actor.landedCurrentAction = true;
            t.yVel = Math.max(t.yVel, 8.6);
            t.grounded = false;
          }
        }
      }
      return;
    }
    if (slot === 6) {
      // Sky-High Calamity Typhoon: Ascends skyward & summons towering vortex pulling all nearby enemies inward
      const dur = AWAKENING_CONFIG.MARJOHN_TYPHOON_DURATION;
      const rad = AWAKENING_CONFIG.MARJOHN_TYPHOON_RADIUS;
      actor.channelKind = 'marjohn_typhoon';
      actor.channelDuration = dur;
      actor.channelTimer = dur;
      actor.channelTickTimer = 0.14;
      actor.channelStep = 0;
      actor.channelTargetX = actor.x;
      actor.channelTargetZ = actor.z;
      actor.yVel = 0;
      actor.grounded = false;
      actor.isFlying = false;
      actor.iframeTimer = Math.max(actor.iframeTimer, dur + 0.25);
      helpers.spawnZone(room, actor, 'typhoonUltimate', actor.x, 0, actor.z, rad, dur + 0.15, 0x22d3ee);
      helpers.pushEvent(room, {
        kind: 'lightning',
        attackerId: actor.playerId,
        fighterId: 'marjohn',
        x: actor.x,
        y: actor.y + 1.5,
        z: actor.z,
        radius: rad,
        colorHex: 0x22d3ee,
        abilitySlot: 6,
        hitStopMs: 90,
        callout: 'SKY-HIGH CALAMITY TYPHOON!',
      });
      actor.landedCurrentAction = true;
      return;
    }
  }

  // ====================== 2. PRIME (Unbound Core Asura) ======================
  if (actor.fighterId === 'prime') {
    if (slot === 0) {
      // Overdrive 4-Hit Barrage: shockwave cone + Super Armor on 4th slam
      const is4th = actor.comboStep === 4;
      actor.superArmor = false;
      helpers.damageObstaclesInArea(room, actor.x + fx * 1.8, actor.z + fz * 1.8, ab.range, is4th ? 38 : 18, color);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'prime',
        x: actor.x + fx * 1.4,
        y: actor.y + 0.25,
        z: actor.z + fz * 1.4,
        dirX: fx,
        dirZ: fz,
        radius: is4th ? 4.8 : 3.2,
        colorHex: color,
        abilitySlot: 0,
        comboStep: actor.comboStep || undefined,
        m1Variant: is4th ? 'heavy' : 'light',
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const dx = t.x - actor.x;
        const dz = t.z - actor.z;
        const d = Math.hypot(dx, dz);
        if (d <= ab.range && Math.abs(t.y - actor.y) <= 2.8) {
          if (d > 0.1 && (dx / d) * fx + (dz / d) * fz < ab.arcCos && !is4th) continue;
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage + (is4th ? 8 : 0), 0);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage + calc.staggerBonus, ab.knockback * (is4th ? 1.45 : 1), d > 0.05 ? dx / d : fx, d > 0.05 ? dz / d : fz, color, is4th, false, false, calc.isCrit, calc.isBackstab)) {
            actor.landedCurrentAction = true;
            actor.mana = clamp(actor.mana + 18, 0, actor.maxMana);
          }
        }
      }
      return;
    }
    if (slot === 2) {
      // Comet Breaker: grab first enemy in dash path, slam forward & shatter buildings for bonus DMG!
      const startX = actor.x;
      const startZ = actor.z;
      let grabVictim: AwakeningActor | null = null;
      let wallShattered = false;
      for (let step = 1; step <= 8; step++) {
        const sx = clamp(startX + fx * (step * 1.15), -arenaRadius + 1, arenaRadius - 1);
        const sz = clamp(startZ + fz * (step * 1.15), -arenaRadius + 1, arenaRadius - 1);
        const obs = findObstacleAtPoint(room.mapId, sx, 0.8, sz, room.obstacles);
        if (obs && obs.destructible) {
          helpers.damageObstacle(room, obs, 999, sx, 1.5, sz, color);
          wallShattered = true;
        }
        if (!grabVictim) {
          for (const t of room.actors) {
            if (t.playerId === actor.playerId || t.isKO) continue;
            if (Math.hypot(t.x - sx, t.z - sz) <= 2.2) {
              grabVictim = t;
              break;
            }
          }
        }
        actor.x = sx;
        actor.z = sz;
        clampActorToDomainBarrier(room, actor, 0.48);
      }
      const postSafe = resolveObstacleCollisions(room.mapId, actor.x, actor.y, actor.z, 0.48, room.obstacles);
      actor.x = postSafe.x;
      actor.z = postSafe.z;
      clampActorToDomainBarrier(room, actor, 0.48);
      if (grabVictim) {
        grabVictim.x = clamp(actor.x + fx * 1.35, -arenaRadius + 1, arenaRadius - 1);
        grabVictim.z = clamp(actor.z + fz * 1.35, -arenaRadius + 1, arenaRadius - 1);
        clampActorToDomainBarrier(room, grabVictim, 0.48);
        const dmg = ab.damage + (wallShattered ? AWAKENING_CONFIG.PRIME_WALL_SHATTER_BONUS_DMG : 0);
        const calc = helpers.computeDynamicDamage(actor, grabVictim, dmg, 2);
        helpers.applyHit(room, actor, grabVictim, calc.dmg, ab.staggerDamage, ab.knockback, fx, fz, color, true, false, false, true, false);
        actor.landedCurrentAction = true;
      }
      helpers.pushEvent(room, {
        kind: 'cometGrab',
        attackerId: actor.playerId,
        targetId: grabVictim?.playerId,
        fighterId: 'prime',
        x: actor.x,
        y: actor.y + 1.0,
        z: actor.z,
        originX: startX,
        originY: actor.y + 1.0,
        originZ: startZ,
        dirX: fx,
        dirZ: fz,
        colorHex: color,
        abilitySlot: 2,
        hitStopMs: 75,
        callout: wallShattered ? 'WALL SHATTER SLAM!' : 'COMET BREAKER!',
      });
      return;
    }
    if (slot === 3) {
      // Tectonic Eruption: 3 branching magma fissures erupting sequentially
      const branches = [-0.42, 0, 0.42];
      branches.forEach((off, bIdx) => {
        const ang = actor.rotY + off;
        const bx = Math.sin(ang);
        const bz = Math.cos(ang);
        room.awakeningDelayedHits.push({
          remaining: bIdx * 0.11,
          run: () => {
            const cx = actor.x + bx * 5.2;
            const cz = actor.z + bz * 5.2;
            helpers.spawnZone(room, actor, 'magmaBranch', cx, 0, cz, 3.2, AWAKENING_CONFIG.PRIME_FISSURE_DURATION, 0xf97316, actor.x + bx * 10.5, actor.z + bz * 10.5);
            helpers.damageObstaclesInArea(room, cx, cz, 3.8, 35, 0xf97316);
            helpers.pushEvent(room, {
              kind: 'shockwave',
              attackerId: actor.playerId,
              fighterId: 'prime',
              x: cx,
              y: 0.25,
              z: cz,
              radius: 3.4,
              colorHex: 0xf97316,
              abilitySlot: 3,
            });
            for (const t of room.actors) {
              if (t.playerId === actor.playerId || t.isKO) continue;
              const dx = t.x - actor.x;
              const dz = t.z - actor.z;
              const along = dx * bx + dz * bz;
              const perp = Math.abs(dx * -bz + dz * bx);
              if (along >= 0.4 && along <= AWAKENING_CONFIG.PRIME_FISSURE_BRANCH_LENGTH && perp <= 2.3) {
                const calc = helpers.computeDynamicDamage(actor, t, ab.damage * 0.65, 3);
                if (helpers.applyHit(room, actor, t, calc.dmg, 24, 9.0, bx, bz, 0xf97316, true)) {
                  actor.landedCurrentAction = true;
                }
              }
            }
          },
        });
      });
      return;
    }
    if (slot === 4) {
      // Empowered Avalanche: massive molten crater slam
      const safe = resolveObstacleCollisions(room.mapId, aimPt.x, actor.y, aimPt.z, 0.48, room.obstacles);
      actor.x = safe.x;
      actor.z = safe.z;
      clampActorToDomainBarrier(room, actor, 0.48);
      helpers.damageObstaclesInArea(room, actor.x, actor.z, ab.range, ab.damage * 1.7, color);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'prime',
        x: actor.x,
        y: 0.25,
        z: actor.z,
        radius: ab.range,
        colorHex: color,
        abilitySlot: 4,
        hitStopMs: 90,
        callout: 'EMPOWERED AVALANCHE!',
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - actor.x, t.z - actor.z);
        if (d <= ab.range) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage, 4);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage, ab.knockback, d > 0.05 ? (t.x - actor.x) / d : fx, d > 0.05 ? (t.z - actor.z) / d : fz, color, true, false, true, calc.isCrit, calc.isBackstab)) {
            actor.landedCurrentAction = true;
          }
        }
      }
      return;
    }
    if (slot === 6) {
      // Skybound Meteor Barrage: Leaps skyward, roams freely & rains giant crimson meteor punches below
      const dur = AWAKENING_CONFIG.PRIME_METEOR_DURATION;
      actor.channelKind = 'prime_meteor';
      actor.channelDuration = dur;
      actor.channelTimer = dur;
      actor.channelTickTimer = 0.04;
      actor.channelStep = 0;
      actor.channelTargetX = actor.x;
      actor.channelTargetZ = actor.z;
      actor.yVel = 0;
      actor.grounded = false;
      actor.superArmor = true;
      actor.iframeTimer = Math.max(actor.iframeTimer, dur + 0.2);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'prime',
        x: actor.x,
        y: actor.y + 0.4,
        z: actor.z,
        radius: AWAKENING_CONFIG.PRIME_METEOR_RADIUS,
        colorHex: 0xf43f5e,
        abilitySlot: 6,
        hitStopMs: 90,
        callout: 'SKYBOUND METEOR BARRAGE!',
      });
      actor.landedCurrentAction = true;
      return;
    }
  }

  // ====================== 3. DAMEN (High Noon Arsenal) ======================
  if (actor.fighterId === 'damen') {
    if (slot === 0) {
      // Akimbo Sun-Fire: twin golden tracers with slight aim-assist and capped volley hit
      const tgt = helpers.findNearestTarget(room, actor, ab.range);
      let baseYaw = actor.rotY;
      if (tgt) {
        const ang = Math.atan2(tgt.x - actor.x, tgt.z - actor.z);
        const diff = Math.atan2(Math.sin(ang - baseYaw), Math.cos(ang - baseYaw));
        if (Math.abs(diff) <= 0.28) {
          baseYaw = ang;
          actor.rotY = ang;
        }
      }
      const volleyHitCounts = new Map<string, number>();
      for (const spread of [-0.06, 0.06]) {
        const ang = baseYaw + spread;
        room.projectiles.push({
          id: helpers.makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'damen',
          skinId: actor.skinId,
          kind: 'magnum',
          x: actor.x + Math.sin(ang) * 0.85,
          y: actor.y + 1.15,
          z: actor.z + Math.cos(ang) * 0.85,
          vx: Math.sin(ang) * AWAKENING_CONFIG.DAMEN_TRACER_SPEED,
          vz: Math.cos(ang) * AWAKENING_CONFIG.DAMEN_TRACER_SPEED,
          rotY: ang,
          colorHex: 0xfef08a,
          originX: actor.x,
          originY: actor.y + 1.15,
          originZ: actor.z,
          isOverdrive: true,
          isHoming: room.activeDomain?.ownerId === actor.playerId && room.activeDomain.fighterId === 'damen',
          age: 0,
          maxAge: 0.52,
          maxRange: AWAKENING_CONFIG.DAMEN_TRACER_RANGE,
          damage: ab.damage,
          staggerDamage: ab.staggerDamage,
          knockback: ab.knockback,
          hitIds: new Set(),
          volleyHitCounts,
          volleyMaxHits: 2,
        });
      }
      actor.landedCurrentAction = true;
      return;
    }
    if (slot === 2) {
      // Phantom Gun-Kata Roll: 360° ring of golden shots (capped multi-hit per target)
      const count = AWAKENING_CONFIG.DAMEN_ROLL_RING_SHOTS;
      const volleyHitCounts = new Map<string, number>();
      for (let i = 0; i < count; i++) {
        const ang = actor.rotY + (i / count) * Math.PI * 2;
        room.projectiles.push({
          id: helpers.makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'damen',
          skinId: actor.skinId,
          kind: 'magnum',
          x: actor.x + Math.sin(ang) * 0.8,
          y: actor.y + 1.1,
          z: actor.z + Math.cos(ang) * 0.8,
          vx: Math.sin(ang) * 26.0,
          vz: Math.cos(ang) * 26.0,
          rotY: ang,
          colorHex: 0xfef08a,
          originX: actor.x,
          originY: actor.y + 1.1,
          originZ: actor.z,
          isOverdrive: true,
          isHoming: room.activeDomain?.ownerId === actor.playerId && room.activeDomain.fighterId === 'damen',
          age: 0,
          maxAge: 0.45,
          maxRange: 11.0,
          damage: ab.damage,
          staggerDamage: ab.staggerDamage,
          knockback: ab.knockback,
          hitIds: new Set(),
          volleyHitCounts,
          volleyMaxHits: 2,
        });
      }
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'damen',
        x: actor.x,
        y: actor.y + 0.9,
        z: actor.z,
        colorHex: 0xfacc15,
        abilitySlot: 2,
        callout: 'GUN-KATA RING!',
      });
      actor.landedCurrentAction = true;
      return;
    }
    if (slot === 3) {
      // Constellation Snare: 3 wide solar chains pull foes together & mark for bonus gunshot DMG
      const volleyHitCounts = new Map<string, number>();
      for (const spread of [-0.26, 0, 0.26]) {
        const ang = actor.rotY + spread;
        room.projectiles.push({
          id: helpers.makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'damen',
          skinId: actor.skinId,
          kind: 'lasso',
          x: actor.x + Math.sin(ang) * 0.9,
          y: actor.y + 1.05,
          z: actor.z + Math.cos(ang) * 0.9,
          vx: Math.sin(ang) * 30.0,
          vz: Math.cos(ang) * 30.0,
          rotY: ang,
          colorHex: 0xfacc15,
          originX: actor.x,
          originY: actor.y + 1.05,
          originZ: actor.z,
          isOverdrive: true,
          age: 0,
          maxAge: 0.5,
          maxRange: 14.5,
          damage: ab.damage,
          staggerDamage: ab.staggerDamage,
          knockback: ab.knockback,
          hitIds: new Set(),
          volleyHitCounts,
          volleyMaxHits: 2,
        });
      }
      return;
    }
    if (slot === 4) {
      // Empowered High Noon: 9-shot instant golden spread with capped volley scaling
      const volleyHitCounts = new Map<string, number>();
      for (const spread of [-0.48, -0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36, 0.48]) {
        const ang = actor.rotY + spread;
        room.projectiles.push({
          id: helpers.makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'damen',
          skinId: actor.skinId,
          kind: 'magnum',
          x: actor.x + Math.sin(ang) * 0.9,
          y: actor.y + 1.15,
          z: actor.z + Math.cos(ang) * 0.9,
          vx: Math.sin(ang) * 30.0,
          vz: Math.cos(ang) * 30.0,
          rotY: ang,
          colorHex: 0xfef08a,
          originX: actor.x,
          originY: actor.y + 1.15,
          originZ: actor.z,
          isOverdrive: true,
          isHoming: room.activeDomain?.ownerId === actor.playerId && room.activeDomain.fighterId === 'damen',
          age: 0,
          maxAge: 0.56,
          maxRange: 15.5,
          damage: ab.damage,
          staggerDamage: ab.staggerDamage,
          knockback: ab.knockback,
          hitIds: new Set(),
          volleyHitCounts,
          volleyMaxHits: 3,
        });
      }
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'damen',
        x: actor.x,
        y: actor.y + 0.3,
        z: actor.z,
        dirX: fx,
        dirZ: fz,
        colorHex: 0xfacc15,
        abilitySlot: 4,
        callout: 'HIGH NOON OVERDRIVE!',
      });
      actor.landedCurrentAction = true;
      return;
    }
    if (slot === 6) {
      // Infinite Arsenal Fan: Wide floating arc of spectral guns unleashing continuous steerable fan barrage
      const dur = AWAKENING_CONFIG.DAMEN_ARSENAL_DURATION;
      actor.channelKind = 'damen_arsenal';
      actor.channelDuration = dur;
      actor.channelTimer = dur;
      actor.channelTickTimer = 0.01;
      actor.channelStep = 0;
      actor.channelTargetX = actor.x + fx * 12.0;
      actor.channelTargetZ = actor.z + fz * 12.0;
      helpers.pushEvent(room, {
        kind: 'beam',
        attackerId: actor.playerId,
        fighterId: 'damen',
        x: actor.x + fx * 1.2,
        y: actor.y + 1.25,
        z: actor.z + fz * 1.2,
        dirX: fx,
        dirZ: fz,
        colorHex: 0xfacc15,
        abilitySlot: 6,
        hitStopMs: 85,
        callout: 'INFINITE ARSENAL FAN!',
      });
      actor.landedCurrentAction = true;
      return;
    }
  }

  // ====================== 4. KHEN (Eclipse Phantom Monarch) ======================
  if (actor.fighterId === 'khen') {
    if (slot === 0) {
      // Mirage 4-Hit Blitz: immediate dagger strike + shadow clone repeats strike 0.15s later!
      const is4th = actor.comboStep === 4;
      const sx = actor.x + fx * 1.1;
      const sz = actor.z + fz * 1.1;
      helpers.damageObstaclesInArea(room, sx, sz, 3.0, 18, color);
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const dx = t.x - actor.x;
        const dz = t.z - actor.z;
        const d = Math.hypot(dx, dz);
        if (d <= ab.range && Math.abs(t.y - actor.y) <= 2.4) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage + (is4th ? 5 : 0), 0);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage, ab.knockback, d > 0.05 ? dx / d : fx, d > 0.05 ? dz / d : fz, color, is4th, false, false, calc.isCrit, calc.isBackstab)) {
            actor.landedCurrentAction = true;
            actor.mana = clamp(actor.mana + 14, 0, actor.maxMana);
          }
        }
      }
      // Schedule 0.15s Mirage Clone Echo
      room.awakeningDelayedHits.push({
        remaining: AWAKENING_CONFIG.KHEN_MIRAGE_ECHO_DELAY_SEC,
        run: () => {
          helpers.pushEvent(room, {
            kind: 'shockwave',
            attackerId: actor.playerId,
            fighterId: 'khen',
            x: sx,
            y: actor.y + 0.9,
            z: sz,
            dirX: fx,
            dirZ: fz,
            radius: 2.8,
            colorHex: 0xc084fc,
            abilitySlot: 0,
          });
          for (const t of room.actors) {
            if (t.playerId === actor.playerId || t.isKO) continue;
            if (Math.hypot(t.x - sx, t.z - sz) <= 3.0 && Math.abs(t.y - actor.y) <= 2.4) {
              helpers.applyHit(room, actor, t, Math.round(ab.damage * 0.55), 8, 2.5, fx, fz, 0xc084fc, false);
            }
          }
        },
      });
      return;
    }
    if (slot === 2) {
      // Zero-Point Blink: high-speed blink slicing enemies & leaving delayed-detonation Shadow Rift
      const ox = actor.x;
      const oz = actor.z;
      helpers.spawnZone(room, actor, 'shadowRift', ox, 0, oz, 3.6, AWAKENING_CONFIG.KHEN_SHADOW_RIFT_DURATION, color);
      const safe = resolveObstacleCollisions(room.mapId, aimPt.x, actor.y, aimPt.z, 0.48, room.obstacles);
      actor.x = safe.x;
      actor.z = safe.z;
      clampActorToDomainBarrier(room, actor, 0.48);
      helpers.damageObstaclesInArea(room, actor.x, actor.z, 3.8, ab.damage * 1.4, color);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'khen',
        x: actor.x,
        y: actor.y + 0.9,
        z: actor.z,
        originX: ox,
        originY: actor.y + 0.9,
        originZ: oz,
        dirX: fx,
        dirZ: fz,
        colorHex: color,
        abilitySlot: 2,
        callout: 'ZERO-POINT BLINK!',
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - actor.x, t.z - actor.z);
        if (d <= 3.8) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage, 2);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage, ab.knockback, fx, fz, color, true)) {
            actor.landedCurrentAction = true;
          }
        }
      }
      return;
    }
    if (slot === 3) {
      // Abyssal Cross-Slash: wide X void waves that silence enemy skills for 1.5s!
      for (const off of [-0.18, 0.18]) {
        const ang = actor.rotY + off;
        room.projectiles.push({
          id: helpers.makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'khen',
          skinId: actor.skinId,
          kind: 'crescent',
          x: actor.x + Math.sin(ang) * 0.95,
          y: actor.y + 1.15,
          z: actor.z + Math.cos(ang) * 0.95,
          vx: Math.sin(ang) * 26.0,
          vz: Math.cos(ang) * 26.0,
          rotY: ang,
          colorHex: color,
          originX: actor.x,
          originY: actor.y + 1.15,
          originZ: actor.z,
          isComboLink: true,
          isOverdrive: true,
          age: 0,
          maxAge: 0.62,
          maxRange: 15.0,
          damage: ab.damage * 0.72,
          staggerDamage: ab.staggerDamage,
          knockback: ab.knockback,
          hitIds: new Set(),
        });
      }
      helpers.pushEvent(room, {
        kind: 'silence',
        attackerId: actor.playerId,
        fighterId: 'khen',
        x: actor.x + fx * 1.4,
        y: actor.y + 1.0,
        z: actor.z + fz * 1.4,
        dirX: fx,
        dirZ: fz,
        colorHex: color,
        abilitySlot: 3,
        callout: 'ABYSSAL CROSS-SLASH!',
      });
      return;
    }
    if (slot === 4) {
      // Empowered Phantom Blitz: wider X-corridor, resets Dash cooldown on hit!
      const ox = actor.x;
      const oz = actor.z;
      let anyHit = false;
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const dx = t.x - ox;
        const dz = t.z - oz;
        const along = dx * fx + dz * fz;
        const perp = Math.abs(dx * -fz + dz * fx);
        if (along > -0.6 && along <= 11.5 && perp <= 3.0) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage, 4);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage, ab.knockback, fx, fz, color, true, false, true, calc.isCrit, calc.isBackstab)) {
            anyHit = true;
            actor.landedCurrentAction = true;
          }
        }
      }
      if (anyHit) {
        actor.dashCooldown = 0;
      }
      const safe = resolveObstacleCollisions(room.mapId, actor.x + fx * 8.5, actor.y, actor.z + fz * 8.5, 0.48, room.obstacles);
      actor.x = safe.x;
      actor.z = safe.z;
      clampActorToDomainBarrier(room, actor, 0.48);
      helpers.damageObstaclesInArea(room, ox + fx * 5.0, oz + fz * 5.0, 5.5, 65, color);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'khen',
        x: ox + fx * 5.0,
        y: actor.y + 0.5,
        z: oz + fz * 5.0,
        originX: ox,
        originY: actor.y + 1.0,
        originZ: oz,
        dirX: fx,
        dirZ: fz,
        colorHex: color,
        abilitySlot: 4,
        callout: anyHit ? 'BLITZ — DASH RESET!' : 'EMPOWERED PHANTOM BLITZ!',
      });
      return;
    }
    if (slot === 6) {
      // Thousand-Shadow Domain: Large dark-violet domain with 6 clones; Khen zooms between clones slashing & stunning!
      const autoCenter =
        actor.pendingAimX !== null && actor.pendingAimZ !== null
          ? { x: actor.pendingAimX, z: actor.pendingAimZ }
          : findBestEnemyClusterTarget(
              actor.x,
              actor.z,
              actor.playerId,
              room.actors,
              ab.aimRange ?? 14.0,
              AWAKENING_CONFIG.KHEN_OMNISLASH_RADIUS
            ) ?? { x: actor.x, z: actor.z };
      const cx = autoCenter.x;
      const cz = autoCenter.z;
      const rad = AWAKENING_CONFIG.KHEN_OMNISLASH_RADIUS;
      const dur = AWAKENING_CONFIG.KHEN_DOMAIN_DURATION;
      actor.channelKind = 'khen_domain';
      actor.channelDuration = dur;
      actor.channelTimer = dur;
      actor.channelTickTimer = 0.04;
      actor.channelStep = 0;
      actor.channelTargetX = cx;
      actor.channelTargetZ = cz;
      actor.iframeTimer = Math.max(actor.iframeTimer, dur + 0.25);
      helpers.spawnZone(room, actor, 'khenDomain', cx, 0, cz, rad, dur + 0.2, 0xa855f7);
      helpers.pushEvent(room, {
        kind: 'omnislash',
        attackerId: actor.playerId,
        fighterId: 'khen',
        x: cx,
        y: 1.0,
        z: cz,
        radius: rad,
        colorHex: 0xa855f7,
        abilitySlot: 6,
        hitStopMs: 85,
        callout: 'THOUSAND-SHADOW DOMAIN!',
      });
      actor.landedCurrentAction = true;
      return;
    }
  }

  // ====================== 5. JM (Celestial Dragon Ascendant) ======================
  if (actor.fighterId === 'jm') {
    if (slot === 0) {
      // Ascendant 4-Hit: crescent golden-cyan slashes + mini Kamehameha waves; twin rapid bolts when flying
      if (actor.isFlying) {
        for (const off of [-0.08, 0.08]) {
          const ang = actor.rotY + off;
          room.projectiles.push({
            id: helpers.makeId('proj'),
            ownerId: actor.playerId,
            fighterId: 'jm',
            skinId: actor.skinId,
            kind: 'jmBolt',
            x: actor.x + Math.sin(ang) * 0.9,
            y: actor.y + 1.15,
            z: actor.z + Math.cos(ang) * 0.9,
            vx: Math.sin(ang) * 26.0,
            vy: -4.2,
            vz: Math.cos(ang) * 26.0,
            rotY: ang,
            colorHex: 0xfef08a,
            originX: actor.x,
            originY: actor.y + 1.15,
            originZ: actor.z,
            isOverdrive: true,
            age: 0,
            maxAge: 0.78,
            maxRange: 19.0,
            damage: ab.damage * 0.65,
            staggerDamage: 14,
            knockback: 4.5,
            hitIds: new Set(),
          });
        }
        actor.landedCurrentAction = true;
        return;
      }

      const isFinisher = actor.comboStep === 4;
      helpers.pushEvent(room, {
        kind: 'crescentSlash',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 0.75,
        y: actor.y + 1.05,
        z: actor.z + fz * 0.75,
        dirX: fx,
        dirZ: fz,
        radius: isFinisher ? 2.6 : 1.9,
        colorHex: actor.comboStep % 2 === 0 ? 0x38bdf8 : 0xfef08a,
        abilitySlot: 0,
        comboStep: actor.comboStep as 1 | 2 | 3 | 4,
      });

      // Every ground swing fires a fast small Kamehameha wave forward!
      room.projectiles.push({
        id: helpers.makeId('proj'),
        ownerId: actor.playerId,
        fighterId: 'jm',
        skinId: actor.skinId,
        kind: 'jmBeam',
        x: actor.x + fx * 1.0,
        y: actor.y + 1.15,
        z: actor.z + fz * 1.0,
        vx: fx * AWAKENING_CONFIG.JM_WAVE_SPEED,
        vz: fz * AWAKENING_CONFIG.JM_WAVE_SPEED,
        rotY: actor.rotY,
        colorHex: 0x38bdf8,
        originX: actor.x,
        originY: actor.y + 1.15,
        originZ: actor.z,
        isOverdrive: true,
        age: 0,
        maxAge: 0.34,
        maxRange: isFinisher ? 8.8 : 6.2,
        damage: ab.damage + (isFinisher ? 4 : 0),
        staggerDamage: ab.staggerDamage,
        knockback: isFinisher ? ab.knockback * 2.0 : ab.knockback,
        hitIds: new Set(),
      });
      if (isFinisher) {
        // 4th hit Super Dash Punch: close-range crater + jagged spike crown knocking enemies back
        helpers.damageObstaclesInArea(room, actor.x + fx * 1.5, actor.z + fz * 1.5, 3.4, 26, 0xfef08a);
        helpers.pushEvent(room, {
          kind: 'craterSlam',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x + fx * 1.2,
          y: actor.y + 0.3,
          z: actor.z + fz * 1.2,
          dirX: fx,
          dirZ: fz,
          radius: 3.6,
          colorHex: 0xfef08a,
          abilitySlot: 0,
          comboStep: 4,
          m1Variant: 'heavy',
          isCounter: true,
          callout: 'SUPER DASH PUNCH!',
        });
        for (const t of room.actors) {
          if (t.playerId === actor.playerId || t.isKO) continue;
          const dx = t.x - actor.x;
          const dz = t.z - actor.z;
          const d = Math.hypot(dx, dz);
          if (d <= 3.5 && Math.abs(t.y - actor.y) <= 2.6) {
            const calc = helpers.computeDynamicDamage(actor, t, ab.damage * 0.75, 0);
            if (helpers.applyHit(room, actor, t, calc.dmg, 24, ab.knockback * 2.1, d > 0.05 ? dx / d : fx, d > 0.05 ? dz / d : fz, 0xfef08a, true, false, false, true, calc.isBackstab)) {
              actor.landedCurrentAction = true;
            }
          }
        }
      }
      actor.landedCurrentAction = true;
      return;
    }
    if (slot === 2) {
      // Instant Transmission Palm: vanish in lightning, appear behind foe with crater palm stun (near-zero knockback for combos!)
      const originX = actor.x;
      const originY = actor.y;
      const originZ = actor.z;
      const tgt = helpers.findPreferredTarget(room, actor, 18.0);
      if (tgt) {
        const tFwdX = Math.sin(tgt.rotY);
        const tFwdZ = Math.cos(tgt.rotY);
        const bx = tgt.x - tFwdX * 1.45;
        const bz = tgt.z - tFwdZ * 1.45;
        const safe = resolveObstacleCollisions(room.mapId, bx, tgt.y, bz, 0.48, room.obstacles);
        actor.x = safe.x;
        actor.z = safe.z;
        clampActorToDomainBarrier(room, actor, 0.48);
        actor.y = tgt.y;
        actor.rotY = Math.atan2(tgt.x - actor.x, tgt.z - actor.z);
      } else {
        const safe = resolveObstacleCollisions(room.mapId, aimPt.x, actor.y, aimPt.z, 0.48, room.obstacles);
        actor.x = safe.x;
        actor.z = safe.z;
        clampActorToDomainBarrier(room, actor, 0.48);
      }
      const pfx = Math.sin(actor.rotY);
      const pfz = Math.cos(actor.rotY);
      helpers.pushEvent(room, {
        kind: 'dash',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x,
        y: actor.y + 1.0,
        z: actor.z,
        originX,
        originY: originY + 1.0,
        originZ,
        dirX: pfx,
        dirZ: pfz,
        colorHex: 0x38bdf8,
        abilitySlot: 2,
      });
      helpers.pushEvent(room, {
        kind: 'craterSlam',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + pfx * 0.9,
        y: actor.y + 0.3,
        z: actor.z + pfz * 0.9,
        dirX: pfx,
        dirZ: pfz,
        radius: 3.8,
        colorHex: 0xfef08a,
        abilitySlot: 2,
        hitStopMs: 65,
        callout: 'INSTANT TRANSMISSION!',
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - actor.x, t.z - actor.z);
        if (d <= 4.0) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage, 2);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage, 0.4, pfx, pfz, 0xfef08a, true, false, false, true, true)) {
            applyDirectStun(t, 0.72, false);
            t.vx = 0;
            t.vz = 0;
            actor.landedCurrentAction = true;
          }
        }
      }
      return;
    }
    if (slot === 3) {
      // Divine Sanctuary Nova: Slam 1 erupts 10 towering golden-cyan pillars + suspends hit foes mid-air -> Slam 2 spikes them down at crosshair!
      const rad = AWAKENING_CONFIG.JM_DIVINE_NOVA_RADIUS;
      actor.mana = clamp(actor.mana + AWAKENING_CONFIG.JM_DIVINE_NOVA_CHI_GAIN, 0, actor.maxMana);
      helpers.spawnZone(room, actor, 'icePillarNova', actor.x, 0, actor.z, rad, 2.2, 0x38bdf8);
      helpers.damageObstaclesInArea(room, actor.x, actor.z, rad, 45, 0x38bdf8);
      helpers.pushEvent(room, {
        kind: 'craterSlam',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x,
        y: actor.y + 0.3,
        z: actor.z,
        radius: rad,
        colorHex: 0x38bdf8,
        abilitySlot: 3,
        isCounter: true,
        hitStopMs: 55,
        callout: 'DIVINE SANCTUARY: SKY PILLARS!',
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - actor.x, t.z - actor.z);
        if (d <= rad) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage * 0.52, 3);
          if (helpers.applyHit(room, actor, t, calc.dmg, 20, 1.5, d > 0.05 ? (t.x - actor.x) / d : fx, d > 0.05 ? (t.z - actor.z) / d : fz, 0x38bdf8, true)) {
            t.y = Math.max(t.y, getMapTerrainHeight(room.mapId, t.x, t.z) + 2.4);
            t.yVel = 4.2;
            t.grounded = false;
            actor.landedCurrentAction = true;
          }
        }
      }
      const shatterDelay = AWAKENING_CONFIG.JM_DIVINE_NOVA_SHATTER_DELAY;
      actor.channelKind = 'jm_nova_slam';
      actor.channelDuration = shatterDelay;
      actor.channelTimer = shatterDelay;
      actor.channelTickTimer = shatterDelay;
      actor.channelStep = 0;
      actor.channelTargetX = actor.x;
      actor.channelTargetZ = actor.z;
      return;
    }
    if (slot === 4) {
      // Solar Dragon Beam Sky Auto-Combo!
      helpers.pushEvent(room, {
        kind: 'beam',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 1.1,
        y: actor.y + 1.25,
        z: actor.z + fz * 1.1,
        dirX: fx,
        dirZ: fz,
        colorHex: 0xfef08a,
        hitStopMs: 85,
        abilitySlot: 4,
        callout: 'SOLAR DRAGON BEAM!',
      });
      helpers.pushEvent(room, {
        kind: 'trenchPulse',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 1.1,
        y: actor.y + 0.3,
        z: actor.z + fz * 1.1,
        dirX: fx,
        dirZ: fz,
        radius: ab.range,
        colorHex: 0xfef08a,
        abilitySlot: 4,
      });
      let firstSkyTarget: AwakeningActor | null = null;
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const dx = t.x - actor.x;
        const dz = t.z - actor.z;
        const along = dx * fx + dz * fz;
        const perp = Math.abs(dx * -fz + dz * fx);
        if (along > 0 && along <= ab.range && perp <= 2.9 && Math.abs(t.y - actor.y) <= (actor.isFlying ? 9.5 : 3.2)) {
          const calc = helpers.computeDynamicDamage(actor, t, ab.damage * 0.72, 4);
          if (helpers.applyHit(room, actor, t, calc.dmg, ab.staggerDamage, actor.isFlying ? 12.0 : 2.5, fx, fz, 0xfef08a, true, false, true, calc.isCrit, calc.isBackstab)) {
            actor.landedCurrentAction = true;
            if (!firstSkyTarget && !t.isKO) {
              firstSkyTarget = t;
            }
          }
        }
      }
      if (firstSkyTarget && !actor.isFlying) {
        // Cancel beam end-lag, dash to target, launch into Skyward Uppercut!
        const destX = firstSkyTarget.x - fx * 1.35;
        const destZ = firstSkyTarget.z - fz * 1.35;
        const safe = resolveObstacleCollisions(room.mapId, destX, actor.y, destZ, 0.48, room.obstacles);
        actor.x = safe.x;
        actor.z = safe.z;
        clampActorToDomainBarrier(room, actor, 0.48);
        actor.rotY = Math.atan2(firstSkyTarget.x - actor.x, firstSkyTarget.z - actor.z);
        actor.channelKind = 'jm_sky_uppercut';
        actor.channelDuration = 0.38;
        actor.channelTimer = 0.38;
        actor.channelTickTimer = 0.1;
        actor.channelStep = 0;
        actor.channelTargetX = firstSkyTarget.x;
        actor.channelTargetZ = firstSkyTarget.z;
        actor.actionTimer = 0.38;
        actor.superArmor = true;
        actor.iframeTimer = Math.max(actor.iframeTimer, 0.5);
        actor.skyComboTargetId = firstSkyTarget.playerId;
        actor.skyComboMashes = 0;
        actor.skyComboStep = 0;
        actor.skyComboPrompt = false;
        firstSkyTarget.vx = 0;
        firstSkyTarget.vz = 0;
        applyDirectStun(firstSkyTarget, 1.1, true);
        helpers.pushEvent(room, {
          kind: 'skyComboStep',
          attackerId: actor.playerId,
          targetId: firstSkyTarget.playerId,
          fighterId: 'jm',
          x: firstSkyTarget.x,
          y: firstSkyTarget.y + 1.2,
          z: firstSkyTarget.z,
          dirX: fx,
          dirZ: fz,
          colorHex: 0xfef08a,
          abilitySlot: 4,
          comboStep: 1,
          callout: 'SKYWARD UPPERCUT!',
        });
      }
      return;
    }
    if (slot === 6) {
      const slot6Mode = resolveJmAwakenedSlot6Variant(actor.isFlying);
      if (slot6Mode === 'celestial_barrage') {
        // Airborne Slot 6: Celestial Barrage (Energy-Ball Machine Gun while hovering in Sky Flight!)
        const dur = AWAKENING_CONFIG.JM_AIR_BARRAGE_DURATION;
        actor.channelKind = 'jm_air_barrage';
        actor.channelDuration = dur;
        actor.channelTimer = dur;
        actor.channelTickTimer = 0.01;
        actor.channelStep = 0;
        actor.channelTargetX = aimPt.x;
        actor.channelTargetZ = aimPt.z;
        helpers.pushEvent(room, {
          kind: 'chargeAura',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x,
          y: actor.y + 1.2,
          z: actor.z,
          radius: 3.4,
          colorHex: 0x38bdf8,
          abilitySlot: 6,
          callout: 'CELESTIAL BARRAGE!',
        });
        actor.landedCurrentAction = true;
        return;
      }

      // Grounded Slot 6: 0.4s charge-up -> 5.0s Steerable V-Trench Super Kamehameha!
      const chargeDur = AWAKENING_CONFIG.JM_KAMEHAMEHA_CHARGE_SEC;
      actor.channelKind = 'jm_kamehameha_charge';
      actor.channelDuration = chargeDur;
      actor.channelTimer = chargeDur;
      actor.channelTickTimer = 0.05;
      actor.channelStep = 0;
      actor.channelTargetX = actor.x + fx * AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE;
      actor.channelTargetZ = actor.z + fz * AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE;
      helpers.pushEvent(room, {
        kind: 'chargeAura',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 0.85,
        y: actor.y + 1.2,
        z: actor.z + fz * 0.85,
        dirX: fx,
        dirZ: fz,
        radius: 4.5,
        colorHex: 0xfef08a,
        abilitySlot: 6,
        callout: 'KAMEHAMEHA... CHARGE!',
      });
      actor.landedCurrentAction = true;
      return;
    }
  }
}

export function tickAwakenedChannel(
  room: AwakeningRoomState,
  actor: AwakeningActor,
  dt: number,
  helpers: AwakeningHostHelpers
): void {
  if (!actor.channelKind || actor.isKO) {
    if (actor.channelKind === 'marjohn_typhoon') {
      landMarjohnFlight(actor);
    }
    actor.channelKind = null;
    actor.channelTimer = 0;
    actor.skyComboPrompt = false;
    actor.skyComboTargetId = null;
    return;
  }

  const kind = actor.channelKind;
  actor.channelTimer = Math.max(0, actor.channelTimer - dt);
  actor.channelTickTimer -= dt;

  // Steering logic for beam / barrage / gun-fan ultimates
  if (
    kind === 'jm_kamehameha_charge' ||
    kind === 'jm_kamehameha' ||
    kind === 'jm_air_barrage' ||
    kind === 'damen_arsenal'
  ) {
    const steerRate = kind === 'jm_kamehameha' ? 1.35 : kind === 'jm_kamehameha_charge' ? 2.4 : 1.85;
    if (kind !== 'jm_air_barrage' && (Math.abs(actor.moveX) > 0.08 || Math.abs(actor.moveZ) > 0.08)) {
      const targetYaw = Math.atan2(actor.moveX, actor.moveZ);
      const diff = normalizeAng(targetYaw - actor.rotY);
      const maxStep = steerRate * dt;
      actor.rotY += clamp(diff, -maxStep, maxStep);
    } else if (!actor.isBot && Number.isFinite(actor.aimYaw)) {
      const diff = normalizeAng(actor.aimYaw - actor.rotY);
      if (Math.abs(diff) > 0.06) {
        const maxStep = steerRate * 0.85 * dt;
        actor.rotY += clamp(diff, -maxStep, maxStep);
      }
    }
    const rfx = Math.sin(actor.rotY);
    const rfz = Math.cos(actor.rotY);
    if (kind !== 'jm_air_barrage') {
      actor.channelTargetX = actor.x + rfx * 24.0;
      actor.channelTargetZ = actor.z + rfz * 24.0;
    } else if (actor.pendingAimX !== null && actor.pendingAimZ !== null) {
      actor.channelTargetX = actor.pendingAimX;
      actor.channelTargetZ = actor.pendingAimZ;
    }
  }

  if (kind === 'jm_kamehameha_charge') {
    if (actor.channelTimer <= 0) {
      const fx = Math.sin(actor.rotY);
      const fz = Math.cos(actor.rotY);
      const dur = AWAKENING_CONFIG.JM_KAMEHAMEHA_DURATION;
      actor.channelKind = 'jm_kamehameha';
      actor.channelDuration = dur;
      actor.channelTimer = dur;
      actor.channelTickTimer = 0.01;
      actor.channelStep = 0;
      actor.channelTargetX = actor.x + fx * AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE;
      actor.channelTargetZ = actor.z + fz * AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE;
      actor.actionTimer = Math.max(actor.actionTimer, dur);
      helpers.pushEvent(room, {
        kind: 'beam',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 1.2,
        y: actor.y + 1.3,
        z: actor.z + fz * 1.2,
        dirX: fx,
        dirZ: fz,
        radius: AWAKENING_CONFIG.JM_KAMEHAMEHA_WIDTH,
        colorHex: 0x38bdf8,
        hitStopMs: 95,
        abilitySlot: 6,
        callout: 'SUPER KAMEHAMEHA!',
      });
      helpers.pushEvent(room, {
        kind: 'trenchPulse',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 1.2,
        y: actor.y + 0.3,
        z: actor.z + fz * 1.2,
        dirX: fx,
        dirZ: fz,
        radius: AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE,
        colorHex: 0x38bdf8,
        abilitySlot: 6,
      });
      return;
    }
  } else if (kind === 'jm_kamehameha') {
    const fx = Math.sin(actor.rotY);
    const fz = Math.cos(actor.rotY);
    const range = AWAKENING_CONFIG.JM_KAMEHAMEHA_RANGE;
    const width = AWAKENING_CONFIG.JM_KAMEHAMEHA_WIDTH;
    if (actor.channelTickTimer <= 0) {
      actor.channelTickTimer = 0.2;
      actor.channelStep += 1;
      if (actor.channelStep % 2 === 0) {
        helpers.pushEvent(room, {
          kind: 'trenchPulse',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x + fx * 1.2,
          y: actor.y + 0.3,
          z: actor.z + fz * 1.2,
          dirX: fx,
          dirZ: fz,
          radius: range,
          colorHex: 0x38bdf8,
          abilitySlot: 6,
        });
      }
      for (const obs of room.obstacles) {
        if (obs.destroyed || !obs.destructible) continue;
        if (isPointInBeamCorridor(obs.x, obs.z, actor.x, actor.z, fx, fz, range, width + Math.max(obs.halfW, obs.halfD))) {
          helpers.damageObstacle(room, obs, 999, obs.x, obs.topY * 0.5, obs.z, 0x38bdf8);
        }
      }
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        if (isPointInBeamCorridor(t.x, t.z, actor.x, actor.z, fx, fz, range, width)) {
          const calc = helpers.computeDynamicDamage(actor, t, 5, 6);
          if (helpers.applyHit(room, actor, t, calc.dmg, 8, 1.5, fx, fz, 0x38bdf8, false, false, true, true, calc.isBackstab)) {
            applyDirectStun(t, 0.45, true);
            actor.landedCurrentAction = true;
          }
        }
      }
    }
  } else if (kind === 'jm_air_barrage') {
    if (actor.channelTickTimer <= 0) {
      actor.channelTickTimer = AWAKENING_CONFIG.JM_AIR_BARRAGE_INTERVAL;
      actor.channelStep += 1;
      const fx = Math.sin(actor.rotY);
      const fz = Math.cos(actor.rotY);
      let aimX = actor.pendingAimX ?? actor.x + fx * 8.5;
      let aimZ = actor.pendingAimZ ?? actor.z + fz * 8.5;
      const tgt = helpers.findPreferredTarget(room, actor, 24.0);
      if (tgt && actor.pendingAimX === null) {
        aimX = tgt.x;
        aimZ = tgt.z;
      }
      const jitterX = Math.sin(actor.channelStep * 2.3) * 1.15;
      const jitterZ = Math.cos(actor.channelStep * 1.9) * 1.15;
      const tx = aimX + jitterX;
      const tz = aimZ + jitterZ;
      const ty = getMapTerrainHeight(room.mapId, tx, tz) + 0.65;
      const dx = tx - actor.x;
      const dy = ty - (actor.y + 1.1);
      const dz = tz - actor.z;
      const len = Math.max(0.01, Math.hypot(dx, dy, dz));
      const spd = 32.0;
      const sideOff = actor.channelStep % 2 === 0 ? 0.55 : -0.55;
      const rx = -fz * sideOff;
      const rz = fx * sideOff;
      room.projectiles.push({
        id: helpers.makeId('proj'),
        ownerId: actor.playerId,
        fighterId: 'jm',
        skinId: actor.skinId,
        kind: 'jmBolt',
        x: actor.x + (dx / len) * 0.9 + rx,
        y: actor.y + 1.1,
        z: actor.z + (dz / len) * 0.9 + rz,
        vx: (dx / len) * spd,
        vy: (dy / len) * spd,
        vz: (dz / len) * spd,
        rotY: Math.atan2(dx, dz),
        colorHex: actor.channelStep % 2 === 0 ? 0xfef08a : 0x38bdf8,
        originX: actor.x,
        originY: actor.y + 1.1,
        originZ: actor.z,
        targetX: tx,
        targetY: ty,
        targetZ: tz,
        isOverdrive: true,
        age: 0,
        maxAge: 0.72,
        maxRange: 26.0,
        damage: 4,
        staggerDamage: 8,
        knockback: 1.8,
        hitIds: new Set(),
      });
    }
  } else if (kind === 'jm_nova_slam') {
    const rad = AWAKENING_CONFIG.JM_DIVINE_NOVA_RADIUS + 0.6;
    // Keep caught enemies suspended in mid-air during the 0.6s pillar channel!
    for (const t of room.actors) {
      if (t.playerId === actor.playerId || t.isKO) continue;
      const d = Math.hypot(t.x - actor.channelTargetX, t.z - actor.channelTargetZ);
      if (d <= rad + 0.8 && !t.grounded) {
        const targetLiftY = getMapTerrainHeight(room.mapId, t.x, t.z) + 2.95;
        t.yVel = (targetLiftY - t.y) * 6.5;
      }
    }
    if (actor.channelTimer <= 0) {
      const fx = Math.sin(actor.rotY);
      const fz = Math.cos(actor.rotY);
      const spikePt =
        actor.pendingAimX !== null && actor.pendingAimZ !== null
          ? { x: actor.pendingAimX, z: actor.pendingAimZ }
          : { x: actor.x + fx * 2.2, z: actor.z + fz * 2.2 };
      helpers.damageObstaclesInArea(room, actor.x, actor.z, rad, 55, 0xfef08a);
      helpers.pushEvent(room, {
        kind: 'pillarShatter',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x,
        y: actor.y + 0.3,
        z: actor.z,
        radius: rad,
        colorHex: 0xfef08a,
        abilitySlot: 3,
        hitStopMs: 80,
        callout: 'SANCTUARY NOVA SHATTER!',
      });
      helpers.pushEvent(room, {
        kind: 'craterSlam',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: spikePt.x,
        y: getMapTerrainHeight(room.mapId, spikePt.x, spikePt.z) + 0.3,
        z: spikePt.z,
        radius: rad * 0.72,
        colorHex: 0x38bdf8,
        abilitySlot: 3,
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - actor.x, t.z - actor.z);
        if (d <= rad + 0.8) {
          const safeSpike = resolveObstacleCollisions(
            room.mapId,
            spikePt.x + (Math.random() - 0.5) * 0.6,
            0.2,
            spikePt.z + (Math.random() - 0.5) * 0.6,
            0.48,
            room.obstacles
          );
          const calc = helpers.computeDynamicDamage(actor, t, 18, 3);
          if (helpers.applyHit(room, actor, t, calc.dmg, 30, 1.8, fx, fz, 0xfef08a, true)) {
            t.x = safeSpike.x;
            t.z = safeSpike.z;
            t.y = getMapTerrainHeight(room.mapId, safeSpike.x, safeSpike.z) + 0.32;
            t.yVel = 4.4;
            t.grounded = false;
            t.vx = 0;
            t.vz = 0;
            applyDirectStun(t, 0.68, false);
            actor.landedCurrentAction = true;
          }
        }
      }
      actor.channelKind = null;
      return;
    }
  } else if (kind === 'jm_sky_uppercut') {
    const tgt = room.actors.find((a) => a.playerId === actor.skyComboTargetId && !a.isKO);
    if (!tgt) {
      actor.skyComboPrompt = false;
      actor.skyComboTargetId = null;
      actor.channelKind = null;
      return;
    }
    const peakY = getMapTerrainHeight(room.mapId, tgt.x, tgt.z) + 7.4;
    const progress = clamp(1 - actor.channelTimer / Math.max(0.01, actor.channelDuration), 0, 1);
    const curY = actor.y + (peakY - actor.y) * Math.min(1, dt * 11.0);
    actor.y = Math.min(peakY, curY);
    tgt.y = Math.min(peakY + 0.35, tgt.y + (peakY - tgt.y) * Math.min(1, dt * 12.0));
    actor.yVel = 0;
    tgt.yVel = 0;
    actor.grounded = false;
    tgt.grounded = false;
    const fx = Math.sin(actor.rotY);
    const fz = Math.cos(actor.rotY);
    tgt.x = actor.x + fx * 1.35;
    tgt.z = actor.z + fz * 1.35;
    if (progress > 0.1 && actor.channelStep === 0) {
      actor.channelStep = 1;
      helpers.pushEvent(room, {
        kind: 'crescentSlash',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: tgt.x,
        y: tgt.y + 0.9,
        z: tgt.z,
        dirX: fx,
        dirZ: fz,
        radius: 2.4,
        colorHex: 0xfef08a,
        abilitySlot: 4,
      });
    }
    if (actor.channelTimer <= 0) {
      actor.channelKind = 'jm_sky_peak';
      actor.channelDuration = 0.95;
      actor.channelTimer = 0.95;
      actor.channelTickTimer = 0.25;
      actor.channelStep = 0;
      actor.skyComboPrompt = true;
      actor.skyComboMashes = 0;
      actor.actionTimer = 0.95;
      return;
    }
  } else if (kind === 'jm_sky_peak') {
    const tgt = room.actors.find((a) => a.playerId === actor.skyComboTargetId && !a.isKO);
    if (!tgt) {
      actor.skyComboPrompt = false;
      actor.skyComboTargetId = null;
      actor.channelKind = null;
      return;
    }
    const peakY = getMapTerrainHeight(room.mapId, tgt.x, tgt.z) + 7.4;
    actor.y = peakY;
    tgt.y = peakY + 0.25;
    actor.yVel = 0;
    tgt.yVel = 0;
    actor.grounded = false;
    tgt.grounded = false;
    const fx = Math.sin(actor.rotY);
    const fz = Math.cos(actor.rotY);
    tgt.x = actor.x + fx * 1.35;
    tgt.z = actor.z + fz * 1.35;
    if (actor.isBot && actor.channelTickTimer <= 0) {
      actor.channelTickTimer = 0.18;
      actor.skyComboMashes = (actor.skyComboMashes ?? 0) + 1;
    }
    if (actor.channelTimer <= 0) {
      actor.skyComboPrompt = false;
      const outcome = resolveSkyAutoComboOutcome(actor.skyComboMashes ?? 0, 2);
      if (outcome === 'aerial_finisher') {
        actor.channelKind = 'jm_sky_finisher';
        actor.channelDuration = 1.05;
        actor.channelTimer = 1.05;
        actor.channelTickTimer = 0.01;
        actor.channelStep = 0;
        actor.actionTimer = 1.05;
        return;
      }
      actor.skyComboTargetId = null;
      actor.channelKind = null;
      return;
    }
  } else if (kind === 'jm_sky_finisher') {
    const tgt = room.actors.find((a) => a.playerId === actor.skyComboTargetId && !a.isKO);
    if (!tgt) {
      actor.skyComboPrompt = false;
      actor.skyComboTargetId = null;
      actor.channelKind = null;
      return;
    }
    const fx = Math.sin(actor.rotY);
    const fz = Math.cos(actor.rotY);
    if (actor.channelStep < 3) {
      const hoverY = getMapTerrainHeight(room.mapId, tgt.x, tgt.z) + 7.2;
      actor.y = hoverY;
      tgt.y = hoverY + 0.2;
      actor.yVel = 0;
      tgt.yVel = 0;
      tgt.x = actor.x + fx * 1.35;
      tgt.z = actor.z + fz * 1.35;
    }
    if (actor.channelTickTimer <= 0) {
      actor.channelTickTimer = 0.26;
      const step = actor.channelStep;
      actor.channelStep += 1;
      actor.skyComboStep = step + 1;
      if (step === 0 || step === 1) {
        const dmgCalc = helpers.computeDynamicDamage(actor, tgt, 8, 4);
        helpers.applyHit(room, actor, tgt, dmgCalc.dmg, 10, 0.2, fx, fz, 0xfef08a, false);
        applyDirectStun(tgt, 0.55, true);
        helpers.pushEvent(room, {
          kind: 'crescentSlash',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: tgt.x,
          y: tgt.y + 0.9,
          z: tgt.z,
          dirX: fx,
          dirZ: fz,
          radius: 2.3,
          colorHex: step === 0 ? 0xfef08a : 0x38bdf8,
          abilitySlot: 4,
          comboStep: (step + 1) as 1 | 2,
          callout: step === 0 ? 'AERIAL PUNCH!' : 'SKY KICK!',
        });
      } else if (step === 2) {
        const dmgCalc = helpers.computeDynamicDamage(actor, tgt, 10, 4);
        helpers.applyHit(room, actor, tgt, dmgCalc.dmg, 14, 0.3, fx, fz, 0x38bdf8, true);
        applyDirectStun(tgt, 0.55, true);
        helpers.pushEvent(room, {
          kind: 'beam',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x + fx * 0.65,
          y: actor.y + 1.0,
          z: actor.z + fz * 0.65,
          dirX: fx,
          dirZ: fz,
          radius: 1.6,
          colorHex: 0x38bdf8,
          abilitySlot: 4,
          comboStep: 3,
          callout: 'POINT-BLANK KAMEHAMEHA!',
        });
      } else {
        // Step 3: High-speed Dash Downslam!
        const floorY = getMapTerrainHeight(room.mapId, tgt.x, tgt.z);
        actor.y = floorY + 0.35;
        tgt.y = floorY + 0.3;
        actor.yVel = 0;
        tgt.yVel = 4.6;
        tgt.grounded = false;
        const dmgCalc = helpers.computeDynamicDamage(actor, tgt, 16, 4);
        helpers.applyHit(room, actor, tgt, dmgCalc.dmg, 24, 3.0, fx, fz, 0xfef08a, true, false, true, true);
        applyDirectStun(tgt, 0.72, true);
        helpers.pushEvent(room, {
          kind: 'craterSlam',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: tgt.x,
          y: floorY + 0.3,
          z: tgt.z,
          radius: 5.0,
          colorHex: 0xfef08a,
          abilitySlot: 4,
          isCounter: true,
          hitStopMs: 95,
          callout: 'CELESTIAL DOWNSLAM!',
        });
        actor.skyComboTargetId = null;
        actor.channelTimer = 0;
      }
    }
  } else if (kind === 'khen_domain') {
    const cx = actor.channelTargetX;
    const cz = actor.channelTargetZ;
    const rad = AWAKENING_CONFIG.KHEN_OMNISLASH_RADIUS;
    if (actor.channelTickTimer <= 0) {
      actor.channelTickTimer = 0.32;
      const step = actor.channelStep;
      actor.channelStep += 1;
      const isFinal = actor.channelTimer <= 0.34;
      if (!isFinal) {
        const angle = (step * Math.PI) / 3 + 0.35;
        const hopX = cx + Math.cos(angle) * (rad * 0.78);
        const hopZ = cz + Math.sin(angle) * (rad * 0.78);
        const safe = resolveObstacleCollisions(room.mapId, hopX, actor.y, hopZ, 0.48, room.obstacles);
        actor.x = safe.x;
        actor.z = safe.z;
        clampActorToDomainBarrier(room, actor, 0.48);
        actor.rotY = Math.atan2(cx - actor.x, cz - actor.z);
      } else {
        const safe = resolveObstacleCollisions(room.mapId, cx, actor.y, cz, 0.48, room.obstacles);
        actor.x = safe.x;
        actor.z = safe.z;
        clampActorToDomainBarrier(room, actor, 0.48);
      }
      helpers.damageObstaclesInArea(room, cx, cz, rad, isFinal ? 95 : 22, 0xa855f7);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'khen',
        x: cx,
        y: 0.45,
        z: cz,
        radius: isFinal ? rad : rad * 0.7,
        colorHex: isFinal ? 0xe879f9 : 0xa855f7,
        abilitySlot: 6,
        hitStopMs: isFinal ? 95 : 15,
        callout: isFinal ? 'ECLIPSE DOMAIN DETONATION!' : undefined,
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - cx, t.z - cz);
        if (d <= rad) {
          const dmg = isFinal ? 16 : 6;
          const calc = helpers.computeDynamicDamage(actor, t, dmg, 6);
          if (helpers.applyHit(room, actor, t, calc.dmg, isFinal ? 36 : 10, isFinal ? 12.0 : -3.5, d > 0.05 ? (t.x - cx) / d : 0, d > 0.05 ? (t.z - cz) / d : 1, 0xa855f7, isFinal, !isFinal, isFinal, true, calc.isBackstab)) {
            applyDirectStun(t, isFinal ? 0.75 : 0.45, isFinal);
            actor.landedCurrentAction = true;
          }
        }
      }
    }
  } else if (kind === 'damen_arsenal') {
    const fx = Math.sin(actor.rotY);
    const fz = Math.cos(actor.rotY);
    const range = 20.0;
    const minCos = Math.cos(AWAKENING_CONFIG.DAMEN_ARSENAL_CONE_HALF);
    if (actor.channelTickTimer <= 0) {
      actor.channelTickTimer = 0.2;
      const isFinal = actor.channelTimer <= 0.22;
      const step = actor.channelStep;
      actor.channelStep += 1;
      // Spawn visual spectral fan tracers (damage is resolved cleanly once per tick by the fan cone below)
      const offsets = [-0.6, -0.3, 0, 0.3, 0.6];
      const jitter = ((step % 3) - 1) * 0.06;
      for (let i = 0; i < offsets.length; i++) {
        const ang = actor.rotY + offsets[i] + jitter;
        room.projectiles.push({
          id: helpers.makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'damen',
          skinId: actor.skinId,
          kind: i % 2 === 0 ? 'solarRailgun' : 'magnum',
          x: actor.x + Math.sin(ang) * 1.15,
          y: actor.y + 1.25 + (i % 2) * 0.25,
          z: actor.z + Math.cos(ang) * 1.15,
          vx: Math.sin(ang) * 38.0,
          vz: Math.cos(ang) * 38.0,
          rotY: ang,
          colorHex: 0xfef08a,
          originX: actor.x,
          originY: actor.y + 1.25,
          originZ: actor.z,
          isOverdrive: true,
          visualOnly: true,
          pierceObstacles: true,
          age: 0,
          maxAge: 0.45,
          maxRange: range,
          damage: 0,
          staggerDamage: 0,
          knockback: 0,
          hitIds: new Set(),
        });
      }
      // Shred obstacles inside fan cone
      for (const obs of room.obstacles) {
        if (obs.destroyed || !obs.destructible) continue;
        if (isPointInFanCone(obs.x, obs.z, actor.x, actor.z, fx, fz, range, minCos)) {
          helpers.damageObstacle(room, obs, 32, obs.x, obs.topY * 0.5, obs.z, 0xfacc15);
        }
      }
      // Damage enemies cleanly across the wide fan cone without double-dipping projectile hits
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        if (isPointInFanCone(t.x, t.z, actor.x, actor.z, fx, fz, range, minCos)) {
          const tickBase = isFinal ? 12 : 4;
          const calc = helpers.computeDynamicDamage(actor, t, tickBase, 6);
          if (helpers.applyHit(room, actor, t, calc.dmg, isFinal ? 22 : 5, isFinal ? 10.5 : 3.2, fx, fz, 0xfef08a, isFinal, false, true, isFinal, calc.isBackstab)) {
            actor.landedCurrentAction = true;
          }
        }
      }
    }
  } else if (kind === 'marjohn_typhoon') {
    const rad = AWAKENING_CONFIG.MARJOHN_TYPHOON_RADIUS;
    // Update storm zone to follow Marjohn if he drifts slightly
    const tZone = room.zones.find((z) => z.ownerId === actor.playerId && z.kind === 'typhoonUltimate');
    if (tZone) {
      tZone.x = actor.x;
      tZone.z = actor.z;
    }
    // Continuously pull/suck nearby enemies inward toward typhoon eye
    for (const t of room.actors) {
      if (t.playerId === actor.playerId || t.isKO) continue;
      if (areActorsAllied(actor, t, room.gameMode ?? 'classic')) continue;
      const dx = actor.x - t.x;
      const dz = actor.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d <= rad && d > 0.35) {
        t.vx += (dx / d) * (AWAKENING_CONFIG.MARJOHN_TYPHOON_PULL * 1.25) * dt;
        t.vz += (dz / d) * (AWAKENING_CONFIG.MARJOHN_TYPHOON_PULL * 1.25) * dt;
      }
    }
    if (actor.channelTickTimer <= 0) {
      actor.channelTickTimer = 0.2;
      const isFinal = actor.channelTimer <= 0.28;
      helpers.damageObstaclesInArea(room, actor.x, actor.z, rad, isFinal ? 80 : 18, 0x22d3ee);
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const dx = actor.x - t.x;
        const dz = actor.z - t.z;
        const d = Math.hypot(dx, dz);
        if (d <= rad) {
          const calc = helpers.computeDynamicDamage(actor, t, isFinal ? 14 : 4, 6);
          if (helpers.applyHit(room, actor, t, calc.dmg, isFinal ? 30 : 8, isFinal ? 12.0 : -4.5, d > 0.05 ? dx / d : 0, d > 0.05 ? dz / d : 1, 0x22d3ee, isFinal, !isFinal, isFinal, isFinal, calc.isBackstab)) {
            actor.landedCurrentAction = true;
            if (isFinal) {
              t.yVel = Math.max(t.yVel, 10.8);
              t.grounded = false;
            }
          }
        }
      }
    }
  } else if (kind === 'prime_meteor') {
    const rad = AWAKENING_CONFIG.PRIME_METEOR_RADIUS;
    actor.channelTargetX = actor.x;
    actor.channelTargetZ = actor.z;
    if (actor.channelTickTimer <= 0) {
      actor.channelTickTimer = 0.22;
      const isFinal = actor.channelTimer <= 0.24;
      const hitX = actor.x + (isFinal ? 0 : (Math.random() - 0.5) * 2.2);
      const hitZ = actor.z + (isFinal ? 0 : (Math.random() - 0.5) * 2.2);
      const groundY = getMapTerrainHeight(room.mapId, hitX, hitZ);
      helpers.spawnZone(room, actor, 'meteorCrater', hitX, groundY, hitZ, rad, 1.4, 0xf43f5e);
      helpers.damageObstaclesInArea(room, hitX, hitZ, rad, isFinal ? 110 : 32, 0xf43f5e);
      helpers.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'prime',
        x: hitX,
        y: groundY + 0.25,
        z: hitZ,
        radius: isFinal ? rad * 1.35 : rad,
        colorHex: isFinal ? 0xfef08a : 0xf43f5e,
        abilitySlot: 6,
        hitStopMs: isFinal ? 95 : 15,
        callout: isFinal ? 'METEOR CATACLYSM SLAM!' : undefined,
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        const d = Math.hypot(t.x - hitX, t.z - hitZ);
        if (d <= (isFinal ? rad * 1.25 : rad)) {
          const calc = helpers.computeDynamicDamage(actor, t, isFinal ? 18 : 6, 6);
          if (helpers.applyHit(room, actor, t, calc.dmg, isFinal ? 36 : 10, isFinal ? 13.5 : 4.0, d > 0.05 ? (t.x - hitX) / d : 0, d > 0.05 ? (t.z - hitZ) / d : 1, 0xf43f5e, isFinal, false, isFinal, true, calc.isBackstab)) {
            actor.landedCurrentAction = true;
          }
        }
      }
    }
  } else if (kind === 'prime_asura_slams') {
    const rad = 4.6;
    if (actor.channelTickTimer <= 0 && actor.channelStep < 3) {
      const step = actor.channelStep;
      actor.channelStep += 1;
      actor.channelTickTimer = 0.34;
      const isThird = step >= 2;
      const slamX = isThird ? actor.channelTargetX : actor.x + Math.sin(actor.rotY) * 1.1;
      const slamZ = isThird ? actor.channelTargetZ : actor.z + Math.cos(actor.rotY) * 1.1;
      const slamY = getMapTerrainHeight(room.mapId, slamX, slamZ);
      helpers.damageObstaclesInArea(room, slamX, slamZ, rad, isThird ? 75 : 35, isThird ? 0xf97316 : 0xf43f5e);
      helpers.pushEvent(room, {
        kind: 'asuraSlam',
        attackerId: actor.playerId,
        fighterId: 'prime',
        skinId: actor.skinId,
        x: slamX,
        y: slamY + 0.25,
        z: slamZ,
        radius: isThird ? 5.2 : rad,
        colorHex: isThird ? 0xf97316 : 0xf43f5e,
        abilitySlot: 7,
        hitStopMs: isThird ? 85 : 35,
        callout: isThird ? 'VOLCANO ERUPTION!' : undefined,
      });
      for (const t of room.actors) {
        if (t.playerId === actor.playerId || t.isKO) continue;
        if (areActorsAllied(actor, t, room.gameMode ?? 'classic')) continue;
        const d = Math.hypot(t.x - slamX, t.z - slamZ);
        if (d <= (isThird ? 5.2 : rad)) {
          const calc = helpers.computeDynamicDamage(actor, t, isThird ? 16 : 12, 7);
          if (helpers.applyHit(room, actor, t, calc.dmg, 20, isThird ? 11.5 : 7.5, d > 0.05 ? (t.x - slamX) / d : 0, d > 0.05 ? (t.z - slamZ) / d : 1, 0xf97316, true, false, false, isThird, calc.isBackstab)) {
            actor.landedCurrentAction = true;
            if (isThird) {
              t.yVel = Math.max(t.yVel, 7.2);
              t.grounded = false;
            }
          }
        }
      }
      if (isThird) {
        helpers.spawnPrimeVolcanoTurret?.(room, actor, actor.channelTargetX, actor.channelTargetZ);
        actor.channelTimer = 0;
      }
    }
  }

  if (actor.channelTimer <= 0) {
    if (kind === 'marjohn_typhoon') {
      landMarjohnFlight(actor);
    }
    actor.channelKind = null;
    actor.channelTimer = 0;
    actor.channelDuration = 0;
    actor.channelStep = 0;
    actor.actionTimer = Math.min(actor.actionTimer, 0.04);
    actor.superArmor = false;
  }
}

export function tickAwakenedZoneBehavior(
  room: AwakeningRoomState,
  z: AwakeningRoomState['zones'][number],
  owner: AwakeningActor,
  dt: number,
  helpers: AwakeningHostHelpers
): void {
  if (z.kind === 'maelstromTornado') {
    for (const target of room.actors) {
      if (target.playerId === z.ownerId || target.isKO) continue;
      if (areActorsAllied(owner, target, room.gameMode ?? 'classic')) continue;
      const dx = z.x - target.x;
      const dz = z.z - target.z;
      const d = Math.hypot(dx, dz);
      if (d <= z.radius && d > 0.25) {
        target.vx += (dx / d) * AWAKENING_CONFIG.MARJOHN_MAELSTROM_PULL * dt;
        target.vz += (dz / d) * AWAKENING_CONFIG.MARJOHN_MAELSTROM_PULL * dt;
      }
    }
    if (z.tickTimer >= 0.45) {
      z.tickTimer = 0;
      for (const target of room.actors) {
        if (target.playerId === z.ownerId || target.isKO) continue;
        if (Math.hypot(target.x - z.x, target.z - z.z) <= z.radius) {
          helpers.applyHit(room, owner, target, 4, 8, 2.0, 0, 0, z.colorHex, false, true);
        }
      }
    }
    if (z.remaining <= dt * 1.5 && !z.triggered) {
      z.triggered = true;
      for (const target of room.actors) {
        if (target.playerId === z.ownerId || target.isKO) continue;
        if (Math.hypot(target.x - z.x, target.z - z.z) <= z.radius) {
          helpers.applyHit(room, owner, target, 12, 22, 6.0, 0, 1, z.colorHex, true);
          target.yVel = Math.max(target.yVel, 8.8);
          target.grounded = false;
        }
      }
    }
  } else if (z.kind === 'shadowRift' && !z.triggered && z.remaining <= 0.25) {
    z.triggered = true;
    helpers.pushEvent(room, {
      kind: 'shockwave',
      attackerId: owner.playerId,
      fighterId: 'khen',
      x: z.x,
      y: 0.3,
      z: z.z,
      radius: z.radius,
      colorHex: 0xa855f7,
    });
    for (const target of room.actors) {
      if (target.playerId === z.ownerId || target.isKO) continue;
      const d = Math.hypot(target.x - z.x, target.z - z.z);
      if (d <= z.radius) {
        helpers.applyHit(room, owner, target, 14, 24, 7.5, d > 0.05 ? (target.x - z.x) / d : 0, d > 0.05 ? (target.z - z.z) / d : 1, 0xa855f7, true);
      }
    }
  } else if (z.kind === 'magmaBranch') {
    if (z.tickTimer >= 0.48) {
      z.tickTimer = 0;
      for (const target of room.actors) {
        if (target.playerId === z.ownerId || target.isKO) continue;
        if (Math.hypot(target.x - z.x, target.z - z.z) <= z.radius) {
          helpers.applyHit(room, owner, target, 4, 8, 1.5, 0, 0, 0xf97316, false);
        }
      }
    }
  } else if (z.kind === 'divineNova' || z.kind === 'icePillarNova') {
    if (Math.hypot(owner.x - z.x, owner.z - z.z) <= z.radius && !owner.isKO) {
      owner.hp = Math.min(owner.maxHp, owner.hp + 7.5 * dt);
    }
  }
}
