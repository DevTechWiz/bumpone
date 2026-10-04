import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Swords,
  Crown,
  Send,
  Radio,
  Volume2,
  VolumeX,
  Skull,
  Hash,
  AtSign,
  Lock,
} from 'lucide-react';
import { BumpEvent, Message, SlotItem } from '../lib/slotTypes';
import { soundEngine } from '../lib/sound';
import { createClient } from '../lib/supabase/client';
import { Drawer, Skeleton } from './ui';

export interface WarRoomDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bumpHistory: BumpEvent[];
  slots: SlotItem[];
  messages: Message[];
  onSendMessage: (msg: Message | Omit<Message, 'id' | 'timestamp'>) => void;
  onTriggerReaction: (emoji: string, e?: React.MouseEvent) => void;
  onSelectSlot: (slot: SlotItem) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  senderHandle?: string;
  onRequireAuth?: () => void;
}

type WarRoomChannel = 'dispatch' | 'lounge' | 'kings';

export const WarRoomDrawer: React.FC<WarRoomDrawerProps> = ({
  isOpen,
  onClose,
  bumpHistory,
  slots,
  messages = [],
  onSendMessage,
  onTriggerReaction,
  onSelectSlot,
  isMuted,
  onToggleMute,
  senderHandle,
  onRequireAuth,
}) => {
  const activeMessages = messages;
  const [activeChannel, setActiveChannel] = useState<WarRoomChannel>('dispatch');
  const [senderName, setSenderName] = useState(
    senderHandle ? (senderHandle.startsWith('@') ? senderHandle : `@${senderHandle}`) : '@spectator'
  );

  useEffect(() => {
    if (senderHandle) {
      setSenderName(senderHandle.startsWith('@') ? senderHandle : `@${senderHandle}`);
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('bumped_user_handle');
        if (saved) setSenderName(saved);
      } catch {
        // ignore
      }
    }
  }, [senderHandle]);
  const [messageInput, setMessageInput] = useState('');
  const [selectedSlotTag, setSelectedSlotTag] = useState<number | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const realtimeChannelRef = useRef<any>(null);

  // Connect Supabase Realtime Broadcast for multi-user chat synchronization
  useEffect(() => {
    if (!isOpen) return;
    try {
      const supabase = createClient();
      const channel = supabase.channel('war_room', {
        config: { broadcast: { self: false } },
      });

      channel.on('broadcast', { event: 'message' }, ({ payload }) => {
        if (payload && typeof payload.text === 'string' && payload.text.trim()) {
          // Security: Broadcast payloads can NEVER spoof official announcements
          onSendMessage({
            id: payload.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            sender: String(payload.sender || '@spectator').slice(0, 50),
            avatarColor: payload.avatarColor || 'bg-indigo-500',
            text: String(payload.text).slice(0, 200),
            slotTag: typeof payload.slotTag === 'number' ? payload.slotTag : undefined,
            timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
            isOfficial: false,
          });
        }
      });

      channel.subscribe();
      realtimeChannelRef.current = channel;

      return () => {
        supabase.removeChannel(channel);
        realtimeChannelRef.current = null;
      };
    } catch {
      // Local fallback if Supabase is offline
    }
  }, [isOpen, onSendMessage]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages, bumpHistory, isOpen, activeChannel]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || isSending) return;

    if (!senderHandle && onRequireAuth) {
      onRequireAuth();
      return;
    }

    soundEngine.playClick();
    setIsSending(true);
    setSendError(null);

    try {
      const res = await fetch('/api/war-room/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageInput.trim(),
          slotTag: selectedSlotTag,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSendError(data.error || 'Failed to send transmission.');
        return;
      }

      if (data.message) {
        onSendMessage(data.message);

        // Broadcast to other live spectators
        if (realtimeChannelRef.current) {
          try {
            realtimeChannelRef.current.send({
              type: 'broadcast',
              event: 'message',
              payload: data.message,
            });
          } catch {
            // Safe fallback
          }
        }
      }

      setMessageInput('');
    } catch {
      setSendError('Transmission failed. Check network connection.');
    } finally {
      setIsSending(false);
    }
  };

  const handleReactionClick = (emoji: string, e: React.MouseEvent) => {
    soundEngine.playClick();
    onTriggerReaction(emoji, e);
  };

  const kingSlot = slots.find((s) => s.rank === 1);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      headerIcon={<Radio className="w-4 h-4 animate-pulse text-neutral-300" />}
      title={
        <span className="flex items-center gap-1.5">
          <span>LIVE BILLBOARD DISPATCH</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        </span>
      }
      subtitle="Live billboard activity & placement stream"
      headerExtra={
        <button
          type="button"
          onClick={onToggleMute}
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            isMuted
              ? 'bg-rose-500/15 border-rose-400/30 text-rose-300'
              : 'bg-white/[0.05] border-white/[0.1] text-neutral-300 hover:text-white'
          }`}
          title={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      }
    >

      {/* Discord Channel Switcher Bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.08] bg-black/40 text-xs">
        <button
          onClick={() => {
            soundEngine.playClick();
            setActiveChannel('dispatch');
          }}
          className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all ${
            activeChannel === 'dispatch'
              ? 'bg-white/[0.12] text-white border border-white/[0.15] shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
          }`}
        >
          <Swords className="w-3.5 h-3.5 text-rose-400" />
          <span>#war-feed</span>
        </button>

        <button
          onClick={() => {
            soundEngine.playClick();
            setActiveChannel('lounge');
          }}
          className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all ${
            activeChannel === 'lounge'
              ? 'bg-white/[0.12] text-white border border-white/[0.15] shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-neutral-300" />
          <span>#shoutouts</span>
        </button>

        <button
          onClick={() => {
            soundEngine.playClick();
            setActiveChannel('kings');
          }}
          className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all ${
            activeChannel === 'kings'
              ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
          }`}
        >
          <Crown className="w-3.5 h-3.5 text-amber-400" />
          <span>#king-throne</span>
        </button>
      </div>

      {/* Floating Reaction Bar (Discord / Twitch stream style) */}
      <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between text-xs">
        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-semibold">
          Reactions:
        </span>
        <div className="flex items-center gap-1">
          {[
            { emoji: '🔥', label: 'Hype' },
            { emoji: '👑', label: 'King' },
            { emoji: '💀', label: 'R.I.P' },
            { emoji: '🚀', label: 'Rocket' },
            { emoji: '💎', label: 'Diamond' },
            { emoji: '⚔️', label: 'War' },
          ].map((item) => (
            <button
              key={item.emoji}
              onClick={(e) => handleReactionClick(item.emoji, e)}
              className="p-1 rounded-md hover:bg-white/[0.1] hover:scale-125 transition-transform active:scale-95 text-sm"
              title={`Send ${item.label}`}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Main Channel Scrollable Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-xs">
        {/* CHANNEL 1: LIVE WAR DISPATCH */}
        {activeChannel === 'dispatch' && (
          <div className="space-y-3">
            {bumpHistory.length === 0 ? (
              <div className="text-center py-12 text-slate-500 space-y-2">
                <Swords className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
                <p className="font-medium">No activity recorded yet.</p>
                <p className="text-[11px] text-slate-600">
                  Book any billboard spot to feature your project and elevate your rank!
                </p>
              </div>
            ) : (
              bumpHistory.map((event) => (
                <div
                  key={event.id}
                  className={`p-3 rounded-xl border transition-all ${
                    event.newRank === 1
                      ? 'bg-amber-950/20 border-amber-400/40 shadow-lg shadow-amber-950/20'
                      : event.newRank <= 13
                      ? 'bg-slate-900/60 border-white/[0.12]'
                      : 'bg-white/[0.03] border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span className="flex items-center gap-1 font-bold text-slate-300">
                      {event.newRank === 1 ? (
                        <>
                          <Crown className="w-3 h-3 text-amber-400 inline" />
                          <span className="text-amber-300">CORONATION #1</span>
                        </>
                      ) : (
                        <>
                          <Swords className="w-3 h-3 text-rose-400 inline" />
                          <span>BILLBOARD BUMP</span>
                        </>
                      )}
                    </span>
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <p className="text-slate-200 leading-relaxed">
                    <strong className="text-white font-semibold">{event.promotedItem.bidderName}</strong> paid{' '}
                    <span className="font-mono text-emerald-400 font-bold">${event.promotedItem.activeValue}</span> to
                    claim <strong className="text-sky-300">Rank #{event.newRank}</strong> ({event.promotedItem.title}
                    ).
                  </p>

                  <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
                    <span className="text-rose-300 flex items-center gap-1">
                      <Skull className="w-3 h-3 text-rose-400" />
                      Shoved <strong>{event.droppedItem.bidderName}</strong> from #{event.previousRank} to #{event.previousRank + 1}
                    </span>
                    <button
                      onClick={() => onSelectSlot(event.promotedItem)}
                      className="text-indigo-300 hover:text-indigo-200 hover:underline font-mono"
                    >
                      Inspect #{event.newRank} &rarr;
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* CHANNEL 2: SPECTATOR LOUNGE / SHOUTOUTS */}
        {activeChannel === 'lounge' && (
          <div className="space-y-3">
            {activeMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-xl border ${
                  msg.isOfficial
                    ? 'bg-indigo-950/20 border-indigo-400/30 text-indigo-100'
                    : 'bg-white/[0.04] border-white/[0.07]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded-full ${msg.avatarColor} flex items-center justify-center text-[9px] font-bold text-slate-950`}>
                      {msg.sender.charAt(1).toUpperCase() || 'U'}
                    </div>
                    <span className="font-bold text-slate-200 text-[11px]">{msg.sender}</span>
                    {msg.isOfficial && (
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-mono border border-indigo-400/30">
                        BOT
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed pl-5">{msg.text}</p>

                {msg.slotTag && (
                  <div className="mt-1.5 pl-5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-400/30 text-sky-300 text-[10px] font-mono">
                      <Hash className="w-2.5 h-2.5" /> Target Slot #{msg.slotTag}
                    </span>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* CHANNEL 3: KING THRONE HIGHLIGHT */}
        {activeChannel === 'kings' && (
          kingSlot ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-black border border-amber-400/40 text-center relative overflow-hidden">
                <div className="w-16 h-16 rounded-2xl mx-auto overflow-hidden border-2 border-amber-400 shadow-xl mb-3 relative flex items-center justify-center bg-black/40">
                  <img
                    src={kingSlot.imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover filter blur-md opacity-40 scale-125 pointer-events-none"
                  />
                  <img
                    src={kingSlot.imageUrl}
                    alt={kingSlot.title}
                    className="relative z-10 max-h-full max-w-full object-contain p-1"
                  />
                </div>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-200 text-xs font-semibold mb-2">
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  REIGNING MONARCH
                </span>

                <h3 className="text-base font-bold text-white">{kingSlot.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Held by <strong className="text-amber-300">{kingSlot.bidderName}</strong>
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 block uppercase">Current Bounty</span>
                    <span className="text-sm font-bold text-emerald-400">${kingSlot.activeValue}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 block uppercase">Center Footprint</span>
                    <span className="text-sm font-bold text-amber-300">4x4 Block</span>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => onSelectSlot(kingSlot)}
                    className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 transition-all"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    Bump the King (${kingSlot.activeValue + 10})
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs space-y-1.5 text-slate-400">
                <span className="font-bold text-slate-300 block font-mono">Crown Rulebook:</span>
                <p>
                  The Rank #1 King occupies the central 16-unit square of the board. Holding the throne grants maximum visibility, elevated chat status, and prominent placement across all devices.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-black border border-amber-400/20 text-center relative overflow-hidden flex flex-col items-center">
                <Skeleton variant="rounded-2xl" width={64} height={64} className="mb-3" />
                <Skeleton variant="rounded-full" width={140} height={24} className="mb-2" />
                <Skeleton variant="text" width={180} height={20} className="mb-1" />
                <Skeleton variant="text" width={110} height={14} className="mb-4 opacity-60" />
                <div className="w-full grid grid-cols-2 gap-2 mt-2">
                  <Skeleton variant="rounded-xl" height={52} />
                  <Skeleton variant="rounded-xl" height={52} />
                </div>
                <Skeleton variant="rounded-xl" width="100%" height={36} className="mt-4" />
              </div>
            </div>
          )
        )}
      </div>

      {/* Message Input Bar (Discord-style bottom input) */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/[0.08] bg-black/40 space-y-2">
        <div className="flex items-center gap-2">
          {/* Sender Handle Input (Locked to authenticated user to prevent impersonation) */}
          <div className="relative w-36 shrink-0">
            <AtSign className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={senderHandle ? (senderHandle.startsWith('@') ? senderHandle : `@${senderHandle}`) : '@spectator'}
              readOnly
              disabled
              title={senderHandle ? `Verified handle: ${senderHandle}` : "Sign in to chat with your verified @handle"}
              className="w-full bg-white/[0.04] text-neutral-300 text-[11px] pl-6 pr-6 py-1.5 rounded-lg border border-white/[0.08] cursor-not-allowed font-mono opacity-85 select-none"
            />
            {senderHandle ? (
              <span title="Verified Handle" className="absolute right-2 top-1/2 -translate-y-1/2">
                <Lock className="w-3 h-3 text-amber-400" />
              </span>
            ) : onRequireAuth ? (
              <button
                type="button"
                onClick={onRequireAuth}
                className="text-[9px] text-amber-400 hover:text-amber-300 absolute right-2 top-1/2 -translate-y-1/2 font-semibold underline cursor-pointer"
              >
                Sign In
              </button>
            ) : (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <Lock className="w-3 h-3 text-neutral-500" />
              </span>
            )}
          </div>

          {/* Target Slot Tag (Optional) */}
          <div className="relative w-28 shrink-0">
            <Hash className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="number"
              min={1}
              max={100}
              value={selectedSlotTag || ''}
              onChange={(e) => setSelectedSlotTag(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Slot #"
              className="w-full bg-white/[0.05] text-white text-[11px] pl-6 pr-2 py-1.5 rounded-lg border border-white/[0.08] focus:border-indigo-400 focus:outline-none font-mono"
            />
          </div>
        </div>

        {sendError && (
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] animate-in fade-in duration-150">
            {sendError}
          </div>
        )}

        {/* Message Input & Submit */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => {
              setMessageInput(e.target.value);
              if (sendError) setSendError(null);
            }}
            placeholder={senderHandle ? "Shout out to the board..." : "Sign in to send a transmission..."}
            maxLength={140}
            disabled={isSending}
            className="flex-1 bg-white/[0.06] hover:bg-white/[0.08] focus:bg-white/[0.1] text-white text-xs px-3 py-2 rounded-xl border border-white/[0.1] focus:border-white/40 focus:outline-none transition-all placeholder-neutral-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!messageInput.trim() || isSending}
            className="px-3 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 border border-zinc-500/30 disabled:opacity-40 disabled:hover:bg-zinc-700 text-white font-semibold text-xs flex items-center gap-1 shadow-md shadow-black/40 transition-all cursor-pointer"
          >
            {isSending ? (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
          </button>
        </div>
      </form>
    </Drawer>
  );
};
