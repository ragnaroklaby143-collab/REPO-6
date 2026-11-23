import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer, WebSocket as WsClient } from 'ws';
import {
  advanceActionTimer,
  applyHorizontalCameraDrag,
  applyObstacleDamage,
  canApplyStun,
  computeAwakeningOrbCountdownSec,
  computeCenterFacingCamera,
  computeConeForwardVector,
  computeContactShadowTransform,
  computeCountdownStep,
  computeFreeHorizontalCamera,
  computeHudScale,
  computeLockedTopDownCamera,
  computeObstacleCameraPullIn,
  computeStormRadiusAtTime,
  computeSwipeAimPoint,
  computeTraumaShake,
  computeVolleyProjectileDamage,
  createFrameTimeRing,
  dampAngle,
  dampScalar,
  isPointInBeamCorridor,
  isPointInFanCone,
  projectToMinimapPercent,
  reconcilePredictedPosition,
  recordFrameTime,
  resolveCappedStunDuration,
  resolveProjectileHitRadius,
  sanitizeChatText,
  selectNearestTarget,
  shouldBroadcastMultiplayerSnapshot,
  shouldEnterDragAim,
  shouldScanBotVision,
  shouldThrottleUpdate,
  stepHorizontalVelocity,
  stepHomingProjectileVelocity,
  STUN_HEAVY_ULT_MAX_SEC,
  STUN_MIN_SEC,
  STUN_NORMAL_MAX_SEC,
} from './combatMath.ts';
import { LocalRoomSession } from './localRoomClient.ts';
import {
  canEnterArena,
  computeFavoriteFighterFromHistory,
  isAdminEmail,
} from './userLogic.ts';
import { GameRoomEngine } from '../server/gameRoomEngine.ts';
import type { ServerMessage } from '../shared/gameData.ts';
import {
  calculateMatchCoinReward,
  loadAccountStore,
  loginOrCreateAccount,
  logoutAccount,
  recordMatchReward,
  type StorageLike,
} from './accountStore.ts';
import {
  FIGHTERS,
  FIGHTER_BY_ID,
  FIGHTER_SKINS,
  MAPS,
  SKIN_ORDER,
  createInitialObstacleStates,
  createMatchObstacleStates,
  getDamagePhase,
  getMapTerrainHeight,
  pointHitsObstacle,
  resolveObstacleCollisions,
  type MapId,
  type MapObstacle,
} from '../shared/gameData.ts';

function makeMemoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem(k) {
      return data.get(k) ?? null;
    },
    setItem(k, v) {
      data.set(k, v);
    },
  };
}

test('dampScalar converges monotonically toward target regardless of step subdivision', () => {
  const singleStep = dampScalar(0, 10, 12, 0.05);
  let threeSteps = 0;
  for (let i = 0; i < 3; i++) {
    threeSteps = dampScalar(threeSteps, 10, 12, 0.05 / 3);
  }
  assert.ok(Math.abs(singleStep - threeSteps) < 1e-6);
  assert.ok(singleStep > 0 && singleStep < 10);
});

test('dampAngle wraps cleanly across +/- PI boundary', () => {
  const start = Math.PI - 0.1;
  const target = -Math.PI + 0.1;
  const next = dampAngle(start, target, 20, 0.016);
  assert.ok(next > start);
});

test('computeContactShadowTransform shrinks and softens shadow with elevation', () => {
  const grounded = computeContactShadowTransform(0);
  const airborne = computeContactShadowTransform(4);
  assert.equal(grounded.scale, 1);
  assert.ok(airborne.scale < grounded.scale);
  assert.ok(airborne.opacity < grounded.opacity);
  assert.ok(airborne.opacity >= 0.14);
});

test('advanceActionTimer advances active attack timers smoothly without underflowing', () => {
  assert.ok(Math.abs(advanceActionTimer('attack', 0.25, 0.016) - 0.234) < 1e-9);
  assert.equal(advanceActionTimer('attack', 0.01, 0.05), 0);
  assert.equal(advanceActionTimer('idle', 0.5, 0.016), 0.5);
});

test('computeTraumaShake decays cleanly to zero at zero trauma', () => {
  const zero = computeTraumaShake(0, 1.5);
  assert.deepEqual(zero, { x: 0, y: 0, z: 0, roll: 0 });
  const low = computeTraumaShake(0.2, 2.0);
  const high = computeTraumaShake(0.8, 2.0);
  assert.ok(
    Math.hypot(high.x, high.y, high.z) > Math.hypot(low.x, low.y, low.z)
  );
});

test('computeObstacleCameraPullIn pulls camera closer when an obstacle blocks line of sight', () => {
  const obstacles: MapObstacle[] = [
    {
      id: 'test-pillar',
      kind: 'pillar',
      x: 0,
      z: 6,
      halfW: 1.5,
      halfD: 1.5,
      topY: 5,
      colorHex: 0x334155,
      roofColorHex: 0x475569,
    },
  ];
  const t = computeObstacleCameraPullIn(
    0,
    1.5,
    0,
    0,
    1.5,
    12,
    obstacles,
    'temple',
    getMapTerrainHeight
  );
  assert.ok(t < 1.0 && t >= 0.32);
});

