"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Zap,
  Radio,
  Archive,
  Search,
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
import { fetchBoardClient, invalidateClientBoardCache } from '../lib/boardClient';
import { GridBoard } from '../components/GridBoard';
import type { TopUpOrder } from '../components/TakeOverModal';
import { GridFilterBar, type GridFilterState } from '../components/GridFilterBar';
import { soundEngine } from '../lib/sound';
import type { GridOrientation } from '../lib/boardLayout';

const ProfileView = dynamic(
  () => import('../components/ProfileView').then((m) => m.ProfileView),
  { ssr: false }
);

const BumpNotification = dynamic(
  () => import('../components/BumpNotification').then((m) => m.BumpNotification),
  { ssr: false }
);

const RadarMiniMap = dynamic(
  () => import('../components/RadarMiniMap').then((m) => m.RadarMiniMap),
  { ssr: false }
);

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
    text: 'LIVE BILLBOARD FEED ACTIVE. Placement value decides billboard rank.',
    timestamp: Date.now() - 7200000,
    isOfficial: true,
  },
  {
    id: 'msg-init-2',
    sender: '@solana_surfer',
    avatarColor: 'bg-sky-500',
    text: 'Watching the Center King #1 throne. Who is going to outbid past the sovereign?',
    slotTag: 1,
    timestamp: Date.now() - 3600000,
  },
  {
    id: 'msg-init-3',
    sender: '@neon_hunter',
    avatarColor: 'bg-rose-500',
    text: 'Rank #100 is holding the active floor! Incoming placements move spots to the Billboard Archive!',
    slotTag: 100,
    timestamp: Date.now() - 1200000,
  },
];

