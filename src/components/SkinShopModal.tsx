import React, { useEffect, useState } from 'react';
import { Check, Coins, Lock, ShoppingBag, Sparkles, X } from 'lucide-react';
import {
  FIGHTER_BY_ID,
  FIGHTERS,
  FighterId,
  SKIN_LABELS,
  SKIN_ORDER,
  SkinId,
  getFighterSkinMeta,
} from '../shared/gameData.ts';
import { getSkinPrice, isSkinUnlocked } from '../game/shopLogic.ts';
import { TekkenStagePreview } from './TekkenStagePreview.tsx';
import { soundEngine } from '../game/soundEngine.ts';

interface SkinShopModalProps {
  open: boolean;
  coins: number;
  unlockedSkins: string[];
  equippedFighterId: FighterId;
  equippedSkinId: SkinId;
  initialFighterId?: FighterId;
  initialSkinId?: SkinId;
  onPurchase: (fighterId: FighterId, skinId: SkinId) => Promise<{ ok: boolean; error?: string }>;
  onEquip: (fighterId: FighterId, skinId: SkinId) => void;
  onClose: () => void;
}

export const SkinShopModal: React.FC<SkinShopModalProps> = ({
  open,
  coins,
  unlockedSkins,
  equippedFighterId,
  equippedSkinId,
  initialFighterId,
  initialSkinId,
  onPurchase,
  onEquip,
  onClose,
}) => {
  const [inspectFighterId, setInspectFighterId] = useState<FighterId>(
    initialFighterId ?? equippedFighterId
  );
  const [inspectSkinId, setInspectSkinId] = useState<SkinId>(
    initialSkinId ?? equippedSkinId
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setInspectFighterId(initialFighterId ?? equippedFighterId);
    setInspectSkinId(initialSkinId ?? equippedSkinId);
    setStatusMsg(null);
  }, [open, initialFighterId, initialSkinId, equippedFighterId, equippedSkinId]);

  if (!open) return null;

  const fighterSpec = FIGHTER_BY_ID[inspectFighterId];
  const inspectMeta = getFighterSkinMeta(inspectFighterId, inspectSkinId);
  const inspectPrice = getSkinPrice(inspectSkinId);
  const inspectOwned = isSkinUnlocked(unlockedSkins, inspectFighterId, inspectSkinId);

  const handleBuy = async (sid: SkinId) => {
    const key = `${inspectFighterId}:${sid}`;
    setBusyKey(key);
    setStatusMsg(null);
    soundEngine.unlock();
    const res = await onPurchase(inspectFighterId, sid);
    setBusyKey(null);
    if (res.ok) {
      soundEngine.play('loginSuccess');
      const meta = getFighterSkinMeta(inspectFighterId, sid);
      setStatusMsg({
        text: `Unlocked & equipped ${fighterSpec.name} — ${meta.name}!`,
        ok: true,
      });
    } else {
      soundEngine.play('lockedError');
      setStatusMsg({
        text: res.error || 'Purchase failed.',
        ok: false,
      });
    }
  };

  return (
    <div
      data-testid="skin-shop-modal"
      className="fixed inset-0 z-[70] bg-slate-950/70 flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-modal-pop">
        {/* Shop Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 bg-slate-950 text-white border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-wide leading-tight">
                ITEM SHOP · FIGHTER SKINS
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                Classic free for all · Ascended 500 Coins · Special 1,000 Coins
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div
              data-testid="shop-coins-balance"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/15 border border-amber-400/50 text-amber-300 font-mono-num text-xs sm:text-sm font-bold"
            >
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{coins}</span>
            </div>
            <button
              type="button"
              data-testid="close-shop-btn"
              onClick={() => {
                soundEngine.unlock();
                soundEngine.play('uiClick');
                onClose();
              }}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              aria-label="Close Item Shop"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Fighter Tabs */}
        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 grid grid-cols-5 gap-1.5 sm:px-6">
          {FIGHTERS.map((f) => {
            const active = inspectFighterId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`shop-fighter-${f.id}`}
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.play('uiSelect');
                  setInspectFighterId(f.id);
                  setStatusMsg(null);
                }}
                className={`px-2 py-1.5 rounded-xl border text-center transition cursor-pointer ${
                  active
                    ? 'bg-white border-slate-900 ring-1 ring-slate-900 shadow-xs'
                    : 'bg-white/70 border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="w-full h-1 rounded-full mb-1" style={{ backgroundColor: f.color }} />
                <div className="font-display font-bold text-[11px] sm:text-xs text-slate-900 truncate">
                  {f.name}
                </div>
              </button>
            );
          })}
        </div>

        {/* Body: 3D Preview + 3 Tier Cards */}
        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 overflow-y-auto">
          {/* Left 3D Preview */}
          <div
            className="md:col-span-5 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex flex-col justify-between"
            style={{
              borderColor: `${inspectMeta.accentColor}99`,
              backgroundImage: `radial-gradient(circle at 50% 44%, ${inspectMeta.accentColor}22, rgba(248, 250, 252, 0.96) 74%)`,
            }}
          >
            <div className="px-3.5 pt-3 pb-1 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {fighterSpec.name} · {SKIN_LABELS[inspectSkinId]}
                </div>
                <div className="font-display text-lg font-bold text-slate-950 truncate">
                  {inspectMeta.name}
                </div>
                <div className="text-[11px] text-slate-600">{inspectMeta.tagline}</div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-lg text-[10px] font-mono-num font-bold shrink-0 ${
                  inspectOwned
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {inspectPrice === 0 ? 'FREE' : inspectOwned ? 'OWNED' : `${inspectPrice} COINS`}
              </span>
            </div>

            <div className="w-full h-[210px] sm:h-[240px]">
              <TekkenStagePreview fighterId={inspectFighterId} skinId={inspectSkinId} />
            </div>

            <div className="px-3.5 py-2 bg-white/90 border-t border-slate-200 text-[10px] text-slate-600 flex items-center justify-between">
              <span>Drag to rotate 3D model</span>
              <span className="font-semibold text-slate-800">
                {inspectOwned ? 'Ready to Equip' : 'Locked Skin'}
              </span>
            </div>
          </div>

          {/* Right Skin Tier Cards */}
          <div className="md:col-span-7 flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              {SKIN_ORDER.map((sid) => {
                const meta = getFighterSkinMeta(inspectFighterId, sid);
                const price = getSkinPrice(sid);
                const owned = isSkinUnlocked(unlockedSkins, inspectFighterId, sid);
                const inspected = inspectSkinId === sid;
                const equipped =
                  equippedFighterId === inspectFighterId && equippedSkinId === sid;
                const canAfford = coins >= price;
                const isBusy = busyKey === `${inspectFighterId}:${sid}`;

                return (
                  <div
                    key={sid}
                    data-testid={`shop-skin-card-${sid}`}
                    onClick={() => {
                      soundEngine.unlock();
                      soundEngine.play('uiClick');
                      setInspectSkinId(sid);
                    }}
                    className={`rounded-xl border p-3 sm:p-3.5 transition cursor-pointer flex items-center justify-between gap-3 ${
                      inspected
                        ? 'bg-amber-50/60 border-slate-900 ring-1 ring-slate-900 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl border-2 border-slate-900/20 shrink-0 flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: meta.accentColor }}
                      >
                        {sid === 'special' ? (
                          <Sparkles className="w-4 h-4 text-white drop-shadow" />
                        ) : !owned ? (
                          <Lock className="w-4 h-4 text-slate-950/75" />
                        ) : (
                          <Check className="w-4 h-4 text-slate-950" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-bold text-sm text-slate-950">
                            {meta.name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[9px] font-bold uppercase tracking-wider text-slate-700">
                            {SKIN_LABELS[sid]}
                          </span>
                          {price === 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase">
                              Auto-Unlocked
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 truncate mt-0.5">{meta.tagline}</div>
                      </div>
                    </div>

                    <div
                      className="shrink-0 flex flex-col items-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {owned ? (
                        <button
                          type="button"
                          data-testid={`shop-equip-${sid}`}
                          disabled={equipped}
                          onClick={() => {
                            soundEngine.unlock();
                            soundEngine.play('uiSelect');
                            setInspectSkinId(sid);
                            onEquip(inspectFighterId, sid);
                            setStatusMsg({
                              text: `Equipped ${fighterSpec.name} — ${meta.name}!`,
                              ok: true,
                            });
                          }}
                          className={`min-h-[36px] px-3.5 rounded-xl font-display font-bold text-xs tracking-wide transition ${
                            equipped
                              ? 'bg-emerald-500 text-white cursor-default'
                              : 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                          }`}
                        >
                          {equipped ? 'EQUIPPED ✓' : 'EQUIP'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            data-testid={`shop-buy-${sid}`}
                            disabled={!canAfford || isBusy}
                            onClick={() => {
                              setInspectSkinId(sid);
                              void handleBuy(sid);
                            }}
                            className={`min-h-[36px] px-3.5 rounded-xl font-display font-bold text-xs tracking-wide inline-flex items-center gap-1.5 transition ${
                              canAfford
                                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500 cursor-pointer shadow-xs'
                                : 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed'
                            }`}
                          >
                            <Coins className="w-3.5 h-3.5" />
                            <span>{isBusy ? 'BUYING...' : `BUY ${price}`}</span>
                          </button>
                          {!canAfford && (
                            <span className="text-[10px] font-medium text-rose-600">
                              Need {price - coins} more coins
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {statusMsg && (
              <div
                data-testid="shop-status-msg"
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold border ${
                  statusMsg.ok
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-rose-50 border-rose-300 text-rose-800'
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-600 flex items-center justify-between gap-2">
              <span>Earn Coins from matches &amp; KOs in 1v1 or Squad Arenas.</span>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer shrink-0"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
