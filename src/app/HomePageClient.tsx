"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Zap,
  Radio,
  Archive,
  Search,
  Volume2,
  VolumeX,
  HelpCircle,
  User as UserIcon,
  Menu,
  X,
} from 'lucide-react';
import { Button, Skeleton } from '../components/ui';
import { useAuth } from '../lib/useAuth';
import { createClient } from '../lib/supabase/client';
import { UserMenu } from '../components/UserMenu';
import type { SlotItem, BumpEvent, Message, FloatingReaction } from '../lib/slotTypes';
import {
  CATEGORIES,
  sortBoard,
  toSlotItem,
  formatNumber,
  type Profile,
} from '../lib/board';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { safeGetJSON, safeSetJSON, sessionGetJSON, sessionSetJSON, safeSet } from '../lib/storage';
import { fetchBoardClient, invalidateClientBoardCache } from '../lib/boardClient';
import { GridBoard } from '../components/GridBoard';
import type { BumpPendingOrder } from '../components/TakeOverModal';
import { GridFilterBar, type GridFilterState } from '../components/GridFilterBar';
import { soundEngine } from '../lib/sound';
import type { GridOrientation } from '../lib/boardLayout';
import { getStoredAlertPreferences, showBrowserRankAlert } from '../lib/browserNotifications';

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

function buildBumpResult(
  profiles: Profile[],
  project: Profile,
  previousRank: number | null,
  newRank: number
): BumpResultData {
  const displacedCount =
    previousRank === null ? Math.max(0, 101 - newRank) : Math.max(0, previousRank - newRank);
  const displacedProfiles = sortBoard(profiles)
    .map((p, i) => ({ rank: i + 1, title: p.name, imageUrl: p.imageUrl, id: p.id }))
    .filter(
      (x) =>
        x.id !== project.id &&
        x.rank > newRank &&
        (previousRank === null || x.rank <= previousRank)
    )
    .slice(0, 5)
    .map(({ rank, title, imageUrl }) => ({ rank, title, imageUrl }));
  return { profile: project, previousRank, newRank, displacedCount, displacedProfiles };
}

export interface HomePageClientProps {
  initialProfiles?: Profile[];
  initialViewingProfileId?: string | null;
  initialViewingProfileMode?: 'user' | 'project';
  initialProject?: Profile | null;
}

