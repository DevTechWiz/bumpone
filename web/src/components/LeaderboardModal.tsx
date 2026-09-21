import React, { useState } from 'react';
import { Search, Crown, Sparkles, AlertTriangle } from 'lucide-react';
import { Modal, Input, Badge } from './ui';
import { SlotItem } from '../lib/slotTypes';

export interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  slots: SlotItem[];
  onSelectSlot: (slot: SlotItem) => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  slots,
  onSelectSlot,
}) => {
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<'all' | 'king' | 'elite' | 'lord' | 'contender' | 'bubble'>('all');

  const filteredSlots = slots.filter((slot) => {
    const matchesSearch =
      slot.title.toLowerCase().includes(search.toLowerCase()) ||
      slot.bidderName.toLowerCase().includes(search.toLowerCase()) ||
      String(slot.rank) === search.trim();

    if (!matchesSearch) return false;

    if (filterTier === 'king') return slot.rank === 1;
    if (filterTier === 'elite') return slot.rank >= 2 && slot.rank <= 13;
    if (filterTier === 'lord') return slot.rank >= 14 && slot.rank <= 54;
    if (filterTier === 'contender') return slot.rank >= 55 && slot.rank <= 99;
    if (filterTier === 'bubble') return slot.rank === 100;
    return true;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Active 100-Slot Leaderboard"
      subtitle="Ranked by active value, highest first, with live concentric tier classifications."
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Search & Tier Filters */}
        <div className="space-y-2.5">
          <Input
            placeholder="Search by title, handle (@...), or rank (#)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftAddon={<Search className="w-4 h-4" />}
          />

          <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
            <button
              onClick={() => setFilterTier('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                filterTier === 'all'
                  ? 'bg-white text-slate-950 font-semibold'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              All 100 Slots
            </button>
            <button
              onClick={() => setFilterTier('king')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${
                filterTier === 'king'
                  ? 'bg-amber-950/40 text-amber-200 border border-amber-400/50'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              <Crown className="w-3 h-3 text-amber-400" /> King (#1)
            </button>
            <button
              onClick={() => setFilterTier('elite')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${
                filterTier === 'elite'
                  ? 'bg-white/[0.1] text-white border border-white/[0.2]'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              <Sparkles className="w-3 h-3 text-slate-300" /> Elites (#2-13)
            </button>
            <button
              onClick={() => setFilterTier('lord')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${
                filterTier === 'lord'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-500/50'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              Lords (#14-54)
            </button>
            <button
              onClick={() => setFilterTier('contender')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${
                filterTier === 'contender'
                  ? 'bg-zinc-700 text-zinc-100 border border-zinc-600'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              Contenders (#55-99)
            </button>
            <button
              onClick={() => setFilterTier('bubble')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${
                filterTier === 'bubble'
                  ? 'bg-rose-950/40 text-rose-300 border border-rose-500/40'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-rose-400" /> Drop Brink (#100)
            </button>
          </div>
        </div>

        {/* List Items in dark glass */}
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
          {filteredSlots.map((slot) => (
            <div
              key={slot.id}
              onClick={() => {
                onSelectSlot(slot);
                onClose();
              }}
              className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.18] hover:bg-white/[0.06] flex items-center justify-between gap-3 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Badge variant="rank" rank={slot.rank} />
                <img
                  src={slot.imageUrl}
                  alt={slot.title}
                  className="w-8 h-8 rounded-lg object-cover bg-slate-900 shrink-0 border border-white/[0.08]"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white group-hover:text-slate-200 transition-colors truncate">
                    {slot.title}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {slot.bidderName}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono text-xs font-semibold text-white block">
                  ${slot.amountPaid.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-400">
                  {slot.rank === 1
                    ? '4x4 King Citadel'
                    : slot.rank <= 13
                    ? '2x2 Inner Orbit'
                    : slot.rank <= 54
                    ? '2x1 / 1x2 Domino Lord'
                    : slot.rank === 100
                    ? 'Drop Brink (#100)'
                    : '1x1 Contender'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
