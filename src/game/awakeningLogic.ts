import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';
import type {
  AbilitySlot,
  AbilitySpec,
  MapId,
  MatchAwakeningPhase,
  ObstacleState,
} from '../shared/gameData.ts';
import { getObstacleSupportY, pointHitsObstacle } from '../shared/gameData.ts';
import {
  MAP_TACTICAL_ORB_CANDIDATES,
  evaluateTerrainZonesAt,
} from './mapLogic.ts';

export function shouldSpawnAwakeningOrbs(params: {
  isTrainingMode: boolean;
  phase: MatchAwakeningPhase;
  initialActorCount: number;
  aliveCount: number;
  matchTime: number;
  countdownRemaining?: number | null;
}): boolean {
  if (params.isTrainingMode) return false;
  if (params.phase !== 'PRE_AWAKENING') return false;
  if (params.aliveCount < 2) return false;
  // 1v1 / 2-player match triggers automatically at 1:30 (90s)
  if (params.initialActorCount <= 2) {
    return params.matchTime >= AWAKENING_CONFIG.TWO_PLAYER_SPAWN_TIME_SEC;
  }
  // 3+ player match triggers 30s countdown when reduced to 2 survivors, spawning once timer hits 0
  return (
    params.aliveCount === AWAKENING_CONFIG.MULTI_PLAYER_ALIVE_TRIGGER &&
    params.countdownRemaining !== null &&
    params.countdownRemaining !== undefined &&
    params.countdownRemaining <= 0
  );
}

function isOrbSpotClear(
  mapId: MapId,
  obstacles: ObstacleState[],
  arenaRadius: number,
  px: number,
  pz: number
): boolean {
  if (Math.hypot(px, pz) > arenaRadius - 2.0) return false;
  const terr = evaluateTerrainZonesAt(mapId, px, 0, pz);
  if (terr.inLava) return false;
  const offsets = [
    [0, 0],
    [1.2, 0],
    [-1.2, 0],
    [0, 1.2],
    [0, -1.2],
  ];
  for (const [ox, oz] of offsets) {
    if (pointHitsObstacle(mapId, px + ox, 0.8, pz + oz, obstacles)) {
      return false;
    }
  }
  return true;
}

export function findFarthestValidOrbPair(
  mapId: MapId,
  obstacles: ObstacleState[],
  arenaRadius: number
): [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] {
  const maxR = Math.max(8, arenaRadius - AWAKENING_CONFIG.ORB_EDGE_MARGIN);
  const candidateRadii = [maxR, maxR * 0.85, maxR * 0.7, maxR * 0.55];
  const angleSteps = 18; // every 10 deg across half circle -> mirrored pair

  let bestDistSq = -1;
  let bestPair: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] = [
    { x: -maxR * 0.75, y: AWAKENING_CONFIG.ORB_HOVER_HEIGHT, z: 0 },
    { x: maxR * 0.75, y: AWAKENING_CONFIG.ORB_HOVER_HEIGHT, z: 0 },
  ];

  for (const r of candidateRadii) {
    for (let i = 0; i < angleSteps; i++) {
      const ang = (i / angleSteps) * Math.PI;
      const ax = Number((Math.cos(ang) * r).toFixed(2));
      const az = Number((Math.sin(ang) * r).toFixed(2));
      const bx = -ax;
      const bz = -az;
      if (!isOrbSpotClear(mapId, obstacles, arenaRadius, ax, az) || !isOrbSpotClear(mapId, obstacles, arenaRadius, bx, bz)) {
        continue;
      }
      const distSq = (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
      if (distSq > bestDistSq) {
        bestDistSq = distSq;
        const supA = getObstacleSupportY(mapId, ax, 0, az, 0.5, obstacles);
        const supB = getObstacleSupportY(mapId, bx, 0, bz, 0.5, obstacles);
        bestPair = [
          { x: ax, y: supA + AWAKENING_CONFIG.ORB_HOVER_HEIGHT, z: az },
          { x: bx, y: supB + AWAKENING_CONFIG.ORB_HOVER_HEIGHT, z: bz },
        ];
      }
    }
    if (bestDistSq > 0) break;
  }

  return bestPair;
}

/**
 * Selects a varied tactical Awakening Orb pair across buildings, bridges, high ground,
 * hazard edges, and side alleys so orbs spawn organically across the whole arena.
 */
