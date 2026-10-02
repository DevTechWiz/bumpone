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
  User as UserIcon,
} from 'lucide-react';
import { Button, Skeleton } from '../components/ui';
import { useAuth } from '../lib/useAuth';
import { createClient } from '../lib/supabase/client';
import { UserMenu } from '../components/UserMenu';
import type { SlotItem, BumpEvent, BoardStats, Message, FloatingReaction } from '../lib/slotTypes';
import {
  CATEGORIES,
  MIN_TOP_UP,
  sortBoard,
  rankOf,
  quoteTopUp,
  recomputeRank,
  toSlotItem,
  formatNumber,
  type Profile,
} from '../lib/board';
import dynamic from 'next/dynamic';
import { safeGetJSON, safeSetJSON, sessionGetJSON, sessionSetJSON, safeSet, safeRemove } from '../lib/storage';
import { GridBoard } from '../components/GridBoard';
import { ProfileView } from '../components/ProfileView';
import type { TopUpOrder } from '../components/TakeOverModal';
import { BumpNotification } from '../components/BumpNotification';
import { RadarMiniMap } from '../components/RadarMiniMap';
import { GridFilterBar, type GridFilterState } from '../components/GridFilterBar';
import { soundEngine } from '../lib/sound';
import type { GridOrientation } from '../lib/boardLayout';

const CosmicBackground = dynamic(
  () => import('../components/CosmicBackground').then((m) => m.CosmicBackground),
  { ssr: false }
);

const ReactionCanvas = dynamic(
  () => import('../components/ReactionCanvas').then((m) => m.ReactionCanvas),
  { ssr: false }
);

const TakeOverModal = dynamic(
  () => import('../components/TakeOverModal').then((m) => m.TakeOverModal),
  { ssr: false }
);

const GraveyardDrawer = dynamic(
  () => import('../components/GraveyardDrawer').then((m) => m.GraveyardDrawer),
  { ssr: false }
);

const LeaderboardModal = dynamic(
  () => import('../components/LeaderboardModal').then((m) => m.LeaderboardModal),
  { ssr: false }
);

const SlotDetailModal = dynamic(
  () => import('../components/SlotDetailModal').then((m) => m.SlotDetailModal),
  { ssr: false }
);

const RulesModal = dynamic(
  () => import('../components/RulesModal').then((m) => m.RulesModal),
  { ssr: false }
);

const WarRoomDrawer = dynamic(
  () => import('../components/WarRoomDrawer').then((m) => m.WarRoomDrawer),
  { ssr: false }
);

const AuthModal = dynamic(
  () => import('../components/AuthModal').then((m) => m.AuthModal),
  { ssr: false }
);

const GoogleOneTap = dynamic(
  () => import('../components/GoogleOneTap').then((m) => m.GoogleOneTap),
  { ssr: false }
);

const AlertSettingsModal = dynamic(
  () => import('../components/AlertSettingsModal').then((m) => m.AlertSettingsModal),
  { ssr: false }
);

const BumpResultModal = dynamic(
  () => import('../components/BumpResultModal').then((m) => m.BumpResultModal),
  { ssr: false }
);
import type { BumpResultData } from '../components/BumpResultModal';


const STORAGE_KEY_PROFILES = 'bumped_profiles_v2';
const STORAGE_KEY_OFFBOARD = 'bumped_offboard_v2';

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'msg-init-1',
    sender: '@grid_sentinel',
    avatarColor: 'bg-indigo-500',
    text: 'WAR ROOM ACTIVE. Active Value decides everything. King rules the 4x4 center.',
    timestamp: Date.now() - 7200000,
    isOfficial: true,
  },
  {
    id: 'msg-init-2',
    sender: '@solana_surfer',
    avatarColor: 'bg-sky-500',
    text: 'Watching the Center King #1 throne. Who is going to top up past the sovereign?',
    slotTag: 1,
    timestamp: Date.now() - 3600000,
  },
  {
    id: 'msg-init-3',
    sender: '@neon_hunter',
    avatarColor: 'bg-rose-500',
    text: 'Rank #100 is holding the active floor! One more bump and someone drops to #101 Graveyard!',
    slotTag: 100,
    timestamp: Date.now() - 1200000,
  },
];