export function HomePageClient({
  initialProfiles,
  initialViewingProfileId,
  initialViewingProfileMode = 'user',
  initialProject,
}: HomePageClientProps) {
  // 1. Core state: profiles (canonical domain) + off-board keep-list.
  // Initial states start consistent between server & client to prevent hydration mismatch.
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const list: Profile[] = initialProfiles && initialProfiles.length > 0 ? [...initialProfiles] : [];
    if (initialProject && !list.some((p) => p.id === initialProject.id)) {
      list.push(initialProject);
    }
    return list;
  });
  const [offboard, setOffboard] = useState<Profile[]>(() => {
    if (initialProfiles && initialProfiles.length > 100) return initialProfiles.slice(100, 150);
    return [];
  });
  const [isBoardLoading, setIsBoardLoading] = useState<boolean>(() => {
    return !(initialProfiles && initialProfiles.length > 0);
  });
  const [hasMounted, setHasMounted] = useState<boolean>(false);

  useEffect(() => {
    setHasMounted(true);
    // Only fall back to client storage if initialProfiles was not provided from the server
    if (initialProfiles === undefined) {
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
    }

    // Live background sync: server is always the authoritative source of truth
    const fetchLiveBoard = () => {
      fetchBoardClient({ limit: 120 })
        .then((data) => {
          if (data && Array.isArray(data.profiles)) {
            setProfiles(() => {
              const next = [...data.profiles];
              if (initialProject && !next.some((p) => p.id === initialProject.id)) {
                next.push(initialProject);
              }
              return next;
            });
            safeSetJSON(STORAGE_KEY_PROFILES, data.profiles);
            sessionSetJSON('bumped_board_cache', data.profiles);

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
            } else {
              setOffboard([]);
              safeSetJSON(STORAGE_KEY_OFFBOARD, []);
            }
          }
        })
        .catch((err) => console.warn('Could not fetch board profiles:', err))
        .finally(() => setIsBoardLoading(false));
    };

    let timer: NodeJS.Timeout | undefined;
    if (initialProfiles && initialProfiles.length > 0) {
      timer = setTimeout(fetchLiveBoard, 4000);
    } else {
      fetchLiveBoard();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [initialProfiles, initialProject]);


  // 2. UI and modal state (mirrors reference App).
  const [isTakeOverOpen, setIsTakeOverOpen] = useState(false);
  const [targetSlotToBump, setTargetSlotToBump] = useState<SlotItem | null>(null);
  const [isGraveyardOpen, setIsGraveyardOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(
    () => initialViewingProfileId || null
  );
  const [viewingProfileMode, setViewingProfileMode] = useState<'user' | 'project'>(
    () => initialViewingProfileMode || 'user'
  );
  const [isAlertSettingsOpen, setIsAlertSettingsOpen] = useState(false);
  const [bumpResult, setBumpResult] = useState<BumpResultData | null>(null);
  const slotsRef = useRef<SlotItem[]>([]);
  const realtimeChannelRef = useRef<any>(null);
  const lastBroadcastTimeRef = useRef<number>(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const spawnReaction = useCallback(
    (emoji: string, coords?: { x?: number; y?: number; xRatio?: number }) => {
      if (typeof window === 'undefined') return;
      const width = window.innerWidth;
      const height = window.innerHeight;

      let targetX: number;
      let targetY: number;

      if (typeof coords?.x === 'number' && !isNaN(coords.x)) {
        targetX = Math.max(20, Math.min(width - 20, coords.x + (Math.random() - 0.5) * 24));
      } else {
        const baseRatio =
          typeof coords?.xRatio === 'number' && !isNaN(coords.xRatio)
            ? Math.max(0.08, Math.min(0.92, coords.xRatio))
            : 0.85;
        targetX = Math.max(24, Math.min(width - 24, baseRatio * width + (Math.random() - 0.5) * 40));
      }

      if (typeof coords?.y === 'number' && !isNaN(coords.y)) {
        targetY = Math.max(60, Math.min(height - 20, coords.y - 12 + (Math.random() - 0.5) * 16));
      } else {
        // Fallback: start near bottom of viewport
        targetY = height - 70 + (Math.random() - 0.5) * 20;
      }

      const newReaction: FloatingReaction = {
        id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        emoji,
        x: targetX,
        y: targetY,
      };

      setReactions((prev) => {
        const next = prev.length > 28 ? prev.slice(-22) : prev;
        return [...next, newReaction];
      });
    },
    []
  );

  // docs/13 microinteractions — freshly bumped/inserted tiles show the BUMPED
  // badge + entrance pop for a few seconds, then settle.
  const [freshIds, setFreshIds] = useState<Record<string, true>>({});
  const freshTimersRef = useRef<Record<string, number>>({});
  const markFresh = useCallback((id?: string | null) => {
    if (!id) return;
    const existing = freshTimersRef.current[id];
    if (existing) window.clearTimeout(existing);
    freshTimersRef.current[id] = window.setTimeout(() => {
      delete freshTimersRef.current[id];
      setFreshIds((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 6000);
    setFreshIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);

  useEffect(() => {
    const timers = freshTimersRef.current;
    return () => {
      for (const id of Object.keys(timers)) {
        window.clearTimeout(timers[id]);
        delete timers[id];
      }
    };
  }, []);

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
      window.history.pushState({}, '', '/');
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

    // Direct URL check in popstate if history state lacks modal key (e.g. direct landing page in history)
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname.startsWith('/project/')) {
        const projId = pathname.replace('/project/', '');
        if (projId) {
          setSelectedSlot(null);
          setIsTakeOverOpen(false);
          setTargetSlotToBump(null);
          setViewingProfileMode('project');
          setViewingProfileId(projId);
          return;
        }
      }
      if (pathname.startsWith('/profile/')) {
        const profId = pathname.replace('/profile/', '');
        if (profId) {
          setSelectedSlot(null);
          setIsTakeOverOpen(false);
          setTargetSlotToBump(null);
          setViewingProfileMode('user');
          setViewingProfileId(profId);
          return;
        }
      }
      if (pathname === '/profile') {
        setSelectedSlot(null);
        setIsTakeOverOpen(false);
        setTargetSlotToBump(null);
        setViewingProfileMode('user');
        setViewingProfileId('self');
        return;
      }

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
  const [messages, setMessages] = useState<Message[]>([]);
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

      const showPendingBumpResult = (fresh: Profile[]) => {
        const pending = sessionGetJSON<BumpPendingOrder>('bump_pending');
        if (!pending) return;
        if (Date.now() - pending.at > 10 * 60_000) {
          sessionSetJSON('bump_pending', null);
          return;
        }
        if (!user) return;
        const proj = pending.projectId
          ? fresh.find((p) => p.id === pending.projectId)
          : fresh.find((p) => p.owner_id === user.id && p.name === pending.title);
        if (!proj || proj.active_value < pending.resultingValue) return;
        const ordered = sortBoard(fresh);
        const newRank = ordered.findIndex((p) => p.id === proj.id) + 1;
        if (newRank < 1) return;
        setBumpResult((prev) => prev ?? buildBumpResult(ordered, proj, pending.previousRank, newRank));
        markFresh(proj.id);
        sessionSetJSON('bump_pending', null);
      };

      if (status === 'success' || status === 'paid') {
        invalidateClientBoardCache();
        fetchBoardClient({ limit: 120, forceFresh: true })
          .then((data) => {
            if (data?.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
              setProfiles(data.profiles);
              showPendingBumpResult(data.profiles);
            }
          })
          .catch(() => { });
        setPaymentBanner({
          type: 'success',
          text: 'Payment processed successfully! Your active value has been credited and your slot is live.',
        });
        setTimeout(() => setPaymentBanner(null), 8000);
      } else if (status === 'pending_payment') {
        fetchBoardClient({ limit: 120, forceFresh: true })
          .then((data) => {
            if (data?.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
              showPendingBumpResult(data.profiles);
            }
          })
          .catch(() => { });
        setPaymentBanner({
          type: 'pending',
          text: 'Checkout initiated. Recomputing live wall position upon Dodo confirmation.',
        });
        setTimeout(() => setPaymentBanner(null), 8000);
      }

      if (status) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('status');
        window.history.replaceState({}, '', cleanUrl.pathname + (cleanUrl.search || '') + cleanUrl.hash);
      }

      if (target) {
        const found = profiles.find((p) => p.id === target);
        if (found) {
          const rankMatch = slots.findIndex((s) => s.id === target) + 1;
          setTargetSlotToBump(toSlotItem(found, rankMatch > 0 ? rankMatch : (found.peak_rank || 100)));
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
  }, [profiles, user, markFresh]);

  // Load historical War Room battle telemetry and battle comms. Also re-run on
  // realtime reconnect (docs/12:83) — the channel status callback calls this.
  const refreshWarRoom = useCallback(() => {
    fetch('/api/war-room/events')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.events && Array.isArray(data.events) && data.events.length > 0) {
          setBumpHistory((prev) => {
            const seen = new Set(data.events.map((e: any) => e.id));
            return [...data.events, ...prev.filter((e) => !seen.has(e.id))].slice(0, 50);
          });
        }
      })
      .catch(() => { });

    fetch('/api/war-room/messages')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages((prev) => {
            const ids = new Set(data.messages.map((m: any) => m.id));
            return [...data.messages, ...prev.filter((m) => !ids.has(m.id))];
          });
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    refreshWarRoom();
  }, [refreshWarRoom]);

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
    const rtTimer: NodeJS.Timeout | null = setTimeout(() => {
      if (!isMounted) return;
      try {
        let realtimeDropped = false;
        const supabase = createClient();
        realtimeChannel = supabase
          .channel('board_live_bumps', {
            config: {
              broadcast: { self: false },
            },
          })
          .on(
            'broadcast',
            { event: 'stream_reaction' },
            (msg: any) => {
              if (isMounted && msg?.payload?.emoji) {
                spawnReaction(msg.payload.emoji, { xRatio: msg.payload.xRatio });
              }
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'board_events' },
            (payload: any) => {
              if (isMounted) {
                const row = payload?.new;
                if (row) {
                  const newRank = Number(row.new_rank);
                  const prevRank = row.previous_rank != null ? Number(row.previous_rank) : 101;
                  const title = row.project_title_snapshot || 'Contender';
                  const handle = row.project_handle_snapshot || '@unknown';
                  const amount = Math.floor(Number(row.new_active_value_minor || 0) / 100);

                  const existingProfile = profiles.find((p) => p.id === row.project_id);
                  const bumpEvt: BumpEvent = {
                    id: row.id || `bump-${Date.now()}`,
                    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
                    promotedItem: {
                      id: row.project_id || 'unknown',
                      rank: newRank,
                      imageUrl: existingProfile?.imageUrl || '',
                      linkUrl: existingProfile?.linkUrl || 'https://bumpone.lol',
                      title,
                      bidderName: handle.startsWith('@') ? handle : `@${handle}`,
                      activeValue: amount,
                      createdAt: Date.now(),
                    },
                    droppedItem: {
                      id: `dropped-${row.id}`,
                      rank: prevRank,
                      imageUrl: '',
                      linkUrl: 'https://bumpone.lol',
                      title: 'Displaced Contender',
                      bidderName: '@displaced',
                      activeValue: Math.floor(Number(row.previous_active_value_minor || 0) / 100),
                      createdAt: Date.now(),
                    },
                    previousRank: prevRank,
                    newRank: newRank,
                  };

                  // Dedupe by row id (docs/12:60, docs/24:246): a replay or
                  // reconnect redelivery must not append a second copy.
                  setBumpHistory((prev) => {
                    if (prev.some((e) => e.id === bumpEvt.id)) return prev;
                    return [bumpEvt, ...prev.slice(0, 49)];
                  });
                  setLatestBumpEvent(bumpEvt);
                  setHighlightedRank(newRank);
                  setTimeout(() => setHighlightedRank(null), 3500);
                  markFresh(row.project_id);

                  // Trigger native browser notification if enabled
                  try {
                    const alertPrefs = getStoredAlertPreferences();
                    if (alertPrefs.browserAlerts) {
                      const viewer = userRef.current;
                      const droppedItem = bumpEvt.droppedItem;
                      const promotedItem = bumpEvt.promotedItem;
                      const isMyProject = Boolean(
                        viewer &&
                          droppedItem &&
                          (profilesRef.current.some((p) => p.id === droppedItem.id && p.owner_id === viewer.id) ||
                            (userAuthHandle && droppedItem.bidderName?.replace(/^@/, '').toLowerCase() === userAuthHandle.toLowerCase()))
                      );
                      const isKingDrop = bumpEvt.previousRank === 1 && bumpEvt.newRank !== 1;
                      const isGraveyardDrop = bumpEvt.newRank > 100;

                      if (isMyProject || (alertPrefs.instantKingAlert && (isKingDrop || isGraveyardDrop))) {
                        const alertTitle = isGraveyardDrop
                          ? `🚨 Graveyard Alert: ${droppedItem.title} dropped to #101!`
                          : isKingDrop
                          ? `👑 King Overtaken: ${promotedItem.title} took Rank #1!`
                          : `⚡ Billboard Alert: ${droppedItem.title} displaced to #${bumpEvt.newRank}`;

                        showBrowserRankAlert({
                          title: alertTitle,
                          body: `${promotedItem.bidderName} placed $${promotedItem.activeValue}. Tap to inspect billboard.`,
                          tag: `bump-${bumpEvt.id}`,
                          onClickUrl: `https://bumpone.lol/?claim=true&slot=${bumpEvt.previousRank || 1}`,
                        });
                      }
                    }
                  } catch (_err) {
                    // Non-blocking notification dispatch
                  }

                  if (newRank === 1) {
                    soundEngine.playCoronation();
                    handleTriggerReaction('👑');
                  } else {
                    soundEngine.playShove();
                    handleTriggerReaction('🔥');
                  }
                }

                const viewer = userRef.current;
                const projectId = typeof row?.project_id === 'string' ? row.project_id : undefined;
                const cached = projectId
                  ? profilesRef.current.find((p) => p.id === projectId)
                  : undefined;
                const mineCandidate =
                  Boolean(viewer && projectId) && (!cached || cached.owner_id === viewer!.id);

                if (mineCandidate && projectId && viewer) {
                  (async () => {
                    try {
                      const fresh = await fetchBoardClient({ limit: 120, forceFresh: true });
                      const list = fresh?.profiles;
                      if (!list || !Array.isArray(list) || list.length === 0) return;
                      setProfiles(list);
                      const proj = list.find((p) => p.id === projectId);
                      if (!proj || proj.owner_id !== viewer.id) return;
                      const bumpedRank = Number(row.new_rank);
                      if (!Number.isFinite(bumpedRank) || bumpedRank < 1) return;
                      const previousRank =
                        row.previous_rank != null ? Number(row.previous_rank) : null;
                      const merged: Profile = {
                        ...proj,
                        active_value: Math.floor(Number(row.new_active_value_minor || 0) / 100),
                      };
                      sessionSetJSON('bump_pending', null);
                      markFresh(projectId);
                      setBumpResult(
                        (prev) =>
                          prev ?? buildBumpResult(sortBoard(list), merged, previousRank, bumpedRank)
                      );
                    } catch {
                      // board resync happens on the next poll if this refresh fails
                    }
                  })();
                } else {
                  fetchBoard(false);
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
                // docs/12:66: pending/suspended/rejected/inactive profiles leave
                // the wall immediately; a re-approved profile returns on the next
                // poll/reconnect refetch (server truth).
                const approved =
                  row.is_active !== false && row.moderation_status === 'approved';
                if (!approved) {
                  setProfiles((prev) => prev.filter((item) => item.id !== row.id));
                  return;
                }
                setProfiles((prev) =>
                  prev.map((item) => {
                    if (item.id === row.id) {
                      return {
                        ...item,
                        active_value:
                          row.current_active_value_minor != null
                            ? Math.floor(Number(row.current_active_value_minor) / 100)
                            : item.active_value,
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
          .subscribe((status: string) => {
            if (!isMounted) return;
            if (status === 'SUBSCRIBED') {
              if (realtimeDropped) {
                // docs/12:83: after a dropped channel reconnects, resync board +
                // war-room history (supabase-js reconnects automatically).
                realtimeDropped = false;
                fetchBoard(true);
                refreshWarRoom();
              }
            } else if (
              status === 'CHANNEL_ERROR' ||
              status === 'TIMED_OUT' ||
              status === 'CLOSED'
            ) {
              realtimeDropped = true;
            }
          });

        realtimeChannelRef.current = realtimeChannel;
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
        } catch { }
        realtimeChannelRef.current = null;
      }
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [filterState.category, filterState.timeRange, markFresh, refreshWarRoom, spawnReaction]);

  const handleToggleMute = () => {
    const muted = soundEngine.toggleMute();
    setIsMuted(muted);
  };

  const handleTriggerReaction = useCallback(
    (emoji: string, e?: React.MouseEvent) => {
      const width = typeof window !== 'undefined' ? window.innerWidth : 1000;
      let clickX: number | undefined;
      let clickY: number | undefined;

      if (e) {
        const targetEl = e.currentTarget as HTMLElement | null;
        if (targetEl && typeof targetEl.getBoundingClientRect === 'function') {
          const rect = targetEl.getBoundingClientRect();
          clickX = rect.left + rect.width / 2;
          clickY = rect.top;
        } else {
          clickX = e.clientX;
          clickY = e.clientY;
        }
      }

      const effectiveX = clickX ?? width * 0.85;
      const xRatio = Math.max(0.08, Math.min(0.92, effectiveX / width));

      // 1. Instant local visual spawn starting right from the button (0ms latency)
      spawnReaction(emoji, { x: clickX, y: clickY, xRatio });

      // 2. Broadcast to all active visitors via Supabase Realtime (throttled at 120ms for smooth bursts)
      try {
        const now = Date.now();
        if (now - lastBroadcastTimeRef.current >= 120 && realtimeChannelRef.current) {
          lastBroadcastTimeRef.current = now;
          realtimeChannelRef.current.send({
            type: 'broadcast',
            event: 'stream_reaction',
            payload: { emoji, xRatio },
          });
        }
      } catch {
        // Fallback silently if offline
      }

      // 3. Send reaction to backend ONLY if a specific slot is explicitly hovered or open
      const targetId = hoveredRank ? slotsRef.current.find((s) => s.rank === hoveredRank)?.id : selectedSlot?.id;
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
        }).catch(() => { });
      }
    },
    [hoveredRank, selectedSlot, user, spawnReaction]
  );

  const handleRemoveReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSlotClick = useCallback((slot: SlotItem) => {
    if (slot.id.startsWith('open-slot-')) {
      soundEngine.playClick();
      setSelectedSlot(null);
      setTargetSlotToBump(slot);
      setIsTakeOverOpen(true);
      return;
    }
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
    if (slot.id.startsWith('open-slot-')) {
      soundEngine.playClick();
      setSelectedSlot(null);
      setTargetSlotToBump(slot);
      setIsTakeOverOpen(true);
      return;
    }
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
  const categoryViewActive = filterState.category !== 'All';
  const slots: SlotItem[] = useMemo(() => {
    const ordered = sortBoard(profiles).slice(0, 100);
    const catCounters: Record<string, number> = {};
    const list: SlotItem[] = ordered.map((p, i) => {
      catCounters[p.category] = (catCounters[p.category] || 0) + 1;
      return toSlotItem(
        p,
        i + 1,
        Boolean(freshIds[p.id]),
        catCounters[p.category],
        categoryViewActive ? p.peak_rank : undefined
      );
    });

    if (!categoryViewActive && list.length < 100) {
      for (let r = list.length + 1; r <= 100; r++) {
        list.push({
          id: `open-slot-${r}`,
          rank: r,
          imageUrl: '',
          linkUrl: '',
          title: r === 1 ? '👑 Center King #1' : `Open Turf #${r}`,
          bidderName: 'Available',
          activeValue: 0,
          createdAt: 0,
        });
      }
    }

    return list;
  }, [profiles, freshIds, categoryViewActive]);

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
        if (filterState.tier === 'contender' && (slot.rank < 41 || slot.rank > 100)) return;
      }
      if (isCategoryActive) {
        const prof = byId.get(slot.id);
        if (!prof || prof.category !== filterState.category) return;
      }
      if (filterState.minPrice !== null && slot.activeValue < filterState.minPrice) return;
      if (filterState.maxPrice !== null && slot.activeValue > filterState.maxPrice) return;
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
  const entryFloor = slots.length >= 100 ? Math.max(10, slots[99].activeValue) : 0;

  const stats = useMemo(() => {
    const totalValue = slots.reduce((acc, s) => acc + s.activeValue, 0);
    return {
      totalSlots: 100,
      activeSlotsCount: Math.min(100, slots.length),
      priceFloor: entryFloor,
      rank1Bid: slots[0]?.activeValue || 0,
      rank10Bid: slots[9]?.activeValue || 0,
      totalBidsVolume: totalValue,
      totalBumpsCount: offboard.length,
    };
  }, [slots, entryFloor, offboard.length]);

  // Live mirror of profiles for event handlers (avoids stale closures).
  const profilesRef = useRef<Profile[]>(profiles);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  // Mirror of the authed user for handlers registered with stale closures.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

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
    const allUserCandidatePool = [...profiles];
    for (const off of offboard) {
      if (!allUserCandidatePool.some((p) => p.id === off.id)) {
        allUserCandidatePool.push(off);
      }
    }
    return allUserCandidatePool
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
        imageUrl: p.imageUrl || (p as any).image_path || (p as any).image_url || '',
        linkUrl: p.linkUrl || (p as any).destination_url || '',
        category: p.category,
        owner_id: p.owner_id || user.id,
      }));
  }, [profiles, offboard, user, userAuthHandle]);

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
        {/* Brand Left */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center shrink-0">
            <Image
              src="/bumpone-logo.png"
              alt="BumpOne Logo"
              width={32}
              height={32}
              className="w-full h-full object-contain"
              priority
            />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white m-0 inline-flex items-center">
              BumpOne<span className="text-amber-400 font-semibold">.lol</span>
              <span className="sr-only"> - The 100-Slot Digital Billboard & Live Attention Grid</span>
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider rounded-full bg-white/[0.06] text-neutral-300 border border-white/[0.1]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Top 100
            </span>
          </div>
        </div>

        {/* Center: Search & Filter Toolbar (Desktop >= 1580px only) */}
        <div className="hidden min-[1580px]:flex flex-1 items-center justify-center px-2 min-w-0">
          <GridFilterBar
            filterState={filterState}
            onFilterChange={setFilterState}
          />
        </div>

        {/* Desktop Controls (>= 1580px only) */}
        <div className="hidden min-[1580px]:flex items-center gap-1.5 sm:gap-2 shrink-0">
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
            className="text-xs py-1 px-2.5 bg-white/[0.05] border-white/[0.12] text-neutral-200 hover:bg-white/[0.1]"
            title="Open War Room Activity Feed"
          >
            <span>War Room</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-0.5" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<HelpCircle className="w-3 h-3 text-slate-400" />}
            onClick={() => {
              soundEngine.playClick();
              setIsRulesOpen(true);
            }}
            className="inline-flex text-xs py-1"
            title="Billboard Rules & Protocol (?)"
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
            className="inline-flex text-xs py-1"
            title="Billboard Leaderboard"
          >
            Leaderboard
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
            title="Billboard Graveyard (#101+)"
          >
            <span>Graveyard</span>{' '}
            {!hasMounted && offboard.length === 0 ? (
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
              if (slots[0]) {
                setTargetSlotToBump(slots[0]);
              }
              if (!user) {
                setIsAuthOpen(true);
                return;
              }
              setIsTakeOverOpen(true);
            }}
            className="text-xs font-bold py-1.5 px-3 min-w-[105px]"
          >
            {slots[0] ? (
              `BUMP #1 ($${(slots[0]?.activeValue ?? 100) + 10})`
            ) : (
              <span className="inline-flex items-center gap-1.5">
                BUMP #1 (<Skeleton variant="text" width={28} height={12} className="inline-block" />)
              </span>
            )}
          </Button>
        </div>

        {/* Mobile / Tablet Header Right (< 1580px: BUMP #1 + Menu) */}
        <div className="flex min-[1580px]:hidden items-center gap-1.5 shrink-0">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Zap className="w-3.5 h-3.5" />}
            onClick={() => {
              soundEngine.playClick();
              if (slots[0]) {
                setTargetSlotToBump(slots[0]);
              }
              if (!user) {
                setIsAuthOpen(true);
                return;
              }
              setIsTakeOverOpen(true);
            }}
            className="text-xs font-bold py-1 px-2.5 whitespace-nowrap"
          >
            {slots[0] ? (
              <span>BUMP #1 <span className="font-mono text-[11px] opacity-90 font-normal">(${ (slots[0]?.activeValue ?? 100) + 10})</span></span>
            ) : (
              <span>BUMP #1</span>
            )}
          </Button>

          <button
            onClick={() => {
              soundEngine.playClick();
              setIsMobileMenuOpen(true);
            }}
            className="p-1.5 rounded-lg bg-white/[0.05] border border-white/[0.12] text-white hover:bg-white/[0.1] cursor-pointer transition-colors"
            title="Open Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile / Tablet Slide-Over Drawer (< 1580px) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 min-[1580px]:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Slide-out Sheet */}
          <div className="fixed inset-y-0 right-0 w-[85%] max-w-sm bg-[#141519] border-l border-white/[0.12] shadow-2xl flex flex-col z-50 animate-in slide-in-from-right duration-200 ease-out">
            {/* Drawer Top */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-[#101115]">
              <div className="flex items-center gap-2">
                <Image
                  src="/bumpone-logo.png"
                  alt="BumpOne"
                  width={24}
                  height={24}
                  className="w-6 h-6 object-contain"
                />
                <span className="font-extrabold text-white text-sm">
                  BumpOne<span className="text-amber-400">.lol</span>
                </span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] cursor-pointer transition-colors"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Account Status / Profile */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                {authLoading ? (
                  <Skeleton variant="rounded-lg" width="100%" height={32} />
                ) : user ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {(profile?.handle || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-white truncate">
                          {profile?.handle ? `@${profile.handle}` : user.email}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-neutral-300 shrink-0">
                        {existingHandles.length} slot{existingHandles.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/[0.06]">
                      <button
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          setViewingProfileMode('user');
                          setViewingProfileId('self');
                          if (typeof window !== 'undefined') {
                            window.history.pushState({ viewingProfile: true, profileId: 'self' }, '', '/profile');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-neutral-200 font-medium text-center cursor-pointer transition-colors"
                      >
                        My Profile
                      </button>
                      <button
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          signOut();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-300 font-medium text-center cursor-pointer transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Join Billboard</div>
                      <div className="text-[11px] text-neutral-400">Claim & bump slots</div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<UserIcon className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsAuthOpen(true);
                      }}
                      className="text-xs py-1 px-3"
                    >
                      Sign In
                    </Button>
                  </div>
                )}
              </div>

              {/* Search & Filters */}
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-2">
                  Search & Filters
                </div>
                <GridFilterBar
                  filterState={filterState}
                  onFilterChange={setFilterState}
                  className="w-full flex-wrap gap-2"
                />
              </div>

              {/* Navigation Items */}
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mb-2">
                  Live Features
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      soundEngine.playClick();
                      setIsMobileMenuOpen(false);
                      setIsWarRoomOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Radio className="w-4 h-4 text-zinc-300" />
                      <span>War Room Feed</span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </button>

                  <button
                    onClick={() => {
                      soundEngine.playClick();
                      setIsMobileMenuOpen(false);
                      setIsLeaderboardOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    <Search className="w-4 h-4 text-slate-400" />
                    <span>Top 100 Leaderboard</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEngine.playClick();
                      setIsMobileMenuOpen(false);
                      setIsGraveyardOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Archive className="w-4 h-4 text-slate-400" />
                      <span>Graveyard (#101+)</span>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400">({offboard.length})</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEngine.playClick();
                      setIsMobileMenuOpen(false);
                      setIsRulesOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4 text-slate-400" />
                    <span>Billboard Rules & Protocol</span>
                  </button>
                </div>
              </div>

              {/* Sound Setting */}
              <div className="pt-2 border-t border-white/[0.08]">
                <button
                  onClick={() => {
                    handleToggleMute();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                    <span>Sound Effects</span>
                  </div>
                  <span className={`text-[11px] font-mono ${isMuted ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {isMuted ? 'Muted' : 'Active'}
                  </span>
                </button>
              </div>
            </div>

            {/* Pinned Bottom Menu Footer */}
            <div className="w-full px-4 py-3 border-t border-white/[0.08] bg-[#101115] flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">Terms</a>
              <span>&bull;</span>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">Privacy</a>
              <span>&bull;</span>
              <a href="/refund" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">Refunds</a>
              <span>&bull;</span>
              <a href="/contact" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">Contact</a>
            </div>
          </div>
        </div>
      )}

      {/* Main Full-Screen Layout */}
      <main className="flex-1 w-full h-full min-h-0 px-2 sm:px-3 pt-1.5 pb-1.5 flex flex-col relative z-10 overflow-hidden gap-1">
        <div className="flex-1 w-full h-full min-h-0 relative">
          <GridBoard
            slots={slots}
            isLoading={isBoardLoading && slots.length === 0}
            onSlotClick={handleSlotClick}
            highlightedRank={highlightedRank}
            matchingRanks={matchingRanks}
            hoveredRank={hoveredRank}
            onHoverRank={handleHoverRank}
            onOrientationChange={handleOrientationChange}
          />

          <div className="hidden xl:block">
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

        {/* Bottom Floating Coordinate & Status HUD — xl:pr reserved for RadarMiniMap on large desktop */}
        <div className="shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 xl:pr-[250px] rounded-xl bg-[#141519]/90 backdrop-blur-md border border-white/[0.08] flex items-center justify-between text-[10px] sm:text-[11px] text-neutral-300 shadow-lg min-w-0 gap-2">
          {/* Left Hover Telemetry: hidden on small screens/mobile (< lg) since hover interactions do not exist on touch devices */}
          <div className="hidden lg:flex items-center min-w-0 truncate">
            {hoveredSlot ? (
              <div className="flex items-center gap-1.5 sm:gap-2 truncate font-mono min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 shrink-0 animate-ping" />
                <span className="text-zinc-200 font-bold shrink-0">
                  [#{hoveredSlot.rank}]
                </span>
                <span className="text-white font-sans font-semibold truncate">
                  {hoveredSlot.title}
                </span>
                <span className="text-neutral-400 hidden xl:inline truncate">
                  &bull; Held by <strong className="text-neutral-200">{hoveredSlot.bidderName}</strong> at <strong className="text-emerald-400 font-mono">${hoveredSlot.activeValue}</strong>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 truncate min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate text-neutral-300">
                  <strong className="text-white font-medium">Active Value Protocol:</strong>{' '}
                  <span className="hidden xl:inline">Top up to climb &bull; your value carries forward. </span>
                  Spots #1–100 live on billboard.
                </span>
              </div>
            )}
          </div>

          {/* Right Metrics: stretches across full width with balanced spacing on small screens (< lg) */}
          <div className="w-full lg:w-auto flex items-center justify-between lg:justify-end gap-2 sm:gap-4 shrink-0">
            <span className="text-neutral-400 font-mono text-[10px] shrink-0">
              Total <span className="hidden sm:inline">Active </span>Value:{' '}
              {profiles.length === 0 ? (
                <Skeleton variant="rounded" width={52} height={12} className="inline-block ml-1 align-middle" />
              ) : (
                <strong className="text-white font-bold">${formatNumber(stats.totalBidsVolume)}</strong>
              )}
            </span>
            <span className="font-mono text-[10px] text-rose-300 shrink-0">
              Off-board{' '}
              {offboard.length === 0 && profiles.length === 0 ? (
                <Skeleton variant="rounded" width={16} height={12} className="inline-block ml-1 align-middle" />
              ) : (
                <strong className="font-bold">{offboard.length}</strong>
              )}
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 border-l border-white/[0.1] pl-2 text-[9px] text-neutral-400 font-mono shrink-0">
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">
                Terms
              </a>
              <span>&bull;</span>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">
                Privacy
              </a>
              <span>&bull;</span>
              <a href="/refund" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">
                Refunds
              </a>
              <span>&bull;</span>
              <a href="/contact" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">
                Contact
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
          hasBackdrop={true}
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
          onBack={
            viewingProfileId
              ? () => {
                  setIsTakeOverOpen(false);
                  setTargetSlotToBump(null);
                }
              : targetSlotToBump
              ? () => {
                  const slotToRestore = targetSlotToBump;
                  setIsTakeOverOpen(false);
                  setTargetSlotToBump(null);
                  if (typeof window !== 'undefined' && window.history.state?.modal === 'bump') {
                    window.history.back();
                  } else {
                    setSelectedSlot(slotToRestore);
                  }
                }
              : undefined
          }
          currentSlots={slots}
          entryFloor={entryFloor}
          categories={[...CATEGORIES]}
          existingHandles={existingHandles}
          preselectedTargetSlot={targetSlotToBump}
          onRequireAuth={() => {
            setIsTakeOverOpen(false);
            setIsAuthOpen(true);
          }}
          onSubmitTopUp={() => {
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
          isOwner={(item) => existingHandles.some((h) => h.id === item.id)}
          onReclaimTurf={(item) => {
            if (!user) {
              setIsAuthOpen(true);
              return;
            }
            setTargetSlotToBump(item);
            setIsTakeOverOpen(true);
          }}
          onViewProject={(projectId) => {
            setIsGraveyardOpen(false);
            setViewingProfileMode('project');
            setViewingProfileId(projectId);
            if (typeof window !== 'undefined') {
              window.history.pushState(
                { modal: 'project', mode: 'project', profileId: projectId },
                '',
                `/project/${projectId}`
              );
            }
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
          onTriggerReaction={handleTriggerReaction}
        />
      )}

      {viewingProfileId && (
        <div className="fixed inset-0 z-50 overflow-y-auto py-8 px-2 sm:px-4 pointer-events-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <ProfileView
            profileId={viewingProfileId}
            initialMode={viewingProfileMode}
            initialProject={initialProject && initialProject.id === viewingProfileId ? initialProject : undefined}
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
