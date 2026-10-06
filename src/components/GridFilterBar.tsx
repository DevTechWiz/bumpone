import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  X,
  Crown,
  Sparkles,
  Shield,
  Zap,
  Trophy,
  ChevronDown,
  Layers,
  Tag,
  Check,
} from 'lucide-react';
import { CATEGORIES } from '../lib/board';

export type FilterTierOption =
  | 'all'
  | 'king'
  | 'champion'
  | 'elite'
  | 'vanguard'
  | 'contender';

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
  className?: string;
}

interface TierOptionDef {
  key: FilterTierOption;
  label: string;
  shortLabel: string;
  range: string;
  icon: React.ReactNode;
  colorClass: string;
}

const TIER_OPTIONS: TierOptionDef[] = [
  {
    key: 'all',
    label: 'All Levels',
    shortLabel: 'All Levels',
    range: '#1–100',
    icon: <Layers className="w-3.5 h-3.5 text-neutral-400" />,
    colorClass: 'text-neutral-300',
  },
  {
    key: 'king',
    label: 'King Citadel',
    shortLabel: 'King #1',
    range: '#1',
    icon: <Crown className="w-3.5 h-3.5 text-amber-400" />,
    colorClass: 'text-amber-300',
  },
  {
    key: 'champion',
    label: 'Champions',
    shortLabel: 'Champions',
    range: '#2–5',
    icon: <span className="text-xs">💎</span>,
    colorClass: 'text-purple-300',
  },
  {
    key: 'elite',
    label: 'Inner Elites',
    shortLabel: 'Elites',
    range: '#6–15',
    icon: <Sparkles className="w-3.5 h-3.5 text-sky-400" />,
    colorClass: 'text-sky-300',
  },
  {
    key: 'vanguard',
    label: 'Vanguard',
    shortLabel: 'Vanguard',
    range: '#16–40',
    icon: <Shield className="w-3.5 h-3.5 text-emerald-400" />,
    colorClass: 'text-emerald-300',
  },
  {
    key: 'contender',
    label: 'Contenders',
    shortLabel: 'Contenders',
    range: '#41–100',
    icon: <Zap className="w-3.5 h-3.5 text-zinc-300" />,
    colorClass: 'text-zinc-300',
  },
];

