import assert from 'node:assert/strict';
import test from 'node:test';
import { GameRoomEngine, type SocketLike } from '../server/gameRoomEngine.ts';
import type {
  ArenaSnapshot,
  ClientMessage,
  CombatEvent,
  MapId,
  ServerMessage,
  TacticalItemKind,
} from '../shared/gameData.ts';
import { MAP_TERRAIN_ZONES } from './mapLogic.ts';

interface TestClient {
  socket: SocketLike;
  playerId: string;
  latestSnapshot: ArenaSnapshot | null;
  events: CombatEvent[];
}

function createHarness(options: {
  mapId: MapId;
  fighterId?: 'prime' | 'jm' | 'khen' | 'marjohn' | 'damen';
  isTrainingMode?: boolean;
  dummyEnabled?: boolean;
}) {
  const engine = new GameRoomEngine({ autoTick: false });
  let now = Date.now() + 40;

  const client: TestClient & { latestObstacles: NonNullable<ArenaSnapshot['obstacles']> } = {
    playerId: '',
    latestSnapshot: null,
    latestObstacles: [],
    events: [],
    socket: {
      readyState: 1,
      send() {},
      onServerMessage(msg: ServerMessage) {
        if (msg.type === 'room:joined') {
          client.playerId = msg.playerId;
        } else if (msg.type === 'game:snapshot') {
          client.latestSnapshot = msg.snapshot;
          if (msg.snapshot.obstacles && msg.snapshot.obstacles.length > 0) {
            client.latestObstacles = msg.snapshot.obstacles;
          }
          if (msg.events.length > 0) {
            client.events.push(...msg.events);
          }
        }
      },
    },
  };

  const send = (msg: ClientMessage) => engine.dispatchMessage(client.socket, msg);
  const stepSeconds = (sec: number, dtMs = 40) => {
    const steps = Math.ceil((sec * 1000) / dtMs);
    for (let i = 0; i < steps; i++) {
      now += dtMs;
      engine.step(now);
    }
  };

  send({
    type: 'room:create',
    playerName: 'Tester',
    isSoloPractice: !options.isTrainingMode,
    isTrainingMode: Boolean(options.isTrainingMode),
  });
  send({ type: 'room:selectFighter', fighterId: options.fighterId ?? 'prime' });
  send({ type: 'room:selectMap', mapId: options.mapId });
  if (options.isTrainingMode) {
    send({
      type: 'game:trainingConfig',
      dummyEnabled: options.dummyEnabled ?? true,
      zeroCooldowns: true,
    });
  }
  send({ type: 'room:setReady', ready: true });
  send({ type: 'room:startNow' });
  // Advance past 5.0s countdown into live combat
  stepSeconds(5.3);

  // Access room internals cleanly via private rooms map for precise setup assertions in tests
  const roomsMap = (engine as unknown as { rooms: Map<string, any> }).rooms;
  const room = Array.from(roomsMap.values())[0];

  return {
    engine,
    client,
    room,
    send,
    stepSeconds,
    cleanup: () => engine.dispose(),
  };
}

test('Strength orb triggers magnetic pull and grants +20% damage buff for 10s', () => {
  const h = createHarness({ mapId: 'temple', isTrainingMode: true, dummyEnabled: true });
  try {
    const me = h.room.actors.find((a: any) => a.playerId === h.client.playerId);
    const strengthOrb = h.room.pickups.find((p: any) => p.kind === 'strength');
    assert.ok(me && strengthOrb, 'Temple should spawn strength orb');

    // Place actor on same platform within magnet range (2.6m < 3.8m pull radius, outside 1.25m instant collect)
    me.x = strengthOrb.homeX - 2.6;
    me.z = strengthOrb.homeZ;
    me.y = Math.max(0, (strengthOrb.homeY ?? 0.5) - 0.5);
    me.grounded = true;

    h.stepSeconds(0.08);
    assert.equal(strengthOrb.magnetTargetId, me.playerId, 'Orb should lock onto nearby player magnetically');
    assert.ok(strengthOrb.x < strengthOrb.homeX, 'Orb should physically pull toward player');

    // Step until orb completes magnetic pull & is collected
    h.stepSeconds(0.6);
    assert.equal(strengthOrb.active, false);
    assert.ok(me.strengthBuffTimer > 9.0, `Expected ~10s strength buff, got ${me.strengthBuffTimer}`);
    assert.ok(h.client.events.some((ev) => ev.kind === 'strengthBuff' && ev.targetId === me.playerId));
  } finally {
    h.cleanup();
  }
});

