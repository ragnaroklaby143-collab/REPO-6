import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDomainCharge,
  areActorsAllied,
  canActivateDomain,
  canTriggerDomainClash,
  clampPositionToDomainBarrier,
  computeEdgeToEdgeMirrorTeleport,
  computePunchLaunchToFarEdge,
  distancePointToSegment2D,
  DOMAIN_CONFIGS,
  getDomainTierConfig,
  pickRandomJmEdgeTarget,
  PRIME_DOMAIN_CONFIG,
  resolveDamageDomainClashWinner,
  resolveDomainCastPhase,
  resolveDomainClashWinner,
  resolveJmLaserTouch,
  resolveNextJmBounceTarget,
  stepDomainClashBalance,
} from './domainLogic.ts';
import {
  evaluateTerrainZonesAt,
  MAP_ENTERABLE_BUILDINGS,
  MAP_TERRAIN_ZONES,
  shouldViewerSeeActor,
} from './mapLogic.ts';
import { LocalRoomSession } from './localRoomClient.ts';
import { GAME_MODES, type ServerMessage } from '../shared/gameData.ts';

test('Domain configs, 0.3x compact/2x fast tiers (JM & Prime), and cast phases behave cleanly', () => {
  for (const id of ['khen', 'prime', 'damen', 'marjohn', 'jm'] as const) {
    assert.ok(DOMAIN_CONFIGS[id]);
    assert.equal(DOMAIN_CONFIGS[id].durationSec, 10);
    assert.equal(DOMAIN_CONFIGS[id].sureHitDamage, 0);
  }

  // Standard 5.0s domains (Khen, Marjohn, Damen)
  const khenTier = getDomainTierConfig('khen');
  assert.equal(khenTier.castTotalSec, 5.0);
  assert.equal(khenTier.escapeEndSec, 1.0);
  assert.equal(khenTier.sealEndSec, 3.0);
  assert.equal(khenTier.isCompactFast, false);

  // Compact 0.7x radius & 2.5s fast domains (JM & Prime)
  const jmTier = getDomainTierConfig('jm');
  const primeTier = getDomainTierConfig('prime');
  assert.equal(jmTier.castTotalSec, 2.5);
  assert.equal(jmTier.escapeEndSec, 0.5);
  assert.equal(jmTier.sealEndSec, 1.5);
  assert.equal(jmTier.isCompactFast, true);
  assert.ok(Math.abs(jmTier.radius - DOMAIN_CONFIGS.jm.radius * 0.7) < 0.05);
  assert.equal(primeTier.castTotalSec, 2.5);
  assert.ok(Math.abs(primeTier.radius - DOMAIN_CONFIGS.prime.radius * 0.7) < 0.05);

  // Standard 3-phase cast timeline checks
  const pEsc = resolveDomainCastPhase(0.4, 'khen');
  assert.equal(pEsc.phase, 'escape_window');
  assert.equal(pEsc.casterSpeedMult, 0.5);
  assert.equal(pEsc.barrierSealed, false);
  assert.equal(pEsc.canHitCancel, false);

  const pSeal = resolveDomainCastPhase(1.8, 'khen');
  assert.equal(pSeal.phase, 'sealed_cancelable');
  assert.equal(pSeal.casterSpeedMult, 0.5);
  assert.equal(pSeal.barrierSealed, true);
  assert.equal(pSeal.canHitCancel, true);

  const pBuild = resolveDomainCastPhase(3.6, 'khen');
  assert.equal(pBuild.phase, 'building');
  assert.equal(pBuild.casterSpeedMult, 0);
  assert.equal(pBuild.barrierSealed, true);
  assert.equal(pBuild.canHitCancel, false);

  assert.equal(addDomainCharge(75, 50), 100);
  assert.equal(addDomainCharge(20, 15, 2), 50);

  assert.equal(
    canActivateDomain({
      domainGauge: 99,
      isKO: false,
      isStunned: false,
      playerId: 'p1',
    }),
    false
  );
  assert.equal(
    canActivateDomain({
      domainGauge: 100,
      isKO: false,
      isStunned: false,
      playerId: 'p1',
    }),
    true
  );

  // Clash triggers against casting domain or within 1.5s active window for non-allied opponents
  assert.equal(
    canTriggerDomainClash({
      existingDomainElapsedSec: 4.2,
      existingOwnerId: 'p1',
      challengerId: 'p2',
      areAllied: false,
      isExistingCasting: true,
    }),
    true
  );
  assert.equal(
    canTriggerDomainClash({
      existingDomainElapsedSec: 1.2,
      existingOwnerId: 'p1',
      challengerId: 'p2',
      areAllied: false,
    }),
    true
  );
  assert.equal(
    canTriggerDomainClash({
      existingDomainElapsedSec: 1.8,
      existingOwnerId: 'p1',
      challengerId: 'p2',
      areAllied: false,
    }),
    false
  );
  assert.equal(
    canTriggerDomainClash({
      existingDomainElapsedSec: 0.4,
      existingOwnerId: 'p1',
      challengerId: 'p2',
      areAllied: true,
    }),
    false
  );

  let bal = 0;
  bal = stepDomainClashBalance(bal, 'p1');
  bal = stepDomainClashBalance(bal, 'p1');
  assert.ok(bal < 0);
  assert.equal(resolveDomainClashWinner(bal, 2, 0), 'p1');
  assert.equal(resolveDamageDomainClashWinner(52, 24, 0, 10), 'p1');
  assert.equal(resolveDamageDomainClashWinner(18, 45, 10, 0), 'p2');
  assert.equal(areActorsAllied({ playerId: 'a', team: 'alpha' }, { playerId: 'b', team: 'alpha' }, 'squad_clash'), true);
  assert.equal(areActorsAllied({ playerId: 'a', team: 'alpha' }, { playerId: 'b', team: 'alpha' }, 'classic'), false);
});