const GridFilterBarComponent: React.FC<GridFilterBarProps> = ({
  filterState,
  onFilterChange,
  className = '',
}) => {
  const [isTierMenuOpen, setIsTierMenuOpen] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);

  const tierMenuRef = useRef<HTMLDivElement>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (tierMenuRef.current && !tierMenuRef.current.contains(target)) {
        setIsTierMenuOpen(false);
      }
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(target)) {
        setIsCategoryMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTierMenuOpen(false);
        setIsCategoryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const activeTierDef =
    TIER_OPTIONS.find((t) => t.key === filterState.tier) ?? TIER_OPTIONS[0];

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 select-none ${className}`}>
      {/* 1. SEARCH BAR */}
      <div className="relative w-36 sm:w-44 md:w-52 lg:w-60 shrink-0">
        <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={filterState.searchQuery}
          onChange={(e) =>
            onFilterChange({
              ...filterState,
              searchQuery: e.target.value,
            })
          }
          placeholder="Search handle, #rank..."
          className="w-full h-8 sm:h-8.5 bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-xs text-white placeholder-neutral-500 pl-8 pr-6 rounded-xl border border-white/[0.08] focus:border-white/[0.25] focus:outline-none transition-all font-sans"
        />
        {filterState.searchQuery && (
          <button
            onClick={() => onFilterChange({ ...filterState, searchQuery: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
            title="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 2. LEVEL / TIER HIGHLIGHTS DROPDOWN */}
      <div className="relative" ref={tierMenuRef}>
        <button
          type="button"
          onClick={() => {
            setIsTierMenuOpen((prev) => !prev);
            setIsCategoryMenuOpen(false);
          }}
          className={`h-8 sm:h-8.5 px-2.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
            filterState.tier !== 'all'
              ? 'bg-white/[0.12] text-white border-white/[0.28] shadow-sm'
              : 'bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08] border-white/[0.08]'
          }`}
          title="Highlight Slots based on Level"
        >
          {activeTierDef.icon}
          <span className="hidden xs:inline truncate max-w-[100px] sm:max-w-[120px]">
            {activeTierDef.shortLabel}
          </span>
          <ChevronDown
            className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-200 ${
              isTierMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isTierMenuOpen && (
          <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-52 bg-[#16171d]/98 backdrop-blur-2xl border border-white/[0.14] rounded-xl shadow-2xl p-1 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex items-center justify-between border-b border-white/[0.06] mb-0.5">
              <span>Highlight Level</span>
              <span>Ranks</span>
            </div>
            {TIER_OPTIONS.map((tier) => {
              const isSelected = filterState.tier === tier.key;
              return (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => {
                    onFilterChange({ ...filterState, tier: tier.key });
                    setIsTierMenuOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-white text-zinc-950 font-semibold'
                      : 'text-neutral-300 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {tier.icon}
                    <span className={isSelected ? 'text-zinc-950' : tier.colorClass}>
                      {tier.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-mono ${
                        isSelected ? 'text-zinc-700' : 'text-neutral-500'
                      }`}
                    >
                      {tier.range}
                    </span>
                    {isSelected && <Check className="w-3 h-3 text-zinc-950 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. CATEGORY DROPDOWN */}
      <div className="relative" ref={categoryMenuRef}>
        <button
          type="button"
          onClick={() => {
            setIsCategoryMenuOpen((prev) => !prev);
            setIsTierMenuOpen(false);
          }}
          className={`h-8 sm:h-8.5 px-2.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
            filterState.category !== 'All'
              ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40 shadow-sm'
              : 'bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08] border-white/[0.08]'
          }`}
          title="Filter by Category"
        >
          <Tag className="w-3.5 h-3.5 text-neutral-400" />
          <span className="hidden xs:inline truncate max-w-[85px] sm:max-w-[110px]">
            {filterState.category === 'All' ? 'Categories' : filterState.category}
          </span>
          <ChevronDown
            className={`w-3 h-3 opacity-60 ml-0.5 transition-transform duration-200 ${
              isCategoryMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isCategoryMenuOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-44 bg-[#16171d]/98 backdrop-blur-2xl border border-white/[0.14] rounded-xl shadow-2xl p-1 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => {
                onFilterChange({ ...filterState, category: 'All' });
                setIsCategoryMenuOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                filterState.category === 'All'
                  ? 'bg-white text-zinc-950 font-semibold'
                  : 'text-neutral-300 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <span>All Categories</span>
              {filterState.category === 'All' && (
                <Check className="w-3 h-3 text-zinc-950 shrink-0" />
              )}
            </button>
            <div className="h-px bg-white/[0.08] my-0.5" />
            {CATEGORIES.map((c) => {
              const isSelected = filterState.category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onFilterChange({ ...filterState, category: c });
                    setIsCategoryMenuOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-white text-zinc-950 font-semibold'
                      : 'text-neutral-300 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <span>{c}</span>
                  {isSelected && <Check className="w-3 h-3 text-zinc-950 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. ALL-TIME AND 24HR TOGGLE */}
      <div className="flex items-center gap-0.5 rounded-xl bg-black/40 border border-white/[0.08] p-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onFilterChange({ ...filterState, timeRange: 'all' })}
          className={`h-7 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
            filterState.timeRange === 'all'
              ? 'bg-white text-zinc-950 shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="All-time volume and ranks"
        >
          <Trophy className="w-3 h-3 text-amber-400" />
          <span className="hidden sm:inline">All time</span>
          <span className="sm:hidden">All</span>
        </button>
        <button
          type="button"
          onClick={() => onFilterChange({ ...filterState, timeRange: 'today' })}
          className={`h-7 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
            filterState.timeRange === 'today'
              ? 'bg-white text-zinc-950 shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Activity in the last 24 hours"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>24h</span>
        </button>
      </div>
    </div>
  );
};

export const GridFilterBar = React.memo(GridFilterBarComponent);
