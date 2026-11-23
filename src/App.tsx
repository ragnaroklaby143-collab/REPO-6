import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  AbilitySlot,
  ArenaSnapshot,
  ClientMessage,
  CombatEvent,
  CombatMoveType,
  FighterId,
  GameModeId,
  MapId,
  RoomChatMessage,
  RoomState,
  ServerMessage,
  SkinId,
  TrainingConfig,
  AwakeningDebugAction,
} from './shared/gameData.ts';
import { AWAKENING_CONFIG } from './shared/awakeningConfig.ts';
import { CutsceneDirector } from './game/awakeningLogic.ts';
import { LocalRoomSession } from './game/localRoomClient.ts';
import { LobbyLanding } from './components/LobbyLanding.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { TekkenPickScreen } from './components/TekkenPickScreen.tsx';
import {
  ArenaViewport,
  DamagePopup,
  HitFlashInfo,
  LocalControlState,
  OrbScreenIndicator,
  ScreenTintInfo,
  ScreenTintKind,
} from './components/ArenaViewport.tsx';
import { MobileCombatHUD } from './components/MobileCombatHUD.tsx';
import { DomainCutInOverlay, type DomainCutInBanner } from './components/DomainCutInOverlay.tsx';
import { CutsceneOverlay } from './components/CutsceneOverlay.tsx';
import { AwakeningDebugPanel } from './components/AwakeningDebugPanel.tsx';
import { AdminMonitorModal } from './components/AdminMonitorModal.tsx';
import { FirebaseSetupModal } from './components/FirebaseSetupModal.tsx';
import { SkinShopModal } from './components/SkinShopModal.tsx';
import { ScreenTransition } from './components/ScreenTransition.tsx';
import { janeCutsceneAudio, soundEngine } from './game/soundEngine.ts';
import { canEnterArena } from './game/userLogic.ts';
import { DOMAIN_CONFIGS } from './game/domainLogic.ts';
import { shouldThrottleUpdate } from './game/combatMath.ts';
import {
  canSendWsPayload,
  quantizeNetFloat,
  shouldSendMovePacket,
  updateRttJitterSample,
} from './game/perfConfig.ts';
import { isSkinUnlocked, purchaseSkin } from './game/shopLogic.ts';
import type { AimPreviewState } from './game/vfxManager.ts';
import {
  AccountStoreState,
  CoinRewardBreakdown,
  GuestSession,
  calculateMatchCoinReward,
  createGuestSession,
  getActiveAccount,
  loadAccountStore,
  loadGuestSession,
  loginOrCreateAccount,
  logoutAccount,
  recordGuestMatchReward,
  recordMatchReward,
  saveGuestSession,
  unlockAccountSkin,
  unlockGuestSkin,
} from './game/accountStore.ts';
import { auth, isFirebaseConfigPlaceholder } from './firebase.ts';
import {
  CloudUserProfile,
  commitMatchResultToCloud,
  isAdminEmail,
  purchaseSkinInCloud,
  signInWithGoogleCloud,
  signOutCloudUser,
  subscribeOwnCloudUser,
  syncCloudPresence,
  upsertCloudUserOnLogin,
} from './game/firebaseUsers.ts';

const APP_VERSION = 10;

const SCREEN_TINT_STYLES: Record<ScreenTintKind, string> = {
  'high-noon-amber': 'radial-gradient(circle at 50% 42%, rgba(251, 191, 36, 0.26), rgba(180, 83, 9, 0.34) 75%)',
  'avalanche-red': 'radial-gradient(circle at 50% 48%, rgba(244, 63, 94, 0.22), rgba(127, 29, 29, 0.42) 78%)',
  'eclipse-vignette': 'radial-gradient(circle at 50% 50%, transparent 28%, rgba(15, 23, 42, 0.62) 86%)',
  'phantom-desat': 'radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.16), rgba(15, 23, 42, 0.56) 82%)',
  'solar-white-gold': 'radial-gradient(circle at 50% 35%, rgba(254, 249, 195, 0.42), rgba(245, 158, 11, 0.24) 76%)',
  'pickup-emerald': 'radial-gradient(circle at 50% 50%, transparent 56%, rgba(16, 185, 129, 0.34) 100%)',
  'pickup-cyan': 'radial-gradient(circle at 50% 50%, transparent 56%, rgba(56, 189, 248, 0.34) 100%)',
  'pickup-crimson': 'radial-gradient(circle at 50% 50%, transparent 54%, rgba(244, 63, 94, 0.36) 100%)',
  'cryo-frost': 'radial-gradient(circle at 50% 50%, rgba(186, 230, 253, 0.14) 35%, rgba(56, 189, 248, 0.42) 100%)',
};