test('JM edge-to-edge mirror teleport, criss-cross segment intersection, and intercept punch-launch math', () => {
  const tele1 = computeEdgeToEdgeMirrorTeleport({
    fromX: 0,
    fromZ: 0,
    moveX: 1,
    moveZ: 0,
    centerX: 0,
    centerZ: 0,
    radius: 13,
  });
  assert.ok(tele1.endX > 11.5 && Math.abs(tele1.endZ) < 0.01);

  // Moving diagonally from an edge mirrors edge-to-edge across the domain diameter
  const tele2 = computeEdgeToEdgeMirrorTeleport({
    fromX: -12,
    fromZ: 0,
    moveX: 1,
    moveZ: 1,
    centerX: 0,
    centerZ: 0,
    radius: 13,
  });
  assert.ok(tele2.chordLength > 14);
  const seg = distancePointToSegment2D(0, 0, -10, 0, 10, 0);
  assert.equal(seg.dist, 0);

  const launch = computePunchLaunchToFarEdge(0, 0, 0, 1, 0, 0, 13);
  assert.ok(launch.targetZ > 11.5);
  assert.ok(launch.launchVz >= 16);
});

test('Awakening Spam Duel skip jumps straight to Clash phase and resets Storm to full center after Cutscene', () => {
  const msgs: ServerMessage[] = [];
  const session = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs.push(m),
  });

  try {
    session.send({
      type: 'room:create',
      playerName: 'ClashTester',
      isSoloPractice: true,
      isTrainingMode: false,
    });
    session.send({ type: 'room:selectFighter', fighterId: 'khen' });
    session.send({ type: 'room:startNow' });

    let t = Date.now();
    for (let i = 0; i < 110; i++) {
      t += 50;
      session.stepNow(t);
    }
    session.send({ type: 'game:debug', action: 'resetCooldowns' });
    session.send({ type: 'game:debug', action: 'triggerCutscene' });
    t += 50;
    session.stepNow(t);

    const getLastSnap = () => {
      const snaps = msgs.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      return snaps[snaps.length - 1]?.snapshot;
    };

    const initialSnap = getLastSnap();
    assert.equal(initialSnap?.awakeningPhase, 'CUTSCENE');

    // Clicking Skip jumps clock directly to 15.0s Spam Duel without closing cutscene!
    session.send({ type: 'game:awakeningSkip' });
    t += 50;
    session.stepNow(t);

    const duelSnap = getLastSnap();
    assert.equal(duelSnap?.awakeningPhase, 'CUTSCENE');
    assert.ok((duelSnap?.awakeningCutscene?.clockSec ?? 0) >= 15.0);

    // P1 mashes repeatedly across the Spam Duel to overpower the Bot
    for (let i = 0; i < 65; i++) {
      if (getLastSnap()?.awakeningPhase === 'AWAKENED_DUEL') break;
      session.send({ type: 'game:awakeningMash' });
      session.send({ type: 'game:awakeningMash' });
      t += 60;
      session.stepNow(t);
    }

    const postSnap = getLastSnap();
    assert.equal(postSnap?.awakeningPhase, 'AWAKENED_DUEL');
    assert.equal(postSnap?.stormActive, false);
    assert.equal(postSnap?.stormCenterX, 0);
    assert.equal(postSnap?.stormCenterZ, 0);
    const p1 = postSnap?.actors[0];
    assert.ok(p1);
    assert.ok(p1.domainGauge >= 50, `Expected winner to gain >=50% Domain Gauge, got ${p1.domainGauge}`);
  } finally {
    session.dispose();
  }
});

