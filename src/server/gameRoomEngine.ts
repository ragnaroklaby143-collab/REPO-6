export interface SocketLike {
  readyState: number;
  send(data: string): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  onServerMessage?: (msg: ServerMessage) => void;
}
const SOCKET_OPEN = 1;
import type {
  AbilitySlot,
  AbyssalCloneState,
  ArenaActorState,
  ArenaItemDrop,
  ArenaPickup,
  ArenaSnapshot,
  ArenaTurretState,
  ArenaZoneKind,
  ArenaZoneState,
  AwakeningBannerState,
  AwakeningOrbState,
  BattlefieldEventKind,
  BattlefieldEventState,
  ClashState,
  ClientMessage,
  CombatEvent,
  CombatMoveType,
  DomainCastState,
  DomainClashState,
  DomainExpansionState,
  FrozenWaterZone,
  GameModeId,
  HeadlockState,
  JudgementSpearState,
  KoCause,
  KothZoneState,
  MapId,
  MatchAwakeningPhase,
  ObstacleState,
  ProjectileState,
  RoomChatMessage,
  RoomPlayer,
  RoomState,
  ServerMessage,
  SkinId,
  TacticalItemKind,
  TeamId,
  TelegraphKind,
  TelegraphState,
  TempleNpcState,
  TrainingConfig,
} from '../shared/gameData.ts';
import {
  ASCENDED_ABILITIES,
  FIGHTER_BY_ID,
  FIGHTERS,
  GAME_MODE_BY_ID,
  JM_SECRET_ABILITY,
  MAPS,
  MAP_BY_ID,
  SKIN_ORDER,
  TACTICAL_ITEMS_BY_KIND,
  createInitialObstacleStates,
  findObstacleAtPoint,
  getDamagePhase,
  getMapItemDropSpawns,
  getMapPickupSpawns,
  getMapTerrainHeight,
  getObstacleSupportY,
  hasAscendedAbility,
  isJtinsullenTag,
  resolveObstacleCollisions,
} from '../shared/gameData.ts';
import { AWAKENING_CONFIG, getAwakenedAbility } from '../shared/awakeningConfig.ts';
import {
  STUN_RECOVERY_IMMUNITY_SEC,
  applyObstacleDamage,
  canApplyStun,
  computeVolleyProjectileDamage,
  findBestEnemyClusterTarget,
  resolveCappedStunDuration,
  resolveProjectileHitRadius,
  sanitizeChatText,
  shouldBroadcastMultiplayerSnapshot,
  shouldScanBotVision,
  stepHomingProjectileVelocity,
  stepHorizontalVelocity,
  substepMotionAndCollision,
} from '../game/combatMath.ts';
import { computeAbilityResourceCost, resolveActorBaseMoveSpeed } from '../game/awakeningLogic.ts';
import { addDomainCharge, areActorsAllied, PRIME_DOMAIN_CONFIG } from '../game/domainLogic.ts';
import {
  MAP_TERRAIN_ZONES,
  TEMPLE_NPC_SPAWN,
  computeTrainRushPosition,
  evaluateTerrainZonesAt,
  getMapStatic3DZones,
  rollTempleNpcSpawn,
} from '../game/mapLogic.ts';
import {
  type DummyDpsTracker,
  createDummyDpsTracker,
  recordDummyDamageHit,
  refreshDummyDps,
  resetDummyDpsTracker,
} from '../game/dummyDps.ts';
import type {
  AwakeningActor,
  AwakeningHostHelpers,
  AwakeningRoomState,
} from './awakeningEngine.ts';
import {
  applyDirectStun,
  awakenActorImmediate,
  cancelCutsceneGracefully,
  executeAwakenedAbilityImpact,
  handleAwakeningDebug,
  handleAwakeningMash,
  landMarjohnFlight,
  resetRoomAwakeningState,
  resolveCutsceneClash,
  setupAwakenedAbilityWindup,
  skipCutsceneToClash,
  syncCutsceneAudioClock,
  tickAwakenedChannel,
  tickAwakenedZoneBehavior,
  tickAwakeningRoom,
} from './awakeningEngine.ts';
import {
  canJmCancelM1,
  computeParryBlinkBehind,
  resolveJmBaseSkill2Mode,
  shouldKeepFlightDuringChannel,
} from '../game/jmComboLogic.ts';
import {
  type DomainModeRoomState,
  createInitialKothZone,
  enforceDomainBarrierForActor,
  enforceDomainBarriers,
  getCastingDomainCasterSpeedMultiplier,
  getDomainChargeMultiplier,
  getModeAbilityCooldownFactor,
  handleDomainActivate,
  handleDomainClashMash,
  recordDomainClashDamage,
  registerDamenDomainBulletHit,
  tickDomainAndModes,
  tryCancelCastingDomainOnHit,
} from './domainEngine.ts';

const STANDALONE_DASH_COOLDOWN = 1.5;

interface ConnectedClient {
  ws: SocketLike;
  playerId: string | null;
  roomCode: string | null;
}

interface InternalPlayer extends RoomPlayer {
  reconnectToken: string;
  disconnectedAt: number | null;
}

interface InternalActor extends AwakeningActor {
  botScanTimer?: number;
  botTargetId?: string | null;
  botDangerDirX?: number;
  botDangerDirZ?: number;
  botDangerActive?: boolean;
  botOrbDirX?: number;
  botOrbDirZ?: number;
  botOrbDist?: number;
  lavaBurnTimer?: number;
  terrainWaterMult?: number;
  dummyDpsTracker?: DummyDpsTracker;
}

interface InternalProjectile extends ProjectileState {
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

interface InternalZone extends ArenaZoneState {
  tickTimer: number;
  hitCooldowns: Record<string, number>;
}

interface InternalTelegraph extends TelegraphState {
  elapsed: number;
  windup: number;
}

interface InternalPickup extends ArenaPickup {
  respawnTimer: number;
  homeX: number;
  homeY: number;
  homeZ: number;
}

interface InternalItemDrop extends ArenaItemDrop {
  respawnTimer: number;
  homeX: number;
  homeY: number;
  homeZ: number;
}

interface PendingMeteor {
  id: string;
  x: number;
  z: number;
  radius: number;
  remaining: number;
  maxRemaining: number;
}

interface InternalBattleEvent extends BattlefieldEventState {
  hazardDetonated: boolean;
}

interface InternalTurret extends ArenaTurretState {
  fireTimer: number;
  burstIndex: number;
}

interface InternalAbyssalClone extends AbyssalCloneState {
  vx: number;
  vz: number;
  attackCd: number;
  dashCd: number;
  flankAngle: number;
}

interface InternalJudgementSpear extends JudgementSpearState {
  nextWaveAt: number;
  hitThisWave: Set<string>;
}

interface RoomInstance extends DomainModeRoomState {
  roomCode: string;
  hostId: string;
  phase: RoomState['phase'];
  mapId: MapId;
  gameMode: GameModeId;
  isSoloPractice: boolean;
  isTrainingMode: boolean;
  trainingConfig: TrainingConfig;
  countdown: number;
  matchTime: number;
  roundNumber: number;
  winsToWin: number;
  roundWinnerId: string | null;
  victoryDelayTimer: number;
  winnerId: string | null;
  players: InternalPlayer[];
  actors: InternalActor[];
  initialActorCount: number;
  projectiles: InternalProjectile[];
  zones: InternalZone[];
  telegraphs: InternalTelegraph[];
  pickups: InternalPickup[];
  itemDrops: InternalItemDrop[];
  frozenWaterZones: FrozenWaterZone[];
  templeNpc: TempleNpcState | null;
  pendingMeteors: PendingMeteor[];
  turrets: InternalTurret[];
  abyssalClones: InternalAbyssalClone[];
  judgementSpears: InternalJudgementSpear[];
  obstacles: ObstacleState[];
  battleEvent: InternalBattleEvent | null;
  nextEventAt: number;
  eventRotationIdx: number;
  activeClash: ClashState | null;
  activeHeadlock: HeadlockState | null;
  castingDomain: DomainCastState | null;
  activeDomain: DomainExpansionState | null;
  activeDomainClash: (DomainClashState & { p1Overdrive?: number }) | null;
  kothZone: KothZoneState | null;
  teamScores: { alpha: number; beta: number };
  modeTimer: number;
  raidBossId: string | null;
  stormActive: boolean;
  stormRadius: number;
  stormMaxRadius: number;
  stormCenterX: number;
  stormCenterZ: number;
  stormTickTimer: number;
  lastInputSeq: Record<string, number>;
  pendingEvents: CombatEvent[];
  eventSeq: number;
  lastEmptyAt: number;
  chatHistory: RoomChatMessage[];
  lastChatAt: Record<string, number>;
  awakeningPhase: MatchAwakeningPhase;
  awakeningOrbs: AwakeningOrbState[];
  awakeningBanner: AwakeningBannerState | null;
  awakeningCutscene: AwakeningRoomState['awakeningCutscene'];
  awakeningDelayedHits: AwakeningRoomState['awakeningDelayedHits'];
  lastSnapshotBroadcastMs: number;
  obstaclesDirty: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export class GameRoomEngine {
  private rooms = new Map<string, RoomInstance>();
  private clients = new Map<SocketLike, ConnectedClient>();
  private playerSockets = new Map<string, SocketLike>();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickMs = Date.now();

  constructor(options?: { autoTick?: boolean; tickMs?: number }) {
    const autoTick = options?.autoTick ?? true;
    const tickMs = options?.tickMs ?? 30;
    if (autoTick) {
      this.tickInterval = setInterval(() => this.tick(), tickMs);
    }
  }

  public dispose(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  public registerSocket(ws: SocketLike): void {
    if (!this.clients.has(ws)) {
      this.clients.set(ws, { ws, playerId: null, roomCode: null });
    }
  }

  public dispatchMessage(ws: SocketLike, msg: ClientMessage): void {
    this.registerSocket(ws);
    this.handleMessage(ws, msg);
  }

  public disconnectSocket(ws: SocketLike): void {
    this.handleDisconnect(ws);
  }

  public step(nowMs = Date.now()): void {
    this.tick(nowMs);
  }

  public handleConnection(ws: SocketLike): void {
    this.registerSocket(ws);

    ws.on?.('message', (raw: unknown) => {
      try {
        const msg = JSON.parse(String(raw)) as ClientMessage;
        this.handleMessage(ws, msg);
      } catch {
        this.send(ws, { type: 'room:error', message: 'Invalid message payload.' });
      }
    });

    ws.on?.('close', () => {
      this.handleDisconnect(ws);
    });
  }

  private send(ws: SocketLike, msg: ServerMessage): void {
    if (ws.readyState !== SOCKET_OPEN) return;
    if (ws.onServerMessage) {
      ws.onServerMessage(msg);
      return;
    }
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore closed/stalled socket send failure
    }
  }

  private broadcastRoomState(room: RoomInstance): void {
    const state = this.serializeRoom(room);
    for (const p of room.players) {
      const sock = this.playerSockets.get(p.playerId);
      if (sock) this.send(sock, { type: 'room:state', room: state });
    }
  }

  private serializeRoom(room: RoomInstance): RoomState {
    return {
      roomCode: room.roomCode,
      hostId: room.hostId,
      phase: room.phase,
      mapId: room.mapId,
      gameMode: room.gameMode,
      isSoloPractice: room.isSoloPractice,
      isTrainingMode: room.isTrainingMode,
      trainingConfig: { ...room.trainingConfig },
      countdown: Number(room.countdown.toFixed(1)),
      matchTime: Number(room.matchTime.toFixed(2)),
      roundNumber: room.roundNumber,
      winsToWin: room.winsToWin,
      roundWinnerId: room.roundWinnerId,
      winnerId: room.winnerId,
      players: room.players.map((p) => ({
        playerId: p.playerId,
        slotIndex: p.slotIndex,
        name: p.name,
        fighterId: p.fighterId,
        skinId: p.skinId,
        ready: p.ready,
        connected: p.connected,
        wins: p.wins,
        isBot: p.isBot,
        isDummy: p.isDummy,
        team: p.team,
      })),
    };
  }

  private handleMessage(ws: SocketLike, msg: ClientMessage): void {
    if (msg.type === 'net:ping') {
      this.send(ws, {
        type: 'net:pong',
        clientSendTime: msg.clientSendTime,
        serverTime: Date.now(),
      });
      return;
    }

    const client = this.clients.get(ws);
    if (!client) return;

    if (msg.type === 'room:create') {
      this.leaveCurrentRoom(ws, true);
      let code = makeRoomCode();
      while (this.rooms.has(code)) code = makeRoomCode();

      const playerId = makeId('p');
      const reconnectToken = makeId('tok');
      const name = (msg.playerName || 'Player 1').trim().slice(0, 14) || 'Player 1';
      const defaultFighter = FIGHTERS[0].id;

      const isTrainingMode = Boolean(msg.isTrainingMode);
      const isSolo = Boolean(msg.isSoloPractice) && !isTrainingMode;
      const gameMode: GameModeId =
        !isTrainingMode && msg.gameMode && GAME_MODE_BY_ID[msg.gameMode] ? msg.gameMode : 'classic';
      const room: RoomInstance = {
        roomCode: code,
        hostId: playerId,
        phase: 'lobby',
        mapId: 'shibuya',
        gameMode,
        isSoloPractice: isSolo,
        isTrainingMode,
        trainingConfig: { dummyEnabled: false, zeroCooldowns: false },
        countdown: 2.0,
        matchTime: 0,
        roundNumber: 1,
        winsToWin: isSolo || isTrainingMode || gameMode !== 'classic' ? 1 : 3,
        roundWinnerId: null,
        victoryDelayTimer: 0,
        winnerId: null,
        players: [
          {
            playerId,
            slotIndex: 0,
            name,
            fighterId: defaultFighter,
            skinId: 'classic',
            ready: false,
            connected: true,
            wins: 0,
            reconnectToken,
            disconnectedAt: null,
          },
        ],
        actors: [],
        initialActorCount: 1,
        projectiles: [],
        zones: [],
        telegraphs: [],
        pickups: [],
        itemDrops: [],
        frozenWaterZones: [],
        templeNpc: null,
        pendingMeteors: [],
        turrets: [],
        abyssalClones: [],
        judgementSpears: [],
        obstacles: createInitialObstacleStates('shibuya'),
        battleEvent: null,
        nextEventAt: 11.0,
        eventRotationIdx: 0,
        activeClash: null,
        activeHeadlock: null,
        castingDomain: null,
        activeDomain: null,
        activeDomainClash: null,
        kothZone: null,
        teamScores: { alpha: 0, beta: 0 },
        modeTimer: gameMode === 'koth' ? 180.0 : 0,
        raidBossId: null,
        stormActive: false,
        stormRadius: MAP_BY_ID.shibuya.arenaRadius,
        stormMaxRadius: MAP_BY_ID.shibuya.arenaRadius,
        stormCenterX: 0,
        stormCenterZ: 0,
        stormTickTimer: 0,
        lastInputSeq: {},
        pendingEvents: [],
        eventSeq: 0,
        lastEmptyAt: Date.now(),
        chatHistory: [],
        lastChatAt: {},
        awakeningPhase: 'PRE_AWAKENING',
        awakeningCountdown: null,
        awakeningOrbs: [],
        awakeningBanner: null,
        awakeningCutscene: null,
        awakeningDelayedHits: [],
        lastSnapshotBroadcastMs: 0,
        obstaclesDirty: true,
      };

      this.rooms.set(code, room);
      client.playerId = playerId;
      client.roomCode = code;
      this.playerSockets.set(playerId, ws);

      this.send(ws, {
        type: 'room:joined',
        playerId,
        reconnectToken,
        room: this.serializeRoom(room),
        chatHistory: room.chatHistory,
      });
      return;
    }

    if (msg.type === 'room:join') {
      const code = (msg.roomCode || '').trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) {
        this.send(ws, { type: 'room:error', message: `Room "${code}" not found.` });
        return;
      }

      if (msg.reconnectToken) {
        const existing = room.players.find((p) => p.reconnectToken === msg.reconnectToken);
        if (existing) {
          this.leaveCurrentRoom(ws, true);
          existing.connected = true;
          existing.disconnectedAt = null;
          client.playerId = existing.playerId;
          client.roomCode = room.roomCode;
          this.playerSockets.set(existing.playerId, ws);

          this.send(ws, {
            type: 'room:joined',
            playerId: existing.playerId,
            reconnectToken: existing.reconnectToken,
            room: this.serializeRoom(room),
            chatHistory: room.chatHistory,
          });
          this.broadcastRoomState(room);
          if (room.phase === 'combat' || room.phase === 'countdown' || room.phase === 'roundEnd') {
            this.send(ws, {
              type: 'game:snapshot',
              snapshot: this.buildSnapshot(room),
              events: [],
            });
          }
          return;
        }
      }

      if (room.phase !== 'lobby') {
        this.send(ws, { type: 'room:error', message: 'Match already in progress in that room.' });
        return;
      }
      if (room.players.length >= 5) {
        this.send(ws, { type: 'room:error', message: 'Room is full (5/5 players).' });
        return;
      }

      this.leaveCurrentRoom(ws, true);
      const usedSlots = new Set(room.players.map((p) => p.slotIndex));
      let nextSlot = 0;
      while (usedSlots.has(nextSlot) && nextSlot < 5) nextSlot++;

      const usedFighters = new Set(room.players.map((p) => p.fighterId));
      const freeFighter =
        FIGHTERS.find((f) => !usedFighters.has(f.id))?.id ?? FIGHTERS[nextSlot % FIGHTERS.length].id;

      const playerId = makeId('p');
      const reconnectToken = makeId('tok');
      const name = (msg.playerName || `Player ${nextSlot + 1}`).trim().slice(0, 14) || `Player ${nextSlot + 1}`;

      room.players.push({
        playerId,
        slotIndex: nextSlot,
        name,
        fighterId: freeFighter,
        skinId: 'classic',
        ready: false,
        connected: true,
        wins: 0,
        reconnectToken,
        disconnectedAt: null,
      });
      room.players.sort((a, b) => a.slotIndex - b.slotIndex);

      client.playerId = playerId;
      client.roomCode = room.roomCode;
      this.playerSockets.set(playerId, ws);

      this.send(ws, {
        type: 'room:joined',
        playerId,
        reconnectToken,
        room: this.serializeRoom(room),
        chatHistory: room.chatHistory,
      });
      this.broadcastRoomState(room);
      return;
    }

    if (!client.roomCode || !client.playerId) return;
    const room = this.rooms.get(client.roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.playerId === client.playerId);
    if (!player) return;

    if (msg.type === 'room:leave') {
      this.leaveCurrentRoom(ws, true);
      return;
    }

    if (msg.type === 'room:chat') {
      const now = Date.now();
      const prevAt = room.lastChatAt[player.playerId] ?? 0;
      if (now - prevAt < 300) return;
      const cleanText = sanitizeChatText(msg.text);
      if (!cleanText) return;
      room.lastChatAt[player.playerId] = now;
      const chatMsg: RoomChatMessage = {
        id: makeId('chat'),
        senderId: player.playerId,
        senderName: player.name,
        fighterId: player.fighterId,
        text: cleanText,
        timestamp: now,
      };
      room.chatHistory.push(chatMsg);
      if (room.chatHistory.length > 60) {
        room.chatHistory.shift();
      }
      for (const p of room.players) {
        const sock = this.playerSockets.get(p.playerId);
        if (sock) this.send(sock, { type: 'room:chat', message: chatMsg });
      }
      return;
    }

    if (msg.type === 'room:selectFighter') {
      if (room.phase !== 'lobby') return;
      if (FIGHTER_BY_ID[msg.fighterId]) {
        player.fighterId = msg.fighterId;
        this.broadcastRoomState(room);
      }
      return;
    }

    if (msg.type === 'room:selectSkin') {
      if (room.phase !== 'lobby') return;
      if (SKIN_ORDER.includes(msg.skinId)) {
        player.skinId = msg.skinId;
        this.broadcastRoomState(room);
      }
      return;
    }

    if (msg.type === 'room:selectMap') {
      if (room.phase !== 'lobby') return;
      if (player.playerId !== room.hostId) return;
      if (MAP_BY_ID[msg.mapId]) {
        room.mapId = msg.mapId;
        this.broadcastRoomState(room);
      }
      return;
    }

    if (msg.type === 'room:selectMode') {
      if (room.phase !== 'lobby' || room.isTrainingMode) return;
      if (player.playerId !== room.hostId) return;
      if (GAME_MODE_BY_ID[msg.gameMode]) {
        room.gameMode = msg.gameMode;
        room.winsToWin = room.isSoloPractice || room.isTrainingMode || room.gameMode !== 'classic' ? 1 : 3;
        this.broadcastRoomState(room);
      }
      return;
    }

    if (msg.type === 'room:setReady') {
      if (room.phase !== 'lobby') return;
      player.ready = Boolean(msg.ready);
      this.broadcastRoomState(room);
      this.checkAutoStart(room);
      return;
    }

    if (msg.type === 'room:startNow') {
      if (room.phase !== 'lobby') return;
      if (player.playerId !== room.hostId) return;
      if (!room.isSoloPractice && !room.isTrainingMode && room.players.length < 2) {
        this.send(ws, {
          type: 'room:error',
          message: 'Wait for at least 2 players to join, or start a Vs. Bot / Training room.',
        });
        return;
      }
      this.startCountdown(room);
      return;
    }

    if (msg.type === 'room:rematch') {
      if (room.phase !== 'victory') return;
      if (player.playerId !== room.hostId) return;
      room.phase = 'lobby';
      room.winnerId = null;
      room.roundWinnerId = null;
      room.roundNumber = 1;
      room.matchTime = 0;
      room.actors = [];
      room.projectiles = [];
      room.zones = [];
      room.telegraphs = [];
      room.pickups = [];
      room.itemDrops = [];
      room.frozenWaterZones = [];
      room.templeNpc = null;
      room.pendingMeteors = [];
      room.turrets = [];
      room.abyssalClones = [];
      room.judgementSpears = [];
      room.battleEvent = null;
      room.activeClash = null;
      room.activeHeadlock = null;
      room.castingDomain = null;
      room.activeDomain = null;
      room.activeDomainClash = null;
      room.kothZone = null;
      room.teamScores = { alpha: 0, beta: 0 };
      room.modeTimer = room.gameMode === 'koth' ? 180.0 : 0;
      room.raidBossId = null;
      room.stormActive = false;
      room.stormMaxRadius = MAP_BY_ID[room.mapId].arenaRadius;
      room.stormRadius = room.stormMaxRadius;
      room.stormCenterX = 0;
      room.stormCenterZ = 0;
      room.stormTickTimer = 0;
      room.pendingEvents = [];
      room.lastInputSeq = {};
      resetRoomAwakeningState(room);
      for (const p of room.players) {
        p.ready = false;
        p.wins = 0;
        p.team = undefined;
      }
      this.broadcastRoomState(room);
      return;
    }

    if (msg.type === 'game:awakeningMash') {
      if (room.phase !== 'combat') return;
      handleAwakeningMash(room, player.playerId, this.getAwakeningHelpers(), msg.side);
      return;
    }

    if (msg.type === 'game:awakeningSkip') {
      if (room.phase !== 'combat' || !AWAKENING_CONFIG.ALLOW_SKIP) return;
      skipCutsceneToClash(room, this.getAwakeningHelpers());
      return;
    }

    if (msg.type === 'game:cutsceneSync') {
      if (room.phase !== 'combat') return;
      syncCutsceneAudioClock(room, player.playerId, msg.clockSec, this.getAwakeningHelpers());
      return;
    }

    if (msg.type === 'game:domainActivate') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor) return;
      if (handleDomainActivate(room, actor, this.getAwakeningHelpers())) {
        this.broadcastSnapshot(room);
      }
      return;
    }

    if (msg.type === 'game:domainClashMash') {
      if (room.phase !== 'combat' || !room.activeDomainClash) return;
      handleDomainClashMash(room, player.playerId, this.getAwakeningHelpers(), msg.side);
      return;
    }

    if (msg.type === 'game:debug') {
      if (room.phase === 'countdown' && room.isTrainingMode) {
        room.countdown = 0;
        room.phase = 'combat';
        this.broadcastRoomState(room);
      }
      if (room.phase !== 'combat') return;
      if (msg.action === 'triggerCutscene' && room.isTrainingMode && room.actors.length < 2) {
        room.trainingConfig.dummyEnabled = true;
        this.syncTrainingDummy(room);
        this.broadcastRoomState(room);
      }
      handleAwakeningDebug(room, msg.action, this.getAwakeningHelpers());
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'game:input') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO) return;

      if (typeof msg.seq === 'number' && Number.isFinite(msg.seq)) {
        room.lastInputSeq[player.playerId] = Math.max(room.lastInputSeq[player.playerId] ?? 0, msg.seq);
      }

      const mag = Math.hypot(msg.moveX, msg.moveZ);
      if (mag > 1) {
        actor.moveX = msg.moveX / mag;
        actor.moveZ = msg.moveZ / mag;
      } else {
        actor.moveX = Number.isFinite(msg.moveX) ? msg.moveX : 0;
        actor.moveZ = Number.isFinite(msg.moveZ) ? msg.moveZ : 0;
      }
      if (typeof msg.aimYaw === 'number' && Number.isFinite(msg.aimYaw)) {
        actor.aimYaw = msg.aimYaw;
      }
      if (typeof msg.aimPitch === 'number' && Number.isFinite(msg.aimPitch)) {
        actor.aimPitch = clamp(msg.aimPitch, -1.35, 0.55);
      }
      if (msg.targetId !== undefined) {
        actor.targetId = msg.targetId;
      }
      if (msg.blockHeld !== undefined) {
        actor.blockHeld = Boolean(msg.blockHeld);
      }
      return;
    }

    if (msg.type === 'game:toggleFlight') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO || actor.channelKind) return;
      if (actor.actionState === 'stagger' || actor.actionState === 'clash' || actor.actionState === 'headlock') return;
      const cdDur =
        actor.fighterId === 'marjohn' ? AWAKENING_CONFIG.MARJOHN_FLIGHT_COOLDOWN_SEC : 10.0;
      if (actor.isFlying) {
        if (actor.fighterId === 'marjohn') {
          landMarjohnFlight(actor);
        } else {
          actor.isFlying = false;
          actor.grounded = false;
        }
        actor.flightCooldown = room.isTrainingMode && room.trainingConfig.zeroCooldowns ? 0 : cdDur;
      } else {
        const canFly = actor.fighterId === 'jm' || (actor.fighterId === 'marjohn' && actor.awakened);
        if (canFly && actor.flightCooldown <= 0.05 && actor.flightRemaining > 0.05) {
          actor.isFlying = true;
          actor.grounded = false;
          if (actor.actionState === 'idle' || actor.actionState === 'move') {
            actor.actionState = 'jump';
          }
        }
      }
      return;
    }

    if (msg.type === 'game:trainingConfig') {
      if (!room.isTrainingMode || player.playerId !== room.hostId) return;
      if (typeof msg.dummyEnabled === 'boolean') {
        room.trainingConfig.dummyEnabled = msg.dummyEnabled;
      }
      if (typeof msg.zeroCooldowns === 'boolean') {
        room.trainingConfig.zeroCooldowns = msg.zeroCooldowns;
      }
      if (room.phase === 'combat' || room.phase === 'countdown') {
        this.syncTrainingDummy(room);
        if (msg.resetDummyDps) {
          for (const a of room.actors) {
            if (a.isDummy && a.dummyDpsTracker) {
              resetDummyDpsTracker(a.dummyDpsTracker);
            }
          }
        }
        if (room.trainingConfig.zeroCooldowns) {
          for (const a of room.actors) {
            if (a.isBot) continue;
            a.cooldowns = [0, 0, 0, 0, 0, 0, 0, 0];
            a.dashCooldown = 0;
            a.grabCooldown = 0;
            a.flightCooldown = 0;
            a.flightRemaining = a.flightMax;
            a.mana = a.maxMana;
            a.stamina = a.maxStamina;
          }
        }
      }
      this.broadcastRoomState(room);
      return;
    }

    if (msg.type === 'game:jump') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO) return;
      if (typeof msg.seq === 'number' && Number.isFinite(msg.seq)) {
        room.lastInputSeq[player.playerId] = Math.max(room.lastInputSeq[player.playerId] ?? 0, msg.seq);
      }
      this.tryJump(room, actor);
      return;
    }

    if (msg.type === 'game:dash') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO) return;
      if (typeof msg.seq === 'number' && Number.isFinite(msg.seq)) {
        room.lastInputSeq[player.playerId] = Math.max(room.lastInputSeq[player.playerId] ?? 0, msg.seq);
      }
      this.tryDash(room, actor, msg.moveX, msg.moveZ, msg.aimYaw);
      return;
    }

    if (msg.type === 'game:grab') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO) return;
      if (typeof msg.seq === 'number' && Number.isFinite(msg.seq)) {
        room.lastInputSeq[player.playerId] = Math.max(room.lastInputSeq[player.playerId] ?? 0, msg.seq);
      }
      if (msg.targetId !== undefined) actor.targetId = msg.targetId;
      this.tryGrab(room, actor);
      return;
    }

    if (msg.type === 'game:clashPick') {
      if (room.phase !== 'combat' || !room.activeClash) return;
      if (room.activeClash.id !== msg.clashId) return;
      const validChoice: CombatMoveType =
        msg.choice === 'strike' || msg.choice === 'grab' || msg.choice === 'parry' ? msg.choice : 'strike';
      if (room.activeClash.playerAId === player.playerId && !room.activeClash.choiceA) {
        room.activeClash.choiceA = validChoice;
      } else if (room.activeClash.playerBId === player.playerId && !room.activeClash.choiceB) {
        room.activeClash.choiceB = validChoice;
      }
      if (room.activeClash.choiceA && room.activeClash.choiceB) {
        this.resolveClash(room);
      }
      return;
    }

    if (msg.type === 'game:aimUpdate') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO) return;
      if (
        !actor.windupTriggered &&
        ((actor.actionState === 'ultimate' && actor.abilitySlot === 5) ||
          ((actor.actionState === 'ultimate' || actor.actionState === 'skill') &&
            actor.abilitySlot === 7 &&
            hasAscendedAbility(actor.skinId)))
      ) {
        if (typeof msg.aimX === 'number' && Number.isFinite(msg.aimX) && typeof msg.aimZ === 'number' && Number.isFinite(msg.aimZ)) {
          const maxAim =
            actor.abilitySlot === 5
              ? JM_SECRET_ABILITY.aimRange ?? 17.5
              : ASCENDED_ABILITIES[actor.fighterId].aimRange ?? 12.0;
          const clamped = this.clampAimPoint(room, actor, msg.aimX, msg.aimZ, maxAim);
          actor.pendingAimX = clamped.x;
          actor.pendingAimZ = clamped.z;
          const adx = clamped.x - actor.x;
          const adz = clamped.z - actor.z;
          if (Math.hypot(adx, adz) > 0.15) {
            actor.rotY = Math.atan2(adx, adz);
          }
          if (actor.activeTelegraphId) {
            const tel = room.telegraphs.find((t) => t.id === actor.activeTelegraphId);
            if (tel) {
              tel.x = clamped.x;
              tel.z = clamped.z;
            }
          }
        }
      }
      return;
    }

    if (msg.type === 'game:npcDialogue') {
      if (room.phase !== 'combat' && room.phase !== 'countdown') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO) return;
      if (
        msg.choice === 'fight' &&
        room.templeNpc &&
        room.templeNpc.active &&
        !room.templeNpc.defeated &&
        !room.templeNpc.hostile
      ) {
        const npcActor = room.actors.find((a) => a.playerId === (room.templeNpc?.actorId ?? 'temple-npc-boss'));
        if (npcActor && !npcActor.isKO) {
          room.templeNpc.hostile = true;
          room.templeNpc.challengerId = actor.playerId;
          room.templeNpc.fighterId = actor.fighterId;
          npcActor.fighterId = actor.fighterId;
          npcActor.botTargetId = actor.playerId;
          npcActor.rotY = Math.atan2(actor.x - npcActor.x, actor.z - npcActor.z);
          this.pushEvent(room, {
            kind: 'npcProvoke',
            attackerId: npcActor.playerId,
            targetId: actor.playerId,
            fighterId: npcActor.fighterId,
            x: npcActor.x,
            y: npcActor.y + 1.4,
            z: npcActor.z,
            colorHex: FIGHTER_BY_ID[npcActor.fighterId].hex,
            hitStopMs: 65,
            callout: `MIRROR DUEL: ${FIGHTER_BY_ID[npcActor.fighterId].name} (200 HP)!`,
          });
        }
      }
      return;
    }

    if (msg.type === 'game:useItem') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO || !actor.heldItem) return;
      if (typeof msg.seq === 'number' && Number.isFinite(msg.seq)) {
        room.lastInputSeq[player.playerId] = Math.max(room.lastInputSeq[player.playerId] ?? 0, msg.seq);
      }
      this.tryUseItem(room, actor, msg.aimX, msg.aimZ);
      return;
    }

    if (msg.type === 'game:ability') {
      if (room.phase !== 'combat' || room.awakeningPhase === 'CUTSCENE') return;
      const actor = room.actors.find((a) => a.playerId === player.playerId);
      if (!actor || actor.isKO) return;
      if (typeof msg.seq === 'number' && Number.isFinite(msg.seq)) {
        room.lastInputSeq[player.playerId] = Math.max(room.lastInputSeq[player.playerId] ?? 0, msg.seq);
      }
      if (typeof msg.aimYaw === 'number' && Number.isFinite(msg.aimYaw)) {
        actor.aimYaw = msg.aimYaw;
      }
      if (typeof msg.aimPitch === 'number' && Number.isFinite(msg.aimPitch)) {
        actor.aimPitch = clamp(msg.aimPitch, -1.35, 0.55);
      }
      if (msg.targetId !== undefined) {
        actor.targetId = msg.targetId;
      }
      const aimX = typeof msg.aimX === 'number' && Number.isFinite(msg.aimX) ? msg.aimX : undefined;
      const aimZ = typeof msg.aimZ === 'number' && Number.isFinite(msg.aimZ) ? msg.aimZ : undefined;
      this.tryActivateAbility(
        room,
        actor,
        msg.slot,
        Boolean(msg.holdHeavy),
        aimX,
        aimZ,
        Boolean(msg.isHoldVariant)
      );
    }
  }

  private handleDisconnect(ws: SocketLike): void {
    const client = this.clients.get(ws);
    if (!client) return;
    this.leaveCurrentRoom(ws, false);
    this.clients.delete(ws);
  }

  private leaveCurrentRoom(ws: SocketLike, explicit: boolean): void {
    const client = this.clients.get(ws);
    if (!client || !client.roomCode || !client.playerId) return;
    const room = this.rooms.get(client.roomCode);
    const playerId = client.playerId;
    client.roomCode = null;
    client.playerId = null;

    if (this.playerSockets.get(playerId) === ws) {
      this.playerSockets.delete(playerId);
    }
    if (!room) return;

    const idx = room.players.findIndex((p) => p.playerId === playerId);
    if (idx === -1) return;

    if (
      room.awakeningPhase === 'CUTSCENE' &&
      room.awakeningCutscene &&
      (room.awakeningCutscene.p1Id === playerId || room.awakeningCutscene.p2Id === playerId)
    ) {
      cancelCutsceneGracefully(room, this.getAwakeningHelpers());
    }

    if (explicit || room.phase === 'lobby') {
      room.players.splice(idx, 1);
      room.actors = room.actors.filter((a) => a.playerId !== playerId);
      if (room.players.length === 0) {
        this.rooms.delete(room.roomCode);
        return;
      }
      if (room.hostId === playerId) {
        room.hostId = room.players[0].playerId;
      }
      if (!room.isSoloPractice && !room.isTrainingMode && room.phase !== 'lobby' && room.phase !== 'victory' && room.players.length < 2) {
        room.phase = 'victory';
        room.winnerId = room.players[0].playerId;
      }
      this.broadcastRoomState(room);
    } else {
      room.players[idx].connected = false;
      room.players[idx].disconnectedAt = Date.now();
      this.broadcastRoomState(room);
    }
  }

  private checkAutoStart(room: RoomInstance): void {
    if (room.phase !== 'lobby') return;
    const minPlayers = room.isSoloPractice || room.isTrainingMode ? 1 : 2;
    if (room.players.length < minPlayers) return;
    const allReady = room.players.every((p) => p.ready);
    if (allReady) {
      this.startCountdown(room);
    }
  }

  private createActorFromParticipant(
    room: RoomInstance,
    p: RoomPlayer,
    x: number,
    z: number,
    rotY: number
  ): InternalActor {
    const spec = FIGHTER_BY_ID[p.fighterId];
    const isRaidBoss = p.team === 'boss';
    const maxHp = p.isDummy ? 9999 : isRaidBoss ? Math.round(spec.maxHp * 3.5) : spec.maxHp;
    const isSuddenDeath = room.gameMode === 'sudden_death' && !p.isDummy;
    return {
      playerId: p.playerId,
      slotIndex: p.slotIndex,
      name: p.name,
      fighterId: p.fighterId,
      skinId: p.skinId ?? 'classic',
      isBot: p.isBot,
      isDummy: p.isDummy,
      team: p.team,
      isRaidBoss,
      x,
      y: 0,
      z,
      vx: 0,
      yVel: 0,
      vz: 0,
      grounded: true,
      rotY,
      hp: maxHp,
      maxHp,
      mana: p.isDummy ? 0 : isSuddenDeath ? spec.maxMana : 45,
      maxMana: spec.maxMana,
      stamina: spec.maxStamina,
      maxStamina: spec.maxStamina,
      stagger: 0,
      isStunned: false,
      stunImmunityTimer: 0,
      domainGauge: isSuddenDeath ? 100 : 0,
      domainJackpotActive: false,
      domainJackpotHits: 0,
      isOverdrive: false,
      inWater: false,
      inLava: false,
      stealthed: false,
      stealthPatchId: null,
      insideBuildingId: null,
      jmDashActive: false,
      primeDomainBuff: false,
      passiveStacks: 0,
      counterFlowActive: false,
      comboCount: 0,
      comboStep: 0,
      m1Variant: 'light',
      grabCooldown: 0,
      damagePhase: 'NORMAL',
      actionState: 'idle',
      abilitySlot: null,
      actionTimer: 0,
      actionDuration: 0,
      whiffTimer: 0,
      cooldowns: [0, 0, 0, 0, 0, 0, 0, 0],
      dashCooldown: 0,
      dashMaxCooldown: STANDALONE_DASH_COOLDOWN,
      dashCharges: 1,
      dashMaxCharges: 1,
      dashRechargeRemaining: 0,
      isFlying: false,
      flightRemaining: p.fighterId === 'jm' ? 7.0 : 0,
      flightMax: p.fighterId === 'jm' ? 7.0 : 0,
      flightCooldown: 0,
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
      typhoonFlankTimer: 0,
      channelKind: null,
      channelTimer: 0,
      channelDuration: 0,
      channelTickTimer: 0,
      channelStep: 0,
      channelTargetX: x,
      channelTargetZ: z,
      stunnedTimer: 0,
      skyComboPrompt: false,
      skyComboStep: 0,
      skyComboMashes: 0,
      skyComboTargetId: null,
      isKO: false,
      koTime: null,
      koStyle: spec.koStyle,
      wins: p.wins,
      kills: 0,
      deaths: 0,
      parryCount: 0,
      damageDealt: 0,
      dummyDpsTracker: p.isDummy ? createDummyDpsTracker() : undefined,
      moveX: 0,
      moveZ: 0,
      aimYaw: rotY,
      aimPitch: -0.35,
      targetId: null,
      windupTriggered: false,
      landedCurrentAction: false,
      pendingHoldHeavy: false,
      pendingComboLink: false,
      lastM1At: -10,
      lastHitAt: -10,
      lastDamagedAt: -10,
      lastAbilitySlot: null,
      lastAbilityAt: -10,
      iframeTimer: 0,
      parryStartedAt: -10,
      prevBlockHeld: false,
      clashCooldown: 0,
      frenzyInside: false,
      overdriveAnnounced: false,
      lastOriginX: x,
      lastOriginY: 0,
      lastOriginZ: z,
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
      heldItem: null,
      strengthBuffTimer: 0,
      permanentDamageBonus: 0,
      permanentSpeedBonus: 0,
      dashCooldownMult: 1.0,
      permanentMaxHpStacks: 0,
      isNpcBoss: false,
    };
  }

  private syncTrainingDummy(room: RoomInstance): void {
    const existingIdx = room.actors.findIndex((a) => a.isDummy);
    if (room.trainingConfig.dummyEnabled) {
      if (existingIdx === -1) {
        const dummyPlayer: RoomPlayer = {
          playerId: 'training-dummy',
          slotIndex: 1,
          name: 'Target Dummy',
          fighterId: 'prime',
          skinId: 'classic',
          ready: true,
          connected: true,
          wins: 0,
          isBot: true,
          isDummy: true,
        };
        room.actors.push(this.createActorFromParticipant(room, dummyPlayer, 0, -4.5, 0));
      }
    } else if (existingIdx !== -1) {
      const dummyId = room.actors[existingIdx].playerId;
      room.actors.splice(existingIdx, 1);
      if (
        room.activeHeadlock &&
        (room.activeHeadlock.grabberId === dummyId || room.activeHeadlock.victimId === dummyId)
      ) {
        room.activeHeadlock = null;
      }
      if (
        room.activeClash &&
        (room.activeClash.playerAId === dummyId || room.activeClash.playerBId === dummyId)
      ) {
        room.activeClash = null;
      }
      room.telegraphs = room.telegraphs.filter((t) => t.ownerId !== dummyId);
      room.zones = room.zones.filter((z) => z.ownerId !== dummyId);
    }
  }

  private startCountdown(room: RoomInstance): void {
    room.phase = 'countdown';
    room.countdown = 5.0;
    room.matchTime = 0;
    room.victoryDelayTimer = 0;
    room.roundWinnerId = null;
    room.winnerId = null;
    room.projectiles = [];
    room.zones = [];
    room.telegraphs = [];
    room.battleEvent = null;
    room.nextEventAt = 10.5;
    room.eventRotationIdx = 0;
    room.activeClash = null;
    room.activeHeadlock = null;
    room.castingDomain = null;
    room.activeDomain = null;
    room.activeDomainClash = null;
    room.teamScores = { alpha: 0, beta: 0 };
    room.kothZone = room.gameMode === 'koth' ? createInitialKothZone() : null;
    room.modeTimer = room.gameMode === 'koth' ? 180.0 : 0;
    room.raidBossId = null;
    room.stormActive = room.gameMode === 'sudden_death';
    room.stormMaxRadius = MAP_BY_ID[room.mapId].arenaRadius;
    room.stormRadius = room.stormMaxRadius;
    room.stormCenterX = 0;
    room.stormCenterZ = 0;
    room.stormTickTimer = room.gameMode === 'sudden_death' ? 0.5 : 0;
    room.pendingEvents = [];
    room.lastInputSeq = {};
    resetRoomAwakeningState(room);
    const matchSeed = (Date.now() ^ (room.roundNumber * 2654435761)) >>> 0;
    room.obstacles = createInitialObstacleStates(room.mapId, matchSeed);
    room.obstaclesDirty = true;

    room.frozenWaterZones = [];
    room.pendingMeteors = [];
    room.turrets = [];
    room.abyssalClones = [];
    room.judgementSpears = [];
    room.templeNpc = null;

    room.pickups = getMapPickupSpawns(room.mapId).map((sp) => {
      const probeY = sp.y !== undefined ? sp.y + 0.45 : 0.5;
      const baseY = getObstacleSupportY(room.mapId, sp.x, probeY, sp.z, 0.2, room.obstacles) + 0.65;
      return {
        id: sp.id,
        kind: sp.kind,
        x: sp.x,
        y: baseY,
        z: sp.z,
        homeX: sp.x,
        homeY: baseY,
        homeZ: sp.z,
        active: true,
        magnetTargetId: null,
        respawnTimer: 0,
      };
    });

    room.itemDrops = getMapItemDropSpawns(room.mapId).map((sp) => {
      const probeY = sp.y !== undefined ? sp.y + 0.45 : 0.5;
      const baseY = getObstacleSupportY(room.mapId, sp.x, probeY, sp.z, 0.2, room.obstacles) + 0.68;
      return {
        id: sp.id,
        kind: sp.kind,
        x: sp.x,
        y: baseY,
        z: sp.z,
        homeX: sp.x,
        homeY: baseY,
        homeZ: sp.z,
        active: true,
        magnetTargetId: null,
        respawnTimer: 0,
      };
    });

    const participants: RoomPlayer[] = room.players.map((p) => ({ ...p, team: undefined }));
    if (room.isTrainingMode && room.trainingConfig.dummyEnabled) {
      participants.push({
        playerId: 'training-dummy',
        slotIndex: 1,
        name: 'Target Dummy',
        fighterId: 'prime',
        skinId: 'classic',
        ready: true,
        connected: true,
        wins: 0,
        isBot: true,
        isDummy: true,
      });
    } else if (!room.isTrainingMode) {
      if (room.gameMode === 'raid_boss') {
        while (participants.length < 5) {
          const idx = participants.length;
          const usedFighters = new Set(participants.map((p) => p.fighterId));
          const botFighter = FIGHTERS.find((f) => !usedFighters.has(f.id))?.id ?? FIGHTERS[idx % FIGHTERS.length].id;
          participants.push({
            playerId: `bot-raider-${idx}`,
            slotIndex: idx,
            name: `${FIGHTER_BY_ID[botFighter].name} (Raider)`,
            fighterId: botFighter,
            skinId: 'classic',
            ready: true,
            connected: true,
            wins: 0,
            isBot: true,
          });
        }
        participants.forEach((p, idx) => {
          p.team = idx === 0 ? 'boss' : 'raiders';
        });
      } else if (room.gameMode === 'squad_clash') {
        while (participants.length < 4) {
          const idx = participants.length;
          const usedFighters = new Set(participants.map((p) => p.fighterId));
          const botFighter = FIGHTERS.find((f) => !usedFighters.has(f.id))?.id ?? FIGHTERS[idx % FIGHTERS.length].id;
          participants.push({
            playerId: `bot-squad-${idx}`,
            slotIndex: idx,
            name: `${FIGHTER_BY_ID[botFighter].name} (Bot)`,
            fighterId: botFighter,
            skinId: 'classic',
            ready: true,
            connected: true,
            wins: 0,
            isBot: true,
          });
        }
        participants.forEach((p, idx) => {
          p.team = idx % 2 === 0 ? 'alpha' : 'beta';
        });
      } else if (room.isSoloPractice || participants.length < 2) {
        if (room.isSoloPractice) {
          const playerFighter = room.players[0]?.fighterId ?? 'jm';
          const dummyFighter = FIGHTERS.find((f) => f.id !== playerFighter)?.id ?? 'prime';
          participants.push({
            playerId: 'bot-dummy',
            slotIndex: 1,
            name: `${FIGHTER_BY_ID[dummyFighter].name} (Bot)`,
            fighterId: dummyFighter,
            skinId: 'classic',
            ready: true,
            connected: true,
            wins: 0,
            isBot: true,
          });
        }
      }
    }

    // Sync room.players team assignments for HUD scoreboard readability
    for (const rp of room.players) {
      const match = participants.find((p) => p.playerId === rp.playerId);
      rp.team = match?.team;
    }

    const total = participants.length;
    const spawnRadius = total === 1 ? 0 : total === 2 ? 5.2 : 8.5;
    room.actors = participants.map((p, idx) => {
      if (p.isDummy) {
        return this.createActorFromParticipant(room, p, 0, -5.0, 0);
      }
      const angle = (idx / total) * Math.PI * 2 - Math.PI * 0.35;
      const rawX = total === 1 ? 0 : Math.cos(angle) * spawnRadius;
      const rawZ = total === 1 ? 4.0 : Math.sin(angle) * spawnRadius;
      const safe = resolveObstacleCollisions(room.mapId, rawX, 0, rawZ, 0.75, room.obstacles);
      const rotY = total === 1 ? Math.PI : Math.atan2(-safe.x, -safe.z);
      return this.createActorFromParticipant(room, p, safe.x, safe.z, rotY);
    });
    room.initialActorCount = room.actors.filter((a) => !a.isDummy && !a.isNpcBoss).length;

    // Sunken Bamboo Temple: 100% guaranteed spawn rate 200-HP interactive NPC Duel Boss
    if (room.mapId === 'temple' && !room.isTrainingMode && rollTempleNpcSpawn()) {
      const basePlayerFighter = room.players[0]?.fighterId ?? 'jm';
      const npcActor = this.createActorFromParticipant(
        room,
        {
          playerId: 'temple-npc-boss',
          slotIndex: 99,
          name: 'Temple Guardian',
          fighterId: basePlayerFighter,
          skinId: 'classic',
          ready: true,
          connected: true,
          wins: 0,
          isBot: true,
        },
        TEMPLE_NPC_SPAWN.x,
        TEMPLE_NPC_SPAWN.z,
        TEMPLE_NPC_SPAWN.rotY
      );
      npcActor.hp = 200;
      npcActor.maxHp = 200;
      npcActor.isNpcBoss = true;
      room.actors.push(npcActor);
      room.templeNpc = {
        active: true,
        hostile: false,
        defeated: false,
        awakeningDropped: false,
        x: TEMPLE_NPC_SPAWN.x,
        y: 0,
        z: TEMPLE_NPC_SPAWN.z,
        rotY: TEMPLE_NPC_SPAWN.rotY,
        hp: 200,
        maxHp: 200,
        fighterId: basePlayerFighter,
        skinId: 'classic',
        challengerId: null,
        actorId: npcActor.playerId,
      };
    }

    const helpers = this.getAwakeningHelpers();
    if (room.gameMode === 'raid_boss') {
      const bossActor = room.actors.find((a) => a.team === 'boss');
      if (bossActor) {
        room.raidBossId = bossActor.playerId;
        awakenActorImmediate(room, bossActor, helpers, false);
        room.awakeningPhase = 'AWAKENED_DUEL';
      }
    } else if (room.gameMode === 'sudden_death') {
      room.awakeningPhase = 'AWAKENED_DUEL';
      for (const a of room.actors) {
        if (!a.isDummy) {
          a.domainGauge = 100;
          awakenActorImmediate(room, a, helpers, false);
        }
      }
    }

    this.broadcastRoomState(room);
    this.broadcastSnapshot(room, true);
  }

  private damageObstacle(room: RoomInstance, obs: ObstacleState, dmg: number, hitX: number, hitY: number, hitZ: number, colorHex: number): void {
    if (obs.destroyed || !obs.destructible || dmg <= 0) return;
    const next = applyObstacleDamage(obs.hp, dmg);
    obs.hp = next.hp;
    obs.destroyed = next.destroyed;
    room.obstaclesDirty = true;
    if (obs.destroyed) {
      this.pushEvent(room, {
        kind: 'obstacleBreak',
        x: obs.x,
        y: obs.topY * 0.45,
        z: obs.z,
        radius: Math.max(obs.halfW, obs.halfD),
        colorHex: obs.roofColorHex,
        callout: 'STRUCTURE SHATTERED!',
      });
    } else {
      this.pushEvent(room, {
        kind: 'block',
        x: hitX,
        y: Math.max(0.6, hitY),
        z: hitZ,
        colorHex,
      });
    }
  }

  private damageObstaclesInArea(room: RoomInstance, x: number, z: number, radius: number, dmg: number, colorHex: number): void {
    for (const obs of room.obstacles) {
      if (obs.destroyed || !obs.destructible) continue;
      const cx = clamp(x, obs.x - obs.halfW, obs.x + obs.halfW);
      const cz = clamp(z, obs.z - obs.halfD, obs.z + obs.halfD);
      if (Math.hypot(x - cx, z - cz) <= radius) {
        this.damageObstacle(room, obs, dmg, cx, obs.topY * 0.45, cz, colorHex);
      }
    }
  }

  private pushEvent(room: RoomInstance, ev: Omit<CombatEvent, 'id' | 't'>): void {
    room.eventSeq++;
    const attacker = ev.attackerId ? room.actors.find((a) => a.playerId === ev.attackerId) : undefined;
    room.pendingEvents.push({
      id: `ev-${room.eventSeq}`,
      t: room.matchTime,
      ...ev,
      skinId: ev.skinId ?? attacker?.skinId,
    });
  }

  private isTargetInvulnerablePeacefulNpc(room: RoomInstance, actor: InternalActor): boolean {
    return Boolean(actor.isNpcBoss && room.templeNpc && !room.templeNpc.hostile);
  }

  private findNearestTarget(room: RoomInstance, actor: InternalActor, maxRange: number): InternalActor | null {
    const alive = room.actors.filter(
      (a) =>
        a.playerId !== actor.playerId &&
        !a.isKO &&
        !this.isTargetInvulnerablePeacefulNpc(room, a) &&
        !areActorsAllied(actor, a, room.gameMode)
    );
    if (alive.length === 0) return null;
    let best: InternalActor | null = null;
    let bestDist = maxRange;
    for (const candidate of alive) {
      const d = Math.hypot(candidate.x - actor.x, candidate.z - actor.z);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
    return best;
  }

  private findPreferredTarget(room: RoomInstance, actor: InternalActor, maxRange: number): InternalActor | null {
    const alive = room.actors.filter(
      (a) =>
        a.playerId !== actor.playerId &&
        !a.isKO &&
        !this.isTargetInvulnerablePeacefulNpc(room, a) &&
        !areActorsAllied(actor, a, room.gameMode)
    );
    if (alive.length === 0) return null;

    if (actor.targetId) {
      const locked = alive.find((a) => a.playerId === actor.targetId);
      if (locked && Math.hypot(locked.x - actor.x, locked.z - actor.z) <= maxRange) {
        return locked;
      }
    }

    return this.findNearestTarget(room, actor, maxRange);
  }

  private tryJump(room: RoomInstance, actor: InternalActor): void {
    if (
      actor.isKO ||
      actor.actionState === 'stagger' ||
      actor.actionState === 'clash' ||
      actor.actionState === 'headlock'
    ) {
      return;
    }
    if (actor.isFlying || actor.channelKind) return;
    if (!actor.grounded) return;
    const isGravityBoost = room.battleEvent?.kind === 'gravity';
    actor.yVel = isGravityBoost ? 13.6 : 10.8;
    actor.grounded = false;
    if (actor.actionState === 'idle' || actor.actionState === 'move') {
      actor.actionState = 'jump';
    }
    this.pushEvent(room, {
      kind: 'jump',
      attackerId: actor.playerId,
      fighterId: actor.fighterId,
      x: actor.x,
      y: actor.y + 0.1,
      z: actor.z,
      colorHex: FIGHTER_BY_ID[actor.fighterId].hex,
    });
  }

  // Universal Standalone Dash (Shift / HUD Dash button) with separate 1.5s cooldown & dodge i-frames
  private tryDash(
    room: RoomInstance,
    actor: InternalActor,
    rawMoveX?: number,
    rawMoveZ?: number,
    rawAimYaw?: number
  ): void {
    if (
      actor.isKO ||
      actor.channelKind !== null ||
      actor.actionState === 'stagger' ||
      actor.actionState === 'clash' ||
      actor.actionState === 'headlock' ||
      actor.actionState === 'whiff'
    ) {
      return;
    }
    if (actor.dashCooldown > 0.01) return;
    const dashStamina = 14;
    if (actor.stamina < dashStamina) return;

    this.clearActorTelegraph(room, actor);
    actor.stamina = clamp(actor.stamina - dashStamina, 0, actor.maxStamina);
    const inKhenVoid =
      room.activeDomain?.ownerId === actor.playerId && room.activeDomain.fighterId === 'khen';
    const inPrimeCrucible =
      actor.fighterId === 'prime' &&
      room.activeDomain?.ownerId === actor.playerId &&
      room.activeDomain.fighterId === 'prime';
    const baseDashCd = inKhenVoid
      ? STANDALONE_DASH_COOLDOWN * 0.3
      : inPrimeCrucible
      ? STANDALONE_DASH_COOLDOWN * PRIME_DOMAIN_CONFIG.dashCdMult
      : STANDALONE_DASH_COOLDOWN;
    const dashCd = baseDashCd * (actor.dashCooldownMult ?? 1.0);
    actor.dashCooldown = dashCd;
    actor.dashMaxCooldown = Number(dashCd.toFixed(2));
    actor.shieldActive = false;
    actor.parryWindow = false;
    actor.blockHeld = false;
    actor.superArmor = false;
    if (canJmCancelM1(actor.fighterId, actor.actionState, actor.comboStep, 'dash')) {
      actor.windupTriggered = true;
      actor.landedCurrentAction = true;
    }
    actor.abilitySlot = null;

    const mx = typeof rawMoveX === 'number' && Number.isFinite(rawMoveX) ? rawMoveX : actor.moveX;
    const mz = typeof rawMoveZ === 'number' && Number.isFinite(rawMoveZ) ? rawMoveZ : actor.moveZ;
    let dashYaw = typeof rawAimYaw === 'number' && Number.isFinite(rawAimYaw) ? rawAimYaw : actor.rotY;
    if (Math.hypot(mx, mz) > 0.08) {
      dashYaw = Math.atan2(mx, mz);
    }
    actor.rotY = dashYaw;

    const fx = Math.sin(dashYaw);
    const fz = Math.cos(dashYaw);
    const originX = actor.x;
    const originY = actor.y;
    const originZ = actor.z;

    actor.actionState = 'dash';
    actor.actionDuration = 0.22;
    actor.actionTimer = 0.22;
    actor.windupTriggered = true;
    actor.landedCurrentAction = true;
    actor.iframeTimer = 0.24;
    actor.evadeRewardedThisDash = false;
    actor.dashEruptedThisDash = false;
    actor.vx = fx * 25.0;
    actor.vz = fz * 25.0;

    this.pushEvent(room, {
      kind: 'dash',
      attackerId: actor.playerId,
      fighterId: actor.fighterId,
      x: actor.x,
      y: actor.y + 0.9,
      z: actor.z,
      originX,
      originY: originY + 0.9,
      originZ,
      dirX: fx,
      dirZ: fz,
      colorHex: FIGHTER_BY_ID[actor.fighterId].hex,
      frenzyInside: actor.frenzyInside,
    });
  }

  // RPS Layer & 3-Second Interactive Headlock Mash Struggle!
  private tryGrab(room: RoomInstance, actor: InternalActor): void {
    // If already locked in active 3-second headlock, pressing Grab mashes the struggle counter!
    if (
      room.activeHeadlock &&
      (room.activeHeadlock.grabberId === actor.playerId || room.activeHeadlock.victimId === actor.playerId)
    ) {
      if (room.activeHeadlock.grabberId === actor.playerId) {
        room.activeHeadlock.grabberMashes += 1;
      } else {
        room.activeHeadlock.victimMashes += 1;
      }
      return;
    }

    if (
      actor.isKO ||
      actor.channelKind !== null ||
      actor.actionState === 'stagger' ||
      actor.actionState === 'clash' ||
      actor.actionState === 'headlock' ||
      actor.actionState === 'whiff'
    ) {
      return;
    }
    if (actor.grabCooldown > 0.01) return;
    const grabStaminaCost = 16;
    if (actor.stamina < grabStaminaCost) return;
    if (
      actor.actionTimer > 0.08 &&
      actor.actionState !== 'idle' &&
      actor.actionState !== 'move' &&
      actor.actionState !== 'jump'
    ) {
      return;
    }

    actor.stamina = clamp(actor.stamina - grabStaminaCost, 0, actor.maxStamina);
    actor.grabCooldown = 15.0;
    actor.shieldActive = false;
    actor.parryWindow = false;
    actor.blockHeld = false;

    const target = this.findPreferredTarget(room, actor, 6.0);
    if (target) {
      actor.rotY = Math.atan2(target.x - actor.x, target.z - actor.z);
    }

    actor.actionState = 'grab';
    actor.abilitySlot = null;
    actor.actionDuration = 0.17;
    actor.actionTimer = 0.17;
    actor.windupTriggered = false;
    actor.landedCurrentAction = false;
    actor.vx = Math.sin(actor.rotY) * 12.5;
    actor.vz = Math.cos(actor.rotY) * 12.5;
  }

  private executeGrabImpact(room: RoomInstance, actor: InternalActor): void {
    if (room.activeHeadlock) return;
    const fx = Math.sin(actor.rotY);
    const fz = Math.cos(actor.rotY);
    const spec = FIGHTER_BY_ID[actor.fighterId];

    for (const target of room.actors) {
      if (
        target.playerId === actor.playerId ||
        target.isKO ||
        areActorsAllied(actor, target, room.gameMode) ||
        target.actionState === 'clash' ||
        target.actionState === 'headlock'
      ) {
        continue;
      }
      if (Math.abs(target.y - actor.y) > 2.2) continue;
      const dx = target.x - actor.x;
      const dz = target.z - actor.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.35) continue;
      if (dist > 0.1 && (dx / dist) * fx + (dz / dist) * fz < 0.05) continue;

      const dirX = dist > 0.05 ? dx / dist : fx;
      const dirZ = dist > 0.05 ? dz / dist : fz;

      // RPS Rule: Strike beats Grab! If target is actively swinging/casting strike, grabber gets stuffed!
      if (target.actionState === 'attack' || target.actionState === 'skill') {
        const stuffDur = resolveCappedStunDuration(0.55, false);
        actor.actionState = 'stagger';
        actor.actionTimer = stuffDur;
        actor.actionDuration = stuffDur;
        actor.vx = -dirX * 7.0;
        actor.vz = -dirZ * 7.0;
        actor.landedCurrentAction = true;
        this.pushEvent(room, {
          kind: 'hit',
          attackerId: target.playerId,
          targetId: actor.playerId,
          fighterId: target.fighterId,
          x: actor.x,
          y: actor.y + 1.2,
          z: actor.z,
          dirX: -dirX,
          dirZ: -dirZ,
          colorHex: FIGHTER_BY_ID[target.fighterId].hex,
          damage: 8,
          isCounter: true,
          rpsOutcome: 'strike_beats_grab',
        });
        actor.hp = Math.max(0, actor.hp - 8);
        actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
        if (actor.hp <= 0) this.eliminateActor(room, target, actor, 'normal');
        return;
      }

      // RPS Rule: Grab beats Block/Parry -> enters 3.0-second Interactive Headlock Mash!
      const wasParryWindow = target.parryWindow;
      const brokeGuard = target.shieldActive || target.actionState === 'guard' || wasParryWindow;
      this.clearActorTelegraph(room, actor);
      this.clearActorTelegraph(room, target);

      target.shieldActive = false;
      target.parryWindow = false;
      target.blockHeld = false;
      target.superArmor = false;
      target.isStunned = false;
      target.abilitySlot = null;
      actor.abilitySlot = null;
      actor.landedCurrentAction = true;

      actor.rotY = Math.atan2(dirX, dirZ);
      target.x = actor.x + dirX * 0.72;
      target.z = actor.z + dirZ * 0.72;
      enforceDomainBarrierForActor(room, target);
      enforceDomainBarrierForActor(room, actor);
      target.y = actor.y;
      target.rotY = actor.rotY + Math.PI;
      actor.vx = 0;
      actor.vz = 0;
      actor.yVel = 0;
      target.vx = 0;
      target.vz = 0;
      target.yVel = 0;

      actor.actionState = 'headlock';
      actor.actionDuration = 3.0;
      actor.actionTimer = 3.0;
      target.actionState = 'headlock';
      target.actionDuration = 3.0;
      target.actionTimer = 3.0;

      room.activeHeadlock = {
        id: makeId('hl'),
        grabberId: actor.playerId,
        victimId: target.playerId,
        remaining: 3.0,
        duration: 3.0,
        grabberMashes: brokeGuard ? 3 : 1,
        victimMashes: 0,
        x: (actor.x + target.x) * 0.5,
        y: actor.y + 1.15,
        z: (actor.z + target.z) * 0.5,
      };

      this.pushEvent(room, {
        kind: 'grab',
        attackerId: actor.playerId,
        targetId: target.playerId,
        fighterId: actor.fighterId,
        x: target.x,
        y: target.y + 1.2,
        z: target.z,
        dirX,
        dirZ,
        colorHex: spec.hex,
        isCrit: brokeGuard,
        hitStopMs: brokeGuard ? 65 : 40,
        rpsOutcome: wasParryWindow ? 'weak_to_grab' : brokeGuard ? 'grab_beats_parry' : undefined,
      });
      return;
    }
  }

  private resolveHeadlock(room: RoomInstance): void {
    const hl = room.activeHeadlock;
    if (!hl) return;
    room.activeHeadlock = null;

    const grabber = room.actors.find((a) => a.playerId === hl.grabberId);
    const victim = room.actors.find((a) => a.playerId === hl.victimId);
    if (!grabber || !victim) return;

    const dx = victim.x - grabber.x;
    const dz = victim.z - grabber.z;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    const dirX = dx / d;
    const dirZ = dz / d;

    if (hl.grabberMashes >= hl.victimMashes) {
      // Grabber wins headlock: Heavy Slam!
      const dmg = 24;
      grabber.actionState = grabber.grounded ? 'idle' : 'jump';
      grabber.actionTimer = 0;
      grabber.mana = clamp(grabber.mana + 18, 0, grabber.maxMana);
      if (room.matchTime - grabber.lastHitAt <= 2.0) {
        grabber.comboCount += 1;
      } else {
        grabber.comboCount = 1;
      }
      grabber.lastHitAt = room.matchTime;
      attackerAddDamage(grabber, dmg);

      victim.hp = Math.max(0, victim.hp - dmg);
      victim.damagePhase = getDamagePhase(victim.hp, victim.maxHp, victim.isKO);
      victim.lastDamagedAt = room.matchTime;
      const kbMult = victim.fighterId === 'prime' ? 0.85 : 1.0;
      victim.vx = dirX * 13.5 * kbMult;
      victim.vz = dirZ * 13.5 * kbMult;
      victim.yVel = 6.2;
      victim.grounded = false;
      victim.actionState = 'stagger';
      victim.actionTimer = 0.72;
      victim.actionDuration = 0.72;
      this.addStagger(room, grabber, victim, 40);

      this.pushEvent(room, {
        kind: 'grab',
        attackerId: grabber.playerId,
        targetId: victim.playerId,
        fighterId: grabber.fighterId,
        x: victim.x,
        y: victim.y + 1.15,
        z: victim.z,
        dirX,
        dirZ,
        colorHex: FIGHTER_BY_ID[grabber.fighterId].hex,
        damage: dmg,
        isCrit: true,
        comboHit: grabber.comboCount,
        hitStopMs: 80,
      });

      if (victim.hp <= 0) {
        this.eliminateActor(room, grabber, victim, 'grab');
      }
    } else {
      // Victim out-mashed grabber: Clean break-free with ZERO damage!
      grabber.actionState = 'whiff';
      grabber.whiffTimer = 0.32;
      grabber.actionTimer = 0;
      grabber.vx = -dirX * 9.5;
      grabber.vz = -dirZ * 9.5;

      victim.actionState = victim.grounded ? 'idle' : 'jump';
      victim.actionTimer = 0;
      victim.iframeTimer = Math.max(victim.iframeTimer, 0.35);
      victim.vx = dirX * 9.5;
      victim.vz = dirZ * 9.5;

      this.pushEvent(room, {
        kind: 'headlockBreak',
        attackerId: victim.playerId,
        targetId: grabber.playerId,
        fighterId: victim.fighterId,
        x: (grabber.x + victim.x) * 0.5,
        y: victim.y + 1.15,
        z: (grabber.z + victim.z) * 0.5,
        dirX,
        dirZ,
        colorHex: FIGHTER_BY_ID[victim.fighterId].hex,
        hitStopMs: 45,
      });
    }
  }

  private clampAimPoint(
    room: RoomInstance,
    actor: InternalActor,
    rawX: number,
    rawZ: number,
    maxRange: number
  ): { x: number; z: number } {
    const dx = rawX - actor.x;
    const dz = rawZ - actor.z;
    const d = Math.hypot(dx, dz);
    let x = rawX;
    let z = rawZ;
    if (d > maxRange && d > 0.001) {
      x = actor.x + (dx / d) * maxRange;
      z = actor.z + (dz / d) * maxRange;
    }
    const arenaLimit = MAP_BY_ID[room.mapId].arenaRadius - 0.6;
    const r = Math.hypot(x, z);
    if (r > arenaLimit && r > 0.001) {
      x = (x / r) * arenaLimit;
      z = (z / r) * arenaLimit;
    }
    return { x: Number(x.toFixed(2)), z: Number(z.toFixed(2)) };
  }

  private tryUseItem(
    room: RoomInstance,
    actor: InternalActor,
    rawAimX?: number,
    rawAimZ?: number
  ): void {
    const itemKind = actor.heldItem as TacticalItemKind | null;
    if (!itemKind) return;
    const spec = TACTICAL_ITEMS_BY_KIND[itemKind];
    if (!spec) return;

    // One-time consume permanently removes the item from the player's slot
    actor.heldItem = null;

    if (itemKind === 'crimson_elixir') {
      actor.permanentDamageBonus = Number(((actor.permanentDamageBonus ?? 0) + 0.12).toFixed(2));
      this.pushEvent(room, {
        kind: 'itemUse',
        attackerId: actor.playerId,
        targetId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.2,
        z: actor.z,
        colorHex: spec.colorHex,
        callout: 'CRIMSON ELIXIR (+12% PERM DMG)!',
      });
      return;
    }

    if (itemKind === 'gale_boots') {
      actor.permanentSpeedBonus = Number(((actor.permanentSpeedBonus ?? 0) + 1.5).toFixed(2));
      actor.dashCooldownMult = Number(Math.max(0.55, (actor.dashCooldownMult ?? 1.0) * 0.85).toFixed(3));
      actor.dashCooldown = Math.min(actor.dashCooldown, actor.dashCooldown * 0.85);
      actor.dashMaxCooldown = Number((STANDALONE_DASH_COOLDOWN * actor.dashCooldownMult).toFixed(2));
      this.pushEvent(room, {
        kind: 'itemUse',
        attackerId: actor.playerId,
        targetId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.0,
        z: actor.z,
        colorHex: spec.colorHex,
        callout: 'GALE BOOTS (+1.5 SPD, +15% DASH)!',
      });
      return;
    }

    if (itemKind === 'aegis_shard') {
      actor.permanentMaxHpStacks = (actor.permanentMaxHpStacks ?? 0) + 1;
      actor.maxHp = Math.round(actor.maxHp * 1.2);
      const healAmt = Math.round(actor.maxHp * 0.35);
      actor.hp = Math.min(actor.maxHp, actor.hp + healAmt);
      if (actor.hp > actor.maxHp * 0.45) actor.isOverdrive = false;
      actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
      this.pushEvent(room, {
        kind: 'itemUse',
        attackerId: actor.playerId,
        targetId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.2,
        z: actor.z,
        colorHex: spec.colorHex,
        callout: `AEGIS SHARD (+20% MAX HP, +${healAmt} HP)!`,
      });
      return;
    }

    // Throwable tactical item with clamped target coordinate
    const range = spec.range ?? 14.5;
    const radius = spec.radius ?? 4.8;
    const fallbackX = actor.x + Math.sin(actor.rotY) * 8.0;
    const fallbackZ = actor.z + Math.cos(actor.rotY) * 8.0;
    const targetPt = this.clampAimPoint(
      room,
      actor,
      typeof rawAimX === 'number' && Number.isFinite(rawAimX) ? rawAimX : fallbackX,
      typeof rawAimZ === 'number' && Number.isFinite(rawAimZ) ? rawAimZ : fallbackZ,
      range
    );
    const tx = targetPt.x;
    const tz = targetPt.z;
    const ty = getObstacleSupportY(room.mapId, tx, 8.0, tz, 0.25, room.obstacles) + getMapTerrainHeight(room.mapId, tx, tz);
    if (Math.hypot(tx - actor.x, tz - actor.z) > 0.25) {
      actor.rotY = Math.atan2(tx - actor.x, tz - actor.z);
    }

    if (itemKind === 'shock_grenade') {
      this.damageObstaclesInArea(room, tx, tz, radius + 0.6, 220, spec.colorHex);
      this.pushEvent(room, {
        kind: 'itemUse',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: tx,
        y: ty + 0.35,
        z: tz,
        originX: actor.x,
        originY: actor.y + 1.2,
        originZ: actor.z,
        radius,
        colorHex: spec.colorHex,
        hitStopMs: 65,
        callout: 'SEISMIC SHOCK GRENADE!',
      });
      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        if (this.isTargetInvulnerablePeacefulNpc(room, target)) continue;
        if (areActorsAllied(actor, target, room.gameMode)) continue;
        const dx = target.x - tx;
        const dz = target.z - tz;
        const d = Math.hypot(dx, dz);
        if (d <= radius) {
          const nx = d > 0.05 ? dx / d : Math.sin(actor.rotY);
          const nz = d > 0.05 ? dz / d : Math.cos(actor.rotY);
          if (this.applyHit(room, actor, target, 14, 28, 13.5, nx, nz, spec.colorHex, true)) {
            target.yVel = Math.max(target.yVel, 7.2);
            target.grounded = false;
          }
        }
      }
      return;
    }

    if (itemKind === 'cryo_capsule') {
      this.spawnZone(room, actor, 'cryoMist', tx, ty, tz, radius, 3.2, spec.colorHex);
      let frozeWater = false;
      const waterZones = (MAP_TERRAIN_ZONES[room.mapId] ?? []).filter((z) => z.kind === 'water');
      for (const wz of waterZones) {
        if (wz.shape === 'circle') {
          if (Math.hypot(tx - wz.x, tz - wz.z) <= (wz.radius ?? 4.0) + radius) {
            frozeWater = true;
            break;
          }
        } else {
          const cx = clamp(tx, wz.x - (wz.halfW ?? 4.0), wz.x + (wz.halfW ?? 4.0));
          const cz = clamp(tz, wz.z - (wz.halfD ?? 4.0), wz.z + (wz.halfD ?? 4.0));
          if (Math.hypot(tx - cx, tz - cz) <= radius) {
            frozeWater = true;
            break;
          }
        }
      }
      if (frozeWater) {
        room.frozenWaterZones.push({
          id: makeId('ice'),
          x: tx,
          z: tz,
          radius: radius + 0.6,
          remaining: 8.5,
          maxDuration: 8.5,
        });
        this.pushEvent(room, {
          kind: 'cryoFreeze',
          attackerId: actor.playerId,
          fighterId: actor.fighterId,
          x: tx,
          y: ty + 0.15,
          z: tz,
          radius: radius + 0.6,
          colorHex: 0xbae6fd,
          callout: 'WATER FROZEN INTO ICE!',
        });
      }
      this.pushEvent(room, {
        kind: 'itemUse',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: tx,
        y: ty + 0.35,
        z: tz,
        originX: actor.x,
        originY: actor.y + 1.2,
        originZ: actor.z,
        radius,
        colorHex: spec.colorHex,
        callout: 'CRYO FLASH (-45% SPD)!',
      });
      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        if (this.isTargetInvulnerablePeacefulNpc(room, target)) continue;
        if (areActorsAllied(actor, target, room.gameMode)) continue;
        if (Math.hypot(target.x - tx, target.z - tz) <= radius) {
          target.slowTimer = Math.max(target.slowTimer, 3.0);
          this.applyHit(room, actor, target, 8, 16, 2.5, 0, 0, spec.colorHex, false);
        }
      }
      return;
    }

    if (itemKind === 'gravity_vortex') {
      this.spawnZone(room, actor, 'gravityVortex', tx, ty, tz, radius, 1.5, spec.colorHex);
      this.pushEvent(room, {
        kind: 'itemUse',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: tx,
        y: ty + 0.35,
        z: tz,
        originX: actor.x,
        originY: actor.y + 1.2,
        originZ: actor.z,
        radius,
        colorHex: spec.colorHex,
        callout: 'GRAVITY VORTEX PULL!',
      });
    }
  }

  private spawnZone(
    room: RoomInstance,
    owner: InternalActor,
    kind: ArenaZoneKind,
    x: number,
    y: number,
    z: number,
    radius: number,
    duration: number,
    colorHex: number,
    endX?: number,
    endZ?: number
  ): InternalZone {
    room.zones = room.zones.filter((zn) => !(zn.ownerId === owner.playerId && zn.kind === kind));
    const zone: InternalZone = {
      id: makeId('zone'),
      ownerId: owner.playerId,
      fighterId: owner.fighterId,
      skinId: owner.skinId,
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
    room.zones.push(zone);
    this.pushEvent(room, {
      kind: 'trap',
      attackerId: owner.playerId,
      fighterId: owner.fighterId,
      x,
      y: y + 0.15,
      z,
      colorHex,
    });
    return zone;
  }

  private clearActorTelegraph(room: RoomInstance, actor: InternalActor): void {
    if (!actor.activeTelegraphId) return;
    room.telegraphs = room.telegraphs.filter((t) => t.id !== actor.activeTelegraphId);
    actor.activeTelegraphId = null;
  }

  private spawnTelegraph(
    room: RoomInstance,
    actor: InternalActor,
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
  ): void {
    this.clearActorTelegraph(room, actor);
    const id = makeId('tel');
    actor.activeTelegraphId = id;
    room.telegraphs.push({
      id,
      ownerId: actor.playerId,
      fighterId: actor.fighterId,
      kind,
      x,
      y,
      z,
      dirX,
      dirZ,
      radius,
      length,
      angleHalf,
      progress: 0,
      colorHex,
      elapsed: 0,
      windup: Math.max(0.1, windup),
    });
  }

  private executeStage2Skill(room: RoomInstance, actor: InternalActor): void {
    const spec = FIGHTER_BY_ID[actor.fighterId];
    const ab = spec.abilities[3];
    const pendingCd = actor.stage2PendingCooldown > 0 ? actor.stage2PendingCooldown : ab.cooldown;
    actor.stage2Slot = null;
    actor.stage2Timer = 0;
    actor.stage2Label = '';
    actor.stage2PendingCooldown = 0;
    actor.cooldowns[3] = pendingCd;
    actor.stamina = clamp(actor.stamina - 10, 0, actor.maxStamina);
    actor.lastAbilitySlot = 3;
    actor.lastAbilityAt = room.matchTime;
    actor.lastCastSlot = 3;

    if (actor.fighterId === 'marjohn') {
      // Stage 2: SKYBURST LAUNCH — detonates active Gale Snare (or self) upward!
      const snare = room.zones.find((z) => z.ownerId === actor.playerId && z.kind === 'galeSnare');
      const cx = snare ? snare.x : actor.x;
      const cz = snare ? snare.z : actor.z;
      const cy = snare ? snare.y : actor.y;
      if (snare) {
        room.zones = room.zones.filter((z) => z.id !== snare.id);
      }
      actor.actionState = 'skill';
      actor.actionDuration = 0.34;
      actor.actionTimer = 0.34;
      actor.windupTriggered = true;
      actor.landedCurrentAction = true;
      this.pushEvent(room, {
        kind: 'trapTrigger',
        attackerId: actor.playerId,
        fighterId: 'marjohn',
        x: cx,
        y: cy + 0.3,
        z: cz,
        colorHex: spec.hex,
        abilitySlot: 3,
        callout: 'SKYBURST LAUNCH!',
      });
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'marjohn',
        x: cx,
        y: cy + 0.15,
        z: cz,
        colorHex: spec.hex,
        abilitySlot: 3,
        isComboLink: true,
      });
      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        const d = Math.hypot(target.x - cx, target.z - cz);
        if (d <= 4.1) {
          const calc = this.computeDynamicDamage(actor, target, 21, 3);
          const hit = this.applyHit(
            room,
            actor,
            target,
            calc.dmg,
            32 + calc.staggerBonus,
            5.0,
            d > 0.05 ? (target.x - cx) / d : 0,
            d > 0.05 ? (target.z - cz) / d : 1,
            spec.hex,
            true,
            false,
            false,
            calc.isCrit,
            calc.isBackstab
          );
          if (hit) {
            target.yVel = Math.max(target.yVel, 9.2);
            target.grounded = false;
          }
        }
      }
      return;
    }

    if (actor.fighterId === 'prime') {
      // Stage 2: CRATER SLAM — leaps forward and slams down leaving Molten Fissure!
      const foe = this.findPreferredTarget(room, actor, 10.0);
      if (foe) {
        actor.rotY = Math.atan2(foe.x - actor.x, foe.z - actor.z);
      }
      const fx = Math.sin(actor.rotY);
      const fz = Math.cos(actor.rotY);
      actor.actionState = 'skill';
      actor.actionDuration = ab.duration;
      actor.actionTimer = ab.duration;
      actor.abilitySlot = 3;
      actor.windupTriggered = false;
      actor.landedCurrentAction = false;
      actor.pendingHoldVariant = true; // marks impact to execute Crater Slam + Molten Fissure
      actor.pendingAimX = null;
      actor.pendingAimZ = null;
      actor.yVel = 6.8;
      actor.grounded = false;
      actor.vx = fx * 9.5;
      actor.vz = fz * 9.5;
      this.spawnTelegraph(
        room,
        actor,
        'circle',
        actor.x + fx * 2.2,
        actor.y,
        actor.z + fz * 2.2,
        fx,
        fz,
        4.2,
        0,
        0,
        ab.windup,
        spec.hex
      );
      this.pushEvent(room, {
        kind: 'cast',
        attackerId: actor.playerId,
        fighterId: 'prime',
        x: actor.x,
        y: actor.y + 1.0,
        z: actor.z,
        dirX: fx,
        dirZ: fz,
        colorHex: spec.hex,
        abilitySlot: 3,
        isComboLink: true,
        callout: 'CRATER SLAM!',
      });
      return;
    }

    if (actor.fighterId === 'khen') {
      // Stage 2: SHADOW SWAP — instant void teleport to Void Anchor with burst!
      const anchor = room.zones.find((z) => z.ownerId === actor.playerId && z.kind === 'voidAnchor');
      if (!anchor) return;
      const originX = actor.x;
      const originY = actor.y;
      const originZ = actor.z;
      room.zones = room.zones.filter((z) => z.id !== anchor.id);
      const safe = resolveObstacleCollisions(room.mapId, anchor.x, actor.y, anchor.z, 0.48, room.obstacles);
      actor.x = safe.x;
      actor.z = safe.z;
      actor.y = anchor.y;
      actor.yVel = 0;
      actor.grounded = true;
      actor.iframeTimer = Math.max(actor.iframeTimer, 0.22);
      actor.actionState = 'skill';
      actor.actionDuration = 0.28;
      actor.actionTimer = 0.28;
      actor.windupTriggered = true;
      actor.landedCurrentAction = true;

      this.pushEvent(room, {
        kind: 'trapTrigger',
        attackerId: actor.playerId,
        fighterId: 'khen',
        x: actor.x,
        y: actor.y + 1.0,
        z: actor.z,
        originX,
        originY: originY + 1.0,
        originZ,
        colorHex: spec.hex,
        abilitySlot: 3,
        isComboLink: true,
        callout: 'SHADOW SWAP!',
      });
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'khen',
        x: actor.x,
        y: actor.y + 0.15,
        z: actor.z,
        originX,
        originY: originY + 0.9,
        originZ,
        colorHex: spec.hex,
        abilitySlot: 3,
        isComboLink: true,
      });

      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        const d = Math.hypot(target.x - actor.x, target.z - actor.z);
        if (d <= 3.4) {
          const calc = this.computeDynamicDamage(actor, target, 16, 3);
          this.applyHit(
            room,
            actor,
            target,
            calc.dmg,
            24 + calc.staggerBonus,
            8.0,
            d > 0.05 ? (target.x - actor.x) / d : 0,
            d > 0.05 ? (target.z - actor.z) / d : 1,
            spec.hex,
            true,
            false,
            false,
            calc.isCrit,
            calc.isBackstab
          );
        }
      }
      return;
    }

    if (actor.fighterId === 'jm') {
      // Stage 2: METEOR HEEL DROP — dives/slams down with crisp ground-bounce true-comboing into Solar Dragon Beam!
      const foe = this.findPreferredTarget(room, actor, 10.5);
      if (foe) {
        actor.rotY = Math.atan2(foe.x - actor.x, foe.z - actor.z);
      }
      const fx = Math.sin(actor.rotY);
      const fz = Math.cos(actor.rotY);
      const impactX = foe ? foe.x : actor.x + fx * 1.8;
      const impactZ = foe ? foe.z : actor.z + fz * 1.8;
      const floorY = getObstacleSupportY(room.mapId, impactX, 0, impactZ, 0.42, room.obstacles);
      const safe = resolveObstacleCollisions(room.mapId, impactX - fx * 1.1, floorY, impactZ - fz * 1.1, 0.48, room.obstacles);
      actor.x = safe.x;
      actor.z = safe.z;
      actor.y = floorY;
      actor.yVel = 0;
      actor.vx = 0;
      actor.vz = 0;
      actor.grounded = true;
      actor.actionState = 'skill';
      actor.actionDuration = 0.34;
      actor.actionTimer = 0.34;
      actor.windupTriggered = true;
      actor.landedCurrentAction = true;
      this.damageObstaclesInArea(room, impactX, impactZ, 4.4, 28, spec.hex);
      this.pushEvent(room, {
        kind: 'craterSlam',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: impactX,
        y: floorY + 0.3,
        z: impactZ,
        dirX: fx,
        dirZ: fz,
        radius: 4.4,
        colorHex: spec.hex,
        abilitySlot: 3,
        isComboLink: true,
        hitStopMs: 65,
        callout: 'METEOR HEEL DROP!',
      });
      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        const d = Math.hypot(target.x - impactX, target.z - impactZ);
        if (d <= 4.6 && Math.abs(target.y - floorY) <= 6.5) {
          const calc = this.computeDynamicDamage(actor, target, 22, 3);
          const hit = this.applyHit(
            room,
            actor,
            target,
            calc.dmg,
            30 + calc.staggerBonus,
            1.4,
            fx,
            fz,
            spec.hex,
            true,
            false,
            false,
            calc.isCrit,
            calc.isBackstab
          );
          if (hit) {
            target.y = floorY + 0.25;
            target.yVel = 4.6;
            target.grounded = false;
            target.vx = fx * 1.5;
            target.vz = fz * 1.5;
            applyDirectStun(target, 0.62, false);
          }
        }
      }
      return;
    }
  }

  private tryActivateAbility(
    room: RoomInstance,
    actor: InternalActor,
    slot: AbilitySlot,
    holdHeavy = false,
    rawAimX?: number,
    rawAimZ?: number,
    isHoldVariant = false
  ): void {
    if (room.awakeningPhase === 'CUTSCENE') return;
    if (actor.channelKind === 'jm_sky_peak' && slot === 0 && !actor.isKO) {
      actor.skyComboMashes = (actor.skyComboMashes ?? 0) + 1;
      this.pushEvent(room, {
        kind: 'skyComboStep',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x,
        y: actor.y + 1.15,
        z: actor.z,
        colorHex: 0xfef08a,
        abilitySlot: 4,
      });
      return;
    }
    if (actor.isKO || actor.channelKind !== null || actor.actionState === 'clash' || actor.actionState === 'whiff' || actor.actionState === 'headlock') return;
    if (actor.actionState === 'stagger') return;
    if (room.activeDomainClash && slot >= 2) return;
    if (actor.silencedTimer > 0 && slot >= 2) return;
    if (slot === 6 && !actor.awakened) return;
    if (slot === 7 && !hasAscendedAbility(actor.skinId)) return;

    // Ascended Khen Key 5 Re-Press: Swap positions seamlessly with living Abyssal Clone (0.35s swap micro-delay)
    if (slot === 7 && actor.fighterId === 'khen') {
      const existingClone = room.abyssalClones.find((c) => c.ownerId === actor.playerId && c.hp > 0);
      if (existingClone) {
        if ((actor.cooldowns[7] ?? 0) > 0.01) return;
        const oldAx = actor.x;
        const oldAy = actor.y;
        const oldAz = actor.z;
        const oldARot = actor.rotY;
        const safeActor = resolveObstacleCollisions(room.mapId, existingClone.x, existingClone.y, existingClone.z, 0.48, room.obstacles);
        actor.x = safeActor.x;
        actor.y = existingClone.y;
        actor.z = safeActor.z;
        actor.rotY = existingClone.rotY;
        enforceDomainBarrierForActor(room, actor);

        const safeClone = resolveObstacleCollisions(room.mapId, oldAx, oldAy, oldAz, 0.42, room.obstacles);
        existingClone.x = safeClone.x;
        existingClone.y = oldAy;
        existingClone.z = safeClone.z;
        existingClone.rotY = oldARot;

        const zeroCdSwap = room.isTrainingMode && room.trainingConfig.zeroCooldowns && !actor.isBot;
        actor.cooldowns[7] = zeroCdSwap ? 0 : 0.35;
        actor.actionState = actor.grounded ? 'idle' : 'jump';
        actor.actionTimer = 0;
        actor.abilitySlot = null;
        this.pushEvent(room, {
          kind: 'cloneSwap',
          attackerId: actor.playerId,
          fighterId: 'khen',
          skinId: actor.skinId,
          x: actor.x,
          y: actor.y + 1.0,
          z: actor.z,
          originX: oldAx,
          originY: oldAy + 1.0,
          originZ: oldAz,
          colorHex: 0xa855f7,
          abilitySlot: 7,
          callout: 'ABYSSAL SWAP!',
        });
        return;
      }
    }

    // Stage 2 Multi-Stage Skill execution (e.g. Skyburst Launch, Crater Slam, Shadow Swap, JM Meteor Heel Drop)
    if (!actor.awakened && slot === 3 && actor.stage2Slot === 3 && actor.stage2Timer > 0 && actor.cooldowns[3] <= 0.01) {
      if (actor.stamina >= 10) {
        this.executeStage2Skill(room, actor);
      }
      return;
    }

    // Combo-into-Skill Cancel: JM M1 hits 1-3 cancel immediately into Skill 1/2 with zero delay; others retain late-M1 cancel
    const jmInstantCancel = canJmCancelM1(actor.fighterId, actor.actionState, actor.comboStep, slot);
    const canCancelM1IntoSkill =
      jmInstantCancel ||
      (actor.actionState === 'attack' &&
        (slot === 2 || slot === 3 || slot === 6 || slot === 7) &&
        (actor.comboStep >= 2 || actor.actionTimer <= 0.16));

    if (
      !canCancelM1IntoSkill &&
      actor.actionTimer > 0.08 &&
      actor.actionState !== 'idle' &&
      actor.actionState !== 'move' &&
      actor.actionState !== 'jump'
    ) {
      return;
    }

    if (slot === 5 && (actor.fighterId !== 'jm' || !isJtinsullenTag(actor.name))) {
      return;
    }

    if ((actor.cooldowns[slot] ?? 0) > 0.01) return;

    const spec = FIGHTER_BY_ID[actor.fighterId];
    const awAb =
      actor.awakened && (slot === 0 || slot === 2 || slot === 3 || slot === 4 || slot === 6)
        ? getAwakenedAbility(actor.fighterId, slot as 0 | 2 | 3 | 4 | 6)
        : null;
    const baseIdx = slot === 6 ? 4 : slot === 5 || slot === 7 ? 4 : slot;
    const ab = awAb
      ? {
          ...awAb,
          manaCost: awAb.chiCost,
          staminaCost: 0,
        }
      : slot === 5
      ? JM_SECRET_ABILITY
      : slot === 7
      ? ASCENDED_ABILITIES[actor.fighterId]
      : spec.abilities[baseIdx];

    const costRes = computeAbilityResourceCost(
      { manaCost: ab.manaCost, staminaCost: ab.staminaCost },
      {
        awakened: actor.awakened,
        counterFlowActive: actor.counterFlowActive,
        slot,
        holdHeavy,
      }
    );
    const isJmSanctuaryUlt =
      actor.fighterId === 'jm' &&
      slot === 6 &&
      room.activeDomain?.ownerId === actor.playerId &&
      room.activeDomain.fighterId === 'jm';
    const isDamenJackpot =
      actor.fighterId === 'damen' &&
      Boolean(actor.domainJackpotActive) &&
      room.activeDomain?.ownerId === actor.playerId;
    const reqMana = isJmSanctuaryUlt || isDamenJackpot ? 0 : costRes.reqMana;
    const reqStam = isDamenJackpot ? 0 : costRes.reqStam;

    if (actor.mana < reqMana || actor.stamina < reqStam) return;

    actor.mana = clamp(actor.mana - reqMana, 0, actor.maxMana);
    actor.stamina = clamp(actor.stamina - reqStam, 0, actor.maxStamina);

    // Check Clash Trigger against nearby incoming Ultimate!
    if (slot === 1 || slot === 0) {
      const ultAttacker = room.actors.find(
        (other) =>
          other.playerId !== actor.playerId &&
          !other.isKO &&
          other.actionState === 'ultimate' &&
          !other.windupTriggered &&
          other.abilitySlot !== 5 &&
          actor.clashCooldown <= 0 &&
          other.clashCooldown <= 0 &&
          Math.hypot(other.x - actor.x, other.z - actor.z) <= 6.8
      );
      if (ultAttacker && !room.activeClash) {
        this.startClash(room, ultAttacker, actor);
        return;
      }
    }

    let clampedAim: { x: number; z: number } | null = null;
    if (rawAimX !== undefined && rawAimZ !== undefined) {
      clampedAim = this.clampAimPoint(
        room,
        actor,
        rawAimX,
        rawAimZ,
        slot === 0 ? Math.max(ab.range, 16.0) : (ab.aimRange ?? 9.5)
      );
    } else if (slot === 6 && actor.awakened && actor.fighterId === 'khen') {
      clampedAim = findBestEnemyClusterTarget(
        actor.x,
        actor.z,
        actor.playerId,
        room.actors,
        ab.aimRange ?? 14.0,
        ab.aimRadius ?? 8.5
      );
    }

    const searchRange =
      slot === 0
        ? actor.fighterId === 'jm' && actor.isFlying
          ? 18.0
          : actor.fighterId === 'damen'
          ? 11.5
          : actor.fighterId === 'marjohn'
          ? 9.0
          : 5.5
        : Math.max(ab.range + 4.0, 14.5);

    const target =
      slot === 0
        ? this.findNearestTarget(room, actor, searchRange)
        : this.findPreferredTarget(room, actor, searchRange);

    if (clampedAim && (slot === 0 || slot === 2 || slot === 3 || slot === 4 || slot === 5 || slot === 6 || slot === 7)) {
      const adx = clampedAim.x - actor.x;
      const adz = clampedAim.z - actor.z;
      if (Math.hypot(adx, adz) > 0.15) {
        actor.rotY = Math.atan2(adx, adz);
      }
    } else if (slot === 0 && actor.fighterId === 'jm' && actor.isFlying) {
      // Flying JM tap auto-aims nearest enemy or moves in input/facing direction
      actor.rotY = target
        ? Math.atan2(target.x - actor.x, target.z - actor.z)
        : Math.abs(actor.moveX) > 0.1 || Math.abs(actor.moveZ) > 0.1
        ? Math.atan2(actor.moveX, actor.moveZ)
        : actor.rotY;
    } else if (target) {
      actor.rotY = Math.atan2(target.x - actor.x, target.z - actor.z);
    } else if (
      (slot === 0 || slot === 2 || slot === 3 || slot === 4 || slot === 6 || slot === 7) &&
      (Math.abs(actor.moveX) > 0.1 || Math.abs(actor.moveZ) > 0.1)
    ) {
      actor.rotY = Math.atan2(actor.moveX, actor.moveZ);
    }

    // Cooldown calculation (Restored Slot 2 Skills + Multi-stage Slot 3 + 0.5s JM Air M1 + Prime Domain +30% M1 Speed)
    let cd = ab.cooldown;
    const inPrimeCrucible =
      actor.fighterId === 'prime' &&
      room.activeDomain?.ownerId === actor.playerId &&
      room.activeDomain.fighterId === 'prime';
    if (slot === 0 && actor.fighterId === 'jm' && actor.isFlying) {
      cd = 0.5;
    } else if (slot === 0 && inPrimeCrucible) {
      cd = ab.cooldown / PRIME_DOMAIN_CONFIG.m1SpeedMult;
    } else if (slot === 0 && actor.fighterId === 'khen' && actor.frenzyInside) {
      cd = ab.cooldown * 0.85;
    }

    const zeroCdActive = room.isTrainingMode && room.trainingConfig.zeroCooldowns && !actor.isBot;

    const jmBaseSkill2Stage =
      !actor.awakened && slot === 3 && actor.fighterId === 'jm' && !isHoldVariant
        ? resolveJmBaseSkill2Mode({
            awakened: actor.awakened,
            isFlying: actor.isFlying,
            grounded: actor.grounded,
            stage2Slot: actor.stage2Slot,
            stage2Timer: actor.stage2Timer,
            nearbyAirborneTarget: Boolean(target && !target.grounded),
          })
        : null;

    if (jmBaseSkill2Stage === 'meteor_heel_drop') {
      actor.stage2PendingCooldown = zeroCdActive ? 0 : cd * getModeAbilityCooldownFactor(room, actor);
      this.executeStage2Skill(room, actor);
      return;
    }

    const opensStage2 =
      !actor.awakened &&
      slot === 3 &&
      ((actor.fighterId === 'prime' && !isHoldVariant) ||
        actor.fighterId === 'marjohn' ||
        actor.fighterId === 'khen' ||
        (actor.fighterId === 'jm' && jmBaseSkill2Stage === 'rising_kick'));

    const modeCdFactor = getModeAbilityCooldownFactor(room, actor);
    if (opensStage2) {
      actor.cooldowns[3] = zeroCdActive ? 0 : 0.28;
      actor.stage2Slot = 3;
      actor.stage2Timer = actor.fighterId === 'marjohn' ? 3.8 : actor.fighterId === 'khen' ? 3.4 : actor.fighterId === 'jm' ? 3.2 : 2.5;
      actor.stage2Label = ab.stage2Label ?? 'FOLLOW-UP';
      actor.stage2PendingCooldown = zeroCdActive ? 0 : cd * modeCdFactor;
    } else if (slot === 7 && actor.fighterId === 'khen') {
      // Khen Clone 18s cooldown is death-gated (starts when Clone is destroyed); brief 0.35s swap guard only!
      actor.cooldowns[7] = zeroCdActive ? 0 : 0.35;
    } else {
      const krenFrenzyCd = actor.fighterId === 'khen' && actor.frenzyInside && slot >= 2 ? 0.75 : 1.0;
      actor.cooldowns[slot] = zeroCdActive ? 0 : cd * krenFrenzyCd * modeCdFactor;
      if (slot === 3) {
        actor.stage2Slot = null;
        actor.stage2Timer = 0;
        actor.stage2Label = '';
      }
    }

    // Detect Combo Links (Slot 2 Skill <-> Slot 3 Skill or M1 Cancel -> Skill)
    const linkAge = room.matchTime - actor.lastAbilityAt;
    let isComboLink = false;
    if (
      slot === 3 &&
      linkAge <= 1.8 &&
      actor.lastAbilitySlot === 2 &&
      (actor.fighterId === 'marjohn' || actor.fighterId === 'khen' || actor.fighterId === 'jm')
    ) {
      isComboLink = true;
    } else if (
      slot === 2 &&
      linkAge <= 1.8 &&
      actor.lastAbilitySlot === 3 &&
      (actor.fighterId === 'prime' || actor.fighterId === 'damen')
    ) {
      isComboLink = true;
    } else if (canCancelM1IntoSkill && slot === 3) {
      isComboLink = true;
    }

    const linkOriginX = actor.lastOriginX;
    const linkOriginY = actor.lastOriginY;
    const linkOriginZ = actor.lastOriginZ;
    actor.lastOriginX = actor.x;
    actor.lastOriginY = actor.y;
    actor.lastOriginZ = actor.z;
    actor.lastCastSlot = slot;

    if (isComboLink) {
      this.pushEvent(room, {
        kind: 'comboLink',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.15,
        z: actor.z,
        originX: linkOriginX,
        originY: linkOriginY + 1.0,
        originZ: linkOriginZ,
        dirX: Math.sin(actor.rotY),
        dirZ: Math.cos(actor.rotY),
        colorHex: spec.hex,
        abilitySlot: slot,
        isComboLink: true,
        frenzyInside: actor.frenzyInside,
      });
    }

    actor.pendingComboLink = isComboLink;
    actor.pendingAimX = clampedAim ? clampedAim.x : null;
    actor.pendingAimZ = clampedAim ? clampedAim.z : null;
    actor.pendingHoldVariant = Boolean(isHoldVariant && clampedAim);
    actor.lastAbilitySlot = slot;
    actor.lastAbilityAt = room.matchTime;
    actor.abilitySlot = slot;
    actor.windupTriggered = false;
    actor.landedCurrentAction = false;
    actor.shieldActive = false;
    actor.parryWindow = false;
    actor.pendingHoldHeavy = false;
    actor.superArmor = false;

    const castDirX = Math.sin(actor.rotY);
    const castDirZ = Math.cos(actor.rotY);

    if (awAb && (slot === 0 || slot === 2 || slot === 3 || slot === 4 || slot === 6)) {
      setupAwakenedAbilityWindup(
        room,
        actor,
        slot as 0 | 2 | 3 | 4 | 6,
        castDirX,
        castDirZ,
        clampedAim,
        this.getAwakeningHelpers()
      );
      return;
    }

    if (slot === 0) {
      const isSingleHitRanged =
        actor.fighterId === 'damen' ||
        actor.fighterId === 'marjohn' ||
        (actor.fighterId === 'jm' && actor.isFlying);

      if (isSingleHitRanged) {
        actor.comboStep = 1;
      } else {
        // Advance 4-hit M1 chain for JM Ground, Prime, Khen!
        if (room.matchTime - actor.lastM1At <= 1.55) {
          actor.comboStep = ((actor.comboStep % 4) + 1) as 1 | 2 | 3 | 4;
        } else {
          actor.comboStep = 1;
        }
      }
      actor.lastM1At = room.matchTime;

      const is4thFinisher = !isSingleHitRanged && actor.comboStep === 4;
      const is3rdBeam = actor.fighterId === 'jm' && !actor.isFlying && actor.comboStep === 3;
      actor.m1Variant = is4thFinisher || (holdHeavy && actor.comboStep >= 3) ? 'heavy' : 'light';
      actor.pendingHoldHeavy = is4thFinisher;

      // Prime Juggernaut Armor passive during 4th-hit Ground Slam wind-up!
      if (actor.fighterId === 'prime' && is4thFinisher) {
        actor.superArmor = true;
      }

      const primeDomainM1 =
        actor.fighterId === 'prime' &&
        room.activeDomain?.ownerId === actor.playerId &&
        room.activeDomain.fighterId === 'prime';
      const baseDur =
        actor.fighterId === 'jm' && actor.isFlying
          ? 0.24
          : is4thFinisher
          ? 0.28
          : is3rdBeam
          ? 0.26
          : ab.duration;
      const dur = primeDomainM1 ? baseDur / PRIME_DOMAIN_CONFIG.m1SpeedMult : baseDur;

      actor.actionState = 'attack';
      actor.actionDuration = dur;
      actor.actionTimer = dur;

      if (!isSingleHitRanged) {
        if (actor.fighterId === 'khen' && is4thFinisher) {
          actor.vx = castDirX * 15.8;
          actor.vz = castDirZ * 15.8;
        } else if (actor.fighterId === 'jm' && is4thFinisher) {
          actor.vx = castDirX * 16.5;
          actor.vz = castDirZ * 16.5;
        } else if (actor.fighterId === 'prime' && is4thFinisher) {
          actor.vx = castDirX * 4.5;
          actor.vz = castDirZ * 4.5;
          actor.yVel = Math.max(actor.yVel, 3.6);
          actor.grounded = false;
        } else {
          actor.vx = castDirX * 5.2;
          actor.vz = castDirZ * 5.2;
        }
      }

      if (actor.fighterId === 'prime' && is4thFinisher) {
        this.spawnTelegraph(
          room,
          actor,
          'circle',
          actor.x,
          actor.y,
          actor.z,
          castDirX,
          castDirZ,
          3.8,
          0,
          0,
          ab.windup + 0.08,
          spec.hex
        );
      }

      this.pushEvent(room, {
        kind: 'cast',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.1,
        z: actor.z,
        dirX: castDirX,
        dirZ: castDirZ,
        colorHex: spec.hex,
        abilitySlot: 0,
        comboStep: actor.comboStep,
        m1Variant: actor.m1Variant,
        frenzyInside: actor.frenzyInside,
      });
    } else if (slot === 1) {
      actor.actionState = 'guard';
      actor.actionDuration = ab.duration;
      actor.actionTimer = ab.duration;
      actor.shieldActive = true;
      actor.parryWindow = true;
      actor.parryStartedAt = room.matchTime;
      this.pushEvent(room, {
        kind: 'cast',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.05,
        z: actor.z,
        dirX: castDirX,
        dirZ: castDirZ,
        colorHex: spec.hex,
        abilitySlot: 1,
        frenzyInside: actor.frenzyInside,
      });
    } else if (slot === 2) {
      // Restored Character Slot 2 Signature Skills (no longer overwritten by generic Dash!)
      actor.actionState = 'skill';
      actor.actionDuration = ab.duration;
      actor.actionTimer = ab.duration;

      const aimDest = clampedAim ?? {
        x: actor.x + castDirX * Math.min(ab.aimRange ?? 6.5, 5.8),
        z: actor.z + castDirZ * Math.min(ab.aimRange ?? 6.5, 5.8),
      };

      if (actor.fighterId === 'marjohn') {
        // Cloud Vault: vault up & arc toward aim/forward landing before slamming down
        const dx = aimDest.x - actor.x;
        const dz = aimDest.z - actor.z;
        const d = Math.max(0.1, Math.hypot(dx, dz));
        const travelSpd = Math.min(18.0, d / Math.max(0.18, ab.windup));
        actor.yVel = 7.4;
        actor.grounded = false;
        actor.vx = (dx / d) * travelSpd;
        actor.vz = (dz / d) * travelSpd;
        this.spawnTelegraph(
          room,
          actor,
          'circle',
          aimDest.x,
          getMapTerrainHeight(room.mapId, aimDest.x, aimDest.z),
          aimDest.z,
          castDirX,
          castDirZ,
          3.8,
          0,
          0,
          ab.windup,
          spec.hex
        );
      } else if (actor.fighterId === 'prime') {
        // Meteor Charge: blazing bull rush along line
        actor.superArmor = true;
        actor.vx = castDirX * 16.5;
        actor.vz = castDirZ * 16.5;
        this.spawnTelegraph(
          room,
          actor,
          'line',
          actor.x,
          getMapTerrainHeight(room.mapId, actor.x, actor.z),
          actor.z,
          castDirX,
          castDirZ,
          2.1,
          7.5,
          0,
          ab.windup,
          spec.hex
        );
      } else if (actor.fighterId === 'damen') {
        // Outlaw Roll: evasive roll with brief i-frames + Deadeye Fan Shot
        actor.iframeTimer = Math.max(actor.iframeTimer, 0.24);
        const rollDirX = Math.hypot(actor.moveX, actor.moveZ) > 0.1 ? actor.moveX : -castDirX;
        const rollDirZ = Math.hypot(actor.moveX, actor.moveZ) > 0.1 ? actor.moveZ : -castDirZ;
        const rMag = Math.max(0.01, Math.hypot(rollDirX, rollDirZ));
        actor.vx = (rollDirX / rMag) * 14.0;
        actor.vz = (rollDirZ / rMag) * 14.0;
      } else if (actor.fighterId === 'khen') {
        // Shadow Blink: telegraph arrival zone before void warp
        this.spawnTelegraph(
          room,
          actor,
          'circle',
          aimDest.x,
          getMapTerrainHeight(room.mapId, aimDest.x, aimDest.z),
          aimDest.z,
          castDirX,
          castDirZ,
          3.2,
          0,
          0,
          ab.windup,
          spec.hex
        );
      } else if (actor.fighterId === 'jm') {
        // Flash Step: golden blink corridor
        this.spawnTelegraph(
          room,
          actor,
          'line',
          actor.x,
          getMapTerrainHeight(room.mapId, actor.x, actor.z),
          actor.z,
          castDirX,
          castDirZ,
          2.2,
          7.5,
          0,
          ab.windup,
          spec.hex
        );
      }

      this.pushEvent(room, {
        kind: 'cast',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.0,
        z: actor.z,
        originX: isComboLink ? linkOriginX : undefined,
        originY: isComboLink ? linkOriginY + 1.0 : undefined,
        originZ: isComboLink ? linkOriginZ : undefined,
        dirX: castDirX,
        dirZ: castDirZ,
        colorHex: spec.hex,
        abilitySlot: 2,
        isComboLink,
        frenzyInside: actor.frenzyInside,
      });
    } else if (slot === 3) {
      actor.actionState = 'skill';
      actor.actionDuration = ab.duration;
      actor.actionTimer = ab.duration;
      if (actor.fighterId === 'prime') {
        if (actor.pendingHoldVariant && clampedAim) {
          const d = Math.max(0.1, Math.hypot(clampedAim.x - actor.x, clampedAim.z - actor.z));
          actor.yVel = 7.2;
          actor.grounded = false;
          actor.vx = ((clampedAim.x - actor.x) / d) * Math.min(14.5, d / Math.max(0.2, ab.windup));
          actor.vz = ((clampedAim.z - actor.z) / d) * Math.min(14.5, d / Math.max(0.2, ab.windup));
          this.spawnTelegraph(
            room,
            actor,
            'circle',
            clampedAim.x,
            actor.y,
            clampedAim.z,
            castDirX,
            castDirZ,
            4.2,
            0,
            0,
            ab.windup,
            spec.hex
          );
        } else {
          // Stage 1 Magma Uppercut step
          actor.vx = castDirX * 8.2;
          actor.vz = castDirZ * 8.2;
        }
      } else if (actor.fighterId === 'jm' && !actor.pendingHoldVariant) {
        actor.yVel = 6.2;
        actor.grounded = false;
        actor.vx = castDirX * 6.8;
        actor.vz = castDirZ * 6.8;
      }

      this.pushEvent(room, {
        kind: 'cast',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.0,
        z: actor.z,
        originX: isComboLink ? linkOriginX : undefined,
        originY: isComboLink ? linkOriginY + 1.0 : undefined,
        originZ: isComboLink ? linkOriginZ : undefined,
        dirX: castDirX,
        dirZ: castDirZ,
        colorHex: spec.hex,
        abilitySlot: 3,
        isComboLink,
        frenzyInside: actor.frenzyInside,
        counterFlow: actor.counterFlowActive,
      });
    } else if (slot === 4) {
      actor.actionState = 'ultimate';
      actor.actionDuration = ab.duration;
      actor.actionTimer = ab.duration;

      const aimPt = clampedAim ?? {
        x: actor.x + castDirX * (actor.fighterId === 'prime' ? 2.2 : 3.2),
        z: actor.z + castDirZ * (actor.fighterId === 'prime' ? 2.2 : 3.2),
      };

      if (actor.fighterId === 'marjohn') {
        this.spawnTelegraph(room, actor, 'circle', aimPt.x, actor.y, aimPt.z, castDirX, castDirZ, 5.2, 0, 0, ab.windup, spec.hex);
      } else if (actor.fighterId === 'prime') {
        this.spawnTelegraph(room, actor, 'circle', aimPt.x, actor.y, aimPt.z, castDirX, castDirZ, 4.5, 0, 0, ab.windup, spec.hex);
      } else if (actor.fighterId === 'damen') {
        this.spawnTelegraph(room, actor, 'cone', actor.x, actor.y, actor.z, castDirX, castDirZ, 0, 14.5, 0.38, ab.windup, spec.hex);
      } else if (actor.fighterId === 'khen') {
        this.spawnTelegraph(room, actor, 'line', actor.x, actor.y, actor.z, castDirX, castDirZ, 2.2, 9.5, 0, ab.windup, spec.hex);
      } else if (actor.fighterId === 'jm') {
        this.spawnTelegraph(room, actor, 'line', actor.x, actor.y, actor.z, castDirX, castDirZ, 2.3, 15.0, 0, ab.windup, spec.hex);
      }

      this.pushEvent(room, {
        kind: 'cast',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 1.0,
        z: actor.z,
        dirX: castDirX,
        dirZ: castDirZ,
        colorHex: spec.hex,
        abilitySlot: 4,
        frenzyInside: actor.frenzyInside,
        counterFlow: actor.counterFlowActive,
      });
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 0.15,
        z: actor.z,
        dirX: castDirX,
        dirZ: castDirZ,
        colorHex: spec.hex,
        abilitySlot: 4,
        callout: `${ab.name.toUpperCase()} — DODGE OR CLASH!`,
      });
      if (actor.fighterId === 'marjohn' && !actor.pendingHoldVariant) {
        actor.vx = castDirX * 14.5;
        actor.vz = castDirZ * 14.5;
      }
    } else if (slot === 5) {
      // JM Secret Jtinsullen Ultimate: Solar Meteor Sky Charge & Aim!
      const aimPt =
        clampedAim ??
        (target
          ? this.clampAimPoint(room, actor, target.x, target.z, ab.aimRange ?? 17.5)
          : this.clampAimPoint(room, actor, actor.x + castDirX * 5.0, actor.z + castDirZ * 5.0, ab.aimRange ?? 17.5));
      actor.pendingAimX = aimPt.x;
      actor.pendingAimZ = aimPt.z;
      actor.actionState = 'ultimate';
      actor.actionDuration = ab.duration;
      actor.actionTimer = ab.duration;
      actor.iframeTimer = Math.max(actor.iframeTimer, ab.windup + 0.18);
      actor.vx = 0;
      actor.vz = 0;
      actor.yVel = 0;
      actor.grounded = false;

      const aimGroundY = getMapTerrainHeight(room.mapId, aimPt.x, aimPt.z);
      this.spawnTelegraph(
        room,
        actor,
        'circle',
        aimPt.x,
        aimGroundY,
        aimPt.z,
        castDirX,
        castDirZ,
        ab.aimRadius ?? 6.2,
        0,
        0,
        ab.windup,
        0xfacc15
      );
      this.pushEvent(room, {
        kind: 'fireballCharge',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x,
        y: actor.y + 2.2,
        z: actor.z,
        dirX: castDirX,
        dirZ: castDirZ,
        colorHex: 0xfacc15,
        abilitySlot: 5,
        callout: 'SOLAR METEOR CHARGING!',
      });
    } else if (slot === 7) {
      // Ascended Secret 5th Ability (Key 5)
      const aimMax = ab.aimRange ?? 10.0;
      const farTarget =
        actor.fighterId === 'jm'
          ? this.findNearestTarget(room, actor, aimMax)
          : target;
      const defaultDist = actor.fighterId === 'jm' ? 14.0 : Math.min(5.0, aimMax);
      const aimPt =
        clampedAim ??
        (farTarget
          ? this.clampAimPoint(room, actor, farTarget.x, farTarget.z, aimMax)
          : this.clampAimPoint(room, actor, actor.x + castDirX * defaultDist, actor.z + castDirZ * defaultDist, aimMax));
      actor.pendingAimX = aimPt.x;
      actor.pendingAimZ = aimPt.z;
      actor.actionState = actor.fighterId === 'jm' ? 'ultimate' : 'skill';
      actor.actionDuration = ab.duration;
      actor.actionTimer = ab.duration;

      if (actor.fighterId === 'jm') {
        actor.iframeTimer = Math.max(actor.iframeTimer, ab.windup + 0.25);
        actor.vx = 0;
        actor.vz = 0;
        actor.yVel = 0;
        actor.grounded = false;
        const aimGroundY = getMapTerrainHeight(room.mapId, aimPt.x, aimPt.z);
        this.spawnTelegraph(
          room,
          actor,
          'circle',
          aimPt.x,
          aimGroundY,
          aimPt.z,
          castDirX,
          castDirZ,
          ab.aimRadius ?? 4.5,
          0,
          0,
          ab.windup,
          0xfde047
        );
        this.pushEvent(room, {
          kind: 'fireballCharge',
          attackerId: actor.playerId,
          fighterId: 'jm',
          skinId: actor.skinId,
          x: actor.x,
          y: actor.y + 2.4,
          z: actor.z,
          dirX: castDirX,
          dirZ: castDirZ,
          colorHex: 0xfde047,
          abilitySlot: 7,
          callout: 'CELESTIAL JUDGEMENT!',
        });
      } else {
        if (actor.fighterId === 'prime') {
          actor.superArmor = true;
        }
        if (ab.aimKind === 'point') {
          this.spawnTelegraph(
            room,
            actor,
            'circle',
            aimPt.x,
            getMapTerrainHeight(room.mapId, aimPt.x, aimPt.z),
            aimPt.z,
            castDirX,
            castDirZ,
            ab.aimRadius ?? 2.6,
            0,
            0,
            ab.windup,
            spec.hex
          );
        }
        this.pushEvent(room, {
          kind: 'cast',
          attackerId: actor.playerId,
          fighterId: actor.fighterId,
          skinId: actor.skinId,
          x: actor.x,
          y: actor.y + 1.15,
          z: actor.z,
          dirX: castDirX,
          dirZ: castDirZ,
          colorHex: spec.hex,
          abilitySlot: 7,
          callout: `${ab.name.toUpperCase()}!`,
        });
      }
    }
  }

  private startClash(room: RoomInstance, a: InternalActor, b: InternalActor): void {
    const midX = (a.x + b.x) * 0.5;
    const midZ = (a.z + b.z) * 0.5;
    const midY = Math.max(a.y, b.y);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    const nx = dx / d;
    const nz = dz / d;

    a.x = midX - nx * 1.15;
    a.z = midZ - nz * 1.15;
    b.x = midX + nx * 1.15;
    b.z = midZ + nz * 1.15;
    enforceDomainBarrierForActor(room, a);
    enforceDomainBarrierForActor(room, b);
    a.rotY = Math.atan2(nx, nz);
    b.rotY = Math.atan2(-nx, -nz);

    [a, b].forEach((act) => {
      this.clearActorTelegraph(room, act);
      act.vx = 0;
      act.vz = 0;
      act.actionState = 'clash';
      act.actionTimer = 2.4;
      act.actionDuration = 2.4;
      act.abilitySlot = null;
      act.shieldActive = false;
      act.parryWindow = false;
      act.clashCooldown = 8.0;
    });

    const clashId = makeId('clash');
    room.activeClash = {
      id: clashId,
      playerAId: a.playerId,
      playerBId: b.playerId,
      remaining: 2.35,
      maxTime: 2.35,
      choiceA: null,
      choiceB: null,
      x: midX,
      y: midY + 1.1,
      z: midZ,
    };

    this.pushEvent(room, {
      kind: 'clashStart',
      attackerId: a.playerId,
      targetId: b.playerId,
      x: midX,
      y: midY + 1.1,
      z: midZ,
      colorHex: 0xfacc15,
      hitStopMs: 90,
      callout: 'CLASH SHOWDOWN!',
    });
  }

  private resolveClash(room: RoomInstance): void {
    const clash = room.activeClash;
    if (!clash) return;
    room.activeClash = null;

    const a = room.actors.find((x) => x.playerId === clash.playerAId);
    const b = room.actors.find((x) => x.playerId === clash.playerBId);
    if (!a || !b) return;

    const cA: CombatMoveType = clash.choiceA ?? 'strike';
    const cB: CombatMoveType = clash.choiceB ?? 'strike';

    // Strike > Grab > Parry > Strike
    let winner = a;
    let loser = b;
    if (cA === cB) {
      const scoreA = a.stamina + a.comboCount * 5;
      const scoreB = b.stamina + b.comboCount * 5;
      if (scoreB > scoreA) {
        winner = b;
        loser = a;
      }
    } else if (
      (cB === 'strike' && cA === 'grab') ||
      (cB === 'grab' && cA === 'parry') ||
      (cB === 'parry' && cA === 'strike')
    ) {
      winner = b;
      loser = a;
    }

    const dx = loser.x - winner.x;
    const dz = loser.z - winner.z;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    const nx = dx / d;
    const nz = dz / d;

    const dmg = 26;
    winner.actionState = 'idle';
    winner.actionTimer = 0;
    winner.mana = clamp(winner.mana + 25, 0, winner.maxMana);
    winner.stamina = clamp(winner.stamina + 25, 0, winner.maxStamina);
    winner.damageDealt += dmg;
    winner.comboCount += 1;

    loser.hp = Math.max(0, loser.hp - dmg);
    loser.damagePhase = getDamagePhase(loser.hp, loser.maxHp, loser.isKO);
    loser.lastDamagedAt = room.matchTime;
    loser.vx = nx * 13.5;
    loser.vz = nz * 13.5;
    loser.yVel = 6.0;
    loser.grounded = false;
    if (canApplyStun(loser.stunImmunityTimer)) {
      const clashStun = resolveCappedStunDuration(0.75, true);
      loser.actionState = 'stagger';
      loser.actionTimer = clashStun;
      loser.actionDuration = clashStun;
    }
    this.addStagger(room, winner, loser, 42);

    this.pushEvent(room, {
      kind: 'clashWin',
      attackerId: winner.playerId,
      targetId: loser.playerId,
      fighterId: winner.fighterId,
      x: clash.x,
      y: clash.y,
      z: clash.z,
      dirX: nx,
      dirZ: nz,
      colorHex: FIGHTER_BY_ID[winner.fighterId].hex,
      damage: dmg,
      isCrit: true,
      hitStopMs: 110,
      callout: `${FIGHTER_BY_ID[winner.fighterId].name} WINS CLASH!`,
    });

    if (loser.hp <= 0) {
      this.eliminateActor(room, winner, loser, 'clash');
    }
  }

  private addStagger(room: RoomInstance, attacker: InternalActor, target: InternalActor, amount: number): void {
    if (target.isKO || target.isStunned || !canApplyStun(target.stunImmunityTimer)) return;
    let mult = 1.0;
    if (target.actionState === 'whiff') mult *= 1.4;
    // Prime Blaze Fury armor grants light stagger resistance during swings
    if (target.fighterId === 'prime' && (target.actionState === 'attack' || target.actionState === 'skill')) {
      mult *= 0.8;
    }
    target.stagger = clamp(target.stagger + Math.round(amount * mult), 0, 100);
    if (target.stagger >= 100) {
      const stunDur = resolveCappedStunDuration(0.75, false);
      target.stagger = 100;
      target.isStunned = true;
      target.actionState = 'stagger';
      target.actionTimer = stunDur;
      target.actionDuration = stunDur;
      target.shieldActive = false;
      target.parryWindow = false;
      this.pushEvent(room, {
        kind: 'stun',
        attackerId: attacker.playerId,
        targetId: target.playerId,
        fighterId: target.fighterId,
        x: target.x,
        y: target.y + 1.5,
        z: target.z,
        colorHex: 0xfacc15,
        callout: 'STUNNED! PUNISH!',
      });
    }
  }

  private computeDynamicDamage(
    actor: InternalActor,
    target: InternalActor,
    baseDamage: number,
    slot: AbilitySlot
  ): { dmg: number; isBackstab: boolean; isCrit: boolean; staggerBonus: number } {
    let mult = 1.0;
    let isBackstab = false;
    let isCrit = false;
    let staggerBonus = 0;

    // 1. Overdrive (<28% HP comeback boost)
    if (actor.isOverdrive) {
      mult += 0.22;
    }

    // 2. Frenzy Zone / Strength Orb / Crimson Might Elixir buffs
    if (actor.frenzyInside) {
      mult += 0.25;
    }
    if ((actor.strengthBuffTimer ?? 0) > 0) {
      mult += 0.2;
    }
    if ((actor.permanentDamageBonus ?? 0) > 0) {
      mult += actor.permanentDamageBonus ?? 0;
    }

    // 3. Airborne bonus during Gravity Surge
    if (!actor.grounded) {
      mult += 0.15;
    }

    // 4. Whiff / Stunned Punish Multiplier
    if (target.actionState === 'whiff') {
      mult += 0.35;
      isCrit = true;
      staggerBonus += 14;
    } else if (target.isStunned) {
      mult += 0.28;
      isCrit = true;
    }

    // 5. Backstab / Flank Angle Bonus
    const dx = target.x - actor.x;
    const dz = target.z - actor.z;
    const dist = Math.max(0.01, Math.hypot(dx, dz));
    const atkX = dx / dist;
    const atkZ = dz / dist;
    const tgtFwdX = Math.sin(target.rotY);
    const tgtFwdZ = Math.cos(target.rotY);
    const alignment = atkX * tgtFwdX + atkZ * tgtFwdZ;
    if (alignment > 0.45) {
      isBackstab = true;
      isCrit = true;
      mult += 0.3;
      staggerBonus += 12;
    } else if (alignment > -0.25) {
      mult += 0.12;
      staggerBonus += 5;
    }

    // 6. Character Passives
    if (actor.fighterId === 'marjohn') {
      mult += actor.passiveStacks * 0.04;
    } else if (actor.fighterId === 'prime') {
      const missingPct = 1 - actor.hp / Math.max(1, actor.maxHp);
      mult += Math.min(0.2, missingPct * 0.28);
    } else if (actor.fighterId === 'damen') {
      if (actor.frenzyInside) {
        mult += 0.15;
      }
    } else if (actor.fighterId === 'khen') {
      // Khen Shadow Backstab Passive: +20% bonus damage when striking from behind!
      if (isBackstab) {
        mult += 0.2;
        actor.stamina = clamp(actor.stamina + 10, 0, actor.maxStamina);
      }
    } else if (actor.fighterId === 'jm' && actor.counterFlowActive && (slot === 2 || slot === 3 || slot === 4 || slot === 5)) {
      mult += 0.35;
      isCrit = true;
      actor.counterFlowActive = false;
    }

    // 7. Combo Link & M1 4-Hit Scaling
    if (actor.pendingComboLink) {
      mult += 0.22;
      isCrit = true;
      staggerBonus += FIGHTER_BY_ID[actor.fighterId].comboLink.bonusStagger;
    }
    if (slot === 0 && actor.comboStep === 4) {
      mult += 0.45;
      isCrit = true;
      staggerBonus += 18;
    } else if (slot === 0 && actor.comboStep === 3) {
      mult += 0.2;
    }

    return {
      dmg: Math.max(1, Math.round(baseDamage * mult)),
      isBackstab,
      isCrit,
      staggerBonus,
    };
  }

  private executeAbilityImpact(room: RoomInstance, actor: InternalActor): void {
    if (actor.abilitySlot === null) return;
    const spec = FIGHTER_BY_ID[actor.fighterId];
    const slot = actor.abilitySlot;
    const fxPre = Math.sin(actor.rotY);
    const fzPre = Math.cos(actor.rotY);

    // JM Domain Edge Bounce Empower: next M1 or skill fires an extra golden crescent wave!
    if (
      actor.fighterId === 'jm' &&
      actor.empoweredM1Ready &&
      (slot === 0 || slot === 2 || slot === 3 || slot === 4 || slot === 6)
    ) {
      actor.empoweredM1Ready = false;
      this.pushEvent(room, {
        kind: 'crescentSlash',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fxPre * 0.9,
        y: actor.y + 1.1,
        z: actor.z + fzPre * 0.9,
        dirX: fxPre,
        dirZ: fzPre,
        radius: 2.3,
        colorHex: 0xfacc15,
        abilitySlot: slot,
      });
      room.projectiles.push({
        id: makeId('proj'),
        ownerId: actor.playerId,
        fighterId: 'jm',
        skinId: actor.skinId,
        kind: 'crescent',
        x: actor.x + fxPre * 1.0,
        y: actor.y + 1.15,
        z: actor.z + fzPre * 1.0,
        vx: fxPre * 26.0,
        vz: fzPre * 26.0,
        rotY: actor.rotY,
        colorHex: 0xfacc15,
        originX: actor.x,
        originY: actor.y + 1.15,
        originZ: actor.z,
        isOverdrive: true,
        age: 0,
        maxAge: 0.56,
        maxRange: 13.5,
        damage: 11,
        staggerDamage: 12,
        knockback: 5.5,
        hitIds: new Set(),
      });
    }

    if (actor.awakened && (slot === 0 || slot === 2 || slot === 3 || slot === 4 || slot === 6)) {
      executeAwakenedAbilityImpact(room, actor, slot as 0 | 2 | 3 | 4 | 6, this.getAwakeningHelpers());
      enforceDomainBarriers(room);
      return;
    }
    const ab =
      slot === 5
        ? JM_SECRET_ABILITY
        : slot === 7
        ? ASCENDED_ABILITIES[actor.fighterId]
        : spec.abilities[slot === 6 ? 4 : slot];
    this.clearActorTelegraph(room, actor);

    const fx = Math.sin(actor.rotY);
    const fz = Math.cos(actor.rotY);

    // JM Secret Jtinsullen Solar Meteor Launch!
    if (actor.fighterId === 'jm' && slot === 5) {
      const aimX = actor.pendingAimX ?? actor.x + fx * 5.0;
      const aimZ = actor.pendingAimZ ?? actor.z + fz * 5.0;
      const targetGroundY = getMapTerrainHeight(room.mapId, aimX, aimZ);
      const startY = actor.y + 2.4;
      const flightTime = 0.34;
      const dx = aimX - actor.x;
      const dz = aimZ - actor.z;
      const dy = targetGroundY + 0.35 - startY;
      const rotAim = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : actor.rotY;

      room.projectiles.push({
        id: makeId('proj'),
        ownerId: actor.playerId,
        fighterId: 'jm',
        kind: 'solarFireball',
        x: actor.x,
        y: startY,
        z: actor.z,
        vx: dx / flightTime,
        vy: dy / flightTime,
        vz: dz / flightTime,
        rotY: rotAim,
        colorHex: 0xfacc15,
        originX: actor.x,
        originY: startY,
        originZ: actor.z,
        targetX: aimX,
        targetY: targetGroundY + 0.35,
        targetZ: aimZ,
        isOverdrive: true,
        age: 0,
        maxAge: flightTime + 0.04,
        damage: ab.damage,
        staggerDamage: ab.staggerDamage,
        knockback: ab.knockback,
        hitIds: new Set(),
      });

      this.pushEvent(room, {
        kind: 'fireballLaunch',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x,
        y: startY,
        z: actor.z,
        dirX: fx,
        dirZ: fz,
        colorHex: 0xfacc15,
        abilitySlot: 5,
        callout: 'SOLAR METEOR!',
      });
      actor.landedCurrentAction = true;
      return;
    }

    // ASCENDED SECRET 5TH ABILITIES (Key 5 / slot === 7)
    if (slot === 7) {
      const aimX = actor.pendingAimX ?? actor.x + fx * 4.5;
      const aimZ = actor.pendingAimZ ?? actor.z + fz * 4.5;
      const safeAim = resolveObstacleCollisions(room.mapId, aimX, actor.y, aimZ, 0.55, room.obstacles);
      const aimGroundY = getMapTerrainHeight(room.mapId, safeAim.x, safeAim.z);
      const aimSupportY = getObstacleSupportY(room.mapId, safeAim.x, actor.y + 1.0, safeAim.z, 0.42, room.obstacles);

      if (actor.fighterId === 'marjohn') {
        room.turrets = room.turrets.filter((t) => !(t.ownerId === actor.playerId && t.kind === 'storm_tornado'));
        room.turrets.push({
          id: makeId('turret'),
          ownerId: actor.playerId,
          fighterId: 'marjohn',
          kind: 'storm_tornado',
          x: safeAim.x,
          y: Math.max(aimGroundY, aimSupportY),
          z: safeAim.z,
          rotY: actor.rotY,
          remaining: 10.0,
          maxDuration: 10.0,
          fireTimer: 0.25,
          burstIndex: 0,
        });
        this.pushEvent(room, {
          kind: 'turretPlant',
          attackerId: actor.playerId,
          fighterId: 'marjohn',
          skinId: actor.skinId,
          x: safeAim.x,
          y: Math.max(aimGroundY, aimSupportY) + 0.35,
          z: safeAim.z,
          radius: 3.2,
          colorHex: 0x38bdf8,
          abilitySlot: 7,
          callout: 'STORM TORNADO TURRET!',
        });
        for (const t of room.actors) {
          if (t.playerId === actor.playerId || t.isKO) continue;
          const d = Math.hypot(t.x - safeAim.x, t.z - safeAim.z);
          if (d <= 3.2) {
            const calc = this.computeDynamicDamage(actor, t, ab.damage, 7);
            this.applyHit(room, actor, t, calc.dmg, ab.staggerDamage, ab.knockback, d > 0.05 ? (t.x - safeAim.x) / d : fx, d > 0.05 ? (t.z - safeAim.z) / d : fz, 0x38bdf8, true);
          }
        }
        this.damageAbyssalClonesInArea(room, actor, safeAim.x, safeAim.z, 3.2, ab.damage, 0x38bdf8);
        actor.landedCurrentAction = true;
        return;
      }

      if (actor.fighterId === 'prime') {
        // Slam 1 triggers now; Channel executes Slam 2 (+0.34s) and Slam 3 + Volcano Turret (+0.68s)
        const slamX = actor.x + fx * 1.1;
        const slamZ = actor.z + fz * 1.1;
        const slamY = getMapTerrainHeight(room.mapId, slamX, slamZ);
        this.damageObstaclesInArea(room, slamX, slamZ, 4.6, 35, 0xf43f5e);
        this.pushEvent(room, {
          kind: 'asuraSlam',
          attackerId: actor.playerId,
          fighterId: 'prime',
          skinId: actor.skinId,
          x: slamX,
          y: slamY + 0.25,
          z: slamZ,
          radius: 4.6,
          colorHex: 0xf43f5e,
          abilitySlot: 7,
          hitStopMs: 35,
          callout: 'ASURA SEISMIC SLAMS!',
        });
        for (const t of room.actors) {
          if (t.playerId === actor.playerId || t.isKO) continue;
          const d = Math.hypot(t.x - slamX, t.z - slamZ);
          if (d <= 4.6) {
            const calc = this.computeDynamicDamage(actor, t, 12, 7);
            this.applyHit(room, actor, t, calc.dmg, 20, 7.5, d > 0.05 ? (t.x - slamX) / d : fx, d > 0.05 ? (t.z - slamZ) / d : fz, 0xf43f5e, true);
          }
        }
        this.damageAbyssalClonesInArea(room, actor, slamX, slamZ, 4.6, 12, 0xf43f5e);
        actor.channelKind = 'prime_asura_slams';
        actor.channelDuration = 0.72;
        actor.channelTimer = 0.72;
        actor.channelTickTimer = 0.34;
        actor.channelStep = 1;
        actor.channelTargetX = safeAim.x;
        actor.channelTargetZ = safeAim.z;
        actor.landedCurrentAction = true;
        return;
      }

      if (actor.fighterId === 'damen') {
        room.turrets = room.turrets.filter((t) => !(t.ownerId === actor.playerId && t.kind === 'solar_gun'));
        for (let i = 0; i < 3; i++) {
          const ang = (i * Math.PI * 2) / 3;
          room.turrets.push({
            id: makeId('turret'),
            ownerId: actor.playerId,
            fighterId: 'damen',
            kind: 'solar_gun',
            x: actor.x + Math.cos(ang) * 0.95,
            y: actor.y + 2.25,
            z: actor.z + Math.sin(ang) * 0.95,
            rotY: actor.rotY,
            remaining: 10.0,
            maxDuration: 10.0,
            headOffsetIndex: i,
            fireTimer: 0.14 + i * 0.15,
            burstIndex: 0,
          });
        }
        this.pushEvent(room, {
          kind: 'turretPlant',
          attackerId: actor.playerId,
          fighterId: 'damen',
          skinId: actor.skinId,
          x: actor.x,
          y: actor.y + 2.25,
          z: actor.z,
          radius: 2.2,
          colorHex: 0xfacc15,
          abilitySlot: 7,
          callout: 'SOLAR HALO TURRETS!',
        });
        actor.landedCurrentAction = true;
        return;
      }

      if (actor.fighterId === 'khen') {
        room.abyssalClones = room.abyssalClones.filter((c) => c.ownerId !== actor.playerId);
        const cloneY = Math.max(aimGroundY, aimSupportY);
        room.abyssalClones.push({
          id: makeId('aclone'),
          ownerId: actor.playerId,
          name: `${actor.name} Clone`,
          hp: actor.maxHp,
          maxHp: actor.maxHp,
          x: safeAim.x,
          y: cloneY,
          z: safeAim.z,
          rotY: actor.rotY,
          actionState: 'idle',
          swingTimer: 0,
          vx: 0,
          vz: 0,
          attackCd: 0.25,
          dashCd: 0.6,
          flankAngle: Math.random() * Math.PI * 2,
        });
        this.pushEvent(room, {
          kind: 'cloneSpawn',
          attackerId: actor.playerId,
          fighterId: 'khen',
          skinId: actor.skinId,
          x: safeAim.x,
          y: cloneY + 1.0,
          z: safeAim.z,
          radius: 2.4,
          colorHex: 0xa855f7,
          abilitySlot: 7,
          callout: 'ABYSSAL CLONE SUMMONED!',
        });
        actor.landedCurrentAction = true;
        return;
      }

      if (actor.fighterId === 'jm') {
        const detX = safeAim.x;
        const detZ = safeAim.z;
        const detY = getMapTerrainHeight(room.mapId, detX, detZ);
        const arenaRadius = MAP_BY_ID[room.mapId].arenaRadius;
        room.judgementSpears = room.judgementSpears.filter((s) => s.ownerId !== actor.playerId);
        room.judgementSpears.push({
          id: makeId('spear'),
          ownerId: actor.playerId,
          x: detX,
          y: detY,
          z: detZ,
          remaining: 10.0,
          maxDuration: 10.0,
          waveRadius: 0.8,
          maxRadius: arenaRadius + 4.0,
          pulseCount: 1,
          nextWaveAt: 1.05,
          hitThisWave: new Set(),
        });
        this.damageObstaclesInArea(room, detX, detZ, 4.5, 50, 0xfde047);
        this.pushEvent(room, {
          kind: 'fireballImpact',
          attackerId: actor.playerId,
          fighterId: 'jm',
          skinId: actor.skinId,
          x: detX,
          y: detY + 0.35,
          z: detZ,
          originX: actor.x,
          originY: actor.y + 1.8,
          originZ: actor.z,
          radius: 4.5,
          colorHex: 0xfde047,
          hitStopMs: 95,
          abilitySlot: 7,
          callout: 'CELESTIAL JUDGEMENT SPEAR!',
        });
        this.pushEvent(room, {
          kind: 'judgementSpearPulse',
          attackerId: actor.playerId,
          fighterId: 'jm',
          skinId: actor.skinId,
          x: detX,
          y: detY + 0.25,
          z: detZ,
          radius: 5.0,
          colorHex: 0x38bdf8,
          abilitySlot: 7,
        });
        for (const t of room.actors) {
          if (t.playerId === actor.playerId || t.isKO) continue;
          const d = Math.hypot(t.x - detX, t.z - detZ);
          if (d <= 4.5) {
            const calc = this.computeDynamicDamage(actor, t, ab.damage, 7);
            this.applyHit(room, actor, t, calc.dmg, ab.staggerDamage + calc.staggerBonus, ab.knockback, d > 0.05 ? (t.x - detX) / d : fx, d > 0.05 ? (t.z - detZ) / d : fz, 0xfde047, true, false, true, true, calc.isBackstab);
          }
        }
        this.damageAbyssalClonesInArea(room, actor, detX, detZ, 4.5, ab.damage, 0xfde047);
        actor.landedCurrentAction = true;
        return;
      }
    }

    // Check melee-to-melee Clash between two simultaneous melee attackers!
    if ((slot === 0 || slot === 3) && actor.fighterId !== 'damen' && actor.clashCooldown <= 0 && !room.activeClash) {
      const clashingOther = room.actors.find(
        (other) =>
          other.playerId !== actor.playerId &&
          !other.isKO &&
          other.fighterId !== 'damen' &&
          other.clashCooldown <= 0 &&
          (other.actionState === 'attack' || other.actionState === 'skill') &&
          !other.windupTriggered &&
          Math.hypot(other.x - actor.x, other.z - actor.z) <= 3.1
      );
      if (clashingOther) {
        this.startClash(room, actor, clashingOther);
        return;
      }
    }

    // RESTORED SLOT 2 CHARACTER SKILLS
    if (slot === 2) {
      const arenaRadius = MAP_BY_ID[room.mapId].arenaRadius;
      const aimDest =
        actor.pendingAimX !== null && actor.pendingAimZ !== null
          ? { x: actor.pendingAimX, z: actor.pendingAimZ }
          : { x: actor.x + fx * 5.2, z: actor.z + fz * 5.2 };

      if (actor.fighterId === 'marjohn') {
        // Cloud Vault Slam: radial cyclone slam at landing point!
        const safe = resolveObstacleCollisions(room.mapId, aimDest.x, actor.y, aimDest.z, 0.48, room.obstacles);
        const r = Math.hypot(safe.x, safe.z);
        actor.x = r > arenaRadius ? (safe.x / r) * arenaRadius : safe.x;
        actor.z = r > arenaRadius ? (safe.z / r) * arenaRadius : safe.z;
        enforceDomainBarrierForActor(room, actor);
        actor.yVel = Math.min(0, actor.yVel);
        this.damageObstaclesInArea(room, actor.x, actor.z, 4.1, ab.damage * 1.4, spec.hex);
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'marjohn',
          x: actor.x,
          y: actor.y + 0.15,
          z: actor.z,
          dirX: fx,
          dirZ: fz,
          colorHex: spec.hex,
          abilitySlot: 2,
          isComboLink: actor.pendingComboLink,
        });
        for (const target of room.actors) {
          if (target.playerId === actor.playerId || target.isKO) continue;
          if (Math.abs(target.y - actor.y) > 2.8) continue;
          const dx = target.x - actor.x;
          const dz = target.z - actor.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= 3.9) {
            const dirX = dist > 0.05 ? dx / dist : fx;
            const dirZ = dist > 0.05 ? dz / dist : fz;
            const calc = this.computeDynamicDamage(actor, target, ab.damage, 2);
            if (this.applyHit(room, actor, target, calc.dmg, ab.staggerDamage + calc.staggerBonus, ab.knockback, dirX, dirZ, spec.hex, true, false, false, calc.isCrit, calc.isBackstab)) {
              actor.landedCurrentAction = true;
              target.yVel = Math.max(target.yVel, 6.4);
              target.grounded = false;
            }
          }
        }
        return;
      }

      if (actor.fighterId === 'prime') {
        // Meteor Charge: armored bull rush smash along lane!
        const originX = actor.x - fx * 1.4;
        const originZ = actor.z - fz * 1.4;
        this.damageObstaclesInArea(room, actor.x + fx * 2.0, actor.z + fz * 2.0, 3.6, ab.damage * 1.6, spec.hex);
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'prime',
          x: actor.x,
          y: actor.y + 0.25,
          z: actor.z,
          dirX: fx,
          dirZ: fz,
          colorHex: spec.hex,
          abilitySlot: 2,
          isComboLink: actor.pendingComboLink,
        });
        // Check Molten Fissure Steam Eruption!
        const fissure = room.zones.find(
          (z) =>
            z.ownerId === actor.playerId &&
            z.kind === 'moltenFissure' &&
            Math.hypot(actor.x - z.x, actor.z - z.z) <= z.radius + 1.2
        );
        if (fissure) {
          room.zones = room.zones.filter((z) => z.id !== fissure.id);
          this.pushEvent(room, {
            kind: 'trapTrigger',
            attackerId: actor.playerId,
            fighterId: 'prime',
            x: fissure.x,
            y: fissure.y + 0.35,
            z: fissure.z,
            colorHex: 0xfb923c,
            abilitySlot: 2,
          });
        }
        for (const target of room.actors) {
          if (target.playerId === actor.playerId || target.isKO) continue;
          if (Math.abs(target.y - actor.y) > 2.5) continue;
          const dx = target.x - originX;
          const dz = target.z - originZ;
          const along = dx * fx + dz * fz;
          const perp = Math.abs(dx * -fz + dz * fx);
          if (along >= -0.4 && along <= 6.6 && perp <= 2.4) {
            const calc = this.computeDynamicDamage(actor, target, ab.damage + (fissure ? 6 : 0), 2);
            if (this.applyHit(room, actor, target, calc.dmg, ab.staggerDamage + calc.staggerBonus, ab.knockback, fx, fz, spec.hex, true, false, false, calc.isCrit, calc.isBackstab)) {
              actor.landedCurrentAction = true;
            }
          }
        }
        return;
      }

      if (actor.fighterId === 'damen') {
        // Outlaw Roll -> Deadeye Fan Shot (3-shot burst with volley scaling)
        actor.empoweredM1Ready = true;
        const volleyHitCounts = new Map<string, number>();
        const inDamenDomain =
          room.activeDomain?.ownerId === actor.playerId && room.activeDomain.fighterId === 'damen';
        for (const spread of [-0.16, 0, 0.16]) {
          const ang = actor.rotY + spread;
          room.projectiles.push({
            id: makeId('proj'),
            ownerId: actor.playerId,
            fighterId: 'damen',
            skinId: actor.skinId,
            kind: 'magnum',
            x: actor.x + Math.sin(ang) * 0.85,
            y: actor.y + 1.15,
            z: actor.z + Math.cos(ang) * 0.85,
            vx: Math.sin(ang) * 25,
            vz: Math.cos(ang) * 25,
            rotY: ang,
            colorHex: 0xfef08a,
            originX: actor.x,
            originY: actor.y + 1.15,
            originZ: actor.z,
            isComboLink: actor.pendingComboLink,
            isOverdrive: actor.isOverdrive,
            isHoming: inDamenDomain,
            age: 0,
            maxAge: 0.48,
            maxRange: 11.4,
            damage: 10,
            staggerDamage: 12,
            knockback: 5.5,
            hitIds: new Set(),
            volleyHitCounts,
            volleyMaxHits: 2,
          });
        }
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'damen',
          x: actor.x,
          y: actor.y + 0.9,
          z: actor.z,
          dirX: fx,
          dirZ: fz,
          colorHex: 0xfacc15,
          abilitySlot: 2,
          isComboLink: actor.pendingComboLink,
        });
        actor.landedCurrentAction = true;
        return;
      }

      if (actor.fighterId === 'khen') {
        // Shadow Blink: leave Void Decoy at origin, warp to destination & slash!
        const originX = actor.x;
        const originY = actor.y;
        const originZ = actor.z;
        this.spawnZone(room, actor, 'voidDecoy', originX, originY, originZ, 1.75, 2.8, spec.hex);
        const safe = resolveObstacleCollisions(room.mapId, aimDest.x, actor.y, aimDest.z, 0.48, room.obstacles);
        const r = Math.hypot(safe.x, safe.z);
        actor.x = r > arenaRadius ? (safe.x / r) * arenaRadius : safe.x;
        actor.z = r > arenaRadius ? (safe.z / r) * arenaRadius : safe.z;
        actor.iframeTimer = Math.max(actor.iframeTimer, 0.22);
        this.damageObstaclesInArea(room, actor.x, actor.z, 3.6, ab.damage * 1.3, spec.hex);
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'khen',
          x: actor.x,
          y: actor.y + 0.9,
          z: actor.z,
          originX,
          originY: originY + 0.9,
          originZ,
          dirX: fx,
          dirZ: fz,
          colorHex: spec.hex,
          abilitySlot: 2,
          isComboLink: true,
        });
        for (const target of room.actors) {
          if (target.playerId === actor.playerId || target.isKO) continue;
          const dx = target.x - actor.x;
          const dz = target.z - actor.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= 3.3 && Math.abs(target.y - actor.y) <= 2.4) {
            const calc = this.computeDynamicDamage(actor, target, ab.damage, 2);
            if (this.applyHit(room, actor, target, calc.dmg, ab.staggerDamage + calc.staggerBonus, ab.knockback, dist > 0.05 ? dx / dist : fx, dist > 0.05 ? dz / dist : fz, spec.hex, true, false, false, calc.isCrit, calc.isBackstab)) {
              actor.landedCurrentAction = true;
            }
          }
        }
        return;
      }

      if (actor.fighterId === 'jm') {
        // Flash Step Stagger: palm-ring afterimage + spiraling wind streak + crater-cracking palm burst leaving enemy right in front of JM!
        const originX = actor.x;
        const originY = actor.y;
        const originZ = actor.z;
        const safe = resolveObstacleCollisions(room.mapId, aimDest.x, actor.y, aimDest.z, 0.48, room.obstacles);
        const r = Math.hypot(safe.x, safe.z);
        actor.x = r > arenaRadius ? (safe.x / r) * arenaRadius : safe.x;
        actor.z = r > arenaRadius ? (safe.z / r) * arenaRadius : safe.z;
        if (actor.isFlying && actor.pendingAimX !== null) {
          actor.y = Math.max(getObstacleSupportY(room.mapId, actor.x, actor.y, actor.z, 0.42, room.obstacles) + 0.2, actor.y * 0.4);
        }
        this.damageObstaclesInArea(room, actor.x, actor.z, 3.6, ab.damage * 1.35, spec.hex);
        this.pushEvent(room, {
          kind: 'dash',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x,
          y: actor.y + 0.9,
          z: actor.z,
          originX,
          originY: originY + 0.9,
          originZ,
          dirX: fx,
          dirZ: fz,
          colorHex: spec.hex,
          abilitySlot: 2,
        });
        this.pushEvent(room, {
          kind: 'craterSlam',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x + fx * 0.7,
          y: actor.y + 0.3,
          z: actor.z + fz * 0.7,
          originX,
          originY: originY + 0.9,
          originZ,
          dirX: fx,
          dirZ: fz,
          radius: 3.4,
          colorHex: spec.hex,
          abilitySlot: 2,
          isComboLink: true,
          callout: 'FLASH STEP!',
        });
        const segX = actor.x - originX;
        const segZ = actor.z - originZ;
        const segLen = Math.max(0.1, Math.hypot(segX, segZ));
        const sDirX = segX / segLen;
        const sDirZ = segZ / segLen;
        let primaryHitTarget: InternalActor | null = null;
        for (const target of room.actors) {
          if (target.playerId === actor.playerId || target.isKO) continue;
          const dx = target.x - originX;
          const dz = target.z - originZ;
          const along = dx * sDirX + dz * sDirZ;
          const perp = Math.abs(dx * -sDirZ + dz * sDirX);
          if (along >= -0.8 && along <= segLen + 1.8 && perp <= 2.35 && Math.abs(target.y - actor.y) <= 4.5) {
            const calc = this.computeDynamicDamage(actor, target, ab.damage, 2);
            if (this.applyHit(room, actor, target, calc.dmg, ab.staggerDamage + calc.staggerBonus, 0.6, sDirX, sDirZ, spec.hex, true, false, false, calc.isCrit, calc.isBackstab)) {
              actor.landedCurrentAction = true;
              target.vx = 0;
              target.vz = 0;
              applyDirectStun(target, 0.68, false);
              if (!primaryHitTarget) primaryHitTarget = target;
            }
          }
        }
        if (primaryHitTarget) {
          const place = resolveObstacleCollisions(
            room.mapId,
            primaryHitTarget.x - sDirX * 1.55,
            actor.y,
            primaryHitTarget.z - sDirZ * 1.55,
            0.48,
            room.obstacles
          );
          actor.x = place.x;
          actor.z = place.z;
          actor.rotY = Math.atan2(primaryHitTarget.x - actor.x, primaryHitTarget.z - actor.z);
        }
        return;
      }
    }

    // SIGNATURE M1 PATTERNS (slot === 0)
    if (slot === 0) {
      // 1. MARJOHN: Ranged Wind-Blade / Tornado Poke (buffed velocity & scaling)
      if (actor.fighterId === 'marjohn') {
        room.projectiles.push({
          id: makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'marjohn',
          skinId: actor.skinId,
          kind: 'tornado',
          x: actor.x + fx * 0.95,
          y: actor.y + 0.95,
          z: actor.z + fz * 0.95,
          vx: fx * 17.5,
          vz: fz * 17.5,
          rotY: actor.rotY,
          colorHex: spec.hex,
          originX: actor.x,
          originY: actor.y + 0.95,
          originZ: actor.z,
          isOverdrive: actor.isOverdrive,
          age: 0,
          maxAge: 0.6,
          maxRange: 8.6,
          damage: 14,
          staggerDamage: 16,
          knockback: 4.5,
          hitIds: new Set(),
        });
        actor.landedCurrentAction = true;
        return;
      }

      // 2. DAMEN: Gun (strict 9.8m range cap; Sure-Hit tracking inside Idle Deadeye Gamble)
      if (actor.fighterId === 'damen') {
        const isDeadeye = Boolean(actor.empoweredM1Ready);
        if (isDeadeye) actor.empoweredM1Ready = false;
        const inDamenDomain =
          room.activeDomain?.ownerId === actor.playerId && room.activeDomain.fighterId === 'damen';
        room.projectiles.push({
          id: makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'damen',
          skinId: actor.skinId,
          kind: isDeadeye ? 'magnum' : 'bullet',
          x: actor.x + fx * 0.85,
          y: actor.y + 1.15,
          z: actor.z + fz * 0.85,
          vx: fx * (isDeadeye ? 21.5 : 18.5),
          vz: fz * (isDeadeye ? 21.5 : 18.5),
          rotY: actor.rotY,
          colorHex: isDeadeye ? 0xfef08a : spec.hex,
          originX: actor.x,
          originY: actor.y + 1.15,
          originZ: actor.z,
          isOverdrive: isDeadeye || actor.isOverdrive,
          isHoming: inDamenDomain,
          age: 0,
          maxAge: 0.58,
          maxRange: 9.8,
          damage: isDeadeye ? 15 : 11,
          staggerDamage: isDeadeye ? 18 : 13,
          knockback: isDeadeye ? 5.0 : 3.2,
          hitIds: new Set(),
        });
        actor.landedCurrentAction = true;
        return;
      }

      // 3. JM AIRBORNE (Sky Flight Active): Fires golden energy bolts along swipe-aim or auto-aim at nearest opponent!
      if (actor.fighterId === 'jm' && actor.isFlying) {
        let dirX = fx * Math.cos(actor.aimPitch);
        let dirY = Math.sin(actor.aimPitch);
        let dirZ = fz * Math.cos(actor.aimPitch);
        if (actor.pendingAimX !== null && actor.pendingAimZ !== null) {
          const groundY = getMapTerrainHeight(room.mapId, actor.pendingAimX, actor.pendingAimZ) + 0.9;
          const tx = actor.pendingAimX - actor.x;
          const ty = groundY - (actor.y + 1.1);
          const tz = actor.pendingAimZ - actor.z;
          const len = Math.max(0.01, Math.hypot(tx, ty, tz));
          dirX = tx / len;
          dirY = ty / len;
          dirZ = tz / len;
          actor.rotY = Math.atan2(tx, tz);
        } else {
          const tgt = this.findNearestTarget(room, actor, 18.0);
          if (tgt) {
            const tx = tgt.x - actor.x;
            const ty = tgt.y + 1.0 - (actor.y + 1.1);
            const tz = tgt.z - actor.z;
            const len = Math.max(0.01, Math.hypot(tx, ty, tz));
            dirX = tx / len;
            dirY = ty / len;
            dirZ = tz / len;
            actor.rotY = Math.atan2(tx, tz);
          } else {
            const len = Math.max(0.01, Math.hypot(dirX, dirY, dirZ));
            dirX /= len;
            dirY /= len;
            dirZ /= len;
          }
        }
        const boltSpeed = 21.5;
        room.projectiles.push({
          id: makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'jm',
          skinId: actor.skinId,
          kind: 'jmBolt',
          x: actor.x + dirX * 0.85,
          y: actor.y + 1.15 + dirY * 0.4,
          z: actor.z + dirZ * 0.85,
          vx: dirX * boltSpeed,
          vy: dirY * boltSpeed,
          vz: dirZ * boltSpeed,
          rotY: actor.rotY,
          colorHex: 0xfacc15,
          originX: actor.x,
          originY: actor.y + 1.15,
          originZ: actor.z,
          isOverdrive: actor.isOverdrive,
          age: 0,
          maxAge: 0.90,
          maxRange: 17.5,
          damage: 11,
          staggerDamage: 14,
          knockback: 4.5,
          hitIds: new Set(),
        });
        actor.landedCurrentAction = true;
        return;
      }

      // 4. JM GROUND 3rd Hit: Crescent Slash + Mini Energy Beam
      if (actor.fighterId === 'jm' && actor.comboStep === 3) {
        this.pushEvent(room, {
          kind: 'crescentSlash',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x + fx * 0.85,
          y: actor.y + 1.05,
          z: actor.z + fz * 0.85,
          dirX: fx,
          dirZ: fz,
          radius: 2.0,
          colorHex: 0x38bdf8,
          abilitySlot: 0,
          comboStep: 3,
        });
        room.projectiles.push({
          id: makeId('proj'),
          ownerId: actor.playerId,
          fighterId: 'jm',
          skinId: actor.skinId,
          kind: 'jmBeam',
          x: actor.x + fx * 1.05,
          y: actor.y + 1.15,
          z: actor.z + fz * 1.05,
          vx: fx * 20.0,
          vz: fz * 20.0,
          rotY: actor.rotY,
          colorHex: 0xfacc15,
          originX: actor.x,
          originY: actor.y + 1.15,
          originZ: actor.z,
          isOverdrive: actor.isOverdrive,
          age: 0,
          maxAge: 0.46,
          maxRange: 8.8,
          damage: 13,
          staggerDamage: 18,
          knockback: 6.2,
          hitIds: new Set(),
        });
        this.pushEvent(room, {
          kind: 'beam',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x + fx * 0.9,
          y: actor.y + 1.15,
          z: actor.z + fz * 0.9,
          dirX: fx,
          dirZ: fz,
          colorHex: 0xfacc15,
          abilitySlot: 0,
          comboStep: 3,
        });
        actor.landedCurrentAction = true;
        return;
      }

      // 5. PRIME 4th Hit: Armored AoE Ground Slam shockwave ring around him!
      if (actor.fighterId === 'prime' && actor.comboStep === 4) {
        actor.superArmor = Boolean(actor.primeDomainBuff);
        this.damageObstaclesInArea(room, actor.x, actor.z, 4.2, 26, spec.hex);
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'prime',
          x: actor.x,
          y: actor.y + 0.14,
          z: actor.z,
          dirX: fx,
          dirZ: fz,
          radius: actor.primeDomainBuff ? 4.8 : 4.1,
          colorHex: actor.primeDomainBuff ? 0xf97316 : spec.hex,
          abilitySlot: 0,
          comboStep: 4,
          m1Variant: 'heavy',
          hitStopMs: 65,
        });
        for (const target of room.actors) {
          if (target.playerId === actor.playerId || target.isKO) continue;
          if (Math.abs(target.y - actor.y) > 2.6) continue;
          const dx = target.x - actor.x;
          const dz = target.z - actor.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= (actor.primeDomainBuff ? 4.8 : 4.1)) {
            const dirX = dist > 0.05 ? dx / dist : fx;
            const dirZ = dist > 0.05 ? dz / dist : fz;
            const calc = this.computeDynamicDamage(actor, target, actor.primeDomainBuff ? 24 : 19, 0);
            if (this.applyHit(room, actor, target, calc.dmg, 26 + calc.staggerBonus, 9.8, dirX, dirZ, spec.hex, true, false, false, calc.isCrit, calc.isBackstab)) {
              actor.landedCurrentAction = true;
              actor.mana = clamp(actor.mana + 20, 0, actor.maxMana);
            }
          }
        }
        this.damageAbyssalClonesInArea(room, actor, actor.x, actor.z, actor.primeDomainBuff ? 4.8 : 4.1, actor.primeDomainBuff ? 24 : 19, spec.hex);
        return;
      }

      // 6. KHEN 4th Hit: Damaging Dash Lunge slicing straight through!
      if (actor.fighterId === 'khen' && actor.comboStep === 4) {
        this.damageObstaclesInArea(room, actor.x + fx * 1.4, actor.z + fz * 1.4, 2.8, 18, spec.hex);
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'khen',
          x: actor.x + fx * 1.4,
          y: actor.y + 0.85,
          z: actor.z + fz * 1.4,
          originX: actor.x - fx * 1.2,
          originY: actor.y + 0.85,
          originZ: actor.z - fz * 1.2,
          dirX: fx,
          dirZ: fz,
          colorHex: spec.hex,
          abilitySlot: 0,
          comboStep: 4,
          m1Variant: 'heavy',
        });
        for (const target of room.actors) {
          if (target.playerId === actor.playerId || target.isKO) continue;
          if (Math.abs(target.y - actor.y) > 2.4) continue;
          const dx = target.x - (actor.x - fx * 1.5);
          const dz = target.z - (actor.z - fz * 1.5);
          const along = dx * fx + dz * fz;
          const perp = Math.abs(dx * -fz + dz * fx);
          if (along >= -0.4 && along <= 5.4 && perp <= 1.85) {
            const calc = this.computeDynamicDamage(actor, target, 14, 0);
            if (this.applyHit(room, actor, target, calc.dmg, 20 + calc.staggerBonus, 8.2, fx, fz, spec.hex, true, false, false, calc.isCrit, calc.isBackstab)) {
              actor.landedCurrentAction = true;
              actor.speedBoostTimer = Math.max(actor.speedBoostTimer, 1.5);
              actor.mana = clamp(actor.mana + 18, 0, actor.maxMana);
            }
          }
        }
        return;
      }
    }

    if (actor.fighterId === 'damen' && slot === 3) {
      if (actor.pendingHoldVariant && actor.pendingAimX !== null && actor.pendingAimZ !== null) {
        // Hold-Drag variant: plant wide electrified Solar Tripwire across aim point!
        const cx = actor.pendingAimX;
        const cz = actor.pendingAimZ;
        const perpX = -fz;
        const perpZ = fx;
        const span = 3.0;
        this.spawnZone(
          room,
          actor,
          'solarTripwire',
          cx - perpX * span,
          actor.y,
          cz - perpZ * span,
          6.8,
          1.4,
          0xfacc15,
          cx + perpX * span,
          cz + perpZ * span
        );
        this.pushEvent(room, {
          kind: 'trap',
          attackerId: actor.playerId,
          fighterId: 'damen',
          x: cx,
          y: actor.y + 0.35,
          z: cz,
          dirX: perpX,
          dirZ: perpZ,
          colorHex: 0xfacc15,
          abilitySlot: 3,
          callout: 'SOLAR TRIPWIRE!',
        });
        actor.landedCurrentAction = true;
        return;
      }

      room.projectiles.push({
        id: makeId('proj'),
        ownerId: actor.playerId,
        fighterId: actor.fighterId,
        skinId: actor.skinId,
        kind: 'lasso',
        x: actor.x + fx * 0.9,
        y: actor.y + 1.05,
        z: actor.z + fz * 0.9,
        vx: fx * 29,
        vz: fz * 29,
        rotY: actor.rotY,
        colorHex: 0xfacc15,
        originX: actor.x,
        originY: actor.y + 1.05,
        originZ: actor.z,
        isComboLink: actor.pendingComboLink,
        isOverdrive: actor.isOverdrive,
        age: 0,
        maxAge: 0.58,
        damage: ab.damage + (actor.isOverdrive ? 5 : 0),
        staggerDamage: ab.staggerDamage,
        knockback: ab.knockback,
        hitIds: new Set(),
      });
      return;
    }

    if (actor.fighterId === 'damen' && slot === 4) {
      const volleyHitCounts = new Map<string, number>();
      const inDamenDomain =
        room.activeDomain?.ownerId === actor.playerId && room.activeDomain.fighterId === 'damen';
      for (const spread of [-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36]) {
        const ang = actor.rotY + spread;
        room.projectiles.push({
          id: makeId('proj'),
          ownerId: actor.playerId,
          fighterId: actor.fighterId,
          skinId: actor.skinId,
          kind: 'bullet',
          x: actor.x + Math.sin(ang) * 0.9,
          y: actor.y + 1.15,
          z: actor.z + Math.cos(ang) * 0.9,
          vx: Math.sin(ang) * 26,
          vz: Math.cos(ang) * 26,
          rotY: ang,
          colorHex: 0xfef08a,
          originX: actor.x,
          originY: actor.y + 1.15,
          originZ: actor.z,
          isHoming: inDamenDomain,
          age: 0,
          maxAge: 0.56,
          maxRange: 14.5,
          damage: ab.damage,
          staggerDamage: ab.staggerDamage,
          knockback: ab.knockback,
          hitIds: new Set(),
          volleyHitCounts,
          volleyMaxHits: 3,
        });
      }
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 0.1,
        z: actor.z,
        dirX: fx,
        dirZ: fz,
        colorHex: 0xfacc15,
        abilitySlot: 4,
        callout: 'HIGH NOON FAN!',
      });
      actor.landedCurrentAction = true;
      return;
    }

    // KHEN Crescent Wave (Hold-Drag plants Void Silence Trap; Tap fires blade that drops Void Anchor for Stage 2 Swap)
    if (actor.fighterId === 'khen' && slot === 3) {
      if (actor.pendingHoldVariant && actor.pendingAimX !== null && actor.pendingAimZ !== null) {
        this.spawnZone(
          room,
          actor,
          'voidAnchor',
          actor.pendingAimX,
          actor.y,
          actor.pendingAimZ,
          4.5,
          2.8,
          0xa855f7
        );
        this.pushEvent(room, {
          kind: 'trap',
          attackerId: actor.playerId,
          fighterId: 'khen',
          x: actor.pendingAimX,
          y: actor.y + 0.4,
          z: actor.pendingAimZ,
          colorHex: 0xa855f7,
          abilitySlot: 3,
          callout: 'VOID SILENCE TRAP!',
        });
        actor.landedCurrentAction = true;
        return;
      }

      const angles = actor.pendingComboLink || actor.isOverdrive ? [-0.14, 0.14] : [0];
      for (const off of angles) {
        const ang = actor.rotY + off;
        room.projectiles.push({
          id: makeId('proj'),
          ownerId: actor.playerId,
          fighterId: actor.fighterId,
          skinId: actor.skinId,
          kind: 'crescent',
          x: actor.x + Math.sin(ang) * 0.95,
          y: actor.y + 1.15,
          z: actor.z + Math.cos(ang) * 0.95,
          vx: Math.sin(ang) * 23,
          vz: Math.cos(ang) * 23,
          rotY: ang,
          colorHex: 0xa855f7,
          originX: actor.x,
          originY: actor.y + 1.15,
          originZ: actor.z,
          isComboLink: actor.pendingComboLink,
          isOverdrive: actor.isOverdrive,
          age: 0,
          maxAge: 0.56,
          damage: ab.damage,
          staggerDamage: ab.staggerDamage,
          knockback: ab.knockback,
          hitIds: new Set(),
        });
      }
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x,
        y: actor.y + 0.9,
        z: actor.z,
        dirX: fx,
        dirZ: fz,
        colorHex: 0xa855f7,
        abilitySlot: 3,
        isComboLink: actor.pendingComboLink,
      });
      return;
    }

    // KHEN Phantom Blitz Void Corridor Ultimate
    if (actor.fighterId === 'khen' && slot === 4) {
      const originX = actor.x;
      const originY = actor.y;
      const originZ = actor.z;
      const midX = actor.x + fx * 4.5;
      const midZ = actor.z + fz * 4.5;

      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        if (Math.abs(target.y - actor.y) > 2.6) continue;
        const dx = target.x - originX;
        const dz = target.z - originZ;
        const along = dx * fx + dz * fz;
        const perp = Math.abs(dx * -fz + dz * fx);
        if (along > -0.6 && along <= 9.8 && perp <= 2.4) {
          const calc = this.computeDynamicDamage(actor, target, ab.damage, slot);
          if (
            this.applyHit(
              room,
              actor,
              target,
              calc.dmg,
              ab.staggerDamage + calc.staggerBonus,
              ab.knockback,
              fx,
              fz,
              spec.hex,
              true,
              false,
              true,
              calc.isCrit,
              calc.isBackstab
            )
          ) {
            actor.landedCurrentAction = true;
          }
        }
      }

      const arenaRadius = MAP_BY_ID[room.mapId].arenaRadius;
      this.damageObstaclesInArea(room, midX, midZ, 5.0, ab.damage * 1.4, spec.hex);
      const safe = resolveObstacleCollisions(room.mapId, actor.x + fx * 7.2, actor.y, actor.z + fz * 7.2, 0.48, room.obstacles);
      const r = Math.hypot(safe.x, safe.z);
      if (r > arenaRadius) {
        actor.x = (safe.x / r) * arenaRadius;
        actor.z = (safe.z / r) * arenaRadius;
      } else {
        actor.x = safe.x;
        actor.z = safe.z;
      }

      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: midX,
        y: originY + 0.15,
        z: midZ,
        originX,
        originY: originY + 1.0,
        originZ,
        dirX: fx,
        dirZ: fz,
        colorHex: spec.hex,
        abilitySlot: 4,
        isComboLink: true,
        callout: 'PHANTOM BLITZ!',
      });
      return;
    }

    // JM Solar Dragon Beam Ultimate (V-trench + fast-twisting wind/ki ribbons!)
    if (actor.fighterId === 'jm' && slot === 4) {
      this.pushEvent(room, {
        kind: 'beam',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x + fx * 1.1,
        y: actor.y + 1.25,
        z: actor.z + fz * 1.1,
        dirX: fx,
        dirZ: fz,
        colorHex: 0xfacc15,
        hitStopMs: 95,
        abilitySlot: 4,
        counterFlow: actor.counterFlowActive,
      });
      this.pushEvent(room, {
        kind: 'trenchPulse',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 1.1,
        y: actor.y + 0.3,
        z: actor.z + fz * 1.1,
        dirX: fx,
        dirZ: fz,
        radius: ab.range,
        colorHex: 0xfacc15,
        abilitySlot: 4,
      });
      const maxBeamVert = actor.isFlying ? 8.5 : 2.6;
      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        if (Math.abs(target.y - actor.y) > maxBeamVert) continue;
        const dx = target.x - actor.x;
        const dz = target.z - actor.z;
        const along = dx * fx + dz * fz;
        const perp = Math.abs(dx * -fz + dz * fx);
        if (along > 0 && along <= ab.range && perp <= 2.35) {
          const calc = this.computeDynamicDamage(actor, target, ab.damage, slot);
          if (this.applyHit(room, actor, target, calc.dmg, ab.staggerDamage + calc.staggerBonus, ab.knockback, fx, fz, spec.hex, true, false, true, calc.isCrit, calc.isBackstab)) {
            actor.landedCurrentAction = true;
          }
        }
      }
      return;
    }

    // MARJOHN Gale Snare Hold-Drag Remote Trap vs Tap Vortex
    if (actor.fighterId === 'marjohn' && slot === 3) {
      if (actor.pendingHoldVariant && actor.pendingAimX !== null && actor.pendingAimZ !== null) {
        const cx = actor.pendingAimX;
        const cz = actor.pendingAimZ;
        this.spawnZone(room, actor, 'galeSnare', cx, actor.y, cz, 4.5, 3.4, spec.hex);
        this.pushEvent(room, {
          kind: 'trap',
          attackerId: actor.playerId,
          fighterId: 'marjohn',
          x: cx,
          y: actor.y + 0.3,
          z: cz,
          colorHex: spec.hex,
          abilitySlot: 3,
          callout: 'GALE SNARE PLANTED!',
        });
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'marjohn',
          x: cx,
          y: actor.y + 0.15,
          z: cz,
          colorHex: spec.hex,
          abilitySlot: 3,
        });
        actor.landedCurrentAction = true;
        return;
      }
      // Tap also leaves a 2.8s Gale Snare ring for Stage 2 Skyburst!
      this.spawnZone(room, actor, 'galeSnare', actor.x, actor.y, actor.z, 2.8, 3.2, spec.hex);
    }

    // JM Base Skill 2: Hold-Drag Solar Sanctuary Ward vs Stage 1 Rising Dragon Kick (launch upward!)
    if (actor.fighterId === 'jm' && slot === 3) {
      if (actor.pendingHoldVariant && actor.pendingAimX !== null && actor.pendingAimZ !== null) {
        const cx = actor.pendingAimX;
        const cz = actor.pendingAimZ;
        const zoneY = actor.isFlying ? getObstacleSupportY(room.mapId, cx, 0, cz, 0.42, room.obstacles) : actor.y;
        this.spawnZone(room, actor, 'solarSanctuary', cx, zoneY, cz, 5.0, 3.5, spec.hex);
        this.pushEvent(room, {
          kind: 'trap',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: cx,
          y: zoneY + 0.3,
          z: cz,
          colorHex: spec.hex,
          abilitySlot: 3,
        });
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: cx,
          y: zoneY + 0.15,
          z: cz,
          colorHex: spec.hex,
          abilitySlot: 3,
        });
        actor.landedCurrentAction = true;
        return;
      }
      // Stage 1: Rising Dragon Kick — crescent wind-ki ribbons sweep upward & launch hit foes high!
      this.pushEvent(room, {
        kind: 'crescentSlash',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 0.9,
        y: actor.y + 1.15,
        z: actor.z + fz * 0.9,
        dirX: fx,
        dirZ: fz,
        radius: 2.8,
        colorHex: 0xfacc15,
        abilitySlot: 3,
        comboStep: 2,
        callout: 'RISING DRAGON KICK!',
      });
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x,
        y: actor.y + 0.3,
        z: actor.z,
        radius: 3.8,
        colorHex: 0x38bdf8,
        abilitySlot: 3,
      });
      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        const d = Math.hypot(target.x - actor.x, target.z - actor.z);
        if (d <= 4.3 && Math.abs(target.y - actor.y) <= 2.8) {
          const calc = this.computeDynamicDamage(actor, target, 14, 3);
          const hit = this.applyHit(
            room,
            actor,
            target,
            calc.dmg,
            20 + calc.staggerBonus,
            1.2,
            fx,
            fz,
            spec.hex,
            true,
            false,
            false,
            calc.isCrit,
            calc.isBackstab
          );
          if (hit) {
            target.yVel = 10.6;
            target.grounded = false;
            target.vx = fx * 1.4;
            target.vz = fz * 1.4;
            actor.landedCurrentAction = true;
          }
        }
      }
      return;
    }

    // PRIME Stage 1 Magma Uppercut vs Stage 2 / Hold-Drag Crater Slam + Molten Fissure
    if (actor.fighterId === 'prime' && slot === 3) {
      if (!actor.pendingHoldVariant) {
        // Stage 1: crisp Magma Uppercut
        this.damageObstaclesInArea(room, actor.x + fx * 1.4, actor.z + fz * 1.4, 3.5, 22, spec.hex);
        this.pushEvent(room, {
          kind: 'shockwave',
          attackerId: actor.playerId,
          fighterId: 'prime',
          x: actor.x + fx * 1.1,
          y: actor.y + 0.5,
          z: actor.z + fz * 1.1,
          dirX: fx,
          dirZ: fz,
          colorHex: spec.hex,
          abilitySlot: 3,
          callout: 'MAGMA UPPERCUT!',
        });
        for (const target of room.actors) {
          if (target.playerId === actor.playerId || target.isKO) continue;
          if (Math.abs(target.y - actor.y) > 2.4) continue;
          const dx = target.x - actor.x;
          const dz = target.z - actor.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 3.6) continue;
          if (dist > 0.05 && (dx / dist) * fx + (dz / dist) * fz < 0.15) continue;
          const dirX = dist > 0.05 ? dx / dist : fx;
          const dirZ = dist > 0.05 ? dz / dist : fz;
          const calc = this.computeDynamicDamage(actor, target, 14, 3);
          const hit = this.applyHit(room, actor, target, calc.dmg, 18 + calc.staggerBonus, 5.2, dirX, dirZ, spec.hex, true, false, false, calc.isCrit, calc.isBackstab);
          if (hit) {
            actor.landedCurrentAction = true;
            target.yVel = Math.max(target.yVel, 5.8);
            target.grounded = false;
          }
        }
        return;
      }

      // Stage 2 or Hold-Drag: Crater Slam + Molten Fissure zone
      const cx = actor.pendingAimX ?? actor.x + fx * 1.1;
      const cz = actor.pendingAimZ ?? actor.z + fz * 1.1;
      const safe = resolveObstacleCollisions(room.mapId, cx, actor.y, cz, 0.48, room.obstacles);
      actor.x = safe.x;
      actor.z = safe.z;
      this.damageObstaclesInArea(room, safe.x, safe.z, 4.9, ab.damage * 1.5, 0xf97316);
      this.spawnZone(room, actor, 'moltenFissure', safe.x, actor.y, safe.z, 4.8, 3.8, 0xf97316);
      this.pushEvent(room, {
        kind: 'trap',
        attackerId: actor.playerId,
        fighterId: 'prime',
        x: safe.x,
        y: actor.y + 0.2,
        z: safe.z,
        colorHex: 0xf97316,
        abilitySlot: 3,
        callout: 'MOLTEN FISSURE!',
      });
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'prime',
        x: safe.x,
        y: actor.y + 0.12,
        z: safe.z,
        dirX: fx,
        dirZ: fz,
        colorHex: spec.hex,
        abilitySlot: 3,
        isComboLink: actor.pendingComboLink,
      });
      for (const target of room.actors) {
        if (target.playerId === actor.playerId || target.isKO) continue;
        if (Math.abs(target.y - actor.y) > 2.6) continue;
        const dx = target.x - safe.x;
        const dz = target.z - safe.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 4.9) continue;
        const dirX = dist > 0.05 ? dx / dist : fx;
        const dirZ = dist > 0.05 ? dz / dist : fz;
        const calc = this.computeDynamicDamage(actor, target, ab.damage, 3);
        if (this.applyHit(room, actor, target, calc.dmg, ab.staggerDamage + calc.staggerBonus, ab.knockback, dirX, dirZ, spec.hex, true, false, false, calc.isCrit, calc.isBackstab)) {
          actor.landedCurrentAction = true;
        }
      }
      this.damageAbyssalClonesInArea(room, actor, safe.x, safe.z, 4.9, ab.damage, spec.hex);
      return;
    }

    // Center point for aimed AoE Ultimates or JM airborne Heel Drop
    const impactX =
      (slot === 4 && (actor.fighterId === 'marjohn' || actor.fighterId === 'prime') && actor.pendingAimX !== null) ||
      (slot === 3 && actor.fighterId === 'jm' && actor.isFlying && actor.pendingAimX !== null)
        ? (actor.pendingAimX ?? actor.x)
        : actor.x;
    const impactZ =
      (slot === 4 && (actor.fighterId === 'marjohn' || actor.fighterId === 'prime') && actor.pendingAimZ !== null) ||
      (slot === 3 && actor.fighterId === 'jm' && actor.isFlying && actor.pendingAimZ !== null)
        ? (actor.pendingAimZ ?? actor.z)
        : actor.z;

    const effectiveRange =
      ab.range + (slot === 3 && (actor.pendingComboLink || actor.isOverdrive) ? 1.35 : 0);

    // Damage destructible buildings/ruins in strike impact zone
    const breakCenterX = slot === 0 ? actor.x + fx * 1.35 : impactX;
    const breakCenterZ = slot === 0 ? actor.z + fz * 1.35 : impactZ;
    this.damageObstaclesInArea(
      room,
      breakCenterX,
      breakCenterZ,
      slot === 0 ? effectiveRange * 0.9 : effectiveRange,
      ab.damage * (slot >= 3 ? 1.45 : 1.2),
      spec.hex
    );

    if (slot === 3 || slot === 4) {
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: impactX,
        y: (actor.isFlying ? getMapTerrainHeight(room.mapId, impactX, impactZ) : actor.y) + 0.1,
        z: impactZ,
        dirX: fx,
        dirZ: fz,
        colorHex: spec.hex,
        abilitySlot: slot,
        isComboLink: actor.pendingComboLink,
        frenzyInside: actor.frenzyInside,
        counterFlow: actor.counterFlowActive,
      });
    } else if (slot === 0 && actor.fighterId === 'jm' && !actor.isFlying && actor.comboStep <= 3) {
      this.pushEvent(room, {
        kind: 'crescentSlash',
        attackerId: actor.playerId,
        fighterId: 'jm',
        x: actor.x + fx * 0.75,
        y: actor.y + 1.05,
        z: actor.z + fz * 0.75,
        dirX: fx,
        dirZ: fz,
        radius: 1.85,
        colorHex: actor.comboStep === 2 ? 0x38bdf8 : 0xfacc15,
        abilitySlot: 0,
        comboStep: actor.comboStep as 1 | 2 | 3,
      });
    } else if (slot === 0 && actor.comboStep === 4) {
      if (actor.fighterId === 'jm') {
        this.pushEvent(room, {
          kind: 'craterSlam',
          attackerId: actor.playerId,
          fighterId: 'jm',
          x: actor.x + fx * 1.0,
          y: actor.y + 0.3,
          z: actor.z + fz * 1.0,
          dirX: fx,
          dirZ: fz,
          radius: 3.4,
          colorHex: spec.hex,
          abilitySlot: 0,
          comboStep: 4,
          m1Variant: 'heavy',
        });
      }
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: actor.fighterId,
        x: actor.x + fx * 0.9,
        y: actor.y + 0.12,
        z: actor.z + fz * 0.9,
        dirX: fx,
        dirZ: fz,
        colorHex: spec.hex,
        abilitySlot: 0,
        comboStep: 4,
        m1Variant: 'heavy',
      });
    }

    for (const target of room.actors) {
      if (target.playerId === actor.playerId || target.isKO) continue;
      // Allow JM Sky Flight skills to strike ground opponents below!
      const maxVert = actor.fighterId === 'jm' && actor.isFlying ? 8.5 : 2.6;
      if (Math.abs(target.y - actor.y) > maxVert) continue;
      const dx = target.x - impactX;
      const dz = target.z - impactZ;
      const dist = Math.hypot(dx, dz);
      if (dist > effectiveRange) continue;

      if (ab.arcCos > -0.99 && dist > 0.05) {
        const dot = (dx / dist) * fx + (dz / dist) * fz;
        if (dot < ab.arcCos) continue;
      }

      const dirX = dist > 0.05 ? dx / dist : fx;
      const dirZ = dist > 0.05 ? dz / dist : fz;
      const calc = this.computeDynamicDamage(actor, target, ab.damage, slot);
      const isHeavyHit = slot >= 3 || (slot === 0 && actor.comboStep === 4);
      const kbBoost = slot === 0 && actor.comboStep === 4 && actor.fighterId === 'jm' ? 3.0 : 1.0;

      const hitLanded = this.applyHit(
        room,
        actor,
        target,
        calc.dmg,
        ab.staggerDamage + calc.staggerBonus,
        ab.knockback * kbBoost,
        dirX,
        dirZ,
        spec.hex,
        isHeavyHit,
        false,
        slot === 4,
        calc.isCrit,
        calc.isBackstab
      );
      if (hitLanded) {
        actor.landedCurrentAction = true;
        if (slot === 0) {
          const chiGain = actor.comboStep === 4 ? 22 : actor.comboStep >= 2 ? 13 : 10;
          actor.mana = clamp(actor.mana + chiGain, 0, actor.maxMana);
        }
      }
    }

    // Prime Overdrive M1 Fiery Shockwave Bursts inside Malevolent Crater Shrine
    if (slot === 0 && actor.fighterId === 'prime' && actor.primeDomainBuff) {
      const burstX = actor.x + fx * 1.35;
      const burstZ = actor.z + fz * 1.35;
      this.pushEvent(room, {
        kind: 'shockwave',
        attackerId: actor.playerId,
        fighterId: 'prime',
        x: burstX,
        y: actor.y + 0.85,
        z: burstZ,
        dirX: fx,
        dirZ: fz,
        radius: 2.9,
        colorHex: 0xf97316,
        abilitySlot: 0,
      });
      for (const splashTarget of room.actors) {
        if (splashTarget.playerId === actor.playerId || splashTarget.isKO) continue;
        if (areActorsAllied(actor, splashTarget, room.gameMode)) continue;
        const sd = Math.hypot(splashTarget.x - burstX, splashTarget.z - burstZ);
        if (sd <= 2.9 && Math.abs(splashTarget.y - actor.y) <= 2.4) {
          const sx = sd > 0.05 ? (splashTarget.x - burstX) / sd : fx;
          const sz = sd > 0.05 ? (splashTarget.z - burstZ) / sd : fz;
          this.applyHit(room, actor, splashTarget, 6, 8, 4.2, sx, sz, 0xf97316, false, false, false, false, false);
        }
      }
      this.damageAbyssalClonesInArea(room, actor, burstX, burstZ, 2.9, 6, 0xf97316);
    }
    this.damageAbyssalClonesInArea(room, actor, impactX, impactZ, effectiveRange, ab.damage, spec.hex);
    enforceDomainBarriers(room);
  }

  private applyHit(
    room: RoomInstance,
    attacker: InternalActor,
    target: InternalActor,
    damage: number,
    staggerDamage: number,
    knockback: number,
    dirX: number,
    dirZ: number,
    colorHex: number,
    isHeavy: boolean,
    isPull = false,
    isUltimate = false,
    isCrit = false,
    isBackstab = false
  ): boolean {
    if (target.isKO || target.actionState === 'clash') return false;
    if (this.isTargetInvulnerablePeacefulNpc(room, target)) return false;
    if (attacker.playerId !== target.playerId && areActorsAllied(attacker, target, room.gameMode)) {
      return false;
    }

    // Perfect Evade check: dodging through an incoming hit with active dash i-frames!
    if (target.iframeTimer > 0) {
      if (target.actionState === 'dash' && !target.evadeRewardedThisDash) {
        target.evadeRewardedThisDash = true;
        target.perfectEvadeTimer = 1.6;
        target.rushFatigue = 0;
        target.stamina = clamp(target.stamina + 20, 0, target.maxStamina);
        target.mana = clamp(target.mana + 14, 0, target.maxMana);
        if (target.fighterId === 'jm') {
          target.counterFlowActive = true;
        }
        this.pushEvent(room, {
          kind: 'evade',
          attackerId: attacker.playerId,
          targetId: target.playerId,
          fighterId: target.fighterId,
          x: target.x,
          y: target.y + 1.15,
          z: target.z,
          colorHex: FIGHTER_BY_ID[target.fighterId].hex,
          hitStopMs: 45,
          counterFlow: target.fighterId === 'jm',
          callout: target.fighterId === 'jm' ? 'COUNTER EVADE!' : 'PERFECT EVADE!',
        });
      }
      return false;
    }

    // Guard / Parry Check
    if (target.shieldActive) {
      if (target.parryWindow) {
        target.parryCount += 1;
        target.rushFatigue = 0;
        target.mana = clamp(target.mana + 28, 0, target.maxMana);
        target.stamina = clamp(target.stamina + 30, 0, target.maxStamina);
        target.iframeTimer = Math.max(target.iframeTimer, 0.36);

        let parryOriginX: number | undefined;
        let parryOriginY: number | undefined;
        let parryOriginZ: number | undefined;
        if (target.fighterId === 'jm') {
          target.counterFlowActive = true;
          target.cooldowns[2] = 0; // Reset Flash Step cooldown immediately on Dragon Counter!
          parryOriginX = target.x;
          parryOriginY = target.y + 1.0;
          parryOriginZ = target.z;
          const blink = computeParryBlinkBehind(attacker.x, attacker.z, attacker.rotY, 1.45);
          const safeBlink = resolveObstacleCollisions(room.mapId, blink.x, target.y, blink.z, 0.48, room.obstacles);
          target.x = safeBlink.x;
          target.z = safeBlink.z;
          enforceDomainBarrierForActor(room, target);
          target.y = attacker.y;
          target.rotY = Math.atan2(attacker.x - target.x, attacker.z - target.z);
        }

        this.pushEvent(room, {
          kind: 'parry',
          attackerId: attacker.playerId,
          targetId: target.playerId,
          fighterId: target.fighterId,
          x: target.fighterId === 'jm' ? target.x : (attacker.x + target.x) * 0.5,
          y: target.y + 1.25,
          z: target.fighterId === 'jm' ? target.z : (attacker.z + target.z) * 0.5,
          originX: parryOriginX,
          originY: parryOriginY,
          originZ: parryOriginZ,
          dirX: -dirX,
          dirZ: -dirZ,
          colorHex: FIGHTER_BY_ID[target.fighterId].hex,
          hitStopMs: 90,
          isCounter: target.fighterId === 'jm',
          rpsOutcome: 'parry_beats_strike',
          counterFlow: target.fighterId === 'jm',
          callout: target.fighterId === 'jm' ? 'DRAGON COUNTER BLINK!' : 'PERFECT PARRY!',
        });

        if (Math.hypot(attacker.x - target.x, attacker.z - target.z) < 6.0) {
          if (canApplyStun(attacker.stunImmunityTimer)) {
            const parryStun = resolveCappedStunDuration(0.75, false);
            attacker.actionState = 'stagger';
            attacker.actionTimer = parryStun;
            attacker.actionDuration = parryStun;
            attacker.stunnedTimer = Math.max(attacker.stunnedTimer, parryStun);
          }
          if (target.fighterId === 'jm') {
            attacker.vx = 0;
            attacker.vz = 0;
            this.addStagger(room, target, attacker, 36);
            attacker.hp = Math.max(0, attacker.hp - 12);
            attacker.damagePhase = getDamagePhase(attacker.hp, attacker.maxHp, attacker.isKO);
            target.damageDealt += 12;
            if (attacker.hp <= 0) {
              this.eliminateActor(room, target, attacker, 'parry');
            }
          } else {
            attacker.vx = -dirX * 9.0;
            attacker.vz = -dirZ * 9.0;
            this.addStagger(room, target, attacker, 36);
          }
        }
        return false;
      }

      // Guard Break if ultimate or heavy stagger hits low-stamina blocker
      if ((isUltimate || isHeavy) && target.stamina < 16) {
        target.shieldActive = false;
        target.blockHeld = false;
        if (canApplyStun(target.stunImmunityTimer)) {
          const breakStun = resolveCappedStunDuration(0.75, isUltimate);
          target.actionState = 'stagger';
          target.actionTimer = breakStun;
          target.actionDuration = breakStun;
        }
        this.pushEvent(room, {
          kind: 'parry',
          attackerId: attacker.playerId,
          targetId: target.playerId,
          fighterId: attacker.fighterId,
          x: target.x,
          y: target.y + 1.3,
          z: target.z,
          colorHex: 0xf43f5e,
          hitStopMs: 75,
          callout: 'GUARD BREAK!',
        });
      } else {
        target.stamina = clamp(target.stamina - 10, 0, target.maxStamina);
        const reduced = Math.max(1, Math.round(damage * 0.22));
        target.hp = Math.max(0, target.hp - reduced);
        target.damagePhase = getDamagePhase(target.hp, target.maxHp, target.isKO);
        attacker.damageDealt += reduced;
        target.vx += dirX * knockback * 0.25;
        target.vz += dirZ * knockback * 0.25;
        this.pushEvent(room, {
          kind: 'block',
          attackerId: attacker.playerId,
          targetId: target.playerId,
          fighterId: target.fighterId,
          x: target.x,
          y: target.y + 1.25,
          z: target.z,
          colorHex: FIGHTER_BY_ID[target.fighterId].hex,
          damage: reduced,
        });
        if (target.hp <= 0) {
          this.eliminateActor(room, attacker, target, 'normal');
        }
        return false;
      }
    }

    // Prime Juggernaut Armor passive: 10% dmg reduction while swinging + Damen Awakened Snare Mark bonus
    let finalDmg = damage;
    if (target.fighterId === 'prime' && (target.actionState === 'attack' || target.actionState === 'skill')) {
      finalDmg = Math.max(1, Math.round(finalDmg * 0.9));
    }
    if (target.snareMarkedTimer > 0 && attacker.fighterId === 'damen') {
      finalDmg = Math.max(1, Math.round(finalDmg * AWAKENING_CONFIG.DAMEN_SNARE_BONUS_MULT));
    }
    // Electric / Wind / Energy conduction inside Water zones (+25% DMG!)
    if (target.inWater && (attacker.fighterId === 'jm' || attacker.fighterId === 'marjohn')) {
      finalDmg = Math.max(1, Math.round(finalDmg * 1.25));
    }

    target.hp = target.isDummy ? Math.max(1, target.hp - finalDmg) : Math.max(0, target.hp - finalDmg);
    target.damagePhase = getDamagePhase(target.hp, target.maxHp, target.isKO);
    target.lastDamagedAt = room.matchTime;
    if (target.isDummy) {
      if (!target.dummyDpsTracker) {
        target.dummyDpsTracker = createDummyDpsTracker();
      }
      recordDummyDamageHit(target.dummyDpsTracker, room.matchTime, finalDmg);
    }
    attackerAddDamage(attacker, finalDmg);
    attacker.rushFatigue = 0;
    if (room.activeDomainClash) {
      recordDomainClashDamage(room, attacker.playerId, finalDmg);
    }
    if (room.castingDomain && room.castingDomain.casterId === target.playerId) {
      tryCancelCastingDomainOnHit(room, target, attacker, this.getAwakeningHelpers());
    }

    // Domain Expansion gauge charging on damage dealt & taken
    if (!room.activeDomain || room.activeDomain.ownerId !== attacker.playerId) {
      attacker.domainGauge = addDomainCharge(
        attacker.domainGauge ?? 0,
        finalDmg * 0.6,
        getDomainChargeMultiplier(room, attacker)
      );
    }
    if (!target.isDummy) {
      target.domainGauge = addDomainCharge(
        target.domainGauge ?? 0,
        finalDmg * 0.45,
        getDomainChargeMultiplier(room, target)
      );
    }

    // Update Attacker Combo (resets if no damage dealt for 2.0 seconds) & Passives
    if (room.matchTime - attacker.lastHitAt <= 2.0) {
      attacker.comboCount += 1;
    } else {
      attacker.comboCount = 1;
    }
    attacker.lastHitAt = room.matchTime;

    if (attacker.fighterId === 'marjohn') {
      const gain = attacker.frenzyInside ? 2 : 1;
      attacker.passiveStacks = clamp(attacker.passiveStacks + gain, 0, 5);
    }

    // Overdrive Comeback trigger below 28% HP
    if (!target.isKO && !target.isOverdrive && target.hp > 0 && target.hp <= target.maxHp * 0.28) {
      target.isOverdrive = true;
      if (!target.overdriveAnnounced) {
        target.overdriveAnnounced = true;
        target.stamina = clamp(target.stamina + 35, 0, target.maxStamina);
        this.pushEvent(room, {
          kind: 'overdrive',
          targetId: target.playerId,
          fighterId: target.fighterId,
          x: target.x,
          y: target.y + 1.3,
          z: target.z,
          colorHex: 0xf43f5e,
        });
      }
    }

    // Prime passive: 15% reduced knockback taken
    const kbScale = target.fighterId === 'prime' ? 0.85 : 1.0;
    const effectiveKb = Math.abs(knockback) * kbScale;
    if (isPull) {
      target.vx = -dirX * effectiveKb;
      target.vz = -dirZ * effectiveKb;
    } else {
      target.vx += dirX * effectiveKb;
      target.vz += dirZ * effectiveKb;
      if (isHeavy && !target.superArmor) {
        target.yVel = Math.max(target.yVel, 4.4 * kbScale);
        target.grounded = false;
      }
    }

    const wasCounter = target.actionState === 'whiff';
    // Super Armor + post-stun grace immunity prevents infinite stunlocks
    const canStaggerTarget =
      (!target.superArmor || isUltimate || finalDmg >= 24) &&
      canApplyStun(target.stunImmunityTimer);
    if (canStaggerTarget && (isHeavy || finalDmg >= 16 || wasCounter)) {
      const dur = resolveCappedStunDuration(isHeavy ? 0.52 : 0.35, isUltimate);
      target.actionState = 'stagger';
      target.actionTimer = Math.min(isUltimate ? 1.1 : 0.75, Math.max(target.actionTimer, dur));
      target.actionDuration = Math.min(isUltimate ? 1.1 : 0.75, Math.max(target.actionDuration, dur));
      target.shieldActive = false;
      target.parryWindow = false;
    }

    if (!target.superArmor) {
      this.addStagger(room, attacker, target, staggerDamage);
    }

    const khenPredatorRefund = attacker.fighterId === 'khen' && isBackstab ? 10 : 0;

    this.pushEvent(room, {
      kind: 'hit',
      attackerId: attacker.playerId,
      targetId: target.playerId,
      fighterId: attacker.fighterId,
      x: target.x,
      y: target.y + 1.15,
      z: target.z,
      dirX,
      dirZ,
      colorHex,
      damage: finalDmg,
      isCrit: isCrit || isUltimate || wasCounter,
      isBackstab,
      isCounter: wasCounter,
      comboHit: attacker.comboCount,
      hitStopMs: isUltimate ? 95 : isHeavy || isCrit ? 55 : 0,
      abilitySlot: attacker.lastCastSlot ?? undefined,
      comboStep: attacker.comboStep || undefined,
      m1Variant: attacker.m1Variant,
      isComboLink: attacker.pendingComboLink,
      frenzyInside: attacker.frenzyInside,
      staminaRefund: khenPredatorRefund || undefined,
    });

    if (target.hp <= 0) {
      const cause: KoCause = isUltimate
        ? 'ultimate'
        : attacker.comboCount >= 3 || attacker.pendingComboLink
        ? 'combo'
        : 'normal';
      this.eliminateActor(room, attacker, target, cause);
    }
    return true;
  }

  private eliminateActor(
    room: RoomInstance,
    attacker: InternalActor | null,
    target: InternalActor,
    cause: KoCause
  ): void {
    if (target.isKO || target.isDummy) return;
    target.hp = 0;
    target.isKO = true;
    target.koTime = room.matchTime;
    target.koCause = cause;
    target.koStyle = attacker ? FIGHTER_BY_ID[attacker.fighterId].koStyle : target.koStyle;
    target.koByFighterId = attacker?.fighterId ?? target.fighterId;
    target.damagePhase = 'DEFEATED';
    target.actionState = 'ko';
    target.shieldActive = false;
    target.parryWindow = false;
    target.blockHeld = false;
    if (target.fighterId === 'marjohn') {
      landMarjohnFlight(target);
    }
    room.abyssalClones = room.abyssalClones.filter((c) => c.ownerId !== target.playerId);
    room.turrets = room.turrets.filter((t) => t.ownerId !== target.playerId);
    room.judgementSpears = room.judgementSpears.filter((s) => s.ownerId !== target.playerId);
    target.deaths = (target.deaths ?? 0) + 1;
    if (attacker && attacker.playerId !== target.playerId) {
      attacker.kills += 1;
    }
    if (room.gameMode === 'squad_clash') {
      if (attacker && (attacker.team === 'alpha' || attacker.team === 'beta') && attacker.team !== target.team) {
        room.teamScores[attacker.team] += 1;
      } else if (target.team === 'alpha') {
        room.teamScores.beta += 1;
      } else if (target.team === 'beta') {
        room.teamScores.alpha += 1;
      }
    }

    const causeText =
      cause === 'parry'
        ? 'COUNTER EXECUTION!'
        : cause === 'ultimate'
        ? 'ULTIMATE FINISH!'
        : cause === 'combo'
        ? 'COMBO OBLITERATION!'
        : cause === 'clash'
        ? 'CLASH BREAKER KO!'
        : cause === 'grab'
        ? 'GUARD CRUSH KO!'
        : cause === 'ring'
        ? 'OUT OF SAFE RING!'
        : cause === 'lava'
        ? 'CONSUMED BY LAVA!'
        : cause === 'train'
        ? 'BULLET TRAIN IMPACT!'
        : cause === 'lightning'
        ? 'THUNDER SQUALL KO!'
        : cause === 'collapse'
        ? 'SANDSTORM COLLAPSE!'
        : `${FIGHTER_BY_ID[target.fighterId].name} KO!`;

    if (target.isNpcBoss && room.templeNpc && !room.templeNpc.defeated) {
      room.templeNpc.hp = 0;
      room.templeNpc.defeated = true;
      room.templeNpc.active = false;
      if (!room.templeNpc.awakeningDropped) {
        room.templeNpc.awakeningDropped = true;
        const dropY = Math.max(1.15, target.y + 1.15);
        room.awakeningOrbs.push({
          id: makeId('npc-aorb'),
          x: Number(target.x.toFixed(2)),
          y: Number(dropY.toFixed(2)),
          z: Number(target.z.toFixed(2)),
          active: true,
          fadeTimer: 0,
          remaining: AWAKENING_CONFIG.ORB_LIFESPAN_SEC,
          maxDuration: AWAKENING_CONFIG.ORB_LIFESPAN_SEC,
        });
      }
      this.pushEvent(room, {
        kind: 'npcDefeat',
        attackerId: attacker?.playerId,
        targetId: target.playerId,
        fighterId: target.fighterId,
        x: target.x,
        y: target.y + 1.1,
        z: target.z,
        colorHex: 0xfacc15,
        hitStopMs: 120,
        callout: 'GUARDIAN DEFEATED! AWAKENING ORB DROPPED!',
      });
      return;
    }

    this.pushEvent(room, {
      kind: 'ko',
      attackerId: attacker?.playerId,
      targetId: target.playerId,
      fighterId: attacker?.fighterId ?? target.fighterId,
      x: target.x,
      y: target.y + 1.0,
      z: target.z,
      colorHex: FIGHTER_BY_ID[attacker?.fighterId ?? target.fighterId].hex,
      hitStopMs: 120,
      callout: causeText,
      koStyle: target.koStyle,
      koCause: cause,
    });
  }

  private spawnRandomBattleEvent(room: RoomInstance): void {
    const mapNativeKind: BattlefieldEventKind =
      room.mapId === 'shibuya'
        ? 'train_rush'
        : room.mapId === 'obsidian'
        ? 'volcano_eruption'
        : room.mapId === 'temple'
        ? 'thunder_squall'
        : 'sandstorm_collapse';

    const kinds: BattlefieldEventKind[] = [mapNativeKind, 'hazard', 'gravity', 'surge'];
    const kind = kinds[room.eventRotationIdx % kinds.length];
    room.eventRotationIdx += 1;

    const ang = Math.random() * Math.PI * 2;
    const rad = 3.5 + Math.random() * 11.5;
    const x = Number((Math.cos(ang) * rad).toFixed(1));
    const z = Number((Math.sin(ang) * rad).toFixed(1));

    if (kind === 'train_rush') {
      const dirSign = Math.random() < 0.5 ? 1 : -1;
      const laneZ = dirSign > 0 ? -9.5 : 9.5;
      room.battleEvent = {
        id: makeId('ev'),
        kind: 'train_rush',
        title: 'RUNAWAY BULLET TRAIN',
        subtitle: 'Clear the rail lane before impact!',
        x: dirSign,
        z: laneZ,
        radius: 2.6,
        remaining: 4.5,
        telegraphRemaining: 1.8,
        colorHex: 0x22d3ee,
        hazardDetonated: false,
      };
    } else if (kind === 'volcano_eruption') {
      const meteorPts: PendingMeteor[] = [];
      for (let i = 0; i < 4; i++) {
        const mAng = (i / 4) * Math.PI * 2 + Math.random() * 0.9;
        const mDist = 8.5 + Math.random() * 18.0;
        const mx = Number((Math.cos(mAng) * mDist).toFixed(1));
        const mz = Number((Math.sin(mAng) * mDist).toFixed(1));
        const delay = 1.4 + i * 0.55;
        meteorPts.push({
          id: makeId('met'),
          x: mx,
          z: mz,
          radius: 3.6,
          remaining: delay,
          maxRemaining: delay,
        });
      }
      room.pendingMeteors.push(...meteorPts);
      room.battleEvent = {
        id: makeId('ev'),
        kind: 'volcano_eruption',
        title: 'VOLCANIC METEOR SHOWER',
        subtitle: 'Dodge crimson meteor zones & falling magma boulders!',
        x,
        z,
        radius: 6.4,
        remaining: 4.6,
        telegraphRemaining: 1.85,
        colorHex: 0xf97316,
        hazardDetonated: false,
        secondaryPoints: meteorPts.map((m) => ({ x: m.x, z: m.z, radius: m.radius })),
      };
    } else if (kind === 'thunder_squall') {
      room.battleEvent = {
        id: makeId('ev'),
        kind: 'thunder_squall',
        title: 'THUNDER SQUALL',
        subtitle: 'Water conducts +25% lightning shock!',
        x,
        z,
        radius: 6.2,
        remaining: 3.8,
        telegraphRemaining: 1.75,
        colorHex: 0x38bdf8,
        hazardDetonated: false,
      };
    } else if (kind === 'sandstorm_collapse') {
      room.battleEvent = {
        id: makeId('ev'),
        kind: 'sandstorm_collapse',
        title: 'SANDSTORM VORTEX',
        subtitle: 'Gale winds pull fighters toward ruins center!',
        x: 0,
        z: 0,
        radius: 10.5,
        remaining: 5.5,
        telegraphRemaining: 1.4,
        colorHex: 0xeab308,
        hazardDetonated: false,
      };
    } else if (kind === 'hazard') {
      room.battleEvent = {
        id: makeId('ev'),
        kind: 'hazard',
        title: 'SKY LIGHTNING STRIKE',
        subtitle: 'Evacuate danger circle before detonation!',
        x,
        z,
        radius: 5.5,
        remaining: 3.4,
        telegraphRemaining: 2.1,
        colorHex: 0xfacc15,
        hazardDetonated: false,
      };
    } else if (kind === 'gravity') {
      room.battleEvent = {
        id: makeId('ev'),
        kind: 'gravity',
        title: 'GRAVITY SURGE',
        subtitle: 'High jumps & boosted aerial combat everywhere!',
        x: 0,
        z: 0,
        radius: 20,
        remaining: 9.0,
        telegraphRemaining: 0,
        colorHex: 0x38bdf8,
        hazardDetonated: false,
      };
    } else {
      // Surge immediately refreshes all orbs + boosts Chi!
      for (const pk of room.pickups) {
        pk.active = true;
        pk.respawnTimer = 0;
      }
      room.battleEvent = {
        id: makeId('ev'),
        kind: 'surge',
        title: 'CHI OVERFLOW',
        subtitle: 'All Health & Chi shrines restored!',
        x: 0,
        z: 0,
        radius: 18,
        remaining: 4.5,
        telegraphRemaining: 0,
        colorHex: 0x10b981,
        hazardDetonated: false,
      };
    }
  }

  private tickBot(room: RoomInstance, bot: InternalActor, dt: number): void {
    if (bot.isDummy) {
      if (bot.dummyDpsTracker) {
        refreshDummyDps(bot.dummyDpsTracker, room.matchTime);
      }
      bot.hp = room.matchTime - bot.lastDamagedAt >= 2.2
        ? Math.min(bot.maxHp, bot.hp + 950 * dt)
        : Math.max(1, bot.hp);
      bot.damagePhase = getDamagePhase(bot.hp, bot.maxHp, false);
      const human = room.actors.find((a) => !a.isBot && !a.isKO);
      if (human) {
        bot.rotY = Math.atan2(human.x - bot.x, human.z - bot.z);
      }
      if (bot.actionState === 'idle' || bot.actionState === 'move') {
        const homeDx = 0 - bot.x;
        const homeDz = -4.5 - bot.z;
        const homeDist = Math.hypot(homeDx, homeDz);
        if (homeDist > 0.45) {
          bot.moveX = (homeDx / homeDist) * 0.6;
          bot.moveZ = (homeDz / homeDist) * 0.6;
        } else {
          bot.moveX = 0;
          bot.moveZ = 0;
        }
      } else {
        bot.moveX = 0;
        bot.moveZ = 0;
      }
      return;
    }

    if (bot.isNpcBoss) {
      if (!room.templeNpc || !room.templeNpc.active || room.templeNpc.defeated || !room.templeNpc.hostile) {
        bot.moveX = 0;
        bot.moveZ = 0;
        bot.hp = bot.maxHp;
        const visitor = room.actors.find((a) => !a.isKO && !a.isDummy && !a.isNpcBoss && Math.hypot(a.x - bot.x, a.z - bot.z) <= 8.5);
        if (visitor) {
          bot.rotY = Math.atan2(visitor.x - bot.x, visitor.z - bot.z);
        }
        return;
      }
      if (bot.isKO) return;
      room.templeNpc.hp = Math.round(bot.hp);
      room.templeNpc.x = bot.x;
      room.templeNpc.y = bot.y;
      room.templeNpc.z = bot.z;
      room.templeNpc.rotY = bot.rotY;
      if (room.templeNpc.challengerId) {
        bot.botTargetId = room.templeNpc.challengerId;
      }
    }

    if (bot.isKO) {
      if (bot.isNpcBoss) return;
      if ((room.isTrainingMode || room.isSoloPractice) && bot.koTime !== null && room.matchTime - bot.koTime >= 2.8) {
        bot.isKO = false;
        bot.koTime = null;
        bot.hp = bot.maxHp;
        bot.mana = 50;
        bot.stamina = bot.maxStamina;
        bot.stagger = 0;
        bot.isStunned = false;
        bot.stunnedTimer = 0;
        bot.channelKind = null;
        bot.channelTimer = 0;
        bot.isOverdrive = false;
        bot.overdriveAnnounced = false;
        bot.damagePhase = 'NORMAL';
        bot.actionState = 'idle';
        bot.x = 0;
        bot.y = 0;
        bot.z = -5.5;
        bot.vx = 0;
        bot.yVel = 0;
        bot.vz = 0;
        bot.grounded = true;
      }
      return;
    }

    if (bot.channelKind !== null) {
      return;
    }

    if (room.activeClash && (room.activeClash.playerAId === bot.playerId || room.activeClash.playerBId === bot.playerId)) {
      if (room.activeClash.remaining < 1.6) {
        const choices: CombatMoveType[] = ['strike', 'grab', 'parry'];
        const pick = choices[Math.floor(Math.random() * choices.length)];
        if (room.activeClash.playerAId === bot.playerId && !room.activeClash.choiceA) {
          room.activeClash.choiceA = pick;
        } else if (room.activeClash.playerBId === bot.playerId && !room.activeClash.choiceB) {
          room.activeClash.choiceB = pick;
        }
        if (room.activeClash.choiceA && room.activeClash.choiceB) {
          this.resolveClash(room);
        }
      }
      return;
    }

    if (
      room.activeHeadlock &&
      (room.activeHeadlock.grabberId === bot.playerId || room.activeHeadlock.victimId === bot.playerId)
    ) {
      // Bot mashes Grab during active 3-second headlock!
      if (Math.random() < dt * 5.2) {
        if (room.activeHeadlock.grabberId === bot.playerId) {
          room.activeHeadlock.grabberMashes += 1;
        } else {
          room.activeHeadlock.victimMashes += 1;
        }
      }
      return;
    }

    // Throttle heavy bot vision/orb/telegraph scanning to 100ms (10 Hz) while steering smoothly every tick
    const visionGate = shouldScanBotVision(bot.botScanTimer ?? 0, dt, 0.1);
    bot.botScanTimer = visionGate.nextTimerSec;

    if (visionGate.shouldScan) {
      if (room.awakeningPhase === 'ORBS_ACTIVE' && !bot.awakened) {
        let nearestOrb: AwakeningOrbState | null = null;
        let nearestDist = Infinity;
        for (const orb of room.awakeningOrbs) {
          if (!orb.active) continue;
          const od = Math.hypot(orb.x - bot.x, orb.z - bot.z);
          if (od < nearestDist) {
            nearestDist = od;
            nearestOrb = orb;
          }
        }
        if (nearestOrb && nearestDist > 0.2) {
          bot.botOrbDirX = (nearestOrb.x - bot.x) / nearestDist;
          bot.botOrbDirZ = (nearestOrb.z - bot.z) / nearestDist;
          bot.botOrbDist = nearestDist;
        } else {
          bot.botOrbDist = 0;
        }
      } else {
        bot.botOrbDist = 0;
      }

      const preferred = this.findPreferredTarget(room, bot, 35);
      bot.botTargetId = preferred?.playerId ?? null;

      let dangerFound = false;
      for (const t of room.telegraphs) {
        if (t.ownerId === bot.playerId) continue;
        const maxSafe = Math.max(3.6, t.radius + 0.5);
        const dxT = t.x - bot.x;
        const dzT = t.z - bot.z;
        if (dxT * dxT + dzT * dzT <= maxSafe * maxSafe) {
          dangerFound = true;
          break;
        }
      }
      bot.botDangerActive = dangerFound;
    }

    // Race toward Awakening Orbs if active & bot is not awakened
    if (room.awakeningPhase === 'ORBS_ACTIVE' && !bot.awakened && (bot.botOrbDist ?? 0) > 0.2) {
      bot.moveX = bot.botOrbDirX ?? 0;
      bot.moveZ = bot.botOrbDirZ ?? 0;
      bot.rotY = Math.atan2(bot.moveX, bot.moveZ);
      if ((bot.botOrbDist ?? 0) > 4.5 && bot.dashCooldown <= 0.02 && bot.stamina >= 22 && Math.random() < dt * 2.2) {
        this.tryDash(room, bot, bot.moveX, bot.moveZ, bot.rotY);
      }
      return;
    }

    let foe: InternalActor | null = null;
    if (bot.botTargetId) {
      for (const candidate of room.actors) {
        if (candidate.playerId === bot.botTargetId && !candidate.isKO) {
          foe = candidate;
          break;
        }
      }
    }
    if (!foe) {
      foe = this.findPreferredTarget(room, bot, 35);
      bot.botTargetId = foe?.playerId ?? null;
    }
    if (!foe) return;
    const dx = foe.x - bot.x;
    const dz = foe.z - bot.z;
    const dist = Math.hypot(dx, dz);
    bot.rotY = Math.atan2(dx, dz);

    // Stay inside shrinking 2-minute storm ring!
    if (room.stormActive && Math.hypot(bot.x, bot.z) > Math.max(1.2, room.stormRadius * 0.82)) {
      const rDist = Math.max(0.01, Math.hypot(bot.x, bot.z));
      bot.moveX = -(bot.x / rDist) * 0.92;
      bot.moveZ = -(bot.z / rDist) * 0.92;
      if (bot.dashCooldown <= 0.02 && bot.stamina >= 16 && Math.random() < dt * 2.5) {
        this.tryDash(room, bot, bot.moveX, bot.moveZ, Math.atan2(-bot.x, -bot.z));
      }
      return;
    }

    // Dodge-step reactively out of incoming enemy telegraphs with standalone Dash!
    if (bot.botDangerActive && bot.dashCooldown <= 0.02 && bot.stamina >= 16 && Math.random() < dt * 3.0) {
      this.tryDash(room, bot, -dz / Math.max(1, dist), dx / Math.max(1, dist));
      return;
    }

    // Trigger Stage 2 follow-up when primed!
    if (bot.stage2Slot === 3 && bot.cooldowns[3] <= 0.02 && bot.stamina >= 14 && Math.random() < dt * 2.4) {
      this.tryActivateAbility(room, bot, 3, false);
      return;
    }

    if (foe.y > bot.y + 0.6 && bot.grounded && Math.random() < dt * 1.4) {
      this.tryJump(room, bot);
    }

    // Brief 1.8s opening stance/pacing at round start so combat opens cleanly without instant spawn-rush
    if (room.matchTime < 1.8) {
      const side = Math.sin(room.matchTime * 2.2) * 0.35;
      if (dist > 6.8) {
        bot.moveX = (dx / dist) * 0.42;
        bot.moveZ = (dz / dist) * 0.42;
      } else {
        bot.moveX = (-dz / Math.max(1, dist)) * side;
        bot.moveZ = (dx / Math.max(1, dist)) * side;
      }
      return;
    }

    // Bot Domain Expansion activation at 100% gauge
    if ((bot.domainGauge ?? 0) >= 100 && !bot.isStunned && bot.silencedTimer <= 0 && Math.random() < dt * 0.45) {
      if (handleDomainActivate(room, bot, this.getAwakeningHelpers())) {
        return;
      }
    }

    // In King of the Hill, prioritize moving toward the active capture zone when safe
    if (room.gameMode === 'koth' && room.kothZone) {
      const kdx = room.kothZone.x - bot.x;
      const kdz = room.kothZone.z - bot.z;
      const kd = Math.hypot(kdx, kdz);
      if (kd > room.kothZone.radius * 0.8 && dist > 4.2) {
        bot.moveX = (kdx / kd) * 0.85;
        bot.moveZ = (kdz / kd) * 0.85;
        return;
      }
    }

    if (dist > 3.4) {
      bot.moveX = (dx / dist) * 0.56;
      bot.moveZ = (dz / dist) * 0.56;
      if (dist < 10.5 && bot.cooldowns[4] <= 0.02 && bot.mana >= 34 && Math.random() < dt * (bot.isNpcBoss ? 0.85 : 0.4)) {
        this.tryActivateAbility(room, bot, 4, false);
      } else if (dist < 8.5 && bot.cooldowns[2] <= 0.02 && bot.mana >= 24 && Math.random() < dt * (bot.isNpcBoss ? 0.85 : 0.55)) {
        this.tryActivateAbility(room, bot, 2, false);
      }
    } else {
      bot.moveX = Math.sin(room.matchTime * 1.4) * 0.25;
      bot.moveZ = Math.cos(room.matchTime * 1.4) * 0.25;
      if (Math.random() < dt * (bot.isNpcBoss ? 0.95 : 0.68)) {
        if (foe.shieldActive) {
          this.tryGrab(room, bot);
        } else if (bot.awakened && bot.cooldowns[6] <= 0.02 && bot.mana >= 55 && Math.random() < 0.25) {
          this.tryActivateAbility(room, bot, 6, false);
        } else if (bot.cooldowns[4] <= 0.02 && bot.mana >= 34 && Math.random() < (bot.isNpcBoss ? 0.26 : 0.14)) {
          this.tryActivateAbility(room, bot, 4, false);
        } else if (bot.cooldowns[3] <= 0.02 && bot.mana >= 30 && Math.random() < (bot.isNpcBoss ? 0.34 : 0.18)) {
          this.tryActivateAbility(room, bot, 3, false);
        } else if (bot.cooldowns[2] <= 0.02 && bot.mana >= 24 && Math.random() < (bot.isNpcBoss ? 0.32 : 0.14)) {
          this.tryActivateAbility(room, bot, 2, false);
        } else {
          this.tryActivateAbility(room, bot, !bot.isNpcBoss && Math.random() < 0.22 ? 1 : 0, bot.comboStep >= 3);
        }
      }
    }
  }

  private tick(now = Date.now()): void {
    const dt = Math.min((now - this.lastTickMs) / 1000, 0.05);
    this.lastTickMs = now;

    for (const [code, room] of this.rooms.entries()) {
      if (room.phase !== 'lobby') {
        const activeConnected = room.players.some((p) => p.connected);
        if (!activeConnected && now - room.lastEmptyAt > 60_000) {
          this.rooms.delete(code);
          continue;
        }
        if (activeConnected) room.lastEmptyAt = now;
      }

      if (room.phase === 'countdown') {
        room.countdown -= dt;
        if (room.countdown <= 0) {
          room.countdown = 0;
          room.phase = 'combat';
          this.broadcastRoomState(room);
          this.broadcastSnapshot(room, true, now);
        } else {
          this.broadcastRoomState(room);
        }
        continue;
      }

      if (room.phase === 'roundEnd') {
        room.countdown -= dt;
        if (room.countdown <= 0) {
          this.startCountdown(room);
        } else {
          this.broadcastRoomState(room);
        }
        continue;
      }

      if (room.phase !== 'combat') continue;

      const awakeningCutsceneActive = tickAwakeningRoom(room, dt, this.getAwakeningHelpers());
      if (awakeningCutsceneActive) {
        this.maybeBroadcastSnapshot(room, now);
        continue;
      }

      room.matchTime += dt;
      const arenaRadius = MAP_BY_ID[room.mapId].arenaRadius;

      // Active Clash QTE timer
      if (room.activeClash) {
        room.activeClash.remaining -= dt;
        if (room.activeClash.remaining <= 0) {
          this.resolveClash(room);
        }
      }

      // Active 3-Second Interactive Headlock Mash timer & pin
      if (room.activeHeadlock) {
        const hl = room.activeHeadlock;
        const grabber = room.actors.find((a) => a.playerId === hl.grabberId);
        const victim = room.actors.find((a) => a.playerId === hl.victimId);
        if (!grabber || !victim || grabber.isKO || victim.isKO) {
          room.activeHeadlock = null;
          if (grabber && grabber.actionState === 'headlock') grabber.actionState = 'idle';
          if (victim && victim.actionState === 'headlock') victim.actionState = 'idle';
        } else {
          hl.remaining -= dt;
          const fx = Math.sin(grabber.rotY);
          const fz = Math.cos(grabber.rotY);
          grabber.vx = 0;
          grabber.vz = 0;
          grabber.yVel = 0;
          victim.vx = 0;
          victim.vz = 0;
          victim.yVel = 0;
          victim.x = grabber.x + fx * 0.72;
          victim.z = grabber.z + fz * 0.72;
          victim.y = grabber.y;
          victim.rotY = grabber.rotY + Math.PI;
          hl.x = (grabber.x + victim.x) * 0.5;
          hl.y = grabber.y + 1.15;
          hl.z = (grabber.z + victim.z) * 0.5;
          if (hl.remaining <= 0) {
            this.resolveHeadlock(room);
          }
        }
      }

      // Dynamic Battlefield Events cycle
      if (room.battleEvent) {
        const ev = room.battleEvent;
        ev.remaining -= dt;
        ev.telegraphRemaining = Math.max(0, ev.telegraphRemaining - dt);

        if (
          (ev.kind === 'hazard' || ev.kind === 'volcano_eruption' || ev.kind === 'thunder_squall') &&
          !ev.hazardDetonated &&
          ev.telegraphRemaining <= 0
        ) {
          ev.hazardDetonated = true;
          const isVolcano = ev.kind === 'volcano_eruption';
          const isThunder = ev.kind === 'thunder_squall';
          this.pushEvent(room, {
            kind: isVolcano ? 'craterSlam' : 'hazardHit',
            x: ev.x,
            y: getMapTerrainHeight(room.mapId, ev.x, ev.z) + 0.3,
            z: ev.z,
            radius: ev.radius,
            colorHex: ev.colorHex,
            hitStopMs: 65,
            callout: isVolcano
              ? 'MAGMA ERUPTION!'
              : isThunder
              ? 'THUNDER SQUALL STRIKE!'
              : 'LIGHTNING DETONATION!',
          });
          for (const actor of room.actors) {
            if (actor.isKO) continue;
            const d = Math.hypot(actor.x - ev.x, actor.z - ev.z);
            const hitWaterBonus = isThunder && actor.inWater;
            if (d <= ev.radius || hitWaterBonus) {
              const dmg = hitWaterBonus ? 24 : isVolcano ? 22 : 20;
              actor.hp = actor.isDummy ? Math.max(1, actor.hp - dmg) : Math.max(0, actor.hp - dmg);
              actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
              actor.lastDamagedAt = room.matchTime;
              actor.yVel = 6.5;
              actor.grounded = false;
              actor.actionState = 'stagger';
              actor.actionTimer = 0.55;
              actor.actionDuration = 0.55;
              this.addStagger(room, actor, actor, 30);
              if (actor.hp <= 0) {
                this.eliminateActor(room, null, actor, isVolcano ? 'lava' : isThunder ? 'lightning' : 'normal');
              }
            }
          }
        } else if (ev.kind === 'train_rush' && ev.telegraphRemaining <= 0) {
          const train = computeTrainRushPosition({
            laneZ: ev.z,
            dirX: ev.x >= 0 ? 1 : -1,
            telegraphRemaining: ev.telegraphRemaining,
            remaining: ev.remaining,
          });
          if (train.active) {
            for (const actor of room.actors) {
              if (actor.isKO || actor.iframeTimer > 0) continue;
              const groundY = getMapTerrainHeight(room.mapId, actor.x, actor.z);
              if (actor.y - groundY > 2.8) continue;
              if (
                Math.abs(actor.x - train.trainX) <= train.halfLen &&
                Math.abs(actor.z - train.trainZ) <= train.halfWidth
              ) {
                actor.iframeTimer = 0.45;
                const dmg = 26;
                actor.hp = actor.isDummy ? Math.max(1, actor.hp - dmg) : Math.max(0, actor.hp - dmg);
                actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
                actor.lastDamagedAt = room.matchTime;
                actor.vx = (ev.x >= 0 ? 1 : -1) * 14.0;
                actor.vz = (actor.z >= train.trainZ ? 1 : -1) * 11.0;
                actor.yVel = 7.8;
                actor.grounded = false;
                actor.actionState = 'stagger';
                actor.actionTimer = 0.65;
                actor.actionDuration = 0.65;
                this.pushEvent(room, {
                  kind: 'hit',
                  targetId: actor.playerId,
                  fighterId: actor.fighterId,
                  x: actor.x,
                  y: actor.y + 1.2,
                  z: actor.z,
                  colorHex: 0x22d3ee,
                  damage: dmg,
                  hitStopMs: 70,
                  callout: 'TRAIN IMPACT!',
                });
                if (actor.hp <= 0) {
                  this.eliminateActor(room, null, actor, 'train');
                }
              }
            }
          }
        } else if (ev.kind === 'sandstorm_collapse' && ev.telegraphRemaining <= 0) {
          for (const actor of room.actors) {
            if (actor.isKO || actor.isDummy) continue;
            const dx = ev.x - actor.x;
            const dz = ev.z - actor.z;
            const d = Math.hypot(dx, dz);
            if (d <= ev.radius && d > 0.8) {
              actor.vx += (dx / d) * 6.5 * dt;
              actor.vz += (dz / d) * 6.5 * dt;
            }
            if (!ev.hazardDetonated && d <= 4.5 && ev.remaining <= 0.6) {
              actor.hp = Math.max(0, actor.hp - 12);
              actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
              if (actor.hp <= 0) {
                this.eliminateActor(room, null, actor, 'collapse');
              }
            }
          }
          if (ev.remaining <= 0.6) {
            ev.hazardDetonated = true;
          }
        }

        if (room.battleEvent.remaining <= 0) {
          room.battleEvent = null;
          room.nextEventAt = room.matchTime + 14.0;
        }
      } else if (!room.isTrainingMode && room.matchTime >= room.nextEventAt) {
        this.spawnRandomBattleEvent(room);
      }

      // Falling Volcanic Meteor Boulders (Obsidian Volcano event)
      if (room.pendingMeteors.length > 0) {
        const remainingMeteors: PendingMeteor[] = [];
        for (const m of room.pendingMeteors) {
          m.remaining -= dt;
          if (m.remaining <= 0) {
            const groundY = getMapTerrainHeight(room.mapId, m.x, m.z);
            this.pushEvent(room, {
              kind: 'meteorBoulder',
              x: m.x,
              y: groundY + 0.3,
              z: m.z,
              radius: m.radius,
              colorHex: 0xf97316,
              hitStopMs: 55,
              callout: 'METEOR BOULDER!',
            });
            for (const actor of room.actors) {
              if (actor.isKO || this.isTargetInvulnerablePeacefulNpc(room, actor)) continue;
              const dx = actor.x - m.x;
              const dz = actor.z - m.z;
              const d = Math.hypot(dx, dz);
              if (d <= m.radius) {
                const dmg = 16;
                actor.hp = actor.isDummy ? Math.max(1, actor.hp - dmg) : Math.max(0, actor.hp - dmg);
                actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
                actor.lastDamagedAt = room.matchTime;
                const nx = d > 0.05 ? dx / d : 1;
                const nz = d > 0.05 ? dz / d : 0;
                actor.vx += nx * 11.0;
                actor.vz += nz * 11.0;
                actor.yVel = Math.max(actor.yVel, 6.2);
                actor.grounded = false;
                actor.actionState = 'stagger';
                actor.actionTimer = 0.5;
                actor.actionDuration = 0.5;
                if (actor.hp <= 0) {
                  this.eliminateActor(room, null, actor, 'lava');
                }
              }
            }
            // Spawn temporary destructible volcanic rock cover boulder (max 6 active meteor rocks)
            const existingVolcRocks = room.obstacles.filter((o) => !o.destroyed && o.id.startsWith('volc-rock-'));
            if (existingVolcRocks.length < 6) {
              room.obstacles.push({
                id: makeId('volc-rock'),
                kind: 'platform',
                variant: 'boulder',
                x: m.x,
                z: m.z,
                halfW: 1.25,
                halfD: 1.25,
                topY: 1.35,
                colorHex: 0x334155,
                roofColorHex: 0xf97316,
                destructible: true,
                hp: 55,
                maxHp: 55,
                destroyed: false,
              });
              room.obstaclesDirty = true;
            }
          } else {
            remainingMeteors.push(m);
          }
        }
        room.pendingMeteors = remainingMeteors;
        if (room.battleEvent && room.battleEvent.kind === 'volcano_eruption') {
          room.battleEvent.secondaryPoints = room.pendingMeteors.map((m) => ({
            x: m.x,
            z: m.z,
            radius: m.radius,
          }));
        }
      }

      // Tick Frozen Water Zones
      if (room.frozenWaterZones.length > 0) {
        room.frozenWaterZones = room.frozenWaterZones.filter((fz) => {
          fz.remaining -= dt;
          return fz.remaining > 0;
        });
      }

      // Magnetic Pickups (Health, Chi & Strength Orbs)
      for (const pk of room.pickups) {
        if (!pk.active) {
          pk.magnetTargetId = null;
          pk.respawnTimer -= dt;
          if (pk.respawnTimer <= 0) {
            pk.active = true;
            pk.respawnTimer = 0;
            pk.x = pk.homeX;
            pk.y = pk.homeY;
            pk.z = pk.homeZ;
          }
          continue;
        }
        let bestPullActor: InternalActor | null = null;
        let bestPullDist = 3.8;
        for (const actor of room.actors) {
          if (actor.isKO || actor.isDummy || actor.isNpcBoss) continue;
          if (pk.kind === 'health' && actor.hp >= actor.maxHp) continue;
          if (pk.kind === 'mana' && actor.mana >= actor.maxMana) continue;
          const d = Math.hypot(actor.x - pk.x, actor.z - pk.z);
          if (d < bestPullDist && Math.abs(actor.y + 0.8 - pk.y) <= 2.4) {
            bestPullDist = d;
            bestPullActor = actor;
          }
        }
        if (bestPullActor) {
          pk.magnetTargetId = bestPullActor.playerId;
          const dx = bestPullActor.x - pk.x;
          const dy = bestPullActor.y + 0.9 - pk.y;
          const dz = bestPullActor.z - pk.z;
          const d3 = Math.max(0.01, Math.hypot(dx, dy, dz));
          const pullStep = Math.min(d3, 9.5 * dt);
          pk.x += (dx / d3) * pullStep;
          pk.y += (dy / d3) * pullStep;
          pk.z += (dz / d3) * pullStep;
        } else {
          pk.magnetTargetId = null;
        }

        for (const actor of room.actors) {
          if (actor.isKO || actor.isDummy || actor.isNpcBoss) continue;
          if (pk.kind === 'health' && actor.hp >= actor.maxHp) continue;
          if (pk.kind === 'mana' && actor.mana >= actor.maxMana) continue;
          const d = Math.hypot(actor.x - pk.x, actor.z - pk.z);
          if (d <= 1.25 && Math.abs(actor.y + 0.8 - pk.y) <= 1.65) {
            pk.active = false;
            pk.magnetTargetId = null;
            pk.respawnTimer = pk.kind === 'health' ? 12.0 : pk.kind === 'strength' ? 16.0 : 10.0;
            if (pk.kind === 'health') {
              const healed = Math.min(actor.maxHp - actor.hp, 30);
              actor.hp += healed;
              if (actor.hp > actor.maxHp * 0.45) actor.isOverdrive = false;
              actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
              this.pushEvent(room, {
                kind: 'pickup',
                targetId: actor.playerId,
                x: pk.x,
                y: pk.y,
                z: pk.z,
                colorHex: 0x10b981,
                callout: `+${healed} HP`,
              });
            } else if (pk.kind === 'strength') {
              actor.strengthBuffTimer = 10.0;
              this.pushEvent(room, {
                kind: 'strengthBuff',
                targetId: actor.playerId,
                x: pk.x,
                y: pk.y,
                z: pk.z,
                colorHex: 0xf43f5e,
                callout: '+STR +20% DMG (10s)!',
              });
            } else {
              const restored = Math.min(actor.maxMana - actor.mana, 45);
              actor.mana += restored;
              actor.stamina = clamp(actor.stamina + 25, 0, actor.maxStamina);
              this.pushEvent(room, {
                kind: 'pickup',
                targetId: actor.playerId,
                x: pk.x,
                y: pk.y,
                z: pk.z,
                colorHex: 0x38bdf8,
                callout: `+${restored} CHI`,
              });
            }
            pk.x = pk.homeX;
            pk.y = pk.homeY;
            pk.z = pk.homeZ;
            break;
          }
        }
      }

      // Magnetic One-Time Tactical Item Drops
      for (const drop of room.itemDrops) {
        if (!drop.active) {
          drop.magnetTargetId = null;
          drop.respawnTimer -= dt;
          if (drop.respawnTimer <= 0) {
            drop.active = true;
            drop.respawnTimer = 0;
            drop.x = drop.homeX;
            drop.y = drop.homeY;
            drop.z = drop.homeZ;
          }
          continue;
        }
        let bestItemPullActor: InternalActor | null = null;
        let bestItemPullDist = 3.2;
        for (const actor of room.actors) {
          if (actor.isKO || actor.isDummy || actor.isNpcBoss || actor.heldItem) continue;
          const d = Math.hypot(actor.x - drop.x, actor.z - drop.z);
          if (d < bestItemPullDist && Math.abs(actor.y + 0.8 - drop.y) <= 2.4) {
            bestItemPullDist = d;
            bestItemPullActor = actor;
          }
        }
        if (bestItemPullActor) {
          drop.magnetTargetId = bestItemPullActor.playerId;
          const dx = bestItemPullActor.x - drop.x;
          const dy = bestItemPullActor.y + 0.9 - drop.y;
          const dz = bestItemPullActor.z - drop.z;
          const d3 = Math.max(0.01, Math.hypot(dx, dy, dz));
          const pullStep = Math.min(d3, 8.8 * dt);
          drop.x += (dx / d3) * pullStep;
          drop.y += (dy / d3) * pullStep;
          drop.z += (dz / d3) * pullStep;
        } else {
          drop.magnetTargetId = null;
        }
        for (const actor of room.actors) {
          if (actor.isKO || actor.isDummy || actor.isNpcBoss || actor.heldItem) continue;
          const d = Math.hypot(actor.x - drop.x, actor.z - drop.z);
          if (d <= 1.25 && Math.abs(actor.y + 0.8 - drop.y) <= 1.65) {
            drop.active = false;
            drop.magnetTargetId = null;
            drop.respawnTimer = 22.0;
            actor.heldItem = drop.kind;
            const spec = TACTICAL_ITEMS_BY_KIND[drop.kind];
            this.pushEvent(room, {
              kind: 'itemPickup',
              targetId: actor.playerId,
              x: drop.x,
              y: drop.y,
              z: drop.z,
              colorHex: spec.colorHex,
              callout: `ITEM: ${spec.shortLabel} [E]`,
            });
            drop.x = drop.homeX;
            drop.y = drop.homeY;
            drop.z = drop.homeZ;
            break;
          }
        }
      }

      // 1-Minute Sudden Death Shrinking Storm Zone (always active in sudden_death; paused/reset during Orbs & Cutscene, re-centered post-cutscene)
      room.stormMaxRadius = arenaRadius;
      if (room.gameMode === 'sudden_death') {
        room.stormActive = true;
      } else if (room.awakeningPhase === 'ORBS_ACTIVE' || room.awakeningPhase === 'CUTSCENE') {
        if (room.stormActive) {
          room.stormActive = false;
          room.stormRadius = arenaRadius;
          room.stormCenterX = 0;
          room.stormCenterZ = 0;
        }
      } else if (!room.isTrainingMode && !room.stormActive && room.matchTime >= 60.0) {
        room.stormActive = true;
        room.stormRadius = arenaRadius;
        room.stormCenterX = 0;
        room.stormCenterZ = 0;
        room.stormTickTimer = 0.5;
        this.pushEvent(room, {
          kind: 'hazardHit',
          x: 0,
          y: 0.6,
          z: 0,
          colorHex: 0xf43f5e,
          hitStopMs: 0,
          callout: 'STORM ZONE CLOSING!',
        });
      }
      if (room.stormActive) {
        room.stormRadius = Math.max(4.0, room.stormRadius - AWAKENING_CONFIG.STORM_SHRINK_SPEED * dt);
        room.stormTickTimer -= dt;
        if (room.stormTickTimer <= 0) {
          room.stormTickTimer = 0.5;
          for (const actor of room.actors) {
            if (actor.isKO) continue;
            if (Math.hypot(actor.x - room.stormCenterX, actor.z - room.stormCenterZ) > room.stormRadius) {
              const burn = 6;
              actor.hp = Math.max(0, actor.hp - burn);
              actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
              actor.lastDamagedAt = room.matchTime;
              this.pushEvent(room, {
                kind: 'hazardHit',
                targetId: actor.playerId,
                fighterId: actor.fighterId,
                x: actor.x,
                y: actor.y + 1.0,
                z: actor.z,
                colorHex: 0xf43f5e,
                damage: burn,
              });
              if (actor.hp <= 0) {
                this.eliminateActor(room, null, actor, 'ring');
              }
            }
          }
        }
      }

      // Actors
      const zeroCdMode = room.isTrainingMode && room.trainingConfig.zeroCooldowns;
      for (const actor of room.actors) {
        if (zeroCdMode && !actor.isBot) {
          for (let i = 0; i < 8; i++) actor.cooldowns[i] = 0;
          actor.grabCooldown = 0;
          actor.dashCooldown = 0;
          actor.flightCooldown = 0;
          actor.flightRemaining = actor.flightMax;
          actor.mana = actor.maxMana;
          actor.stamina = actor.maxStamina;
        } else {
          for (let i = 0; i < 8; i++) {
            actor.cooldowns[i] = Math.max(0, (actor.cooldowns[i] ?? 0) - dt);
          }
          actor.grabCooldown = Math.max(0, actor.grabCooldown - dt);
          actor.dashCooldown = Math.max(0, actor.dashCooldown - dt);
        }
        actor.clashCooldown = Math.max(0, actor.clashCooldown - dt);
        actor.iframeTimer = Math.max(0, actor.iframeTimer - dt);
        actor.perfectEvadeTimer = Math.max(0, actor.perfectEvadeTimer - dt);
        actor.speedBoostTimer = Math.max(0, actor.speedBoostTimer - dt);
        actor.strengthBuffTimer = Math.max(0, (actor.strengthBuffTimer ?? 0) - dt);
        actor.slowTimer = Math.max(0, actor.slowTimer - dt);
        actor.stunImmunityTimer = Math.max(0, (actor.stunImmunityTimer ?? 0) - dt);

        // Standalone 1.5s Dash Cooldown sync
        actor.dashCharges = actor.dashCooldown <= 0.01 ? 1 : 0;
        actor.dashMaxCharges = 1;
        actor.dashRechargeRemaining = actor.dashCooldown;

        // Sky Flight Passive (JM anytime, Marjohn Typhoon Ride while awakened or inside his Domain)
        if (actor.fighterId === 'jm' || actor.fighterId === 'marjohn') {
          const flyCd =
            actor.fighterId === 'marjohn' ? AWAKENING_CONFIG.MARJOHN_FLIGHT_COOLDOWN_SEC : 10.0;
          const inMarjohnDomain =
            actor.fighterId === 'marjohn' &&
            room.activeDomain?.ownerId === actor.playerId &&
            room.activeDomain.fighterId === 'marjohn' &&
            !room.activeDomainClash;
          if (actor.flightCooldown > 0) {
            actor.flightCooldown = zeroCdMode && !actor.isBot ? 0 : Math.max(0, actor.flightCooldown - dt);
            if (actor.flightCooldown <= 0) {
              actor.flightRemaining = actor.flightMax;
            }
          }
          if (actor.isFlying) {
            if (actor.fighterId === 'marjohn' && !actor.awakened && !inMarjohnDomain) {
              landMarjohnFlight(actor);
              actor.flightCooldown = zeroCdMode && !actor.isBot ? 0 : flyCd;
            } else {
              if (!(zeroCdMode && !actor.isBot) && actor.channelKind !== 'jm_air_barrage') {
                actor.flightRemaining = Math.max(0, actor.flightRemaining - dt);
              }
              if (
                actor.fighterId === 'marjohn' &&
                (actor.awakened || inMarjohnDomain) &&
                !room.activeDomainClash &&
                !actor.isKO &&
                actor.channelKind === null
              ) {
                actor.typhoonFlankTimer = (actor.typhoonFlankTimer ?? 0) - dt;
                if ((actor.typhoonFlankTimer ?? 0) <= 0) {
                  actor.typhoonFlankTimer = AWAKENING_CONFIG.MARJOHN_FLANK_TORNADO_INTERVAL;
                  const flankOffsets = [-Math.PI * 0.5, Math.PI * 0.5, Math.PI];
                  const projSpeed = AWAKENING_CONFIG.MARJOHN_FLANK_TORNADO_SPEED;
                  for (let f = 0; f < flankOffsets.length; f++) {
                    const ang = actor.rotY + flankOffsets[f];
                    const sx = actor.x + Math.sin(ang) * 1.35;
                    const sz = actor.z + Math.cos(ang) * 1.35;
                    const sy = getMapTerrainHeight(room.mapId, sx, sz) + Math.max(0.85, actor.y * 0.45);
                    room.projectiles.push({
                      id: makeId('proj'),
                      ownerId: actor.playerId,
                      fighterId: 'marjohn',
                      skinId: actor.skinId,
                      kind: 'tornado',
                      x: sx,
                      y: sy,
                      z: sz,
                      vx: Math.sin(ang) * projSpeed,
                      vz: Math.cos(ang) * projSpeed,
                      rotY: ang,
                      colorHex: 0x22d3ee,
                      originX: sx,
                      originY: sy,
                      originZ: sz,
                      isOverdrive: true,
                      isHoming: true,
                      age: 0,
                      maxAge: 2.4,
                      maxRange: 26.0,
                      damage: 11,
                      staggerDamage: 14,
                      knockback: 5.5,
                      hitIds: new Set(),
                    });
                  }
                }
              }
              if (
                actor.flightRemaining <= 0 ||
                actor.isKO ||
                (actor.channelKind !== null && !shouldKeepFlightDuringChannel(actor.channelKind)) ||
                actor.actionState === 'stagger' ||
                actor.actionState === 'clash' ||
                actor.actionState === 'headlock'
              ) {
                if (actor.fighterId === 'marjohn') {
                  landMarjohnFlight(actor);
                } else {
                  actor.isFlying = false;
                  actor.grounded = false;
                }
                actor.flightCooldown = zeroCdMode && !actor.isBot ? 0 : flyCd;
              }
            }
          }
        }

        if (actor.stunnedTimer > 0) {
          actor.stunnedTimer = Math.max(0, actor.stunnedTimer - dt);
          if (!actor.isKO && actor.actionState !== 'clash' && actor.actionState !== 'headlock') {
            actor.isStunned = true;
            actor.actionState = 'stagger';
            actor.actionTimer = Math.max(actor.actionTimer, actor.stunnedTimer);
            actor.shieldActive = false;
            actor.parryWindow = false;
          }
        }

        if (actor.channelKind !== null && !actor.isKO) {
          tickAwakenedChannel(room, actor, dt, this.getAwakeningHelpers());
          if (actor.channelKind !== null) {
            actor.actionTimer = Math.max(actor.actionTimer, actor.channelTimer);
          }
        }

        if (actor.rushFatigueDecayTimer > 0) {
          actor.rushFatigueDecayTimer = Math.max(0, actor.rushFatigueDecayTimer - dt);
          if (actor.rushFatigueDecayTimer <= 0) {
            actor.rushFatigue = 0;
          }
        }

        if (actor.stage2Slot !== null && actor.stage2Timer > 0) {
          actor.stage2Timer = Math.max(0, actor.stage2Timer - dt);
          if (actor.stage2Timer <= 0) {
            const pendingCd =
              actor.stage2PendingCooldown || FIGHTER_BY_ID[actor.fighterId].abilities[3].cooldown;
            actor.stage2Slot = null;
            actor.stage2Label = '';
            actor.stage2PendingCooldown = 0;
            actor.cooldowns[3] = Math.max(actor.cooldowns[3], pendingCd);
          }
        }

        if (actor.isBot) {
          this.tickBot(room, actor, dt);
        }

        if (actor.isKO) {
          this.clearActorTelegraph(room, actor);
          actor.vx *= Math.exp(-5.0 * dt);
          actor.vz *= Math.exp(-5.0 * dt);
          actor.x += actor.vx * dt;
          actor.z += actor.vz * dt;
          const r = Math.hypot(actor.x, actor.z);
          if (r > arenaRadius) {
            actor.x = (actor.x / r) * arenaRadius;
            actor.z = (actor.z / r) * arenaRadius;
          }
          continue;
        }

        if (actor.actionState === 'stagger') {
          actor.superArmor = false;
          this.clearActorTelegraph(room, actor);
        }

        if (actor.actionState === 'clash' || actor.actionState === 'headlock') {
          continue;
        }

        // Prime Steam Eruption: dashing across own Molten Fissure erupts a shockwave blast!
        if (actor.actionState === 'dash' && actor.fighterId === 'prime' && !actor.dashEruptedThisDash) {
          const fissure = room.zones.find(
            (z) =>
              z.ownerId === actor.playerId &&
              z.kind === 'moltenFissure' &&
              Math.hypot(actor.x - z.x, actor.z - z.z) <= z.radius + 0.5
          );
          if (fissure) {
            actor.dashEruptedThisDash = true;
            room.zones = room.zones.filter((z) => z.id !== fissure.id);
            this.pushEvent(room, {
              kind: 'trapTrigger',
              attackerId: actor.playerId,
              fighterId: 'prime',
              x: fissure.x,
              y: fissure.y + 0.35,
              z: fissure.z,
              colorHex: 0xfb923c,
              abilitySlot: 2,
              callout: 'STEAM ERUPTION!',
            });
            this.pushEvent(room, {
              kind: 'shockwave',
              attackerId: actor.playerId,
              fighterId: 'prime',
              x: fissure.x,
              y: fissure.y + 0.12,
              z: fissure.z,
              colorHex: 0xf43f5e,
              abilitySlot: 3,
              isComboLink: true,
            });
            for (const target of room.actors) {
              if (target.playerId === actor.playerId || target.isKO) continue;
              const d = Math.hypot(target.x - fissure.x, target.z - fissure.z);
              if (d <= 4.6) {
                const calc = this.computeDynamicDamage(actor, target, 11, 2);
                this.applyHit(
                  room,
                  actor,
                  target,
                  calc.dmg,
                  20 + calc.staggerBonus,
                  10.0,
                  d > 0.05 ? (target.x - fissure.x) / d : 0,
                  d > 0.05 ? (target.z - fissure.z) / d : 1,
                  0xf43f5e,
                  true,
                  false,
                  false,
                  calc.isCrit,
                  calc.isBackstab
                );
              }
            }
          }
        }

        // Interactive Multi-Biome Terrain evaluation (Water / Lava / Tall-Grass Stealth / Buildings)
        actor.frenzyInside = false;
        const groundAtActor = getMapTerrainHeight(room.mapId, actor.x, actor.z);
        const relHeight = Math.max(0, actor.y - groundAtActor);
        const tz = evaluateTerrainZonesAt(
          room.mapId,
          actor.x,
          relHeight,
          actor.z,
          undefined,
          room.frozenWaterZones
        );
        actor.inWater = tz.inWater;
        actor.inLava = tz.inLava;
        actor.insideBuildingId = tz.insideBuildingId;
        actor.stealthPatchId = tz.stealthPatchId;
        actor.terrainWaterMult = tz.speedMultiplier;
        actor.stealthed = Boolean(
          tz.inStealth &&
            !actor.isKO &&
            room.matchTime - actor.lastAbilityAt > 1.2 &&
            room.matchTime - actor.lastDamagedAt > 1.2 &&
            actor.channelKind === null
        );
        actor.primeDomainBuff = Boolean(
          actor.fighterId === 'prime' &&
            room.activeDomain?.ownerId === actor.playerId &&
            room.activeDomain.fighterId === 'prime' &&
            Math.hypot(actor.x - room.activeDomain.centerX, actor.z - room.activeDomain.centerZ) <=
              room.activeDomain.radius
        );

        if (actor.inLava && !actor.isKO && !actor.isDummy) {
          actor.lavaBurnTimer = (actor.lavaBurnTimer ?? 0) - dt;
          if (actor.lavaBurnTimer <= 0) {
            actor.lavaBurnTimer = 0.65;
            const burnDmg = actor.fighterId === 'prime' ? 3 : 5;
            actor.hp = Math.max(0, actor.hp - burnDmg);
            actor.damagePhase = getDamagePhase(actor.hp, actor.maxHp, actor.isKO);
            actor.lastDamagedAt = room.matchTime;
            this.pushEvent(room, {
              kind: 'hazardHit',
              targetId: actor.playerId,
              fighterId: actor.fighterId,
              x: actor.x,
              y: actor.y + 0.85,
              z: actor.z,
              colorHex: 0xf97316,
              damage: burnDmg,
            });
            if (actor.hp <= 0) {
              this.eliminateActor(room, null, actor, 'lava');
              continue;
            }
          }
        } else {
          actor.lavaBurnTimer = 0.25;
        }

        // Reset combo strictly after 2.0s with no damage dealt; decay passive stacks after 3.2s
        if (actor.comboCount > 0 && room.matchTime - actor.lastHitAt >= 2.0) {
          actor.comboCount = 0;
        }
        if (room.matchTime - actor.lastHitAt > 3.2) {
          actor.passiveStacks = Math.max(0, actor.passiveStacks - 1);
        }
        if (room.matchTime - actor.lastDamagedAt > 2.4 && !actor.isStunned) {
          actor.stagger = Math.max(0, actor.stagger - 14 * dt);
        }

        // Whiff vulnerability timer
        if (actor.whiffTimer > 0) {
          actor.whiffTimer = Math.max(0, actor.whiffTimer - dt);
          if (actor.whiffTimer <= 0 && actor.actionState === 'whiff') {
            actor.actionState = actor.grounded ? 'idle' : 'jump';
          }
        }

        // Hold-to-Block / Parry
        if (actor.blockHeld && !actor.prevBlockHeld && actor.actionState !== 'stagger' && actor.actionState !== 'whiff' && actor.stamina >= 8) {
          if (actor.actionState === 'idle' || actor.actionState === 'move' || actor.actionState === 'jump') {
            actor.actionState = 'guard';
            actor.shieldActive = true;
            actor.parryWindow = true;
            actor.parryStartedAt = room.matchTime;
            actor.actionTimer = 0;
            actor.abilitySlot = null;
          }
        }
        actor.prevBlockHeld = actor.blockHeld;

        if (actor.blockHeld && actor.actionState === 'guard' && actor.stamina > 0) {
          actor.shieldActive = true;
          actor.parryWindow = room.matchTime - actor.parryStartedAt <= 0.26;
          actor.stamina = Math.max(0, actor.stamina - 8.0 * dt);
          if (actor.stamina <= 0.1) {
            actor.blockHeld = false;
            actor.shieldActive = false;
            actor.parryWindow = false;
            actor.actionState = 'idle';
          }
        } else if (!actor.blockHeld && actor.actionState === 'guard' && actor.actionTimer <= 0) {
          actor.shieldActive = false;
          actor.parryWindow = false;
          actor.actionState = 'idle';
        }

        // Tactical Stamina & Slow Chi Regen
        const canRegenStamina =
          !actor.shieldActive && actor.actionState !== 'stagger' && actor.actionState !== 'whiff';
        if (canRegenStamina) {
          let stamRate = 9.0;
          if (actor.isOverdrive) stamRate *= 1.35;
          if (actor.frenzyInside) stamRate *= 1.45;
          actor.stamina = clamp(actor.stamina + stamRate * dt, 0, actor.maxStamina);
        }
        actor.mana = clamp(actor.mana + (actor.frenzyInside ? 5.5 : 2.5) * dt, 0, actor.maxMana);

        // Timed Action Progression
        if (actor.actionTimer > 0) {
          const elapsedInAction = actor.actionDuration - actor.actionTimer;
          // JM Secret Ultimate & Celestial Judgement Spear Sky Ascent + Live Movement-Steering Aim
          if (
            actor.actionState === 'ultimate' &&
            (actor.abilitySlot === 5 || (actor.abilitySlot === 7 && actor.fighterId === 'jm')) &&
            !actor.windupTriggered
          ) {
            const targetAscent = actor.abilitySlot === 7 ? 8.2 : 7.2;
            const aimLimit =
              actor.abilitySlot === 7
                ? ASCENDED_ABILITIES.jm.aimRange ?? 38.0
                : JM_SECRET_ABILITY.aimRange ?? 17.5;
            actor.y = Math.min(targetAscent, actor.y + dt * 12.5);
            actor.yVel = 0;
            actor.grounded = false;
            if (Math.abs(actor.moveX) > 0.08 || Math.abs(actor.moveZ) > 0.08) {
              const steerSpd = actor.abilitySlot === 7 ? 20.0 : 13.0;
              const curAimX = (actor.pendingAimX ?? actor.x) + actor.moveX * steerSpd * dt;
              const curAimZ = (actor.pendingAimZ ?? actor.z) + actor.moveZ * steerSpd * dt;
              const clamped = this.clampAimPoint(room, actor, curAimX, curAimZ, aimLimit);
              actor.pendingAimX = clamped.x;
              actor.pendingAimZ = clamped.z;
              const adx = clamped.x - actor.x;
              const adz = clamped.z - actor.z;
              if (Math.hypot(adx, adz) > 0.15) {
                actor.rotY = Math.atan2(adx, adz);
              }
              if (actor.activeTelegraphId) {
                const tel = room.telegraphs.find((t) => t.id === actor.activeTelegraphId);
                if (tel) {
                  tel.x = clamped.x;
                  tel.z = clamped.z;
                }
              }
            }
          }

          if (actor.actionState === 'grab' && !actor.windupTriggered && elapsedInAction >= 0.055) {
            actor.windupTriggered = true;
            this.executeGrabImpact(room, actor);
          } else if (actor.abilitySlot !== null && !actor.windupTriggered) {
            const slotVal = actor.abilitySlot;
            const awAb =
              actor.awakened && (slotVal === 0 || slotVal === 2 || slotVal === 3 || slotVal === 4 || slotVal === 6)
                ? getAwakenedAbility(actor.fighterId, slotVal as 0 | 2 | 3 | 4 | 6)
                : null;
            const ab = awAb
              ? awAb
              : slotVal === 5
              ? JM_SECRET_ABILITY
              : slotVal === 7
              ? ASCENDED_ABILITIES[actor.fighterId]
              : FIGHTER_BY_ID[actor.fighterId].abilities[slotVal === 6 ? 4 : slotVal];
            const jmSanctuaryWindup =
              actor.fighterId === 'jm' &&
              slotVal === 6 &&
              room.activeDomain?.ownerId === actor.playerId &&
              room.activeDomain.fighterId === 'jm';
            const primeDomainWindup =
              slotVal === 0 &&
              actor.fighterId === 'prime' &&
              Boolean(actor.primeDomainBuff);
            const effectiveWindup =
              actor.abilitySlot === 0 && actor.fighterId === 'prime' && actor.comboStep === 4
                ? (ab.windup + 0.08) / (primeDomainWindup ? PRIME_DOMAIN_CONFIG.m1SpeedMult : 1)
                : primeDomainWindup
                ? ab.windup / PRIME_DOMAIN_CONFIG.m1SpeedMult
                : jmSanctuaryWindup
                ? Math.max(0.18, ab.windup * 0.5)
                : ab.windup;
            if (elapsedInAction >= effectiveWindup && actor.actionState !== 'guard') {
              actor.windupTriggered = true;
              this.executeAbilityImpact(room, actor);
            }
          }
          if (actor.actionState === 'guard') {
            actor.parryWindow = room.matchTime - actor.parryStartedAt <= 0.26;
          }

          actor.actionTimer -= dt;
          if (actor.actionTimer <= 0) {
            actor.actionTimer = 0;
            actor.superArmor = false;
            const prevState = actor.actionState;
            const prevSlot = actor.abilitySlot;
            const missedBigMove =
              !actor.landedCurrentAction &&
              (prevState === 'grab' ||
                prevSlot === 3 ||
                prevSlot === 4 ||
                prevSlot === 5 ||
                prevSlot === 6 ||
                prevSlot === 7);

            actor.abilitySlot = null;
            actor.pendingComboLink = false;

            if (prevState === 'stagger') {
              actor.isStunned = false;
              actor.stagger = 0;
              actor.stunImmunityTimer = Math.max(actor.stunImmunityTimer ?? 0, STUN_RECOVERY_IMMUNITY_SEC);
            }

            if (missedBigMove) {
              const prevAwAb =
                actor.awakened &&
                prevSlot !== null &&
                (prevSlot === 0 || prevSlot === 2 || prevSlot === 3 || prevSlot === 4 || prevSlot === 6)
                  ? getAwakenedAbility(actor.fighterId, prevSlot as 0 | 2 | 3 | 4 | 6)
                  : null;
              const whiffDur =
                prevState === 'grab'
                  ? 0.21
                  : prevAwAb
                  ? prevAwAb.whiffRecovery
                  : prevSlot === 5
                  ? JM_SECRET_ABILITY.whiffRecovery
                  : prevSlot === 7
                  ? ASCENDED_ABILITIES[actor.fighterId].whiffRecovery
                  : prevSlot !== null
                  ? FIGHTER_BY_ID[actor.fighterId].abilities[prevSlot === 6 ? 4 : prevSlot].whiffRecovery
                  : 0.4;
              actor.whiffTimer = whiffDur;
              actor.actionState = 'whiff';
              this.pushEvent(room, {
                kind: 'whiff',
                targetId: actor.playerId,
                fighterId: actor.fighterId,
                x: actor.x,
                y: actor.y + 1.35,
                z: actor.z,
                dirX: Math.sin(actor.rotY),
                dirZ: Math.cos(actor.rotY),
                colorHex: FIGHTER_BY_ID[actor.fighterId].hex,
                whiffSlot: prevSlot,
                abilitySlot: prevSlot ?? undefined,
              });
            } else if (!actor.blockHeld || prevState !== 'guard') {
              actor.actionState = actor.grounded ? 'idle' : 'jump';
              actor.shieldActive = false;
              actor.parryWindow = false;
            }
          }
        } else if (
          actor.actionState === 'attack' ||
          actor.actionState === 'skill' ||
          actor.actionState === 'ultimate' ||
          actor.actionState === 'dash' ||
          actor.actionState === 'grab' ||
          actor.actionState === 'stagger'
        ) {
          // Defensive unstuck guard: never leave an actor locked with timer <= 0
          if (actor.actionState === 'stagger') {
            actor.stunImmunityTimer = Math.max(actor.stunImmunityTimer ?? 0, STUN_RECOVERY_IMMUNITY_SEC);
          }
          actor.abilitySlot = null;
          actor.superArmor = false;
          actor.isStunned = false;
          actor.actionState = actor.grounded ? 'idle' : 'jump';
        }

        // Locomotion (Overdrive, Tailwind, Quick-Draw Step, Khen Lunge & Free-Roam Ult Channels!)
        const isFreeRoamChannel =
          actor.channelKind === 'prime_meteor' ||
          actor.channelKind === 'marjohn_typhoon' ||
          actor.channelKind === 'jm_air_barrage';
        const canMove =
          isFreeRoamChannel ||
          ((actor.channelKind === null) &&
            (actor.actionState === 'idle' ||
              actor.actionState === 'move' ||
              actor.actionState === 'jump' ||
              actor.actionState === 'guard' ||
              actor.actionState === 'whiff'));
        const baseMoveSpeed =
          (resolveActorBaseMoveSpeed(FIGHTER_BY_ID[actor.fighterId].moveSpeed, actor.awakened) +
            (actor.permanentSpeedBonus ?? 0)) *
          (actor.isOverdrive ? 1.18 : 1.0) *
          (actor.speedBoostTimer > 0 ? 1.24 : 1.0) *
          (actor.slowTimer > 0 ? 0.55 : 1.0) *
          (actor.terrainWaterMult ?? 1.0) *
          (actor.fighterId === 'marjohn' ? 1 + actor.passiveStacks * 0.04 : 1.0);
        const castSpeedMult = getCastingDomainCasterSpeedMultiplier(room, actor.playerId);
        const speed =
          baseMoveSpeed *
          castSpeedMult *
          (actor.channelKind === 'marjohn_typhoon'
            ? 0.85
            : actor.channelKind === 'jm_air_barrage'
            ? 0.55
            : actor.channelKind === 'prime_meteor'
            ? 1.0
            : actor.actionState === 'whiff'
            ? 0.44
            : actor.actionState === 'guard'
            ? 0.36
            : actor.isFlying
            ? actor.fighterId === 'marjohn'
              ? 1.15
              : 1.12
            : actor.grounded
            ? 1.0
            : actor.fighterId === 'marjohn'
            ? 1.04
            : 0.92);

        if (castSpeedMult <= 0) {
          actor.vx = 0;
          actor.vz = 0;
        } else if (actor.actionState === 'dash') {
          // Override friction during dash burst so fighter travels cleanly across the arena
          actor.vx *= Math.exp(-1.1 * dt);
          actor.vz *= Math.exp(-1.1 * dt);
        } else {
          const velRes = stepHorizontalVelocity(
            actor.vx,
            actor.vz,
            actor.moveX,
            actor.moveZ,
            speed,
            dt,
            canMove,
            !actor.grounded && actor.fighterId === 'marjohn'
          );
          actor.vx = velRes.vx;
          actor.vz = velRes.vz;
          if (velRes.moving) {
            if (actor.actionState !== 'guard' && actor.actionState !== 'whiff') {
              if (actor.grounded && actor.channelKind === null) actor.actionState = 'move';
              const targetYaw = Math.atan2(actor.moveX, actor.moveZ);
              const diff = normalizeAngle(targetYaw - actor.rotY);
              actor.rotY += diff * (1 - Math.exp(-14 * Math.min(dt, 0.05)));
            }
          } else if (actor.actionState === 'move' && actor.channelKind === null) {
            actor.actionState = actor.grounded ? 'idle' : 'jump';
          }
        }

        const stepped = substepMotionAndCollision(
          room.mapId,
          actor.x,
          actor.y,
          actor.z,
          actor.vx,
          actor.vz,
          dt,
          room.obstacles,
          arenaRadius,
          0.48,
          0.22
        );
        actor.x = stepped.x;
        actor.z = stepped.z;
        enforceDomainBarrierForActor(room, actor);

        const isSkyCharging =
          (actor.actionState === 'ultimate' &&
            (actor.abilitySlot === 5 || (actor.abilitySlot === 7 && actor.fighterId === 'jm')) &&
            !actor.windupTriggered) ||
          actor.channelKind === 'jm_sky_uppercut' ||
          actor.channelKind === 'jm_sky_peak' ||
          actor.channelKind === 'jm_sky_finisher' ||
          room.actors.some(
            (other) =>
              (other.channelKind === 'jm_sky_uppercut' ||
                other.channelKind === 'jm_sky_peak' ||
                other.channelKind === 'jm_sky_finisher') &&
              other.skyComboTargetId === actor.playerId
          );
        if (!isSkyCharging) {
          const supportY = getObstacleSupportY(room.mapId, actor.x, actor.y, actor.z, 0.42, room.obstacles);
          if (actor.channelKind === 'prime_meteor' || actor.channelKind === 'marjohn_typhoon') {
            const targetHover =
              supportY + (actor.channelKind === 'marjohn_typhoon' ? 6.8 : 5.8);
            actor.y += (targetHover - actor.y) * Math.min(1, dt * 8.5);
            actor.yVel = 0;
            actor.grounded = false;
          } else if (actor.isFlying) {
            const hoverY = supportY + (actor.fighterId === 'marjohn' ? 3.4 : 4.35);
            actor.y += (hoverY - actor.y) * Math.min(1, dt * 6.5);
            actor.yVel = 0;
            actor.grounded = false;
            if (actor.actionState === 'idle' || actor.actionState === 'move') {
              actor.actionState = 'jump';
            }
          } else {
            // Marjohn Gale Drift passive: slightly slower falling speed while airborne
            const baseGrav = room.battleEvent?.kind === 'gravity' ? 18.5 : 26.0;
            const grav = actor.fighterId === 'marjohn' && actor.yVel < 0 ? baseGrav * 0.68 : baseGrav;
            if (actor.y > supportY || actor.yVel > 0) {
              const prevActorY = actor.y;
              let nextActorY = actor.y + actor.yVel * dt;
              if (actor.yVel > 0) {
                const staticZones = getMapStatic3DZones(room.mapId);
                for (const sz of staticZones) {
                  if (!sz.passUnder || sz.zoneType === 'stairs') continue;
                  if (
                    actor.x >= sz.minX - 0.35 &&
                    actor.x <= sz.maxX + 0.35 &&
                    actor.z >= sz.minZ - 0.35 &&
                    actor.z <= sz.maxZ + 0.35
                  ) {
                    if (
                      sz.cutout &&
                      actor.x >= sz.cutout.minX &&
                      actor.x <= sz.cutout.maxX &&
                      actor.z >= sz.cutout.minZ &&
                      actor.z <= sz.cutout.maxZ
                    ) {
                      continue;
                    }
                    if (sz.bottomY > prevActorY + 1.45 && sz.bottomY <= nextActorY + 1.65) {
                      nextActorY = Math.max(prevActorY, sz.bottomY - 1.65);
                      actor.yVel = 0;
                      break;
                    }
                  }
                }
              }
              actor.y = nextActorY;
              actor.yVel -= grav * dt;
              const postSupportY = getObstacleSupportY(room.mapId, actor.x, actor.y, actor.z, 0.42, room.obstacles);
              if (actor.y <= postSupportY) {
                actor.y = postSupportY;
                actor.yVel = 0;
                actor.grounded = true;
                if (actor.actionState === 'jump') actor.actionState = 'idle';
              } else {
                actor.grounded = false;
              }
            } else {
              actor.y = supportY;
              actor.yVel = 0;
              actor.grounded = true;
            }
          }
        }

        const r = Math.hypot(actor.x, actor.z);
        if (r > arenaRadius) {
          actor.x = (actor.x / r) * arenaRadius;
          actor.z = (actor.z / r) * arenaRadius;
        }
      }

      // Soft separation
      for (let i = 0; i < room.actors.length; i++) {
        const a = room.actors[i];
        if (a.isKO || a.actionState === 'clash') continue;
        for (let j = i + 1; j < room.actors.length; j++) {
          const b = room.actors[j];
          if (b.isKO || b.actionState === 'clash') continue;
          if (Math.abs(a.y - b.y) > 1.4) continue;
          const aPeaceful = this.isTargetInvulnerablePeacefulNpc(room, a);
          const bPeaceful = this.isTargetInvulnerablePeacefulNpc(room, b);
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.001 && d < 1.15) {
            const push = (1.15 - d) * 0.5;
            if (aPeaceful && !bPeaceful) {
              b.x += (dx / d) * push * 2;
              b.z += (dz / d) * push * 2;
            } else if (bPeaceful && !aPeaceful) {
              a.x -= (dx / d) * push * 2;
              a.z -= (dz / d) * push * 2;
            } else {
              a.x -= (dx / d) * push;
              a.z -= (dz / d) * push;
              b.x += (dx / d) * push;
              b.z += (dz / d) * push;
            }
          }
        }
      }

      // Keep actors out of obstacles, inside arena bounds, and strictly obey Domain barriers after separation
      for (const a of room.actors) {
        if (a.isKO || a.actionState === 'clash') continue;
        const postSep = resolveObstacleCollisions(room.mapId, a.x, a.y, a.z, 0.48, room.obstacles);
        a.x = postSep.x;
        a.z = postSep.z;
        const r = Math.hypot(a.x, a.z);
        if (r > arenaRadius) {
          a.x = (a.x / r) * arenaRadius;
          a.z = (a.z / r) * arenaRadius;
        }
        enforceDomainBarrierForActor(room, a);
      }

      // Update Projectiles
      const nextProj: InternalProjectile[] = [];
      for (const p of room.projectiles) {
        p.age += dt;
        const owner = room.actors.find((a) => a.playerId === p.ownerId);

        if (p.isHoming && (p.kind === 'tornado' || p.kind === 'bullet' || p.kind === 'magnum')) {
          let bestTarget: InternalActor | null = null;
          let bestDist = 24.0;
          for (const cand of room.actors) {
            if (cand.playerId === p.ownerId || cand.isKO || this.isTargetInvulnerablePeacefulNpc(room, cand)) continue;
            if (owner && areActorsAllied(owner, cand, room.gameMode)) continue;
            const d = Math.hypot(cand.x - p.x, cand.z - p.z);
            if (d < bestDist) {
              bestDist = d;
              bestTarget = cand;
            }
          }
          if (bestTarget) {
            const steerSpeed =
              p.kind === 'tornado' ? AWAKENING_CONFIG.MARJOHN_FLANK_TORNADO_SPEED : 29.0;
            const turnRate =
              p.kind === 'tornado' ? AWAKENING_CONFIG.MARJOHN_FLANK_TORNADO_TURN_RATE : 9.0;
            const steered = stepHomingProjectileVelocity(
              p.vx,
              p.vz,
              p.x,
              p.z,
              bestTarget.x,
              bestTarget.z,
              steerSpeed,
              turnRate,
              dt
            );
            p.vx = steered.vx;
            p.vz = steered.vz;
            p.rotY = steered.rotY;
          }
        }

        p.x += p.vx * dt;
        p.y += (p.vy ?? 0) * dt;
        p.z += p.vz * dt;

        // Damen Domain Ricochet: physical bullets inside Idle Deadeye Gamble bounce inward off domain perimeter!
        if (
          (p.kind === 'bullet' || p.kind === 'magnum') &&
          room.activeDomain?.fighterId === 'damen' &&
          p.ownerId === room.activeDomain.ownerId
        ) {
          const dom = room.activeDomain;
          const dxDom = p.x - dom.centerX;
          const dzDom = p.z - dom.centerZ;
          const distDom = Math.hypot(dxDom, dzDom);
          const wallR = Math.max(2.0, dom.radius - 0.35);
          if (distDom >= wallR && distDom > 0.01) {
            const bounces = p.bouncesRemaining ?? 2;
            const nx = dxDom / distDom;
            const nz = dzDom / distDom;
            const vDotN = p.vx * nx + p.vz * nz;
            if (bounces > 0 && vDotN > 0) {
              p.x = dom.centerX + nx * (wallR - 0.12);
              p.z = dom.centerZ + nz * (wallR - 0.12);
              p.vx = p.vx - 2 * vDotN * nx;
              p.vz = p.vz - 2 * vDotN * nz;
              p.rotY = Math.atan2(p.vx, p.vz);
              p.bouncesRemaining = bounces - 1;
              p.hitIds.clear();
              this.pushEvent(room, {
                kind: 'shockwave',
                attackerId: p.ownerId,
                fighterId: 'damen',
                x: p.x,
                y: p.y,
                z: p.z,
                radius: 1.2,
                colorHex: 0xfacc15,
              });
            }
          }
        }

        const groundY = getMapTerrainHeight(room.mapId, p.x, p.z);
        const relY = p.y - groundY;

        if (p.kind === 'solarFireball') {
          const hitTarget =
            p.targetX !== undefined &&
            p.targetZ !== undefined &&
            Math.hypot(p.x - p.targetX, p.z - p.targetZ) <= 0.95;
          if (hitTarget || relY <= 0.65 || p.age >= p.maxAge - 0.02) {
            const detX = p.targetX ?? p.x;
            const detZ = p.targetZ ?? p.z;
            const detGroundY = getMapTerrainHeight(room.mapId, detX, detZ);
            const blastRadius = 6.2;
            this.pushEvent(room, {
              kind: 'fireballImpact',
              attackerId: p.ownerId,
              fighterId: 'jm',
              x: detX,
              y: detGroundY + 0.3,
              z: detZ,
              radius: blastRadius,
              colorHex: 0xfacc15,
              hitStopMs: 115,
              abilitySlot: 5,
              callout: 'SOLAR DETONATION!',
            });
            if (owner) {
              for (const target of room.actors) {
                if (target.playerId === p.ownerId || target.isKO) continue;
                const dx = target.x - detX;
                const dz = target.z - detZ;
                const d = Math.hypot(dx, dz);
                if (d <= blastRadius) {
                  const nx = d > 0.05 ? dx / d : 0;
                  const nz = d > 0.05 ? dz / d : 1;
                  const calc = this.computeDynamicDamage(owner, target, p.damage, 5);
                  this.applyHit(
                    room,
                    owner,
                    target,
                    calc.dmg,
                    p.staggerDamage + calc.staggerBonus,
                    p.knockback,
                    nx,
                    nz,
                    0xfacc15,
                    true,
                    false,
                    true,
                    true,
                    calc.isBackstab
                  );
                }
              }
              this.damageAbyssalClonesInArea(room, owner, detX, detZ, blastRadius, p.damage, 0xfacc15);
            }
            continue;
          }
          nextProj.push(p);
          continue;
        }

        if (p.kind === 'magmaBoulder') {
          p.vy = (p.vy ?? 0) - 18.0 * dt;
          const hitBoulderObs = findObstacleAtPoint(room.mapId, p.x, relY, p.z, room.obstacles);
          if (relY <= 0.65 || hitBoulderObs || p.age >= p.maxAge - 0.02) {
            const detX = p.x;
            const detZ = p.z;
            const detY = getMapTerrainHeight(room.mapId, detX, detZ);
            this.damageObstaclesInArea(room, detX, detZ, 3.6, 22, 0xf97316);
            this.pushEvent(room, {
              kind: 'meteorBoulder',
              attackerId: p.ownerId,
              fighterId: 'prime',
              skinId: p.skinId ?? 'ascended',
              x: detX,
              y: detY + 0.35,
              z: detZ,
              radius: 3.6,
              colorHex: 0xf97316,
              hitStopMs: 30,
              abilitySlot: 7,
            });
            if (owner) {
              for (const target of room.actors) {
                if (target.playerId === p.ownerId || target.isKO) continue;
                const dx = target.x - detX;
                const dz = target.z - detZ;
                const d = Math.hypot(dx, dz);
                if (d <= 3.6 && Math.abs(target.y - detY) <= 3.2) {
                  const calc = this.computeDynamicDamage(owner, target, p.damage, 7);
                  this.applyHit(
                    room,
                    owner,
                    target,
                    calc.dmg,
                    p.staggerDamage + calc.staggerBonus,
                    p.knockback,
                    d > 0.05 ? dx / d : 0,
                    d > 0.05 ? dz / d : 1,
                    0xf97316,
                    true,
                    false,
                    false,
                    calc.isCrit,
                    calc.isBackstab
                  );
                }
              }
              this.damageAbyssalClonesInArea(room, owner, detX, detZ, 3.6, p.damage, 0xf97316);
            }
            continue;
          }
          nextProj.push(p);
          continue;
        }

        if (p.kind === 'tornadoVortex' && owner) {
          for (const target of room.actors) {
            if (target.playerId === p.ownerId || target.isKO) continue;
            const dx = p.x - target.x;
            const dz = p.z - target.z;
            const d = Math.hypot(dx, dz);
            if (d <= AWAKENING_CONFIG.MARJOHN_CAT5_RADIUS && d > 0.2) {
              target.vx += (dx / d) * AWAKENING_CONFIG.MARJOHN_CAT5_PULL * dt;
              target.vz += (dz / d) * AWAKENING_CONFIG.MARJOHN_CAT5_PULL * dt;
            }
          }
        }

        const hitObs = findObstacleAtPoint(room.mapId, p.x, relY, p.z, room.obstacles);
        if (hitObs) {
          this.damageObstacle(room, hitObs, p.pierceObstacles ? 999 : Math.round(p.damage * 1.45), p.x, relY, p.z, p.colorHex);
          if (!p.pierceObstacles) {
            if (p.kind === 'crescent' && owner && !room.zones.some((z) => z.ownerId === owner.playerId && z.kind === 'voidAnchor' && z.remaining > 2.6)) {
              this.spawnZone(room, owner, 'voidAnchor', p.x, Math.max(0, relY - 0.8), p.z, 3.4, 2.5, 0xa855f7);
            }
            continue;
          }
        }

        // Enforce strict max range on nerfed gun / tornado / short-mid projectiles
        const traveled = Math.hypot(
          p.x - (p.originX ?? p.x),
          p.z - (p.originZ ?? p.z)
        );
        if (p.maxRange && traveled >= p.maxRange) {
          if (p.kind === 'tornadoVortex' && owner) {
            this.pushEvent(room, {
              kind: 'shockwave',
              attackerId: owner.playerId,
              fighterId: 'marjohn',
              x: p.x,
              y: 0.35,
              z: p.z,
              radius: AWAKENING_CONFIG.MARJOHN_CAT5_RADIUS,
              colorHex: p.colorHex,
              abilitySlot: 6,
              hitStopMs: 85,
              callout: 'CAT-5 DETONATION!',
            });
            for (const target of room.actors) {
              if (target.playerId === owner.playerId || target.isKO) continue;
              const d = Math.hypot(target.x - p.x, target.z - p.z);
              if (d <= AWAKENING_CONFIG.MARJOHN_CAT5_RADIUS) {
                const calc = this.computeDynamicDamage(owner, target, p.damage * 0.65, 6);
                if (this.applyHit(room, owner, target, calc.dmg, 36, p.knockback, d > 0.05 ? (target.x - p.x) / d : 0, d > 0.05 ? (target.z - p.z) / d : 1, p.colorHex, true, false, true, true, calc.isBackstab)) {
                  target.yVel = Math.max(target.yVel, 10.5);
                  target.grounded = false;
                }
              }
            }
          }
          continue;
        }

        let consumed = false;
        if (owner && !p.visualOnly) {
          for (const target of room.actors) {
            if (target.playerId === p.ownerId || target.isKO || p.hitIds.has(target.playerId)) continue;
            const d = Math.hypot(target.x - p.x, target.z - p.z);
            const targetMidY = target.y + 1.05;
            const hitRadius = resolveProjectileHitRadius(p.kind);
            const maxYDiff = p.kind === 'jmBolt' || p.kind === 'tornadoVortex' ? 2.4 : 1.45;
            if (d <= hitRadius && Math.abs(targetMidY - relY) <= maxYDiff) {
              p.hitIds.add(target.playerId);
              const priorVolleyHits = p.volleyHitCounts?.get(target.playerId) ?? 0;
              const volleyMax = p.volleyMaxHits ?? 3;
              const scaledBaseDamage = p.volleyHitCounts
                ? computeVolleyProjectileDamage(p.damage, priorVolleyHits, volleyMax)
                : p.damage;
              if (scaledBaseDamage <= 0) {
                if (p.kind === 'bullet') {
                  consumed = true;
                  break;
                }
                continue;
              }
              if (p.volleyHitCounts) {
                p.volleyHitCounts.set(target.playerId, priorVolleyHits + 1);
              }
              const isPrimaryVolleyHit = priorVolleyHits === 0;
              const spd = Math.max(0.01, Math.hypot(p.vx, p.vz));
              const hitSlot: AbilitySlot =
                p.kind === 'tornadoVortex' || p.kind === 'solarRailgun'
                  ? 6
                  : p.kind === 'lasso' || p.kind === 'crescent'
                  ? 3
                  : 0;
              const calc = this.computeDynamicDamage(owner, target, scaledBaseDamage, hitSlot);
              const isHeavyProj =
                (p.kind === 'magnum' && isPrimaryVolleyHit) ||
                p.kind === 'lasso' ||
                p.kind === 'crescent' ||
                p.kind === 'jmBeam' ||
                p.kind === 'windBlade' ||
                p.kind === 'solarRailgun' ||
                p.kind === 'tornadoVortex';
              const effectiveStagger = isPrimaryVolleyHit
                ? p.staggerDamage + calc.staggerBonus
                : Math.round(p.staggerDamage * 0.3);
              const effectiveKnockback = isPrimaryVolleyHit ? Math.abs(p.knockback) : Math.abs(p.knockback) * 0.25;
              const landed = this.applyHit(
                room,
                owner,
                target,
                calc.dmg,
                effectiveStagger,
                effectiveKnockback,
                p.vx / spd,
                p.vz / spd,
                p.colorHex,
                isHeavyProj,
                p.kind === 'lasso' || (p.kind === 'windBlade' && p.knockback < 0),
                p.kind === 'solarRailgun' || p.kind === 'tornadoVortex',
                calc.isCrit,
                calc.isBackstab
              );
              if (landed) {
                owner.landedCurrentAction = true;
                if (p.kind === 'bullet' || p.kind === 'magnum' || p.kind === 'solarRailgun') {
                  if (p.kind === 'bullet' || p.kind === 'magnum') {
                    registerDamenDomainBulletHit(room, owner, this.getAwakeningHelpers());
                  }
                  if (isPrimaryVolleyHit) {
                    owner.mana = clamp(owner.mana + (p.kind === 'magnum' ? 9 : 7), 0, owner.maxMana);
                    if (owner.fighterId === 'damen') {
                      owner.speedBoostTimer = Math.max(owner.speedBoostTimer, 1.5);
                      owner.dashCooldown = Math.max(0, owner.dashCooldown - 0.35);
                    }
                  }
                } else if (p.kind === 'tornado' || p.kind === 'jmBolt' || p.kind === 'jmBeam' || p.kind === 'windBlade') {
                  owner.mana = clamp(owner.mana + 11, 0, owner.maxMana);
                }
                if (p.kind === 'tornado' && p.isHoming) {
                  target.slowTimer = Math.max(target.slowTimer, AWAKENING_CONFIG.MARJOHN_FLANK_TORNADO_SLOW_SEC);
                  target.yVel = Math.max(target.yVel, 7.6);
                  target.grounded = false;
                  this.pushEvent(room, {
                    kind: 'shockwave',
                    attackerId: owner.playerId,
                    fighterId: 'marjohn',
                    x: p.x,
                    y: Math.max(0.3, relY),
                    z: p.z,
                    radius: 3.4,
                    colorHex: 0x22d3ee,
                  });
                }
                if (p.kind === 'crescent' && owner.awakened) {
                  target.silencedTimer = Math.max(target.silencedTimer, AWAKENING_CONFIG.KHEN_SILENCE_DURATION_SEC);
                  this.pushEvent(room, {
                    kind: 'silence',
                    attackerId: owner.playerId,
                    targetId: target.playerId,
                    fighterId: owner.fighterId,
                    x: target.x,
                    y: target.y + 1.4,
                    z: target.z,
                    colorHex: 0xa855f7,
                    callout: 'SILENCED!',
                  });
                }
                if (p.kind === 'lasso' && owner.awakened) {
                  target.snareMarkedTimer = Math.max(target.snareMarkedTimer, AWAKENING_CONFIG.DAMEN_SNARE_MARK_SEC);
                }
              }
              if (p.kind === 'lasso') {
                this.pushEvent(room, {
                  kind: 'lasso',
                  attackerId: owner.playerId,
                  targetId: target.playerId,
                  fighterId: owner.fighterId,
                  x: target.x,
                  y: target.y + 1.15,
                  z: target.z,
                  originX: owner.x,
                  originY: owner.y + 1.05,
                  originZ: owner.z,
                  colorHex: 0xfacc15,
                });
              }
              if (
                p.kind === 'crescent' &&
                !room.zones.some((z) => z.ownerId === owner.playerId && z.kind === 'voidAnchor' && z.remaining > 2.6)
              ) {
                this.spawnZone(room, owner, 'voidAnchor', target.x, target.y, target.z, 3.4, 2.5, 0xa855f7);
              }
              if (
                p.kind !== 'crescent' &&
                p.kind !== 'magnum' &&
                p.kind !== 'jmBeam' &&
                p.kind !== 'windBlade' &&
                p.kind !== 'solarRailgun' &&
                p.kind !== 'tornadoVortex'
              ) {
                consumed = true;
                break;
              }
            }
          }
          if (!consumed && room.abyssalClones.length > 0) {
            const hitRadius = resolveProjectileHitRadius(p.kind);
            for (const clone of room.abyssalClones) {
              if (clone.ownerId === p.ownerId || p.hitIds.has(clone.id)) continue;
              const cloneOwner = room.actors.find((a) => a.playerId === clone.ownerId);
              if (cloneOwner && areActorsAllied(owner, cloneOwner, room.gameMode)) continue;
              const dc = Math.hypot(clone.x - p.x, clone.z - p.z);
              if (dc <= hitRadius && Math.abs(clone.y + 1.0 - relY) <= 1.8) {
                p.hitIds.add(clone.id);
                this.applyDamageToAbyssalClone(room, owner, clone, p.damage, p.colorHex);
                if (
                  p.kind !== 'crescent' &&
                  p.kind !== 'magnum' &&
                  p.kind !== 'jmBeam' &&
                  p.kind !== 'windBlade' &&
                  p.kind !== 'solarRailgun' &&
                  p.kind !== 'tornadoVortex'
                ) {
                  consumed = true;
                  break;
                }
              }
            }
          }
        }

        if (!consumed && p.age < p.maxAge && Math.hypot(p.x, p.z) <= arenaRadius + 3) {
          nextProj.push(p);
        } else if (
          !consumed &&
          p.kind === 'crescent' &&
          owner &&
          !room.zones.some((z) => z.ownerId === owner.playerId && z.kind === 'voidAnchor' && z.remaining > 2.6)
        ) {
          this.spawnZone(room, owner, 'voidAnchor', p.x, Math.max(0, relY - 0.8), p.z, 3.4, 2.5, 0xa855f7);
        } else if (!consumed && p.kind === 'tornadoVortex' && owner) {
          this.pushEvent(room, {
            kind: 'shockwave',
            attackerId: owner.playerId,
            fighterId: 'marjohn',
            x: p.x,
            y: 0.35,
            z: p.z,
            radius: AWAKENING_CONFIG.MARJOHN_CAT5_RADIUS,
            colorHex: p.colorHex,
            abilitySlot: 6,
            hitStopMs: 85,
            callout: 'CAT-5 DETONATION!',
          });
          for (const target of room.actors) {
            if (target.playerId === owner.playerId || target.isKO) continue;
            const d = Math.hypot(target.x - p.x, target.z - p.z);
            if (d <= AWAKENING_CONFIG.MARJOHN_CAT5_RADIUS) {
              const calc = this.computeDynamicDamage(owner, target, p.damage * 0.65, 6);
              if (this.applyHit(room, owner, target, calc.dmg, 36, p.knockback, d > 0.05 ? (target.x - p.x) / d : 0, d > 0.05 ? (target.z - p.z) / d : 1, p.colorHex, true, false, true, true, calc.isBackstab)) {
                target.yVel = Math.max(target.yVel, 10.5);
                target.grounded = false;
              }
            }
          }
        } else if (!consumed && p.age >= p.maxAge && p.kind === 'lasso' && p.hitIds.size === 0) {
          this.pushEvent(room, {
            kind: 'whiff',
            targetId: p.ownerId,
            fighterId: 'damen',
            x: p.x,
            y: Math.max(0.5, relY),
            z: p.z,
            colorHex: 0xf59e0b,
            whiffSlot: 3,
            abilitySlot: 3,
          });
        }
      }
      room.projectiles = nextProj;

      // Update Telegraphs
      const nextTelegraphs: InternalTelegraph[] = [];
      for (const tel of room.telegraphs) {
        const owner = room.actors.find((a) => a.playerId === tel.ownerId);
        if (!owner || owner.isKO || owner.actionState === 'stagger' || owner.actionState === 'clash') continue;
        tel.elapsed += dt;
        tel.progress = clamp(tel.elapsed / Math.max(0.05, tel.windup), 0, 1);
        if (tel.elapsed <= tel.windup + 0.14) {
          nextTelegraphs.push(tel);
        }
      }
      room.telegraphs = nextTelegraphs;

      // Update Tactical Zoning Traps & Wards
      const nextZones: InternalZone[] = [];
      for (const z of room.zones) {
        z.remaining -= dt;
        if (z.remaining <= 0) continue;
        const owner = room.actors.find((a) => a.playerId === z.ownerId);
        if (!owner) continue;

        z.tickTimer += dt;
        let removeZone = false;

        if (z.kind === 'galeSnare') {
          for (const target of room.actors) {
            if (target.playerId === z.ownerId || target.isKO) continue;
            const dx = z.x - target.x;
            const dz = z.z - target.z;
            const d = Math.hypot(dx, dz);
            if (d <= z.radius && d > 0.2) {
              target.vx += (dx / d) * 14.0 * dt;
              target.vz += (dz / d) * 14.0 * dt;
            }
          }
        } else if (z.kind === 'moltenFissure') {
          if (z.tickTimer >= 0.55) {
            z.tickTimer = 0;
            for (const target of room.actors) {
              if (target.playerId === z.ownerId || target.isKO) continue;
              if (Math.hypot(target.x - z.x, target.z - z.z) <= z.radius && Math.abs(target.y - z.y) <= 2.2) {
                this.applyHit(room, owner, target, 4, 8, 1.5, 0, 0, 0xf97316, false);
              }
            }
          }
        } else if (z.kind === 'solarTripwire' && !z.triggered) {
          const ex = z.endX ?? z.x;
          const ez = z.endZ ?? z.z;
          const abx = ex - z.x;
          const abz = ez - z.z;
          const abLenSq = Math.max(0.001, abx * abx + abz * abz);
          for (const target of room.actors) {
            if (target.playerId === z.ownerId || target.isKO || target.iframeTimer > 0) continue;
            if (Math.abs(target.y - z.y) > 1.8) continue;
            const tProj = clamp(((target.x - z.x) * abx + (target.z - z.z) * abz) / abLenSq, 0, 1);
            const closestX = z.x + tProj * abx;
            const closestZ = z.z + tProj * abz;
            if (Math.hypot(target.x - closestX, target.z - closestZ) <= 1.25) {
              z.triggered = true;
              removeZone = true;
              this.pushEvent(room, {
                kind: 'trapTrigger',
                attackerId: owner.playerId,
                targetId: target.playerId,
                fighterId: 'damen',
                x: target.x,
                y: target.y + 0.9,
                z: target.z,
                colorHex: 0xfacc15,
                hitStopMs: 55,
                callout: 'TRIPWIRE SNARE!',
              });
              const dx = owner.x - target.x;
              const dz = owner.z - target.z;
              const d = Math.max(0.01, Math.hypot(dx, dz));
              this.applyHit(room, owner, target, 17, 32, 8.2, dx / d, dz / d, 0xfacc15, true, true, false, true);
              break;
            }
          }
        } else if (z.kind === 'voidAnchor') {
          if (z.tickTimer >= 0.45) {
            z.tickTimer = 0;
            for (const target of room.actors) {
              if (target.playerId === z.ownerId || target.isKO) continue;
              if (Math.hypot(target.x - z.x, target.z - z.z) <= z.radius && Math.abs(target.y - z.y) <= 2.2) {
                target.stamina = Math.max(0, target.stamina - 7);
                target.vx *= 0.65;
                target.vz *= 0.65;
              }
            }
          }
        } else if (z.kind === 'voidDecoy' && !z.triggered) {
          for (const target of room.actors) {
            if (target.playerId === z.ownerId || target.isKO || target.iframeTimer > 0) continue;
            const dx = target.x - z.x;
            const dz = target.z - z.z;
            const d = Math.hypot(dx, dz);
            if (d <= z.radius && Math.abs(target.y - z.y) <= 2.0) {
              z.triggered = true;
              removeZone = true;
              this.pushEvent(room, {
                kind: 'trapTrigger',
                attackerId: owner.playerId,
                targetId: target.playerId,
                fighterId: 'khen',
                x: z.x,
                y: z.y + 0.9,
                z: z.z,
                colorHex: 0xa855f7,
                hitStopMs: 55,
                callout: 'DECOY COUNTER!',
              });
              const nx = d > 0.05 ? dx / d : 0;
              const nz = d > 0.05 ? dz / d : 1;
              this.applyHit(room, owner, target, 14, 28, 9.0, nx, nz, 0xa855f7, true, false, false, true);
              break;
            }
          }
        } else if (z.kind === 'solarSanctuary') {
          if (Math.hypot(owner.x - z.x, owner.z - z.z) <= z.radius && !owner.isKO) {
            owner.hp = Math.min(owner.maxHp, owner.hp + 4.5 * dt);
            owner.mana = Math.min(owner.maxMana, owner.mana + 5.0 * dt);
          }
          if (z.tickTimer >= 0.45) {
            z.tickTimer = 0;
            for (const target of room.actors) {
              if (target.playerId === z.ownerId || target.isKO) continue;
              const dx = target.x - z.x;
              const dz = target.z - z.z;
              const d = Math.hypot(dx, dz);
              if (d <= z.radius && Math.abs(target.y - z.y) <= 2.2) {
                const nx = d > 0.05 ? dx / d : 0;
                const nz = d > 0.05 ? dz / d : 1;
                target.vx += nx * 7.5;
                target.vz += nz * 7.5;
                this.applyHit(room, owner, target, 4, 12, 3.5, nx, nz, 0xfacc15, false);
              }
            }
          }
        } else if (z.kind === 'gravityVortex') {
          for (const target of room.actors) {
            if (target.playerId === z.ownerId || target.isKO) continue;
            if (this.isTargetInvulnerablePeacefulNpc(room, target)) continue;
            if (areActorsAllied(owner, target, room.gameMode)) continue;
            const dx = z.x - target.x;
            const dz = z.z - target.z;
            const d = Math.hypot(dx, dz);
            if (d <= z.radius && d > 0.35) {
              target.vx += (dx / d) * 18.0 * dt;
              target.vz += (dz / d) * 18.0 * dt;
              target.slowTimer = Math.max(target.slowTimer, 0.25);
            }
          }
          if (z.tickTimer >= 0.45) {
            z.tickTimer = 0;
            for (const target of room.actors) {
              if (target.playerId === z.ownerId || target.isKO) continue;
              if (this.isTargetInvulnerablePeacefulNpc(room, target)) continue;
              if (areActorsAllied(owner, target, room.gameMode)) continue;
              if (Math.hypot(target.x - z.x, target.z - z.z) <= z.radius) {
                this.applyHit(room, owner, target, 4, 10, 0.5, 0, 0, 0xa855f7, false, true);
              }
            }
          }
        } else if (z.kind === 'cryoMist') {
          if (z.tickTimer >= 0.35) {
            z.tickTimer = 0;
            for (const target of room.actors) {
              if (target.playerId === z.ownerId || target.isKO) continue;
              if (this.isTargetInvulnerablePeacefulNpc(room, target)) continue;
              if (areActorsAllied(owner, target, room.gameMode)) continue;
              if (Math.hypot(target.x - z.x, target.z - z.z) <= z.radius) {
                target.slowTimer = Math.max(target.slowTimer, 1.2);
              }
            }
          }
        } else {
          tickAwakenedZoneBehavior(room, z, owner, dt, this.getAwakeningHelpers());
        }

        if (!removeZone) {
          nextZones.push(z);
        }
      }
      room.zones = nextZones;

      this.tickAscendedEntities(room, dt);

      tickDomainAndModes(room, dt, this.getAwakeningHelpers());
      if ((room.phase as string) === 'victory') {
        this.broadcastRoomState(room);
        this.broadcastSnapshot(room, true, now);
        continue;
      }

      if (room.isTrainingMode) {
        // Infinite training until player clicks Leave
      } else if (room.isSoloPractice && room.gameMode === 'classic') {
        const humanActor = room.actors.find((a) => !a.isBot);
        if (humanActor && humanActor.isKO) {
          room.victoryDelayTimer += dt;
          if (room.victoryDelayTimer >= 1.35) {
            const sock = this.playerSockets.get(humanActor.playerId);
            if (sock) {
              const client = this.clients.get(sock);
              if (client) {
                client.roomCode = null;
                client.playerId = null;
              }
              this.playerSockets.delete(humanActor.playerId);
              this.send(sock, {
                type: 'room:exited',
                reason: 'You were defeated by the Bot.',
              });
            }
            this.rooms.delete(code);
            continue;
          }
        }
      } else if (room.gameMode === 'classic' || room.gameMode === 'sudden_death') {
        const alive = room.actors.filter((a) => !a.isKO && !a.isNpcBoss);
        if (alive.length <= 1) {
          room.victoryDelayTimer += dt;
          if (room.victoryDelayTimer >= 1.6) {
            const roundWinnerActor = alive[0] ?? null;
            let seriesWinnerId: string | null = null;
            if (roundWinnerActor) {
              const winPlayer = room.players.find((p) => p.playerId === roundWinnerActor.playerId);
              if (winPlayer) {
                winPlayer.wins += 1;
                roundWinnerActor.wins = winPlayer.wins;
                if (winPlayer.wins >= room.winsToWin) {
                  seriesWinnerId = winPlayer.playerId;
                }
              }
            }

            if (seriesWinnerId) {
              room.phase = 'victory';
              room.roundWinnerId = seriesWinnerId;
              room.winnerId = seriesWinnerId;
              this.broadcastRoomState(room);
            } else {
              // Constantly rotate map for the next round; characters stay locked
              const curMapIdx = MAPS.findIndex((m) => m.id === room.mapId);
              const nextMap = MAPS[(curMapIdx + 1) % MAPS.length];
              room.mapId = nextMap.id;
              room.roundNumber += 1;
              room.roundWinnerId = roundWinnerActor?.playerId ?? null;
              room.phase = 'roundEnd';
              room.countdown = 2.0;
              room.victoryDelayTimer = 0;
              this.broadcastRoomState(room);
            }
          }
        }
      }

      this.maybeBroadcastSnapshot(room, now);
    }
  }

  private damageAbyssalClonesInArea(
    room: RoomInstance,
    attacker: InternalActor,
    x: number,
    z: number,
    radius: number,
    damage: number,
    colorHex: number
  ): void {
    if (room.abyssalClones.length === 0) return;
    for (const clone of [...room.abyssalClones]) {
      if (clone.ownerId === attacker.playerId) continue;
      const owner = room.actors.find((a) => a.playerId === clone.ownerId);
      if (owner && areActorsAllied(attacker, owner, room.gameMode)) continue;
      const d = Math.hypot(clone.x - x, clone.z - z);
      if (d <= radius + 0.65) {
        this.applyDamageToAbyssalClone(room, attacker, clone, damage, colorHex);
      }
    }
  }

  private applyDamageToAbyssalClone(
    room: RoomInstance,
    attacker: InternalActor | null,
    clone: InternalAbyssalClone,
    damage: number,
    colorHex: number
  ): void {
    if (clone.hp <= 0) return;
    const finalDmg = Math.max(1, Math.round(damage));
    clone.hp = Math.max(0, clone.hp - finalDmg);
    this.pushEvent(room, {
      kind: 'hit',
      attackerId: attacker?.playerId,
      targetId: clone.id,
      fighterId: attacker?.fighterId ?? 'khen',
      x: clone.x,
      y: clone.y + 1.1,
      z: clone.z,
      colorHex,
      damage: finalDmg,
    });
    if (clone.hp <= 0) {
      room.abyssalClones = room.abyssalClones.filter((c) => c.id !== clone.id);
      const owner = room.actors.find((a) => a.playerId === clone.ownerId);
      if (owner) {
        const zeroCd = room.isTrainingMode && room.trainingConfig.zeroCooldowns && !owner.isBot;
        owner.cooldowns[7] = zeroCd ? 0 : ASCENDED_ABILITIES.khen.cooldown;
      }
      this.pushEvent(room, {
        kind: 'shatter',
        attackerId: attacker?.playerId,
        targetId: clone.id,
        fighterId: 'khen',
        skinId: 'ascended',
        x: clone.x,
        y: clone.y + 1.0,
        z: clone.z,
        colorHex: 0xa855f7,
        callout: 'ABYSSAL CLONE DESTROYED!',
      });
    }
  }

  private spawnPrimeVolcanoTurret(room: RoomInstance, owner: InternalActor, x: number, z: number): void {
    const safe = resolveObstacleCollisions(room.mapId, x, owner.y, z, 0.55, room.obstacles);
    const groundY = getMapTerrainHeight(room.mapId, safe.x, safe.z);
    const supportY = getObstacleSupportY(room.mapId, safe.x, owner.y + 1.0, safe.z, 0.42, room.obstacles);
    const vy = Math.max(groundY, supportY);
    room.turrets = room.turrets.filter((t) => !(t.ownerId === owner.playerId && t.kind === 'asura_volcano'));
    room.turrets.push({
      id: makeId('turret'),
      ownerId: owner.playerId,
      fighterId: 'prime',
      kind: 'asura_volcano',
      x: safe.x,
      y: vy,
      z: safe.z,
      rotY: owner.rotY,
      remaining: 10.0,
      maxDuration: 10.0,
      fireTimer: 0.35,
      burstIndex: 0,
    });
    this.pushEvent(room, {
      kind: 'turretPlant',
      attackerId: owner.playerId,
      fighterId: 'prime',
      skinId: owner.skinId,
      x: safe.x,
      y: vy + 0.3,
      z: safe.z,
      radius: 4.8,
      colorHex: 0xf97316,
      hitStopMs: 65,
      abilitySlot: 7,
      callout: 'ASURA VOLCANO ERUPTED!',
    });
    for (const target of room.actors) {
      if (target.playerId === owner.playerId || target.isKO) continue;
      const d = Math.hypot(target.x - safe.x, target.z - safe.z);
      if (d <= 4.8) {
        const calc = this.computeDynamicDamage(owner, target, 18, 7);
        this.applyHit(
          room,
          owner,
          target,
          calc.dmg,
          28 + calc.staggerBonus,
          10.5,
          d > 0.05 ? (target.x - safe.x) / d : Math.sin(owner.rotY),
          d > 0.05 ? (target.z - safe.z) / d : Math.cos(owner.rotY),
          0xf97316,
          true,
          false,
          true,
          calc.isCrit,
          calc.isBackstab
        );
      }
    }
    this.damageAbyssalClonesInArea(room, owner, safe.x, safe.z, 4.8, 18, 0xf97316);
  }

  private tickAscendedEntities(room: RoomInstance, dt: number): void {
    const arenaRadius = MAP_BY_ID[room.mapId].arenaRadius;

    // 1. Turrets (Marjohn Storm Tornado, Prime Asura Volcano, Damen 3x Solar Head Guns)
    const nextTurrets: InternalTurret[] = [];
    for (const turret of room.turrets) {
      turret.remaining -= dt;
      if (turret.remaining <= 0) continue;
      const owner = room.actors.find((a) => a.playerId === turret.ownerId);
      if (!owner || owner.isKO) continue;

      if (turret.kind === 'solar_gun') {
        const idx = turret.headOffsetIndex ?? 0;
        const spin = room.matchTime * 2.2 + (idx * Math.PI * 2) / 3;
        turret.x = owner.x + Math.cos(spin) * 1.05;
        turret.y = owner.y + 2.28;
        turret.z = owner.z + Math.sin(spin) * 1.05;
      } else {
        turret.rotY += dt * (turret.kind === 'storm_tornado' ? 3.5 : 0.45);
      }

      turret.fireTimer -= dt;
      if (turret.fireTimer <= 0) {
        let bestX: number | null = null;
        let bestY = turret.y;
        let bestZ: number | null = null;
        let bestDist = turret.kind === 'solar_gun' ? 18.0 : 22.0;

        for (const cand of room.actors) {
          if (cand.playerId === owner.playerId || cand.isKO || this.isTargetInvulnerablePeacefulNpc(room, cand)) {
            continue;
          }
          if (areActorsAllied(owner, cand, room.gameMode)) continue;
          const d = Math.hypot(cand.x - turret.x, cand.z - turret.z);
          if (d < bestDist) {
            bestDist = d;
            bestX = cand.x;
            bestY = cand.y + 1.0;
            bestZ = cand.z;
          }
        }
        for (const clone of room.abyssalClones) {
          if (clone.ownerId === owner.playerId) continue;
          const cloneOwner = room.actors.find((a) => a.playerId === clone.ownerId);
          if (cloneOwner && areActorsAllied(owner, cloneOwner, room.gameMode)) continue;
          const d = Math.hypot(clone.x - turret.x, clone.z - turret.z);
          if (d < bestDist) {
            bestDist = d;
            bestX = clone.x;
            bestY = clone.y + 1.0;
            bestZ = clone.z;
          }
        }

        if (turret.kind === 'solar_gun') {
          turret.fireTimer = 0.48;
          if (bestX !== null && bestZ !== null) {
            const dx = bestX - turret.x;
            const dy = bestY - turret.y;
            const dz = bestZ - turret.z;
            const dist3 = Math.max(0.01, Math.hypot(dx, dy, dz));
            const speed = 26.0;
            turret.rotY = Math.atan2(dx, dz);
            room.projectiles.push({
              id: makeId('proj'),
              ownerId: owner.playerId,
              fighterId: 'damen',
              skinId: owner.skinId,
              kind: 'magnum',
              x: turret.x,
              y: turret.y,
              z: turret.z,
              vx: (dx / dist3) * speed,
              vy: (dy / dist3) * speed,
              vz: (dz / dist3) * speed,
              rotY: turret.rotY,
              colorHex: 0xfacc15,
              originX: turret.x,
              originY: turret.y,
              originZ: turret.z,
              isOverdrive: true,
              age: 0,
              maxAge: 0.72,
              maxRange: 18.0,
              damage: 5,
              staggerDamage: 5,
              knockback: 2.2,
              hitIds: new Set(),
            });
          }
        } else if (turret.kind === 'storm_tornado') {
          turret.fireTimer = 0.9;
          const ang =
            bestX !== null && bestZ !== null
              ? Math.atan2(bestX - turret.x, bestZ - turret.z)
              : turret.rotY;
          const projSpd = 18.0;
          room.projectiles.push({
            id: makeId('proj'),
            ownerId: owner.playerId,
            fighterId: 'marjohn',
            skinId: owner.skinId,
            kind: 'tornado',
            x: turret.x + Math.sin(ang) * 0.9,
            y: turret.y + 0.95,
            z: turret.z + Math.cos(ang) * 0.9,
            vx: Math.sin(ang) * projSpd,
            vz: Math.cos(ang) * projSpd,
            rotY: ang,
            colorHex: 0x38bdf8,
            originX: turret.x,
            originY: turret.y + 0.95,
            originZ: turret.z,
            isOverdrive: true,
            isHoming: true,
            age: 0,
            maxAge: 2.0,
            maxRange: 22.0,
            damage: 10,
            staggerDamage: 12,
            knockback: 4.8,
            hitIds: new Set(),
          });
        } else if (turret.kind === 'asura_volcano') {
          turret.fireTimer = 1.15;
          const spreadAng = turret.rotY + turret.burstIndex * 1.4;
          turret.burstIndex += 1;
          const destX =
            bestX !== null && bestZ !== null
              ? bestX
              : turret.x + Math.sin(spreadAng) * 7.5;
          const destZ =
            bestX !== null && bestZ !== null
              ? bestZ
              : turret.z + Math.cos(spreadAng) * 7.5;
          const flightTime = 0.78;
          const startY = turret.y + 1.9;
          const destGroundY = getMapTerrainHeight(room.mapId, destX, destZ);
          const dx = destX - turret.x;
          const dz = destZ - turret.z;
          const dy = destGroundY + 0.4 - startY;
          const initVy = (dy + 0.5 * 18.0 * flightTime * flightTime) / flightTime;
          room.projectiles.push({
            id: makeId('proj'),
            ownerId: owner.playerId,
            fighterId: 'prime',
            skinId: owner.skinId,
            kind: 'magmaBoulder',
            x: turret.x,
            y: startY,
            z: turret.z,
            vx: dx / flightTime,
            vy: initVy,
            vz: dz / flightTime,
            rotY: Math.atan2(dx, dz),
            colorHex: 0xf97316,
            originX: turret.x,
            originY: startY,
            originZ: turret.z,
            targetX: destX,
            targetY: destGroundY + 0.4,
            targetZ: destZ,
            isOverdrive: true,
            age: 0,
            maxAge: flightTime + 0.45,
            damage: 13,
            staggerDamage: 18,
            knockback: 6.8,
            hitIds: new Set(),
          });
        }
      }
      nextTurrets.push(turret);
    }
    room.turrets = nextTurrets;

    // 2. Khen's Abyssal Shadow Clones
    const nextClones: InternalAbyssalClone[] = [];
    for (const clone of room.abyssalClones) {
      if (clone.hp <= 0) continue;
      const owner = room.actors.find((a) => a.playerId === clone.ownerId);
      if (!owner || owner.isKO) continue;

      clone.attackCd = Math.max(0, clone.attackCd - dt);
      clone.dashCd = Math.max(0, clone.dashCd - dt);
      clone.swingTimer = Math.max(0, clone.swingTimer - dt);
      clone.flankAngle += dt * 1.4;

      let target: InternalActor | null = null;
      let bestDist = 36.0;
      for (const cand of room.actors) {
        if (cand.playerId === owner.playerId || cand.isKO || this.isTargetInvulnerablePeacefulNpc(room, cand)) {
          continue;
        }
        if (areActorsAllied(owner, cand, room.gameMode)) continue;
        const d = Math.hypot(cand.x - clone.x, cand.z - clone.z);
        if (d < bestDist) {
          bestDist = d;
          target = cand;
        }
      }

      if (target) {
        const dx = target.x - clone.x;
        const dz = target.z - clone.z;
        const dist = Math.max(0.01, Math.hypot(dx, dz));
        clone.rotY = Math.atan2(dx, dz);

        if (dist > 2.2) {
          const spd = dist > 5.0 && clone.dashCd <= 0 ? 15.5 : 8.5;
          if (dist > 5.0 && clone.dashCd <= 0) {
            clone.dashCd = 3.2;
          }
          clone.vx = (dx / dist) * spd;
          clone.vz = (dz / dist) * spd;
          if (clone.swingTimer <= 0) clone.actionState = 'move';
        } else {
          clone.vx *= Math.exp(-10 * dt);
          clone.vz *= Math.exp(-10 * dt);
          if (clone.swingTimer <= 0) clone.actionState = 'idle';
        }

        if (dist <= 2.65 && clone.attackCd <= 0 && Math.abs(target.y - clone.y) <= 2.5) {
          clone.attackCd = 0.9;
          clone.swingTimer = 0.28;
          clone.actionState = 'attack';
          const dirX = dx / dist;
          const dirZ = dz / dist;
          const calc = this.computeDynamicDamage(owner, target, 9, 7);
          this.applyHit(
            room,
            owner,
            target,
            calc.dmg,
            11,
            4.2,
            dirX,
            dirZ,
            0xa855f7,
            false,
            false,
            false,
            calc.isCrit,
            calc.isBackstab
          );
          this.pushEvent(room, {
            kind: 'crescentSlash',
            attackerId: owner.playerId,
            fighterId: 'khen',
            skinId: owner.skinId,
            x: clone.x + dirX * 0.85,
            y: clone.y + 1.05,
            z: clone.z + dirZ * 0.85,
            dirX,
            dirZ,
            radius: 1.9,
            colorHex: 0xa855f7,
            abilitySlot: 7,
          });
        }
      } else {
        clone.vx *= Math.exp(-10 * dt);
        clone.vz *= Math.exp(-10 * dt);
        if (clone.swingTimer <= 0) clone.actionState = 'idle';
      }

      const moved = resolveObstacleCollisions(
        room.mapId,
        clone.x + clone.vx * dt,
        clone.y,
        clone.z + clone.vz * dt,
        0.42,
        room.obstacles
      );
      clone.x = moved.x;
      clone.z = moved.z;
      const r = Math.hypot(clone.x, clone.z);
      if (r > arenaRadius) {
        clone.x = (clone.x / r) * arenaRadius;
        clone.z = (clone.z / r) * arenaRadius;
      }
      if (room.activeDomain) {
        const clamped = clampPositionForDomainBarrier(
          room.activeDomain,
          clone.ownerId,
          clone.x,
          clone.z,
          0.42
        );
        clone.x = clamped.x;
        clone.z = clamped.z;
      }
      clone.y = getObstacleSupportY(room.mapId, clone.x, clone.y + 0.6, clone.z, 0.42, room.obstacles);
      nextClones.push(clone);
    }
    room.abyssalClones = nextClones;

    // 3. JM Celestial Judgement Spears (terrain-conforming electric shockwave rings)
    const nextSpears: InternalJudgementSpear[] = [];
    for (const spear of room.judgementSpears) {
      spear.remaining -= dt;
      if (spear.remaining <= 0) continue;
      const owner = room.actors.find((a) => a.playerId === spear.ownerId);
      if (!owner || owner.isKO) continue;

      spear.waveRadius += 30.0 * dt;
      spear.nextWaveAt -= dt;
      if (spear.nextWaveAt <= 0) {
        spear.nextWaveAt = 1.05;
        spear.waveRadius = 0.8;
        spear.pulseCount += 1;
        spear.hitThisWave.clear();
        this.pushEvent(room, {
          kind: 'judgementSpearPulse',
          attackerId: owner.playerId,
          fighterId: 'jm',
          skinId: owner.skinId,
          x: spear.x,
          y: spear.y + 0.25,
          z: spear.z,
          radius: 5.0,
          colorHex: 0x38bdf8,
          abilitySlot: 7,
        });
      }

      for (const target of room.actors) {
        if (target.playerId === owner.playerId || target.isKO || spear.hitThisWave.has(target.playerId)) {
          continue;
        }
        if (areActorsAllied(owner, target, room.gameMode)) continue;
        const d = Math.hypot(target.x - spear.x, target.z - spear.z);
        if (Math.abs(d - spear.waveRadius) <= 1.65) {
          // Grounded shockwave: dodgeable by jumping, flying, or dashing (i-frames)!
          const targetGround = getMapTerrainHeight(room.mapId, target.x, target.z);
          if (target.isFlying || target.y - targetGround > 1.15 || target.iframeTimer > 0) {
            continue;
          }
          spear.hitThisWave.add(target.playerId);
          const nx = d > 0.05 ? (target.x - spear.x) / d : 0;
          const nz = d > 0.05 ? (target.z - spear.z) / d : 1;
          const calc = this.computeDynamicDamage(owner, target, 10, 7);
          if (
            this.applyHit(
              room,
              owner,
              target,
              calc.dmg,
              18 + calc.staggerBonus,
              4.6,
              nx,
              nz,
              0x38bdf8,
              true,
              false,
              false,
              calc.isCrit,
              calc.isBackstab
            )
          ) {
            applyDirectStun(target, 0.45, false);
          }
        }
      }
      for (const clone of [...room.abyssalClones]) {
        if (clone.ownerId === owner.playerId || spear.hitThisWave.has(clone.id)) continue;
        const cloneOwner = room.actors.find((a) => a.playerId === clone.ownerId);
        if (cloneOwner && areActorsAllied(owner, cloneOwner, room.gameMode)) continue;
        const dc = Math.hypot(clone.x - spear.x, clone.z - spear.z);
        if (Math.abs(dc - spear.waveRadius) <= 1.65) {
          spear.hitThisWave.add(clone.id);
          this.applyDamageToAbyssalClone(room, owner, clone, 10, 0x38bdf8);
        }
      }

      nextSpears.push(spear);
    }
    room.judgementSpears = nextSpears;
  }

  private getAwakeningHelpers(): AwakeningHostHelpers {
    return {
      makeId,
      pushEvent: (room, ev) => this.pushEvent(room as RoomInstance, ev),
      spawnZone: (room, owner, kind, x, y, z, radius, duration, colorHex, endX, endZ) =>
        this.spawnZone(room as RoomInstance, owner as InternalActor, kind, x, y, z, radius, duration, colorHex, endX, endZ),
      spawnTelegraph: (room, actor, kind, x, y, z, dirX, dirZ, radius, length, angleHalf, windup, colorHex) =>
        this.spawnTelegraph(room as RoomInstance, actor as InternalActor, kind, x, y, z, dirX, dirZ, radius, length, angleHalf, windup, colorHex),
      clearActorTelegraph: (room, actor) => this.clearActorTelegraph(room as RoomInstance, actor as InternalActor),
      findNearestTarget: (room, actor, maxRange) =>
        this.findNearestTarget(room as RoomInstance, actor as InternalActor, maxRange),
      findPreferredTarget: (room, actor, maxRange) =>
        this.findPreferredTarget(room as RoomInstance, actor as InternalActor, maxRange),
      clampAimPoint: (room, actor, rawX, rawZ, maxRange) =>
        this.clampAimPoint(room as RoomInstance, actor as InternalActor, rawX, rawZ, maxRange),
      computeDynamicDamage: (actor, target, baseDamage, slot) =>
        this.computeDynamicDamage(actor as InternalActor, target as InternalActor, baseDamage, slot),
      applyHit: (room, attacker, target, damage, staggerDamage, knockback, dirX, dirZ, colorHex, isHeavy, isPull, isUltimate, isCrit, isBackstab) =>
        this.applyHit(room as RoomInstance, attacker as InternalActor, target as InternalActor, damage, staggerDamage, knockback, dirX, dirZ, colorHex, isHeavy, isPull, isUltimate, isCrit, isBackstab),
      damageObstacle: (room, obs, dmg, hitX, hitY, hitZ, colorHex) =>
        this.damageObstacle(room as RoomInstance, obs, dmg, hitX, hitY, hitZ, colorHex),
      damageObstaclesInArea: (room, x, z, radius, dmg, colorHex) =>
        this.damageObstaclesInArea(room as RoomInstance, x, z, radius, dmg, colorHex),
      eliminateActor: (room, attacker, target, cause) =>
        this.eliminateActor(room as RoomInstance, attacker as InternalActor | null, target as InternalActor, cause),
      spawnPrimeVolcanoTurret: (room, owner, x, z) =>
        this.spawnPrimeVolcanoTurret(room as RoomInstance, owner as InternalActor, x, z),
      broadcastPacket: (room, msg) => {
        const r = room as RoomInstance;
        for (const p of r.players) {
          const sock = this.playerSockets.get(p.playerId);
          if (sock) {
            this.send(sock, msg);
          }
        }
      },
    };
  }

  private buildSnapshot(room: RoomInstance, includeObstacles = true): ArenaSnapshot {
    return {
      serverTime: Date.now(),
      matchTime: Number(room.matchTime.toFixed(2)),
      gameMode: room.gameMode,
      initialActorCount: room.initialActorCount,
      lastInputSeq: { ...room.lastInputSeq },
      castingDomain: room.castingDomain
        ? {
            ...room.castingDomain,
            elapsed: Number(room.castingDomain.elapsed.toFixed(2)),
          }
        : null,
      activeDomain: room.activeDomain
        ? {
            ...room.activeDomain,
            centerX: Number(room.activeDomain.centerX.toFixed(2)),
            centerZ: Number(room.activeDomain.centerZ.toFixed(2)),
            remaining: Number(Math.max(0, room.activeDomain.remaining).toFixed(2)),
            sureHitTimer: Number(Math.max(0, room.activeDomain.sureHitTimer).toFixed(2)),
          }
        : null,
      activeDomainClash: room.activeDomainClash
        ? {
            ...room.activeDomainClash,
            remaining: Number(Math.max(0, room.activeDomainClash.remaining).toFixed(2)),
          }
        : null,
      kothZone: room.kothZone
        ? {
            ...room.kothZone,
            shiftRemaining: Number(Math.max(0, room.kothZone.shiftRemaining).toFixed(1)),
            scores: { ...room.kothZone.scores },
          }
        : null,
      teamScores: { ...room.teamScores },
      modeTimer: Number(Math.max(0, room.modeTimer).toFixed(1)),
      raidBossId: room.raidBossId,
      battleEvent: room.battleEvent
        ? {
            id: room.battleEvent.id,
            kind: room.battleEvent.kind,
            title: room.battleEvent.title,
            subtitle: room.battleEvent.subtitle,
            x: Number(room.battleEvent.x.toFixed(2)),
            z: Number(room.battleEvent.z.toFixed(2)),
            radius: Number(room.battleEvent.radius.toFixed(2)),
            remaining: Number(room.battleEvent.remaining.toFixed(1)),
            telegraphRemaining: Number(room.battleEvent.telegraphRemaining.toFixed(1)),
            colorHex: room.battleEvent.colorHex,
            secondaryPoints: room.battleEvent.secondaryPoints,
          }
        : null,
      activeClash: room.activeClash
        ? {
            ...room.activeClash,
            x: Number(room.activeClash.x.toFixed(2)),
            y: Number(room.activeClash.y.toFixed(2)),
            z: Number(room.activeClash.z.toFixed(2)),
          }
        : null,
      activeHeadlock: room.activeHeadlock
        ? {
            ...room.activeHeadlock,
            x: Number(room.activeHeadlock.x.toFixed(2)),
            y: Number(room.activeHeadlock.y.toFixed(2)),
            z: Number(room.activeHeadlock.z.toFixed(2)),
            remaining: Number(Math.max(0, room.activeHeadlock.remaining).toFixed(2)),
          }
        : null,
      stormActive: room.stormActive,
      stormRadius: Number(room.stormRadius.toFixed(2)),
      stormMaxRadius: Number(room.stormMaxRadius.toFixed(2)),
      stormCenterX: Number((room.stormCenterX ?? 0).toFixed(2)),
      stormCenterZ: Number((room.stormCenterZ ?? 0).toFixed(2)),
      awakeningPhase: room.awakeningPhase,
      awakeningCountdown:
        typeof room.awakeningCountdown === 'number'
          ? Number(Math.max(0, room.awakeningCountdown).toFixed(1))
          : null,
      awakeningOrbs: room.awakeningOrbs.map((o) => ({
        id: o.id,
        x: Number(o.x.toFixed(2)),
        y: Number(o.y.toFixed(2)),
        z: Number(o.z.toFixed(2)),
        active: o.active,
        fadeTimer: Number(o.fadeTimer.toFixed(2)),
        remaining: typeof o.remaining === 'number' ? Number(Math.max(0, o.remaining).toFixed(1)) : undefined,
        maxDuration: typeof o.maxDuration === 'number' ? o.maxDuration : undefined,
      })),
      awakeningCutscene: room.awakeningCutscene
        ? {
            id: room.awakeningCutscene.id,
            p1Id: room.awakeningCutscene.p1Id,
            p2Id: room.awakeningCutscene.p2Id,
            p1Name: room.awakeningCutscene.p1Name,
            p2Name: room.awakeningCutscene.p2Name,
            p1FighterId: room.awakeningCutscene.p1FighterId,
            p2FighterId: room.awakeningCutscene.p2FighterId,
            p1SkinId: room.awakeningCutscene.p1SkinId,
            p2SkinId: room.awakeningCutscene.p2SkinId,
            clockSec: Number(room.awakeningCutscene.clockSec.toFixed(2)),
            clashBalance: Number(room.awakeningCutscene.clashBalance.toFixed(3)),
            p1Taps: room.awakeningCutscene.p1Taps,
            p2Taps: room.awakeningCutscene.p2Taps,
            p1Overdrive: Number(room.awakeningCutscene.p1Overdrive.toFixed(2)),
            p2Overdrive: Number(room.awakeningCutscene.p2Overdrive.toFixed(2)),
            outcome: room.awakeningCutscene.outcome,
            fadeMusicOut: room.awakeningCutscene.fadeMusicOut,
            resolved: room.awakeningCutscene.resolved,
          }
        : null,
      awakeningBanner: room.awakeningBanner
        ? {
            id: room.awakeningBanner.id,
            text: room.awakeningBanner.text,
            subtext: room.awakeningBanner.subtext,
            colorHex: room.awakeningBanner.colorHex,
            remaining: Number(room.awakeningBanner.remaining.toFixed(2)),
          }
        : null,
      actors: room.actors.map((a) => ({
        playerId: a.playerId,
        slotIndex: a.slotIndex,
        name: a.name,
        fighterId: a.fighterId,
        skinId: a.skinId,
        isBot: a.isBot,
        isDummy: a.isDummy,
        team: a.team,
        isRaidBoss: a.isRaidBoss,
        x: Number(a.x.toFixed(3)),
        y: Number(a.y.toFixed(3)),
        z: Number(a.z.toFixed(3)),
        vx: Number(a.vx.toFixed(2)),
        yVel: Number(a.yVel.toFixed(2)),
        vz: Number(a.vz.toFixed(2)),
        grounded: a.grounded,
        rotY: Number(a.rotY.toFixed(3)),
        hp: Math.round(a.hp),
        maxHp: a.maxHp,
        mana: Math.round(a.mana),
        maxMana: a.maxMana,
        stamina: Math.round(a.stamina),
        maxStamina: a.maxStamina,
        stagger: Math.round(a.stagger),
        isStunned: a.isStunned,
        stunImmunityTimer: Number((a.stunImmunityTimer ?? 0).toFixed(2)),
        domainGauge: Number((a.domainGauge ?? 0).toFixed(1)),
        domainJackpotActive: Boolean(a.domainJackpotActive),
        domainJackpotHits: a.domainJackpotHits ?? 0,
        isOverdrive: a.isOverdrive,
        frenzyInside: a.frenzyInside,
        inWater: Boolean(a.inWater),
        inLava: Boolean(a.inLava),
        stealthed: Boolean(a.stealthed),
        stealthPatchId: a.stealthPatchId ?? null,
        insideBuildingId: a.insideBuildingId ?? null,
        jmDashActive: Boolean(a.jmDashActive),
        primeDomainBuff: Boolean(a.primeDomainBuff),
        passiveStacks: a.passiveStacks,
        counterFlowActive: a.counterFlowActive,
        stage2Slot: a.stage2Slot,
        stage2Timer: Number(a.stage2Timer.toFixed(2)),
        stage2Label: a.stage2Label,
        rushFatigue: a.rushFatigue,
        empoweredM1Ready: a.empoweredM1Ready,
        perfectEvadeTimer: Number(a.perfectEvadeTimer.toFixed(2)),
        comboCount: a.comboCount,
        comboResetRemaining:
          a.comboCount > 0 ? Number(Math.max(0, 2.0 - (room.matchTime - a.lastHitAt)).toFixed(2)) : 0,
        comboStep: a.comboStep,
        m1Variant: a.m1Variant,
        grabCooldown: Number(a.grabCooldown.toFixed(2)),
        damagePhase: a.damagePhase,
        actionState: a.actionState,
        abilitySlot: a.abilitySlot,
        actionTimer: Number(a.actionTimer.toFixed(2)),
        actionDuration: Number(a.actionDuration.toFixed(2)),
        whiffTimer: Number(a.whiffTimer.toFixed(2)),
        cooldowns: [
          Number(a.cooldowns[0].toFixed(2)),
          Number(a.cooldowns[1].toFixed(2)),
          Number(a.cooldowns[2].toFixed(2)),
          Number(a.cooldowns[3].toFixed(2)),
          Number(a.cooldowns[4].toFixed(2)),
          Number(a.cooldowns[5].toFixed(2)),
          Number(a.cooldowns[6].toFixed(2)),
          Number((a.cooldowns[7] ?? 0).toFixed(2)),
        ],
        ascendedCloneAlive: room.abyssalClones.some((c) => c.ownerId === a.playerId),
        dashCooldown: Number(a.dashCooldown.toFixed(2)),
        dashMaxCooldown: a.dashMaxCooldown,
        dashCharges: a.dashCharges,
        dashMaxCharges: a.dashMaxCharges,
        dashRechargeRemaining: Number(a.dashRechargeRemaining.toFixed(2)),
        isFlying: a.isFlying,
        flightRemaining: Number(a.flightRemaining.toFixed(2)),
        flightMax: a.flightMax,
        flightCooldown: Number(a.flightCooldown.toFixed(2)),
        speedBoostTimer: Number(a.speedBoostTimer.toFixed(2)),
        superArmor: a.superArmor,
        shieldActive: a.shieldActive,
        parryWindow: a.parryWindow,
        blockHeld: a.blockHeld,
        awakened: a.awakened,
        awakeningTransformTimer: Number(a.awakeningTransformTimer.toFixed(2)),
        silencedTimer: Number(a.silencedTimer.toFixed(2)),
        snareMarkedTimer: Number(a.snareMarkedTimer.toFixed(2)),
        slowTimer: Number(a.slowTimer.toFixed(2)),
        channelKind: a.channelKind,
        channelTimer: Number(a.channelTimer.toFixed(2)),
        channelDuration: Number(a.channelDuration.toFixed(2)),
        channelTargetX: Number(a.channelTargetX.toFixed(2)),
        channelTargetZ: Number(a.channelTargetZ.toFixed(2)),
        skyComboPrompt: Boolean(a.skyComboPrompt),
        skyComboStep: a.skyComboStep ?? 0,
        skyComboMashes: a.skyComboMashes ?? 0,
        skyComboTargetId: a.skyComboTargetId ?? null,
        isKO: a.isKO,
        koTime: a.koTime !== null ? Number(a.koTime.toFixed(2)) : null,
        koStyle: a.koStyle,
        koCause: a.koCause,
        koByFighterId: a.koByFighterId,
        wins: a.wins,
        kills: a.kills,
        deaths: a.deaths ?? 0,
        parryCount: a.parryCount,
        damageDealt: Math.round(a.damageDealt),
        heldItem: a.heldItem ?? null,
        strengthBuffTimer: Number((a.strengthBuffTimer ?? 0).toFixed(2)),
        permanentDamageBonus: Number((a.permanentDamageBonus ?? 0).toFixed(2)),
        permanentSpeedBonus: Number((a.permanentSpeedBonus ?? 0).toFixed(2)),
        dashCooldownMult: Number((a.dashCooldownMult ?? 1).toFixed(2)),
        permanentMaxHpStacks: a.permanentMaxHpStacks ?? 0,
        isNpcBoss: Boolean(a.isNpcBoss),
        ...(a.isDummy && a.dummyDpsTracker
          ? {
              dummyDps: a.dummyDpsTracker.currentDps,
              dummyPeakDps: a.dummyDpsTracker.peakDps,
              dummyBurstDamage: Math.round(a.dummyDpsTracker.burstDamage),
            }
          : {}),
      })),
      projectiles: room.projectiles.map((p) => ({
        id: p.id,
        ownerId: p.ownerId,
        fighterId: p.fighterId,
        skinId: p.skinId,
        kind: p.kind,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        z: Number(p.z.toFixed(2)),
        vx: Number(p.vx.toFixed(2)),
        vy: p.vy !== undefined ? Number(p.vy.toFixed(2)) : undefined,
        vz: Number(p.vz.toFixed(2)),
        rotY: Number(p.rotY.toFixed(3)),
        colorHex: p.colorHex,
        originX: p.originX !== undefined ? Number(p.originX.toFixed(2)) : undefined,
        originY: p.originY !== undefined ? Number(p.originY.toFixed(2)) : undefined,
        originZ: p.originZ !== undefined ? Number(p.originZ.toFixed(2)) : undefined,
        targetX: p.targetX !== undefined ? Number(p.targetX.toFixed(2)) : undefined,
        targetY: p.targetY !== undefined ? Number(p.targetY.toFixed(2)) : undefined,
        targetZ: p.targetZ !== undefined ? Number(p.targetZ.toFixed(2)) : undefined,
        isComboLink: p.isComboLink,
        isOverdrive: p.isOverdrive,
      })),
      zones: room.zones.map((z) => ({
        id: z.id,
        ownerId: z.ownerId,
        fighterId: z.fighterId,
        skinId: z.skinId,
        kind: z.kind,
        x: Number(z.x.toFixed(2)),
        y: Number(z.y.toFixed(2)),
        z: Number(z.z.toFixed(2)),
        endX: z.endX !== undefined ? Number(z.endX.toFixed(2)) : undefined,
        endZ: z.endZ !== undefined ? Number(z.endZ.toFixed(2)) : undefined,
        radius: Number(z.radius.toFixed(2)),
        remaining: Number(z.remaining.toFixed(2)),
        maxDuration: Number(z.maxDuration.toFixed(2)),
        colorHex: z.colorHex,
        triggered: z.triggered,
      })),
      telegraphs: room.telegraphs.map((t) => ({
        id: t.id,
        ownerId: t.ownerId,
        fighterId: t.fighterId,
        kind: t.kind,
        x: Number(t.x.toFixed(2)),
        y: Number(t.y.toFixed(2)),
        z: Number(t.z.toFixed(2)),
        dirX: Number(t.dirX.toFixed(3)),
        dirZ: Number(t.dirZ.toFixed(3)),
        radius: Number(t.radius.toFixed(2)),
        length: Number(t.length.toFixed(2)),
        angleHalf: Number(t.angleHalf.toFixed(3)),
        progress: Number(t.progress.toFixed(2)),
        colorHex: t.colorHex,
      })),
      turrets: room.turrets.map((t) => ({
        id: t.id,
        ownerId: t.ownerId,
        fighterId: t.fighterId,
        kind: t.kind,
        x: Number(t.x.toFixed(2)),
        y: Number(t.y.toFixed(2)),
        z: Number(t.z.toFixed(2)),
        rotY: Number(t.rotY.toFixed(3)),
        remaining: Number(Math.max(0, t.remaining).toFixed(2)),
        maxDuration: t.maxDuration,
        headOffsetIndex: t.headOffsetIndex,
      })),
      abyssalClones: room.abyssalClones.map((c) => ({
        id: c.id,
        ownerId: c.ownerId,
        name: c.name,
        hp: Math.round(c.hp),
        maxHp: c.maxHp,
        x: Number(c.x.toFixed(2)),
        y: Number(c.y.toFixed(2)),
        z: Number(c.z.toFixed(2)),
        rotY: Number(c.rotY.toFixed(3)),
        actionState: c.actionState,
        swingTimer: Number(Math.max(0, c.swingTimer).toFixed(2)),
      })),
      judgementSpears: room.judgementSpears.map((s) => ({
        id: s.id,
        ownerId: s.ownerId,
        x: Number(s.x.toFixed(2)),
        y: Number(s.y.toFixed(2)),
        z: Number(s.z.toFixed(2)),
        remaining: Number(Math.max(0, s.remaining).toFixed(2)),
        maxDuration: s.maxDuration,
        waveRadius: Number(s.waveRadius.toFixed(2)),
        maxRadius: s.maxRadius,
        pulseCount: s.pulseCount,
      })),
      pickups: room.pickups.map((pk) => ({
        id: pk.id,
        kind: pk.kind,
        x: Number(pk.x.toFixed(2)),
        y: Number(pk.y.toFixed(2)),
        z: Number(pk.z.toFixed(2)),
        active: pk.active,
        magnetTargetId: pk.magnetTargetId ?? null,
      })),
      itemDrops: room.itemDrops.map((it) => ({
        id: it.id,
        kind: it.kind,
        x: Number(it.x.toFixed(2)),
        y: Number(it.y.toFixed(2)),
        z: Number(it.z.toFixed(2)),
        active: it.active,
        magnetTargetId: it.magnetTargetId ?? null,
      })),
      frozenWaterZones: room.frozenWaterZones.map((fz) => ({
        ...fz,
        remaining: Number(fz.remaining.toFixed(2)),
      })),
      templeNpc: (() => {
        if (!room.templeNpc) return null;
        const npcActor = room.actors.find((a) => a.playerId === room.templeNpc?.actorId);
        return npcActor
          ? {
              ...room.templeNpc,
              hp: Math.max(0, Math.round(npcActor.hp)),
              x: Number(npcActor.x.toFixed(2)),
              y: Number(npcActor.y.toFixed(2)),
              z: Number(npcActor.z.toFixed(2)),
              rotY: Number(npcActor.rotY.toFixed(3)),
            }
          : { ...room.templeNpc };
      })(),
      obstacles: includeObstacles ? room.obstacles.map((obs) => ({ ...obs })) : undefined,
    };
  }

  private maybeBroadcastSnapshot(room: RoomInstance, nowMs: number): void {
    const isLocalMode = room.isSoloPractice || room.isTrainingMode;
    const hasUrgentEvent = room.pendingEvents.some(
      (ev) =>
        ev.kind === 'ko' ||
        ev.kind === 'clashStart' ||
        ev.kind === 'awakeningCutsceneStart' ||
        ev.kind === 'awakeningTransform'
    );
    const intervalMs = isLocalMode ? 16 : 50;
    if (!shouldBroadcastMultiplayerSnapshot(nowMs, room.lastSnapshotBroadcastMs, hasUrgentEvent, intervalMs)) {
      return;
    }
    this.broadcastSnapshot(room, false, nowMs);
  }

  private broadcastSnapshot(room: RoomInstance, forceObstacles = false, nowMs = Date.now()): void {
    const includeObstacles = forceObstacles || room.obstaclesDirty || room.lastSnapshotBroadcastMs === 0;
    const snapshot = this.buildSnapshot(room, includeObstacles);
    room.obstaclesDirty = false;
    room.lastSnapshotBroadcastMs = nowMs;
    const events = room.pendingEvents;
    room.pendingEvents = [];
    for (const p of room.players) {
      const sock = this.playerSockets.get(p.playerId);
      if (sock) {
        this.send(sock, { type: 'game:snapshot', snapshot, events });
      }
    }
  }
}

function attackerAddDamage(attacker: InternalActor, dmg: number): void {
  attacker.damageDealt += dmg;
}
