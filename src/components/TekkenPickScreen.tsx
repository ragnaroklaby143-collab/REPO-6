import React, { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  Eye,
  Flame,
  Lock,
  LogOut,
  MapPin,
  Play,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Swords,
  X,
  Zap,
} from 'lucide-react';
import {
  FIGHTER_BY_ID,
  FIGHTERS,
  FighterId,
  GAME_MODES,
  GAME_MODE_BY_ID,
  GameModeId,
  MAPS,
  MapId,
  RoomChatMessage,
  RoomState,
  SKIN_LABELS,
  SKIN_ORDER,
  SkinId,
  getFighterSkinMeta,
} from '../shared/gameData.ts';
import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';
import { DOMAIN_CONFIGS } from '../game/domainLogic.ts';
import { TekkenStagePreview } from './TekkenStagePreview.tsx';
import { SkillDemoPreview, SkillDemoTab } from './SkillDemoPreview.tsx';
import { FullscreenControls } from './FullscreenControls.tsx';
import { RoomChatBox } from './RoomChatBox.tsx';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { soundEngine } from '../game/soundEngine.ts';
import type { GuestSession, UserAccount } from '../game/accountStore.ts';
import type { CloudUserProfile } from '../game/firebaseUsers.ts';
import { getSkinPrice, isSkinUnlocked } from '../game/shopLogic.ts';

const LIGHT_TEXT_BY_FIGHTER: Record<FighterId, string> = {
  jm: '#b45309',
  marjohn: '#0369a1',
  prime: '#be123c',
  damen: '#b45309',
  khen: '#7e22ce',
};

interface TekkenPickScreenProps {
  room: RoomState;
  playerId: string;
  account: UserAccount | null;
  cloudUser: CloudUserProfile | null;
  guestSession?: GuestSession | null;
  isAdmin: boolean;
  pingMs: number | null;
  errorMessage: string | null;
  selectedSkin: SkinId;
  unlockedSkins: string[];
  chatMessages: RoomChatMessage[];
  unreadChatCount: number;
  chatOpen: boolean;
  onToggleChat: () => void;
  onSendChat: (text: string) => void;
  onSelectFighter: (fighterId: FighterId) => void;
  onSelectSkin: (skinId: SkinId) => void;
  onSelectMap: (mapId: MapId) => void;
  onSelectMode?: (gameMode: GameModeId) => void;
  onToggleReady: (ready: boolean) => void;
  onStartNow: () => void;
  onOpenShop: (initialFighterId?: FighterId, initialSkinId?: SkinId) => void;
  onOpenAdminMonitor: () => void;
  onGoogleSignIn?: () => void;
  onLeave: () => void;
}