test('computeLockedTopDownCamera provides MLBB isometric pitch (~58deg), center bias, and balanced rear framing', () => {
  const edge = computeLockedTopDownCamera(18, 0, -10, false);
  assert.ok(edge.elevationDeg >= 55 && edge.elevationDeg <= 61);
  assert.equal(edge.yaw, Math.PI);
  // Biased toward center (0,0) in X and Z, plus rear (+Z) framing compensation
  assert.ok(edge.lookX > 0 && edge.lookX < 18);
  assert.ok(edge.lookZ > -10 && edge.lookZ < 0);
  assert.ok(edge.camZ > edge.lookZ && edge.camY > edge.lookY);
  assert.ok(edge.camY < 17.2);
  const flying = computeLockedTopDownCamera(18, 4, -10, true);
  assert.ok(flying.camY > edge.camY);
  const portrait = computeLockedTopDownCamera(20, 0, 10, false, undefined, undefined, true);
  assert.ok(Math.abs(portrait.lookX - 20) <= 2.61);
});

test('projectToMinimapPercent projects world positions cleanly onto [6..94]% bounds', () => {
  assert.deepEqual(projectToMinimapPercent(0, 0, 38), { leftPct: 50, topPct: 50 });
  const east = projectToMinimapPercent(38, 0, 38);
  assert.equal(east.leftPct, 94);
  const clamped = projectToMinimapPercent(-999, 999, 38);
  assert.equal(clamped.leftPct, 6);
  assert.equal(clamped.topPct, 94);
});

test('admin gate strictly allows sullenshades@gmail.com and computes favorite fighter from history', () => {
  assert.equal(isAdminEmail('sullenshades@gmail.com'), true);
  assert.equal(isAdminEmail('  SullenShades@Gmail.com '), true);
  assert.equal(isAdminEmail('other@gmail.com'), false);
  assert.equal(isAdminEmail(null), false);

  const fav = computeFavoriteFighterFromHistory(
    [
      { matchId: '1', mapId: 'shibuya', fighterId: 'damen', won: true, kills: 2, damageDealt: 100, coinsEarned: 80, mode: 'arena', timestampMs: 1 },
      { matchId: '2', mapId: 'temple', fighterId: 'jm', won: true, kills: 3, damageDealt: 140, coinsEarned: 90, mode: 'arena', timestampMs: 2 },
      { matchId: '3', mapId: 'shibuya', fighterId: 'damen', won: false, kills: 1, damageDealt: 70, coinsEarned: 40, mode: 'arena', timestampMs: 3 },
    ],
    'prime'
  );
  assert.equal(fav, 'damen');
  assert.equal(computeFavoriteFighterFromHistory([], 'khen'), 'khen');
});

test('shouldEnterDragAim enforces 15px move or 160ms hold threshold so quick taps stay auto-aim', () => {
  assert.equal(shouldEnterDragAim(0, 40), false);
  assert.equal(shouldEnterDragAim(14.9, 159), false);
  assert.equal(shouldEnterDragAim(15, 30), true);
  assert.equal(shouldEnterDragAim(2, 160), true);
});

test('selectNearestTarget chooses closest alive foe within range', () => {
  const list = [
    { playerId: 'p1', x: 0, z: 0, isKO: false },
    { playerId: 'p2', x: 9, z: 0, isKO: false },
    { playerId: 'p3', x: 3, z: 4, isKO: false }, // dist 5
    { playerId: 'p4', x: 1, z: 0, isKO: true },  // KO ignored
  ];
  const hit = selectNearestTarget(0, 0, 'p1', list, 10);
  assert.equal(hit?.playerId, 'p3');
  assert.equal(selectNearestTarget(0, 0, 'p1', list, 4), null);
});

test('computeSwipeAimPoint maps swipe direction to clamped world coordinates', () => {
  const upAim = computeSwipeAimPoint(2, 5, 0, -1, 10);
  assert.ok(upAim.z < 5 && Math.hypot(upAim.x - 2, upAim.z - 5) <= 10.01);
  const farAim = computeSwipeAimPoint(0, 0, 2, 0, 10);
  assert.ok(Math.abs(farAim.x - 10) < 1e-6);
});

test('computeStormRadiusAtTime activates at 60s with +40% shrink speed (1.19m/s) and pauses on Awakening Orbs spawn', () => {
  assert.deepEqual(computeStormRadiusAtTime(59.9, 57, false), { active: false, radius: 57 });
  const at60 = computeStormRadiusAtTime(60.0, 57, false);
  const at70 = computeStormRadiusAtTime(70.0, 57, false);
  assert.equal(at60.active, true);
  assert.equal(at60.radius, 57);
  assert.ok(Math.abs(at70.radius - (57 - 11.9)) < 1e-4, `Expected 40% faster 10s shrink to 45.1, got ${at70.radius}`);
  assert.deepEqual(computeStormRadiusAtTime(90.0, 57, true), { active: false, radius: 57 });
  // Once orbs spawn, storm is removed completely
  assert.deepEqual(computeStormRadiusAtTime(92.0, 57, false, true), { active: false, radius: 57 });
});

test('computeCenterFacingCamera always faces inward toward map center (0,0) with origin deadzone', () => {
  // Player at West (-20, 0) -> camera sits behind (-X), looks East (+X) toward (0,0)
  const west = computeCenterFacingCamera(-20, 0, 0, Math.PI);
  assert.ok(west.camX < west.lookX);
  assert.ok(west.lookX > -20);
  const dirWestX = west.lookX - west.camX;
  const dirWestZ = west.lookZ - west.camZ;
  assert.ok(dirWestX > 0 && Math.abs(dirWestZ) < 1e-4);

  // Player at North (0, -20) -> camera sits North of player, looks South (+Z) toward (0,0)
  const north = computeCenterFacingCamera(0, 0, -20, Math.PI);
  assert.ok(north.camZ < north.lookZ && north.lookZ > -20);

  // Near origin deadzone preserves prevYaw to prevent 180-deg flip
  const nearZero = computeCenterFacingCamera(0.2, 0, 0.1, 1.23);
  assert.equal(nearZero.targetYaw, 1.23);
});

