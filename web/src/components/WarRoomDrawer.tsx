import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Swords,
  Crown,
  Send,
  Sparkles,
  Flame,
  Skull,
  Rocket,
  Diamond,
  X,
  Radio,
  Volume2,
  VolumeX,
  AtSign,
  Hash
} from 'lucide-react';
import { BumpEvent, ChatMessage, SlotItem } from '../lib/slotTypes';
import { soundEngine } from '../lib/sound';

export interface WarRoomDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bumpHistory: BumpEvent[];
  slots: SlotItem[];
  chatMessages: ChatMessage[];
  onSendMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  onTriggerReaction: (emoji: string, e?: React.MouseEvent) => void;
  onSelectSlot: (slot: SlotItem) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

type WarRoomChannel = 'dispatch' | 'lounge' | 'kings';

export const WarRoomDrawer: React.FC<WarRoomDrawerProps> = ({
  isOpen,
  onClose,
  bumpHistory,
  slots,
  chatMessages,
  onSendMessage,
  onTriggerReaction,
  onSelectSlot,
  isMuted,
  onToggleMute,
}) => {
  const [activeChannel, setActiveChannel] = useState<WarRoomChannel>('dispatch');
  const [senderName, setSenderName] = useState('@spectator');
  // Stored handle loads post-mount: server render must match first client render.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('bumped_user_handle');
        if (saved) setSenderName(saved);
      } catch {
        // ignore
      }
    }
  }, []);
  const [messageInput, setMessageInput] = useState('');
  const [selectedSlotTag, setSelectedSlotTag] = useState<number | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, bumpHistory, isOpen, activeChannel]);

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    soundEngine.playClick();
    const handle = senderName.trim().startsWith('@') ? senderName.trim() : `@${senderName.trim()}`;
    localStorage.setItem('bumped_user_handle', handle);

    const colors = ['bg-indigo-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    onSendMessage({
      sender: handle || '@anonymous',
      avatarColor: randomColor,
      text: messageInput.trim(),
      slotTag: selectedSlotTag,
    });

    setMessageInput('');
  };

  const handleReactionClick = (emoji: string, e: React.MouseEvent) => {
    soundEngine.playClick();
    onTriggerReaction(emoji, e);
  };

  const kingSlot = slots.find((s) => s.rank === 1);

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-[#141519]/98 backdrop-blur-2xl border-l border-white/[0.12] shadow-2xl flex flex-col select-none animate-in slide-in-from-right duration-300">
      {/* Discord Header Bar */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.14] flex items-center justify-center text-neutral-200">
            <Radio className="w-4 h-4 animate-pulse text-neutral-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5 font-mono">
              <span>WAR ROOM DISPATCH</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </h2>
            <p className="text-[11px] text-neutral-400">Live battle telemetry & spectator transmissions</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMute}
            className={`p-1.5 rounded-lg border transition-colors ${
              isMuted
                ? 'bg-rose-500/15 border-rose-400/30 text-rose-300'
                : 'bg-white/[0.05] border-white/[0.1] text-neutral-300 hover:text-white'
            }`}
            title={isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

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
                <p className="font-medium">No combat displacement recorded yet.</p>
                <p className="text-[11px] text-slate-600">
                  Take over any slot or click Auto-Simulate to watch live turf battles unfold!
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
                          <span>DISPLACEMENT EVENT</span>
                        </>
                      )}
                    </span>
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>

                  <p className="text-slate-200 leading-relaxed">
                    <strong className="text-white font-semibold">{event.promotedItem.bidderName}</strong> paid{' '}
                    <span className="font-mono text-emerald-400 font-bold">${event.promotedItem.amountPaid}</span> to
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
            {chatMessages.map((msg) => (
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
        {activeChannel === 'kings' && kingSlot && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-black border border-amber-400/40 text-center relative overflow-hidden">
              <div className="w-16 h-16 rounded-2xl mx-auto overflow-hidden border-2 border-amber-400 shadow-xl mb-3">
                <img
                  src={kingSlot.imageUrl}
                  alt={kingSlot.title}
                  className="w-full h-full object-cover"
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
                  <span className="text-sm font-bold text-emerald-400">${kingSlot.amountPaid}</span>
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
                  Challenge the King (${kingSlot.amountPaid + 50})
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
        )}
      </div>

      {/* Message Input Bar (Discord-style bottom input) */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/[0.08] bg-black/40 space-y-2">
        <div className="flex items-center gap-2">
          {/* Sender Handle Input */}
          <div className="relative w-32 shrink-0">
            <AtSign className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="@handle"
              className="w-full bg-white/[0.05] text-white text-[11px] pl-6 pr-2 py-1.5 rounded-lg border border-white/[0.08] focus:border-indigo-400 focus:outline-none font-mono"
            />
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

        {/* Message Input & Submit */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Shout out to the board..."
            maxLength={140}
            className="flex-1 bg-white/[0.06] hover:bg-white/[0.08] focus:bg-white/[0.1] text-white text-xs px-3 py-2 rounded-xl border border-white/[0.1] focus:border-white/40 focus:outline-none transition-all placeholder-neutral-500"
          />
          <button
            type="submit"
            disabled={!messageInput.trim()}
            className="px-3 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 border border-zinc-500/30 disabled:opacity-40 disabled:hover:bg-zinc-700 text-white font-semibold text-xs flex items-center gap-1 shadow-md shadow-black/40 transition-all cursor-pointer"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </form>
    </div>
  );
};