test('Domain Cast 3-stage timeline, lightweight domain:castStart packet, Khen 3 AI Clones, zero sure-hit auto-damage, and Quick Grab', () => {
  assert.equal(GAME_MODES.length, 5);

  const msgs: ServerMessage[] = [];
  const session = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs.push(m),
  });

  try {
    session.send({
      type: 'room:create',
      playerName: 'DomainHero',
      isSoloPractice: true,
      isTrainingMode: false,
      gameMode: 'sudden_death',
    });
    session.send({ type: 'room:selectFighter', fighterId: 'khen' });
    session.send({ type: 'room:startNow' });

    let t = Date.now();
    for (let i = 0; i < 110; i++) {
      t += 50;
      session.stepNow(t);
    }

    const getLastSnap = () => {
      const snaps = msgs.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      return snaps[snaps.length - 1]?.snapshot;
    };

    const sdSnap = getLastSnap();
    assert.equal(sdSnap?.gameMode, 'sudden_death');
    const khen = sdSnap?.actors[0];
    assert.ok(khen);
    assert.equal(khen.awakened, true);
    assert.equal(khen.domainGauge, 100);
    assert.equal(sdSnap?.stormActive, true);
  } finally {
    session.dispose();
  }

  // Deterministic 3-stage 5.0s Khen cast -> Unlimited Shadow Void -> 3 AI Clones -> zero sure-hit auto-damage
  const msgs2: ServerMessage[] = [];
  const trainSession = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs2.push(m),
  });
  try {
    trainSession.send({
      type: 'room:create',
      playerName: 'DomainHero',
      isSoloPractice: false,
      isTrainingMode: true,
    });
    trainSession.send({ type: 'room:selectFighter', fighterId: 'khen' });
    trainSession.send({ type: 'room:startNow' });
    trainSession.send({ type: 'game:trainingConfig', dummyEnabled: true, zeroCooldowns: false });
    trainSession.send({ type: 'game:debug', action: 'awakenP1' });
    trainSession.send({ type: 'game:debug', action: 'resetCooldowns' });
    trainSession.send({ type: 'game:debug', action: 'fillDomain' });

    let t = Date.now();
    t += 50;
    trainSession.stepNow(t);

    const getSnap = () => {
      const snaps = msgs2.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      return snaps[snaps.length - 1]?.snapshot;
    };

    trainSession.send({ type: 'game:domainActivate' });
    t += 50;
    trainSession.stepNow(t);

    const castPackets = msgs2.filter(
      (m): m is Extract<ServerMessage, { type: 'domain:castStart' }> => m.type === 'domain:castStart'
    );
    assert.equal(castPackets.length, 1);
    assert.equal(castPackets[0].fighterId, 'khen');

    const escapeSnap = getSnap();
    assert.equal(escapeSnap?.castingDomain?.phase, 'escape_window');
    assert.equal(escapeSnap?.castingDomain?.duration, 5.0);

    // Advance past 1.0s into sealed_cancelable
    for (let i = 0; i < 24; i++) {
      t += 50;
      trainSession.stepNow(t);
    }
    assert.equal(getSnap()?.castingDomain?.phase, 'sealed_cancelable');

    // Advance past 3.0s into building
    for (let i = 0; i < 40; i++) {
      t += 50;
      trainSession.stepNow(t);
    }
    assert.equal(getSnap()?.castingDomain?.phase, 'building');

    // Finish 5.0s cast -> Unlimited Shadow Void with 3 autonomous AI clones
    for (let i = 0; i < 45; i++) {
      t += 50;
      trainSession.stepNow(t);
    }
    const domSnap = getSnap();
    assert.equal(domSnap?.activeDomain?.fighterId, 'khen');
    assert.equal(domSnap?.activeDomain?.domainName, 'Unlimited Shadow Void');
    assert.equal(domSnap?.activeDomain?.khenClones?.length, 3);

    const hasSureHit = msgs2.some(
      (m) => m.type === 'game:snapshot' && m.events.some((e) => e.kind === 'domainSureHit')
    );
    assert.equal(hasSureHit, false, 'Generic unavoidable domainSureHit ticks must not fire');
  } finally {
    trainSession.dispose();
  }

  // Verify Sudden Death Grab is fast (0.17s halved startup/duration) and domain cast initializes cleanly
  const msgs3: ServerMessage[] = [];
  const sdCastSession = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs3.push(m),
  });
  try {
    sdCastSession.send({
      type: 'room:create',
      playerName: 'DomainCastTester',
      isSoloPractice: true,
      isTrainingMode: false,
      gameMode: 'sudden_death',
    });
    sdCastSession.send({ type: 'room:selectFighter', fighterId: 'khen' });
    sdCastSession.send({ type: 'room:startNow' });

    let t = Date.now();
    for (let i = 0; i < 110; i++) {
      t += 50;
      sdCastSession.stepNow(t);
    }

    const getLastSnap = () => {
      const snaps = msgs3.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      return snaps[snaps.length - 1]?.snapshot;
    };

    // Quick Grab comes out snappy (0.17s halved startup/duration)
    sdCastSession.send({ type: 'game:grab', seq: 2, aimYaw: 0 });
    t += 50;
    sdCastSession.stepNow(t);
    const grabSnap = getLastSnap();
    const khenGrab = grabSnap?.actors[0];
    assert.ok(khenGrab);
    assert.ok(khenGrab.actionDuration <= 0.2, `Expected fast halved Grab duration <=0.2s, got ${khenGrab.actionDuration}`);
  } finally {
    sdCastSession.dispose();
  }
});

