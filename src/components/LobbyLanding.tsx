import React, { useEffect, useState } from 'react';
import {
  Ban,
  Coins,
  Film,
  Gamepad2,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  ShieldCheck,
  ShoppingBag,
  Swords,
  Users,
} from 'lucide-react';
import { soundEngine } from '../game/soundEngine.ts';
import type { GuestSession, UserAccount } from '../game/accountStore.ts';
import type { CloudUserProfile } from '../game/firebaseUsers.ts';
import { canEnterArena } from '../game/userLogic.ts';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { FullscreenControls } from './FullscreenControls.tsx';
import { GAME_MODES, GAME_MODE_BY_ID, type GameModeId } from '../shared/gameData.ts';

interface LobbyLandingProps {
  initialRoomCode: string;
  initialName: string;
  account: UserAccount | null;
  cloudUser: CloudUserProfile | null;
  guestSession?: GuestSession | null;
  authLoading: boolean;
  authError: string | null;
  isAdmin: boolean;
  isPlaceholderConfig: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  pingMs: number | null;
  errorMessage: string | null;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onExitGuestToLogin?: () => void;
  onOpenAdminMonitor: () => void;
  onOpenFirebaseGuide: () => void;
  onLoginAccount: (username: string) => void;
  onLogoutAccount: () => void;
  selectedMode: GameModeId;
  onSelectMode: (mode: GameModeId) => void;
  onCreateRoom: (
    name: string,
    opts?: { isSoloPractice?: boolean; isTrainingMode?: boolean; gameMode?: GameModeId }
  ) => void;
  onJoinRoom: (roomCode: string, name: string) => void;
  onOpenCinemaCut: () => void;
  onOpenShop: () => void;
}

