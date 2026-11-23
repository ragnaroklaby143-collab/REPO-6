import React, { useEffect, useMemo, useState } from 'react';
import { FIGHTER_BY_ID, type FighterId, type SkinId } from '../shared/gameData.ts';
import { renderCutscenePortrait } from '../game/cutscenePortraitRenderer.ts';

export interface DomainCutInBanner {
  id: string;
  casterName: string;
  fighterId: FighterId;
  skinId?: SkinId;
  domainName: string;
  primaryHex: number;
  isClash?: boolean;
  challengerName?: string;
  challengerFighterId?: FighterId;
  challengerSkinId?: SkinId;
  challengerDomainName?: string;
}

interface DomainCutInOverlayProps {
  banner: DomainCutInBanner | null;
}

/**
 * Slim mid-screen diagonal manga Domain Expansion cut-in strip.
 * Keeps the 3D arena visible above and below while framing the caster's 3D face
 * directly inside the center of the glowing line itself.
 */
export const DomainCutInOverlay: React.FC<DomainCutInOverlayProps> = React.memo(({ banner }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!banner) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 1650);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const fighter = banner ? FIGHTER_BY_ID[banner.fighterId] : FIGHTER_BY_ID.khen;
  const accentCss = banner
    ? `#${banner.primaryHex.toString(16).padStart(6, '0')}`
    : '#a855f7';

  const casterFaceUrl = useMemo(() => {
    if (!banner) return '';
    return renderCutscenePortrait(banner.fighterId, banner.skinId ?? 'ascended', 'domain-face');
  }, [banner?.fighterId, banner?.skinId]);

  const challengerFaceUrl = useMemo(() => {
    if (!banner?.isClash || !banner.challengerFighterId) return '';
    return renderCutscenePortrait(
      banner.challengerFighterId,
      banner.challengerSkinId ?? 'ascended',
      'domain-face'
    );
  }, [banner?.isClash, banner?.challengerFighterId, banner?.challengerSkinId]);

  return (
    <div
      data-testid="domain-cutin-overlay"
      aria-hidden={!visible}
      className={`fixed inset-0 z-[60] pointer-events-none flex items-center justify-center overflow-hidden transition-opacity duration-200 ${
        visible && banner ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Single Slim Diagonal Mid-Screen Strip (Arena stays visible above & below) */}
      <div
        className={`relative w-[108%] -rotate-2 bg-slate-950/94 border-y-2 sm:border-y-[3px] h-[72px] sm:h-24 px-5 sm:px-10 shadow-[0_0_32px_rgba(2,6,23,0.9)] transition-transform duration-200 ${
          visible && banner ? 'translate-x-0 scale-100' : '-translate-x-10 scale-95'
        }`}
        style={{
          borderColor: accentCss,
          boxShadow: `0 0 28px ${accentCss}55, 0 8px 24px rgba(2,6,23,0.85)`,
        }}
      >
        <div className="max-w-5xl h-full mx-auto flex items-center justify-between gap-2 sm:gap-5">
          {/* Left: Domain Expansion Header */}
          <div className="flex-1 min-w-0 flex flex-col items-end sm:items-start text-right sm:text-left">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className="font-display text-[9px] sm:text-xs font-black tracking-[0.2em] uppercase px-1.5 sm:px-2 py-0.5 text-slate-950 shrink-0"
                style={{ backgroundColor: accentCss }}
              >
                {banner?.isClash ? 'DOMAIN CLASH' : 'DOMAIN EXPANSION'}
              </span>
              <span className="hidden md:inline font-manga text-lg tracking-widest text-white/85">
                領域展開
              </span>
            </div>
            <div className="font-display text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-300 truncate max-w-full mt-0.5">
              {banner?.casterName ?? fighter.name}
              {banner?.isClash && banner.challengerName ? ` vs ${banner.challengerName}` : ''}
            </div>
          </div>

          {/* Center: Character Face Cut-In Framed Directly Inside the Strip */}
          <div
            data-testid="domain-cutin-face"
            className="relative h-full shrink-0 flex items-center justify-center"
          >
            <div
              className="relative h-full w-24 sm:w-36 overflow-hidden border-x-[3px] -skew-x-12 flex items-center justify-center bg-slate-900"
              style={{
                borderColor: accentCss,
                backgroundImage: `radial-gradient(circle at center, ${accentCss}44 0%, #020617 78%)`,
              }}
            >
              {banner?.isClash && challengerFaceUrl ? (
                <div className="w-full h-full flex items-center justify-center skew-x-12">
                  {casterFaceUrl && (
                    <img
                      src={casterFaceUrl}
                      alt={banner.casterName}
                      className="w-1/2 h-full object-cover object-center scale-105"
                    />
                  )}
                  <div className="w-0.5 h-full bg-white shadow-[0_0_8px_#fff]" />
                  <img
                    src={challengerFaceUrl}
                    alt={banner.challengerName ?? 'Challenger'}
                    className="w-1/2 h-full object-cover object-center scale-105"
                  />
                </div>
              ) : casterFaceUrl ? (
                <img
                  src={casterFaceUrl}
                  alt={banner?.casterName ?? fighter.name}
                  className="w-full h-full object-cover object-center skew-x-12 scale-105"
                />
              ) : (
                <span
                  className="font-manga text-lg sm:text-2xl skew-x-12"
                  style={{ color: accentCss }}
                >
                  {fighter.name}
                </span>
              )}
            </div>
          </div>

          {/* Right: Domain Title */}
          <div className="flex-1 min-w-0 pr-2 sm:pr-0 text-left sm:text-right">
            <div className="font-manga text-xs sm:text-xl md:text-2xl tracking-wider text-white uppercase leading-[1.08] line-clamp-2 drop-shadow">
              {banner?.domainName ?? ''}
            </div>
            {banner?.isClash && banner.challengerDomainName ? (
              <div className="font-display text-[9px] sm:text-xs font-bold text-rose-300 tracking-wider uppercase truncate">
                VS {banner.challengerDomainName}
              </div>
            ) : (
              <div className="font-manga text-[10px] sm:text-sm tracking-widest text-white/75 md:hidden">
                領域展開
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
