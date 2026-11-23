# Koopal Clash Security Specification (Phase 0 TDD)

## 1. Data Invariants
- Every document in `/users/{userId}` must have `uid == userId`, `uid == request.auth.uid` on owner creation, and `isValidId(userId)`.
- Verified email (`request.auth.token.email_verified == true`) is required for all writes and admin checks.
- Admin access is strictly restricted to `request.auth.token.email == 'sullenshades@gmail.com'` (with `email_verified == true`) or an existing `/admins/{request.auth.uid}` record.
- Players can only `get`, `create`, and `update` their own `/users/{request.auth.uid}` profile; `list` across `/users` is strictly restricted to admins (no PII scraping).
- Self-created accounts must initialize with `role == 'player'`, `banned == false`, `coins == 100`, `wins == 0`, `losses == 0`, `totalKOs == 0`, `matchesPlayed == 0`, empty `matchHistory`, and server timestamps (`createdAt == request.time`, `lastLogin == request.time`).
- Non-admin updates cannot mutate `uid`, `role`, `banned`, `createdAt`, or decrease `losses`/`matchesPlayed`, and cannot increment `coins` by more than `200` per match commit.
- `matchHistory` is capped at `<= 15` entries, and all string fields enforce explicit `.size()` limits.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read/list on `/users`: `auth = null` -> DENIED.
2. Non-owner `get` on `/users/victimUid`: `auth.uid = 'attacker'` -> DENIED.
3. Non-admin `list` query on `/users`: `auth.email = 'player@gmail.com'` -> DENIED.
4. Spoofed admin email without verification: `auth.token = { email: 'sullenshades@gmail.com', email_verified: false }` -> DENIED.
5. Self-assigned admin role on create: `create /users/attacker { ..., role: 'admin' }` -> DENIED.
6. Inflated starting coins on create: `create /users/attacker { ..., coins: 999999 }` -> DENIED.
7. Ghost field shadow update: `update /users/attacker { ..., isSuperUser: true }` -> DENIED.
8. Client timestamp forgery: `create /users/attacker { ..., createdAt: Timestamp(1999) }` -> DENIED.
9. Owner attempting to unban self: `update /users/attacker { banned: false }` -> DENIED.
10. Owner attempting massive coin cheat: `update /users/attacker { coins: existing.coins + 50000 }` -> DENIED.
11. Resource exhaustion ID poisoning (`1500`-char document ID or `displayName.size() > 64`) -> DENIED.
12. Client writing directly to `/admins/{uid}` -> DENIED.