test('All 6 One-Time Tactical Items consume permanently on use and apply real effects', () => {
  const h = createHarness({ mapId: 'temple', isTrainingMode: true, dummyEnabled: true });
  try {
    const me = h.room.actors.find((a: any) => a.playerId === h.client.playerId);
    const dummy = h.room.actors.find((a: any) => a.isDummy);
    assert.ok(me && dummy);

    const equipAndVerifyDrop = (kind: TacticalItemKind) => {
      const drop = h.room.itemDrops.find((d: any) => d.kind === kind);
      assert.ok(drop, `Missing item drop ${kind}`);
      drop.active = true;
      drop.x = me.x + 0.3;
      drop.y = me.y + 0.6;
      drop.z = me.z;
      h.stepSeconds(0.08);
      assert.equal(me.heldItem, kind, `Expected player to pick up ${kind}`);
    };

    // 1. Crimson Might Elixir (+12% permanent damage, consumed once)
    equipAndVerifyDrop('crimson_elixir');
    h.send({ type: 'game:useItem' });
    assert.equal(me.heldItem, null);
    assert.equal(me.permanentDamageBonus, 0.12);
    // Re-invoking useItem while empty is a no-op
    h.send({ type: 'game:useItem' });
    assert.equal(me.permanentDamageBonus, 0.12);

    // 2. Gale Stride Boots (+1.5 speed & 15% faster dash cooldown)
    equipAndVerifyDrop('gale_boots');
    h.send({ type: 'game:useItem' });
    assert.equal(me.heldItem, null);
    assert.equal(me.permanentSpeedBonus, 1.5);
    assert.equal(me.dashCooldownMult, 0.85);

    // 3. Aegis Core Shard (+20% max HP & instant +35% HP heal)
    const baseMaxHp = me.maxHp;
    me.hp = Math.round(baseMaxHp * 0.4);
    equipAndVerifyDrop('aegis_shard');
    h.send({ type: 'game:useItem' });
    assert.equal(me.heldItem, null);
    assert.equal(me.maxHp, Math.round(baseMaxHp * 1.2));
    assert.equal(me.hp, Math.round(baseMaxHp * 0.4) + Math.round(me.maxHp * 0.35));

    // 4. Seismic Shock Grenade (knocks back enemy & shatters destructible cover)
    const destructibleObs = h.room.obstacles.find((o: any) => o.destructible && !o.destroyed);
    assert.ok(destructibleObs, 'Expected destructible obstacle on temple');
    destructibleObs.hp = 60;
    me.x = destructibleObs.x - 3.5;
    me.z = destructibleObs.z;
    dummy.x = destructibleObs.x;
    dummy.z = destructibleObs.z;
    dummy.y = 0;
    equipAndVerifyDrop('shock_grenade');
    h.send({ type: 'game:useItem', aimX: destructibleObs.x, aimZ: destructibleObs.z });
    assert.equal(me.heldItem, null);
    assert.equal(destructibleObs.destroyed, true, 'Shock grenade should shatter destructible cover');
    assert.ok(dummy.yVel > 4.0, 'Shock grenade should launch nearby enemy upward');

    // 5. Cryo Flash Capsule (slows enemies & freezes water tile)
    const pond = MAP_TERRAIN_ZONES.temple.find((z) => z.kind === 'water');
    assert.ok(pond);
    me.x = pond.x - 4.0;
    me.z = pond.z;
    dummy.x = pond.x + 1.0;
    dummy.z = pond.z;
    dummy.slowTimer = 0;
    equipAndVerifyDrop('cryo_capsule');
    h.send({ type: 'game:useItem', aimX: pond.x + 0.5, aimZ: pond.z });
    h.stepSeconds(0.08);
    assert.equal(me.heldItem, null);
    assert.ok((h.client.latestSnapshot?.frozenWaterZones?.length ?? 0) >= 1, 'Cryo capsule should freeze water tile');
    assert.ok(dummy.slowTimer >= 2.5, 'Cryo capsule should slow target');

    // 6. Gravity Vortex Canister (pulls enemies inward toward vortex center)
    me.x = 0;
    me.z = 0;
    const vortexX = 5.0;
    const vortexZ = 0;
    dummy.x = 8.4;
    dummy.z = 0;
    dummy.vx = 0;
    equipAndVerifyDrop('gravity_vortex');
    h.send({ type: 'game:useItem', aimX: vortexX, aimZ: vortexZ });
    assert.equal(me.heldItem, null);
    h.stepSeconds(0.5);
    assert.ok(dummy.x < 8.4, `Expected dummy to be pulled inward toward x=5, got x=${dummy.x}`);
  } finally {
    h.cleanup();
  }
});