test('computeAwakeningOrbCountdownSec counts down to 90s only for non-training 1v1 PRE_AWAKENING', () => {
  assert.equal(
    computeAwakeningOrbCountdownSec({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 2,
      matchTime: 0,
    }),
    90
  );
  assert.equal(
    computeAwakeningOrbCountdownSec({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 2,
      matchTime: 44.2,
    }),
    46
  );
  assert.equal(
    computeAwakeningOrbCountdownSec({
      isTrainingMode: true,
      phase: 'PRE_AWAKENING',
      initialActorCount: 2,
      matchTime: 10,
    }),
    null
  );
  assert.equal(
    computeAwakeningOrbCountdownSec({
      isTrainingMode: false,
      phase: 'ORBS_ACTIVE',
      initialActorCount: 2,
      matchTime: 91,
    }),
    null
  );
  assert.equal(
    computeAwakeningOrbCountdownSec({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 4,
      matchTime: 10,
    }),
    null
  );
  assert.equal(
    computeAwakeningOrbCountdownSec({
      isTrainingMode: false,
      phase: 'PRE_AWAKENING',
      initialActorCount: 4,
      matchTime: 45,
      awakeningCountdown: 24.34,
    }),
    24.3
  );
});

test('destructible obstacles block until destroyed and then allow free movement & projectiles', () => {
  const obsList = createInitialObstacleStates('shibuya');
  assert.ok(obsList.length >= 4);
  const target = obsList[0];
  assert.equal(target.destroyed, false);
  assert.equal(pointHitsObstacle('shibuya', target.x, 1.0, target.z, obsList), true);

  const half = applyObstacleDamage(target.hp, 45);
  assert.equal(half.destroyed, false);
  target.hp = half.hp;
  target.destroyed = half.destroyed;
  assert.equal(pointHitsObstacle('shibuya', target.x, 1.0, target.z, obsList), true);

  const broke = applyObstacleDamage(target.hp, 999);
  assert.equal(broke.destroyed, true);
  target.hp = broke.hp;
  target.destroyed = broke.destroyed;
  assert.equal(pointHitsObstacle('shibuya', target.x, 1.0, target.z, obsList), false);

  const pos = resolveObstacleCollisions('shibuya', target.x, 0, target.z, 0.5, obsList);
  assert.equal(pos.x, target.x);
  assert.equal(pos.z, target.z);
});

test('accountStore persists accounts, coin rewards, and logout/re-login cleanly', () => {
  const storage = makeMemoryStorage();
  let store = loadAccountStore(storage);
  assert.equal(store.activeUsername, null);

  const res = loginOrCreateAccount(store, 'AlexBrawler', 1000, storage);
  assert.ok(res);
  store = res.store;
  assert.equal(res.created, true);
  assert.equal(res.account.coins, 100);

  const reward = calculateMatchCoinReward({
    won: true,
    kills: 2,
    damageDealt: 180,
    isTrainingMode: false,
  });
  assert.ok(reward.total >= 80);

  const updated = recordMatchReward(store, res.account.username, reward, true, 2, storage);
  store = updated.store;
  assert.equal(updated.account?.coins, 100 + reward.total);
  assert.equal(updated.account?.wins, 1);

  store = logoutAccount(store, storage);
  assert.equal(store.activeUsername, null);

  const reloaded = loadAccountStore(storage);
  assert.equal(reloaded.accounts.alexbrawler.coins, 100 + reward.total);
});

test('shared gameData speed tiers (10/9/9/7/7), Shibuya map, keybind hints, and M1 balance are valid', () => {
  assert.equal(FIGHTERS.length, 5);
  assert.equal(MAPS.length, 4);
  assert.ok(MAPS.some((m) => m.id === 'shibuya'));

  // Exact Speed Tiers
  assert.equal(FIGHTER_BY_ID.prime.moveSpeed, 10);
  assert.equal(FIGHTER_BY_ID.jm.moveSpeed, 9);
  assert.equal(FIGHTER_BY_ID.khen.moveSpeed, 9);
  assert.equal(FIGHTER_BY_ID.marjohn.moveSpeed, 7);
  assert.equal(FIGHTER_BY_ID.damen.moveSpeed, 7);

  // Snappier melee M1 vs measured ranged M1
  assert.ok(FIGHTER_BY_ID.jm.abilities[0].cooldown < 0.5);
  assert.ok(FIGHTER_BY_ID.prime.abilities[0].cooldown < 0.5);
  assert.ok(FIGHTER_BY_ID.khen.abilities[0].cooldown < 0.5);
  assert.equal(FIGHTER_BY_ID.damen.abilities[0].cooldown, 0.8);
  assert.equal(FIGHTER_BY_ID.marjohn.abilities[0].cooldown, 0.9);

  // Keybind hints match M1, F, 1, 2, 3
  for (const f of FIGHTERS) {
    assert.equal(f.abilities[0].keyHint, 'M1');
    assert.equal(f.abilities[1].keyHint, 'F');
    assert.equal(f.abilities[2].keyHint, '1');
    assert.equal(f.abilities[3].keyHint, '2');
    assert.equal(f.abilities[4].keyHint, '3');
    for (const s of SKIN_ORDER) {
      assert.ok(FIGHTER_SKINS[f.id][s].name.length > 0);
    }
  }

  for (const m of MAPS) {
    assert.ok(m.arenaRadius >= 37);
  }
  assert.equal(getDamagePhase(100, 100, false), 'NORMAL');
  assert.equal(getDamagePhase(60, 100, false), 'DAMAGED');
  assert.equal(getDamagePhase(30, 100, false), 'SEVERELY DAMAGED');
  assert.equal(getDamagePhase(10, 100, false), 'CRITICAL');
  assert.equal(getDamagePhase(0, 100, true), 'DEFEATED');
});

