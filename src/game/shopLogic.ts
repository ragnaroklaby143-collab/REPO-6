import type { FighterId, SkinId } from '../shared/gameData.ts';

export const SKIN_PRICES: Record<SkinId, number> = {
  classic: 0,
  special: 1000,
  ascended: 5000,
};

export function makeSkinUnlockKey(fighterId: FighterId, skinId: SkinId): string {
  return `${fighterId}:${skinId}`;
}

export function getSkinPrice(skinId: SkinId): number {
  return SKIN_PRICES[skinId] ?? 0;
}

export function isSkinUnlocked(
  unlockedSkins: readonly string[] | null | undefined,
  fighterId: FighterId,
  skinId: SkinId
): boolean {
  if (skinId === 'classic') return true;
  if (!Array.isArray(unlockedSkins)) return false;
  return unlockedSkins.includes(makeSkinUnlockKey(fighterId, skinId));
}

export interface SkinPurchaseResult {
  ok: boolean;
  reason?: 'already_unlocked' | 'insufficient_coins';
  cost: number;
  nextCoins: number;
  nextUnlockedSkins: string[];
  unlockKey: string;
}

export function purchaseSkin(params: {
  coins: number;
  unlockedSkins: readonly string[] | null | undefined;
  fighterId: FighterId;
  skinId: SkinId;
}): SkinPurchaseResult {
  const unlockKey = makeSkinUnlockKey(params.fighterId, params.skinId);
  const currentList = Array.isArray(params.unlockedSkins) ? [...params.unlockedSkins] : [];
  const safeCoins = Math.max(0, Math.round(params.coins));

  if (isSkinUnlocked(currentList, params.fighterId, params.skinId)) {
    return {
      ok: false,
      reason: 'already_unlocked',
      cost: 0,
      nextCoins: safeCoins,
      nextUnlockedSkins: currentList,
      unlockKey,
    };
  }

  const cost = getSkinPrice(params.skinId);
  if (safeCoins < cost) {
    return {
      ok: false,
      reason: 'insufficient_coins',
      cost,
      nextCoins: safeCoins,
      nextUnlockedSkins: currentList,
      unlockKey,
    };
  }

  return {
    ok: true,
    cost,
    nextCoins: safeCoins - cost,
    nextUnlockedSkins: [...currentList, unlockKey],
    unlockKey,
  };
}