test('Obsidian Volcano spawns falling meteor boulders that smash & drop destructible cover', () => {
  const h = createHarness({ mapId: 'obsidian', isTrainingMode: false });
  try {
    // Force volcano eruption on event 0
    h.room.nextEventAt = h.room.matchTime + 0.05;
    h.room.eventRotationIdx = 0;
    h.stepSeconds(0.15);

    assert.equal(h.room.battleEvent?.kind, 'volcano_eruption');
    assert.equal(h.room.pendingMeteors.length, 4);
    assert.equal(h.client.latestSnapshot?.battleEvent?.secondaryPoints?.length, 4);

    // Advance until all 4 meteors impact
    h.stepSeconds(3.8);
    assert.equal(h.room.pendingMeteors.length, 0);
    const volcRocks = h.client.latestObstacles.filter((o) => o.id.startsWith('volc-rock-'));
    assert.equal(volcRocks.length, 4, 'Meteors should create 4 destructible volcanic rock boulders');
    assert.ok(h.client.events.some((ev) => ev.kind === 'meteorBoulder'));
  } finally {
    h.cleanup();
  }
});

test('Sunken Bamboo Temple 200-HP NPC Duel Boss (100% spawn): peaceful shield -> mirror duel -> 20s Awakening Orb drop', () => {
  const h = createHarness({ mapId: 'temple', fighterId: 'prime', isTrainingMode: false });
  try {
    const me = h.room.actors.find((a: any) => a.playerId === h.client.playerId);
    const npcState = h.client.latestSnapshot?.templeNpc;
    assert.ok(npcState && npcState.active, 'Temple NPC must always spawn at 100%');
    assert.equal(npcState.hp, 200);
    assert.equal(npcState.maxHp, 200);
    assert.equal(npcState.hostile, false);

    const npcActor = h.room.actors.find((a: any) => a.playerId === npcState.actorId);
    assert.ok(npcActor);

    // Move right up to peaceful NPC and M1 attack -> must remain invulnerable at 200 HP
    me.x = npcActor.x;
    me.z = npcActor.z + 1.3;
    me.rotY = Math.PI;
    h.send({ type: 'game:ability', slot: 0, aimYaw: Math.PI, aimX: npcActor.x, aimZ: npcActor.z });
    h.stepSeconds(0.5);
    assert.equal(npcActor.hp, 200, 'Peaceful NPC should not take damage before challenge');

    // Accept duel challenge -> mirrors challenger fighter & turns hostile
    h.send({ type: 'game:npcDialogue', choice: 'fight' });
    h.stepSeconds(0.1);
    assert.equal(h.client.latestSnapshot?.templeNpc?.hostile, true);
    assert.equal(h.client.latestSnapshot?.templeNpc?.fighterId, 'prime');

    // Defeat hostile NPC from 2.4m away (>1.9m orb pickup radius, <3.25m M1 range) -> drops 20s Awakening Orb
    npcActor.hp = 5;
    npcActor.vx = 0;
    npcActor.vz = 0;
    npcActor.actionState = 'idle';
    npcActor.actionTimer = 0;
    me.x = npcActor.x;
    me.z = npcActor.z + 2.4;
    me.vx = 0;
    me.vz = 0;
    me.mana = 100;
    me.actionState = 'idle';
    me.actionTimer = 0;
    me.cooldowns = [0, 0, 0, 0, 0, 0, 0];
    me.rotY = Math.atan2(npcActor.x - me.x, npcActor.z - me.z);
    h.send({ type: 'game:ability', slot: 0, aimYaw: me.rotY, aimX: npcActor.x, aimZ: npcActor.z });
    h.stepSeconds(0.2);

    assert.equal(h.client.latestSnapshot?.templeNpc?.defeated, true);
    const npcOrb = h.room.awakeningOrbs.find((o: any) => o.id.startsWith('npc-aorb-'));
    assert.ok(npcOrb, 'Defeating NPC boss must drop an Awakening Orb');
    assert.ok((npcOrb.remaining ?? 0) > 18.0 && (npcOrb.remaining ?? 0) <= 20.0, 'Dropped orb must have 20s lifespan');
    assert.ok(npcOrb.y < 3.5, `Awakening orb relative height must not double-add terrain (y=${npcOrb.y})`);
    assert.equal(me.awakened, false, 'Player should awaken upon walking onto the dropped orb');

    // Walk onto Awakening Orb -> player immediately awakens!
    me.x = npcOrb.x;
    me.z = npcOrb.z;
    me.y = npcOrb.y - 0.9;
    h.stepSeconds(0.15);
    assert.equal(me.awakened, true, 'Collecting NPC boss Awakening Orb should awaken player');
  } finally {
    h.cleanup();
  }
});
