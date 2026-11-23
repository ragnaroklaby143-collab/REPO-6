import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKIN_PRICES,
  getSkinPrice,
  isSkinUnlocked,
  makeSkinUnlockKey,
  purchaseSkin,
} from './shopLogic';
import {
  loadAccountStore,
  loginOrCreateAccount,
  unlockAccountSkin,
  type StorageLike,
} from './accountStore';

function makeMemoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem(k) {
      return data.get(k) ?? null;
    },
    setItem(k, v) {
      data.set(k, v);
    },
  };
}

test('Default skins are free (0) while Special costs 1,000 and Ascended costs 5,000', () => {
  assert.equal(SKIN_PRICES.classic, 0);
  assert.equal(SKIN_PRICES.special, 1000);
  assert.equal(SKIN_PRICES.ascended, 5000);
  assert.equal(getSkinPrice('classic'), 0);
  assert.equal(getSkinPrice('special'), 1000);
  assert.equal(getSkinPrice('ascended'), 5000);

  for (const fid of ['marjohn', 'prime', 'damen', 'khen', 'jm'] as const) {
    assert.equal(isSkinUnlocked([], fid, 'classic'), true);
    assert.equal(isSkinUnlocked(undefined, fid, 'classic'), true);
    assert.equal(isSkinUnlocked([], fid, 'special'), false);
    assert.equal(isSkinUnlocked([], fid, 'ascended'), false);
  }
});

test('purchaseSkin enforces coin balance, deducts 1000/5000 cleanly, and prevents duplicate purchase', () => {
  const deniedSpec = purchaseSkin({
    coins: 999,
    unlockedSkins: [],
    fighterId: 'jm',
    skinId: 'special',
  });
  assert.equal(deniedSpec.ok, false);
  assert.equal(deniedSpec.reason, 'insufficient_coins');
  assert.equal(deniedSpec.nextCoins, 999);
  assert.deepEqual(deniedSpec.nextUnlockedSkins, []);

  const boughtSpec = purchaseSkin({
    coins: 6500,
    unlockedSkins: [],
    fighterId: 'jm',
    skinId: 'special',
  });
  assert.equal(boughtSpec.ok, true);
  assert.equal(boughtSpec.cost, 1000);
  assert.equal(boughtSpec.nextCoins, 5500);
  assert.deepEqual(boughtSpec.nextUnlockedSkins, ['jm:special']);
  assert.equal(isSkinUnlocked(boughtSpec.nextUnlockedSkins, 'jm', 'special'), true);
  assert.equal(isSkinUnlocked(boughtSpec.nextUnlockedSkins, 'prime', 'special'), false);

  const dupSpec = purchaseSkin({
    coins: boughtSpec.nextCoins,
    unlockedSkins: boughtSpec.nextUnlockedSkins,
    fighterId: 'jm',
    skinId: 'special',
  });
  assert.equal(dupSpec.ok, false);
  assert.equal(dupSpec.reason, 'already_unlocked');
  assert.equal(dupSpec.nextCoins, 5500);

  const deniedAsc = purchaseSkin({
    coins: 4999,
    unlockedSkins: boughtSpec.nextUnlockedSkins,
    fighterId: 'jm',
    skinId: 'ascended',
  });
  assert.equal(deniedAsc.ok, false);
  assert.equal(deniedAsc.reason, 'insufficient_coins');

  const boughtAsc = purchaseSkin({
    coins: boughtSpec.nextCoins,
    unlockedSkins: boughtSpec.nextUnlockedSkins,
    fighterId: 'jm',
    skinId: 'ascended',
  });
  assert.equal(boughtAsc.ok, true);
  assert.equal(boughtAsc.cost, 5000);
  assert.equal(boughtAsc.nextCoins, 500);
  assert.deepEqual(boughtAsc.nextUnlockedSkins, ['jm:special', 'jm:ascended']);
});

test('accountStore persists unlockedSkins across reload', () => {
  const storage = makeMemoryStorage();
  let store = loadAccountStore(storage);
  const created = loginOrCreateAccount(store, 'SkinCollector', 1000, storage);
  assert.ok(created);
  store = created.store;
  // Give player 5100 coins via store update for test
  store.accounts.skincollector.coins = 5100;

  const unlockKey = makeSkinUnlockKey('prime', 'ascended');
  const unlocked = unlockAccountSkin(store, 'SkinCollector', unlockKey, 5000, storage);
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.account?.coins, 100);
  assert.deepEqual(unlocked.account?.unlockedSkins, ['prime:ascended']);

  const reloaded = loadAccountStore(storage);
  assert.equal(reloaded.accounts.skincollector.coins, 100);
  assert.deepEqual(reloaded.accounts.skincollector.unlockedSkins, ['prime:ascended']);
});
