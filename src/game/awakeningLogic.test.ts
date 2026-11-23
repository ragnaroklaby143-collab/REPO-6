import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAwakeningSurge,
  computeAbilityResourceCost,
  createClashTugState,
  CutsceneDirector,
  findFarthestValidOrbPair,
  registerClashMash,
  resolveActorBaseMoveSpeed,
  shouldSpawnAwakeningOrbs,
  stepClashTugOfWar,
} from './awakeningLogic';
import { AWAKENING_CONFIG } from '../shared/awakeningConfig';
import { createInitialObstacleStates, FIGHTER_BY_ID, MAP_BY_ID, pointHitsObstacle } from '../shared/gameData';

test('shouldSpawnAwakeningOrbs triggers at 1:30 for 1v1 and at 2 alive for 5-player matches', () => {
  // 1v1 (2 initial actors) spawns at 90s
  assert.equal(
    shouldSpawnAwakeningOrbs({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 2,
      aliveCount: 2,
      matchTime: 89.9,
    }),
    false
  );
  assert.equal(
    shouldSpawnAwakeningOrbs({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 2,
      aliveCount: 2,
      matchTime: 90.0,
    }),
    true
  );

  // 5-player match waits for 30s countdown once down to 2 survivors
  assert.equal(
    shouldSpawnAwakeningOrbs({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 5,
      aliveCount: 3,
      matchTime: 45,
      countdownRemaining: null,
    }),
    false
  );
  assert.equal(
    shouldSpawnAwakeningOrbs({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 5,
      aliveCount: 2,
      matchTime: 45,
      countdownRemaining: 12.5,
    }),
    false
  );
  assert.equal(
    shouldSpawnAwakeningOrbs({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 5,
      aliveCount: 2,
      matchTime: 75,
      countdownRemaining: 0,
    }),
    true
  );

  // Never spawns in training mode or after PRE_AWAKENING
  assert.equal(
    shouldSpawnAwakeningOrbs({
      isTrainingMode: true,
      phase: 'PRE_AWAKENING',
      initialActorCount: 2,
      aliveCount: 2,
      matchTime: 120,
    }),
    false
  );
  assert.equal(
    shouldSpawnAwakeningOrbs({
      isTrainingMode: false,
      phase: 'ORBS_ACTIVE',
      initialActorCount: 2,
      aliveCount: 2,
      matchTime: 100,
    }),
    false
  );
});

test('findFarthestValidOrbPair returns mirrored clear positions outside obstacles across all maps', () => {
  for (const mapId of ['shibuya', 'meadow', 'temple', 'obsidian'] as const) {
    const obstacles = createInitialObstacleStates(mapId);
    const radius = MAP_BY_ID[mapId].arenaRadius;
    const [orbA, orbB] = findFarthestValidOrbPair(mapId, obstacles, radius);

    // Opposite/mirror sides
    assert.ok(Math.abs(orbA.x + orbB.x) < 0.05);
    assert.ok(Math.abs(orbA.z + orbB.z) < 0.05);
    // Far apart near outer arena
    assert.ok(Math.hypot(orbA.x - orbB.x, orbA.z - orbB.z) > radius * 1.2);
    // Neither inside an obstacle
    assert.equal(pointHitsObstacle(mapId, orbA.x, 0.8, orbA.z, obstacles), false);
    assert.equal(pointHitsObstacle(mapId, orbB.x, 0.8, orbB.z, obstacles), false);
  }
});