export const TekkenPickScreen: React.FC<TekkenPickScreenProps> = ({
  room,
  playerId,
  account,
  cloudUser,
  guestSession = null,
  isAdmin,
  pingMs,
  errorMessage,
  selectedSkin,
  unlockedSkins,
  chatMessages,
  unreadChatCount,
  chatOpen,
  onToggleChat,
  onSendChat,
  onSelectFighter,
  onSelectSkin,
  onSelectMap,
  onSelectMode,
  onToggleReady,
  onStartNow,
  onOpenShop,
  onOpenAdminMonitor,
  onGoogleSignIn,
  onLeave,
}) => {
  const [copied, setCopied] = useState(false);
  const [skillsDrawerOpen, setSkillsDrawerOpen] = useState(false);
  const [demoTab, setDemoTab] = useState<SkillDemoTab>('m1');
  const { enterFullscreen } = usePWAInstall();

  const me = room.players.find((p) => p.playerId === playerId);
  const myFighterId: FighterId = me?.fighterId ?? 'jm';
  const candidateSkin: SkinId = selectedSkin ?? me?.skinId ?? 'classic';
  const mySkinId: SkinId = isSkinUnlocked(unlockedSkins, myFighterId, candidateSkin)
    ? candidateSkin
    : 'classic';
  const mySpec = FIGHTER_BY_ID[myFighterId];
  const myInk = LIGHT_TEXT_BY_FIGHTER[myFighterId];
  const mySkinMeta = getFighterSkinMeta(myFighterId, mySkinId);
  const isHost = room.hostId === playerId;
  const canStart = room.isSoloPractice || room.isTrainingMode || room.players.length >= 2;
  const displayCoins = cloudUser?.coins ?? account?.coins ?? guestSession?.coins ?? null;

  const cycleSkin = (dir: -1 | 1) => {
    soundEngine.unlock();
    const unlockedForFighter = SKIN_ORDER.filter((sid) =>
      isSkinUnlocked(unlockedSkins, myFighterId, sid)
    );
    if (unlockedForFighter.length <= 1) {
      soundEngine.play('uiClick');
      onOpenShop(myFighterId, 'ascended');
      return;
    }
    soundEngine.play('uiSelect');
    const idx = Math.max(0, unlockedForFighter.indexOf(mySkinId));
    const nextIdx = (idx + dir + unlockedForFighter.length) % unlockedForFighter.length;
    onSelectSkin(unlockedForFighter[nextIdx]);
  };

  const copyInvite = async () => {
    soundEngine.unlock();
    soundEngine.play('uiClick');
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', room.roomCode);
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const triggerMobileFs = () => {
    if (window.matchMedia('(pointer: coarse)').matches) {
      void enterFullscreen(true);
    }
  };

  return (
    <div className="h-[100dvh] w-full max-w-[100dvw] bg-slate-50 text-slate-900 flex flex-col justify-between px-2.5 pt-2 pb-10 sm:px-5 sm:py-3 overflow-y-auto lg:overflow-hidden overflow-x-hidden overscroll-y-contain safe-area-pad animate-screen-enter">
      {/* Top Bar: Squad Clash Room Header & P1-P5 Slots */}
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-1.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {room.isTrainingMode
                  ? 'Training Area'
                  : room.isSoloPractice
                  ? 'Vs. Bot Arena'
                  : 'Squad Room Code'}
              </div>
              <div className="font-mono-num text-lg sm:text-xl font-bold tracking-widest text-amber-700 leading-none">
                {room.roomCode}
              </div>
            </div>

            {!room.isSoloPractice && !room.isTrainingMode && (
              <button
                type="button"
                onClick={copyInvite}
                className="ui-interactive min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[11px] sm:text-xs font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-sky-600" />}
                <span>{copied ? 'Copied' : 'Invite Link'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {cloudUser && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200">
                {cloudUser.photoURL ? (
                  <img
                    src={cloudUser.photoURL}
                    alt={cloudUser.displayName}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : null}
                <span className="text-[11px] font-bold text-slate-900 max-w-[100px] truncate">
                  {cloudUser.displayName}
                </span>
              </div>
            )}
            {displayCoins !== null && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-mono-num text-[11px] font-bold">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span>{!cloudUser && guestSession ? `GUEST (${displayCoins} COINS)` : displayCoins}</span>
              </div>
            )}
            {!cloudUser && guestSession && onGoogleSignIn && (
              <button
                type="button"
                data-testid="pick-link-google-btn"
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.play('uiSelect');
                  onGoogleSignIn();
                }}
                className="ui-interactive min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-950 text-[11px] font-display font-bold flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <span>Link Google Account (+1,000 Coins)</span>
              </button>
            )}
            <button
              type="button"
              data-testid="open-shop-btn"
              onClick={() => {
                soundEngine.unlock();
                soundEngine.play('uiSelect');
                onOpenShop(myFighterId, mySkinId);
              }}
              className="ui-interactive min-h-[34px] px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 border border-amber-500 text-slate-950 text-[11px] font-display font-bold flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Item Shop</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                data-testid="admin-monitor-btn"
                onClick={onOpenAdminMonitor}
                className="ui-interactive min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 text-[11px] font-display font-bold flex items-center gap-1 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Admin Monitor</span>
              </button>
            )}
            {pingMs !== null && (
              <span className="hidden sm:inline text-[11px] font-mono-num text-emerald-700 font-semibold">
                {pingMs} ms
              </span>
            )}
            <span className="text-[11px] sm:text-xs text-slate-600 font-mono-num">
              {room.isTrainingMode
                ? 'Free Practice · Dummy & Zero CD Toggles'
                : `${GAME_MODE_BY_ID[room.gameMode]?.name ?? 'Classic Arena'} · ${
                    room.isSoloPractice ? 'Vs. Bot' : `${room.players.length}/5 Joined`
                  }`}
            </span>
            <RoomChatBox
              messages={chatMessages}
              playerId={playerId}
              unreadCount={unreadChatCount}
              isOpen={chatOpen}
              onToggleOpen={onToggleChat}
              onSendMessage={onSendChat}
            />
            <FullscreenControls compact lockLandscape />
            <button
              type="button"
              onClick={() => {
                soundEngine.unlock();
                soundEngine.play('transitionWhoosh');
                onLeave();
              }}
              className="ui-interactive min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 border border-slate-300 hover:border-rose-300 text-xs font-semibold text-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>

        {/* Tekken-style P1–P5 Player Slots Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
          {[0, 1, 2, 3, 4].map((slotIdx) => {
            const p = room.players.find((pl) => pl.slotIndex === slotIdx);
            const fSpec = p ? FIGHTER_BY_ID[p.fighterId] : null;
            const fInk = p ? LIGHT_TEXT_BY_FIGHTER[p.fighterId] : '#475569';
            const isSelf = p?.playerId === playerId;
            return (
              <div
                key={slotIdx}
                className={`rounded-xl px-2.5 py-1.5 border transition shadow-xs ${
                  p
                    ? isSelf
                      ? 'bg-white border-amber-500 ring-1 ring-amber-300'
                      : 'bg-white border-slate-200'
                    : 'bg-slate-100/80 border-slate-200/80 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] gap-1">
                  <span className="font-mono-num font-bold text-slate-500">
                    P{slotIdx + 1} {isSelf ? '(You)' : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    {p?.team && (room.gameMode === 'squad_clash' || room.gameMode === 'raid_boss') && (
                      <span
                        className={`px-1 rounded text-[8px] font-display font-bold uppercase ${
                          p.team === 'boss' || p.team === 'beta'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-sky-100 text-sky-800 border border-sky-300'
                        }`}
                      >
                        {p.team}
                      </span>
                    )}
                    {p ? (
                      <span className={`font-semibold ${p.ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {p.ready ? 'LOCKED' : 'SELECTING'}
                      </span>
                    ) : (
                      <span className="text-slate-400">OPEN</span>
                    )}
                  </div>
                </div>
                {p && fSpec ? (
                  <div className="mt-0.5 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-900 truncate">{p.name}</span>
                    <span className="text-[10px] font-display font-bold truncate" style={{ color: fInk }}>
                      {fSpec.name}
                    </span>
                  </div>
                ) : (
                  <div className="mt-0.5 text-[10px] text-slate-400 truncate">Waiting for friend...</div>
                )}
              </div>
            );
          })}
        </div>

        {!room.isTrainingMode && onSelectMode && (
          <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Swords className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] font-display font-bold uppercase tracking-wider text-slate-700">
                Mode:
              </span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">
                {GAME_MODE_BY_ID[room.gameMode]?.description}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {GAME_MODES.map((gm) => {
                const active = room.gameMode === gm.id;
                return (
                  <button
                    key={gm.id}
                    type="button"
                    data-testid={`pick-mode-${gm.id}`}
                    disabled={!isHost}
                    onClick={() => {
                      soundEngine.unlock();
                      soundEngine.play('uiSelect');
                      onSelectMode(gm.id);
                    }}
                    className={`px-2 py-0.5 rounded-lg border text-[10px] font-display font-bold uppercase transition ${
                      active
                        ? 'bg-slate-900 text-amber-300 border-slate-950'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    } ${isHost ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
                  >
                    {gm.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-xl bg-rose-50 border border-rose-300 px-3.5 py-2 text-xs text-rose-800 font-medium">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Center Stage: Compact 3D Fighter Spotlight + Compact Kit Trigger & Multi-Biome Stage Picker */}
      <div className="w-full max-w-7xl mx-auto my-1.5 grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch flex-1 min-h-0">
        {/* 3D Spotlight Pedestal + Visible Skin Switcher Box */}
        <div
          className="lg:col-span-5 relative rounded-2xl bg-white border overflow-hidden flex flex-col justify-between transition-colors duration-300 shadow-lg min-h-0"
          style={{
            borderColor: `${mySpec.color}88`,
            backgroundImage: `radial-gradient(circle at 50% 44%, ${mySpec.color}20, rgba(248, 250, 252, 0.96) 72%)`,
          }}
        >
          {/* Top Header + HP/STM + Skin Switcher Box */}
          <div className="relative z-10 px-3 pt-2 pb-1 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div
                  className="text-[10px] font-bold uppercase tracking-wider truncate"
                  style={{ color: myInk }}
                >
                  {mySpec.title} · {mySpec.m1Combo.rangeIdentity}
                </div>
                <h2
                  className="font-display font-bold text-slate-950 tracking-tight leading-none mt-0.5"
                  style={{ fontSize: 'clamp(1.35rem, 2.4vw, 2.15rem)' }}
                >
                  {mySpec.name}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  data-testid="skills-preview-btn"
                  onClick={() => {
                    soundEngine.unlock();
                    soundEngine.play('uiSelect');
                    setSkillsDrawerOpen(true);
                  }}
                  className="ui-interactive btn-shimmer min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-950 text-[11px] font-display font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>SKILLS &amp; PREVIEW</span>
                </button>
                <div className="text-right text-[10px] font-mono-num font-bold text-slate-800 bg-white/95 px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs">
                  <div>HP {mySpec.maxHp}</div>
                  <div className="text-amber-700">STM {mySpec.maxStamina}</div>
                </div>
              </div>
            </div>

            {/* Skin Switcher Box */}
            <div
              data-testid="skin-switcher"
              className="rounded-xl bg-white/95 border border-slate-200 px-2.5 py-1.5 shadow-sm transition-all duration-300"
              style={{
                borderColor: `${mySkinMeta.accentColor}99`,
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300"
                      style={{ backgroundColor: mySkinMeta.accentColor }}
                    />
                    <span className="font-display font-bold text-xs text-slate-900 truncate">
                      {mySkinMeta.name}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">{mySkinMeta.tagline}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label="Previous Skin"
                    onClick={() => cycleSkin(-1)}
                    className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-800 cursor-pointer transition active:scale-90"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next Skin"
                    onClick={() => cycleSkin(1)}
                    className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-800 cursor-pointer transition active:scale-90"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {SKIN_ORDER.map((sid) => {
                  const unlocked = isSkinUnlocked(unlockedSkins, myFighterId, sid);
                  const active = mySkinId === sid && unlocked;
                  const price = getSkinPrice(sid);
                  const meta = getFighterSkinMeta(myFighterId, sid);
                  return (
                    <button
                      key={sid}
                      type="button"
                      data-skin-id={sid}
                      data-skin-locked={unlocked ? 'false' : 'true'}
                      onClick={() => {
                        soundEngine.unlock();
                        if (!unlocked) {
                          soundEngine.play('lockedError');
                          onOpenShop(myFighterId, sid);
                          return;
                        }
                        soundEngine.play('uiSelect');
                        onSelectSkin(sid);
                      }}
                      className={`min-h-[28px] px-1.5 py-0.5 rounded-lg text-[10px] font-display font-bold uppercase tracking-wide border transition cursor-pointer flex items-center justify-center gap-1 truncate ${
                        active
                          ? 'text-slate-950 shadow-sm scale-[1.02]'
                          : unlocked
                          ? 'bg-slate-100 border-slate-200 text-slate-700 hover:border-slate-400'
                          : 'bg-slate-100/80 border-slate-200 text-slate-500 hover:border-amber-400 hover:text-amber-900'
                      }`}
                      style={
                        active
                          ? {
                              backgroundColor: meta.accentColor,
                              borderColor: '#0f172a',
                            }
                          : undefined
                      }
                    >
                      {!unlocked && <Lock className="w-2.5 h-2.5 shrink-0 text-amber-600" />}
                      <span className="truncate">{SKIN_LABELS[sid]}</span>
                      {!unlocked && (
                        <span className="font-mono-num text-[9px] text-amber-700 shrink-0">
                          {price}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="w-full h-[155px] sm:h-[185px] lg:flex-1 lg:min-h-[160px] relative">
            <TekkenStagePreview fighterId={myFighterId} skinId={mySkinId} />
          </div>

          {/* Animated Power / Speed / Defense Stat Bars */}
          <div className="relative z-10 px-3 py-2 bg-white/95 border-t border-slate-200 grid grid-cols-3 gap-2 text-[10px]">
            {[
              { label: 'Power', val: mySpec.stats.power, color: '#e11d48' },
              { label: 'Speed', val: mySpec.stats.speed, color: '#0284c7' },
              { label: 'Defense', val: mySpec.stats.defense, color: '#d97706' },
            ].map((st) => (
              <div key={st.label}>
                <div className="flex justify-between text-slate-600 mb-0.5">
                  <span className="font-semibold uppercase tracking-wide text-[9px]">{st.label}</span>
                  <span className="font-mono-num font-bold text-slate-950">{st.val}/10</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden relative">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out relative"
                    style={{
                      width: `${st.val * 10}%`,
                      backgroundColor: st.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Clean Compact Combat Kit Summary + Interactive Multi-Biome Stage Selector */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-2 min-h-0">
          {/* Compact Fighter Kit Bar (Full details + Live 3D Simulation inside SKILLS & PREVIEW) */}
          <div className="rounded-2xl bg-white border border-slate-200 p-3 shadow-xs flex flex-col justify-between gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  <Flame className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Passive · {mySpec.passive.name}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-purple-700 truncate">
                    Domain: {DOMAIN_CONFIGS[myFighterId].domainName}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-700 mt-0.5 line-clamp-2">
                  {mySpec.passive.shortDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.play('uiSelect');
                  setDemoTab('domain');
                  setSkillsDrawerOpen(true);
                }}
                className="ui-interactive px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 border border-amber-500 text-slate-950 font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
              >
                <Play className="w-3.5 h-3.5" />
                <span>3D MOVE DEMO</span>
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(
                [
                  { tab: 'm1', key: 'M1', name: mySpec.m1Combo.stepNames[0] },
                  { tab: 'skill1', key: '1', name: mySpec.abilities[2].name },
                  { tab: 'skill2', key: '2', name: mySpec.abilities[3].name },
                  { tab: 'ultimate', key: '3', name: mySpec.abilities[4].name },
                  { tab: 'awakening', key: 'ORB', name: AWAKENING_CONFIG.AWAKENED_KITS[myFighterId].awakenedTitle },
                  { tab: 'domain', key: 'V', name: DOMAIN_CONFIGS[myFighterId].domainName },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.tab}
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    soundEngine.play('uiClick');
                    setDemoTab(chip.tab);
                    setSkillsDrawerOpen(true);
                  }}
                  className="ui-interactive rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-400 px-2 py-1.5 text-left cursor-pointer transition"
                >
                  <div className="flex items-center justify-between text-[9px] font-mono-num font-bold">
                    <span className="px-1 rounded bg-slate-900 text-white">{chip.key}</span>
                    <span style={{ color: myInk }}>DEMO →</span>
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-display font-bold text-slate-900 truncate mt-1">
                    {chip.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Stage Selector (4 Living Multi-Biome Arenas) */}
          <div className="rounded-2xl bg-white border border-slate-200 p-3 shadow-xs flex-1 flex flex-col justify-between min-h-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-amber-600" />
                <h3 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-900">
                  Select Living Arena (Water · Lava · Grass Stealth · Enterable Buildings)
                </h3>
              </div>
              <span className="text-[10px] text-slate-500 font-medium shrink-0">
                {isHost ? 'Host picks arena' : 'Synced to Host'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 flex-1">
              {MAPS.map((m) => {
                const selected = room.mapId === m.id;
                const biomeTag =
                  m.id === 'shibuya'
                    ? 'Bullet Train · Flooded Gutters · Steam Vents · 3 Enterable Shops'
                    : m.id === 'obsidian'
                    ? 'Magma Eruptions · Lava Rivers · Ash Vents · 2 Basalt Forges'
                    : m.id === 'temple'
                    ? 'Thunder Squalls · Koi Ponds & Bridges · Bamboo Stealth · 2 Dojos'
                    : 'Sandstorm Collapses · Oasis Pools · Reed Grass Stealth · Ruins';
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-map-id={m.id}
                    disabled={!isHost}
                    onClick={() => {
                      soundEngine.unlock();
                      soundEngine.play('uiSelect');
                      onSelectMap(m.id);
                    }}
                    className={`text-left rounded-xl p-2.5 border transition flex flex-col justify-between ${
                      selected
                        ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-300 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-400'
                    } ${isHost ? 'cursor-pointer' : 'cursor-default opacity-90'}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-display font-bold text-xs sm:text-sm text-slate-900 leading-tight">
                          {m.name}
                        </span>
                        {selected && (
                          <span className="text-[9px] font-bold text-amber-700 uppercase shrink-0">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5 line-clamp-1">{m.subtitle}</div>
                    </div>
                    <div className="mt-1.5 text-[9px] font-semibold text-sky-800 bg-white/80 border border-slate-200 rounded px-1.5 py-0.5 truncate">
                      {biomeTag}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Toggleable SKILLS & PREVIEW Drawer / Modal with Live 3D Simulation */}
      {skillsDrawerOpen && (() => {
        const awKit = AWAKENING_CONFIG.AWAKENED_KITS[myFighterId];
        const domCfg = DOMAIN_CONFIGS[myFighterId];
        const tabs: Array<{ id: SkillDemoTab; label: string; badge: string }> = [
          { id: 'passive', label: 'Passive', badge: 'PASSIVE' },
          { id: 'm1', label: 'M1 Combo', badge: 'M1 / J' },
          { id: 'skill1', label: 'Skill 1', badge: 'KEY 1' },
          { id: 'skill2', label: 'Skill 2', badge: 'KEY 2' },
          { id: 'ultimate', label: 'Ultimate', badge: 'KEY 3' },
          { id: 'awakening', label: 'Awakening', badge: 'ORB / 4' },
          { id: 'domain', label: 'Domain', badge: 'KEY V' },
        ];

        const activeDetail =
          demoTab === 'passive'
            ? {
                title: mySpec.passive.name,
                subtitle: `${mySpec.name} Combat Identity`,
                desc: mySpec.passive.shortDesc,
                bonus: mySpec.passive.frenzyBonus,
                stats: ['Parry: F (0.26s)', 'Dash: Q (I-frames)', 'Grab: G (Breaks Guard)'],
              }
            : demoTab === 'm1'
            ? {
                title: mySpec.m1Combo.stepNames.join(' → '),
                subtitle: `Signature Basic Attack · ${mySpec.m1Combo.rangeIdentity}`,
                desc: mySpec.abilities[0].shortDesc,
                bonus: `Finisher: ${mySpec.m1Combo.heavyFinisherName} · Combo Link: ${mySpec.comboLink.triggerName} (+${mySpec.comboLink.bonusDamage} DMG)`,
                stats: [
                  `CD ${mySpec.abilities[0].cooldown}s`,
                  `DMG ${mySpec.abilities[0].damage}`,
                  `RNG ${mySpec.abilities[0].range}m`,
                ],
              }
            : demoTab === 'skill1'
            ? {
                title: mySpec.abilities[2].name,
                subtitle: `Skill 1 · Key [${mySpec.abilities[2].keyHint}]`,
                desc: mySpec.abilities[2].shortDesc,
                bonus: `Awakened Form: ${awKit.skill1.name} — ${awKit.skill1.shortDesc}`,
                stats: [
                  `CD ${mySpec.abilities[2].cooldown}s`,
                  `${mySpec.abilities[2].manaCost} Chi`,
                  `DMG ${mySpec.abilities[2].damage}`,
                ],
              }
            : demoTab === 'skill2'
            ? {
                title: mySpec.abilities[3].name,
                subtitle: `Skill 2 · Key [${mySpec.abilities[3].keyHint}]`,
                desc: mySpec.abilities[3].shortDesc,
                bonus: `Awakened Form: ${awKit.skill2.name} — ${awKit.skill2.shortDesc}`,
                stats: [
                  `CD ${mySpec.abilities[3].cooldown}s`,
                  `${mySpec.abilities[3].manaCost} Chi`,
                  `DMG ${mySpec.abilities[3].damage}`,
                ],
              }
            : demoTab === 'ultimate'
            ? {
                title: mySpec.abilities[4].name,
                subtitle: `Signature Ultimate · Key [${mySpec.abilities[4].keyHint}]`,
                desc: mySpec.abilities[4].shortDesc,
                bonus: `Awakened Ultimate: ${awKit.skill3.name} — ${awKit.skill3.shortDesc}`,
                stats: [
                  `CD ${mySpec.abilities[4].cooldown}s`,
                  `${mySpec.abilities[4].manaCost} Chi`,
                  `DMG ${mySpec.abilities[4].damage}`,
                ],
              }
            : demoTab === 'awakening'
            ? {
                title: awKit.awakenedTitle,
                subtitle: `Awakened Surge & Secret Finisher [${awKit.skill4.keyHint}]`,
                desc: awKit.skill4.shortDesc,
                bonus: `Clash Finisher: ${awKit.clashLabel} · Collect Awakening Orbs for 2× HP/Chi & 20m/s speed.`,
                stats: [
                  `CD ${awKit.skill4.cooldown}s`,
                  `${awKit.skill4.chiCost} Chi`,
                  `DMG ${awKit.skill4.damage}`,
                ],
              }
            : {
                title: domCfg.domainName,
                subtitle: `Domain Expansion · Key [V] at 100% Gauge`,
                desc:
                  myFighterId === 'jm'
                    ? 'Locks all inside with a top-down Overhead Center Camera while JM auto-dashes edge-to-edge in flash-step speedster form, leaving permanent glowing laser lines across the floor that explode on enemy contact.'
                    : myFighterId === 'prime'
                    ? 'Transforms the arena into a blazing magma crucible: rapid 0.45s volcanic geysers, continuous falling Giant Meteor Fists, and +30% M1 speed / -40% Dash CD overdrive gauntlets.'
                    : domCfg.subtitle,
                bonus: `Barrier Radius ${domCfg.radius}m · Duration ${domCfg.durationSec}s · Zero-escape barrier lock once sealed.`,
                stats: [`Radius ${domCfg.radius}m`, `${domCfg.durationSec}s`, 'Barrier Locked'],
              };

        return (
          <div
            data-testid="skills-preview-drawer"
            className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-2 sm:p-5 animate-fade-in"
            onClick={() => setSkillsDrawerOpen(false)}
          >
            <div
              className="w-full max-w-4xl max-h-[92dvh] rounded-2xl bg-white border-2 border-slate-900 shadow-2xl overflow-hidden flex flex-col animate-modal-pop"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-2.5 bg-slate-950 text-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: mySpec.color }}
                  />
                  <span className="font-display font-bold text-sm sm:text-base truncate">
                    {mySpec.name} · SKILLS &amp; 3D SIMULATION PREVIEW
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="close-skills-preview-btn"
                  onClick={() => setSkillsDrawerOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Interactive Skill Category Tabs */}
              <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {tabs.map((t) => {
                  const active = demoTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-demo-tab={t.id}
                      onClick={() => {
                        soundEngine.unlock();
                        soundEngine.play('uiClick');
                        setDemoTab(t.id);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-display font-bold uppercase whitespace-nowrap cursor-pointer transition flex items-center gap-1.5 ${
                        active
                          ? 'bg-amber-400 border-slate-950 text-slate-950 shadow-xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-slate-500'
                      }`}
                    >
                      <span>{t.label}</span>
                      <span className="text-[9px] font-mono-num px-1 rounded bg-slate-900 text-white">
                        {t.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Live 3D Simulation Viewport + Breakdown */}
              <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-12 gap-3 overflow-y-auto">
                <div className="md:col-span-7 h-[220px] sm:h-[290px] relative rounded-xl overflow-hidden border border-slate-300">
                  <SkillDemoPreview fighterId={myFighterId} skinId={mySkinId} demoTab={demoTab} />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/80 text-[10px] font-mono-num text-amber-300 pointer-events-none">
                    LIVE 3D SIMULATION · DRAG TO ORBIT
                  </div>
                </div>
                <div className="md:col-span-5 flex flex-col justify-between gap-2.5">
                  <div>
                    <div
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: myInk }}
                    >
                      {activeDetail.subtitle}
                    </div>
                    <h4 className="font-display font-bold text-xl text-slate-950 mt-0.5">
                      {activeDetail.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-700 mt-2 leading-relaxed">
                      {activeDetail.desc}
                    </p>
                    <div className="mt-3 rounded-xl bg-amber-50 border border-amber-300 p-2.5 text-[11px] text-amber-950 font-medium leading-snug">
                      {activeDetail.bonus}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200">
                    {activeDetail.stats.map((st) => (
                      <span
                        key={st}
                        className="px-2 py-1 rounded-lg bg-slate-900 text-white font-mono-num text-[10px] font-bold"
                      >
                        {st}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bottom Roster Bar + Ready / Start Controls */}
      <div className="sticky bottom-0 lg:static z-20 w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white/95 border border-slate-200 rounded-2xl p-2 sm:p-3 shadow-lg">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2 flex-1">
          {FIGHTERS.map((f) => {
            const isSelected = myFighterId === f.id;
            const pickedBy = room.players.filter((p) => p.fighterId === f.id);
            return (
              <button
                key={f.id}
                type="button"
                data-fighter-id={f.id}
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.play('uiSelect');
                  onSelectFighter(f.id);
                }}
                className={`min-h-[48px] sm:min-h-[54px] rounded-xl px-1.5 sm:px-2 py-1.5 border text-left transition cursor-pointer relative ${
                  isSelected
                    ? 'bg-slate-100 border-slate-900 ring-1 ring-slate-900 shadow-sm scale-[1.02]'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="w-full h-1.5 rounded-full mb-1" style={{ backgroundColor: f.color }} />
                <div className="font-display font-bold text-[10px] sm:text-sm text-slate-900 truncate">{f.name}</div>
                <div className="text-[10px] text-slate-600 truncate hidden sm:block">{f.m1Combo.rangeIdentity}</div>
                {pickedBy.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {pickedBy.map((p) => (
                      <span
                        key={p.playerId}
                        className="text-[8px] sm:text-[9px] font-mono-num font-bold text-slate-950 px-1 rounded border border-slate-900/20"
                        style={{ backgroundColor: f.color }}
                      >
                        P{p.slotIndex + 1}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.play('uiSelect');
              triggerMobileFs();
              onToggleReady(!me?.ready);
            }}
            className={`btn-shimmer flex-1 sm:flex-none min-h-[46px] sm:min-h-[54px] px-4 sm:px-5 rounded-xl font-display font-bold text-sm sm:text-base tracking-wide transition hover:scale-[1.02] active:scale-95 cursor-pointer ${
              me?.ready
                ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-md'
                : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md border border-amber-500/60'
            }`}
          >
            {me?.ready ? 'LOCKED IN ✓' : 'LOCK IN'}
          </button>

          {isHost && (
            <button
              type="button"
              data-testid="start-fight-btn"
              disabled={!canStart}
              onClick={() => {
                soundEngine.unlock();
                soundEngine.play('transitionWhoosh');
                triggerMobileFs();
                onStartNow();
              }}
              className="btn-shimmer min-h-[46px] sm:min-h-[54px] px-4 sm:px-5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white font-display font-bold text-sm sm:text-base tracking-wide transition hover:scale-[1.02] active:scale-95 shadow-md cursor-pointer whitespace-nowrap"
            >
              {room.isTrainingMode ? 'START TRAINING' : 'START FIGHT'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