export function selectTacticalOrbPair(
  mapId: MapId,
  obstacles: ObstacleState[],
  arenaRadius: number,
  seedHint = 0
): [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] {
  const candidates = (MAP_TACTICAL_ORB_CANDIDATES[mapId] ?? []).filter((c) =>
    isOrbSpotClear(mapId, obstacles, arenaRadius, c.x, c.z)
  );
  if (candidates.length >= 2) {
    const validPairs: Array<[{ x: number; z: number }, { x: number; z: number }]> = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        if (dist >= arenaRadius * 0.95) {
          validPairs.push([a, b]);
        }
      }
    }
    if (validPairs.length > 0) {
      const idx = Math.abs(Math.floor(seedHint)) % validPairs.length;
      const [a, b] = validPairs[idx];
      const supA = getObstacleSupportY(mapId, a.x, 5.0, a.z, 0.5, obstacles);
      const supB = getObstacleSupportY(mapId, b.x, 5.0, b.z, 0.5, obstacles);
      return [
        { x: a.x, y: supA + AWAKENING_CONFIG.ORB_HOVER_HEIGHT, z: a.z },
        { x: b.x, y: supB + AWAKENING_CONFIG.ORB_HOVER_HEIGHT, z: b.z },
      ];
    }
  }
  return findFarthestValidOrbPair(mapId, obstacles, arenaRadius);
}

export interface SurgeMutableActor {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  cooldowns: number[];
  dashCooldown: number;
  grabCooldown: number;
  flightCooldown?: number;
  flightRemaining?: number;
  flightMax?: number;
  awakened: boolean;
  isOverdrive: boolean;
}

export function applyAwakeningSurge(actor: SurgeMutableActor): void {
  if (actor.awakened) return;
  const oldMaxHp = actor.maxHp;
  const newMaxHp = Math.round(oldMaxHp * AWAKENING_CONFIG.HP_MULTIPLIER);
  const addedHp = Math.max(0, newMaxHp - oldMaxHp);

  actor.maxHp = newMaxHp;
  // Heal by the ADDED amount only, never to full
  actor.hp = Math.min(newMaxHp, actor.hp + addedHp);

  actor.maxMana = Math.round(actor.maxMana * AWAKENING_CONFIG.CHI_MULTIPLIER);
  actor.mana = actor.maxMana;

  for (let i = 0; i < actor.cooldowns.length; i++) {
    actor.cooldowns[i] = 0;
  }
  actor.dashCooldown = 0;
  actor.grabCooldown = 0;
  if (typeof actor.flightCooldown === 'number') {
    actor.flightCooldown = 0;
  }
  if (typeof actor.flightMax === 'number' && actor.flightMax > 0) {
    actor.flightRemaining = actor.flightMax;
  }
  actor.awakened = true;
  if (actor.hp > actor.maxHp * 0.28) {
    actor.isOverdrive = false;
  }
}

export function resolveActorBaseMoveSpeed(fighterMoveSpeed: number, awakened: boolean): number {
  return awakened ? AWAKENING_CONFIG.AWAKENED_MOVE_SPEED : fighterMoveSpeed;
}

export function computeAbilityResourceCost(
  ab: Pick<AbilitySpec, 'manaCost' | 'staminaCost'> | { chiCost: number },
  opts: {
    awakened: boolean;
    counterFlowActive: boolean;
    slot: AbilitySlot;
    holdHeavy?: boolean;
    isStage2?: boolean;
  }
): { reqMana: number; reqStam: number } {
  const costMult =
    opts.counterFlowActive && (opts.slot === 3 || opts.slot === 4 || opts.slot === 5 || opts.slot === 6)
      ? 0.5
      : 1.0;

  if (opts.awakened) {
    // Awakened rule: All skills (1, 2, 3, 4) and M1 cost Chi only. Stamina is NEVER spent on skills.
    const rawChi = opts.isStage2
      ? 12
      : 'chiCost' in ab
      ? ab.chiCost
      : ab.manaCost;
    return {
      reqMana: Math.round(rawChi * costMult),
      reqStam: AWAKENING_CONFIG.AWAKENED_SKILL_STM_COST,
    };
  }

  const baseMana = 'manaCost' in ab ? ab.manaCost : ab.chiCost;
  const baseStam = 'staminaCost' in ab ? ab.staminaCost : 0;
  return {
    reqMana: Math.round(baseMana * costMult),
    reqStam: Math.round((opts.holdHeavy && opts.slot === 0 ? baseStam + 6 : baseStam) * costMult),
  };
}

export interface ClashTugState {
  balance: number; // -1 (P1 dominates) .. 0 (even) .. +1 (P2 dominates)
  p1Taps: number;
  p2Taps: number;
  p1LastTapAt: number;
  p2LastTapAt: number;
  p1OverdriveMult: number;
  p2OverdriveMult: number;
  elapsed: number;
  resolved: boolean;
  outcome: 'p1' | 'p2' | 'tie' | null;
}

export function createClashTugState(): ClashTugState {
  return {
    balance: 0,
    p1Taps: 0,
    p2Taps: 0,
    p1LastTapAt: -10,
    p2LastTapAt: -10,
    p1OverdriveMult: 1,
    p2OverdriveMult: 1,
    elapsed: 0,
    resolved: false,
    outcome: null,
  };
}

