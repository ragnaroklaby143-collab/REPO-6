import type { FighterId, MapId, SkinId } from '../shared/gameData.ts';

export const ADMIN_EMAIL = 'sullenshades@gmail.com';
export const MAX_MATCH_HISTORY = 15;
export const GOOGLE_BONUS_COINS = 1000;
export const GUEST_STARTING_COINS = 0;

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === ADMIN_EMAIL;
}

export type OnlineStatus = 'online' | 'in-match' | 'offline';

export interface CloudMatchHistoryEntry {
  matchId: string;
  mapId: MapId;
  fighterId: FighterId;
  won: boolean;
  kills: number;
  damageDealt: number;
  coinsEarned: number;
  mode: string;
  timestampMs: number;
}

export interface CloudUserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'player' | 'admin';
  onlineStatus: OnlineStatus;
  coins: number;
  googleBonusClaimed?: boolean;
  wins: number;
  losses: number;
  totalKOs: number;
  matchesPlayed: number;
  favoriteFighter: FighterId;
  unlockedSkins: string[];
  equippedSkins?: Partial<Record<FighterId, SkinId>>;
  matchHistory: CloudMatchHistoryEntry[];
  banned: boolean;
  createdAtMs: number;
  lastLoginMs: number;
}

export function shouldGrantGoogleBonus(profile: { googleBonusClaimed?: boolean } | null | undefined): boolean {
  if (!profile) return true;
  return profile.googleBonusClaimed !== true;
}

export function computeFavoriteFighterFromHistory(
  history: CloudMatchHistoryEntry[],
  fallback: FighterId
): FighterId {
  if (history.length === 0) return fallback;
  const counts = new Map<FighterId, number>();
  for (const h of history) {
    counts.set(h.fighterId, (counts.get(h.fighterId) ?? 0) + 1);
  }
  let top = fallback;
  let topCount = -1;
  for (const [fid, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count;
      top = fid;
    }
  }
  return top;
}

export interface ArenaEntryGateParams {
  isPlaceholderConfig: boolean;
  hasCloudUser: boolean;
  hasLocalAccount: boolean;
  isGuest?: boolean;
  isBanned: boolean;
  connectionStatus?: 'connecting' | 'connected' | 'disconnected';
}

export function canEnterArena(params: ArenaEntryGateParams): {
  allowed: boolean;
  reason: string | null;
} {
  if (params.isBanned) {
    return {
      allowed: false,
      reason: 'This account is currently flagged/suspended.',
    };
  }
  const signedIn = params.isGuest
    ? true
    : params.isPlaceholderConfig
    ? params.hasCloudUser || params.hasLocalAccount
    : params.hasCloudUser;
  if (!signedIn) {
    return {
      allowed: false,
      reason: 'Sign in with Google or continue as Guest to play.',
    };
  }
  if (params.connectionStatus && params.connectionStatus !== 'connected') {
    return {
      allowed: false,
      reason: 'Connecting to arena server...',
    };
  }
  return { allowed: true, reason: null };
}

