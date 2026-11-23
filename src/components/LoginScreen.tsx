import React from 'react';
import { Coins, ShieldCheck, Swords, UserRound } from 'lucide-react';
import { soundEngine } from '../game/soundEngine.ts';
import { FullscreenControls } from './FullscreenControls.tsx';

interface LoginScreenProps {
  authLoading: boolean;
  authError: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  onGoogleSignIn: () => void;
  onPlayAsGuest: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authLoading,
  authError,
  connectionStatus,
  onGoogleSignIn,
  onPlayAsGuest,
}) => {
  return (
    <div
      data-testid="login-screen"
      className="relative min-h-[100dvh] w-full max-w-[100dvw] bg-slate-50 text-slate-900 flex flex-col items-center justify-center px-3 sm:px-4 py-4 sm:py-6 overflow-y-auto overflow-x-hidden safe-area-pad animate-screen-enter"
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 20%, rgba(251, 191, 36, 0.22), transparent 46%), radial-gradient(circle at 82% 80%, rgba(56, 189, 248, 0.18), transparent 48%)',
        }}
      />

      <div className="fixed top-3 right-3 z-20 flex items-center gap-2">
        <div className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 shadow-xs">
          {connectionStatus === 'connected'
            ? 'Arena Online'
            : connectionStatus === 'connecting'
            ? 'Connecting...'
            : 'Offline Ready'}
        </div>
        <FullscreenControls compact />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white border-2 border-slate-200 p-5 sm:p-8 shadow-xl">
        <div className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-widest text-amber-700 mb-2">
          <Swords className="w-4 h-4 text-amber-600 shrink-0" />
          <span>3D Anime Arena Brawler</span>
        </div>

        <h1 className="font-display text-[clamp(1.75rem,4.5vw,3rem)] font-bold tracking-tight text-slate-950 leading-none">
          KOOPAL CLASH
        </h1>
        <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
          Enter 2–5 player Domain Expansion battles, Awakening clashes, and fast-paced solo or squad arena combat.
        </p>

        <div className="mt-6 space-y-3">
          {/* Primary: Sign in with Google (+1,000 Coins Bonus) */}
          <button
            type="button"
            data-testid="login-google-btn"
            disabled={authLoading}
            onClick={() => {
              soundEngine.unlock();
              soundEngine.play('uiSelect');
              onGoogleSignIn();
            }}
            className="ui-interactive btn-shimmer w-full min-h-[54px] px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 disabled:opacity-55 text-white border-2 border-slate-950 shadow-md flex items-center justify-between gap-3 cursor-pointer"
          >
            <span className="flex items-center gap-2.5 font-display font-bold text-sm sm:text-base whitespace-nowrap">
              <svg className="w-5 h-5 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
                />
              </svg>
              <span>{authLoading ? 'Signing in...' : 'Sign in with Google'}</span>
            </span>

            <span
              data-testid="google-bonus-badge"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono-num text-[10px] sm:text-[11px] font-black shrink-0 whitespace-nowrap"
            >
              <Coins className="w-3.5 h-3.5 text-slate-950 shrink-0" />
              <span>+1,000 COINS BONUS</span>
            </span>
          </button>

          {/* Secondary: Play as Guest (0 Starting Coins) */}
          <button
            type="button"
            data-testid="login-guest-btn"
            onClick={() => {
              soundEngine.unlock();
              soundEngine.play('transitionWhoosh');
              onPlayAsGuest();
            }}
            className="ui-interactive w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 font-display font-bold text-sm flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <UserRound className="w-4 h-4 text-slate-700 shrink-0" />
              <span>Play as Guest</span>
            </span>
            <span className="font-mono-num text-[11px] font-semibold text-slate-600">
              0 COINS · IN-SESSION
            </span>
          </button>
        </div>

        {authError && (
          <div className="mt-3 rounded-xl bg-rose-50 border border-rose-300 px-3 py-2 text-xs text-rose-800 font-medium">
            {authError}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-slate-200 space-y-1.5 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5 font-medium text-slate-700">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Google sign-in saves career Coins, Skins &amp; Stats across sessions.</span>
          </div>
          <p className="text-slate-500">
            Guests start with 0 Coins and can link a Google account anytime in the Lobby or Hero Pick to claim +1,000 Coins.
          </p>
        </div>
      </div>
    </div>
  );
};