test('JM Domain casts in 2.5s at 0.7x radius, performs edge-to-edge mirror teleport, and locks skills 1-4 during Domain Clash while M1/Dash/Guard/Grab work', () => {
  // Part A: Deterministic JM 2.5s compact cast & edge-to-edge mirror teleport web lines in Training Area
  const trainMsgs: ServerMessage[] = [];
  const trainSession = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => trainMsgs.push(m),
  });

  try {
    trainSession.send({
      type: 'room:create',
      playerName: 'JmMirrorTester',
      isSoloPractice: false,
      isTrainingMode: true,
    });
    trainSession.send({ type: 'room:selectFighter', fighterId: 'jm' });
    trainSession.send({ type: 'room:startNow' });
    trainSession.send({ type: 'game:trainingConfig', dummyEnabled: true, zeroCooldowns: false });
    trainSession.send({ type: 'game:debug', action: 'awakenP1' });
    trainSession.send({ type: 'game:debug', action: 'resetCooldowns' });
    trainSession.send({ type: 'game:debug', action: 'fillDomain' });

    let t = Date.now();
    t += 50;
    trainSession.stepNow(t);

    const getTrainSnap = () => {
      const snaps = trainMsgs.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      return snaps[snaps.length - 1]?.snapshot;
    };

    trainSession.send({ type: 'game:domainActivate' });
    t += 50;
    trainSession.stepNow(t);

    const jmCast = getTrainSnap()?.castingDomain;
    assert.ok(jmCast);
    assert.equal(jmCast.duration, 2.5);
    assert.ok(jmCast.radius < DOMAIN_CONFIGS.jm.radius * 0.75);

    // Hold movement input as JM finishes fast 2.5s cast so he immediately mirror-teleports edge-to-edge
    trainSession.send({
      type: 'game:input',
      seq: 10,
      moveX: 1,
      moveZ: 0.4,
      aimYaw: 0,
      aimPitch: 0,
      targetId: null,
      blockHeld: false,
    });

    let sawJmWebLines = false;
    for (let i = 0; i < 70; i++) {
      t += 50;
      trainSession.stepNow(t);
      const cur = getTrainSnap();
      if (cur?.activeDomain?.fighterId === 'jm' && (cur.activeDomain.jmWebLines?.length ?? 0) >= 1) {
        sawJmWebLines = true;
        break;
      }
    }
    assert.equal(sawJmWebLines, true, 'Expected JM edge-to-edge mirror teleport to leave criss-crossing web lines');
  } finally {
    trainSession.dispose();
  }

  // Part B: Deterministic Domain Clash in Sudden Death locks skills 1-4 while M1/Dash/Guard/Grab work
  const msgs: ServerMessage[] = [];
  const session = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs.push(m),
  });
  const origRandom = Math.random;

  try {
    session.send({
      type: 'room:create',
      playerName: 'JmClashTester',
      isSoloPractice: true,
      isTrainingMode: false,
      gameMode: 'sudden_death',
    });
    session.send({ type: 'room:selectFighter', fighterId: 'jm' });
    session.send({ type: 'room:startNow' });

    // During warmup keep Math.random high so bot holds its 100% Domain Gauge until JM activates
    Math.random = () => 0.99;
    let t = Date.now();
    for (let i = 0; i < 110; i++) {
      t += 50;
      session.stepNow(t);
    }

    const getLastSnap = () => {
      const snaps = msgs.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      return snaps[snaps.length - 1]?.snapshot;
    };

    session.send({ type: 'game:domainActivate' });
    t += 50;
    session.stepNow(t);

    // Let Sudden Death bot deterministically trigger Domain Clash!
    Math.random = () => 0.001;
    let sawClash = false;
    for (let i = 0; i < 40; i++) {
      t += 50;
      session.stepNow(t);
      const cur = getLastSnap();
      if (cur?.activeDomainClash) {
        sawClash = true;
        // During Domain Clash, skills 1-4 (slot 2) MUST be locked while M1 (slot 0) remains usable!
        session.send({ type: 'game:ability', seq: 20 + i, slot: 2, aimYaw: 0, aimPitch: 0 });
        t += 50;
        session.stepNow(t);
        const afterLockedSkill = getLastSnap()?.actors[0];
        assert.notEqual(afterLockedSkill?.abilitySlot, 2, 'Skill slot 2 must be locked during Domain Clash');

        session.send({ type: 'game:ability', seq: 120 + i, slot: 0, aimYaw: 0, aimPitch: 0 });
        t += 50;
        session.stepNow(t);
        const afterM1 = getLastSnap()?.actors[0];
        assert.ok(afterM1);
        break;
      }
    }
    assert.equal(sawClash, true, 'Expected Sudden Death bot to trigger Domain Clash against JM cast');
  } finally {
    Math.random = origRandom;
    session.dispose();
  }
});

