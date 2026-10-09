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
  onTriggerReaction?: (emoji: string, e?: React.MouseEvent) => void;
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
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const realtimeChannelRef = useRef<any>(null);

  // Connect Supabase Realtime postgres_changes on messages table (SEC-012: Server-authoritative identity)
  useEffect(() => {
    if (!isOpen) return;
    try {
      const supabase = createClient();
      const channel = supabase
        .channel('war_room_feed')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload: any) => {
            const row = payload?.new;
            if (row && !row.is_deleted && row.text) {
              onSendMessage({
                id: row.id,
                sender: row.author_handle
                  ? (row.author_handle.startsWith('@') ? row.author_handle : `@${row.author_handle}`)
                  : (row.author_name || '@spectator'),
                avatarColor: row.avatar_color || 'bg-indigo-500',
                text: String(row.text).slice(0, 200),
                slotTag: typeof row.slot_tag === 'number' ? row.slot_tag : undefined,
                timestamp: new Date(row.created_at).getTime(),
                isOfficial: Boolean(row.is_official),
              });
            }
          }
        )
        .subscribe();

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

    const match = messageInput.match(/#(\d+)/);
    const parsedSlotTag = match ? parseInt(match[1], 10) : undefined;
    const validSlotTag = parsedSlotTag && parsedSlotTag >= 1 && parsedSlotTag <= 100 ? parsedSlotTag : undefined;

    try {
      const res = await fetch('/api/war-room/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: messageInput.trim(),
          slotTag: validSlotTag,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSendError(data.error || 'Failed to send transmission.');
        return;
      }

      if (data.message) {
        onSendMessage(data.message);
      }

      setMessageInput('');
    } catch {
      setSendError('Transmission failed. Check network connection.');
    } finally {
      setIsSending(false);
    }
  };

  const kingSlot = slots.find((s) => s.rank === 1);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      headerIcon={<Radio className="w-4 h-4 animate-pulse text-neutral-300" />}
      title={
        <span className="flex items-center gap-1.5">
          <span>WAR ROOM DISPATCH</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        </span>
      }
      subtitle="Live billboard activity & bump stream"
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
                  Bump any billboard spot to feature your project and elevate your rank!
                </p>
              </div>
            ) : (
              bumpHistory.map((event) => {
                const isKing = event.newRank === 1;
                const isChampion = event.newRank >= 2 && event.newRank <= 5;
                const isElite = event.newRank >= 6 && event.newRank <= 15;
                const isVanguard = event.newRank >= 16 && event.newRank <= 40;
                const climbedSpots =
                  event.previousRank && event.previousRank > event.newRank
                    ? event.previousRank - event.newRank
                    : 0;

                const dethronedKing = isKing ? slots.find((s) => s.rank === 2) : null;
                const displacedSlot =
                  slots.find((s) => s.rank === event.newRank + 1 && s.id !== event.promotedItem.id) ||
                  (event.droppedItem && event.droppedItem.bidderName !== '@displaced' ? event.droppedItem : null);

                return (
                  <div
                    key={event.id}
                    onClick={() => onSelectSlot(event.promotedItem)}
                    className={`group p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                      isKing
                        ? 'bg-gradient-to-r from-amber-950/30 to-amber-900/10 border-amber-400/50 shadow-md shadow-amber-950/20 hover:border-amber-400'
                        : isChampion
                        ? 'bg-purple-950/20 border-purple-500/30 hover:border-purple-400/60'
                        : isElite
                        ? 'bg-sky-950/20 border-sky-500/30 hover:border-sky-400/60'
                        : isVanguard
                        ? 'bg-emerald-950/15 border-emerald-500/25 hover:border-emerald-400/50'
                        : 'bg-white/[0.03] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    {/* Header row: Status badge + Timestamp */}
                    <div className="flex items-center justify-between text-[10px] font-mono mb-2">
                      <span className="flex items-center gap-1.5 font-bold">
                        {isKing ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/20 border border-amber-400/40 text-amber-300">
                            <Crown className="w-3 h-3 text-amber-400" />
                            KING #1
                          </span>
                        ) : isChampion ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-400/40 text-purple-300">
                            <Swords className="w-3 h-3 text-purple-400" />
                            CHAMPION BUMP
                          </span>
                        ) : isElite ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-300">
                            <Swords className="w-3 h-3 text-sky-400" />
                            ELITE BUMP
                          </span>
                        ) : isVanguard ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                            <Swords className="w-3 h-3 text-emerald-400" />
                            VANGUARD BUMP
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">
                            <Swords className="w-3 h-3 text-rose-400" />
                            CONTENDER BUMP
                          </span>
                        )}
                      </span>
                      <span className="text-neutral-400 text-[10px]">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Main Contender Row: Avatar + Title/Handle + Value Pill */}
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-neutral-900 flex items-center justify-center">
                        {event.promotedItem.imageUrl ? (
                          <img
                            src={event.promotedItem.imageUrl}
                            alt={event.promotedItem.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-200">
                            {event.promotedItem.title.slice(0, 1)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-white truncate group-hover:text-indigo-200 transition-colors">
                            {event.promotedItem.title}
                          </h4>
                          <span className="font-mono text-emerald-400 font-bold text-[11px] shrink-0 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            ${event.promotedItem.activeValue}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 font-mono truncate">
                          by {event.promotedItem.bidderName}
                        </p>
                      </div>
                    </div>

                    {/* Progression details: Climbed / Claimed rank */}
                    <div className="text-[11px] text-neutral-300 leading-snug">
                      {climbedSpots > 0 ? (
                        <span className="text-emerald-300 font-medium flex items-center gap-1 font-mono">
                          ▲ Climbed +{climbedSpots} spots (#{event.previousRank} &rarr; #{event.newRank})
                        </span>
                      ) : isKing ? (
                        <span className="text-amber-300 font-medium">
                          Claimed sovereign monarch throne at Rank #1
                        </span>
                      ) : (
                        <span className="text-sky-300 font-medium">
                          Claimed billboard position at Rank #{event.newRank}
                        </span>
                      )}
                    </div>

                    {/* Displacement & Inspect Footer */}
                    <div className="mt-2.5 pt-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] gap-2">
                      {isKing ? (
                        dethronedKing ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectSlot(dethronedKing);
                            }}
                            className="text-amber-400/90 hover:text-amber-300 transition-colors flex items-center gap-1 font-mono text-[10px] truncate cursor-pointer"
                            title={`Inspect dethroned Monarch: ${dethronedKing.title}`}
                          >
                            <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>
                              Dethroned <strong className="underline underline-offset-2">{dethronedKing.bidderName}</strong> from #1 to #2
                            </span>
                          </span>
                        ) : (
                          <span className="text-amber-400/90 flex items-center gap-1 font-mono text-[10px]">
                            <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Dethroned previous Monarch from #1 to #2</span>
                          </span>
                        )
                      ) : displacedSlot ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSlot(displacedSlot);
                          }}
                          className="text-rose-400/90 hover:text-rose-300 transition-colors flex items-center gap-1 font-mono text-[10px] truncate cursor-pointer"
                          title={`Inspect knocked contender: ${displacedSlot.title}`}
                        >
                          <Skull className="w-3 h-3 text-rose-400 shrink-0" />
                          <span>
                            Knocked <strong className="underline underline-offset-2">{displacedSlot.bidderName}</strong> from #{event.newRank} to #{event.newRank + 1}
                          </span>
                        </span>
                      ) : (
                        <span className="text-rose-400/90 flex items-center gap-1 font-mono text-[10px]">
                          <Skull className="w-3 h-3 text-rose-400 shrink-0" />
                          <span>
                            Knocked #{event.newRank} down to #{event.newRank + 1}
                          </span>
                        </span>
                      )}

                      <span className="text-indigo-300 group-hover:text-indigo-200 group-hover:translate-x-0.5 transition-transform font-mono text-[11px] font-semibold flex items-center gap-1 shrink-0">
                        Inspect #{event.newRank} &rarr;
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* CHANNEL 2: SPECTATOR LOUNGE / SHOUTOUTS */}
        {activeChannel === 'lounge' && (
          <div className="space-y-3">
            {activeMessages.length === 0 ? (
              <div className="text-center py-10 text-slate-500 space-y-3">
                <MessageSquare className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
                <div>
                  <p className="font-semibold text-slate-300 text-xs">No transmissions yet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Be the first to send a shoutout to the live billboard!
                  </p>
                </div>
                {/* Starter quick action chips */}
                <div className="pt-2 flex flex-wrap items-center justify-center gap-1.5 max-w-xs mx-auto">
                  {[
                    { label: '👑 King of the Board #1', text: 'All eyes on King #1! 👑' },
                    { label: '🔥 Top 5 Battle', text: 'Top 5 contenders bringing the heat 🔥' },
                    { label: '⚔️ New bump coming', text: 'Plotting the next billboard bump ⚔️' },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => {
                        if (!senderHandle && onRequireAuth) {
                          onRequireAuth();
                          return;
                        }
                        setMessageInput(chip.text);
                      }}
                      className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] text-slate-300 hover:text-white transition-all cursor-pointer font-mono"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeMessages.map((msg) => {
                const taggedSlot = msg.slotTag ? slots.find((s) => s.rank === msg.slotTag) : null;
                const senderSlot = slots.find(
                  (s) =>
                    (s.bidderName && s.bidderName.toLowerCase() === msg.sender.toLowerCase()) ||
                    (s.owner_handle && `@${s.owner_handle.toLowerCase().replace(/^@/, '')}` === msg.sender.toLowerCase())
                );

                return (
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
                        <div
                          className={`w-4 h-4 rounded-full ${msg.avatarColor} flex items-center justify-center text-[9px] font-bold text-slate-950`}
                        >
                          {msg.sender.replace(/^@/, '').charAt(0).toUpperCase() || 'U'}
                        </div>
                        <span className="font-bold text-slate-200 text-[11px]">{msg.sender}</span>
                        {senderSlot && (
                          <span
                            onClick={() => onSelectSlot(senderSlot)}
                            className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[9px] font-mono border border-amber-400/30 cursor-pointer hover:bg-amber-500/25 transition-colors"
                            title={`Inspect ${senderSlot.title} (Rank #${senderSlot.rank})`}
                          >
                            #{senderSlot.rank} {senderSlot.rank === 1 ? '👑' : ''}
                          </span>
                        )}
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

                    <p className="text-slate-300 leading-relaxed pl-5 text-xs">{msg.text}</p>

                    {msg.slotTag && (
                      <div className="mt-1.5 pl-5">
                        <button
                          type="button"
                          onClick={() => {
                            if (taggedSlot) onSelectSlot(taggedSlot);
                          }}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-all ${
                            taggedSlot
                              ? 'bg-sky-500/15 border border-sky-400/35 text-sky-200 hover:bg-sky-500/25 cursor-pointer'
                              : 'bg-white/[0.05] border border-white/[0.1] text-neutral-400'
                          }`}
                          title={taggedSlot ? `Inspect Slot #${msg.slotTag}: ${taggedSlot.title}` : `Slot #${msg.slotTag}`}
                        >
                          <Hash className="w-2.5 h-2.5 text-sky-400" />
                          <span>Slot #{msg.slotTag}</span>
                          {taggedSlot && <span className="text-[9px] text-sky-300">({taggedSlot.title}) &rarr;</span>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
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
                    <span className="text-[10px] text-slate-400 block uppercase">Active Value</span>
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

      {/* Live Multiplayer Stream Reaction Dock */}
      <div className="px-3 py-2 bg-black/60 border-t border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono">
          <Radio className="w-3 h-3 text-rose-400 animate-pulse" />
          <span className="font-semibold text-neutral-300">Live Hype:</span>
        </div>
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
              type="button"
              onClick={(e) => {
                soundEngine.playClick();
                onTriggerReaction?.(item.emoji, e);
              }}
              className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.14] border border-white/[0.08] hover:border-white/20 active:scale-90 hover:scale-110 transition-all flex items-center justify-center text-sm cursor-pointer shadow-sm select-none"
              title={`Send ${item.label} (${item.emoji}) to live stream`}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Message Input Bar: Only active on the #shoutouts lounge channel */}
      {activeChannel === 'lounge' && (
        <div className="p-3 border-t border-white/[0.08] bg-black/40 space-y-2">
          {sendError && (
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] animate-in fade-in duration-150">
              {sendError}
            </div>
          )}

          {!senderHandle ? (
            /* Unauthenticated Spectator Prompt */
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-xs font-mono text-neutral-400 shrink-0">
                  @
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">Browsing as Spectator</div>
                  <div className="text-[10px] text-slate-400 truncate">Sign in with your handle to post shoutouts</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onRequireAuth}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer shrink-0"
              >
                Sign In
              </button>
            </div>
          ) : (
            /* Authenticated User Shoutout Input */
            <form onSubmit={handleSend} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => {
                      setMessageInput(e.target.value);
                      if (sendError) setSendError(null);
                    }}
                    placeholder={`Shout out as ${senderHandle.startsWith('@') ? senderHandle : `@${senderHandle}`} (type #1 to tag King)...`}
                    maxLength={140}
                    disabled={isSending}
                    className="w-full bg-white/[0.06] hover:bg-white/[0.08] focus:bg-white/[0.1] text-white text-xs px-3.5 py-2.5 rounded-xl border border-white/[0.1] focus:border-amber-400/50 focus:outline-none transition-all placeholder-neutral-500 disabled:opacity-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!messageInput.trim() || isSending}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer shrink-0"
                  title="Send Shoutout"
                >
                  {isSending ? (
                    <span className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Send</span>
                      <Send className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-neutral-500 px-1 font-mono">
                <span>Tip: Type <strong className="text-neutral-400">#rank</strong> (e.g. #1) to link a billboard slot</span>
                <span>{140 - messageInput.length} chars</span>
              </div>
            </form>
          )}
        </div>
      )}
    </Drawer>
  );
};
