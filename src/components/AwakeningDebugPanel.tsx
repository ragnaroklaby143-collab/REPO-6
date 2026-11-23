import React, { useState } from 'react';
import { Bug, ChevronDown, ChevronUp, RotateCcw, Sparkles, Swords, Timer, Zap } from 'lucide-react';
import type { AwakeningDebugAction, MatchAwakeningPhase } from '../shared/gameData.ts';

interface AwakeningDebugPanelProps {
  awakeningPhase: MatchAwakeningPhase;
  matchTime: number;
  cutsceneClock?: number | null;
  onAction: (action: AwakeningDebugAction) => void;
}

export const AwakeningDebugPanel: React.FC<AwakeningDebugPanelProps> = ({
  awakeningPhase,
  matchTime,
  cutsceneClock,
  onAction,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      data-testid="awakening-debug-panel"
      className="fixed top-20 left-3 z-50 w-56 rounded-xl bg-slate-950/92 border border-amber-400/60 text-white shadow-2xl pointer-events-auto"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-display font-bold uppercase tracking-wider text-amber-300 border-b border-white/10 cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <Bug className="w-3.5 h-3.5 text-amber-400" />
          Awakening Dev
        </span>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {!collapsed && (
        <div className="p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-300 bg-slate-900/90 rounded-lg px-2 py-1">
            <span>{awakeningPhase}</span>
            <span>
              {cutsceneClock !== null && cutsceneClock !== undefined
                ? `CS ${cutsceneClock.toFixed(1)}s`
                : `T ${matchTime.toFixed(1)}s`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid="debug-spawn-orbs"
              onClick={() => onAction('spawnOrbs')}
              className="flex items-center justify-center gap-1 rounded-lg bg-sky-600/80 hover:bg-sky-500 px-2 py-1.5 text-[10px] font-display font-bold uppercase cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              Spawn Orbs
            </button>
            <button
              type="button"
              data-testid="debug-trigger-cutscene"
              onClick={() => onAction('triggerCutscene')}
              className="flex items-center justify-center gap-1 rounded-lg bg-amber-600/80 hover:bg-amber-500 px-2 py-1.5 text-[10px] font-display font-bold uppercase cursor-pointer"
            >
              <Swords className="w-3 h-3" />
              Cutscene
            </button>
            <button
              type="button"
              data-testid="debug-awaken-p1"
              onClick={() => onAction('awakenP1')}
              className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 px-2 py-1.5 text-[10px] font-display font-bold uppercase cursor-pointer"
            >
              <Zap className="w-3 h-3" />
              Awaken P1
            </button>
            <button
              type="button"
              data-testid="debug-awaken-p2"
              onClick={() => onAction('awakenP2')}
              className="flex items-center justify-center gap-1 rounded-lg bg-rose-600/80 hover:bg-rose-500 px-2 py-1.5 text-[10px] font-display font-bold uppercase cursor-pointer"
            >
              <Zap className="w-3 h-3" />
              Awaken P2
            </button>
            <button
              type="button"
              data-testid="debug-time-89"
              onClick={() => onAction('setTime89')}
              className="flex items-center justify-center gap-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 px-2 py-1.5 text-[10px] font-display font-bold uppercase cursor-pointer"
            >
              <Timer className="w-3 h-3" />
              Time 1:29
            </button>
            <button
              type="button"
              data-testid="debug-reset-cds"
              onClick={() => onAction('resetCooldowns')}
              className="flex items-center justify-center gap-1 rounded-lg bg-slate-700 hover:bg-slate-600 px-2 py-1.5 text-[10px] font-display font-bold uppercase cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset CDs
            </button>
            <button
              type="button"
              data-testid="debug-fill-domain"
              onClick={() => onAction('fillDomain')}
              className="col-span-2 flex items-center justify-center gap-1 rounded-lg bg-purple-600/90 hover:bg-purple-500 px-2 py-1.5 text-[10px] font-display font-bold uppercase cursor-pointer border border-purple-300/40"
            >
              <Sparkles className="w-3 h-3" />
              +100% Domain Gauge
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
