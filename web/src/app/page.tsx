"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Zap,
  Radio,
  Skull,
  Search,
  RotateCcw,
  Shuffle,
  Compass,
  Volume2,
  VolumeX,
  HelpCircle,
} from 'lucide-react';
import { Button } from '../components/ui';
import type { SlotItem, BumpEvent, BoardStats, ChatMessage, FloatingReaction } from '../lib/slotTypes';
import {
  CATEGORIES,
  MIN_TOP_UP,
  buildProfiles,
  sortBoard,
  rankOf,
  quoteTopUp,
  recomputeRank,
  toSlotItem,
  type Profile,
} from '../lib/board';
import { safeGetJSON, safeSet, safeRemove } from '../lib/storage';
import { GridBoard } from '../components/GridBoard';
import { TakeOverModal, type TopUpOrder } from '../components/TakeOverModal';
import { BumpNotification } from '../components/BumpNotification';
import { GraveyardDrawer } from '../components/GraveyardDrawer';
import { LeaderboardModal } from '../components/LeaderboardModal';
import { SlotDetailModal } from '../components/SlotDetailModal';
import { CosmicBackground } from '../components/CosmicBackground';
import { RadarMiniMap } from '../components/RadarMiniMap';
import { GridFilterBar, type GridFilterState } from '../components/GridFilterBar';
import { WarRoomDrawer } from '../components/WarRoomDrawer';
import { ReactionCanvas } from '../components/ReactionCanvas';
import { RulesModal } from '../components/RulesModal';
import { soundEngine } from '../lib/sound';
import { getSlotCoordinate, type GridOrientation } from '../lib/concentricGrid';

const STORAGE_KEY_PROFILES = 'bumped_profiles_v2';
const STORAGE_KEY_OFFBOARD = 'bumped_offboard_v2';

const INITIAL_WAR_ROOM_CHATS: ChatMessage[] = [
  {
    id: 'chat-init-1',
    sender: '@grid_sentinel',
    avatarColor: 'bg-indigo-500',
    text: 'WAR ROOM ACTIVE. Active Value decides everything. King rules the 4x4 center.',
    timestamp: Date.now() - 7200000,
    isOfficial: true,
  },
  {
    id: 'chat-init-2',
    sender: '@solana_surfer',
    avatarColor: 'bg-sky-500',
    text: 'Watching the Center King #1 throne. Who is going to top up past the sovereign?',
    slotTag: 1,
    timestamp: Date.now() - 3600000,
  },
  {
    id: 'chat-init-3',
    sender: '@neon_hunter',
    avatarColor: 'bg-rose-500',
    text: 'Rank #100 is dangerously close to getting shoved off the wall!',
    slotTag: 100,
    timestamp: Date.now() - 1200000,
  },
];