export default function Home() {
  // 1. Core state: profiles (canonical domain) + off-board keep-list.
  // Initial states start consistent between server & client to prevent hydration mismatch.
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [offboard, setOffboard] = useState<Profile[]>([]);
  const [isBoardLoading, setIsBoardLoading] = useState<boolean>(true);
  const [hasMounted, setHasMounted] = useState<boolean>(false);
  const seqRef = useRef(100000);

  useEffect(() => {
    setHasMounted(true);
    // 1. Session cache: instant 0ms restoration when navigating back from profiles
    const cachedSession = sessionGetJSON<Profile[]>('bumped_board_cache');
    if (cachedSession && Array.isArray(cachedSession) && cachedSession.length > 0) {
      setProfiles(cachedSession);
      setIsBoardLoading(false);
    } else {
      const saved = safeGetJSON<Profile[]>(STORAGE_KEY_PROFILES);
      if (saved && Array.isArray(saved) && saved.length > 0 && typeof saved[0].active_value === 'number') {
        setProfiles(saved);
        setIsBoardLoading(false);
      }
    }
    const savedOffboard = safeGetJSON<Profile[]>(STORAGE_KEY_OFFBOARD);
    if (Array.isArray(savedOffboard) && savedOffboard.length > 0) {
      setOffboard(savedOffboard);
    }

    // Always fetch live profiles from Supabase API
    fetch('/api/board?limit=120')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.profiles) && data.profiles.length > 0) {
          setProfiles(data.profiles);
          const sorted = sortBoard(data.profiles);
          if (sorted.length > 100) {
            const dbOffboard = sorted.slice(100);
            setOffboard((prev) => {
              const combined = [...dbOffboard];
              for (const p of prev) {
                if (!combined.some((c) => c.id === p.id)) {
                  combined.push(p);
                }
              }
              return combined.slice(0, 50);
            });
          }
        }
      })
      .catch((err) => console.warn('Could not fetch board profiles:', err))
      .finally(() => setIsBoardLoading(false));

    // Preload modal bundles in background so 1st click is instantaneous with zero chunk fetch delay
    if (typeof window !== 'undefined') {
      import('../components/TakeOverModal');
      import('../components/SlotDetailModal');
    }
  }, []);

  useEffect(() => {
    if (profiles && profiles.length > 0) {
      sessionSetJSON('bumped_board_cache', profiles);
      safeSetJSON(STORAGE_KEY_PROFILES, profiles);
    }
  }, [profiles]);

  // 2. UI and modal state (mirrors reference App).
  const [isTakeOverOpen, setIsTakeOverOpen] = useState(false);
  const [targetSlotToBump, setTargetSlotToBump] = useState<SlotItem | null>(null);
  const [isGraveyardOpen, setIsGraveyardOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [viewingProfileMode, setViewingProfileMode] = useState<'user' | 'project'>('user');
  const [isAlertSettingsOpen, setIsAlertSettingsOpen] = useState(false);
  const [bumpResult, setBumpResult] = useState<BumpResultData | null>(null);

  const isBackdropActive = Boolean(
    selectedSlot ||
    viewingProfileId ||
    isTakeOverOpen ||
    isGraveyardOpen ||
    isLeaderboardOpen ||
    isRulesOpen ||
    isAlertSettingsOpen ||
    bumpResult
  );

  const handleCloseProfile = useCallback(() => {
    setViewingProfileId(null);
    if (typeof window !== 'undefined') {
      if (window.history.state?.viewingProfile) {
        window.history.back();
      } else {
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setViewingProfileId(null);
      setSelectedSlot(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [highlightedRank, setHighlightedRank] = useState<number | null>(null);
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);
  const [gridOrientation, setGridOrientation] = useState<GridOrientation>('landscape');
  const [latestBumpEvent, setLatestBumpEvent] = useState<BumpEvent | null>(null);
  const [isAutoSimulate, setIsAutoSimulate] = useState(false);
  const [isWarRoomOpen, setIsWarRoomOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const { user, profile, loading: authLoading, signOut } = useAuth();
  // Mute preference loads post-mount: server has no localStorage, so the
  // first render must match the server (unmuted) to avoid hydration mismatch.
  const [isMuted, setIsMuted] = useState(false);
  useEffect(() => {
    setIsMuted(soundEngine.getIsMuted());
  }, []);
  const [bumpHistory, setBumpHistory] = useState<BumpEvent[]>([]);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [filterState, setFilterState] = useState<GridFilterState>({
    searchQuery: '',
    tier: 'all',
    minPrice: null,
    maxPrice: null,
    category: 'All',
    timeRange: 'all',
  });
  const [paymentBanner, setPaymentBanner] = useState<{ type: 'success' | 'pending'; text: string } | null>(null);

  // Handle incoming redirect parameters (payment status, target slot)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const status = params.get('status');
      const target = params.get('target');

      if (status === 'success' || status === 'paid') {
        setPaymentBanner({
          type: 'success',
          text: 'Payment processed successfully! Your active value has been credited and your slot is live.',
        });
        setTimeout(() => setPaymentBanner(null), 8000);
      } else if (status === 'pending_payment') {
        setPaymentBanner({
          type: 'pending',
          text: 'Checkout initiated. Recomputing live wall position upon Dodo confirmation.',
        });
        setTimeout(() => setPaymentBanner(null), 8000);
      }

      if (target) {
        const found = profiles.find((p) => p.id === target);
        if (found) {
          setTargetSlotToBump(toSlotItem(found, 1));
          if (!user) {
            setIsAuthOpen(true);
          } else {
            setIsTakeOverOpen(true);
          }
        }
      }

      const rankParam = params.get('rank');
      if (rankParam) {
        const r = Number(rankParam);
        const match = profiles.find((_, idx) => idx + 1 === r);
        if (match) {
          setSelectedSlot(toSlotItem(match, r));
        }
      }

      if (params.get('claim') === 'true') {
        if (!user) {
          setIsAuthOpen(true);
        } else {
          setIsTakeOverOpen(true);
        }
      }
      if (params.get('auth') === 'true') {
        setIsAuthOpen(true);
      }
      if (params.get('alerts') === 'true') {
        setIsAlertSettingsOpen(true);
      }
      if (params.get('graveyard') === 'true') {
        setIsGraveyardOpen(true);
      }
      if (params.get('rules') === 'true') {
        setIsRulesOpen(true);
      }
    }
  }, [profiles, user]);

  // Live Board Synchronizer: Supabase Realtime event streaming + Edge SWR Polling fallback
  useEffect(() => {
    let isMounted = true;
    let interval: NodeJS.Timeout | null = null;
    let realtimeChannel: any = null;

    const fetchBoard = async (silent = false) => {
      // Don't poll if the tab is hidden/minimized to save bandwidth and dev CPU
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      try {
        const catParam = filterState.category !== 'All' ? `&category=${encodeURIComponent(filterState.category)}` : '';
        const sortParam = filterState.timeRange === 'today' ? '&sort=trending' : '';
        const res = await fetch(`/api/board?limit=120${catParam}${sortParam}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
            setProfiles(data.profiles);
            if (!silent) {
              soundEngine.playShove();
            }
          }
        }
      } catch {
        // Retain local memory state if offline or fetch fails
      }
    };

    fetchBoard(true);
    interval = setInterval(() => fetchBoard(true), 15000);

    // Subscribe to Supabase Realtime for instant 0ms bump updates and live reaction updates
    try {
      const supabase = createClient();
      realtimeChannel = supabase
        .channel('board_live_bumps')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'board_events' },
          () => {
            if (isMounted) {
              fetchBoard(false);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'projects' },
          (payload: any) => {
            if (isMounted && payload?.new) {
              const row = payload.new;
              setProfiles((prev) =>
                prev.map((item) => {
                  if (item.id === row.id) {
                    return {
                      ...item,
                      reactions: {
                        fire: Number(row.reactions_fire || 0),
                        eyes: Number(row.reactions_eyes || 0),
                        heart: Number(row.reactions_heart || 0),
                        laugh: Number(row.reactions_laugh || 0),
                      },
                    };
                  }
                  return item;
                })
              );
            }
          }
        )
        .subscribe();
    } catch {
      // Local fallback if Supabase unconfigured
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchBoard(true);
      }
    };

    const handleFocus = () => {
      fetchBoard(true);
    };

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
      if (realtimeChannel) {
        try {
          const supabase = createClient();
          supabase.removeChannel(realtimeChannel);
        } catch {}
      }
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [filterState.category, filterState.timeRange]);

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

    // Send reaction to backend ONLY if a specific slot is explicitly hovered or open
    const targetId = hoveredRank ? slots.find((s) => s.rank === hoveredRank)?.id : selectedSlot?.id;
    if (targetId && user) {
      const emojiMap: Record<string, string> = {
        '🔥': 'fire',
        '👀': 'eyes',
        '❤️': 'heart',
        '😂': 'laugh',
        '👑': 'fire',
        '⚔️': 'fire',
      };
      const reactionType = emojiMap[emoji] || 'fire';
      fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: targetId, reaction: reactionType }),
      }).catch(() => {});
    }
  };

  const handleRemoveReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSlotClick = useCallback((slot: SlotItem) => {
    setSelectedSlot(slot);
  }, []);

  const handleHoverRank = useCallback((rank: number | null) => {
    setHoveredRank(rank);
  }, []);

  const handleSelectMiniMapSlot = useCallback((slot: SlotItem) => {
    setSelectedSlot(slot);
    setHighlightedRank(slot.rank);
    setTimeout(() => setHighlightedRank(null), 3000);
  }, []);

  const handleOrientationChange = useCallback((orientation: GridOrientation) => {
    setGridOrientation(orientation);
  }, []);

  const handleSendMessage = (msg: Omit<Message, 'id' | 'timestamp'>) => {
    const newMsg: Message = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  // Global top-100 slots derived from canonical ordering.
  const slots: SlotItem[] = useMemo(() => {
    return sortBoard(profiles).slice(0, 100).map((p, i) => toSlotItem(p, i + 1));
  }, [profiles]);

  // Spotlight/dim set for tier + search + category + value-range + time filters.
  const matchingRanks = useMemo<Set<number> | null>(() => {
    const isQueryActive = Boolean(filterState.searchQuery.trim());
    const isTierActive = filterState.tier !== 'all';
    const isCategoryActive = filterState.category !== 'All';
    const isValueActive = filterState.minPrice !== null || filterState.maxPrice !== null;
    const isTodayActive = filterState.timeRange === 'today';
    if (!isQueryActive && !isTierActive && !isCategoryActive && !isValueActive && !isTodayActive) return null;
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
        if (filterState.tier === 'champion' && (slot.rank < 2 || slot.rank > 5)) return;
        if (filterState.tier === 'elite' && (slot.rank < 6 || slot.rank > 15)) return;
        if (filterState.tier === 'vanguard' && (slot.rank < 16 || slot.rank > 40)) return;
        if (filterState.tier === 'lord' && (slot.rank < 16 || slot.rank > 40)) return;
        if (filterState.tier === 'contender' && (slot.rank < 41 || slot.rank > 100)) return;
      }
      if (isCategoryActive) {
        const prof = byId.get(slot.id);
        if (!prof || prof.category !== filterState.category) return;
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
  }, [slots, profiles, filterState]);

  const hoveredSlot = useMemo(() => {
    if (!hoveredRank) return null;
    return slots.find((s) => s.rank === hoveredRank) || null;
  }, [slots, hoveredRank]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => {
            safeSet(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
          });
        } else {
          safeSet(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
        }
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [profiles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => {
            safeSet(STORAGE_KEY_OFFBOARD, JSON.stringify(offboard));
          });
        } else {
          safeSet(STORAGE_KEY_OFFBOARD, JSON.stringify(offboard));
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
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
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-event-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
    const existing = order.projectId
      ? prev.find((p) => p.id === order.projectId)
      : order.currentValue > 0
      ? prev.find((p) => p.active_value === order.currentValue && p.name === order.title)
      : undefined;

    if (existing) {
      previousRank = rankOf(prev, existing.id);
      base = {
        ...existing,
        name: order.title,
        linkUrl: order.linkUrl,
        imageUrl: order.imageUrl,
        category: (CATEGORIES as readonly string[]).includes(order.category)
          ? (order.category as Profile['category'])
          : existing.category,
        active_value: existing.active_value + topUp,
        times_bumped: existing.times_bumped + 1,
        last_bump_at: Date.now(),
      };
      working = prev.map((p) => (p.id === existing.id ? base : p));
    } else {
      previousRank = null;
      const ownerHandle = order.handle.replace('@', '');
      const ownerName =
        profile?.display_name ||
        user?.user_metadata?.custom_claims?.global_name ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.user_name ||
        order.title ||
        ownerHandle;

      base = {
        id: `slot-${Date.now()}`,
        seq: seqRef.current++,
        name: order.title,
        handle: order.handle,
        category: (CATEGORIES as readonly string[]).includes(order.category) ? (order.category as Profile['category']) : 'AI',
        active_value: order.currentValue + topUp,
        imageUrl: order.imageUrl,
        linkUrl: order.linkUrl,
        owner_id: user?.id,
        owner_name: ownerName,
        owner_handle: ownerHandle,
        owner_avatar: user?.user_metadata?.avatar_url,
        peak_rank: 101,
        times_bumped: 1,
        times_climbed: 0,
        views: 0,
        shares: 0,
        joined_days_ago: 0,
        last_bump_at: Date.now(),
        journey: [],
        reactions: { fire: 0, eyes: 0, heart: 0, laugh: 0 },
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

    const displacedCount = previousRank === null
      ? Math.max(0, 101 - newRank)
      : Math.max(0, previousRank - newRank);

    const displacedList = ordered
      .filter((p) => p.id !== base.id)
      .map((p) => ({
        rank: ordered.findIndex((x) => x.id === p.id) + 1,
        title: p.name,
        imageUrl: p.imageUrl,
      }))
      .filter((x) => x.rank > newRank && (previousRank === null || x.rank <= (previousRank || 101)))
      .slice(0, 5);

    setBumpResult({
      profile: { ...base, active_value: base.active_value },
      previousRank,
      newRank,
      displacedCount,
      displacedProfiles: displacedList,
    });
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
    // Random bump from existing board holders
    if (ordered.length === 0) return;
    const pick = ordered[Math.floor(Math.random() * Math.min(20, ordered.length))];
    const bumpAmount = Math.floor(Math.random() * 25) + 10;
    handleProcessTopUp({
      title: pick.name,
      handle: pick.handle,
      linkUrl: pick.linkUrl,
      imageUrl: pick.imageUrl,
      category: pick.category,
      topUp: bumpAmount,
      resultingValue: pick.active_value + bumpAmount,
      currentValue: pick.active_value,
    });
  }, [profiles, offboard, handleProcessTopUp]);

  useEffect(() => {
    if (!isAutoSimulate) return;
    const interval = setInterval(() => {
      handleSimulateRandomBump();
    }, 6000);
    return () => clearInterval(interval);
  }, [isAutoSimulate, handleSimulateRandomBump]);

  const handleResetBoard = async () => {
    if (typeof window !== 'undefined' && window.confirm('Reset board back to live database state?')) {
      safeRemove(STORAGE_KEY_PROFILES);
      safeRemove(STORAGE_KEY_OFFBOARD);
      try {
        sessionStorage.removeItem('bumped_board_cache');
        const res = await fetch('/api/board?limit=120');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.profiles)) {
            setProfiles(data.profiles);
          }
        }
      } catch (e) {
        setProfiles([]);
      }
      setOffboard([]);
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
        if (!user) {
          setIsAuthOpen(true);
        } else {
          setIsTakeOverOpen(true);
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.length, user]);

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
        if (!user) {
          setIsAuthOpen(true);
          return;
        }
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
        if (isTakeOverOpen) {
          setIsTakeOverOpen(false);
          setTargetSlotToBump(null);
        } else if (viewingProfileId) {
          handleCloseProfile();
        } else {
          setIsGraveyardOpen(false);
          setIsLeaderboardOpen(false);
          setIsWarRoomOpen(false);
          setIsRulesOpen(false);
          setSelectedSlot(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userAuthHandle = useMemo(() => {
    if (profile?.handle) {
      return profile.handle.toLowerCase().replace('@', '');
    }
    if (!user) return '';
    return (
      user.user_metadata?.user_name ||
      user.user_metadata?.preferred_username ||
      ''
    ).toLowerCase().replace('@', '');
  }, [user, profile]);

  // Strictly filter to the current authenticated user's own projects (or empty if unauthenticated)
  const existingHandles = useMemo(() => {
    if (!user) return [];
    return profiles
      .filter((p) => {
        if (p.owner_id && user.id && p.owner_id === user.id) return true;
        if (userAuthHandle && p.handle && p.handle.toLowerCase().replace('@', '') === userAuthHandle) return true;
        if (userAuthHandle && p.owner_handle && p.owner_handle.toLowerCase().replace('@', '') === userAuthHandle) return true;
        return false;
      })
      .map((p) => ({
        id: p.id,
        title: p.name,
        activeValue: p.active_value,
        handle: p.handle,
        imageUrl: p.imageUrl,
        linkUrl: p.linkUrl,
        category: p.category,
        owner_id: p.owner_id || user.id,
      }));
  }, [profiles, user, userAuthHandle]);

  return (
    <div className="h-screen w-screen bg-[#121316] text-neutral-100 flex flex-col selection:bg-white/20 selection:text-white relative overflow-hidden">
      <CosmicBackground />

      <BumpNotification
        event={latestBumpEvent}
        onDismiss={() => setLatestBumpEvent(null)}
      />

      {paymentBanner && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] shadow-2xl flex items-center gap-2.5 text-xs text-white animate-in fade-in slide-in-from-top-3 duration-300">
          <span className={`w-2 h-2 rounded-full ${paymentBanner.type === 'success' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'}`} />
          <span className="font-medium">{paymentBanner.text}</span>
          <button
            onClick={() => setPaymentBanner(null)}
            className="text-neutral-400 hover:text-white ml-2 text-sm leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Persistent Full-Screen Command Header */}
      <header className="shrink-0 z-40 bg-[#141519]/90 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-4 h-13 sm:h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/[0.06] border border-white/[0.14] flex items-center justify-center shadow-inner">
            <Compass className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-200" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                BumpOne<span className="text-amber-400 font-semibold">.lol</span>
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded-full bg-white/[0.06] text-neutral-300 border border-white/[0.1]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Top 100
              </span>
            </div>
          </div>
        </div>

        {/* Center: Search & Filter Toolbar */}
        <div className="flex-1 flex items-center justify-center px-2 min-w-0">
          <GridFilterBar
            filterState={filterState}
            onFilterChange={setFilterState}
          />
        </div>

        {/* Right: Actions, Simulator & Take Over */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={handleToggleMute}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${isMuted
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
            <span className="hidden xs:inline">Graveyard</span>{' '}
            {!hasMounted || isBoardLoading ? (
              <Skeleton variant="rounded" width={14} height={12} className="inline-block ml-1 align-middle" />
            ) : (
              `(${offboard.length})`
            )}
          </Button>

          {authLoading ? (
            <Skeleton variant="rounded-xl" width={110} height={30} className="shrink-0" />
          ) : user ? (
            <UserMenu
              user={user}
              userHandle={profile?.handle || userAuthHandle}
              onSignOut={signOut}
              onViewProfile={() => {
                soundEngine.playClick();
                setViewingProfileMode('user');
                setViewingProfileId('self');
                if (typeof window !== 'undefined') {
                  window.history.pushState({ viewingProfile: true, profileId: 'self' }, '', '/profile');
                }
              }}
              onViewMySlots={() => {
                soundEngine.playClick();
                if (existingHandles.length > 0) {
                  const myRanks = new Set(
                    slots
                      .filter((s) => existingHandles.some((h) => h.id === s.id))
                      .map((s) => s.rank)
                  );
                  if (myRanks.size > 0) {
                    const firstRank = Array.from(myRanks)[0];
                    setHighlightedRank(firstRank);
                    setTimeout(() => setHighlightedRank(null), 3000);
                  }
                }
                setFilterState((prev) => ({
                  ...prev,
                  searchQuery: userAuthHandle ? `@${userAuthHandle}` : '',
                }));
              }}
              onClaimSlot={() => {
                soundEngine.playClick();
                setTargetSlotToBump(null);
                setIsTakeOverOpen(true);
              }}
              onOpenAlerts={() => {
                soundEngine.playClick();
                setIsAlertSettingsOpen(true);
              }}
              userSlotsCount={existingHandles.length}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<UserIcon className="w-3.5 h-3.5 text-amber-400" />}
              onClick={() => {
                soundEngine.playClick();
                setIsAuthOpen(true);
              }}
              className="text-xs py-1 px-2.5 border-white/[0.12] hover:bg-white/[0.08]"
              title="Sign in with Google, X, or Email"
            >
              Sign In
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            leftIcon={<Zap className="w-3.5 h-3.5" />}
            onClick={() => {
              soundEngine.playClick();
              if (!user) {
                setIsAuthOpen(true);
                return;
              }
              setIsTakeOverOpen(true);
            }}
            className="text-xs font-bold py-1.5 px-3 min-w-[105px]"
          >
            {!hasMounted || isBoardLoading ? (
              <span className="inline-flex items-center gap-1.5">
                BUMP #1 (<Skeleton variant="text" width={28} height={12} className="inline-block" />)
              </span>
            ) : (
              `BUMP #1 ($${Math.max(MIN_TOP_UP, entryFloor + 10)})`
            )}
          </Button>
        </div>
      </header>

      {/* Main Full-Screen Layout */}
      <main className="flex-1 w-full h-full min-h-0 px-2 sm:px-3 pt-1.5 pb-1.5 flex flex-col relative z-10 overflow-hidden gap-1">
        <div className="flex-1 w-full h-full min-h-0 relative">
          <GridBoard
            slots={slots}
            isLoading={!hasMounted || isBoardLoading}
            onSlotClick={handleSlotClick}
            highlightedRank={highlightedRank}
            matchingRanks={matchingRanks}
            hoveredRank={hoveredRank}
            onHoverRank={handleHoverRank}
            onOrientationChange={handleOrientationChange}
          />

          <RadarMiniMap
            slots={slots}
            orientation={gridOrientation}
            highlightedRank={highlightedRank}
            matchingRanks={matchingRanks}
            hoveredRank={hoveredRank}
            onSelectSlot={handleSelectMiniMapSlot}
            onHoverRank={handleHoverRank}
          />
        </div>

        {/* Bottom Floating Coordinate & Status HUD — pr-[220px] reserves space for RadarMiniMap (fixed bottom-4 right-4) */}
        <div className="shrink-0 px-3 py-1 pr-[260px] rounded-xl bg-[#141519]/90 backdrop-blur-md border border-white/[0.08] flex items-center justify-between text-[10px] sm:text-[11px] text-neutral-300 shadow-lg">
          {hoveredSlot ? (
            <div className="flex items-center gap-2 truncate font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0 animate-ping" />
              <span className="text-zinc-200 font-bold">
                [#{hoveredSlot.rank} &bull; {gridOrientation}]
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
                <strong>Active Value Protocol:</strong> Top up to climb — your value carries forward. Spots #1–#100 are live on the wall; profiles displaced beyond #100 (into #101+) enter the Graveyard.
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
              Total Active Value:{' '}
              {!hasMounted || isBoardLoading ? (
                <Skeleton variant="rounded" width={52} height={12} className="inline-block ml-1 align-middle" />
              ) : (
                <strong className="text-white font-bold">${formatNumber(stats.totalBidsVolume)}</strong>
              )}
            </span>
            <span className="hidden sm:inline text-neutral-400 font-mono text-[10px]">
              Floor{' '}
              {!hasMounted || isBoardLoading ? (
                <Skeleton variant="rounded" width={24} height={12} className="inline-block ml-1 align-middle" />
              ) : (
                <strong className="text-white font-bold">${entryFloor}</strong>
              )}
            </span>
            <span className="hidden sm:inline text-neutral-400 font-mono text-[10px]">
              King{' '}
              {!hasMounted || isBoardLoading ? (
                <Skeleton variant="rounded" width={28} height={12} className="inline-block ml-1 align-middle" />
              ) : (
                <strong className="text-amber-200 font-bold">${stats.rank1Bid}</strong>
              )}
            </span>
            <span className="hidden sm:inline text-neutral-400 font-mono text-[10px]">
              #10{' '}
              {!hasMounted || isBoardLoading ? (
                <Skeleton variant="rounded" width={24} height={12} className="inline-block ml-1 align-middle" />
              ) : (
                <strong className="text-neutral-200 font-bold">${stats.rank10Bid}</strong>
              )}
            </span>
            <span className="hidden sm:inline font-mono text-[10px] text-rose-300">
              Off-board{' '}
              {!hasMounted || isBoardLoading ? (
                <Skeleton variant="rounded" width={16} height={12} className="inline-block ml-1 align-middle" />
              ) : (
                <strong className="font-bold">{offboard.length}</strong>
              )}
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

      {/* 0ms Persistent Global Glass Backdrop (never flickers, never drops blur, never stacks) */}
      <div
        className={`fixed inset-0 z-40 bg-[#0d0e12]/85 backdrop-blur-md transition-opacity duration-200 ${isBackdropActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        onClick={() => {
          if (isTakeOverOpen) {
            setIsTakeOverOpen(false);
            setTargetSlotToBump(null);
          } else if (viewingProfileId) {
            handleCloseProfile();
          } else {
            setSelectedSlot(null);
            setIsLeaderboardOpen(false);
            setIsGraveyardOpen(false);
            setIsRulesOpen(false);
          }
        }}
        aria-hidden="true"
      />

      {isTakeOverOpen && (
        <TakeOverModal
          isOpen={isTakeOverOpen}
          hasBackdrop={false}
          onClose={() => {
            setIsTakeOverOpen(false);
            setTargetSlotToBump(null);
          }}
          onBack={targetSlotToBump ? () => {
            const slotToRestore = targetSlotToBump;
            setIsTakeOverOpen(false);
            setTargetSlotToBump(null);
            setSelectedSlot(slotToRestore);
          } : undefined}
          currentSlots={slots}
          entryFloor={entryFloor}
          categories={[...CATEGORIES]}
          existingHandles={existingHandles}
          preselectedTargetSlot={targetSlotToBump}
          onRequireAuth={() => {
            setIsTakeOverOpen(false);
            setIsAuthOpen(true);
          }}
          onSubmitTopUp={(orderData) => {
            handleProcessTopUp(orderData);
            setIsTakeOverOpen(false);
            setTargetSlotToBump(null);
            setSelectedSlot(null);
          }}
        />
      )}

      {isGraveyardOpen && (
        <GraveyardDrawer
          isOpen={isGraveyardOpen}
          hasBackdrop={false}
          onClose={() => setIsGraveyardOpen(false)}
          bumpedHistory={offboard.slice(0, 50).map((p, idx) => toSlotItem(p, 101 + idx))}
          onReclaimTurf={(item) => {
            if (!user) {
              setIsAuthOpen(true);
              return;
            }
            const match = slots.find((s) => s.id === item.id);
            setTargetSlotToBump(match ?? null);
            setIsTakeOverOpen(true);
          }}
        />
      )}

      {isLeaderboardOpen && (
        <LeaderboardModal
          isOpen={isLeaderboardOpen}
          hasBackdrop={false}
          onClose={() => setIsLeaderboardOpen(false)}
          slots={slots}
          isLoading={isBoardLoading}
          onSelectSlot={(slot) => setSelectedSlot(slot)}
        />
      )}

      {selectedSlot && (
        <SlotDetailModal
          slot={selectedSlot}
          user={user}
          hasBackdrop={false}
          onClose={() => setSelectedSlot(null)}
          onRequireAuth={() => setIsAuthOpen(true)}
          onViewProfile={(creatorIdentifier) => {
            setSelectedSlot(null);
            setViewingProfileMode('user');
            setViewingProfileId(creatorIdentifier);
            if (typeof window !== 'undefined') {
              window.history.pushState({ viewingProfile: true, profileId: creatorIdentifier }, '', `/profile/${creatorIdentifier}`);
            }
          }}
          onViewProject={(projectId) => {
            setSelectedSlot(null);
            setViewingProfileMode('project');
            setViewingProfileId(projectId);
            if (typeof window !== 'undefined') {
              window.history.pushState({ viewingProfile: true, profileId: projectId }, '', `/project/${projectId}`);
            }
          }}
          onBumpSlot={(slot) => {
            setSelectedSlot(null);
            if (!user) {
              setIsAuthOpen(true);
              return;
            }
            setTargetSlotToBump(slot);
            setIsTakeOverOpen(true);
          }}
        />
      )}

      {viewingProfileId && (
        <div className="fixed inset-0 z-50 overflow-y-auto py-8 px-2 sm:px-4 pointer-events-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <ProfileView
            profileId={viewingProfileId}
            initialMode={viewingProfileMode}
            onBack={handleCloseProfile}
            onSelectProfile={(nextId) => {
              setViewingProfileId(nextId);
              if (typeof window !== 'undefined') {
                window.history.replaceState({ viewingProfile: true, profileId: nextId }, '', `/profile/${nextId}`);
              }
            }}
            onUpdateProfile={(updated) => {
              setProfiles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            }}
            onOpenAlerts={() => {
              setIsAlertSettingsOpen(true);
            }}
            onClaimSlot={() => {
              if (!user) {
                setIsAuthOpen(true);
                return;
              }
              setTargetSlotToBump(null);
              setIsTakeOverOpen(true);
            }}
            onBumpProject={(projId) => {
              if (!user) {
                setIsAuthOpen(true);
                return;
              }
              const found = profiles.find((p) => p.id === projId);
              if (found) {
                setTargetSlotToBump(toSlotItem(found, 1));
              }
              setIsTakeOverOpen(true);
            }}
            onRequireAuth={() => setIsAuthOpen(true)}
          />
        </div>
      )}



      {isRulesOpen && (
        <RulesModal
          isOpen={isRulesOpen}
          hasBackdrop={false}
          onClose={() => setIsRulesOpen(false)}
          onOpenTakeover={() => {
            if (!user) {
              setIsRulesOpen(false);
              setIsAuthOpen(true);
              return;
            }
            setIsTakeOverOpen(true);
          }}
        />
      )}

      {isWarRoomOpen && (
        <WarRoomDrawer
          isOpen={isWarRoomOpen}
          onClose={() => setIsWarRoomOpen(false)}
          bumpHistory={bumpHistory}
          slots={slots}
          messages={messages}
          senderHandle={userAuthHandle || undefined}
          onSendMessage={handleSendMessage}
          onTriggerReaction={handleTriggerReaction}
          onSelectSlot={(slot) => {
            setSelectedSlot(slot);
            setHighlightedRank(slot.rank);
            setTimeout(() => setHighlightedRank(null), 3500);
          }}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onRequireAuth={() => setIsAuthOpen(true)}
        />
      )}

      {reactions.length > 0 && (
        <ReactionCanvas
          reactions={reactions}
          onRemoveReaction={handleRemoveReaction}
        />
      )}

      {isAuthOpen && (
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
        />
      )}

      {isAlertSettingsOpen && (
        <AlertSettingsModal
          isOpen={isAlertSettingsOpen}
          onClose={() => setIsAlertSettingsOpen(false)}
          userEmail={user?.email || ''}
        />
      )}

      {bumpResult && (
        <BumpResultModal
          isOpen={!!bumpResult}
          onClose={() => setBumpResult(null)}
          result={bumpResult}
          onLocateOnBoard={(rank) => {
            setHighlightedRank(rank);
            setTimeout(() => setHighlightedRank(null), 4000);
          }}
        />
      )}

      <GoogleOneTap disabled={Boolean(user)} />
    </div>
  );
}
