import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Coins,
  History,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { FIGHTER_BY_ID, MAP_BY_ID } from '../shared/gameData.ts';
import {
  CloudUserProfile,
  adminResetUserStats,
  adminSetUserBanned,
  adminUpdateUserCoins,
  isAdminEmail,
  subscribeAllUsersForAdmin,
} from '../game/firebaseUsers.ts';
import { soundEngine } from '../game/soundEngine.ts';

interface AdminMonitorModalProps {
  open: boolean;
  currentUserEmail: string | null | undefined;
  onClose: () => void;
}

type StatusFilter = 'all' | 'online' | 'in-match' | 'offline' | 'banned';

function formatTs(ms: number): string {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const AdminMonitorModal: React.FC<AdminMonitorModalProps> = ({
  open,
  currentUserEmail,
  onClose,
}) => {
  const authorized = isAdminEmail(currentUserEmail);
  const [users, setUsers] = useState<CloudUserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [coinDeltaInput, setCoinDeltaInput] = useState('100');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !authorized) return;
    setLoadErr(null);
    const unsub = subscribeAllUsersForAdmin(
      (list) => {
        setUsers(list);
        if (!selectedUid && list.length > 0) {
          setSelectedUid(list[0].uid);
        }
      },
      (err) => {
        setLoadErr(err instanceof Error ? err.message : 'Unable to fetch Firestore player registry.');
      }
    );
    return () => unsub();
  }, [open, authorized]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'banned' && !u.banned) return false;
      if (filter !== 'all' && filter !== 'banned' && u.onlineStatus !== filter) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [users, search, filter]);

  const selectedUser = useMemo(
    () => users.find((u) => u.uid === selectedUid) ?? filteredUsers[0] ?? null,
    [users, selectedUid, filteredUsers]
  );

  if (!open || !authorized) return null;

  const onlineCount = users.filter((u) => u.onlineStatus === 'online').length;
  const inMatchCount = users.filter((u) => u.onlineStatus === 'in-match').length;
  const bannedCount = users.filter((u) => u.banned).length;

  const runAdminOp = async (uid: string, label: string, fn: () => Promise<void>) => {
    setBusyUid(uid);
    setActionMsg(null);
    try {
      await fn();
      setActionMsg(label);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyUid(null);
    }
  };

  const parsedCoinDelta = Math.max(1, Math.min(100000, Math.round(Number(coinDeltaInput) || 100)));

  return (
    <div
      data-testid="admin-monitor-modal"
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-2 sm:p-4 animate-fade-in"
    >
      <div className="w-full max-w-6xl h-[90dvh] rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-modal-pop">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-950">
                  Admin Monitor · Live Player Registry
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                  REALTIME FIRESTORE
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Authorized Admin: <span className="font-semibold text-slate-900">{currentUserEmail}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono-num">
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-800">
                Total: {users.length}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 font-bold text-emerald-800">
                Online: {onlineCount}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-300 font-bold text-sky-800">
                In Match: {inMatchCount}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-300 font-bold text-rose-800">
                Flagged: {bannedCount}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                soundEngine.play('uiClick');
                onClose();
              }}
              aria-label="Close Admin Monitor"
              className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-white">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players by display name or Google email..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'online', 'in-match', 'offline', 'banned'] as StatusFilter[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  soundEngine.play('uiClick');
                  setFilter(st);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-display font-bold uppercase tracking-wide border transition cursor-pointer ${
                  filter === st
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-400'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loadErr && (
          <div className="mx-4 mt-3 rounded-xl bg-rose-50 border border-rose-300 px-3 py-2 text-xs text-rose-800">
            {loadErr}
          </div>
        )}

        {/* Main Split: Player Registry List + Selected Player Inspector */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Player List */}
          <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto p-3 sm:p-4 space-y-2">
            {filteredUsers.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs">
                <Users className="w-6 h-6 mb-1.5 opacity-60" />
                <span>No accounts match the active filter.</span>
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUser?.uid === u.uid;
                const fav = FIGHTER_BY_ID[u.favoriteFighter];
                return (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => {
                      soundEngine.play('uiClick');
                      setSelectedUid(u.uid);
                    }}
                    className={`w-full text-left rounded-xl p-3 border transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-50/70 border-amber-500 ring-1 ring-amber-300 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {u.photoURL ? (
                        <img
                          src={u.photoURL}
                          alt={u.displayName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 font-display font-bold flex items-center justify-center shrink-0">
                          {u.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-display font-bold text-sm text-slate-950 truncate">
                            {u.displayName}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                              u.onlineStatus === 'in-match'
                                ? 'bg-sky-100 text-sky-800'
                                : u.onlineStatus === 'online'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {u.onlineStatus}
                          </span>
                          {u.banned && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[9px] font-bold uppercase">
                              BANNED
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 truncate">{u.email}</div>
                        <div className="text-[10px] text-slate-500 font-mono-num mt-0.5">
                          Joined {formatTs(u.createdAtMs)} · Seen {formatTs(u.lastLoginMs)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 space-y-1">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-mono-num text-xs font-bold">
                        <Coins className="w-3 h-3 text-amber-600" />
                        <span>{u.coins}</span>
                      </div>
                      <div className="text-[10px] font-mono-num text-slate-700">
                        {u.wins}W-{u.losses}L · {u.totalKOs} KO
                      </div>
                      <div className="text-[10px] font-display font-bold text-slate-600">
                        Fav: {fav?.name ?? u.favoriteFighter}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Inspector: Controls + Match History */}
          <div className="lg:col-span-5 overflow-y-auto p-4 bg-slate-50/70">
            {selectedUser ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-white border border-slate-200 p-3.5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {selectedUser.photoURL ? (
                        <img
                          src={selectedUser.photoURL}
                          alt={selectedUser.displayName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-200 flex items-center justify-center font-display font-bold">
                          {selectedUser.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-display font-bold text-base text-slate-950 truncate">
                          {selectedUser.displayName}
                        </div>
                        <div className="text-xs text-slate-600 truncate">{selectedUser.email}</div>
                      </div>
                    </div>
                    <span className="font-mono-num text-sm font-bold px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 shrink-0">
                      {selectedUser.coins} Coins
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-mono-num">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-1.5">
                      <div className="font-bold text-slate-900">{selectedUser.matchesPlayed}</div>
                      <div className="text-[9px] text-slate-500">MATCHES</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-1.5">
                      <div className="font-bold text-emerald-700">{selectedUser.wins}</div>
                      <div className="text-[9px] text-slate-500">WINS</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-1.5">
                      <div className="font-bold text-rose-600">{selectedUser.losses}</div>
                      <div className="text-[9px] text-slate-500">LOSSES</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-1.5">
                      <div className="font-bold text-amber-700">{selectedUser.totalKOs}</div>
                      <div className="text-[9px] text-slate-500">TOTAL KO</div>
                    </div>
                  </div>

                  {/* Admin Controls */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Real-Time Coin Adjustment
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={100000}
                        value={coinDeltaInput}
                        onChange={(e) => setCoinDeltaInput(e.target.value)}
                        className="w-24 h-8 px-2 rounded-lg bg-slate-50 border border-slate-300 font-mono-num text-xs font-bold text-slate-900"
                      />
                      <button
                        type="button"
                        disabled={busyUid === selectedUser.uid}
                        onClick={() => {
                          soundEngine.play('uiClick');
                          void runAdminOp(
                            selectedUser.uid,
                            `Granted +${parsedCoinDelta} Coins to ${selectedUser.displayName}`,
                            () => adminUpdateUserCoins(selectedUser.uid, selectedUser.coins + parsedCoinDelta)
                          );
                        }}
                        className="flex-1 h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-display font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Grant</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyUid === selectedUser.uid}
                        onClick={() => {
                          soundEngine.play('uiClick');
                          void runAdminOp(
                            selectedUser.uid,
                            `Deducted -${parsedCoinDelta} Coins from ${selectedUser.displayName}`,
                            () => adminUpdateUserCoins(selectedUser.uid, Math.max(0, selectedUser.coins - parsedCoinDelta))
                          );
                        }}
                        className="flex-1 h-8 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-display font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <Minus className="w-3.5 h-3.5" />
                        <span>Deduct</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        disabled={busyUid === selectedUser.uid}
                        onClick={() => {
                          soundEngine.play('uiClick');
                          void runAdminOp(
                            selectedUser.uid,
                            `Reset career stats for ${selectedUser.displayName}`,
                            () => adminResetUserStats(selectedUser.uid)
                          );
                        }}
                        className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Stats</span>
                      </button>

                      <button
                        type="button"
                        disabled={busyUid === selectedUser.uid || isAdminEmail(selectedUser.email)}
                        onClick={() => {
                          soundEngine.play('uiClick');
                          void runAdminOp(
                            selectedUser.uid,
                            selectedUser.banned
                              ? `Unbanned ${selectedUser.displayName}`
                              : `Flagged/Banned ${selectedUser.displayName}`,
                            () => adminSetUserBanned(selectedUser.uid, !selectedUser.banned)
                          );
                        }}
                        className={`h-8 px-2.5 rounded-lg border font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer transition disabled:opacity-40 ${
                          selectedUser.banned
                            ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                            : 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-800'
                        }`}
                      >
                        {selectedUser.banned ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Unban Account</span>
                          </>
                        ) : (
                          <>
                            <Ban className="w-3.5 h-3.5" />
                            <span>Flag / Ban</span>
                          </>
                        )}
                      </button>
                    </div>

                    {actionMsg && (
                      <div className="rounded-lg bg-sky-50 border border-sky-200 px-2.5 py-1.5 text-[11px] font-medium text-sky-900">
                        {actionMsg}
                      </div>
                    )}
                  </div>
                </div>

                {/* Match History Inspector */}
                <div className="rounded-xl bg-white border border-slate-200 p-3.5 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-display font-bold text-slate-900 uppercase">
                      <History className="w-4 h-4 text-sky-600" />
                      <span>Recent Match History ({selectedUser.matchHistory.length})</span>
                    </div>
                  </div>
                  {selectedUser.matchHistory.length === 0 ? (
                    <div className="py-5 text-center text-xs text-slate-500">
                      No completed cloud matches recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                      {selectedUser.matchHistory.map((m, idx) => (
                        <div
                          key={`${m.matchId}-${idx}`}
                          className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 flex items-center justify-between text-[11px]"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-display font-bold ${
                                  m.won ? 'text-emerald-700' : 'text-rose-600'
                                }`}
                              >
                                {m.won ? 'VICTORY' : 'DEFEAT'}
                              </span>
                              <span className="font-semibold text-slate-900">
                                {FIGHTER_BY_ID[m.fighterId]?.name ?? m.fighterId}
                              </span>
                              <span className="text-slate-500 truncate">
                                · {MAP_BY_ID[m.mapId]?.name ?? m.mapId}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono-num">
                              {formatTs(m.timestampMs)} · {m.mode}
                            </div>
                          </div>
                          <div className="text-right font-mono-num shrink-0">
                            <div className="font-bold text-slate-900">
                              {m.kills} KO · {m.damageDealt} DMG
                            </div>
                            <div className="text-[10px] font-bold text-amber-700">+{m.coinsEarned} Coins</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                <ShieldAlert className="w-6 h-6 mb-1.5 opacity-60" />
                <span>Select any player account to inspect details.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