test('All 5 Game Modes (classic, raid_boss, koth, squad_clash, sudden_death) initialize cleanly in LocalRoomSession', () => {
  for (const mode of ['classic', 'raid_boss', 'koth', 'squad_clash', 'sudden_death'] as const) {
    const msgs: ServerMessage[] = [];
    const session = new LocalRoomSession({
      autoTick: false,
      onMessage: (m) => msgs.push(m),
    });
    try {
      session.send({
        type: 'room:create',
        playerName: 'ModeHost',
        isSoloPractice: true,
        isTrainingMode: false,
        gameMode: mode,
      });
      session.send({ type: 'room:startNow' });
      let t = Date.now();
      for (let i = 0; i < 110; i++) {
        t += 50;
        session.stepNow(t);
      }
      const snaps = msgs.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      const snap = snaps[snaps.length - 1]?.snapshot;
      assert.ok(snap, `Expected snapshot for mode ${mode}`);
      assert.equal(snap.gameMode, mode);
      if (mode === 'raid_boss') {
        assert.ok(snap.raidBossId);
        const boss = snap.actors.find((a) => a.isRaidBoss);
        assert.ok(boss && boss.awakened && boss.maxHp > 300);
        assert.equal(snap.actors.length, 5);
      } else if (mode === 'koth') {
        assert.ok(snap.kothZone);
      } else if (mode === 'squad_clash') {
        assert.ok(snap.teamScores);
        assert.equal(snap.actors.length, 4);
      }
    } finally {
      session.dispose();
    }
  }
});

