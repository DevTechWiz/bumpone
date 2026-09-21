import React, { useState } from 'react';
import {
  Search,
  X,
  Crown,
  Sparkles,
  Shield,
  Zap,
  AlertTriangle,
  SlidersHorizontal,
  DollarSign,
  Trophy
} from 'lucide-react';
import { RankTier } from './ui/Badge';
import { CATEGORIES } from '../lib/board';

export type FilterTierOption = 'all' | 'king' | 'elite' | 'lord' | 'contender' | 'bubble';

export type TimeRangeOption = 'all' | 'today';

export interface GridFilterState {
  searchQuery: string;
  tier: FilterTierOption;
  minPrice: number | null;
  maxPrice: number | null;
  category: string;
  timeRange: TimeRangeOption;
}

export interface GridFilterBarProps {
  filterState: GridFilterState;
  onFilterChange: (next: GridFilterState) => void;
}

export const GridFilterBar: React.FC<GridFilterBarProps> = ({
  filterState,
  onFilterChange,
}) => {
  const [isPriceFilterOpen, setIsPriceFilterOpen] = useState(false);

  return (
    <div className="w-full max-w-4xl mx-auto px-3 py-1.5 flex flex-col items-center gap-1.5 z-30 select-none">
      {/* Floating Pill Container (Airbnb style) */}
      <div className="w-full bg-[#18191d]/90 backdrop-blur-xl border border-white/[0.12] rounded-2xl p-1.5 shadow-xl shadow-black/70 flex flex-wrap items-center justify-between gap-2">
        {/* Left: Search Input Pill */}
        <div className="relative flex-1 min-w-[200px] max-w-xs sm:max-w-sm">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterState.searchQuery}
            onChange={(e) =>
              onFilterChange({
                ...filterState,
                searchQuery: e.target.value,
              })
            }
            placeholder="Search project, handle (@...), rank (#)..."
            className="w-full bg-white/[0.05] hover:bg-white/[0.08] focus:bg-white/[0.09] text-xs text-white placeholder-neutral-400 pl-8 pr-7 py-1.5 rounded-xl border border-white/[0.08] focus:border-white/[0.25] focus:outline-none transition-all font-sans"
          />
          {filterState.searchQuery && (
            <button
              onClick={() => onFilterChange({ ...filterState, searchQuery: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Center: Category Tier Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-full text-xs no-scrollbar">
          <button
            type="button"
            onClick={() => onFilterChange({ ...filterState, tier: 'all' })}
            className={`px-2.5 py-1 rounded-xl font-medium transition-all shrink-0 ${
              filterState.tier === 'all'
                ? 'bg-white text-zinc-950 shadow-sm'
                : 'bg-white/[0.04] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.08] border border-white/[0.06]'
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => onFilterChange({ ...filterState, tier: 'king' })}
            className={`px-2.5 py-1 rounded-xl font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterState.tier === 'king'
                ? 'bg-amber-500 text-zinc-950 shadow-sm font-semibold'
                : 'bg-white/[0.04] text-amber-300 hover:bg-amber-500/15 border border-amber-400/20'
            }`}
          >
            <Crown className="w-3 h-3 text-amber-400" />
            <span>King (#1)</span>
          </button>

          <button
            type="button"
            onClick={() => onFilterChange({ ...filterState, tier: 'elite' })}
            className={`px-2.5 py-1 rounded-xl font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterState.tier === 'elite'
                ? 'bg-zinc-200 text-zinc-950 shadow-sm font-semibold'
                : 'bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08] border border-white/[0.08]'
            }`}
          >
            <Sparkles className="w-3 h-3 text-neutral-300" />
            <span>Elites (#2-13)</span>
          </button>

          <button
            type="button"
            onClick={() => onFilterChange({ ...filterState, tier: 'lord' })}
            className={`px-2.5 py-1 rounded-xl font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterState.tier === 'lord'
                ? 'bg-zinc-300 text-zinc-950 shadow-sm font-semibold'
                : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] border border-zinc-500/30'
            }`}
          >
            <Shield className="w-3 h-3 text-zinc-400" />
            <span>Lords (#14-54)</span>
          </button>

          <button
            type="button"
            onClick={() => onFilterChange({ ...filterState, tier: 'contender' })}
            className={`px-2.5 py-1 rounded-xl font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterState.tier === 'contender'
                ? 'bg-zinc-400 text-zinc-950 shadow-sm font-semibold'
                : 'bg-white/[0.04] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.08] border border-white/[0.06]'
            }`}
          >
            <Zap className="w-3 h-3 text-neutral-300" />
            <span>Contenders (#55-99)</span>
          </button>

          <button
            type="button"
            onClick={() => onFilterChange({ ...filterState, tier: 'bubble' })}
            className={`px-2.5 py-1 rounded-xl font-medium transition-all flex items-center gap-1 shrink-0 ${
              filterState.tier === 'bubble'
                ? 'bg-rose-500 text-white shadow-sm font-semibold animate-pulse'
                : 'bg-white/[0.04] text-rose-300 hover:bg-rose-500/15 border border-rose-400/20'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>Drop Brink (#100)</span>
          </button>
        </div>

      </div>

      {/* Category row (project boards share one Active Value system) */}
      <div className="w-full bg-[#18191d]/90 backdrop-blur-xl border border-white/[0.12] rounded-2xl px-3 py-1.5 shadow-xl shadow-black/70 flex items-center gap-1 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 shrink-0 pr-1">Boards</span>
          {['All', ...CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onFilterChange({ ...filterState, category: c })}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all shrink-0 ${
                filterState.category === c
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              {c}
            </button>
          ))}
          {/* Right: All time / Today range toggle */}
          <div className="flex items-center gap-1 shrink-0 ml-auto rounded-xl bg-black/40 border border-white/[0.08] p-0.5">
            <button
              type="button"
              onClick={() => onFilterChange({ ...filterState, timeRange: 'all' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterState.timeRange === 'all'
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Trophy className="w-3 h-3" />
              All time
            </button>
            <button
              type="button"
              onClick={() => onFilterChange({ ...filterState, timeRange: 'today' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterState.timeRange === 'today'
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              Today
            </button>
          </div>
      </div>
    </div>
  );
};