const SIM_COMPETITORS = [
  { title: 'Nova Quantum Labs', handle: '@novalabs', imageUrl: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=500&auto=format&fit=crop&q=80', linkUrl: 'https://github.com', category: 'AI' },
  { title: 'Starlight Collective', handle: '@starlight', imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80', linkUrl: 'https://openai.com', category: 'AI' },
  { title: 'Vortex Protocol', handle: '@vortex_fi', imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=500&auto=format&fit=crop&q=80', linkUrl: 'https://stripe.com', category: 'Apps' },
  { title: 'Apex Celestial Syndicate', handle: '@apex_king', imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=500&auto=format&fit=crop&q=80', linkUrl: 'https://vercel.com', category: 'Tech' },
];

export default function Home() {
  // 1. Core state: profiles (canonical domain) + off-board keep-list.
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const saved = safeGetJSON<Profile[]>(STORAGE_KEY_PROFILES);
    if (saved && Array.isArray(saved) && saved.length > 0 && typeof saved[0].active_value === 'number') {
      return saved;
    }
    return buildProfiles();
  });
  const [offboard, setOffboard] = useState<Profile[]>(() => {
    const saved = safeGetJSON<Profile[]>(STORAGE_KEY_OFFBOARD);
    return Array.isArray(saved) ? saved : [];
  });
  const seqRef = useRef(100000);

  // 2. UI and modal state (mirrors reference App).
  const [isTakeOverOpen, setIsTakeOverOpen] = useState(false);
  const [targetSlotToBump, setTargetSlotToBump] = useState<SlotItem | null>(null);
  const [isGraveyardOpen, setIsGraveyardOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [highlightedRank, setHighlightedRank] = useState<number | null>(null);
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);
  const [gridOrientation, setGridOrientation] = useState<GridOrientation>('landscape');
  const [latestBumpEvent, setLatestBumpEvent] = useState<BumpEvent | null>(null);
  const [isAutoSimulate, setIsAutoSimulate] = useState(false);
  const [isWarRoomOpen, setIsWarRoomOpen] = useState(false);
  // Mute preference loads post-mount: server has no localStorage, so the
  // first render must match the server (unmuted) to avoid hydration mismatch.
  const [isMuted, setIsMuted] = useState(false);
  useEffect(() => {
    setIsMuted(soundEngine.getIsMuted());
  }, []);
  const [bumpHistory, setBumpHistory] = useState<BumpEvent[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_WAR_ROOM_CHATS);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [filterState, setFilterState] = useState<GridFilterState>({
    searchQuery: '',
    tier: 'all',
    minPrice: null,
    maxPrice: null,
    category: 'All',
    timeRange: 'all',
  });

  const handleToggleMute = () => {
    const muted = soundEngine.toggleMute();
    setIsMuted(muted);
  };

  const handleTriggerReaction = (emoji: string, e?: React.MouseEvent) => {
    const x = e ? e.clientX : (typeof window !== 'undefined' ? window.innerWidth * 0.75 : 600) + (Math.random() - 0.5) * 120;
    const y = e ? e.clientY : (typeof window !== 'undefined' ? window.innerHeight * 0.85 : 600);
    const newReaction: FloatingReaction = {
      id: `rx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      emoji,
      x,
      y,
    };
    setReactions((prev) => [...prev, newReaction]);
  };

  const handleRemoveReaction = (id: string) => {
    setReactions((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSendMessage = (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMsg: ChatMessage = {
      ...msg,
      id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, newMsg]);
  };

  // Global top-100 slots derived from canonical ordering.
  const slots: SlotItem[] = useMemo(() => {
    const pool =
      filterState.category === 'All'
        ? profiles
        : profiles.filter((p) => p.category === filterState.category);
    return sortBoard(pool).slice(0, 100).map((p, i) => toSlotItem(p, i + 1));
  }, [profiles, filterState.category]);

  // Spotlight/dim set for tier + search + value-range + time filters.
  const matchingRanks = useMemo<Set<number> | null>(() => {
    const isQueryActive = Boolean(filterState.searchQuery.trim());
    const isTierActive = filterState.tier !== 'all';
    const isValueActive = filterState.minPrice !== null || filterState.maxPrice !== null;
    const isTodayActive = filterState.timeRange === 'today';
    if (!isQueryActive && !isTierActive && !isValueActive && !isTodayActive) return null;
    const query = filterState.searchQuery.toLowerCase().trim();
    const dayAgo = Date.now() - 24 * 3600000;
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const set = new Set<number>();
    slots.forEach((slot) => {
      if (query) {
        const matchName = slot.title.toLowerCase().includes(query);
        const matchHandle = slot.bidderName.toLowerCase().includes(query);
        const matchRank = `#${slot.rank}` === query || String(slot.rank) === query;
        if (!matchName && !matchHandle && !matchRank) return;
      }
      if (isTierActive) {
        if (filterState.tier === 'king' && slot.rank !== 1) return;
        if (filterState.tier === 'elite' && (slot.rank < 2 || slot.rank > 13)) return;
        if (filterState.tier === 'lord' && (slot.rank < 14 || slot.rank > 54)) return;
        if (filterState.tier === 'contender' && (slot.rank < 55 || slot.rank > 99)) return;
        if (filterState.tier === 'bubble' && slot.rank !== 100) return;
      }
      if (filterState.minPrice !== null && slot.amountPaid < filterState.minPrice) return;
      if (filterState.maxPrice !== null && slot.amountPaid > filterState.maxPrice) return;
      if (isTodayActive) {
        const prof = byId.get(slot.id);
        if (!prof || prof.last_bump_at < dayAgo) return;
      }
      set.add(slot.rank);
    });
    return set;
  }, [slots, filterState]);

  const hoveredSlot = useMemo(() => {
    if (!hoveredRank) return null;
    return slots.find((s) => s.rank === hoveredRank) || null;
  }, [slots, hoveredRank]);

  const hoveredCoord = useMemo(() => {
    if (!hoveredRank) return null;
    return getSlotCoordinate(hoveredRank, gridOrientation);
  }, [hoveredRank, gridOrientation]);

  useEffect(() => {
    safeSet(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    safeSet(STORAGE_KEY_OFFBOARD, JSON.stringify(offboard));
  }, [offboard]);

  // Entry floor: active value of #100 (informational; minimum top-up is $10).
  const entryFloor = slots.length >= 100 ? slots[99].amountPaid : 0;

  const stats = useMemo(() => {
    const totalValue = slots.reduce((acc, s) => acc + s.amountPaid, 0);
    return {
      totalSlots: 100,
      activeSlotsCount: Math.min(100, slots.length),
      priceFloor: entryFloor,
      rank1Bid: slots[0]?.amountPaid || 0,
      rank10Bid: slots[9]?.amountPaid || 0,
      totalBidsVolume: totalValue,
      totalBumpsCount: offboard.length,
    };
  }, [slots, entryFloor, offboard.length]);

  const recordBump = useCallback((args: {
    profile: Profile;
    previousRank: number | null;
    newRank: number;
    casualty: Profile | null;
  }) => {
    const promotedItem = toSlotItem(args.profile, args.newRank, true);
    const droppedItem = args.casualty
      ? toSlotItem(args.casualty, 101)
      : promotedItem;
    const bumpEvt: BumpEvent = {
      id: `bump-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: Date.now(),
      promotedItem,
      droppedItem,
      previousRank: args.previousRank ?? 101,
      newRank: args.newRank,
    };
    setLatestBumpEvent(bumpEvt);
    setBumpHistory((prev) => [bumpEvt, ...prev.slice(0, 49)]);
    setHighlightedRank(args.newRank);
    setTimeout(() => setHighlightedRank(null), 3500);
    if (args.newRank === 1) {
      soundEngine.playCoronation();
      handleTriggerReaction('👑');
    } else if (args.casualty) {
      soundEngine.playDrop();
      handleTriggerReaction('⚔️');
    } else {
      soundEngine.playShove();
      handleTriggerReaction('🔥');
    }
    setChatMessages((prev) => [
      ...prev,
      {
        id: `chat-event-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        sender: args.profile.handle,
        avatarColor: args.newRank === 1 ? 'bg-amber-400' : 'bg-indigo-500',
        text:
          args.newRank === 1
            ? `👑 CROWN CONQUERED! Top-up landed $${args.profile.active_value} active value to seize Center King #1.`
            : `⚔️ Climbed to Rank #${args.newRank} at $${args.profile.active_value}, shifting competitors outward.`,
        slotTag: args.newRank,
        timestamp: Date.now(),
        isOfficial: true,
      },
    ]);
  }, []);

  // Live mirror of profiles for event handlers (avoids stale closures).
  const profilesRef = useRef<Profile[]>(profiles);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  // Canonical purchase engine (mock stand-in for provider + webhook):
  // recompute final position from the amount paid against the live board.
  // Everyone is retained (infinite ranking); the off-board mirror feeds the drawer.
  const handleProcessTopUp = useCallback((order: TopUpOrder) => {
    const prev = profilesRef.current;
    const topUp = Math.max(MIN_TOP_UP, Math.floor(order.topUp));
    let working: Profile[];
    let previousRank: number | null;
    let base: Profile;
    const existing =
      order.currentValue > 0
        ? prev.find((p) => p.active_value === order.currentValue && p.name === order.title)
        : undefined;
    if (existing) {
      previousRank = rankOf(prev, existing.id);
      base = { ...existing, active_value: existing.active_value + topUp, times_bumped: existing.times_bumped + 1, last_bump_at: Date.now() };
      working = prev.map((p) => (p.id === existing.id ? base : p));
    } else {
      previousRank = null;
      base = {
        id: `slot-${Date.now()}`, seq: seqRef.current++, name: order.title, handle: order.handle,
        category: (CATEGORIES as readonly string[]).includes(order.category) ? (order.category as Profile['category']) : 'AI',
        active_value: order.currentValue + topUp, imageUrl: order.imageUrl, linkUrl: order.linkUrl,
        peak_rank: 101, times_bumped: 1, times_climbed: 0, views: 0, shares: 0, joined_days_ago: 0,
        last_bump_at: Date.now(),
        journey: [], reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
      };
      working = [...prev, base];
    }
    const newRank = recomputeRank(
      working.filter((p) => p.id !== base.id),
      base.active_value,
      base.seq
    );
    const ordered = sortBoard(working);
    const casualty = ordered.length > 100 ? ordered[100] : null;
    const finalProfiles = ordered.map((p) => {
      if (p.id !== base.id) return p;
      const r = ordered.findIndex((x) => x.id === base.id) + 1;
      const improved = previousRank !== null && r < previousRank;
      return {
        ...p,
        peak_rank: Math.min(p.peak_rank, r),
        times_climbed: p.times_climbed + (improved ? 1 : 0),
        journey: [...p.journey, r],
      };
    });
    setProfiles(finalProfiles);
    if (casualty) {
      setOffboard((prevG) =>
        prevG.some((x) => x.id === casualty.id) ? prevG : [{ ...casualty }, ...prevG].slice(0, 50)
      );
    }
    recordBump({ profile: { ...base }, previousRank, newRank, casualty });
  }, [recordBump]);

  // Live simulation: existing-holder top-ups (carry-forward demo), new entries, off-board reclaims.
  const handleSimulateRandomBump = useCallback(() => {
    const ordered = sortBoard(profiles);
    if (ordered.length === 0) return;
    const roll = Math.random();
    if (roll < 0.12 && offboard.length > 0) {
      // Reclaim: off-board profile tops up past #100.
      const returning = offboard[0];
      const target = ordered[Math.min(99, ordered.length - 1)];
      const topUp = quoteTopUp(returning.active_value, target.active_value);
      setOffboard((prev) => prev.slice(1));
      handleProcessTopUp({
        title: returning.name, handle: returning.handle, linkUrl: returning.linkUrl,
        imageUrl: returning.imageUrl, category: returning.category,
        topUp, resultingValue: returning.active_value + topUp, currentValue: returning.active_value,
      });
      return;
    }
    if (roll < 0.5) {
      // Existing holder climbs via top-up (carry-forward demo).
      const idx = 5 + Math.floor(Math.random() * Math.min(55, ordered.length - 6));
      const p = ordered[idx];
      const above = ordered[Math.max(0, idx - 1 - Math.floor(Math.random() * 8))];
      const topUp = quoteTopUp(p.active_value, above.active_value);
      handleProcessTopUp({
        title: p.name, handle: p.handle, linkUrl: p.linkUrl, imageUrl: p.imageUrl,
        category: p.category, topUp, resultingValue: p.active_value + topUp, currentValue: p.active_value,
      });
      return;
    }
    // Fresh entry at/above the floor.
    const pick = SIM_COMPETITORS[Math.floor(Math.random() * SIM_COMPETITORS.length)];
    const r2 = Math.random();
    let amount: number;
    if (r2 < 0.15 && ordered.length > 0) {
      amount = ordered[0].active_value + Math.floor(Math.random() * 40) + 10;
    } else if (r2 < 0.45 && ordered.length >= 10) {
      amount = ordered[9].active_value + Math.floor(Math.random() * 20) + 10;
    } else {
      const floor = ordered.length >= 100 ? ordered[99].active_value : 0;
      amount = Math.max(MIN_TOP_UP, floor + 10 + Math.floor(Math.random() * 15));
    }
    handleProcessTopUp({
      title: pick.title, handle: pick.handle, linkUrl: pick.linkUrl, imageUrl: pick.imageUrl,
      category: pick.category, topUp: amount, resultingValue: amount, currentValue: 0,
    });
  }, [profiles, offboard, handleProcessTopUp]);

  useEffect(() => {
    if (!isAutoSimulate) return;
    const interval = setInterval(() => {
      handleSimulateRandomBump();
    }, 6000);
    return () => clearInterval(interval);
  }, [isAutoSimulate, handleSimulateRandomBump]);

  const handleResetBoard = () => {
    if (typeof window !== 'undefined' && window.confirm('Reset board back to standard initial state?')) {
      setProfiles(buildProfiles());
      setOffboard([]);
      safeRemove(STORAGE_KEY_PROFILES);
      safeRemove(STORAGE_KEY_OFFBOARD);
    }
  };

  // Deep linking (?rank=X and ?bid=true).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rankParam = params.get('rank');
      const bidParam = params.get('bid');
      if (rankParam) {
        const targetRank = parseInt(rankParam, 10);
        if (!isNaN(targetRank) && targetRank >= 1 && targetRank <= 100) {
          const match = slots.find((s) => s.rank === targetRank);
          if (match) {
            setSelectedSlot(match);
            setHighlightedRank(match.rank);
          }
        }
      }
      if (bidParam === 'true') {
        setIsTakeOverOpen(true);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.length]);

  // Global power-user keyboard shortcuts.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        soundEngine.playClick();
        setIsTakeOverOpen(true);
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        soundEngine.playClick();
        setIsGraveyardOpen((prev) => !prev);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        soundEngine.playClick();
        setIsLeaderboardOpen((prev) => !prev);
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        soundEngine.playClick();
        setIsWarRoomOpen((prev) => !prev);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        soundEngine.playClick();
        setIsRulesOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsTakeOverOpen(false);
        setIsGraveyardOpen(false);
        setIsLeaderboardOpen(false);
        setIsWarRoomOpen(false);
        setIsRulesOpen(false);
        setSelectedSlot(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const existingHandles = useMemo(
    () => profiles.slice(0, 60).map((p) => ({ id: p.id, title: p.name, activeValue: p.active_value })),
    [profiles]
  );

  return (
    <div className="h-screen w-screen bg-[#121316] text-neutral-100 flex flex-col selection:bg-white/20 selection:text-white relative overflow-hidden">
      <CosmicBackground />

      <BumpNotification
        event={latestBumpEvent}
        onDismiss={() => setLatestBumpEvent(null)}
      />

      {/* Persistent Full-Screen Command Header */}
      <header className="shrink-0 z-40 bg-[#141519]/90 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-4 h-13 sm:h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/[0.06] border border-white/[0.14] flex items-center justify-center shadow-inner">
            <Compass className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-200" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-sm sm:text-base font-bold tracking-tight text-white">
                Bumped<span className="text-neutral-400 font-light">.lol</span>
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded-full bg-white/[0.06] text-neutral-300 border border-white/[0.1]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Top 100
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions, Simulator & Take Over */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={handleToggleMute}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isMuted
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-white/[0.04] border-white/[0.08] text-neutral-300 hover:text-white hover:bg-white/[0.08]'
            }`}
            title={isMuted ? 'Unmute Procedural Audio' : 'Mute Procedural Audio'}
            aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Radio className="w-3 h-3 text-zinc-300 animate-pulse" />}
            onClick={() => {
              soundEngine.playClick();
              setIsWarRoomOpen(true);
            }}
            className="text-xs py-1 px-2 sm:px-2.5 bg-white/[0.05] border-white/[0.12] text-neutral-200 hover:bg-white/[0.1]"
            title="Open Live Battle War Room"
          >
            <span className="hidden sm:inline">War Room</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          </Button>

          <Button
            variant={isAutoSimulate ? 'danger' : 'outline'}
            size="sm"
            leftIcon={<Radio className={`w-3 h-3 ${isAutoSimulate ? 'animate-pulse' : ''}`} />}
            onClick={() => {
              soundEngine.playClick();
              setIsAutoSimulate(!isAutoSimulate);
            }}
            className="hidden xl:inline-flex text-xs py-1"
            title="Toggle automated challenger bids"
          >
            {isAutoSimulate ? 'Auto-War ON' : 'Auto-War'}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Shuffle className="w-3 h-3" />}
            onClick={() => {
              soundEngine.playClick();
              handleSimulateRandomBump();
            }}
            className="hidden md:inline-flex text-xs py-1"
            title="Simulate single bump"
          >
            Simulate
          </Button>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<HelpCircle className="w-3 h-3 text-slate-400" />}
            onClick={() => {
              soundEngine.playClick();
              setIsRulesOpen(true);
            }}
            className="hidden lg:inline-flex text-xs py-1"
            title="Concentric Board Rules & Protocol (?)"
          >
            Rules
          </Button>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<Search className="w-3 h-3 text-slate-400" />}
            onClick={() => {
              soundEngine.playClick();
              setIsLeaderboardOpen(true);
            }}
            className="hidden sm:inline-flex text-xs py-1"
          >
            Board
          </Button>

          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Skull className="w-3 h-3 text-slate-400" />}
            onClick={() => {
              soundEngine.playClick();
              setIsGraveyardOpen(true);
            }}
            className="text-xs py-1 px-2.5"
          >
            <span className="hidden xs:inline">Graveyard</span> ({offboard.length})
          </Button>

          <Button
            variant="primary"
            size="sm"
            leftIcon={<Zap className="w-3.5 h-3.5" />}
            onClick={() => {
              soundEngine.playClick();
              setIsTakeOverOpen(true);
            }}
            className="text-xs font-bold py-1.5 px-3"
          >
            TAKE OVER (${Math.max(MIN_TOP_UP, entryFloor + 10)})
          </Button>
        </div>
      </header>

      {/* Main Full-Screen Layout */}
      <main className="flex-1 w-full h-full min-h-0 px-2 sm:px-3 pt-1 pb-1.5 flex flex-col relative z-10 overflow-hidden gap-1">
        <GridFilterBar
          filterState={filterState}
          onFilterChange={setFilterState}
        />

        <div className="flex-1 w-full h-full min-h-0 relative">
          <GridBoard
            slots={slots}
            onSlotClick={(slot) => setSelectedSlot(slot)}
            highlightedRank={highlightedRank}
            matchingRanks={matchingRanks}
            hoveredRank={hoveredRank}
            onHoverRank={setHoveredRank}
            onOrientationChange={setGridOrientation}
          />

          <RadarMiniMap
            slots={slots}
            orientation={gridOrientation}
            highlightedRank={highlightedRank}
            hoveredRank={hoveredRank}
            onSelectSlot={(slot) => {
              setSelectedSlot(slot);
              setHighlightedRank(slot.rank);
              setTimeout(() => setHighlightedRank(null), 3000);
            }}
            onHoverRank={setHoveredRank}
          />
        </div>

        {/* Bottom Floating Coordinate & Status HUD — pr-[220px] reserves space for RadarMiniMap (fixed bottom-4 right-4) */}
        <div className="shrink-0 px-3 py-1 pr-[260px] rounded-xl bg-[#141519]/90 backdrop-blur-md border border-white/[0.08] flex items-center justify-between text-[10px] sm:text-[11px] text-neutral-300 shadow-lg">
          {hoveredSlot && hoveredCoord ? (
            <div className="flex items-center gap-2 truncate font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0 animate-ping" />
              <span className="text-zinc-200 font-bold">
                [GRID R:{hoveredCoord.row} C:{hoveredCoord.col} &bull; {hoveredCoord.colSpan}x{hoveredCoord.rowSpan}]
              </span>
              <span className="text-white font-sans font-semibold">
                Rank #{hoveredSlot.rank} {hoveredSlot.title}
              </span>
              <span className="text-neutral-400 hidden md:inline">
                Held by <strong className="text-neutral-200">{hoveredSlot.bidderName}</strong> at <strong className="text-emerald-400 font-mono">${hoveredSlot.amountPaid}</strong> active value
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">
                <strong>Active Value Protocol:</strong> Top up to climb — your value carries forward. <strong className="text-rose-300">Rank #100 on the brink</strong> leaves the wall but is kept off-board.
              </span>
            </div>
          )}
          <div className="shrink-0 pl-2 flex items-center gap-2.5">
            <div className="hidden xl:flex items-center gap-1.5 text-[9px] text-neutral-400 font-mono">
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">B</span> Bid
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">W</span> War Room
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">L</span> Leaderboard
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">G</span> Graveyard
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">?</span> Rules
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">M</span> Mute
            </div>
            <div className="hidden xl:block h-2.5 w-px bg-white/[0.1]" />
            <span className="hidden lg:inline text-neutral-400 font-mono text-[10px]">
              Total Active Value: <strong className="text-white font-bold">${stats.totalBidsVolume.toLocaleString()}</strong>
            </span>
            <span className="hidden sm:inline text-neutral-400 font-mono text-[10px]">
              Floor <strong className="text-white font-bold">${entryFloor}</strong>
            </span>
            <span className="hidden sm:inline text-neutral-400 font-mono text-[10px]">
              King <strong className="text-amber-200 font-bold">${stats.rank1Bid}</strong>
            </span>
            <span className="hidden sm:inline text-neutral-400 font-mono text-[10px]">
              #10 <strong className="text-neutral-200 font-bold">${stats.rank10Bid}</strong>
            </span>
            <span className="hidden sm:inline font-mono text-[10px] text-rose-300">
              Off-board <strong className="font-bold">{offboard.length}</strong>
            </span>
            <button
              onClick={handleResetBoard}
              className="text-neutral-500 hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer font-mono text-[10px]"
              title="Reset Board"
            >
              <RotateCcw className="w-2.5 h-2.5" /> Reset
            </button>
          </div>
        </div>
      </main>

      <TakeOverModal
        isOpen={isTakeOverOpen}
        onClose={() => {
          setIsTakeOverOpen(false);
          setTargetSlotToBump(null);
        }}
        currentSlots={slots}
        entryFloor={entryFloor}
        categories={[...CATEGORIES]}
        existingHandles={existingHandles}
        preselectedTargetSlot={targetSlotToBump}
        onSubmitTopUp={handleProcessTopUp}
      />

      <GraveyardDrawer
        isOpen={isGraveyardOpen}
        onClose={() => setIsGraveyardOpen(false)}
        bumpedHistory={offboard.slice(0, 50).map((p) => toSlotItem(p, 101))}
        onReclaimTurf={(item) => {
          const match = slots.find((s) => s.id === item.id);
          setTargetSlotToBump(match ?? null);
          setIsTakeOverOpen(true);
        }}
      />

      <LeaderboardModal
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        slots={slots}
        onSelectSlot={(slot) => setSelectedSlot(slot)}
      />

      <SlotDetailModal
        slot={selectedSlot}
        onClose={() => setSelectedSlot(null)}
        onBumpSlot={(slot) => {
          setTargetSlotToBump(slot);
          setIsTakeOverOpen(true);
        }}
      />

      <RulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
        onOpenTakeover={() => setIsTakeOverOpen(true)}
      />

      <WarRoomDrawer
        isOpen={isWarRoomOpen}
        onClose={() => setIsWarRoomOpen(false)}
        bumpHistory={bumpHistory}
        slots={slots}
        chatMessages={chatMessages}
        onSendMessage={handleSendMessage}
        onTriggerReaction={handleTriggerReaction}
        onSelectSlot={(slot) => {
          setSelectedSlot(slot);
          setHighlightedRank(slot.rank);
          setTimeout(() => setHighlightedRank(null), 3500);
        }}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
      />

      <ReactionCanvas
        reactions={reactions}
        onRemoveReaction={handleRemoveReaction}
      />
    </div>
  );
}
