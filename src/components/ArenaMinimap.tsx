import React from 'react';
import {
  ArenaActorState,
  ArenaPickup,
  AwakeningOrbState,
  DomainCastState,
  DomainExpansionState,
  FIGHTER_BY_ID,
  GameModeId,
  KothZoneState,
  MAP_BY_ID,
  MapId,
  ObstacleState,
} from '../shared/gameData.ts';
import { projectToMinimapPercent } from '../game/combatMath.ts';
import { shouldViewerSeeActor } from '../game/mapLogic.ts';

interface ArenaMinimapProps {
  mapId: MapId;
  playerId: string;
  targetId: string | null;
  actors: ArenaActorState[];
  obstacles?: ObstacleState[];
  pickups?: ArenaPickup[];
  awakeningOrbs?: AwakeningOrbState[];
  kothZone?: KothZoneState | null;
  activeDomain?: DomainExpansionState | null;
  castingDomain?: DomainCastState | null;
  stormActive: boolean;
  stormRadius: number;
  stormCenterX?: number;
  stormCenterZ?: number;
  compact?: boolean;
  gameMode?: GameModeId;
}

export const ArenaMinimap: React.FC<ArenaMinimapProps> = React.memo(({
  mapId,
  playerId,
  targetId,
  actors,
  obstacles = [],
  pickups = [],
  awakeningOrbs = [],
  kothZone = null,
  activeDomain = null,
  castingDomain = null,
  stormActive,
  stormRadius,
  stormCenterX = 0,
  stormCenterZ = 0,
  compact = false,
  gameMode = 'classic',
}) => {
  const viewerActor = actors.find((x) => x.playerId === playerId);
  const arenaRadius = MAP_BY_ID[mapId].arenaRadius;
  const sizePx = compact ? 76 : 104;
  const stormPct = Math.max(8, Math.min(88, (stormRadius / Math.max(10, arenaRadius)) * 88));
  const stormPt = projectToMinimapPercent(stormCenterX, stormCenterZ, arenaRadius);
  const domainPt = activeDomain ? projectToMinimapPercent(activeDomain.centerX, activeDomain.centerZ, arenaRadius) : null;
  const castPt = castingDomain ? projectToMinimapPercent(castingDomain.centerX, castingDomain.centerZ, arenaRadius) : null;
  const kothPt = kothZone ? projectToMinimapPercent(kothZone.x, kothZone.z, arenaRadius) : null;

  return (
    <div
      data-testid="arena-minimap"
      className="relative rounded-2xl bg-white/95 border-2 border-slate-300 shadow-xs overflow-hidden shrink-0 pointer-events-none select-none"
      style={{ width: sizePx, height: sizePx }}
      aria-label="Arena Tactical Minimap"
    >
      {/* Arena outer circular boundary */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-400/70 bg-slate-100/75"
        style={{ width: '88%', height: '88%' }}
      />

      {/* Mid reference ring */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-slate-300"
        style={{ width: '48%', height: '48%' }}
      />

      {/* Active shrinking Storm Zone ring (GPU transform scale) */}
      {stormActive && (
        <div
          className="absolute rounded-full border-2 border-rose-500 bg-rose-500/10 transition-transform duration-150"
          style={{
            left: `${stormPt.leftPct}%`,
            top: `${stormPt.topPct}%`,
            width: '88%',
            height: '88%',
            transform: `translate(-50%, -50%) scale(${Math.max(0.08, stormPct / 88)})`,
          }}
        />
      )}

      {/* KOTH Hill Capture Circle */}
      {kothZone && kothPt && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500 bg-amber-400/25"
          style={{
            left: `${kothPt.leftPct}%`,
            top: `${kothPt.topPct}%`,
            width: `${Math.max(18, Math.round((kothZone.radius / Math.max(10, arenaRadius)) * 88))}%`,
            height: `${Math.max(18, Math.round((kothZone.radius / Math.max(10, arenaRadius)) * 88))}%`,
          }}
        />
      )}

      {/* Casting Domain Boundary Preview */}
      {castingDomain && castPt && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-amber-500 bg-amber-400/15"
          style={{
            left: `${castPt.leftPct}%`,
            top: `${castPt.topPct}%`,
            width: `${Math.max(16, Math.round((castingDomain.radius / Math.max(10, arenaRadius)) * 88))}%`,
            height: `${Math.max(16, Math.round((castingDomain.radius / Math.max(10, arenaRadius)) * 88))}%`,
          }}
        />
      )}

      {/* Active Domain Expansion Barrier */}
      {activeDomain && domainPt && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-purple-500 bg-purple-500/15"
          style={{
            left: `${domainPt.leftPct}%`,
            top: `${domainPt.topPct}%`,
            width: `${Math.max(22, Math.round((activeDomain.radius / Math.max(10, arenaRadius)) * 88))}%`,
            height: `${Math.max(22, Math.round((activeDomain.radius / Math.max(10, arenaRadius)) * 88))}%`,
          }}
        />
      )}

      {/* Obstacles / Buildings */}
      {obstacles.map((obs) => {
        const pt = projectToMinimapPercent(obs.x, obs.z, arenaRadius);
        return (
          <div
            key={obs.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-[2px] ${
              obs.destroyed ? 'bg-slate-300/60' : 'bg-slate-600/85'
            }`}
            style={{
              left: `${pt.leftPct}%`,
              top: `${pt.topPct}%`,
              width: compact ? 4 : 6,
              height: compact ? 4 : 6,
            }}
          />
        );
      })}

      {/* Pickups */}
      {pickups.map((pk) => {
        if (!pk.active) return null;
        const pt = projectToMinimapPercent(pk.x, pk.z, arenaRadius);
        return (
          <div
            key={pk.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
              pk.kind === 'health'
                ? 'bg-emerald-500'
                : pk.kind === 'strength'
                ? 'bg-rose-500'
                : 'bg-sky-500'
            }`}
            style={{
              left: `${pt.leftPct}%`,
              top: `${pt.topPct}%`,
              width: compact ? 3 : 4,
              height: compact ? 3 : 4,
            }}
          />
        );
      })}

      {/* Awakening Crystals */}
      {awakeningOrbs.map((orb) => {
        if (!orb.active) return null;
        const pt = projectToMinimapPercent(orb.x, orb.z, arenaRadius);
        return (
          <div
            key={orb.id}
            data-testid="minimap-awakening-orb"
            className="absolute -translate-x-1/2 -translate-y-1/2 rotate-45 bg-cyan-400 border border-amber-300 ring-2 ring-amber-400/80 animate-pulse z-20"
            style={{
              left: `${pt.leftPct}%`,
              top: `${pt.topPct}%`,
              width: compact ? 7 : 9,
              height: compact ? 7 : 9,
            }}
          />
        );
      })}

      {/* Fighters (respects stealth concealment against far enemies) */}
      {actors
        .filter((a) => shouldViewerSeeActor(a, viewerActor, gameMode))
        .map((a) => {
        const pt = projectToMinimapPercent(a.x, a.z, arenaRadius);
        const isSelf = a.playerId === playerId;
        const isTarget = a.playerId === targetId;
        const fColor = FIGHTER_BY_ID[a.fighterId]?.color ?? '#facc15';
        return (
          <div
            key={a.playerId}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border ${
              a.isKO
                ? 'opacity-30 bg-slate-400 border-slate-500'
                : isSelf
                ? 'border-slate-950 ring-2 ring-amber-400 z-10'
                : isTarget
                ? 'border-rose-600 ring-2 ring-rose-400'
                : a.stealthed
                ? 'border-emerald-700 opacity-55'
                : 'border-slate-900'
            }`}
            style={{
              left: `${pt.leftPct}%`,
              top: `${pt.topPct}%`,
              width: isSelf ? (compact ? 9 : 11) : compact ? 6 : 8,
              height: isSelf ? (compact ? 9 : 11) : compact ? 6 : 8,
              backgroundColor: a.isKO ? '#94a3b8' : fColor,
            }}
          />
        );
      })}

      <span className="absolute bottom-0.5 right-1 text-[7px] font-mono-num font-bold text-slate-500 uppercase">
        MAP
      </span>
    </div>
  );
});