test('applyAwakeningSurge doubles Max HP + heals added delta only, doubles & fills Chi, resets cooldowns', () => {
  const actor = {
    hp: 65,
    maxHp: 120,
    mana: 20,
    maxMana: 100,
    cooldowns: [0.3, 1.2, 4.5, 6.0, 10.0, 12.0, 0],
    dashCooldown: 1.4,
    grabCooldown: 8.5,
    flightCooldown: 7.0,
    flightRemaining: 0,
    flightMax: 7.0,
    awakened: false,
    isOverdrive: true,
  };

  applyAwakeningSurge(actor);

  assert.equal(actor.awakened, true);
  assert.equal(actor.maxHp, 240);
  // Healed by added 120 HP: 65 + 120 = 185 (not 240 full)
  assert.equal(actor.hp, 185);
  assert.equal(actor.maxMana, 200);
  assert.equal(actor.mana, 200);
  assert.deepEqual(actor.cooldowns, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(actor.dashCooldown, 0);
  assert.equal(actor.grabCooldown, 0);
  assert.equal(actor.flightCooldown, 0);
  assert.equal(actor.flightRemaining, 7.0);
  assert.equal(actor.isOverdrive, false);
});

test('computeAbilityResourceCost spends 0 Stamina for awakened skills & M1', () => {
  const kit = AWAKENING_CONFIG.AWAKENED_KITS.jm;
  const costS4 = computeAbilityResourceCost(kit.skill4, {
    awakened: true,
    counterFlowActive: false,
    slot: 6,
  });
  assert.equal(costS4.reqStam, 0);
  assert.equal(costS4.reqMana, kit.skill4.chiCost);

  const normalS3 = computeAbilityResourceCost(FIGHTER_BY_ID.jm.abilities[4], {
    awakened: false,
    counterFlowActive: false,
    slot: 4,
  });
  assert.ok(normalS3.reqStam > 0);
});

test('Clash Tug-of-War supports overdrive mashing, early win, decay, and tie fallback', () => {
  const clash = createClashTugState();
  // Rapid P1 taps within overdrive window build multiplier and push left (< 0)
  for (let i = 0; i < 6; i++) {
    registerClashMash(clash, 'p1', i * 0.12);
  }
  assert.ok(clash.balance < -0.4);
  assert.ok(clash.p1OverdriveMult > 1.0);

  // Decay pulls toward 0 when idle
  const beforeDecay = clash.balance;
  stepClashTugOfWar(clash, 0.5, 3.0);
  assert.ok(clash.balance > beforeDecay);

  // Complete 3s duration with P1 leading -> p1 outcome
  const res = stepClashTugOfWar(clash, 2.6, 3.0);
  assert.equal(res, 'p1');
  assert.equal(clash.resolved, true);

  // Exact tie when neither taps
  const tieClash = createClashTugState();
  const tieRes = stepClashTugOfWar(tieClash, 3.1, 3.0);
  assert.equal(tieRes, 'tie');
});

test('CutsceneDirector triggers events strictly once in monotonic order from audio clock', () => {
  const firedLog: string[] = [];
  const dir = new CutsceneDirector([
    { id: 'fade_walk', time: 0, action: () => firedLog.push('walk') },
    { id: 'panel_1', time: 12.0, action: () => firedLog.push('p1') },
    { id: 'panel_2', time: 14.0, action: () => firedLog.push('p2') },
    { id: 'clash', time: 15.0, action: () => firedLog.push('clash') },
  ]);

  assert.deepEqual(dir.update(0.1), ['fade_walk']);
  assert.deepEqual(dir.update(11.9), []);
  assert.deepEqual(dir.update(12.05), ['panel_1']);
  assert.deepEqual(dir.update(15.2), ['panel_2', 'clash']);
  // Subsequent ticks do not re-fire
  assert.deepEqual(dir.update(16.0), []);
  assert.deepEqual(firedLog, ['walk', 'p1', 'p2', 'clash']);
});

import {
  AwakeningActor,
  AwakeningHostHelpers,
  AwakeningRoomState,
  executeAwakenedAbilityImpact,
  handleAwakeningMash,
  resolveCutsceneClash,
  setupAwakenedAbilityWindup,
  tickAwakeningRoom,
} from '../server/awakeningEngine.ts';
import { getAwakenedAbility } from '../shared/awakeningConfig.ts';
import type { FighterId } from '../shared/gameData.ts';

function makeActor(id: string, fighterId: FighterId, slotIndex: number, isBot = false): AwakeningActor {
  const spec = FIGHTER_BY_ID[fighterId];
  return {
    playerId: id,
    slotIndex,
    name: id.toUpperCase(),
    fighterId,
    skinId: 'ascended',
    isBot,
    isDummy: false,
    x: slotIndex * 6,
    y: 0,
    z: 0,
    vx: 0,
    yVel: 0,
    vz: 0,
    grounded: true,
    rotY: 0,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    mana: 40,
    maxMana: spec.maxMana,
    stamina: spec.maxStamina,
    maxStamina: spec.maxStamina,
    stagger: 0,
    isStunned: false,
    isOverdrive: false,
    frenzyInside: false,
    passiveStacks: 0,
    counterFlowActive: false,
    comboCount: 0,
    comboStep: 0,
    m1Variant: 'light',
    grabCooldown: 3.0,
    damagePhase: 'NORMAL',
    actionState: 'idle',
    abilitySlot: null,
    actionTimer: 0,
    actionDuration: 0,
    whiffTimer: 0,
    cooldowns: [0, 0, 2.5, 4.0, 7.5, 0, 0],
    dashCooldown: 1.2,
    dashMaxCooldown: 1.5,
    dashCharges: 2,
    dashMaxCharges: 2,
    dashRechargeRemaining: 0,
    isFlying: false,
    flightRemaining: 7,
    flightMax: 7,
    flightCooldown: 2.0,
    speedBoostTimer: 0,
    superArmor: false,
    shieldActive: false,
    parryWindow: false,
    blockHeld: false,
    awakened: false,
    awakeningTransformTimer: 0,
    silencedTimer: 0,
    snareMarkedTimer: 0,
    slowTimer: 0,
    isKO: false,
    koTime: null,
    koStyle: spec.koStyle,
    wins: 0,
    kills: 0,
    parryCount: 0,
    damageDealt: 0,
    moveX: 0,
    moveZ: 0,
    aimYaw: 0,
    aimPitch: 0,
    targetId: null,
    windupTriggered: false,
    landedCurrentAction: false,
    pendingHoldHeavy: false,
    pendingComboLink: false,
    lastM1At: -5,
    lastHitAt: -5,
    lastDamagedAt: -5,
    lastAbilitySlot: null,
    lastAbilityAt: -5,
    iframeTimer: 0,
    parryStartedAt: -5,
    prevBlockHeld: false,
    clashCooldown: 0,
    overdriveAnnounced: false,
    lastOriginX: 0,
    lastOriginY: 0,
    lastOriginZ: 0,
    lastCastSlot: null,
    pendingAimX: null,
    pendingAimZ: null,
    pendingHoldVariant: false,
    stage2Slot: null,
    stage2Timer: 0,
    stage2Label: '',
    stage2PendingCooldown: 0,
    rushFatigue: 0,
    rushFatigueDecayTimer: 0,
    empoweredM1Ready: false,
    perfectEvadeTimer: 0,
    evadeRewardedThisDash: false,
    dashEruptedThisDash: false,
    dashRechargeTimer: 0,
    activeTelegraphId: null,
    channelKind: null,
    channelTimer: 0,
    channelDuration: 0,
    channelTickTimer: 0,
    channelStep: 0,
    channelTargetX: 0,
    channelTargetZ: 0,
    stunnedTimer: 0,
    stunImmunityTimer: 0,
    domainGauge: 0,
    deaths: 0,
    domainJackpotActive: false,
    domainJackpotHits: 0,
  };
}

function makeRoomAndHelpers(actors: AwakeningActor[], initialCount = actors.length) {
  const events: Array<Record<string, unknown>> = [];
  let seq = 0;
  const room: AwakeningRoomState = {
    roomCode: 'TEST',
    phase: 'combat',
    mapId: 'shibuya',
    isSoloPractice: true,
    isTrainingMode: false,
    matchTime: 0,
    actors,
    initialActorCount: initialCount,
    obstacles: createInitialObstacleStates('shibuya'),
    zones: [],
    projectiles: [],
    telegraphs: [],
    activeClash: null,
    activeHeadlock: null,
    pickups: [],
    stormActive: false,
    stormRadius: MAP_BY_ID.shibuya.arenaRadius,
    awakeningPhase: 'PRE_AWAKENING',
    awakeningOrbs: [],
    awakeningBanner: null,
    awakeningCutscene: null,
    awakeningDelayedHits: [],
  };
  const helpers: AwakeningHostHelpers = {
    makeId: (p) => `${p}-${++seq}`,
    pushEvent: (_r, ev) => {
      events.push(ev as Record<string, unknown>);
    },
    spawnZone: (_r, owner, kind, x, y, z, radius, duration, colorHex, endX, endZ) => {
      const zObj = {
        id: `z-${++seq}`,
        ownerId: owner.playerId,
        fighterId: owner.fighterId,
        kind,
        x,
        y,
        z,
        endX,
        endZ,
        radius,
        remaining: duration,
        maxDuration: duration,
        colorHex,
        tickTimer: 0,
        hitCooldowns: {},
      };
      room.zones.push(zObj);
      return zObj;
    },
    spawnTelegraph: () => {},
    clearActorTelegraph: () => {},
    findNearestTarget: (_r, actor) => room.actors.find((a) => a.playerId !== actor.playerId && !a.isKO) ?? null,
    findPreferredTarget: (_r, actor) => room.actors.find((a) => a.playerId !== actor.playerId && !a.isKO) ?? null,
    clampAimPoint: (_r, _a, x, z) => ({ x, z }),
    computeDynamicDamage: (_a, _t, baseDamage) => ({ dmg: baseDamage, isBackstab: false, isCrit: false, staggerBonus: 0 }),
    applyHit: (_r, attacker, target, damage) => {
      target.hp = Math.max(0, target.hp - damage);
      attacker.damageDealt += damage;
      return true;
    },
    damageObstacle: () => {},
    damageObstaclesInArea: () => {},
    eliminateActor: (_r, _att, target) => {
      target.isKO = true;
    },
  };
  return { room, helpers, events };
}

test('AwakeningEngine state machine: 1v1 spawn -> 1st orb immediate -> 2nd orb cutscene -> mash win', () => {
  const p1 = makeActor('p1', 'marjohn', 0);
  const p2 = makeActor('p2', 'prime', 1, true);
  p1.hp = 60; // partial HP to verify added delta heal (not full)
  const { room, helpers, events } = makeRoomAndHelpers([p1, p2]);

  // At 89s orbs haven't spawned yet
  room.matchTime = 89;
  assert.equal(tickAwakeningRoom(room, 0.1, helpers), false);
  assert.equal(room.awakeningPhase, 'PRE_AWAKENING');

  // Simulate storm active at 65s, then at 90s two opposite orbs spawn and storm is removed
  room.stormActive = true;
  room.stormRadius = 24;
  room.matchTime = 90;
  assert.equal(tickAwakeningRoom(room, 0.1, helpers), false);
  assert.equal(room.awakeningPhase, 'ORBS_ACTIVE');
  assert.equal(room.stormActive, false);
  assert.equal(room.stormRadius, MAP_BY_ID.shibuya.arenaRadius);
  assert.equal(room.awakeningOrbs.length, 2);
  assert.equal(room.awakeningBanner?.text, 'AWAKENING ORBS HAVE APPEARED');

  // Speed resolves to 20 when awakened, fighter base speed otherwise
  assert.equal(resolveActorBaseMoveSpeed(FIGHTER_BY_ID.marjohn.moveSpeed, false), 7);
  assert.equal(resolveActorBaseMoveSpeed(FIGHTER_BY_ID.marjohn.moveSpeed, true), 20);

  // P1 touches Orb 0 -> immediate transform without cutscene
  p1.x = room.awakeningOrbs[0].x;
  p1.z = room.awakeningOrbs[0].z;
  p1.y = room.awakeningOrbs[0].y - 0.9;
  assert.equal(tickAwakeningRoom(room, 0.04, helpers), false);
  assert.equal(p1.awakened, true);
  assert.equal(p2.awakened, false);
  assert.equal(p1.hp, 60 + FIGHTER_BY_ID.marjohn.maxHp);
  assert.equal(p1.maxHp, FIGHTER_BY_ID.marjohn.maxHp * 2);
  assert.equal(p1.mana, FIGHTER_BY_ID.marjohn.maxMana * 2);
  assert.equal(p1.cooldowns[2], 0);
  assert.equal(room.awakeningBanner?.text, 'P1 HAS AWAKENED');

  // P2 touches remaining Orb 1 -> cutscene starts, both invulnerable, timer paused return=true
  p2.x = room.awakeningOrbs[1].x;
  p2.z = room.awakeningOrbs[1].z;
  p2.y = room.awakeningOrbs[1].y - 0.9;
  assert.equal(tickAwakeningRoom(room, 0.04, helpers), true);
  assert.equal(room.awakeningPhase, 'CUTSCENE');
  assert.equal(p2.awakened, true);
  assert.ok(p1.iframeTimer > 5 && p2.iframeTimer > 5);

  // Advance cutscene to clash phase (~15.5s) and verify P1 mash win
  room.awakeningCutscene!.clockSec = AWAKENING_CONFIG.TIMELINE.CLASH_START_AT + 0.2;
  for (let i = 0; i < 12; i++) {
    handleAwakeningMash(room, p1.playerId, helpers);
  }
  if (room.awakeningPhase === 'CUTSCENE') {
    resolveCutsceneClash(room, helpers, false);
  }
  assert.equal(room.awakeningPhase, 'AWAKENED_DUEL');
  assert.equal(room.awakeningCutscene, null);
  assert.ok(p2.hp < p2.maxHp); // loser took clash damage
  assert.ok(events.some((e) => e.kind === 'awakeningClashEnd'));
});

test('AwakeningEngine enforces 30s delay in 3+ player matches, 20s orb expiry, and mid-cutscene KO cancel', () => {
  const p1 = makeActor('p1', 'damen', 0);
  const p2 = makeActor('p2', 'khen', 1);
  const { room, helpers, events } = makeRoomAndHelpers([p1, p2], 5);

  // 5-player match with 2 alive starts 30s countdown instead of spawning immediately
  assert.equal(tickAwakeningRoom(room, 0.04, helpers), false);
  assert.equal(room.awakeningPhase, 'PRE_AWAKENING');
  assert.ok(room.awakeningCountdown !== null && room.awakeningCountdown! > 29.8);
  assert.equal(room.awakeningBanner?.text, 'FINAL 2 SURVIVORS!');

  // Advance 29.9s -> still in countdown
  assert.equal(tickAwakeningRoom(room, 29.9, helpers), false);
  assert.equal(room.awakeningPhase, 'PRE_AWAKENING');

  // Final step finishes 30s delay -> orbs spawn with strict 20s lifespan
  assert.equal(tickAwakeningRoom(room, 0.2, helpers), false);
  assert.equal(room.awakeningPhase, 'ORBS_ACTIVE');
  assert.equal(room.awakeningCountdown, null);
  assert.equal(room.awakeningOrbs.length, 2);
  assert.equal(room.awakeningOrbs[0].remaining, AWAKENING_CONFIG.ORB_LIFESPAN_SEC);

  // If neither player grabs an orb within 20s, orbs expire cleanly
  assert.equal(tickAwakeningRoom(room, 20.1, helpers), false);
  assert.equal(room.awakeningPhase, 'AWAKENED_DUEL');
  assert.equal(room.awakeningOrbs.every((o) => !o.active), true);
  assert.equal(room.awakeningBanner?.text, 'AWAKENING ORBS EXPIRED!');

  // Reset for simultaneous pickup & mid-cutscene KO check
  const r2 = makeRoomAndHelpers([p1, p2], 5);
  tickAwakeningRoom(r2.room, 0.04, r2.helpers);
  tickAwakeningRoom(r2.room, 30.05, r2.helpers);
  assert.equal(r2.room.awakeningPhase, 'ORBS_ACTIVE');

  p1.x = r2.room.awakeningOrbs[0].x;
  p1.z = r2.room.awakeningOrbs[0].z;
  p1.y = r2.room.awakeningOrbs[0].y - 0.9;
  p2.x = r2.room.awakeningOrbs[1].x;
  p2.z = r2.room.awakeningOrbs[1].z;
  p2.y = r2.room.awakeningOrbs[1].y - 0.9;
  assert.equal(tickAwakeningRoom(r2.room, 0.04, r2.helpers), true);
  assert.equal(r2.room.awakeningPhase, 'CUTSCENE');

  p2.isKO = true;
  assert.equal(tickAwakeningRoom(r2.room, 0.04, r2.helpers), false);
  assert.equal(r2.room.awakeningPhase, 'AWAKENED_DUEL');
  assert.equal(r2.room.awakeningCutscene, null);
  assert.ok(r2.events.some((e) => e.kind === 'awakeningClashEnd' && e.callout === 'CLASH INTERRUPTED'));
  void events;
});

test('All 5 awakened fighter kits have Skill 4 (slot 6), zero STM cost, and execute without error', () => {
  const fighters: FighterId[] = ['marjohn', 'prime', 'damen', 'khen', 'jm'];
  for (const fId of fighters) {
    const p1 = makeActor('p1', fId, 0);
    const p2 = makeActor('p2', 'prime', 1);
    p1.awakened = true;
    p1.maxMana *= 2;
    p1.mana = p1.maxMana;
    p2.x = 4;
    p2.z = 0;

    const { room, helpers } = makeRoomAndHelpers([p1, p2]);
    for (const slot of [0, 2, 3, 4, 6] as const) {
      const ab = getAwakenedAbility(fId, slot);
      assert.ok(ab, `Missing awakened ability for ${fId} slot ${slot}`);
      const cost = computeAbilityResourceCost(ab, { awakened: true, counterFlowActive: false, slot });
      assert.equal(cost.reqStam, 0, `${fId} slot ${slot} must have 0 staminaCost`);
      setupAwakenedAbilityWindup(room, p1, slot, 1, 0, { x: 4, z: 0 }, helpers);
      executeAwakenedAbilityImpact(room, p1, slot, helpers);
    }
  }
});