export function registerClashMash(state: ClashTugState, side: 'p1' | 'p2', nowSec: number): void {
  if (state.resolved) return;
  if (side === 'p1') {
    const gap = nowSec - state.p1LastTapAt;
    state.p1OverdriveMult =
      gap <= AWAKENING_CONFIG.CLASH_OVERDRIVE_WINDOW_SEC
        ? Math.min(AWAKENING_CONFIG.CLASH_OVERDRIVE_MAX_MULT, state.p1OverdriveMult + AWAKENING_CONFIG.CLASH_OVERDRIVE_STEP)
        : 1.0;
    state.p1LastTapAt = nowSec;
    state.p1Taps += 1;
    state.balance = Math.max(-1, state.balance - AWAKENING_CONFIG.CLASH_MASH_PUSH * state.p1OverdriveMult);
    if (state.balance <= -AWAKENING_CONFIG.CLASH_EARLY_WIN_THRESHOLD) {
      state.resolved = true;
      state.outcome = 'p1';
    }
  } else {
    const gap = nowSec - state.p2LastTapAt;
    state.p2OverdriveMult =
      gap <= AWAKENING_CONFIG.CLASH_OVERDRIVE_WINDOW_SEC
        ? Math.min(AWAKENING_CONFIG.CLASH_OVERDRIVE_MAX_MULT, state.p2OverdriveMult + AWAKENING_CONFIG.CLASH_OVERDRIVE_STEP)
        : 1.0;
    state.p2LastTapAt = nowSec;
    state.p2Taps += 1;
    state.balance = Math.min(1, state.balance + AWAKENING_CONFIG.CLASH_MASH_PUSH * state.p2OverdriveMult);
    if (state.balance >= AWAKENING_CONFIG.CLASH_EARLY_WIN_THRESHOLD) {
      state.resolved = true;
      state.outcome = 'p2';
    }
  }
}

export function stepClashTugOfWar(
  state: ClashTugState,
  dt: number,
  durationSec = AWAKENING_CONFIG.TIMELINE.CLASH_END_AT - AWAKENING_CONFIG.TIMELINE.CLASH_START_AT
): ClashTugState['outcome'] {
  if (state.resolved) return state.outcome;
  state.elapsed += dt;

  // Elastic pull back toward center if neither side is pushing
  if (Math.abs(state.balance) > 0.001) {
    const decay = AWAKENING_CONFIG.CLASH_DECAY_PER_SEC * dt;
    if (Math.abs(state.balance) <= decay) {
      state.balance = 0;
    } else {
      state.balance -= Math.sign(state.balance) * decay;
    }
  }

  // Cool down combo overdrive if player stops rapid mashing
  if (state.elapsed - state.p1LastTapAt > AWAKENING_CONFIG.CLASH_OVERDRIVE_WINDOW_SEC) {
    state.p1OverdriveMult = Math.max(1, state.p1OverdriveMult - dt * 1.4);
  }
  if (state.elapsed - state.p2LastTapAt > AWAKENING_CONFIG.CLASH_OVERDRIVE_WINDOW_SEC) {
    state.p2OverdriveMult = Math.max(1, state.p2OverdriveMult - dt * 1.4);
  }

  if (state.balance <= -AWAKENING_CONFIG.CLASH_EARLY_WIN_THRESHOLD) {
    state.resolved = true;
    state.outcome = 'p1';
    return 'p1';
  }
  if (state.balance >= AWAKENING_CONFIG.CLASH_EARLY_WIN_THRESHOLD) {
    state.resolved = true;
    state.outcome = 'p2';
    return 'p2';
  }
  if (state.elapsed >= durationSec) {
    state.resolved = true;
    if (Math.abs(state.balance) < 0.025 && state.p1Taps === state.p2Taps) {
      state.outcome = 'tie';
    } else if (Math.abs(state.balance) < 0.015) {
      state.outcome = state.p1Taps > state.p2Taps ? 'p1' : state.p2Taps > state.p1Taps ? 'p2' : 'tie';
    } else {
      state.outcome = state.balance < 0 ? 'p1' : 'p2';
    }
    return state.outcome;
  }

  return null;
}

export interface TimelineEvent {
  id: string;
  time: number;
  action: () => void;
}

export class CutsceneDirector {
  private events: TimelineEvent[];
  private fired = new Set<string>();

  constructor(events: TimelineEvent[]) {
    this.events = [...events].sort((a, b) => a.time - b.time);
  }

  public update(clockSec: number): string[] {
    const triggered: string[] = [];
    for (const ev of this.events) {
      if (!this.fired.has(ev.id) && clockSec >= ev.time) {
        this.fired.add(ev.id);
        triggered.push(ev.id);
        ev.action();
      }
    }
    return triggered;
  }

  public hasFired(id: string): boolean {
    return this.fired.has(id);
  }

  public reset(): void {
    this.fired.clear();
  }
}