export default function App() {
  const [viewMode, setViewMode] = useState<'game' | 'cinema'>('game');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [snapshot, setSnapshot] = useState<ArenaSnapshot | null>(null);
  const [pendingEvents, setPendingEvents] = useState<CombatEvent[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [lockOnEnabled, setLockOnEnabled] = useState<boolean>(true);
  const [cancelAimTriggerSeq, setCancelAimTriggerSeq] = useState<number>(0);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [hitFlash, setHitFlash] = useState<HitFlashInfo | null>(null);
  const [screenTint, setScreenTint] = useState<ScreenTintInfo | null>(null);
  const [orbIndicators, setOrbIndicators] = useState<OrbScreenIndicator[]>([]);
  const [selectedSkin, setSelectedSkin] = useState<SkinId>('classic');
  const [selectedMode, setSelectedMode] = useState<GameModeId>('classic');
  const [shopModal, setShopModal] = useState<{
    open: boolean;
    fighterId?: FighterId;
    skinId?: SkinId;
  }>({ open: false });
  const [debugOpen, setDebugOpen] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get('debug') === '1'
  );

  // Cutscene master clock & Jane audio timeline refs
  const cutsceneIdRef = useRef<string | null>(null);
  const cutsceneDirectorRef = useRef<CutsceneDirector | null>(null);
  const cutsceneFallbackStartRef = useRef<number | null>(null);
  const cutsceneMusicActiveRef = useRef<boolean>(false);

  // Live unthrottled snapshot for Three.js + 12 FPS React HUD/Minimap throttle refs
  const liveSnapshotRef = useRef<ArenaSnapshot | null>(null);
  const lastHudSnapMsRef = useRef<number>(0);
  const lastCriticalSigRef = useRef<string>('');
  const lastObstaclesRef = useRef<NonNullable<ArenaSnapshot['obstacles']>>([]);
  const playerIdRef = useRef<string>(playerId);
  playerIdRef.current = playerId;
  const perfStatsRef = useRef<{ fps: number; frameTimeMs: number; drawCalls: number }>({
    fps: 60,
    frameTimeMs: 16.7,
    drawCalls: 0,
  });
  const pingMsRef = useRef<number | null>(null);
  const perfListenersRef = useRef<Set<() => void>>(new Set());
  const notifyPerfListeners = useCallback(() => {
    for (const fn of perfListenersRef.current) fn();
  }, []);
  const handlePerfStats = useCallback(
    (stats: { fps: number; frameTimeMs: number; drawCalls: number }) => {
      perfStatsRef.current = stats;
      notifyPerfListeners();
    },
    [notifyPerfListeners]
  );
  const subscribePerfStats = useCallback((fn: () => void) => {
    perfListenersRef.current.add(fn);
    return () => {
      perfListenersRef.current.delete(fn);
    };
  }, []);

  // Room Chat & Screen Transition Curtain State
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const chatOpenRef = useRef<boolean>(false);
  chatOpenRef.current = chatOpen;
  const [screenTrans, setScreenTrans] = useState<{
    key: number;
    label: string;
    sublabel?: string;
    accentHex?: string;
  }>({ key: 0, label: 'KOOPAL CLASH' });

  // Firebase Auth + Firestore Cloud Profile State
  const isPlaceholderConfig = isFirebaseConfigPlaceholder();
  const [cloudUser, setCloudUser] = useState<CloudUserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAdminMonitor, setShowAdminMonitor] = useState<boolean>(false);
  const [showFirebaseGuide, setShowFirebaseGuide] = useState<boolean>(false);

  // Local test fallback account & Guest session state
  const [accountStore, setAccountStore] = useState<AccountStoreState>(() => loadAccountStore());
  const [guestSession, setGuestSession] = useState<GuestSession | null>(() => loadGuestSession());
  const [domainCutIn, setDomainCutIn] = useState<DomainCutInBanner | null>(null);
  const [lastCoinReward, setLastCoinReward] = useState<CoinRewardBreakdown | null>(null);
  const activeAccount = getActiveAccount(accountStore);
  const activeCoins = cloudUser?.coins ?? activeAccount?.coins ?? guestSession?.coins ?? 0;
  const unlockedSkins =
    cloudUser?.unlockedSkins ?? activeAccount?.unlockedSkins ?? guestSession?.unlockedSkins ?? [];
  const myRoomFighterId: FighterId =
    room?.players.find((p) => p.playerId === playerId)?.fighterId ?? 'jm';
  const isAdmin = Boolean(cloudUser && isAdminEmail(cloudUser.email));
  const isLocalMatch = Boolean(room && (room.isSoloPractice || room.isTrainingMode));
  const inActiveLocalMatch = Boolean(isLocalMatch && room && room.phase !== 'lobby' && room.phase !== 'victory');
  const rewardedMatchKeyRef = useRef<string | null>(null);
  const prevViewStateRef = useRef<string>('title');

  const wsRef = useRef<WebSocket | null>(null);
  const localSessionRef = useRef<LocalRoomSession | null>(null);
  const cameraYawRef = useRef<number>(Math.PI);
  const aimPitchRef = useRef<number>(-0.45);
  const targetIdRef = useRef<string | null>(null);
  targetIdRef.current = targetId;
  const selectedSkinRef = useRef<SkinId>('classic');
  selectedSkinRef.current = selectedSkin;

  // Latency compensation clock-sync & local prediction refs
  const clockOffsetMsRef = useRef<number>(0);
  const jitterMsRef = useRef<number>(15);
  const minRttMsRef = useRef<number>(0);
  const roomPhaseRef = useRef<RoomState['phase'] | null>(null);
  roomPhaseRef.current = room?.phase ?? null;
  const inputSeqRef = useRef<number>(0);
  const localControlRef = useRef<LocalControlState>({
    moveX: 0,
    moveZ: 0,
    blockHeld: false,
    jumpTriggerSeq: 0,
  });
  const aimPreviewRef = useRef<AimPreviewState>({
    active: false,
    cancelled: false,
    aimKind: 'none',
    originX: 0,
    originZ: 0,
    aimX: 0,
    aimZ: 0,
    radius: 3,
    range: 8,
    colorHex: 0x38bdf8,
  });
  const cursorWorldRef = useRef<{ x: number; z: number; active: boolean }>({
    x: 0,
    z: 0,
    active: false,
  });

  const urlParams = new URLSearchParams(window.location.search);
  const initialRoomCode = (urlParams.get('room') || '').toUpperCase().slice(0, 4);
  const autostartRequested = urlParams.get('autostart') === '1';
  const rawAutostartMap = urlParams.get('map');
  const autostartMapParam: MapId | null =
    rawAutostartMap === 'shibuya' ||
    rawAutostartMap === 'meadow' ||
    rawAutostartMap === 'temple' ||
    rawAutostartMap === 'obsidian'
      ? rawAutostartMap
      : null;
  const rawAutostartFighter = urlParams.get('fighter');
  const autostartFighterParam: FighterId | null =
    rawAutostartFighter === 'prime' ||
    rawAutostartFighter === 'jm' ||
    rawAutostartFighter === 'khen' ||
    rawAutostartFighter === 'marjohn' ||
    rawAutostartFighter === 'damen'
      ? rawAutostartFighter
      : null;
  const savedName = sessionStorage.getItem('sc3d_name') || 'Player';
  const autostartPhaseRef = useRef<'idle' | 'created' | 'done'>('idle');

  const triggerScreenTransition = useCallback(
    (label: string, sublabel?: string, accentHex = '#f59e0b') => {
      setScreenTrans((prev) => ({
        key: prev.key + 1,
        label,
        sublabel,
        accentHex,
      }));
    },
    []
  );

  const sendMsg = useCallback((msg: ClientMessage, isCritical = true) => {
    if (localSessionRef.current) {
      localSessionRef.current.send(msg);
      return;
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (!canSendWsPayload(ws.bufferedAmount, isCritical)) {
        return;
      }
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      if (msg.type === 'net:pong') {
        const sample = updateRttJitterSample({
          clientSentAt: msg.clientSendTime,
          nowClient: Date.now(),
          serverTime: msg.serverTime,
          prevRttMs: pingMsRef.current ?? 0,
          prevJitterMs: jitterMsRef.current,
          prevMinRttMs: minRttMsRef.current,
          prevClockOffsetMs: clockOffsetMsRef.current,
        });
        minRttMsRef.current = sample.minRttMs;
        jitterMsRef.current = sample.jitterMs;
        clockOffsetMsRef.current = sample.clockOffsetMs;
        pingMsRef.current = sample.rttMs;
        notifyPerfListeners();

        const phase = roomPhaseRef.current;
        if (!phase || phase === 'lobby' || phase === 'victory') {
          setPingMs(sample.rttMs);
        }
        return;
      }

      if (msg.type === 'room:joined') {
        lastObstaclesRef.current = [];
        setPlayerId(msg.playerId);
        setRoom(msg.room);
        setChatMessages(msg.chatHistory ?? []);
        setUnreadChatCount(0);
        setErrorMessage(null);
        const isLocalRoom = Boolean(msg.room.isSoloPractice || msg.room.isTrainingMode);
        if (!isLocalRoom) {
          sessionStorage.setItem('sc3d_room', msg.room.roomCode);
          sessionStorage.setItem('sc3d_token', msg.reconnectToken);
        }
        sendMsg({
          type: 'room:selectSkin',
          skinId: selectedSkinRef.current,
        });
      } else if (msg.type === 'room:state') {
        setRoom(msg.room);
        if (msg.room.phase === 'victory') {
          soundEngine.play('victory');
        }
        if (msg.room.phase === 'lobby' || msg.room.phase === 'roundEnd' || msg.room.phase === 'countdown') {
          setDomainCutIn(null);
          if (msg.room.phase === 'lobby' || msg.room.phase === 'roundEnd') {
            lastObstaclesRef.current = [];
          }
          if (msg.room.phase === 'lobby') {
            liveSnapshotRef.current = null;
            lastHudSnapMsRef.current = 0;
            lastCriticalSigRef.current = '';
            setSnapshot(null);
            setTargetId(null);
          }
          setDamagePopups([]);
          setHitFlash(null);
        }
      } else if (msg.type === 'room:chat') {
        setChatMessages((prev) => [...prev.slice(-59), msg.message]);
        if (!chatOpenRef.current) {
          setUnreadChatCount((c) => c + 1);
        }
        if (msg.message.senderId !== playerIdRef.current) {
          soundEngine.play('chatPop');
        }
      } else if (msg.type === 'room:exited') {
        sessionStorage.removeItem('sc3d_room');
        sessionStorage.removeItem('sc3d_token');
        if (localSessionRef.current) {
          localSessionRef.current.dispose();
          localSessionRef.current = null;
        }
        lastObstaclesRef.current = [];
        setRoom(null);
        setDomainCutIn(null);
        liveSnapshotRef.current = null;
        lastHudSnapMsRef.current = 0;
        lastCriticalSigRef.current = '';
        setSnapshot(null);
        setChatMessages([]);
        setChatOpen(false);
        setUnreadChatCount(0);
        setTargetId(null);
        setDamagePopups([]);
        setHitFlash(null);
        setPendingEvents([]);
        setErrorMessage(msg.reason || 'Returned to Lobby.');
      } else if (msg.type === 'room:error') {
        soundEngine.play('lockedError');
        setErrorMessage(msg.message);
        if (msg.message.includes('not found')) {
          sessionStorage.removeItem('sc3d_room');
          sessionStorage.removeItem('sc3d_token');
        }
      } else if (msg.type === 'domain:castStart') {
        const cfg = DOMAIN_CONFIGS[msg.fighterId];
        const snapCaster = liveSnapshotRef.current?.actors.find((a) => a.playerId === msg.casterId);
        setDomainCutIn({
          id: `cast-${msg.casterId}-${msg.timestamp}`,
          casterName: msg.casterName,
          fighterId: msg.fighterId,
          skinId: msg.skinId ?? snapCaster?.skinId ?? 'ascended',
          domainName: msg.domainName || cfg.domainName,
          primaryHex: cfg.primaryHex,
        });
        return;
      } else if (msg.type === 'game:snapshot') {
        const snap = msg.snapshot;
        if (snap.obstacles && snap.obstacles.length > 0) {
          lastObstaclesRef.current = snap.obstacles;
        } else if (lastObstaclesRef.current.length > 0) {
          snap.obstacles = lastObstaclesRef.current;
        }
        liveSnapshotRef.current = snap;
        const now = performance.now();
        const me = snap.actors.find((a) => a.playerId === playerIdRef.current);
        const critSig = `${snap.awakeningPhase}|${snap.awakeningCountdown ?? ''}|${snap.activeClash?.id ?? ''}|${snap.activeHeadlock?.id ?? ''}|${snap.awakeningCutscene?.id ?? ''}|${snap.awakeningCutscene?.resolved ?? ''}|${snap.awakeningBanner?.id ?? ''}|${snap.castingDomain?.phase ?? ''}|${snap.castingDomain?.casterId ?? ''}|${snap.activeDomain?.id ?? ''}|${snap.activeDomainClash?.id ?? ''}|${snap.gameMode}|${snap.kothZone?.controllerId ?? ''}|${snap.teamScores?.alpha ?? 0}-${snap.teamScores?.beta ?? 0}|${snap.obstacles?.length ?? 0}|${me?.isKO ?? false}|${me?.awakened ?? false}`;
        if (
          critSig !== lastCriticalSigRef.current ||
          shouldThrottleUpdate(now, lastHudSnapMsRef.current, 12)
        ) {
          lastHudSnapMsRef.current = now;
          lastCriticalSigRef.current = critSig;
          setSnapshot(snap);
        }
        if (msg.events.length > 0) {
          for (const ev of msg.events) {
            if (ev.kind === 'domainClashStart') {
              const dc = snap.activeDomainClash;
              const p1Actor = dc ? snap.actors.find((a) => a.playerId === dc.p1Id) : undefined;
              const p2Actor = dc ? snap.actors.find((a) => a.playerId === dc.p2Id) : undefined;
              setDomainCutIn({
                id: ev.id,
                casterName: dc?.p1Name ?? 'CHALLENGER',
                fighterId: ev.fighterId ?? dc?.p1FighterId ?? 'khen',
                skinId: p1Actor?.skinId ?? 'ascended',
                domainName: ev.callout || 'DOMAIN CLASH',
                primaryHex: ev.colorHex,
                isClash: true,
                challengerName: dc?.p2Name,
                challengerFighterId: dc?.p2FighterId,
                challengerSkinId: p2Actor?.skinId ?? 'ascended',
                challengerDomainName: dc ? DOMAIN_CONFIGS[dc.p2FighterId].domainName : undefined,
              });
            }
          }
          setPendingEvents((prev) => [...prev, ...msg.events]);
        }
      }
    },
    [sendMsg, notifyPerfListeners]
  );

  const handleServerMessageRef = useRef(handleServerMessage);
  handleServerMessageRef.current = handleServerMessage;

  const startLocalRoomSession = useCallback(() => {
    if (localSessionRef.current) {
      localSessionRef.current.dispose();
      localSessionRef.current = null;
    }
    const session = new LocalRoomSession({
      onMessage: (msg) => handleServerMessageRef.current(msg),
    });
    localSessionRef.current = session;
    return session;
  }, []);

  // Firebase Auth listener (upserts user on login; live listener paused during solo/training gameplay)
  useEffect(() => {
    if (!auth || isPlaceholderConfig) return;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCloudUser(null);
        return;
      }
      try {
        const profile = await upsertCloudUserOnLogin(user);
        setCloudUser(profile);
        setGuestSession(null);
        saveGuestSession(null);
        sessionStorage.setItem('sc3d_name', profile.displayName.slice(0, 14));
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to sync profile with Firestore.');
      }
    });
    return () => {
      unsubAuth();
    };
  }, [isPlaceholderConfig]);

  // Firestore user subscription: completely paused during active Solo/Training matches
  useEffect(() => {
    if (!cloudUser?.uid || isPlaceholderConfig || inActiveLocalMatch) return;
    const unsub = subscribeOwnCloudUser(cloudUser.uid, (nextProfile) => {
      setCloudUser(nextProfile);
    });
    return () => unsub();
  }, [cloudUser?.uid, isPlaceholderConfig, inActiveLocalMatch]);

  // Sync live online / in-match status to Firestore (skipped during active Solo/Training matches)
  useEffect(() => {
    if (!cloudUser || inActiveLocalMatch) return;
    const inMatch = Boolean(room && room.phase !== 'lobby' && room.phase !== 'victory');
    const nextStatus = inMatch ? 'in-match' : 'online';
    const myRoomPlayer = room?.players.find((p) => p.playerId === playerId);
    if (cloudUser.onlineStatus !== nextStatus || (myRoomPlayer && cloudUser.favoriteFighter !== myRoomPlayer.fighterId)) {
      void syncCloudPresence(cloudUser.uid, nextStatus, myRoomPlayer?.fighterId).catch(() => {});
    }
  }, [cloudUser?.uid, cloudUser?.onlineStatus, room?.phase, room?.players, playerId, inActiveLocalMatch]);

  // Mark offline cleanly on page unload if signed in
  useEffect(() => {
    const uid = cloudUser?.uid;
    if (!uid) return;
    const onUnload = () => {
      void syncCloudPresence(uid, 'offline').catch(() => {});
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [cloudUser?.uid]);

  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const sendPing = (ws: WebSocket) => {
      if (localSessionRef.current || document.hidden) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'net:ping', clientSendTime: Date.now() } satisfies ClientMessage));
      }
    };

    const connect = () => {
      setConnectionStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        setErrorMessage(null);

        sendPing(ws);
        setTimeout(() => sendPing(ws), 220);
        setTimeout(() => sendPing(ws), 500);
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => sendPing(ws), 2000);

        const savedRoom = sessionStorage.getItem('sc3d_room');
        const savedToken = sessionStorage.getItem('sc3d_token');
        const name = sessionStorage.getItem('sc3d_name') || 'Player';
        if (savedRoom && savedToken && !localSessionRef.current) {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomCode: savedRoom,
              playerName: name,
              reconnectToken: savedToken,
            } satisfies ClientMessage)
          );
        }
      };

      ws.onmessage = (ev) => {
        if (localSessionRef.current) return;
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMessage;
          handleServerMessageRef.current(msg);
        } catch {
          // ignore malformed packet
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!closedByUnmount) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };
    };

    connect();
    return () => {
      closedByUnmount = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      wsRef.current?.close();
      localSessionRef.current?.dispose();
      localSessionRef.current = null;
    };
  }, []);

  // Expose live game-phase state attribute & trigger polished transition curtains
  useEffect(() => {
    const state =
      viewMode === 'cinema'
        ? 'cinema'
        : !room
        ? 'title'
        : room.phase === 'lobby'
        ? 'lobby'
        : room.phase === 'victory'
        ? 'gameover'
        : 'playing';
    document.body.dataset.state = state;

    const prev = prevViewStateRef.current;
    if (prev !== state) {
      prevViewStateRef.current = state;
      if (state === 'lobby') {
        soundEngine.play('transitionWhoosh');
        triggerScreenTransition('CHALLENGER SELECT', 'SQUAD ROOM READY', '#0ea5e9');
      } else if (state === 'playing' && (prev === 'lobby' || prev === 'title')) {
        soundEngine.play('transitionWhoosh');
        triggerScreenTransition('ENTERING ARENA', 'GET READY FOR BATTLE', '#f59e0b');
      } else if (state === 'title' && prev !== 'title') {
        soundEngine.play('transitionWhoosh');
        triggerScreenTransition('MAIN LOBBY', 'KOOPAL CLASH', '#64748b');
      } else if (state === 'cinema') {
        soundEngine.play('transitionWhoosh');
        triggerScreenTransition('CINEMA CUT', '120S SHOWCASE', '#f59e0b');
      }
    }
  }, [room, viewMode, triggerScreenTransition]);

  // Debug panel toggle (` or F9)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.code === 'Backquote' || e.code === 'F9') {
        e.preventDefault();
        setDebugOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Cutscene Master Clock (audio.currentTime -> CutsceneDirector -> game:cutsceneSync) + Music Fade Lifecycle
  useEffect(() => {
    const inCombat = room?.phase === 'combat';
    const cs = inCombat ? snapshot?.awakeningCutscene ?? null : null;
    const isCutscene = Boolean(inCombat && snapshot?.awakeningPhase === 'CUTSCENE' && cs);

    if (!inCombat) {
      if (cutsceneMusicActiveRef.current) {
        cutsceneMusicActiveRef.current = false;
        janeCutsceneAudio.rampFadeOut(0.45);
      }
      cutsceneIdRef.current = null;
      cutsceneDirectorRef.current = null;
      cutsceneFallbackStartRef.current = null;
      soundEngine.setDucking(false);
      if (orbIndicators.length > 0) {
        setOrbIndicators([]);
      }
      return;
    }

    if (snapshot?.awakeningPhase !== 'ORBS_ACTIVE' && orbIndicators.length > 0) {
      setOrbIndicators([]);
    }

    if (isCutscene && cs) {
      soundEngine.setDucking(true);
      if (cutsceneIdRef.current !== cs.id) {
        cutsceneIdRef.current = cs.id;
        cutsceneFallbackStartRef.current = performance.now();
        cutsceneMusicActiveRef.current = true;
        cutsceneDirectorRef.current = new CutsceneDirector([
          {
            id: 'panel_1',
            time: AWAKENING_CONFIG.TIMELINE.PANEL_1_AT,
            action: () => soundEngine.play('heavy'),
          },
          {
            id: 'panel_2',
            time: AWAKENING_CONFIG.TIMELINE.PANEL_2_AT,
            action: () => soundEngine.play('heavy'),
          },
          {
            id: 'clash_start',
            time: AWAKENING_CONFIG.TIMELINE.CLASH_START_AT,
            action: () => soundEngine.play('clashBoom'),
          },
          {
            id: 'music_fade',
            time: AWAKENING_CONFIG.TIMELINE.MUSIC_FADE_START,
            action: () => {
              janeCutsceneAudio.rampFadeOut(
                Math.max(
                  0.5,
                  AWAKENING_CONFIG.TIMELINE.MUSIC_FADE_END - AWAKENING_CONFIG.TIMELINE.MUSIC_FADE_START
                )
              );
              cutsceneMusicActiveRef.current = false;
            },
          },
        ]);
        void janeCutsceneAudio.start();
      }
    } else {
      soundEngine.setDucking(false);
      // If cutscene was interrupted or skipped, fade music immediately
      if (
        cutsceneIdRef.current &&
        pendingEvents.some(
          (ev) => ev.kind === 'awakeningClashEnd' && ev.callout === 'CLASH INTERRUPTED'
        )
      ) {
        cutsceneIdRef.current = null;
        cutsceneMusicActiveRef.current = false;
        janeCutsceneAudio.rampFadeOut(0.45);
      }
    }
  }, [room?.phase, snapshot?.awakeningPhase, snapshot?.awakeningCutscene, pendingEvents, orbIndicators.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      const director = cutsceneDirectorRef.current;
      if (!director && !cutsceneMusicActiveRef.current) return;

      const audioTime = janeCutsceneAudio.getCurrentTime();
      const clock =
        audioTime !== null
          ? audioTime
          : cutsceneFallbackStartRef.current !== null
          ? (performance.now() - cutsceneFallbackStartRef.current) / 1000
          : 0;

      if (director) {
        director.update(clock);
      }

      if (room?.phase === 'combat' && snapshot?.awakeningPhase === 'CUTSCENE' && snapshot.awakeningCutscene) {
        sendMsg({
          type: 'game:cutsceneSync',
          clockSec: Number(clock.toFixed(3)),
        });
      }

      if (clock >= AWAKENING_CONFIG.TIMELINE.MUSIC_FADE_END + 0.6 && cutsceneMusicActiveRef.current) {
        cutsceneMusicActiveRef.current = false;
        janeCutsceneAudio.stop();
        cutsceneDirectorRef.current = null;
      }
    }, 65);
    return () => clearInterval(interval);
  }, [room?.phase, snapshot?.awakeningPhase, snapshot?.awakeningCutscene, sendMsg]);

  // Award persistent match Coins & sync matchHistory cleanly once when a match ends in victory
  useEffect(() => {
    if (!room) {
      rewardedMatchKeyRef.current = null;
      setLastCoinReward(null);
      return;
    }
    if (room.phase !== 'victory') {
      rewardedMatchKeyRef.current = null;
      setLastCoinReward(null);
      return;
    }
    const matchKey = `${room.roomCode}:${room.roundNumber}:${room.winnerId ?? 'draw'}:${snapshot?.serverTime ?? 0}`;
    if (rewardedMatchKeyRef.current) return;
    rewardedMatchKeyRef.current = matchKey;

    const myActor = snapshot?.actors.find((a) => a.playerId === playerId);
    const won = room.winnerId === playerId;
    const reward = calculateMatchCoinReward({
      won,
      kills: myActor?.kills ?? 0,
      damageDealt: myActor?.damageDealt ?? 0,
      isTrainingMode: room.isTrainingMode,
    });
    setLastCoinReward(reward);

    if (cloudUser && myActor && !room.isTrainingMode) {
      void commitMatchResultToCloud(cloudUser, {
        matchId: `${room.roomCode}-${Date.now()}`,
        mapId: room.mapId,
        fighterId: myActor.fighterId,
        won,
        kills: myActor.kills,
        damageDealt: Math.round(myActor.damageDealt),
        coinsEarned: reward.total,
        mode: room.isSoloPractice ? 'vs-bot' : 'arena',
        timestampMs: Date.now(),
      })
        .then((nextProfile) => setCloudUser(nextProfile))
        .catch(() => {});
    } else if (reward.total > 0 && activeAccount?.username) {
      setAccountStore((prev) => {
        const res = recordMatchReward(
          prev,
          activeAccount.username,
          reward,
          won,
          myActor?.kills ?? 0
        );
        return res.store;
      });
    } else if (reward.total > 0 && guestSession && !room.isTrainingMode) {
      setGuestSession((prev) =>
        prev ? recordGuestMatchReward(prev, reward, won, myActor?.kills ?? 0) : prev
      );
    }
  }, [room, snapshot, playerId, cloudUser, activeAccount?.username, guestSession]);

  // Optional ?autostart=1 quick-entry (runs locally in memory as Guest for zero latency)
  useEffect(() => {
    if (!autostartRequested) return;
    if (!cloudUser && !activeAccount && !guestSession) {
      const guest = createGuestSession('GuestFighter');
      setGuestSession(guest);
      sessionStorage.setItem('sc3d_name', guest.displayName);
      return;
    }
    const gate = canEnterArena({
      isPlaceholderConfig,
      hasCloudUser: Boolean(cloudUser),
      hasLocalAccount: Boolean(activeAccount),
      isGuest: Boolean(guestSession),
      isBanned: Boolean(cloudUser?.banned),
      connectionStatus: 'connected',
    });
    if (!gate.allowed) return;
    if (!room && autostartPhaseRef.current === 'idle') {
      autostartPhaseRef.current = 'created';
      const session = startLocalRoomSession();
      session.send({
        type: 'room:create',
        playerName: savedName,
        isSoloPractice: true,
        isTrainingMode: false,
      });
    } else if (room && room.phase === 'lobby' && autostartPhaseRef.current === 'created') {
      autostartPhaseRef.current = 'done';
      if (autostartFighterParam) {
        sendMsg({ type: 'room:selectFighter', fighterId: autostartFighterParam });
      }
      if (autostartMapParam) {
        sendMsg({ type: 'room:selectMap', mapId: autostartMapParam });
      }
      sendMsg({ type: 'room:setReady', ready: true });
      sendMsg({ type: 'room:startNow' });
    }
  }, [
    autostartRequested,
    autostartMapParam,
    autostartFighterParam,
    room,
    savedName,
    sendMsg,
    startLocalRoomSession,
    isPlaceholderConfig,
    cloudUser,
    activeAccount,
    guestSession,
  ]);

  const handleGoogleSignIn = useCallback(async () => {
    if (isPlaceholderConfig) {
      setShowFirebaseGuide(true);
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const profile = await signInWithGoogleCloud();
      setCloudUser(profile);
      setGuestSession(null);
      saveGuestSession(null);
      sessionStorage.setItem('sc3d_name', profile.displayName.slice(0, 14));
      soundEngine.play('loginSuccess');
    } catch (err) {
      soundEngine.play('lockedError');
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }, [isPlaceholderConfig]);

  const handlePlayAsGuest = useCallback(() => {
    setAuthError(null);
    const guest = createGuestSession('Guest');
    setGuestSession(guest);
    sessionStorage.setItem('sc3d_name', guest.displayName);
  }, []);

  const handleExitGuestToLogin = useCallback(() => {
    setGuestSession(null);
    saveGuestSession(null);
  }, []);

  const handleGoogleSignOut = useCallback(async () => {
    setAuthError(null);
    await signOutCloudUser(cloudUser?.uid);
    setCloudUser(null);
    setShowAdminMonitor(false);
  }, [cloudUser?.uid]);

  const handleCreateRoom = (
    name: string,
    opts?: { isSoloPractice?: boolean; isTrainingMode?: boolean; gameMode?: GameModeId }
  ) => {
    const isLocalMode = Boolean(opts?.isSoloPractice || opts?.isTrainingMode);
    const chosenMode: GameModeId = opts?.isTrainingMode ? 'classic' : opts?.gameMode ?? selectedMode;
    const gate = canEnterArena({
      isPlaceholderConfig,
      hasCloudUser: Boolean(cloudUser),
      hasLocalAccount: Boolean(activeAccount),
      isGuest: Boolean(guestSession),
      isBanned: Boolean(cloudUser?.banned),
      connectionStatus: isLocalMode ? 'connected' : connectionStatus,
    });
    if (!gate.allowed) {
      soundEngine.play('lockedError');
      setErrorMessage(gate.reason || 'Sign in with Google or play as Guest required.');
      return;
    }
    setErrorMessage(null);
    sessionStorage.setItem('sc3d_name', name);
    if (isLocalMode) {
      const session = startLocalRoomSession();
      session.send({
        type: 'room:create',
        playerName: name,
        isSoloPractice: Boolean(opts?.isSoloPractice),
        isTrainingMode: Boolean(opts?.isTrainingMode),
        gameMode: chosenMode,
      });
      return;
    }
    if (localSessionRef.current) {
      localSessionRef.current.dispose();
      localSessionRef.current = null;
    }
    sendMsg({
      type: 'room:create',
      playerName: name,
      isSoloPractice: false,
      isTrainingMode: false,
      gameMode: chosenMode,
    });
  };

  const handleJoinRoom = (code: string, name: string) => {
    const gate = canEnterArena({
      isPlaceholderConfig,
      hasCloudUser: Boolean(cloudUser),
      hasLocalAccount: Boolean(activeAccount),
      isGuest: Boolean(guestSession),
      isBanned: Boolean(cloudUser?.banned),
      connectionStatus,
    });
    if (!gate.allowed) {
      soundEngine.play('lockedError');
      setErrorMessage(gate.reason || 'Sign in with Google or play as Guest required.');
      return;
    }
    if (localSessionRef.current) {
      localSessionRef.current.dispose();
      localSessionRef.current = null;
    }
    setErrorMessage(null);
    sessionStorage.setItem('sc3d_name', name);
    sendMsg({ type: 'room:join', roomCode: code, playerName: name });
  };

  const handleLeave = () => {
    janeCutsceneAudio.rampFadeOut(0.35);
    soundEngine.setDucking(false);
    cutsceneIdRef.current = null;
    cutsceneDirectorRef.current = null;
    cutsceneMusicActiveRef.current = false;
    sessionStorage.removeItem('sc3d_room');
    sessionStorage.removeItem('sc3d_token');
    if (localSessionRef.current) {
      localSessionRef.current.dispose();
      localSessionRef.current = null;
    } else {
      sendMsg({ type: 'room:leave' });
    }
    lastObstaclesRef.current = [];
    liveSnapshotRef.current = null;
    lastHudSnapMsRef.current = 0;
    lastCriticalSigRef.current = '';
    setRoom(null);
    setDomainCutIn(null);
    setSnapshot(null);
    setChatMessages([]);
    setChatOpen(false);
    setUnreadChatCount(0);
    setTargetId(null);
    setDamagePopups([]);
    setHitFlash(null);
    setOrbIndicators([]);
  };

  const handleToggleChat = useCallback(() => {
    setChatOpen((prev) => {
      const next = !prev;
      if (next) setUnreadChatCount(0);
      return next;
    });
  }, []);

  const handleSendChat = useCallback(
    (text: string) => {
      sendMsg({ type: 'room:chat', text });
    },
    [sendMsg]
  );

  const lastMoveNetSentRef = useRef<{ time: number; moveX: number; moveZ: number }>({
    time: 0,
    moveX: 0,
    moveZ: 0,
  });

  const handleMoveInput = useCallback(
    (moveX: number, moveZ: number) => {
      localControlRef.current.moveX = moveX;
      localControlRef.current.moveZ = moveZ;

      const now = performance.now();
      const prev = lastMoveNetSentRef.current;
      if (
        !shouldSendMovePacket({
          moveX,
          moveZ,
          prevMoveX: prev.moveX,
          prevMoveZ: prev.moveZ,
          elapsedSinceLastSendMs: now - prev.time,
          heartbeatMs: 110,
        })
      ) {
        return;
      }

      const isStopPacket = Math.abs(moveX) < 0.001 && Math.abs(moveZ) < 0.001;
      lastMoveNetSentRef.current = { time: now, moveX, moveZ };
      inputSeqRef.current += 1;
      sendMsg(
        {
          type: 'game:input',
          seq: inputSeqRef.current,
          moveX: quantizeNetFloat(moveX, 3),
          moveZ: quantizeNetFloat(moveZ, 3),
          aimYaw: quantizeNetFloat(cameraYawRef.current, 3),
          aimPitch: quantizeNetFloat(aimPitchRef.current, 3),
          targetId: targetIdRef.current,
          blockHeld: localControlRef.current.blockHeld,
        },
        isStopPacket
      );
    },
    [sendMsg]
  );

  const handleJump = useCallback(() => {
    inputSeqRef.current += 1;
    localControlRef.current.jumpTriggerSeq += 1;
    sendMsg({
      type: 'game:jump',
      seq: inputSeqRef.current,
    });
  }, [sendMsg]);

  const handleToggleFlight = useCallback(() => {
    inputSeqRef.current += 1;
    sendMsg({
      type: 'game:toggleFlight',
      seq: inputSeqRef.current,
    });
  }, [sendMsg]);

  const handleDash = useCallback(() => {
    inputSeqRef.current += 1;
    sendMsg({
      type: 'game:dash',
      seq: inputSeqRef.current,
      moveX: quantizeNetFloat(localControlRef.current.moveX, 3),
      moveZ: quantizeNetFloat(localControlRef.current.moveZ, 3),
      aimYaw: quantizeNetFloat(cameraYawRef.current, 3),
    });
  }, [sendMsg]);

  const handleGrab = useCallback(() => {
    inputSeqRef.current += 1;
    sendMsg({
      type: 'game:grab',
      seq: inputSeqRef.current,
      aimYaw: quantizeNetFloat(cameraYawRef.current, 3),
      targetId: targetIdRef.current,
    });
  }, [sendMsg]);

  const handleClashPick = useCallback(
    (clashId: string, choice: CombatMoveType) => {
      sendMsg({
        type: 'game:clashPick',
        clashId,
        choice,
      });
    },
    [sendMsg]
  );

  const handleBlockHoldChange = useCallback(
    (held: boolean) => {
      inputSeqRef.current += 1;
      localControlRef.current.blockHeld = held;
      sendMsg({
        type: 'game:input',
        seq: inputSeqRef.current,
        moveX: quantizeNetFloat(localControlRef.current.moveX, 3),
        moveZ: quantizeNetFloat(localControlRef.current.moveZ, 3),
        aimYaw: quantizeNetFloat(cameraYawRef.current, 3),
        aimPitch: quantizeNetFloat(aimPitchRef.current, 3),
        targetId: targetIdRef.current,
        blockHeld: held,
      });
    },
    [sendMsg]
  );

  const handleCastAbility = useCallback(
    (
      slot: AbilitySlot,
      holdHeavy?: boolean,
      aimPayload?: { aimX?: number; aimZ?: number; isHoldVariant?: boolean }
    ) => {
      inputSeqRef.current += 1;
      sendMsg({
        type: 'game:ability',
        seq: inputSeqRef.current,
        slot,
        holdHeavy,
        aimYaw: quantizeNetFloat(cameraYawRef.current, 3),
        aimPitch: quantizeNetFloat(aimPitchRef.current, 3),
        targetId: targetIdRef.current,
        aimX: aimPayload?.aimX !== undefined ? quantizeNetFloat(aimPayload.aimX, 2) : undefined,
        aimZ: aimPayload?.aimZ !== undefined ? quantizeNetFloat(aimPayload.aimZ, 2) : undefined,
        isHoldVariant: aimPayload?.isHoldVariant,
      });
    },
    [sendMsg]
  );

  const handleAimUpdate = useCallback(
    (aimX: number, aimZ: number) => {
      sendMsg(
        {
          type: 'game:aimUpdate',
          aimX: quantizeNetFloat(aimX, 2),
          aimZ: quantizeNetFloat(aimZ, 2),
        },
        false
      );
    },
    [sendMsg]
  );

  const handleCanvasAttack = useCallback(
    (shiftHeld: boolean) => {
      const cw = cursorWorldRef.current;
      if (cw.active) {
        handleCastAbility(0, shiftHeld, { aimX: cw.x, aimZ: cw.z });
      } else {
        handleCastAbility(0, shiftHeld);
      }
    },
    [handleCastAbility]
  );

  const handleCancelAim = useCallback(() => {
    setCancelAimTriggerSeq((v) => v + 1);
  }, []);

  const handleToggleLockOn = useCallback(() => {
    setLockOnEnabled((v) => !v);
  }, []);

  const handleDomainActivate = useCallback(() => {
    sendMsg({ type: 'game:domainActivate' });
  }, [sendMsg]);

  const handleDomainClashMash = useCallback(() => {
    sendMsg({ type: 'game:domainClashMash' });
  }, [sendMsg]);

  const handleUseItem = useCallback(
    (aimX?: number, aimZ?: number) => {
      inputSeqRef.current += 1;
      sendMsg({
        type: 'game:useItem',
        seq: inputSeqRef.current,
        aimX: aimX !== undefined ? quantizeNetFloat(aimX, 2) : undefined,
        aimZ: aimZ !== undefined ? quantizeNetFloat(aimZ, 2) : undefined,
      });
    },
    [sendMsg]
  );

  const handleNpcDialogue = useCallback(
    (choice: 'fight' | 'bye') => {
      sendMsg({ type: 'game:npcDialogue', choice });
    },
    [sendMsg]
  );

  const handleOpenAdminMonitor = useCallback(() => {
    setShowAdminMonitor(true);
  }, []);

  const handleRematch = useCallback(() => {
    sendMsg({ type: 'room:rematch' });
  }, [sendMsg]);

  const handleTrainingConfig = useCallback(
    (cfg: Partial<TrainingConfig> & { resetDummyDps?: boolean }) => {
      sendMsg({
        type: 'game:trainingConfig',
        ...cfg,
      });
    },
    [sendMsg]
  );

  const handleAwakeningMash = useCallback(() => {
    soundEngine.play('mashTick');
    sendMsg({ type: 'game:awakeningMash' });
  }, [sendMsg]);

  const handleAwakeningSkip = useCallback(() => {
    const clashAt = AWAKENING_CONFIG.TIMELINE.CLASH_START_AT;
    janeCutsceneAudio.seekTo(clashAt);
    cutsceneFallbackStartRef.current = performance.now() - clashAt * 1000;
    soundEngine.play('clashBoom');
    sendMsg({ type: 'game:awakeningSkip' });
  }, [sendMsg]);

  const handleAwakeningDebug = useCallback(
    (action: AwakeningDebugAction) => {
      sendMsg({ type: 'game:debug', action });
    },
    [sendMsg]
  );

  const handleConsumeEvents = useCallback(() => {
    setPendingEvents([]);
  }, []);

  const handleSpawnDamagePopup = useCallback((popup: DamagePopup) => {
    setDamagePopups((prev) => [...prev.slice(-9), popup]);
    setTimeout(() => {
      setDamagePopups((prev) => prev.filter((p) => p.id !== popup.id));
    }, 560);
  }, []);

  const handleHitFlash = useCallback((flash: HitFlashInfo) => {
    setHitFlash(flash);
    setTimeout(() => {
      setHitFlash((cur) => (cur?.id === flash.id ? null : cur));
    }, 340);
  }, []);

  const handleScreenTint = useCallback((tint: ScreenTintInfo) => {
    setScreenTint(tint);
    setTimeout(() => {
      setScreenTint((cur) => (cur?.id === tint.id ? null : cur));
    }, tint.durationMs);
  }, []);

  const handleLoginAccount = useCallback((username: string) => {
    setAccountStore((prev) => {
      const res = loginOrCreateAccount(prev, username);
      if (res) {
        sessionStorage.setItem('sc3d_name', res.account.username);
        return res.store;
      }
      return prev;
    });
  }, []);

  const handleLogoutAccount = useCallback(() => {
    setAccountStore((prev) => logoutAccount(prev));
    setSelectedSkin('classic');
  }, []);

  // Ensure selected skin stays unlocked for the active fighter/account
  useEffect(() => {
    if (!isSkinUnlocked(unlockedSkins, myRoomFighterId, selectedSkin)) {
      setSelectedSkin('classic');
      if (room && room.phase === 'lobby') {
        sendMsg({ type: 'room:selectSkin', skinId: 'classic' });
      }
    }
  }, [unlockedSkins, myRoomFighterId, selectedSkin, room, sendMsg]);

  const handleOpenShop = useCallback((fighterId?: FighterId, skinId?: SkinId) => {
    setShopModal({ open: true, fighterId, skinId });
  }, []);

  const handlePurchaseSkin = useCallback(
    async (fighterId: FighterId, skinId: SkinId): Promise<{ ok: boolean; error?: string }> => {
      const check = purchaseSkin({
        coins: activeCoins,
        unlockedSkins,
        fighterId,
        skinId,
      });
      if (!check.ok) {
        const msg =
          check.reason === 'already_unlocked'
            ? 'Skin is already unlocked.'
            : `Need ${check.cost} Coins to buy this skin.`;
        return { ok: false, error: msg };
      }

      if (cloudUser) {
        try {
          const next = await purchaseSkinInCloud(cloudUser, check.unlockKey, check.cost);
          setCloudUser(next);
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Unable to save purchase.',
          };
        }
      } else if (activeAccount) {
        let updated = false;
        setAccountStore((prev) => {
          const res = unlockAccountSkin(
            prev,
            activeAccount.username,
            check.unlockKey,
            check.cost
          );
          if (res.ok) {
            updated = true;
            return res.store;
          }
          return prev;
        });
        if (!updated && check.cost > activeAccount.coins) {
          return { ok: false, error: `Need ${check.cost} Coins.` };
        }
      } else if (guestSession) {
        const res = unlockGuestSkin(guestSession, check.unlockKey, check.cost);
        if (!res.ok) {
          return { ok: false, error: `Need ${check.cost} Coins.` };
        }
        setGuestSession(res.guest);
      } else {
        return { ok: false, error: 'Sign in first to purchase skins.' };
      }

      setSelectedSkin(skinId);
      if (room && room.phase === 'lobby') {
        if (fighterId !== myRoomFighterId) {
          sendMsg({ type: 'room:selectFighter', fighterId });
        }
        sendMsg({ type: 'room:selectSkin', skinId });
      }
      return { ok: true };
    },
    [activeCoins, unlockedSkins, cloudUser, activeAccount, guestSession, room, myRoomFighterId, sendMsg]
  );

  const handleEquipSkin = useCallback(
    (fighterId: FighterId, skinId: SkinId) => {
      if (!isSkinUnlocked(unlockedSkins, fighterId, skinId)) {
        return;
      }
      setSelectedSkin(skinId);
      if (room && room.phase === 'lobby') {
        if (fighterId !== myRoomFighterId) {
          sendMsg({ type: 'room:selectFighter', fighterId });
        }
        sendMsg({ type: 'room:selectSkin', skinId });
      }
    },
    [unlockedSkins, room, myRoomFighterId, sendMsg]
  );

  const isAuthenticatedOrGuest = Boolean(cloudUser || activeAccount || guestSession);

  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-slate-50 text-slate-900">
      {viewMode === 'cinema' ? (
        <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode('game')}
            className="fixed top-3 left-3 z-50 px-3.5 py-2 rounded-xl bg-white/95 hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-900 shadow-lg cursor-pointer"
          >
            ← Back to Multiplayer Game
          </button>
          <iframe
            src="/squad_clash_3d_golden_meadow_edition.html"
            title="KOOPAL CLASH Cinema Cut"
            className="w-full h-full border-0 block"
            allow="autoplay; fullscreen"
          />
        </div>
      ) : !room && !isAuthenticatedOrGuest && !autostartRequested ? (
        <LoginScreen
          authLoading={authLoading}
          authError={authError}
          connectionStatus={connectionStatus}
          onGoogleSignIn={handleGoogleSignIn}
          onPlayAsGuest={handlePlayAsGuest}
        />
      ) : !room ? (
        <LobbyLanding
          initialRoomCode={initialRoomCode}
          initialName={
            cloudUser?.displayName || activeAccount?.username || guestSession?.displayName || savedName
          }
          account={activeAccount}
          cloudUser={cloudUser}
          guestSession={guestSession}
          authLoading={authLoading}
          authError={authError}
          isAdmin={isAdmin}
          isPlaceholderConfig={isPlaceholderConfig}
          connectionStatus={connectionStatus}
          pingMs={pingMs}
          errorMessage={errorMessage}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onExitGuestToLogin={handleExitGuestToLogin}
          onOpenAdminMonitor={() => setShowAdminMonitor(true)}
          onOpenFirebaseGuide={() => setShowFirebaseGuide(true)}
          onLoginAccount={handleLoginAccount}
          onLogoutAccount={handleLogoutAccount}
          selectedMode={selectedMode}
          onSelectMode={setSelectedMode}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onOpenCinemaCut={() => setViewMode('cinema')}
          onOpenShop={() => handleOpenShop(myRoomFighterId, selectedSkin)}
        />
      ) : room.phase === 'lobby' ? (
        <TekkenPickScreen
          room={room}
          playerId={playerId}
          account={activeAccount}
          cloudUser={cloudUser}
          guestSession={guestSession}
          isAdmin={isAdmin}
          pingMs={pingMs}
          errorMessage={errorMessage}
          selectedSkin={selectedSkin}
          unlockedSkins={unlockedSkins}
          chatMessages={chatMessages}
          unreadChatCount={unreadChatCount}
          chatOpen={chatOpen}
          onToggleChat={handleToggleChat}
          onSendChat={handleSendChat}
          onSelectFighter={(fighterId: FighterId) => {
            sendMsg({ type: 'room:selectFighter', fighterId });
            if (!isSkinUnlocked(unlockedSkins, fighterId, selectedSkin)) {
              setSelectedSkin('classic');
              sendMsg({ type: 'room:selectSkin', skinId: 'classic' });
            }
          }}
          onSelectSkin={(skinId: SkinId) => {
            if (!isSkinUnlocked(unlockedSkins, myRoomFighterId, skinId)) {
              handleOpenShop(myRoomFighterId, skinId);
              return;
            }
            setSelectedSkin(skinId);
            sendMsg({ type: 'room:selectSkin', skinId });
          }}
          onSelectMap={(mapId: MapId) => sendMsg({ type: 'room:selectMap', mapId })}
          onSelectMode={(gameMode: GameModeId) => sendMsg({ type: 'room:selectMode', gameMode })}
          onToggleReady={(ready: boolean) => sendMsg({ type: 'room:setReady', ready })}
          onStartNow={() => sendMsg({ type: 'room:startNow' })}
          onOpenShop={handleOpenShop}
          onOpenAdminMonitor={() => setShowAdminMonitor(true)}
          onGoogleSignIn={handleGoogleSignIn}
          onLeave={handleLeave}
        />
      ) : (
        <div className="fixed inset-0 w-full h-[100dvh] overflow-hidden animate-fade-in">
          <ArenaViewport
            mapId={room.mapId}
            roomPhase={room.phase}
            roomCountdown={room.countdown}
            playerId={playerId}
            targetId={targetId}
            lockOnEnabled={lockOnEnabled}
            snapshot={snapshot}
            liveSnapshotRef={liveSnapshotRef}
            pendingEvents={pendingEvents}
            onConsumeEvents={handleConsumeEvents}
            cameraYawRef={cameraYawRef}
            aimPitchRef={aimPitchRef}
            clockOffsetMsRef={clockOffsetMsRef}
            jitterMsRef={jitterMsRef}
            localControlRef={localControlRef}
            aimPreviewRef={aimPreviewRef}
            cursorWorldRef={cursorWorldRef}
            isLocalMatch={isLocalMatch}
            onPerfStats={handlePerfStats}
            onCanvasAttack={handleCanvasAttack}
            onCancelAim={handleCancelAim}
            onSpawnDamagePopup={handleSpawnDamagePopup}
            onHitFlash={handleHitFlash}
            onScreenTint={handleScreenTint}
            onOrbIndicators={setOrbIndicators}
          />
          {screenTint && (
            <div
              key={screenTint.id}
              aria-hidden="true"
              className="fixed inset-0 z-20 pointer-events-none animate-screen-tint"
              style={{
                background: SCREEN_TINT_STYLES[screenTint.kind],
                ['--tint-dur' as string]: `${screenTint.durationMs}ms`,
              }}
            />
          )}
          <MobileCombatHUD
            room={room}
            playerId={playerId}
            account={activeAccount}
            cloudUser={cloudUser}
            isAdmin={isAdmin}
            lastCoinReward={lastCoinReward}
            pingMs={pingMs}
            perfStatsRef={perfStatsRef}
            pingMsRef={pingMsRef}
            subscribePerfStats={subscribePerfStats}
            isLocalMatch={isLocalMatch}
            snapshot={snapshot}
            targetId={targetId}
            lockOnEnabled={lockOnEnabled}
            cameraYawRef={cameraYawRef}
            aimPreviewRef={aimPreviewRef}
            cursorWorldRef={cursorWorldRef}
            cancelAimTriggerSeq={cancelAimTriggerSeq}
            damagePopups={damagePopups}
            hitFlash={hitFlash}
            orbIndicators={orbIndicators}
            chatMessages={chatMessages}
            unreadChatCount={unreadChatCount}
            chatOpen={chatOpen}
            onToggleChat={handleToggleChat}
            onSendChat={handleSendChat}
            onSelectTarget={setTargetId}
            onToggleLockOn={handleToggleLockOn}
            onMoveInput={handleMoveInput}
            onJump={handleJump}
            onToggleFlight={handleToggleFlight}
            onDash={handleDash}
            onGrab={handleGrab}
            onDomainActivate={handleDomainActivate}
            onDomainClashMash={handleDomainClashMash}
            onClashPick={handleClashPick}
            onBlockHoldChange={handleBlockHoldChange}
            onCastAbility={handleCastAbility}
            onUseItem={handleUseItem}
            onNpcDialogue={handleNpcDialogue}
            onAimUpdate={handleAimUpdate}
            onTrainingConfig={handleTrainingConfig}
            onDebugAction={handleAwakeningDebug}
            onOpenAdminMonitor={handleOpenAdminMonitor}
            onRematch={handleRematch}
            onLeave={handleLeave}
          />
          <DomainCutInOverlay banner={domainCutIn} />
          {room.phase === 'combat' &&
            snapshot?.awakeningPhase === 'CUTSCENE' &&
            snapshot.awakeningCutscene && (
              <CutsceneOverlay
                cutscene={snapshot.awakeningCutscene}
                playerId={playerId}
                onMash={handleAwakeningMash}
                onSkip={handleAwakeningSkip}
              />
            )}
          {debugOpen && room.phase === 'combat' && snapshot && (
            <div className="relative z-[60]">
              <AwakeningDebugPanel
                awakeningPhase={snapshot.awakeningPhase}
                matchTime={snapshot.matchTime}
                cutsceneClock={snapshot.awakeningCutscene?.clockSec ?? null}
                onAction={handleAwakeningDebug}
              />
            </div>
          )}
        </div>
      )}

      {/* Non-blocking Screen Transition Curtain Overlay */}
      <ScreenTransition
        transitionKey={screenTrans.key}
        label={screenTrans.label}
        sublabel={screenTrans.sublabel}
        accentHex={screenTrans.accentHex}
      />

      {/* Modals: Admin Monitor (strictly sullenshades@gmail.com) & Firebase Setup Guide */}
      <AdminMonitorModal
        open={showAdminMonitor}
        currentUserEmail={cloudUser?.email}
        onClose={() => setShowAdminMonitor(false)}
      />
      <FirebaseSetupModal
        open={showFirebaseGuide}
        onClose={() => setShowFirebaseGuide(false)}
        onContinueLocalFallback={() => {
          handleLoginAccount('GuestFighter');
        }}
      />
      <SkinShopModal
        open={shopModal.open}
        coins={activeCoins}
        unlockedSkins={unlockedSkins}
        equippedFighterId={myRoomFighterId}
        equippedSkinId={selectedSkin}
        initialFighterId={shopModal.fighterId}
        initialSkinId={shopModal.skinId}
        onPurchase={handlePurchaseSkin}
        onEquip={handleEquipSkin}
        onClose={() => setShopModal({ open: false })}
      />
      {(!room || room.phase === 'lobby') && (
        <div
          data-testid="app-version"
          className="fixed bottom-1.5 left-2 z-40 pointer-events-none select-none px-2 py-0.5 rounded bg-slate-950/65 border border-white/15 text-[10px] font-bold tracking-wider text-slate-200/90 shadow-sm"
        >
          v{APP_VERSION}
        </div>
      )}
    </main>
  );
}