test('computeConeForwardVector aligns -PI/2 cone rotation with +Z cast yaw across all directions', () => {
  const angles = [0, Math.PI / 2, -Math.PI / 2, Math.PI, 0.7, -1.25];
  for (const yaw of angles) {
    const fixed = computeConeForwardVector(-Math.PI / 2, yaw);
    const expectedX = Math.sin(yaw);
    const expectedZ = Math.cos(yaw);
    assert.ok(
      Math.hypot(fixed.x - expectedX, fixed.z - expectedZ) < 1e-5,
      `yaw=${yaw} expected (${expectedX}, ${expectedZ}), got (${fixed.x}, ${fixed.z})`
    );
    // Verify the old +PI/2 sign pointed 180 degrees opposite
    const oldBuggy = computeConeForwardVector(Math.PI / 2, yaw);
    assert.ok(Math.hypot(oldBuggy.x + expectedX, oldBuggy.z + expectedZ) < 1e-5);
  }
});

test('sanitizeChatText strips control chars, collapses whitespace, caps length, and rejects blank input', () => {
  assert.equal(sanitizeChatText(''), null);
  assert.equal(sanitizeChatText('   \n\t  '), null);
  assert.equal(sanitizeChatText(12345), null);
  assert.equal(sanitizeChatText('  Hello\u0007   world!\n\nGG '), 'Hello world! GG');
  const long = 'a'.repeat(240);
  assert.equal(sanitizeChatText(long)?.length, 160);
});

test('computeCountdownStep maps 5s countdown values into 5..1 or 0 for FIGHT', () => {
  assert.equal(computeCountdownStep(5.0), 5);
  assert.equal(computeCountdownStep(4.05), 5);
  assert.equal(computeCountdownStep(4.0), 4);
  assert.equal(computeCountdownStep(3.2), 4);
  assert.equal(computeCountdownStep(1.0), 1);
  assert.equal(computeCountdownStep(0.01), 1);
  assert.equal(computeCountdownStep(0), 0);
  assert.equal(computeCountdownStep(-0.4), 0);
});

test('canEnterArena enforces mandatory Google login in live config and blocks banned or disconnected accounts', () => {
  assert.equal(
    canEnterArena({
      isPlaceholderConfig: false,
      hasCloudUser: false,
      hasLocalAccount: true,
      isBanned: false,
      connectionStatus: 'connected',
    }).allowed,
    false
  );
  assert.equal(
    canEnterArena({
      isPlaceholderConfig: false,
      hasCloudUser: true,
      hasLocalAccount: false,
      isBanned: false,
      connectionStatus: 'connected',
    }).allowed,
    true
  );
  assert.equal(
    canEnterArena({
      isPlaceholderConfig: true,
      hasCloudUser: false,
      hasLocalAccount: true,
      isBanned: false,
      connectionStatus: 'connected',
    }).allowed,
    true
  );
  assert.equal(
    canEnterArena({
      isPlaceholderConfig: false,
      hasCloudUser: true,
      hasLocalAccount: true,
      isBanned: true,
      connectionStatus: 'connected',
    }).allowed,
    false
  );
  assert.equal(
    canEnterArena({
      isPlaceholderConfig: false,
      hasCloudUser: true,
      hasLocalAccount: true,
      isBanned: false,
      connectionStatus: 'connecting',
    }).allowed,
    false
  );
});