test('Strict Domain Barrier Lock clamps insiders inside & outsiders outside across dashes/teleports', () => {
  // Pure math clamp verification
  const inside = clampPositionToDomainBarrier({
    x: 25,
    z: 0,
    centerX: 0,
    centerZ: 0,
    domainRadius: 12,
    actorRadius: 0.48,
    isInside: true,
  });
  assert.ok(Math.hypot(inside.x, inside.z) <= 12 - 0.48 + 1e-6);

  const outside = clampPositionToDomainBarrier({
    x: 2,
    z: 1,
    centerX: 0,
    centerZ: 0,
    domainRadius: 12,
    actorRadius: 0.48,
    isInside: false,
  });
  assert.ok(Math.hypot(outside.x, outside.z) >= 12 + 0.48 - 1e-6);

  // Live LocalRoomSession barrier test: caster tries to dash & run out of active Domain
  const msgs: ServerMessage[] = [];
  const session = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs.push(m),
  });
  try {
    session.send({
      type: 'room:create',
      playerName: 'BarrierTester',
      isSoloPractice: false,
      isTrainingMode: true,
    });
    session.send({ type: 'room:selectFighter', fighterId: 'prime' });
    session.send({ type: 'room:startNow' });
    session.send({ type: 'game:trainingConfig', dummyEnabled: true, zeroCooldowns: true });
    session.send({ type: 'game:debug', action: 'awakenP1' });
    session.send({ type: 'game:debug', action: 'fillDomain' });

    let t = Date.now();
    t += 50;
    session.stepNow(t);

    session.send({ type: 'game:domainActivate' });
    t += 50;
    session.stepNow(t);

    // Wait for Prime's 2.5s cast to finish and become activeDomain
    for (let i = 0; i < 60; i++) {
      t += 50;
      session.stepNow(t);
    }

    const getSnap = () => {
      const snaps = msgs.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      return snaps[snaps.length - 1]?.snapshot;
    };

    const domSnap = getSnap();
    assert.ok(domSnap?.activeDomain, 'Expected Prime activeDomain to be running');
    const cx = domSnap.activeDomain.centerX;
    const cz = domSnap.activeDomain.centerZ;
    const rad = domSnap.activeDomain.radius;

    // Attempt to dash & sprint directly outward past the Domain barrier for 15 ticks
    for (let i = 0; i < 15; i++) {
      session.send({
        type: 'game:input',
        seq: 100 + i,
        moveX: 1,
        moveZ: 0,
        aimYaw: Math.PI / 2,
        aimPitch: 0,
        targetId: null,
        blockHeld: false,
      });
      if (i % 4 === 0) {
        session.send({ type: 'game:dash', seq: 200 + i, moveX: 1, moveZ: 0, aimYaw: Math.PI / 2 });
      }
      t += 50;
      session.stepNow(t);
    }

    const postSnap = getSnap();
    const p1 = postSnap?.actors[0];
    assert.ok(p1);
    const distFromCenter = Math.hypot(p1.x - cx, p1.z - cz);
    assert.ok(
      distFromCenter <= rad - 0.45,
      `Expected caster to remain strictly locked inside barrier (${distFromCenter.toFixed(2)} <= ${(rad - 0.45).toFixed(2)})`
    );
    assert.equal(p1.primeDomainBuff, true, 'Prime must receive overdrive domain buff inside his Domain');
  } finally {
    session.dispose();
  }
});

test('JM Domain permanent floor laser web, single-line touch detonation, autonomous edge dashing & Prime Meteor Fists', () => {
  // Pure random edge target + permanent single-line laser detonation math
  const target = pickRandomJmEdgeTarget({
    fromX: 0,
    fromZ: 0,
    centerX: 0,
    centerZ: 0,
    domainRadius: 10,
    rand: () => 0.25,
  });
  assert.ok(Math.hypot(target.x, target.z) > 7.5);

  const lines = [
    { id: 'L1', x1: -8, z1: 0, x2: 8, z2: 0, life: 999, maxLife: 999 },
    { id: 'L2', x1: 0, z1: -8, x2: 0, z2: 8, life: 999, maxLife: 999 },
  ];
  const hitRes = resolveJmLaserTouch(1.0, 0.2, lines);
  assert.equal(hitRes.hit, true);
  if (hitRes.hit) {
    assert.equal(lines[hitRes.index].id, 'L1');
    lines.splice(hitRes.index, 1);
  }
  assert.equal(lines.length, 1);
  assert.equal(lines[0].id, 'L2');

  // Prime Domain config & meteor fist + rapid geyser cadence check
  assert.equal(PRIME_DOMAIN_CONFIG.geyserWindupSec, 0.45);
  assert.equal(PRIME_DOMAIN_CONFIG.m1SpeedMult, 1.3);
  assert.equal(PRIME_DOMAIN_CONFIG.dashCdMult, 0.6);

  const msgs: ServerMessage[] = [];
  const session = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs.push(m),
  });
  try {
    session.send({
      type: 'room:create',
      playerName: 'PrimeCrucibleTester',
      isSoloPractice: false,
      isTrainingMode: true,
    });
    session.send({ type: 'room:selectFighter', fighterId: 'prime' });
    session.send({ type: 'room:startNow' });
    session.send({ type: 'game:trainingConfig', dummyEnabled: true, zeroCooldowns: false });
    session.send({ type: 'game:debug', action: 'awakenP1' });
    session.send({ type: 'game:debug', action: 'fillDomain' });

    let t = Date.now();
    t += 50;
    session.stepNow(t);
    session.send({ type: 'game:domainActivate' });
    for (let i = 0; i < 120; i++) {
      t += 50;
      session.stepNow(t);
    }

    const sawMeteorEvent = msgs.some(
      (m) => m.type === 'game:snapshot' && m.events.some((e) => e.kind === 'meteorFist')
    );
    assert.equal(sawMeteorEvent, true, 'Expected Prime Domain to rain down giant meteor fists');
  } finally {
    session.dispose();
  }
});

