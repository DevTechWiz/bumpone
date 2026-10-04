import React, { useState } from 'react';
import { Search, Crown, Sparkles, AlertTriangle } from 'lucide-react';
import { Modal, Input, Badge, Skeleton, SkeletonAvatar } from './ui';
import { SlotItem } from '../lib/slotTypes';

export interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  slots: SlotItem[];
  isLoading?: boolean;
  onSelectSlot: (slot: SlotItem) => void;
  hasBackdrop?: boolean;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  slots,
  isLoading = false,
  onSelectSlot,
  hasBackdrop = true,
}) => {
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<'all' | 'king' | 'champion' | 'elite' | 'vanguard' | 'contender' | 'bubble'>('all');

  const filteredSlots = slots.filter((slot) => {
    const rawSearch = search.toLowerCase().trim();
    const cleanSearch = rawSearch.replace(/^@/, '').trim();
    const slotHandle = (slot.handle || '').toLowerCase().trim().replace(/^@/, '');
    const ownerHandle = (slot.owner_handle || '').toLowerCase().trim().replace(/^@/, '');
    const ownerName = (slot.owner_name || '').toLowerCase().trim();

    let matchesSearch = false;
    if (!rawSearch) {
      matchesSearch = true;
    } else if (rawSearch.startsWith('@')) {
      // Strict handle search: letters must match from start
      matchesSearch =
        cleanSearch.length > 0 &&
        (slotHandle.startsWith(cleanSearch) || ownerHandle.startsWith(cleanSearch));
    } else if (rawSearch.startsWith('#')) {
      matchesSearch = String(slot.rank) === rawSearch.slice(1);
    } else {
      matchesSearch =
        slot.title.toLowerCase().includes(rawSearch) ||
        slot.bidderName.toLowerCase().includes(rawSearch) ||
        ownerName.includes(rawSearch) ||
        slotHandle.startsWith(rawSearch) ||
        ownerHandle.startsWith(rawSearch) ||
        String(slot.rank) === rawSearch;
    }

    if (!matchesSearch) return false;

    if (filterTier === 'king') return slot.rank === 1;
    if (filterTier === 'champion') return slot.rank >= 2 && slot.rank <= 5;
    if (filterTier === 'elite') return slot.rank >= 6 && slot.rank <= 15;
    if (filterTier === 'vanguard') return slot.rank >= 16 && slot.rank <= 40;
    if (filterTier === 'contender') return slot.rank >= 41 && slot.rank <= 100;
    if (filterTier === 'bubble') return slot.rank === 100;
    return true;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasBackdrop={hasBackdrop}
      title="Top 100 Leaderboard"
      subtitle="Ranked by active value, highest first. Top up anytime to climb."
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
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${filterTier === 'all'
                  ? 'bg-white text-slate-950 font-semibold'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
            >
              All 100 Slots
            </button>
            <button
              onClick={() => setFilterTier('king')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${filterTier === 'king'
                  ? 'bg-amber-950/40 text-amber-200 border border-amber-400/50'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
            >
              <Crown className="w-3 h-3 text-amber-400" /> King (#1)
            </button>
            <button
              onClick={() => setFilterTier('champion')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${filterTier === 'champion'
                  ? 'bg-purple-950/40 text-purple-200 border border-purple-400/50'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
            >
              Champions (#2–5)
            </button>
            <button
              onClick={() => setFilterTier('elite')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${filterTier === 'elite'
                  ? 'bg-sky-950/40 text-sky-200 border border-sky-400/50'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
            >
              <Sparkles className="w-3 h-3 text-sky-300" /> Elites (#6–15)
            </button>
            <button
              onClick={() => setFilterTier('vanguard')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${filterTier === 'vanguard'
                  ? 'bg-emerald-950/40 text-emerald-200 border border-emerald-400/50'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
            >
              Vanguard (#16–40)
            </button>
            <button
              onClick={() => setFilterTier('contender')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${filterTier === 'contender'
                  ? 'bg-zinc-700 text-zinc-100 border border-zinc-600'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
            >
              Contenders (#41–100)
            </button>
            <button
              onClick={() => setFilterTier('bubble')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${filterTier === 'bubble'
                  ? 'bg-amber-950/40 text-amber-300 border border-amber-500/40'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.06]'
                }`}
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" /> Active Floor (#100)
            </button>
          </div>
        </div>

        {/* List Items in dark glass */}
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
          {isLoading || (slots.length === 0 && search === "") ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`lb-skeleton-${i}`}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3 animate-in fade-in duration-200"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Skeleton variant="rounded" width={24} height={18} className="rounded" />
                  <SkeletonAvatar size="sm" shape="rounded-lg" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <Skeleton variant="text" width="60%" className="h-3.5" />
                    <Skeleton variant="text" width="35%" className="h-2.5 opacity-60" />
                  </div>
                </div>
                <div className="text-right space-y-1 shrink-0">
                  <Skeleton variant="text" width={55} className="h-3.5 ml-auto" />
                  <Skeleton variant="text" width={70} className="h-2.5 ml-auto opacity-60" />
                </div>
              </div>
            ))
          ) : (
            filteredSlots.map((slot) => (
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
                    ${slot.activeValue.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {slot.rank === 1
                      ? '👑 Center King'
                      : slot.rank <= 10
                        ? '⚡ Top 10 Spot'
                        : slot.rank <= 50
                          ? 'Top 50 Spot'
                          : slot.rank === 100
                            ? '🛡️ Active Floor (#100)'
                            : 'Grid Spot'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