export const LobbyLanding: React.FC<LobbyLandingProps> = ({
  initialRoomCode,
  initialName,
  account,
  cloudUser,
  guestSession = null,
  authLoading,
  authError,
  isAdmin,
  isPlaceholderConfig,
  connectionStatus,
  pingMs,
  errorMessage,
  onGoogleSignIn,
  onGoogleSignOut,
  onExitGuestToLogin,
  onOpenAdminMonitor,
  onOpenFirebaseGuide,
  onLoginAccount,
  onLogoutAccount,
  selectedMode,
  onSelectMode,
  onCreateRoom,
  onJoinRoom,
  onOpenCinemaCut,
  onOpenShop,
}) => {
  const effectiveName =
    cloudUser?.displayName || account?.username || guestSession?.displayName || initialName || 'Fighter';
  const [name, setName] = useState(effectiveName);
  const [fallbackInput, setFallbackInput] = useState('');
  const [showFallbackForm, setShowFallbackForm] = useState(false);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [loginAttention, setLoginAttention] = useState(false);
  const { enterFullscreen } = usePWAInstall();

  useEffect(() => {
    if (cloudUser?.displayName) {
      setName(cloudUser.displayName);
    } else if (account?.username) {
      setName(account.username);
    } else if (guestSession?.displayName) {
      setName(guestSession.displayName);
    }
  }, [cloudUser?.displayName, account?.username, guestSession?.displayName]);

  const handleAction = (fn: () => void, tryFs = false, sfx: 'uiClick' | 'uiSelect' | 'transitionWhoosh' = 'uiClick') => {
    soundEngine.unlock();
    soundEngine.play(sfx);
    if (tryFs && window.matchMedia('(pointer: coarse)').matches) {
      void enterFullscreen(false);
    }
    fn();
  };

  const handleFallbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = fallbackInput.trim();
    if (!clean) return;
    soundEngine.unlock();
    soundEngine.play('loginSuccess');
    onLoginAccount(clean);
    setShowFallbackForm(false);
  };

  const syncedCoins = cloudUser?.coins ?? account?.coins ?? guestSession?.coins ?? 0;
  const isBanned = Boolean(cloudUser?.banned);
  const isGuest = Boolean(!cloudUser && !account && guestSession);
  const isSignedIn = isGuest || (isPlaceholderConfig ? Boolean(cloudUser || account) : Boolean(cloudUser));
  const entryGate = canEnterArena({
    isPlaceholderConfig,
    hasCloudUser: Boolean(cloudUser),
    hasLocalAccount: Boolean(account),
    isGuest,
    isBanned,
    connectionStatus,
  });

  const nudgeSignIn = () => {
    soundEngine.unlock();
    soundEngine.play('lockedError');
    setLoginAttention(true);
    setTimeout(() => setLoginAttention(false), 900);
  };

  return (
    <div className="relative h-[100dvh] w-full max-w-[100dvw] bg-slate-50 text-slate-900 flex flex-col items-center justify-start px-3 pt-3 pb-10 sm:px-6 sm:py-4 overflow-y-auto overflow-x-hidden overscroll-y-contain safe-area-pad animate-screen-enter">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 18% 18%, rgba(251, 191, 36, 0.18), transparent 46%), radial-gradient(circle at 84% 78%, rgba(56, 189, 248, 0.16), transparent 48%)',
        }}
      />

      {/* Sleek Top Navigation Bar: Profile Pill, Coins, Admin Monitor (strictly sullenshades@gmail.com) */}
      <header className="relative z-10 w-full max-w-4xl mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/95 border border-slate-200 px-3.5 py-2 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-emerald-500'
                : connectionStatus === 'connecting'
                ? 'bg-amber-500'
                : 'bg-rose-500'
            }`}
          />
          <span>
            {connectionStatus === 'connected'
              ? `Global Arena Sync${pingMs !== null ? ` · ${pingMs} ms` : ''}`
              : connectionStatus === 'connecting'
              ? 'Connecting to Server...'
              : 'Reconnecting...'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {cloudUser && (
            <div className="flex items-center gap-2 pr-1">
              {cloudUser.photoURL ? (
                <img
                  src={cloudUser.photoURL}
                  alt={cloudUser.displayName}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full border border-slate-300 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-400 text-slate-950 font-display font-bold text-xs flex items-center justify-center">
                  {cloudUser.displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-bold text-slate-900 max-w-[130px] truncate">
                {cloudUser.displayName}
              </span>
              <span
                data-testid="account-coins"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-mono-num text-xs font-bold"
              >
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span>{syncedCoins}</span>
              </span>
            </div>
          )}

          {!cloudUser && account && (
            <span
              data-testid="account-coins-header"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-mono-num text-xs font-bold"
            >
              <Coins className="w-3.5 h-3.5 text-amber-600" />
              <span>{syncedCoins}</span>
            </span>
          )}

          {isGuest && (
            <div className="flex items-center gap-1.5">
              <span
                data-testid="guest-coins-badge"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 font-mono-num text-xs font-bold"
              >
                <Coins className="w-3.5 h-3.5 text-slate-600" />
                <span>GUEST ({syncedCoins} COINS)</span>
              </span>
              <button
                type="button"
                data-testid="link-google-btn"
                disabled={authLoading}
                onClick={() => handleAction(onGoogleSignIn, false, 'uiSelect')}
                className="ui-interactive inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-950 text-xs font-display font-bold cursor-pointer shadow-xs"
              >
                <span>Link Google Account (+1,000 Coins)</span>
              </button>
            </div>
          )}

          <button
            type="button"
            data-testid="open-shop-btn"
            onClick={() => handleAction(onOpenShop, false, 'uiSelect')}
            className="ui-interactive inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500 text-xs font-display font-bold shadow-xs cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Item Shop</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              data-testid="admin-monitor-btn"
              onClick={() => handleAction(onOpenAdminMonitor)}
              className="ui-interactive inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-950 text-xs font-display font-bold shadow-sm cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Monitor</span>
            </button>
          )}

          <button
            type="button"
            data-testid="firebase-guide-btn"
            onClick={() => handleAction(onOpenFirebaseGuide)}
            className="ui-interactive inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-sky-600" />
            <span className="hidden sm:inline">Firebase Setup</span>
          </button>

          <FullscreenControls compact />
        </div>
      </header>

      <div className="relative z-10 w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch my-auto">
        {/* Left Hero Identity */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-white border border-slate-200 p-4 sm:p-7 shadow-xl">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
              <div className="flex items-center gap-2 text-[11px] sm:text-xs text-amber-700 font-bold tracking-wider uppercase">
                <Swords className="w-4 h-4 shrink-0 text-amber-600" />
                <span>2–5 Player Global Arena · MLBB Tactical View</span>
              </div>
            </div>

            <h1 className="font-display text-[clamp(1.75rem,3.6vw,3rem)] font-bold tracking-tight text-slate-950 leading-tight [text-wrap:balance]">
              KOOPAL CLASH
            </h1>
            <p className="mt-2 sm:mt-3 text-xs sm:text-base text-slate-600 leading-relaxed max-w-xl">
              Challenge up to 5 friends in tactical 3D Free-For-All combat across Shibuya Scramble skyscrapers, Sunset Temple pagodas, and destructible arenas. Chain M1 combos, break guards with Grabs, counter Ultimates in Clash QTEs, and sync your Coins in the cloud.
            </p>
          </div>

          <div className="mt-4 sm:mt-6 grid grid-cols-3 gap-2 sm:gap-3 text-center">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 sm:p-3">
              <div className="font-display text-xl sm:text-2xl font-bold text-amber-600 font-mono-num">2–5</div>
              <div className="text-[11px] text-slate-600 mt-0.5 font-medium">Live Players</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 sm:p-3">
              <div className="font-display text-xl sm:text-2xl font-bold text-sky-600 font-mono-num">RPS</div>
              <div className="text-[11px] text-slate-600 mt-0.5 font-medium">Strike · Grab · Parry</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 sm:p-3">
              <div className="font-display text-xl sm:text-2xl font-bold text-emerald-600 font-mono-num">4 MAPS</div>
              <div className="text-[11px] text-slate-600 mt-0.5 font-medium">Shibuya &amp; Ruins</div>
            </div>
          </div>

          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
            <div className="text-[11px] text-slate-500 font-medium">
              Controls: WASD / Joystick · M1 Attack · 1/2/3 Skills · Q Dash · F Guard · G Grab
            </div>

            <button
              type="button"
              onClick={() => handleAction(onOpenCinemaCut, false, 'transitionWhoosh')}
              className="ui-interactive inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 whitespace-nowrap cursor-pointer"
            >
              <Film className="w-3.5 h-3.5 text-amber-600" />
              <span>120s Cinema Cut</span>
            </button>
          </div>
        </div>

        {/* Right Firebase Google Login + Room Entry Card */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 shadow-xl">
          <div className="space-y-3 sm:space-y-3.5">
            {/* Firebase Google Sign-In & Cloud Account Panel */}
            <div
              data-testid="account-panel"
              className={`rounded-xl bg-slate-50 border p-3 space-y-2 transition-all duration-200 ${
                loginAttention
                  ? 'border-amber-500 ring-2 ring-amber-400 bg-amber-50/70'
                  : 'border-slate-200'
              }`}
            >
              {cloudUser ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {cloudUser.photoURL ? (
                      <img
                        src={cloudUser.photoURL}
                        alt={cloudUser.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl border border-slate-300 object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 font-display font-bold text-sm flex items-center justify-center shrink-0">
                        {cloudUser.displayName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm text-slate-950 truncate">
                        {cloudUser.displayName}
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">{cloudUser.email}</div>
                      <div className="text-[10px] text-slate-600 font-mono-num">
                        {cloudUser.wins}W · {cloudUser.losses}L · {cloudUser.totalKOs} KO
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-mono-num font-bold text-xs">
                      <Coins className="w-3.5 h-3.5 text-amber-600" />
                      <span>{cloudUser.coins}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAction(onGoogleSignOut)}
                      className="ui-interactive inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-[10px] font-semibold text-slate-700 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              ) : account ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                      Local Test Account
                    </div>
                    <div className="font-display font-bold text-sm text-slate-900 truncate">
                      {account.username}
                    </div>
                    <div className="text-[11px] text-slate-600 font-mono-num">
                      {account.wins}W · {account.kills} KO · {account.matchesPlayed} Games
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div
                      data-testid="account-coins"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-mono-num font-bold text-xs"
                    >
                      <Coins className="w-3.5 h-3.5 text-amber-600" />
                      <span>{account.coins}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAction(onLogoutAccount)}
                      className="ui-interactive inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-[10px] font-semibold text-slate-700 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              ) : isGuest && guestSession ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Guest Session (In-Memory)
                      </div>
                      <div className="font-display font-bold text-sm text-slate-950 truncate">
                        {guestSession.displayName} · {guestSession.coins} Coins
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono-num">
                        {guestSession.wins}W · {guestSession.kills} KO · {guestSession.matchesPlayed} Games
                      </div>
                    </div>
                    {onExitGuestToLogin && (
                      <button
                        type="button"
                        onClick={() => handleAction(onExitGuestToLogin)}
                        className="ui-interactive inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-[10px] font-semibold text-slate-700 cursor-pointer shrink-0"
                      >
                        <LogOut className="w-3 h-3" />
                        <span>Switch</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid="panel-link-google-btn"
                    disabled={authLoading}
                    onClick={() => handleAction(onGoogleSignIn, false, 'uiSelect')}
                    className="ui-interactive btn-shimmer w-full h-9 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-amber-300 font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>{authLoading ? 'Linking...' : 'Link Google Account (+1,000 Coins)'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 whitespace-nowrap">
                      Cloud Account · Sync Stats
                    </span>
                    <span className="text-[10px] font-semibold text-amber-700 whitespace-nowrap">
                      +1,000 Coins Bonus
                    </span>
                  </div>

                  <button
                    type="button"
                    data-testid="google-signin-btn"
                    disabled={authLoading}
                    onClick={() => handleAction(onGoogleSignIn, false, 'uiSelect')}
                    className="ui-interactive btn-shimmer w-full h-10 px-3 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 shadow-xs text-slate-900 font-display font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
                      />
                    </svg>
                    <span>{authLoading ? 'Signing in...' : 'Sign in with Google'}</span>
                  </button>

                  {isPlaceholderConfig && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setShowFallbackForm((v) => !v)}
                        className="w-full text-[11px] font-semibold text-amber-700 hover:text-amber-800 underline cursor-pointer"
                      >
                        Firebase keys are placeholders — use temporary local fallback
                      </button>
                      {showFallbackForm && (
                        <form onSubmit={handleFallbackSubmit} className="flex gap-1.5">
                          <input
                            type="text"
                            maxLength={14}
                            value={fallbackInput}
                            onChange={(e) => setFallbackInput(e.target.value)}
                            placeholder="Test username"
                            className="flex-1 h-8 px-2.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-900"
                          />
                          <button
                            type="submit"
                            className="h-8 px-3 rounded-lg bg-slate-900 text-white font-display font-bold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <LogIn className="w-3 h-3" />
                            <span>Use</span>
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}

              {authError && (
                <div className="rounded-lg bg-rose-50 border border-rose-300 px-2.5 py-1.5 text-[11px] text-rose-800 font-medium">
                  {authError}
                </div>
              )}

              {isBanned && (
                <div className="rounded-lg bg-rose-600 text-white px-2.5 py-2 text-[11px] font-bold flex items-center gap-1.5">
                  <Ban className="w-4 h-4 shrink-0" />
                  <span>This account has been flagged/suspended by Admin Monitor.</span>
                </div>
              )}
              {!isSignedIn && (
                <div
                  data-testid="mandatory-login-banner"
                  onClick={nudgeSignIn}
                  className="rounded-lg bg-amber-50 border border-amber-300 px-2.5 py-2 text-[11px] font-semibold text-amber-900 flex items-center gap-2 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>
                    Sign in with Google required to create rooms, join matches, or battle Bots.
                  </span>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="player-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Arena Fighter Tag
              </label>
              <input
                id="player-name"
                type="text"
                maxLength={14}
                disabled={!isSignedIn}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isSignedIn ? 'Enter nickname' : 'Sign in first...'}
                className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">Game Mode</span>
                <span className="text-[10px] font-bold text-amber-700">
                  {GAME_MODE_BY_ID[selectedMode]?.playersHint}
                </span>
              </div>
              <div data-testid="lobby-mode-selector" className="flex flex-wrap gap-1.5">
                {GAME_MODES.map((gm) => {
                  const active = selectedMode === gm.id;
                  return (
                    <button
                      key={gm.id}
                      type="button"
                      data-testid={`lobby-mode-${gm.id}`}
                      onClick={() => handleAction(() => onSelectMode(gm.id), false, 'uiSelect')}
                      title={gm.description}
                      className={`flex-1 min-w-[30%] px-2 py-1.5 rounded-lg border text-[10px] font-display font-bold uppercase tracking-tight cursor-pointer transition text-center whitespace-nowrap ${
                        active
                          ? 'bg-slate-900 text-amber-300 border-slate-950 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      {gm.shortLabel}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                {GAME_MODE_BY_ID[selectedMode]?.description}
              </p>
            </div>

            {errorMessage && (
              <div className="rounded-xl bg-rose-50 border border-rose-300 px-3.5 py-2 text-xs text-rose-800 font-medium">
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              data-testid="create-room-btn"
              disabled={!entryGate.allowed}
              onClick={() =>
                handleAction(() => onCreateRoom(name, { gameMode: selectedMode }), true, 'transitionWhoosh')
              }
              className="ui-interactive btn-shimmer w-full min-h-[44px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-45 disabled:cursor-not-allowed text-slate-950 font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 shadow-md border border-amber-500/60 cursor-pointer"
            >
              {!isSignedIn ? <Lock className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              <span>CREATE FRIEND ROOM</span>
            </button>

            <div className="relative flex items-center py-0.5">
              <div className="flex-grow border-t border-slate-200" />
              <span className="px-3 text-[11px] font-semibold text-slate-500">OR JOIN CODE</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                maxLength={4}
                disabled={!isSignedIn}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="CODE"
                className="w-24 sm:w-28 h-11 px-2 rounded-xl bg-slate-50 border border-slate-300 text-center font-mono-num text-lg font-bold tracking-widest text-amber-700 placeholder-slate-400 focus:outline-none focus:border-sky-500 uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                data-testid="join-room-btn"
                disabled={!entryGate.allowed || roomCode.length < 4}
                onClick={() => handleAction(() => onJoinRoom(roomCode, name), true, 'transitionWhoosh')}
                className="ui-interactive btn-shimmer flex-1 min-h-[44px] px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                {!isSignedIn && <Lock className="w-4 h-4" />}
                <span>JOIN ROOM</span>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="vs-bot-btn"
              data-start="true"
              disabled={!entryGate.allowed}
              onClick={() =>
                handleAction(
                  () => onCreateRoom(name, { isSoloPractice: true, gameMode: selectedMode }),
                  true,
                  'transitionWhoosh'
                )
              }
              className="ui-interactive w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-45 disabled:cursor-not-allowed text-slate-900 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-300 cursor-pointer"
            >
              {!isSignedIn ? <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <Swords className="w-4 h-4 text-amber-600 shrink-0" />}
              <span>Vs. Bot ({GAME_MODE_BY_ID[selectedMode]?.shortLabel})</span>
            </button>
            <button
              type="button"
              data-testid="training-area-btn"
              disabled={!entryGate.allowed}
              onClick={() => handleAction(() => onCreateRoom(name, { isTrainingMode: true }), true, 'transitionWhoosh')}
              className="ui-interactive w-full min-h-[42px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 disabled:opacity-45 disabled:cursor-not-allowed text-emerald-900 font-semibold text-xs flex items-center justify-center gap-1.5 border border-emerald-300 cursor-pointer"
            >
              {!isSignedIn ? <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" /> : <Gamepad2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              <span>Training Area</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
