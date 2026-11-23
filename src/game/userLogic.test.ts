import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_EMAIL,
  GOOGLE_BONUS_COINS,
  GUEST_STARTING_COINS,
  canEnterArena,
  isAdminEmail,
  shouldGrantGoogleBonus,
} from './userLogic.ts';
import {
  calculateMatchCoinReward,
  createGuestSession,
  loadGuestSession,
  recordGuestMatchReward,
  unlockGuestSkin,
  type StorageLike,
} from './accountStore.ts';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

test('Google Sign-In bonus (+1,000 Coins), Guest Mode (0 Coins), and Admin gate behave properly', () => {
  assert.equal(GOOGLE_BONUS_COINS, 1000);
  assert.equal(GUEST_STARTING_COINS, 0);
  assert.equal(ADMIN_EMAIL, 'sullenshades@gmail.com');

  assert.equal(isAdminEmail('sullenshades@gmail.com'), true);
  assert.equal(isAdminEmail('  SULLENSHADES@gmail.com  '), true);
  assert.equal(isAdminEmail('guest@koopal.gg'), false);

  assert.equal(shouldGrantGoogleBonus(null), true);
  assert.equal(shouldGrantGoogleBonus({}), true);
  assert.equal(shouldGrantGoogleBonus({ googleBonusClaimed: false }), true);
  assert.equal(shouldGrantGoogleBonus({ googleBonusClaimed: true }), false);

  // Guest can enter arena without Google account, unless banned or disconnected
  assert.equal(
    canEnterArena({
      isPlaceholderConfig: false,
      hasCloudUser: false,
      hasLocalAccount: false,
      isGuest: true,
      isBanned: false,
      connectionStatus: 'connected',
    }).allowed,
    true
  );

  // Unauthenticated non-guest cannot enter arena when live config is active
  assert.equal(
    canEnterArena({
      isPlaceholderConfig: false,
      hasCloudUser: false,
      hasLocalAccount: false,
      isGuest: false,
      isBanned: false,
      connectionStatus: 'connected',
    }).allowed,
    false
  );

  // Banned accounts are always blocked even in guest mode
  assert.equal(
    canEnterArena({
      isPlaceholderConfig: false,
      hasCloudUser: false,
      hasLocalAccount: false,
      isGuest: true,
      isBanned: true,
      connectionStatus: 'connected',
    }).allowed,
    false
  );
});

test('GuestSession starts with 0 Coins in session storage, earns match rewards, and unlocks skins', () => {
  const mem = createMemoryStorage();
  const initial = createGuestSession('GuestHero', mem);
  assert.equal(initial.coins, 0);
  assert.equal(initial.displayName, 'GuestHero');
  assert.equal(loadGuestSession(mem)?.coins, 0);

  const reward = calculateMatchCoinReward({
    won: true,
    kills: 2,
    damageDealt: 180,
    isTrainingMode: false,
  });
  const afterMatch = recordGuestMatchReward(initial, reward, true, 2, mem);
  assert.equal(afterMatch.coins, reward.total);
  assert.equal(afterMatch.wins, 1);
  assert.equal(afterMatch.kills, 2);

  const failBuy = unlockGuestSkin(afterMatch, 'khen:crimson', 9999, mem);
  assert.equal(failBuy.ok, false);

  const okBuy = unlockGuestSkin(afterMatch, 'khen:crimson', 50, mem);
  assert.equal(okBuy.ok, true);
  assert.equal(okBuy.guest.coins, reward.total - 50);
  assert.deepEqual(okBuy.guest.unlockedSkins, ['khen:crimson']);
});