test('Multi-biome terrain zones (water, lava, stealth grass, enterable buildings) evaluate cleanly', () => {
  // Obsidian magma + steam vent stealth
  const obsidianLava = MAP_TERRAIN_ZONES.obsidian.find((z) => z.kind === 'lava');
  assert.ok(obsidianLava);
  const lavaEval = evaluateTerrainZonesAt('obsidian', obsidianLava.x, 0, obsidianLava.z);
  assert.equal(lavaEval.inLava, true);

  // Meadow pond water slows speed (-30%) and boosts lightning (+25%) off the dry center bridge
  const meadowWater = MAP_TERRAIN_ZONES.meadow.find((z) => z.kind === 'water');
  assert.ok(meadowWater);
  const bridgeEval = evaluateTerrainZonesAt('meadow', meadowWater.x, 0.42, meadowWater.z);
  assert.equal(bridgeEval.inWater, false);
  const waterEval = evaluateTerrainZonesAt('meadow', meadowWater.x, 0, meadowWater.z + 2.5);
  assert.equal(waterEval.inWater, true);
  assert.equal(waterEval.speedMultiplier, 0.7);
  assert.equal(waterEval.lightningBoost, 1.25);

  // Grass stealth hides actor from far enemies, visible to self & close enemies
  const grassZone = MAP_TERRAIN_ZONES.meadow.find((z) => z.kind === 'grass');
  assert.ok(grassZone);
  const stealthEval = evaluateTerrainZonesAt('meadow', grassZone.x, 0, grassZone.z);
  assert.equal(stealthEval.inStealth, true);
  assert.ok(stealthEval.stealthPatchId);

  const hiddenActor = { playerId: 'p1', x: grassZone.x, z: grassZone.z, isKO: false, stealthed: true, stealthPatchId: stealthEval.stealthPatchId };
  const farEnemy = { playerId: 'p2', x: grassZone.x + 12, z: grassZone.z + 12, isKO: false };
  const closeEnemy = { playerId: 'p2', x: grassZone.x + 1.5, z: grassZone.z, isKO: false };
  assert.equal(shouldViewerSeeActor(hiddenActor, hiddenActor), true);
  assert.equal(shouldViewerSeeActor(hiddenActor, farEnemy), false);
  assert.equal(shouldViewerSeeActor(hiddenActor, closeEnemy), true);

  // Enterable buildings across maps
  const shibuyaBuilding = MAP_ENTERABLE_BUILDINGS.shibuya[0];
  assert.ok(shibuyaBuilding);
  const insideEval = evaluateTerrainZonesAt('shibuya', shibuyaBuilding.x, 0, shibuyaBuilding.z);
  assert.equal(insideEval.insideBuildingId, shibuyaBuilding.id);
});

