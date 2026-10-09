import React, { useState } from 'react';
import {
  Search,
  Crown,
  Sparkles,
  AlertTriangle,
  Trophy,
  Shield,
  Zap,
  Layers,
  ChevronRight,
} from 'lucide-react';
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

type FilterTier = 'all' | 'king' | 'champion' | 'elite' | 'vanguard' | 'contender' | 'bubble';

interface TierFilterDef {
  key: FilterTier;
  label: string;
  range: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClasses: string;
  iconActiveColor?: string;
}

const TIER_FILTERS: TierFilterDef[] = [
  {
    key: 'all',
    label: 'All Slots',
    range: '#1–100',
    icon: Layers,
    activeClasses: 'bg-white text-zinc-950 font-semibold border-white shadow-sm',
    iconActiveColor: 'text-zinc-950',
  },
  {
    key: 'king',
    label: 'King',
    range: '#1',
    icon: Crown,
    activeClasses: 'bg-amber-950/40 text-amber-200 border-amber-400/50 shadow-sm shadow-amber-500/15',
    iconActiveColor: 'text-amber-400',
  },
  {
    key: 'champion',
    label: 'Champion',
    range: '#2–5',
    icon: Trophy,
    activeClasses: 'bg-purple-950/40 text-purple-200 border-purple-400/50 shadow-sm shadow-purple-500/15',
    iconActiveColor: 'text-purple-300',
  },
  {
    key: 'elite',
    label: 'Elite',
    range: '#6–15',
    icon: Sparkles,
    activeClasses: 'bg-sky-950/40 text-sky-200 border-sky-400/50 shadow-sm shadow-sky-500/15',
    iconActiveColor: 'text-sky-300',
  },
  {
    key: 'vanguard',
    label: 'Vanguard',
    range: '#16–40',
    icon: Shield,
    activeClasses: 'bg-emerald-950/40 text-emerald-200 border-emerald-400/50 shadow-sm shadow-emerald-500/15',
    iconActiveColor: 'text-emerald-300',
  },
  {
    key: 'contender',
    label: 'Contender',
    range: '#41–100',
    icon: Zap,
    activeClasses: 'bg-white/[0.14] text-white border-white/[0.25] shadow-sm',
    iconActiveColor: 'text-zinc-200',
  },
  {
    key: 'bubble',
    label: 'Floor',
    range: '#100',
    icon: AlertTriangle,
    activeClasses: 'bg-amber-950/40 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/15',
    iconActiveColor: 'text-amber-400',
  },
];

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  slots,
  isLoading = false,
  onSelectSlot,
  hasBackdrop = true,
}) => {
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState<FilterTier>('all');

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
      <div className="space-y-3.5">
        {/* Search & Tier Filters */}
        <div className="space-y-2.5">
          <Input
            placeholder="Search by title, handle (@...), or rank (#)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftAddon={<Search className="w-4 h-4" />}
          />

          {/* Segmented Filter Pills with Uniform Height, Width, and Alignment */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {TIER_FILTERS.map((tier) => {
              const Icon = tier.icon;
              const isActive = filterTier === tier.key;

              return (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => setFilterTier(tier.key)}
                  className={`h-8 shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
                    isActive
                      ? tier.activeClasses
                      : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border-white/[0.08]'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive && tier.iconActiveColor ? tier.iconActiveColor : 'text-slate-400'
                    }`}
                  />
                  <span>{tier.label}</span>
                  <span
                    className={`text-[10px] font-mono px-1 py-0.2 rounded-md ${
                      isActive
                        ? tier.key === 'all'
                          ? 'bg-black/10 text-zinc-950 font-bold'
                          : 'bg-white/[0.1] text-white/90'
                        : 'text-slate-500'
                    }`}
                  >
                    {tier.range}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List Items in dark glass with Uniform Alignment */}
        <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1 [scrollbar-width:thin]">
          {isLoading || (slots.length === 0 && search === '') ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`lb-skeleton-${i}`}
                className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3 animate-in fade-in duration-200"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Skeleton variant="rounded" width={56} height={22} className="rounded-full" />
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
          ) : filteredSlots.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-white">No listings found</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                No billboard slots match &quot;{search}&quot; within this filter tier.
              </p>
              {(search || filterTier !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilterTier('all');
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer pt-1"
                >
                  Reset search &amp; filters
                </button>
              )}
            </div>
          ) : (
            filteredSlots.map((slot) => {
              const tierStatus =
                slot.rank === 1
                  ? '👑 King of Board'
                  : slot.rank <= 5
                  ? '💎 Champion'
                  : slot.rank <= 15
                  ? '⚡ Elite'
                  : slot.rank <= 40
                  ? '🛡️ Vanguard'
                  : slot.rank === 100
                  ? '⚠️ Floor (#100)'
                  : 'Contender';

              const displayHandle = slot.owner_handle
                ? `@${slot.owner_handle.replace(/^@/, '')}`
                : slot.bidderName
                ? `@${slot.bidderName.replace(/^@/, '')}`
                : '@anonymous';

              return (
                <button
                  type="button"
                  key={slot.id}
                  onClick={() => {
                    onSelectSlot(slot);
                    onClose();
                  }}
                  className="w-full text-left p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.2] hover:bg-white/[0.06] active:scale-[0.99] flex items-center justify-between gap-3 transition-all cursor-pointer group focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/50"
                >
                  {/* Left: Fixed Rank Badge + Avatar + Title/Handle */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-14 sm:w-16 shrink-0 flex items-center justify-center">
                      <Badge variant="rank" rank={slot.rank} compact className="w-full justify-center" />
                    </div>

                    <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-white/[0.1] flex items-center justify-center shadow-inner">
                      <img
                        src={slot.imageUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover filter blur-sm opacity-30 scale-125"
                        referrerPolicy="no-referrer"
                      />
                      <img
                        src={slot.imageUrl}
                        alt={slot.title}
                        className="relative z-10 w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors truncate">
                        {slot.title}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        {displayHandle}
                      </p>
                    </div>
                  </div>

                  {/* Right: Active Value + Tier Pill + Action Arrow */}
                  <div className="flex items-center gap-2.5 shrink-0 text-right">
                    <div>
                      <span className="font-mono text-xs font-bold text-white block">
                        ${slot.activeValue.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {tierStatus}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
          <span>
            Showing <strong className="text-white font-mono">{filteredSlots.length}</strong> of{' '}
            <strong className="text-white font-mono">{slots.length}</strong> billboard slots
          </span>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            Click any row to view slot details or outbid
          </span>
        </div>
      </div>
    </Modal>
  );
};