test('GameRoomEngine broadcasts room:chat messages, replays chatHistory on join, and starts a 5s fight countdown', async () => {
  const engine = new GameRoomEngine();
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => engine.handleConnection(ws));

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const url = `ws://127.0.0.1:${addr.port}`;

  const connectClient = async () => {
    const ws = new WsClient(url);
    const msgs: ServerMessage[] = [];
    ws.on('message', (raw) => {
      msgs.push(JSON.parse(String(raw)) as ServerMessage);
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    const waitFor = async <T extends ServerMessage['type']>(type: T) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const hit = msgs.find((m) => m.type === type);
        if (hit) return hit as Extract<ServerMessage, { type: T }>;
        await new Promise((r) => setTimeout(r, 15));
      }
      throw new Error(`Timed out waiting for ${type}`);
    };
    return { ws, msgs, waitFor };
  };

  let c1: Awaited<ReturnType<typeof connectClient>> | null = null;
  let c2: Awaited<ReturnType<typeof connectClient>> | null = null;
  try {
    c1 = await connectClient();
    c1.ws.send(JSON.stringify({ type: 'room:create', playerName: 'HostOne' }));
    const joined1 = await c1.waitFor('room:joined');
    assert.deepEqual(joined1.chatHistory ?? [], []);

    // Send a chat message before second player joins so chatHistory replay is verified
    c1.ws.send(JSON.stringify({ type: 'room:chat', text: '  GLHF   everyone! ' }));
    const chat1 = await c1.waitFor('room:chat');
    assert.equal(chat1.message.text, 'GLHF everyone!');
    assert.equal(chat1.message.senderName, 'HostOne');

    c2 = await connectClient();
    c2.ws.send(JSON.stringify({ type: 'room:join', roomCode: joined1.room.roomCode, playerName: 'GuestTwo' }));
    const joined2 = await c2.waitFor('room:joined');
    assert.equal(joined2.chatHistory?.length, 1);
    assert.equal(joined2.chatHistory?.[0].text, 'GLHF everyone!');

    // Wait past 300ms rate limit and verify live broadcast back to c1 & c2
    await new Promise((r) => setTimeout(r, 340));
    c1.msgs.length = 0;
    c2.msgs.length = 0;
    c2.ws.send(JSON.stringify({ type: 'room:chat', text: 'Ready up!' }));
    const [b1, b2] = await Promise.all([c1.waitFor('room:chat'), c2.waitFor('room:chat')]);
    assert.equal(b1.message.text, 'Ready up!');
    assert.equal(b2.message.senderName, 'GuestTwo');

    // Start match and confirm 5-second countdown begins
    c1.ws.send(JSON.stringify({ type: 'room:selectFighter', fighterId: 'damen' }));
    c1.ws.send(JSON.stringify({ type: 'room:selectSkin', skinId: 'obsidian' }));
    c2.ws.send(JSON.stringify({ type: 'room:selectFighter', fighterId: 'jm' }));
    c2.ws.send(JSON.stringify({ type: 'room:selectSkin', skinId: 'crimson' }));
    await new Promise((r) => setTimeout(r, 60));
    c1.msgs.length = 0;
    c1.ws.send(JSON.stringify({ type: 'room:startNow' }));

    const deadline = Date.now() + 3000;
    let countdownState: Extract<ServerMessage, { type: 'room:state' }>['room'] | null = null;
    while (Date.now() < deadline && !countdownState) {
      for (const m of c1.msgs) {
        if (m.type === 'room:state' && m.room.phase === 'countdown') {
          countdownState = m.room;
          break;
        }
      }
      if (!countdownState) await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(countdownState, 'expected room to enter countdown phase');
    assert.ok(countdownState.countdown >= 4.5 && countdownState.countdown <= 5.01);
  } finally {
    c1?.ws.close();
    c2?.ws.close();
    engine.dispose();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('stepHorizontalVelocity is frame-rate independent across 33Hz server and 100Hz client ticks', () => {
  // Single 0.03s server step vs three 0.01s client steps
  const serverStep = stepHorizontalVelocity(0, 0, 1, 0, 10, 0.03, true, false);
  let vx = 0;
  let vz = 0;
  for (let i = 0; i < 3; i++) {
    const res = stepHorizontalVelocity(vx, vz, 1, 0, 10, 0.01, true, false);
    vx = res.vx;
    vz = res.vz;
  }
  assert.ok(Math.abs(serverStep.vx - vx) < 1e-6);
  assert.ok(Math.abs(serverStep.vz - vz) < 1e-6);
  assert.equal(serverStep.moving, true);

  // Diagonal > 1 gets normalized cleanly while partial analog (< 1) preserves slower pace
  const diag = stepHorizontalVelocity(0, 0, 1, 1, 10, 0.05, true, false);
  const axis = stepHorizontalVelocity(0, 0, 1, 0, 10, 0.05, true, false);
  assert.ok(Math.abs(Math.hypot(diag.vx, diag.vz) - Math.hypot(axis.vx, axis.vz)) < 1e-5);

  const analog = stepHorizontalVelocity(0, 0, 0.4, 0, 10, 0.05, true, false);
  assert.ok(analog.vx < axis.vx * 0.5);

  // Marjohn airborne acceleration is snappier than default
  const marjohnAir = stepHorizontalVelocity(0, 0, 1, 0, 10, 0.016, true, true);
  const ground = stepHorizontalVelocity(0, 0, 1, 0, 10, 0.016, true, false);
  assert.ok(marjohnAir.vx > ground.vx);

  // Braking decays cleanly to zero
  const braked = stepHorizontalVelocity(0.005, 0, 0, 0, 10, 0.05, true, false);
  assert.equal(braked.vx, 0);
  assert.equal(braked.moving, false);
});

test('reconcilePredictedPosition ignores micro-jitter, damps medium error with velocity lead, and snaps large teleport error', () => {
  // Deadband (< 0.14m from velocity-lead server target): untouched
  const deadband = reconcilePredictedPosition({
    predX: 1.05,
    predZ: 0,
    serverX: 0.8,
    serverZ: 0,
    serverVx: 10,
    serverVz: 0,
    leadSec: 0.03, // targetX = 1.1 -> err = 0.05
    dt: 0.016,
  });
  assert.equal(deadband.snapped, false);
  assert.equal(deadband.x, 1.05);

  // Medium drift (0.14..2.4m): smoothly pulled toward velocity-lead target
  const damped = reconcilePredictedPosition({
    predX: 1.0,
    predZ: 0,
    serverX: 1.5,
    serverZ: 0,
    serverVx: 10,
    serverVz: 0,
    leadSec: 0.02, // targetX = 1.7 -> err = 0.7
    dt: 0.016,
  });
  assert.equal(damped.snapped, false);
  assert.ok(damped.x > 1.0 && damped.x < 1.7);

  // Large discrepancy (> 2.4m): snaps cleanly
  const snapped = reconcilePredictedPosition({
    predX: 0,
    predZ: 0,
    serverX: 5,
    serverZ: 0,
    serverVx: 0,
    serverVz: 0,
    leadSec: 0,
    dt: 0.016,
  });
  assert.equal(snapped.snapped, true);
  assert.equal(snapped.x, 5);
});

test('createMatchObstacleStates builds rich varied layouts with jumpable platforms and clear spawn center across all maps', () => {
  const mapIds: MapId[] = ['shibuya', 'meadow', 'temple', 'obsidian'];
  for (const mapId of mapIds) {
    const layoutA = createMatchObstacleStates(mapId, 11111);
    const layoutB = createMatchObstacleStates(mapId, 99999);
    assert.ok(layoutA.length >= 12, `${mapId} should have at least 12 obstacles`);
    const jumpables = layoutA.filter((o) => (o.kind === 'platform' || o.kind === 'bridge') && o.topY > 0.4 && o.topY <= 1.85);
    assert.ok(jumpables.length >= 4, `${mapId} should include jumpable high-ground platforms (got ${jumpables.length})`);
    for (const o of layoutA) {
      assert.ok(Math.hypot(o.x, o.z) >= 8.0 || o.topY <= 1.6, `${mapId} obstacle ${o.id} should not block center spawn`);
    }
    const diffCount = layoutA.filter((o, idx) => o.x !== layoutB[idx]?.x || o.z !== layoutB[idx]?.z).length;
    assert.ok(diffCount >= 3, `${mapId} distinct match seeds should vary obstacle positions`);
  }
});

test('isPointInBeamCorridor and isPointInFanCone accurately detect targets in front corridor and fan', () => {
  // Beam along +Z from (0, 0) range 18, halfWidth 2.4
  assert.equal(isPointInBeamCorridor(1.8, 10, 0, 0, 0, 1, 18, 2.4), true);
  assert.equal(isPointInBeamCorridor(3.5, 10, 0, 0, 0, 1, 18, 2.4), false);
  assert.equal(isPointInBeamCorridor(0, -3, 0, 0, 0, 1, 18, 2.4), false);

  // Fan cone facing +Z range 16, minDot 0.65 (~49 deg half-angle)
  assert.equal(isPointInFanCone(0, 12, 0, 0, 0, 1, 16, 0.65), true);
  assert.equal(isPointInFanCone(12, 0, 0, 0, 0, 1, 16, 0.65), false);
  assert.equal(isPointInFanCone(0, 20, 0, 0, 0, 1, 16, 0.65), false);
});

test('stepHomingProjectileVelocity curves velocity toward moving enemy within turnRate', () => {
  const res = stepHomingProjectileVelocity(0, 10, 0, 0, 10, 0, 10, 4.0, 0.05);
  assert.ok(res.vx > 0, 'should begin turning right (+X) toward target at (10, 0)');
  assert.ok(Math.abs(Math.hypot(res.vx, res.vz) - 10) < 1e-5, 'speed magnitude should stay constant');
});

test('shouldThrottleUpdate caps updates at target FPS and permits elapsed intervals', () => {
  assert.equal(shouldThrottleUpdate(1000, 0, 12), true);
  assert.equal(shouldThrottleUpdate(1040, 1000, 12), false);
  assert.equal(shouldThrottleUpdate(1090, 1000, 12), true);
});

test('computeCenterFacingCamera uses pulled-back ~16.4 distance and balanced look lead', () => {
  const cam = computeCenterFacingCamera(0, 0, -12, 0);
  const distToLook = Math.hypot(cam.camX - cam.lookX, cam.camY - cam.lookY, cam.camZ - cam.lookZ);
  assert.ok(distToLook >= 16.0, `expected pulled-back camera distance to look >= 16.0, got ${distToLook}`);
  const distToPlayer = Math.hypot(cam.camX - 0, cam.camY - 1.05, cam.camZ - -12);
  assert.ok(distToPlayer >= 15.0, `expected pulled-back camera distance to player >= 15.0, got ${distToPlayer}`);
  const lead = Math.hypot(cam.lookX - 0, cam.lookZ - -12);
  assert.ok(lead <= 2.2, `expected balanced look lead <= 2.2, got ${lead}`);
});

test('shouldBroadcastMultiplayerSnapshot throttles remote snapshots to 20Hz (50ms) unless urgent', () => {
  assert.equal(shouldBroadcastMultiplayerSnapshot(1000, 0, false), true);
  assert.equal(shouldBroadcastMultiplayerSnapshot(1030, 1000, false), false);
  assert.equal(shouldBroadcastMultiplayerSnapshot(1050, 1000, false), true);
  assert.equal(shouldBroadcastMultiplayerSnapshot(1010, 1000, true), true);
});

test('shouldScanBotVision throttles bot vision scans to 10Hz (100ms)', () => {
  const first = shouldScanBotVision(0, 0.016, 0.1);
  assert.equal(first.shouldScan, true);
  assert.equal(first.nextTimerSec, 0.1);

  const mid = shouldScanBotVision(first.nextTimerSec, 0.05, 0.1);
  assert.equal(mid.shouldScan, false);
  assert.ok(Math.abs(mid.nextTimerSec - 0.05) < 1e-6);

  const ready = shouldScanBotVision(mid.nextTimerSec, 0.05, 0.1);
  assert.equal(ready.shouldScan, true);
  assert.equal(ready.nextTimerSec, 0.1);
});

test('createFrameTimeRing and recordFrameTime compute smoothed FPS and frameTimeMs without allocations', () => {
  const ring = createFrameTimeRing(4);
  recordFrameTime(ring, 16.67);
  recordFrameTime(ring, 16.67);
  recordFrameTime(ring, 16.67);
  const res = recordFrameTime(ring, 16.67);
  assert.equal(res.fps, 60);
  assert.ok(Math.abs(res.frameTimeMs - 16.7) <= 0.2);

  // Overwrites ring circularly without growing buffer
  const over = recordFrameTime(ring, 33.33);
  assert.equal(ring.samples.length, 4);
  assert.ok(over.fps < 60 && over.fps >= 40);
});

test('LocalRoomSession runs a Solo vs Bot match entirely in memory and omits unchanged obstacles after initial broadcast', () => {
  const msgs: ServerMessage[] = [];
  const session = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs.push(m),
  });

  try {
    session.send({ type: 'net:ping', clientSendTime: 1234 });
    const pong = msgs.find((m) => m.type === 'net:pong');
    assert.ok(pong && pong.type === 'net:pong' && pong.clientSendTime === 1234);

    session.send({
      type: 'room:create',
      playerName: 'LocalHero',
      isSoloPractice: true,
      isTrainingMode: false,
    });
    const joined = msgs.find((m) => m.type === 'room:joined');
    assert.ok(joined && joined.type === 'room:joined');
    assert.equal(joined.room.isSoloPractice, true);

    session.send({ type: 'room:selectFighter', fighterId: 'jm' });
    session.send({ type: 'room:startNow' });

    // Advance past 5-second countdown into combat
    let t = Date.now();
    for (let i = 0; i < 120; i++) {
      t += 50;
      session.stepNow(t);
    }

    const combatSnapshots = msgs.filter(
      (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
    );
    assert.ok(combatSnapshots.length >= 2, 'expected snapshots to be emitted');
    // First snapshot includes obstacles; subsequent unchanged ticks omit obstacles array
    assert.ok((combatSnapshots[0].snapshot.obstacles?.length ?? 0) >= 4);
    const laterWithoutObstacles = combatSnapshots.slice(1).some((s) => s.snapshot.obstacles === undefined);
    assert.equal(laterWithoutObstacles, true, 'expected unchanged obstacles to be omitted on subsequent ticks');

    // Local movement & M1 ability work synchronously with zero network
    session.send({
      type: 'game:input',
      seq: 1,
      moveX: 1,
      moveZ: 0,
      aimYaw: Math.PI / 2,
      aimPitch: 0,
      targetId: null,
      blockHeld: false,
    });
    session.send({
      type: 'game:ability',
      seq: 2,
      slot: 0,
      aimYaw: Math.PI / 2,
      aimPitch: 0,
    });
    t += 50;
    session.stepNow(t);

    const lastSnap = combatSnapshots[combatSnapshots.length - 1].snapshot;
    assert.equal(lastSnap.actors.length, 2);
  } finally {
    session.dispose();
  }
});

test('computeVolleyProjectileDamage and resolveProjectileHitRadius prevent multi-bullet shotgun 1-shots', () => {
  // Base High Noon Fan: 16 base dmg, capped at 3 hits with [1.0, 0.5, 0.35] decay
  assert.equal(computeVolleyProjectileDamage(16, 0, 3), 16);
  assert.equal(computeVolleyProjectileDamage(16, 1, 3), 8);
  assert.equal(computeVolleyProjectileDamage(16, 2, 3), 6);
  assert.equal(computeVolleyProjectileDamage(16, 3, 3), 0);
  assert.equal(computeVolleyProjectileDamage(16, 6, 3), 0);

  // Tightened bullet / magnum hitboxes
  assert.equal(resolveProjectileHitRadius('bullet'), 0.85);
  assert.equal(resolveProjectileHitRadius('magnum'), 1.05);
  assert.ok(resolveProjectileHitRadius('bullet') < 1.0);
  assert.ok(resolveProjectileHitRadius('magnum') < 1.2);
});

test('Damen base High Noon Fan and Awakened abilities never one-shot a target in GameRoomEngine', () => {
  const msgs: ServerMessage[] = [];
  const session = new LocalRoomSession({
    autoTick: false,
    onMessage: (m) => msgs.push(m),
  });

  try {
    session.send({
      type: 'room:create',
      playerName: 'DamenTester',
      isSoloPractice: false,
      isTrainingMode: true,
    });
    const joined = msgs.find(
      (m): m is Extract<ServerMessage, { type: 'room:joined' }> => m.type === 'room:joined'
    );
    assert.ok(joined);

    session.send({ type: 'room:selectFighter', fighterId: 'damen' });
    session.send({ type: 'room:startNow' });

    // Skip countdown & enable training dummy
    let t = Date.now();
    session.send({ type: 'game:debug', action: 'resetCooldowns' });
    session.send({ type: 'game:trainingConfig', dummyEnabled: true, zeroCooldowns: false });
    t += 60;
    session.stepNow(t);

    const getActors = () => {
      const snaps = msgs.filter(
        (m): m is Extract<ServerMessage, { type: 'game:snapshot' }> => m.type === 'game:snapshot'
      );
      return snaps[snaps.length - 1]?.snapshot.actors ?? [];
    };

    let actors = getActors();
    let damen = actors.find((a) => a.fighterId === 'damen');
    let dummy = actors.find((a) => a.isDummy);
    assert.ok(damen && dummy);
    assert.equal(damen.maxHp, 122);

    // Move Damen close (~2.5m) facing the dummy and fire High Noon Fan (slot 4)
    const yawToDummy = Math.atan2(dummy.x - damen.x, dummy.z - damen.z);
    session.send({
      type: 'game:input',
      seq: 1,
      moveX: 0,
      moveZ: 0,
      aimYaw: yawToDummy,
      aimPitch: 0,
      targetId: dummy.playerId,
      blockHeld: false,
    });
    session.send({
      type: 'game:ability',
      seq: 2,
      slot: 4,
      aimYaw: yawToDummy,
      aimPitch: 0,
      targetId: dummy.playerId,
    });

    for (let i = 0; i < 30; i++) {
      t += 40;
      session.stepNow(t);
    }

    actors = getActors();
    dummy = actors.find((a) => a.isDummy)!;
    const baseFanDamage = dummy.maxHp - dummy.hp;
    assert.ok(baseFanDamage >= 12, `expected High Noon Fan to land meaningful damage, got ${baseFanDamage}`);
    assert.ok(
      baseFanDamage <= 55,
      `High Noon Fan dealt ${baseFanDamage} damage — must not 1-shot or melt`
    );

    // Awaken Damen & test Empowered High Noon (slot 4) + Infinite Arsenal Fan (slot 6)
    session.send({ type: 'game:debug', action: 'awakenP1' });
    session.send({ type: 'game:debug', action: 'resetCooldowns' });
    // Let dummy regen or check delta before/after
    const hpBeforeEmpowered = getActors().find((a) => a.isDummy)!.hp;
    session.send({
      type: 'game:ability',
      seq: 3,
      slot: 4,
      aimYaw: yawToDummy,
      aimPitch: 0,
      targetId: dummy.playerId,
    });
    for (let i = 0; i < 20; i++) {
      t += 40;
      session.stepNow(t);
    }
    const hpAfterEmpowered = getActors().find((a) => a.isDummy)!.hp;
    const empoweredFanDamage = Math.max(0, hpBeforeEmpowered - hpAfterEmpowered);
    assert.ok(
      empoweredFanDamage <= 65,
      `Empowered High Noon dealt ${empoweredFanDamage} damage — must not 1-shot`
    );

    // Test Infinite Arsenal Fan (slot 6) does not double-dip into a 200+ DMG melt
    session.send({ type: 'game:debug', action: 'resetCooldowns' });
    const hpBeforeArsenal = getActors().find((a) => a.isDummy)!.hp;
    session.send({
      type: 'game:ability',
      seq: 4,
      slot: 6,
      aimYaw: yawToDummy,
      aimPitch: 0,
      targetId: dummy.playerId,
    });
    for (let i = 0; i < 70; i++) {
      t += 40;
      session.stepNow(t);
    }
    const hpAfterArsenal = getActors().find((a) => a.isDummy)!.hp;
    const arsenalDamage = Math.max(0, hpBeforeArsenal - hpAfterArsenal);
    assert.ok(
      arsenalDamage <= 95,
      `Infinite Arsenal Fan dealt ${arsenalDamage} damage — must not melt/one-shot`
    );
  } finally {
    session.dispose();
  }
});

test('computeFreeHorizontalCamera tracks horizontal X freely without pulling toward center while keeping Y pitch locked', () => {
  const left = computeFreeHorizontalCamera(-25, 0, -6, false);
  const right = computeFreeHorizontalCamera(25, 0, -6, false);
  assert.equal(left.yaw, Math.PI);
  assert.equal(right.yaw, Math.PI);
  assert.equal(left.lookX, -25);
  assert.equal(left.camX, -25);
  assert.equal(right.lookX, 25);
  assert.equal(right.camX, 25);
  // Vertical elevation & pitch offset stay strictly locked regardless of X position
  assert.equal(left.camY, right.camY);
  assert.equal(left.lookY, right.lookY);
  assert.equal(left.elevationDeg, right.elevationDeg);

  // Default framing pulls back ~15-20% (dist=19.6) with lowered behind-shoulder pitch (0.62 rad ~35.5 deg)
  assert.ok(left.elevationDeg >= 34.5 && left.elevationDeg <= 36.5, `Expected lowered camera pitch ~35.5 deg, got ${left.elevationDeg}`);
  const camDist = Math.hypot(left.camX - left.lookX, left.camY - left.lookY, left.camZ - left.lookZ);
  assert.ok(Math.abs(camDist - 19.6) < 0.05, `Expected pulled-back distance ~19.6, got ${camDist}`);

  // Horizontal X-axis drag rotates camera around player while keeping vertical pitch & height strictly locked
  const rotatedYaw = applyHorizontalCameraDrag(Math.PI, 120);
  assert.notEqual(rotatedYaw, Math.PI);
  const rotatedCam = computeFreeHorizontalCamera(4, 0, -2, false, 0.84, 17.0, false, rotatedYaw);
  const baseCam = computeFreeHorizontalCamera(4, 0, -2, false, 0.84, 17.0, false, Math.PI);
  assert.equal(rotatedCam.camY, baseCam.camY);
  assert.equal(rotatedCam.lookY, baseCam.lookY);
  assert.equal(rotatedCam.elevationDeg, baseCam.elevationDeg);
  assert.notEqual(rotatedCam.camX, baseCam.camX);
});

test('global stun caps (0.35-0.75s normal, 1.1s ult max), recovery stun immunity, HUD scaling, and Marjohn buffs', () => {
  assert.equal(resolveCappedStunDuration(0.1, false), STUN_MIN_SEC);
  assert.equal(resolveCappedStunDuration(2.5, false), STUN_NORMAL_MAX_SEC);
  assert.equal(resolveCappedStunDuration(2.5, true), STUN_HEAVY_ULT_MAX_SEC);
  assert.equal(canApplyStun(0), true);
  assert.equal(canApplyStun(0.8), false);

  const mobileScale = computeHudScale(390, 844, true);
  const desktopScale = computeHudScale(1280, 720, false);
  const largeScale = computeHudScale(1920, 1080, false);
  assert.ok(mobileScale >= 0.76 && mobileScale <= 1.18);
  assert.ok(desktopScale >= 0.76 && desktopScale <= 1.18);
  assert.ok(largeScale >= desktopScale);

  // Marjohn buffed wind blade base damage (14) and upgraded skills
  assert.ok(FIGHTER_BY_ID.marjohn.abilities[0].damage >= 14);
  assert.ok(FIGHTER_BY_ID.marjohn.abilities[2].damage >= 23);
  assert.ok(FIGHTER_BY_ID.marjohn.abilities[4].damage >= 42);
});



