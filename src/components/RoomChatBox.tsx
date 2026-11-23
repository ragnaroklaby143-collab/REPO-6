import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { FIGHTER_BY_ID, type FighterId, type RoomChatMessage } from '../shared/gameData.ts';
import { soundEngine } from '../game/soundEngine.ts';

const QUICK_PHRASES = ['Ready!', 'Good luck!', 'Watch the ring!', 'GG!'];

const LIGHT_INK: Record<FighterId, string> = {
  jm: '#b45309',
  marjohn: '#0369a1',
  prime: '#be123c',
  damen: '#b45309',
  khen: '#7e22ce',
};

interface RoomChatBoxProps {
  messages: RoomChatMessage[];
  playerId: string;
  unreadCount: number;
  isOpen: boolean;
  inMatch?: boolean;
  onToggleOpen: () => void;
  onSendMessage: (text: string) => void;
}

export const RoomChatBox: React.FC<RoomChatBoxProps> = ({
  messages,
  playerId,
  unreadCount,
  isOpen,
  inMatch = false,
  onToggleOpen,
  onSendMessage,
}) => {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [isOpen, messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean) return;
    soundEngine.unlock();
    soundEngine.play('chatPop');
    onSendMessage(clean);
    setDraft('');
  };

  const handleQuickSend = (phrase: string) => {
    soundEngine.unlock();
    soundEngine.play('chatPop');
    onSendMessage(phrase);
  };

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        data-testid="chat-toggle-btn"
        onClick={() => {
          soundEngine.unlock();
          soundEngine.play('uiClick');
          onToggleOpen();
        }}
        title="Toggle Room Chat"
        className={`ui-interactive relative inline-flex items-center gap-1.5 rounded-lg border font-semibold cursor-pointer shadow-xs ${
          inMatch
            ? 'min-h-[30px] sm:min-h-[34px] px-2 text-xs'
            : 'min-h-[36px] px-2.5 py-1 text-xs'
        } ${
          isOpen
            ? 'bg-sky-500 border-sky-700 text-white'
            : 'bg-white/95 hover:bg-slate-100 border-slate-300 text-slate-800'
        }`}
      >
        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Chat</span>
        {unreadCount > 0 && !isOpen && (
          <span
            data-testid="chat-unread-badge"
            className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono-num text-[9px] font-bold leading-tight"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          data-testid="room-chat-panel"
          className={`fixed z-45 w-[290px] sm:w-[330px] max-w-[calc(100vw-20px)] rounded-2xl bg-white border-2 border-slate-300 shadow-2xl overflow-hidden animate-modal-pop flex flex-col ${
            inMatch ? 'top-14 left-2 sm:top-16 sm:left-3' : 'bottom-20 right-3 sm:bottom-22 sm:right-6'
          }`}
        >
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-display font-bold text-slate-900 uppercase tracking-wide">
              <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
              <span>Squad Room Chat</span>
            </div>
            <button
              type="button"
              data-testid="chat-close-btn"
              onClick={() => {
                soundEngine.unlock();
                soundEngine.play('uiClick');
                onToggleOpen();
              }}
              aria-label="Close Room Chat"
              className="w-6 h-6 rounded-md hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            ref={listRef}
            data-testid="chat-message-list"
            className="h-40 sm:h-48 overflow-y-auto px-3 py-2 space-y-1.5 bg-white text-xs"
          >
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-[11px] text-slate-400 px-3">
                No messages yet. Say hello or coordinate picks with your room!
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.senderId === playerId;
                const fighterLabel = m.fighterId ? FIGHTER_BY_ID[m.fighterId]?.name : null;
                const ink = m.fighterId ? LIGHT_INK[m.fighterId] : '#334155';
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl px-2.5 py-1.5 border ${
                      mine ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 text-[10px]">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-bold text-slate-900 truncate">{m.senderName}</span>
                        {fighterLabel && (
                          <span className="font-display font-bold shrink-0" style={{ color: ink }}>
                            · {fighterLabel}
                          </span>
                        )}
                      </div>
                      <span className="text-slate-400 font-mono-num shrink-0">
                        {new Date(m.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-slate-800 break-words mt-0.5 leading-snug">{m.text}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-2.5 py-1.5 bg-slate-50 border-t border-slate-200 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => handleQuickSend(phrase)}
                className="ui-interactive shrink-0 px-2 py-0.5 rounded-lg bg-white hover:bg-amber-50 border border-slate-300 text-[10px] font-semibold text-slate-700 cursor-pointer"
              >
                {phrase}
              </button>
            ))}
          </div>

          <form
            onSubmit={handleSubmit}
            className="p-2 bg-white border-t border-slate-200 flex items-center gap-1.5"
          >
            <input
              ref={inputRef}
              type="text"
              data-testid="chat-input"
              maxLength={160}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  inputRef.current?.blur();
                  onToggleOpen();
                  return;
                }
                e.stopPropagation();
              }}
              onKeyUp={(e) => e.stopPropagation()}
              placeholder="Message room..."
              className="flex-1 h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              data-testid="chat-send-btn"
              disabled={!draft.trim()}
              className="ui-interactive h-8 px-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white font-display font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