export function HomePageClient({ initialProfiles }: { initialProfiles?: Profile[] }) {
  // 1. Core state: profiles (canonical domain) + off-board keep-list.
  // Initial states start consistent between server & client to prevent hydration mismatch.
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    if (initialProfiles && initialProfiles.length > 0) return initialProfiles;
    if (typeof window !== 'undefined') {
      const cached = sessionGetJSON<Profile[]>('bumped_board_cache');
      if (cached && Array.isArray(cached) && cached.length > 0) return cached;
      const saved = safeGetJSON<Profile[]>(STORAGE_KEY_PROFILES);
      if (saved && Array.isArray(saved) && saved.length > 0 && typeof saved[0].active_value === 'number') {
        return saved;
      }
    }
    return [];
  });
  const [offboard, setOffboard] = useState<Profile[]>(() => {
    if (initialProfiles && initialProfiles.length > 100) return initialProfiles.slice(100, 150);
    if (typeof window !== 'undefined') {
      const savedOffboard = safeGetJSON<Profile[]>(STORAGE_KEY_OFFBOARD);
      if (Array.isArray(savedOffboard) && savedOffboard.length > 0) return savedOffboard;
    }
    return [];
  });
  const [isBoardLoading, setIsBoardLoading] = useState<boolean>(() => {
    return !(initialProfiles && initialProfiles.length > 0);
  });
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

    // If initialProfiles is provided from SSR, delay background sync to keep main thread completely idle
    const fetchLiveBoard = () => {
      fetchBoardClient({ limit: 120 })
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
    };

    if (initialProfiles && initialProfiles.length > 0) {
      const timer = setTimeout(fetchLiveBoard, 4000);
      return () => clearTimeout(timer);
    } else {
      fetchLiveBoard();
    }

    // Preload modal bundles after initial view has settled
    if (typeof window !== 'undefined') {
      const pTimer = setTimeout(() => {
        import('../components/TakeOverModal');
        import('../components/SlotDetailModal');
      }, 4500);
      return () => clearTimeout(pTimer);
    }
  }, [initialProfiles]);


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
  const slotsRef = useRef<SlotItem[]>([]);

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
    if (typeof window !== 'undefined') {
      if (window.history.length > 1 && (window.history.state?.modal || window.history.state?.viewingProfile)) {
        window.history.back();
        return;
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
    setViewingProfileId(null);
  }, []);

  const handlePopState = useCallback((event: PopStateEvent) => {
    const state = event.state;
    const currentSlots = slotsRef.current;

    if (state?.modal === 'project') {
      setSelectedSlot(null);
      setIsTakeOverOpen(false);
      setTargetSlotToBump(null);
      setViewingProfileMode('project');
      setViewingProfileId(state.profileId);
      return;
    }

    if (state?.modal === 'profile' || state?.viewingProfile) {
      setSelectedSlot(null);
      setIsTakeOverOpen(false);
      setTargetSlotToBump(null);
      setViewingProfileMode('user');
      setViewingProfileId(state.profileId);
      return;
    }

    if (state?.modal === 'bump') {
      setViewingProfileId(null);
      const match =
        currentSlots.find((s) => s.id === state.slotId || s.rank === state.rank) ||
        (state.slotId ? profiles.find((p) => p.id === state.slotId) : null);
      if (match) {
        setTargetSlotToBump('rank' in match ? match : toSlotItem(match, state.rank || 1));
        setIsTakeOverOpen(true);
        setSelectedSlot(null);
      }
      return;
    }

    if (state?.modal === 'slot') {
      setViewingProfileId(null);
      setIsTakeOverOpen(false);
      setTargetSlotToBump(null);
      const match =
        currentSlots.find((s) => s.rank === state.rank || s.id === state.slotId) ||
        (state.slotId ? profiles.find((p) => p.id === state.slotId) : null);
      if (match) {
        setSelectedSlot('rank' in match ? match : toSlotItem(match, state.rank || 1));
      }
      return;
    }

    // Default / Root: Check if URL still has ?rank=X or ?target=X
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const rankParam = params.get('rank');
      if (rankParam) {
        const r = Number(rankParam);
        const match = currentSlots.find((s) => s.rank === r);
        if (match) {
          setViewingProfileId(null);
          setIsTakeOverOpen(false);
          setTargetSlotToBump(null);
          setSelectedSlot(match);
          return;
        }
      }

      const targetParam = params.get('target');
      if (targetParam) {
        const match = currentSlots.find((s) => s.id === targetParam);
        if (match) {
          setViewingProfileId(null);
          setSelectedSlot(null);
          setTargetSlotToBump(match);
          setIsTakeOverOpen(true);
          return;
        }
      }
    }

    // Otherwise, close all overlays and return cleanly to grid
    setViewingProfileId(null);
    setSelectedSlot(null);
    setIsTakeOverOpen(false);
    setTargetSlotToBump(null);
  }, [profiles]);

  useEffect(() => {
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handlePopState]);

  const [highlightedRank, setHighlightedRank] = useState<number | null>(null);
  const [hoveredRank, setHoveredRank] = useState<number | null>(null);
  const [gridOrientation, setGridOrientation] = useState<GridOrientation>('landscape');
  const [latestBumpEvent, setLatestBumpEvent] = useState<BumpEvent | null>(null);
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
        invalidateClientBoardCache();
        fetchBoardClient({ limit: 120, forceFresh: true })
          .then((data) => {
            if (data?.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
              setProfiles(data.profiles);
            }
          })
          .catch(() => {});
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

  // Load historical War Room battle telemetry and battle comms
  useEffect(() => {
    let active = true;

    fetch('/api/war-room/events')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.events && Array.isArray(data.events) && data.events.length > 0) {
          setBumpHistory(data.events);
        }
      })
      .catch(() => {});

    fetch('/api/war-room/messages')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // Live Board Synchronizer: Supabase Realtime event streaming + Edge SWR Polling fallback
  useEffect(() => {
    let isMounted = true;
    let interval: NodeJS.Timeout | null = null;
    let realtimeChannel: any = null;

    const fetchBoard = async (silent = false, forceFresh = false) => {
      // Don't poll if the tab is hidden/minimized to save bandwidth and dev CPU
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      try {
        const catParam = filterState.category !== 'All' ? filterState.category : undefined;
        const sortParam = filterState.timeRange === 'today' ? 'trending' : undefined;
        const data = await fetchBoardClient({
          category: catParam,
          sort: sortParam,
          limit: 120,
          forceFresh,
        });
        if (isMounted && data.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
          setProfiles(data.profiles);
          if (!silent) {
            soundEngine.playShove();
          }
        }
      } catch {
        // Retain local memory state if offline or fetch fails
      }
    };

    if (!initialProfiles || initialProfiles.length === 0) {
      fetchBoard(true);
    }
    // Background polling: 30-second heartbeat with ETag check (304 Not Modified)
    interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchBoard(true);
      }
    }, 30000);

    // Subscribe to Supabase Realtime after initial hydration has settled
    let rtTimer: NodeJS.Timeout | null = setTimeout(() => {
      if (!isMounted) return;
      try {
        const supabase = createClient();
        realtimeChannel = supabase
          .channel('board_live_bumps')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'board_events' },
            (payload: any) => {
              if (isMounted) {
                fetchBoard(false);
                if (payload?.new) {
                  const row = payload.new;
                  const newRank = Number(row.new_rank);
                  const prevRank = row.previous_rank != null ? Number(row.previous_rank) : 101;
                  const title = row.project_title_snapshot || 'Contender';
                  const handle = row.project_handle_snapshot || '@unknown';
                  const amount = Math.floor(Number(row.new_active_value_minor || 0) / 100);

                  const bumpEvt: BumpEvent = {
                    id: row.id || `bump-${Date.now()}`,
                    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
                    promotedItem: {
                      id: row.project_id || 'unknown',
                      rank: newRank,
                      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
                      linkUrl: 'https://bumpone.lol',
                      title,
                      bidderName: handle.startsWith('@') ? handle : `@${handle}`,
                      amountPaid: amount,
                      createdAt: Date.now(),
                    },
                    droppedItem: {
                      id: `dropped-${row.id}`,
                      rank: prevRank,
                      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
                      linkUrl: 'https://bumpone.lol',
                      title: 'Displaced Contender',
                      bidderName: '@displaced',
                      amountPaid: Math.floor(Number(row.previous_active_value_minor || 0) / 100),
                      createdAt: Date.now(),
                    },
                    previousRank: prevRank,
                    newRank: newRank,
                  };

                  setBumpHistory((prev) => [bumpEvt, ...prev.slice(0, 49)]);
                  setLatestBumpEvent(bumpEvt);
                  setHighlightedRank(newRank);
                  setTimeout(() => setHighlightedRank(null), 3500);

                  if (newRank === 1) {
                    soundEngine.playCoronation();
                    handleTriggerReaction('👑');
                  } else {
                    soundEngine.playShove();
                    handleTriggerReaction('🔥');
                  }
                }
              }
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload: any) => {
              if (isMounted && payload?.new && !payload.new.is_deleted) {
                const row = payload.new;
                const newMsg: Message = {
                  id: row.id,
                  sender: row.author_handle
                    ? (row.author_handle.startsWith('@') ? row.author_handle : `@${row.author_handle}`)
                    : (row.author_name || '@spectator'),
                  avatarColor: row.avatar_color || 'bg-indigo-500',
                  text: String(row.text).slice(0, 200),
                  slotTag: row.slot_tag ?? undefined,
                  timestamp: new Date(row.created_at).getTime(),
                  isOfficial: Boolean(row.is_official),
                };
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });
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
    }, 4000);

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
      if (rtTimer) clearTimeout(rtTimer);
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
    if (typeof window !== 'undefined') {
      window.history.pushState(
        { modal: 'slot', rank: slot.rank, slotId: slot.id },
        '',
        `/?rank=${slot.rank}`
      );
    }
  }, []);

  const handleHoverRank = useCallback((rank: number | null) => {
    setHoveredRank(rank);
  }, []);

  const handleSelectMiniMapSlot = useCallback((slot: SlotItem) => {
    setSelectedSlot(slot);
    setHighlightedRank(slot.rank);
    setTimeout(() => setHighlightedRank(null), 3000);
    if (typeof window !== 'undefined') {
      window.history.pushState(
        { modal: 'slot', rank: slot.rank, slotId: slot.id },
        '',
        `/?rank=${slot.rank}`
      );
    }
  }, []);

  const handleOrientationChange = useCallback((orientation: GridOrientation) => {
    setGridOrientation(orientation);
  }, []);

  const handleSendMessage = (msg: Message | Omit<Message, 'id' | 'timestamp'>) => {
    const newMsg: Message = {
      ...msg,
      id: 'id' in msg && msg.id ? msg.id : `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: 'timestamp' in msg && msg.timestamp ? msg.timestamp : Date.now(),
    };
    setMessages((prev) => {
      if (prev.some((m) => m.id === newMsg.id)) return prev;
      return [...prev, newMsg];
    });
  };

  // Global top-100 slots derived from canonical ordering.
  const slots: SlotItem[] = useMemo(() => {
    return sortBoard(profiles).slice(0, 100).map((p, i) => toSlotItem(p, i + 1));
  }, [profiles]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // Spotlight/dim set for tier + search + category + value-range + time filters.
  const matchingRanks = useMemo<Set<number> | null>(() => {
    const isQueryActive = Boolean(filterState.searchQuery.trim());
    const isTierActive = filterState.tier !== 'all';
    const isCategoryActive = filterState.category !== 'All';
    const isValueActive = filterState.minPrice !== null || filterState.maxPrice !== null;
    const isTodayActive = filterState.timeRange === 'today';
    if (!isQueryActive && !isTierActive && !isCategoryActive && !isValueActive && !isTodayActive) return null;
    const rawQuery = filterState.searchQuery.toLowerCase().trim();
    const cleanQuery = rawQuery.replace(/^@/, '');
    const dayAgo = Date.now() - 24 * 3600000;
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const set = new Set<number>();
    slots.forEach((slot) => {
      if (rawQuery) {
        const prof = byId.get(slot.id);
        const slotHandle = (slot.handle || prof?.handle || '').toLowerCase().trim().replace(/^@/, '');
        const ownerHandle = (slot.owner_handle || prof?.owner_handle || '').toLowerCase().trim().replace(/^@/, '');
        const ownerName = (slot.owner_name || prof?.owner_name || '').toLowerCase().trim();

        let matchesSearch = false;

        if (rawQuery.startsWith('@')) {
          // Strict handle search: only match handles starting with cleanQuery (exact letter order from start)
          matchesSearch =
            cleanQuery.length > 0 &&
            (slotHandle.startsWith(cleanQuery) || ownerHandle.startsWith(cleanQuery));
        } else if (rawQuery.startsWith('#')) {
          const rankNum = rawQuery.slice(1);
          matchesSearch = String(slot.rank) === rankNum;
        } else {
          // General search: matches title, bidderName, ownerName, handle prefix, or rank number
          matchesSearch =
            slot.title.toLowerCase().includes(rawQuery) ||
            Boolean(slot.bidderName?.toLowerCase().includes(rawQuery)) ||
            ownerName.includes(rawQuery) ||
            slotHandle.startsWith(rawQuery) ||
            ownerHandle.startsWith(rawQuery) ||
            String(slot.rank) === rawQuery;
        }

        if (!matchesSearch) return;
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
      if (typeof window !== 'undefined' && profiles.length > 0) {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => {
            sessionSetJSON('bumped_board_cache', profiles);
            safeSet(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
          });
        } else {
          sessionSetJSON('bumped_board_cache', profiles);
          safeSet(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
        }
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [profiles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && offboard.length > 0) {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => {
            safeSet(STORAGE_KEY_OFFBOARD, JSON.stringify(offboard));
          });
        } else {
          safeSet(STORAGE_KEY_OFFBOARD, JSON.stringify(offboard));
        }
      }
    }, 5000);
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
    invalidateClientBoardCache();
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
            title="Open Live Activity Stream"
          >
            <span className="hidden sm:inline">Activity Feed</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
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
            leftIcon={<Archive className="w-3 h-3 text-slate-400" />}
            onClick={() => {
              soundEngine.playClick();
              setIsGraveyardOpen(true);
            }}
            className="text-xs py-1 px-2.5"
            title="Directory Archive"
          >
            <span className="hidden xs:inline">Archive</span>{' '}
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

          <div className="hidden md:block">
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
        </div>

        {/* Bottom Floating Coordinate & Status HUD — pr reserved for RadarMiniMap on desktop */}
        <div className="shrink-0 px-3 py-1 pr-3 md:pr-[260px] rounded-xl bg-[#141519]/90 backdrop-blur-md border border-white/[0.08] flex items-center justify-between text-[10px] sm:text-[11px] text-neutral-300 shadow-lg">
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
                <strong>Active Value Protocol:</strong> Top up to climb — your value carries forward. Spots #1–#100 are live on the billboard; listings displaced beyond #100 enter the Billboard Archive.
              </span>
            </div>
          )}
          <div className="shrink-0 pl-2 flex items-center gap-2.5">
            <div className="hidden xl:flex items-center gap-1.5 text-[9px] text-neutral-400 font-mono">
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">B</span> Book Spot
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">W</span> Activity
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">L</span> Leaderboard
              <span className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-neutral-300">G</span> Archive
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
            <div className="hidden xl:flex items-center gap-2 border-l border-white/[0.1] pl-2 text-[9px] text-neutral-400 font-mono">
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">
                Terms
              </a>
              <span>•</span>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">
                Privacy
              </a>
            </div>
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
            if (typeof window !== 'undefined' && window.history.state?.modal === 'bump') {
              window.history.back();
            }
          } else if (viewingProfileId) {
            handleCloseProfile();
          } else if (selectedSlot) {
            setSelectedSlot(null);
            if (typeof window !== 'undefined' && window.history.state?.modal === 'slot') {
              window.history.back();
            }
          } else {
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
            if (typeof window !== 'undefined') {
              if (window.history.state?.modal === 'bump') {
                window.history.back();
              } else {
                const url = new URL(window.location.href);
                url.searchParams.delete('target');
                window.history.replaceState({}, '', url.pathname + (url.search || ''));
              }
            }
          }}
          onBack={targetSlotToBump ? () => {
            const slotToRestore = targetSlotToBump;
            setIsTakeOverOpen(false);
            setTargetSlotToBump(null);
            if (typeof window !== 'undefined' && window.history.state?.modal === 'bump') {
              window.history.back();
            } else {
              setSelectedSlot(slotToRestore);
            }
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
            if (typeof window !== 'undefined' && window.history.state?.modal === 'bump') {
              window.history.replaceState({}, '', window.location.pathname);
            }
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
          onSelectSlot={(slot) => {
            setIsLeaderboardOpen(false);
            handleSlotClick(slot);
          }}
        />
      )}

      {selectedSlot && (
        <SlotDetailModal
          slot={selectedSlot}
          user={user}
          hasBackdrop={false}
          onClose={() => {
            setSelectedSlot(null);
            if (typeof window !== 'undefined') {
              if (window.history.state?.modal === 'slot') {
                window.history.back();
              } else {
                const url = new URL(window.location.href);
                url.searchParams.delete('rank');
                window.history.replaceState({}, '', url.pathname + (url.search || ''));
              }
            }
          }}
          onRequireAuth={() => setIsAuthOpen(true)}
          onViewProfile={(creatorIdentifier) => {
            const currentSlot = selectedSlot;
            setSelectedSlot(null);
            setViewingProfileMode('user');
            setViewingProfileId(creatorIdentifier);
            if (typeof window !== 'undefined') {
              window.history.pushState(
                { modal: 'profile', mode: 'user', profileId: creatorIdentifier, fromRank: currentSlot?.rank, fromSlotId: currentSlot?.id },
                '',
                `/profile/${creatorIdentifier}`
              );
            }
          }}
          onViewProject={(projectId) => {
            const currentSlot = selectedSlot;
            setSelectedSlot(null);
            setViewingProfileMode('project');
            setViewingProfileId(projectId);
            if (typeof window !== 'undefined') {
              window.history.pushState(
                { modal: 'project', mode: 'project', profileId: projectId, fromRank: currentSlot?.rank, fromSlotId: currentSlot?.id },
                '',
                `/project/${projectId}`
              );
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
            if (typeof window !== 'undefined') {
              window.history.pushState(
                { modal: 'bump', slotId: slot.id, rank: slot.rank },
                '',
                `/?target=${slot.id}`
              );
            }
          }}
          onUpdateReactions={(slotId, updatedReactions) => {
            setProfiles((prev) =>
              prev.map((item) =>
                item.id === slotId ? { ...item, reactions: updatedReactions } : item
              )
            );
            if (selectedSlot && selectedSlot.id === slotId) {
              setSelectedSlot((prev) => (prev ? { ...prev, reactions: updatedReactions } : null));
            }
          }}
        />
      )}

      {viewingProfileId && (
        <div className="fixed inset-0 z-50 overflow-y-auto py-8 px-2 sm:px-4 pointer-events-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <ProfileView
            profileId={viewingProfileId}
            initialMode={viewingProfileMode}
            onBack={handleCloseProfile}
            onSelectProfile={(nextId, nextMode) => {
              const mode = nextMode || (nextId.startsWith('slot-') || !isNaN(Number(nextId)) ? 'project' : 'user');
              setViewingProfileMode(mode);
              setViewingProfileId(nextId);
              if (typeof window !== 'undefined') {
                const path = mode === 'project' ? `/project/${nextId}` : `/profile/${nextId}`;
                window.history.pushState(
                  { modal: mode, mode, profileId: nextId },
                  '',
                  path
                );
              }
            }}
            onUpdateProfile={(updated) => {
              setProfiles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
              if (selectedSlot && selectedSlot.id === updated.id) {
                setSelectedSlot((prev) => (prev ? { ...prev, reactions: updated.reactions } : null));
              }
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
                const rankMatch = slots.findIndex((s) => s.id === projId) + 1;
                setTargetSlotToBump(toSlotItem(found, rankMatch > 0 ? rankMatch : 1));
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