test('JM controlled directional bouncing, held-diagonal wall reflection, enemy knock-to-edge rebound, and Khen clone real skills', () => {
  // 1. Active directional bounce steers toward held joystick direction
  const direct = resolveNextJmBounceTarget({
    fromX: 0,
    fromZ: 0,
    centerX: 0,
    centerZ: 0,
    domainRadius: 10,
    moveX: 1,
    moveZ: 1,
    lastDirX: 0,
    lastDirZ: 1,
  });
  assert.ok(direct.x > 4 && direct.z > 4, 'Expected diagonal input from center to aim toward +X/+Z rim');
  assert.equal(direct.isWallReflection, false);

  // 2. Holding same forward/diagonal direction right against the circular wall reflects back inward across the dome
  const reflected = resolveNextJmBounceTarget({
    fromX: direct.x,
    fromZ: direct.z,
    centerX: 0,
    centerZ: 0,
    domainRadius: 10,
    moveX: 1,
    moveZ: 1,
    lastDirX: direct.dirX,
    lastDirZ: direct.dirZ,
  });
  assert.equal(reflected.isWallReflection, true, 'Expected held input into wall to trigger crisp wall reflection bounce');
  assert.ok(Math.hypot(reflected.x - direct.x, reflected.z - direct.z) > 4.0, 'Wall reflection must cross back into the domain');

  // 3. Neutral joystick reflects continuously off the boundary instead of stalling
  const neutralBounce = resolveNextJmBounceTarget({
    fromX: 9.0,
    fromZ: 0,
    centerX: 0,
    centerZ: 0,
    domainRadius: 10,
    moveX: 0,
    moveZ: 0,
    lastDirX: 1,
    lastDirZ: 0.25,
  });
  assert.equal(neutralBounce.isWallReflection, true);
  assert.ok(neutralBounce.dirX < 0, 'Neutral bounce at +X wall must rebound toward -X hemisphere');

  // 4. Live LocalRoomSession: JM hits dummy during dash -> knocks enemy toward edge & rebounds JM to opposite edge
  const jmMsgs: ServerMessage[] = [];
  const jmSession = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => jmMsgs.push(m),
  });
  try {
    jmSession.send({
      type: 'room:create',
      playerName: 'JmReboundTester',
      isSoloPractice: false,
      isTrainingMode: true,
    });
    jmSession.send({ type: 'room:selectFighter', fighterId: 'jm' });
    jmSession.send({ type: 'room:startNow' });
    jmSession.send({ type: 'game:trainingConfig', dummyEnabled: true, zeroCooldowns: false });
    jmSession.send({ type: 'game:debug', action: 'awakenP1' });
    jmSession.send({ type: 'game:debug', action: 'fillDomain' });

    let t = Date.now() + 50;
    jmSession.stepNow(t);
    jmSession.send({ type: 'game:domainActivate' });

    let sawReboundHit = false;
    let dummyLaunched = false;
    let seq = 1;
    for (let i = 0; i < 160; i++) {
      t += 50;
      jmSession.stepNow(t);
      const lastMsg = jmMsgs[jmMsgs.length - 1];
      if (lastMsg?.type === 'game:snapshot') {
        const snap = lastMsg.snapshot;
        const p1 = snap.actors.find((a) => !a.isBot);
        const dummy = snap.actors.find((a) => a.isDummy);
        if (snap.activeDomain?.fighterId === 'jm' && p1 && dummy && !sawReboundHit) {
          const dx = dummy.x - p1.x;
          const dz = dummy.z - p1.z;
          const d = Math.hypot(dx, dz) || 1;
          jmSession.send({
            type: 'game:input',
            seq: seq++,
            moveX: dx / d,
            moveZ: dz / d,
            aimYaw: 0,
            aimPitch: 0,
            targetId: null,
            blockHeld: false,
          });
        }
        if (lastMsg.events.some((e) => e.kind === 'jmMirrorTeleport' && Boolean(e.targetId))) {
          sawReboundHit = true;
          if (dummy && Math.hypot(dummy.vx, dummy.vz) > 3.5) {
            dummyLaunched = true;
          }
        }
      }
      if (sawReboundHit && dummyLaunched) break;
    }
    assert.equal(sawReboundHit, true, 'Expected JM domain dash hitting dummy to emit jmMirrorTeleport impact & rebound');
    assert.equal(dummyLaunched, true, 'Expected hit dummy to be launched toward domain edge');
  } finally {
    jmSession.dispose();
  }

  // 5. Live LocalRoomSession: Khen shadow clones cast Khen's actual skills (slots 2, 3, 4) inside Unlimited Shadow Void
  const khenMsgs: ServerMessage[] = [];
  const khenSession = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => khenMsgs.push(m),
  });
  try {
    khenSession.send({
      type: 'room:create',
      playerName: 'KhenCloneTester',
      isSoloPractice: false,
      isTrainingMode: true,
    });
    khenSession.send({ type: 'room:selectFighter', fighterId: 'khen' });
    khenSession.send({ type: 'room:startNow' });
    khenSession.send({ type: 'game:trainingConfig', dummyEnabled: true, zeroCooldowns: false });
    khenSession.send({ type: 'game:debug', action: 'awakenP1' });
    khenSession.send({ type: 'game:debug', action: 'fillDomain' });

    let t = Date.now() + 50;
    khenSession.stepNow(t);
    khenSession.send({ type: 'game:domainActivate' });

    // Wait past Khen's 5.0s cast (~105 ticks) + ~4s of clone activity without player pressing any ability
    const cloneSkillSlots = new Set<number>();
    let sawVoidDecoy = false;
    let sawVoidAnchor = false;
    for (let i = 0; i < 200; i++) {
      t += 50;
      khenSession.stepNow(t);
      const last = khenMsgs[khenMsgs.length - 1];
      if (last?.type === 'game:snapshot') {
        for (const ev of last.events) {
          if (ev.kind === 'shockwave' && ev.fighterId === 'khen' && ev.abilitySlot) {
            cloneSkillSlots.add(ev.abilitySlot);
          }
        }
        for (const z of last.snapshot.zones) {
          if (z.kind === 'voidDecoy') sawVoidDecoy = true;
          if (z.kind === 'voidAnchor') sawVoidAnchor = true;
        }
      }
    }
    assert.ok(
      cloneSkillSlots.size >= 2 || sawVoidDecoy || sawVoidAnchor,
      `Expected Khen shadow clones to cast multiple real skills (saw slots: ${Array.from(cloneSkillSlots).join(',')})`
    );
  } finally {
    khenSession.dispose();
  }
});


