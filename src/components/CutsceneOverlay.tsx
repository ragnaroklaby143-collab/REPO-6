import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AWAKENING_CONFIG } from '../shared/awakeningConfig.ts';
import type { AwakeningCutsceneState } from '../shared/gameData.ts';
import { renderCutscenePortrait } from '../game/cutscenePortraitRenderer.ts';

interface CutsceneOverlayProps {
  cutscene: AwakeningCutsceneState;
  playerId: string;
  onMash: () => void;
  onSkip?: () => void;
}

export const CutsceneOverlay: React.FC<CutsceneOverlayProps> = ({
  cutscene,
  playerId,
  onMash,
  onSkip,
}) => {
  const clock = cutscene.clockSec;
  const T = AWAKENING_CONFIG.TIMELINE;

  const isWalkPhase = clock < T.PANEL_1_AT;
  const isPanel1 = clock >= T.PANEL_1_AT && clock < T.PANEL_2_AT;
  const isPanel2 = clock >= T.PANEL_2_AT && clock < T.CLASH_START_AT;
  const isClashPhase = clock >= T.CLASH_START_AT && !cutscene.resolved;

  const amP1 = playerId === cutscene.p1Id;
  const amP2 = playerId === cutscene.p2Id;
  const isParticipant = amP1 || amP2;

  const kit1 = AWAKENING_CONFIG.AWAKENED_KITS[cutscene.p1FighterId];
  const kit2 = AWAKENING_CONFIG.AWAKENED_KITS[cutscene.p2FighterId];

  const p1PortraitUrl = useMemo(() => {
    const rendered = renderCutscenePortrait(
      cutscene.p1FighterId,
      cutscene.p1SkinId ?? 'classic',
      'color'
    );
    return rendered || kit1.portraitUrl || '';
  }, [cutscene.p1FighterId, cutscene.p1SkinId, kit1.portraitUrl]);

  const p2PortraitUrl = useMemo(() => {
    const rendered = renderCutscenePortrait(
      cutscene.p2FighterId,
      cutscene.p2SkinId ?? 'classic',
      'bw-manga'
    );
    return rendered || kit2.portraitUrl || '';
  }, [cutscene.p2FighterId, cutscene.p2SkinId, kit2.portraitUrl]);

  // First-time unskippable, subsequent skippable (straight to Button-Mash Spam Duel)
  const [canSkipThisRun, setCanSkipThisRun] = useState<boolean>(() => {
    try {
      return localStorage.getItem('koopal_cutscene_seen_v1') === '1';
    } catch {
      return false;
    }
  });
  const skipTriggeredRef = useRef(false);

  useEffect(() => {
    skipTriggeredRef.current = false;
    try {
      setCanSkipThisRun(localStorage.getItem('koopal_cutscene_seen_v1') === '1');
    } catch {
      setCanSkipThisRun(false);
    }
  }, [cutscene.id]);

  // Mark cutscene seen once player reaches the Spam Duel or resolves their first cutscene
  useEffect(() => {
    if (clock >= T.CLASH_START_AT || cutscene.resolved) {
      try {
        localStorage.setItem('koopal_cutscene_seen_v1', '1');
      } catch {
        // ignore storage restrictions
      }
    }
  }, [clock, T.CLASH_START_AT, cutscene.resolved]);

  const handleInstantSkip = () => {
    if (!AWAKENING_CONFIG.ALLOW_SKIP || !onSkip || !canSkipThisRun || skipTriggeredRef.current) return;
    skipTriggeredRef.current = true;
    onSkip();
  };

  // Keyboard mash (Space for P1 / Enter for P2, with repeat ignored)
  useEffect(() => {
    if (!isClashPhase || !isParticipant) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (amP1 && e.code === 'Space') {
        e.preventDefault();
        onMash();
      } else if (amP2 && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        onMash();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isClashPhase, isParticipant, amP1, amP2, onMash]);

  // Ease-in un-darkening curve from pure black over 0:00 -> 0:12
  const blackOpacity = isWalkPhase
    ? Math.max(0, Math.min(1, 1 - Math.pow(clock / Math.max(0.1, T.WALK_FADE_END), 1.35)))
    : 0;

  // Center divider moves left (-1 = P1 winning) to right (+1 = P2 winning)
  // For UI intuition: left fill % represents P1's push! When clashBalance = -1, P1 fills 100% left->right.
  const p1SharePct = Math.max(6, Math.min(94, 50 - cutscene.clashBalance * 44));
  const p2SharePct = 100 - p1SharePct;

  const p1Color = kit1.auraPrimaryCss;
  const p2Color =
    cutscene.p1FighterId === cutscene.p2FighterId ? '#fb7185' : kit2.auraPrimaryCss;

  return (
    <div
      data-testid="awakening-cutscene-overlay"
      className="fixed inset-0 z-50 overflow-hidden select-none pointer-events-auto"
    >
      {/* 0:00 - 0:12 Pure Black Fade-In Curtain + Atmospheric Embers */}
      {isWalkPhase && (
        <>
          <div
            data-testid="cutscene-black-fade"
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-75"
            style={{ opacity: blackOpacity }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, transparent 45%, rgba(2, 6, 23, 0.65) 100%)',
            }}
          />
        </>
      )}

      {/* Letterbox Cinema Bars during Walk & Clash */}
      {(isWalkPhase || isClashPhase) && (
        <>
          <div className="absolute top-0 left-0 right-0 h-[9vh] max-h-16 bg-black z-10 pointer-events-none border-b border-white/10" />
          <div className="absolute bottom-0 left-0 right-0 h-[9vh] max-h-16 bg-black z-10 pointer-events-none border-t border-white/10" />
        </>
      )}

      {/* ~0:12 - 0:14: MANGA PANEL 1 ("LET'S LARP") */}
      {isPanel1 && (
        <div
          data-testid="cutscene-panel-1"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black p-2 sm:p-5 animate-manga-shake"
        >
          <div
            className="relative w-full h-full max-w-6xl max-h-[88vh] overflow-hidden border-[5px] sm:border-[7px] border-white shadow-[0_0_50px_rgba(96,165,250,0.65)]"
            style={{
              background:
                'linear-gradient(125deg, #e0f2fe 0%, #93c5fd 38%, #3b82f6 82%, #1d4ed8 100%)',
            }}
          >
            {/* Halftone Dot Pattern Overlay */}
            <div
              className="absolute inset-0 opacity-25 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(15, 23, 42, 0.75) 1.4px, transparent 1.6px)',
                backgroundSize: '10px 10px',
              }}
            />

            {/* Radial Anime Speed Lines */}
            <svg
              className="absolute inset-0 w-full h-full opacity-35 pointer-events-none"
              viewBox="0 0 1000 560"
              preserveAspectRatio="none"
            >
              {Array.from({ length: 28 }).map((_, idx) => {
                const ang = (idx / 28) * Math.PI * 2;
                const x1 = 580 + Math.cos(ang) * 180;
                const y1 = 230 + Math.sin(ang) * 140;
                const x2 = 580 + Math.cos(ang) * 780;
                const y2 = 230 + Math.sin(ang) * 620;
                return (
                  <line
                    key={idx}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#ffffff"
                    strokeWidth={idx % 3 === 0 ? 4 : 2}
                    strokeOpacity={0.7}
                  />
                );
              })}
            </svg>

            {/* Hand-lettered Impact Text: LET'S LARP */}
            <div className="relative z-20 flex flex-col justify-center h-full pl-6 sm:pl-14 max-w-[52%] pointer-events-none">
              <div
                className="font-manga text-slate-950 uppercase leading-[0.88] tracking-wider"
                style={{
                  fontSize: 'clamp(3.2rem, 10vw, 7.6rem)',
                  textShadow:
                    '3px 3px 0px rgba(255,255,255,0.65), -2px -2px 0px rgba(15,23,42,0.2)',
                  filter: 'contrast(1.2)',
                }}
              >
                <div>LET&apos;S</div>
                <div className="mt-1 sm:mt-2">LARP</div>
              </div>
              <div className="mt-3 inline-flex items-center gap-2 self-start bg-slate-950/90 text-sky-200 border-2 border-white px-3 py-1 rounded text-xs sm:text-sm font-display font-bold uppercase tracking-widest">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: kit1.auraPrimaryCss }}
                />
                {cutscene.p1Name} · {kit1.awakenedTitle}
              </div>
            </div>

            {/* P1 Actual Fighter 3D Bust Portrait */}
            {p1PortraitUrl ? (
              <img
                data-testid="cutscene-p1-portrait"
                src={p1PortraitUrl}
                alt={`${cutscene.p1Name} awakened portrait`}
                className="absolute right-[-2%] sm:right-[3%] bottom-0 h-[96%] w-auto max-w-[66%] object-contain pointer-events-none z-10 drop-shadow-[0_12px_28px_rgba(2,6,23,0.65)]"
              />
            ) : (
              <div
                data-testid="cutscene-p1-portrait"
                className="absolute right-8 bottom-8 z-10 px-6 py-4 rounded-2xl border-4 border-white bg-slate-950/90 text-white font-display font-bold text-2xl uppercase tracking-wider"
              >
                {cutscene.p1Name}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ~0:14 - 0:15: MANGA PANEL 2 ("JUST THIS ONCE.") */}
      {isPanel2 && (
        <div
          data-testid="cutscene-panel-2"
          className="absolute inset-0 z-30 flex items-center justify-center bg-black p-2 sm:p-5 animate-manga-shake"
        >
          <div className="relative w-full h-full max-w-6xl max-h-[88vh] overflow-hidden bg-white border-[5px] sm:border-[7px] border-white shadow-[0_0_50px_rgba(255,255,255,0.45)]">
            {/* Heavy B&W Ink Hatch Speed-Lines */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 1000 560"
              preserveAspectRatio="none"
            >
              {Array.from({ length: 76 }).map((_, idx) => {
                const isLeft = idx < 38;
                const y = (idx % 38) * 15;
                const x1 = isLeft ? 0 : 1000;
                const x2 = isLeft ? 150 + (idx % 6) * 42 : 850 - (idx % 6) * 42;
                return (
                  <line
                    key={idx}
                    x1={x1}
                    y1={y}
                    x2={x2}
                    y2={y + (isLeft ? -16 : 16)}
                    stroke="#09090b"
                    strokeWidth={idx % 3 === 0 ? 3.5 : idx % 2 === 0 ? 2 : 1.2}
                    strokeOpacity={0.88}
                  />
                );
              })}
              {/* Swirling ink motion arcs around head */}
              <path d="M110 75 Q360 14 550 112" fill="none" stroke="#09090b" strokeWidth="4" strokeDasharray="18 5 6 4" />
              <path d="M80 108 Q320 46 500 138" fill="none" stroke="#09090b" strokeWidth="2.6" strokeDasharray="12 5" />
            </svg>

            {/* P2 Actual Fighter High-Contrast B&W Manga Ink Bust Portrait */}
            {p2PortraitUrl ? (
              <img
                data-testid="cutscene-p2-portrait"
                src={p2PortraitUrl}
                alt={`${cutscene.p2Name} manga portrait`}
                className="absolute left-0 sm:left-[4%] bottom-0 h-[96%] w-auto max-w-[64%] object-contain contrast-125 pointer-events-none z-10"
              />
            ) : (
              <div
                data-testid="cutscene-p2-portrait"
                className="absolute left-8 bottom-14 z-10 px-6 py-4 rounded-2xl border-4 border-slate-950 bg-white text-slate-950 font-display font-bold text-2xl uppercase tracking-wider"
              >
                {cutscene.p2Name}
              </div>
            )}

            {/* Classic Oval Speech Bubble: JUST THIS ONCE. */}
            <div className="relative z-20 flex items-center justify-end h-full pr-6 sm:pr-14 pointer-events-none">
              <div className="relative bg-white border-[5px] border-slate-950 rounded-[999px] px-7 py-8 sm:px-12 sm:py-12 shadow-[6px_6px_0px_#09090b]">
                <div
                  className="font-manga-bubble text-slate-950 text-center uppercase leading-[1.15]"
                  style={{ fontSize: 'clamp(1.6rem, 4.4vw, 3.2rem)' }}
                >
                  <div>JUST</div>
                  <div>THIS</div>
                  <div>ONCE.</div>
                </div>
                {/* Seamless SVG speech bubble ink tail pointing toward character */}
                <svg
                  viewBox="0 0 60 54"
                  className="absolute -bottom-[26px] left-10 w-12 h-11 pointer-events-none overflow-visible"
                  aria-hidden="true"
                >
                  <path d="M 12 -4 L 4 46 L 44 6 Z" fill="#ffffff" />
                  <path d="M 14 2 L 4 46 L 42 8" fill="none" stroke="#09090b" strokeWidth="5.5" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            <div className="absolute bottom-3 left-4 z-20 inline-flex items-center gap-2 bg-slate-950 text-white border-2 border-white px-3 py-1 rounded text-xs sm:text-sm font-display font-bold uppercase tracking-widest">
              {cutscene.p2Name} · {kit2.awakenedTitle}
            </div>
          </div>
        </div>
      )}

      {/* ~0:15 - 0:18: TUG-OF-WAR CLASH BAR & MASH CONTROLS */}
      {isClashPhase && (
        <div
          data-testid="cutscene-clash-bar"
          className="absolute inset-0 z-30 flex flex-col justify-between py-[10vh] sm:py-20 px-3 sm:px-8 pointer-events-none"
        >
          {/* Top-Center Tug-of-War Clash Bar */}
          <div className="w-full max-w-2xl mx-auto">
            <div className="bg-slate-950/90 border-2 border-amber-400/80 rounded-2xl p-2.5 sm:p-3.5 shadow-[0_0_32px_rgba(250,204,21,0.35)]">
              <div className="flex items-center justify-between gap-2 text-xs sm:text-sm font-display font-bold uppercase tracking-wide mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: p1Color }}
                  />
                  <span className="text-white truncate">{cutscene.p1Name}</span>
                  <span className="font-manga text-base sm:text-lg text-amber-300 shrink-0">
                    x{cutscene.p1Taps}!
                  </span>
                  {cutscene.p1Overdrive > 1.02 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-mono-num font-black">
                      {cutscene.p1Overdrive.toFixed(1)}x OD
                    </span>
                  )}
                </div>

                <span className="font-manga text-amber-400 text-sm sm:text-base tracking-widest shrink-0">
                  AWAKENING CLASH
                </span>

                <div className="flex items-center gap-2 min-w-0 justify-end">
                  {cutscene.p2Overdrive > 1.02 && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-400 text-slate-950 text-[10px] font-mono-num font-black">
                      {cutscene.p2Overdrive.toFixed(1)}x OD
                    </span>
                  )}
                  <span className="font-manga text-base sm:text-lg text-amber-300 shrink-0">
                    x{cutscene.p2Taps}!
                  </span>
                  <span className="text-white truncate">{cutscene.p2Name}</span>
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: p2Color }}
                  />
                </div>
              </div>

              {/* Dual Push Bar */}
              <div className="relative h-6 sm:h-7 rounded-full overflow-hidden bg-slate-900 border-2 border-white/80 flex">
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${p1SharePct}%`,
                    background: `linear-gradient(90deg, ${p1Color}, #fef08a)`,
                  }}
                />
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${p2SharePct}%`,
                    background: `linear-gradient(90deg, #fda4af, ${p2Color})`,
                  }}
                />
                {/* Center Clash Spark Divider */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-9 bg-white border-2 border-slate-950 rounded-sm shadow-[0_0_16px_#ffffff] rotate-12"
                  style={{ left: `${p1SharePct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Bottom Interactive Mash Button (Desktop & Mobile) */}
          <div className="flex flex-col items-center gap-2 pointer-events-auto">
            {isParticipant ? (
              <button
                type="button"
                data-testid="clash-mash-btn"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onMash();
                }}
                className="animate-clash-mash px-8 py-3.5 sm:px-10 sm:py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 border-4 border-white text-slate-950 font-manga text-2xl sm:text-3xl tracking-widest shadow-[0_0_32px_rgba(250,204,21,0.8)] active:scale-95 transition-transform cursor-pointer"
              >
                MASH!{' '}
                <span className="hidden sm:inline font-display text-sm font-black bg-slate-950 text-amber-300 px-2 py-0.5 rounded ml-1.5 align-middle">
                  {amP1 ? 'SPACE' : 'ENTER'}
                </span>
              </button>
            ) : (
              <div className="px-5 py-2 rounded-xl bg-slate-950/85 border border-white/30 text-white font-display font-bold text-xs uppercase tracking-widest">
                Spectating Awakening Clash...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click-to-Skip Button (First match unskippable -> skips straight to Spam Duel on subsequent runs) */}
      {AWAKENING_CONFIG.ALLOW_SKIP &&
        onSkip &&
        canSkipThisRun &&
        !isClashPhase &&
        !cutscene.resolved && (
          <button
            type="button"
            data-testid="cutscene-skip-btn"
            onClick={handleInstantSkip}
            className="fixed top-4 right-4 z-50 rounded-xl bg-slate-950/90 hover:bg-amber-400 hover:text-slate-950 border-2 border-amber-300/80 px-4 py-2 text-xs font-display font-bold uppercase tracking-wider text-amber-200 shadow-lg cursor-pointer transition-colors"
          >
            Skip Cutscene → Duel
          </button>
        )}
    </div>
  );
};
