// BumpOne.lol — canonical domain (project architecture; UI consumes this, never the reverse).
// Ordering: current_active_value_minor DESC, earliest ranking_sequence first.
// Pricing: $10 minimum entry + $10 minimum increment on filled slots.
// Genesis face values run $1–$100. Quotes: 10-minute validity,
// informational only, final position recomputed at payment confirmation.
import type { SlotItem } from "./slotTypes";

export const MIN_INCREMENT = 10;
export const MIN_TOP_UP = 10;
export const QUOTE_VALIDITY_MIN = 10;

export const CATEGORIES = [
  "AI",
  "SaaS",
  "Apps",
  "Dev Tools",
  "Websites",
  "Crypto & Web3",
  "Design",
  "Productivity",
  "Creators",
  "Games",
  "FinTech",
  "E-Commerce",
  "Marketing",
  "Community",
  "Tech",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ReactionKey = "fire" | "eyes" | "heart" | "laugh";
export const REACTION_EMOJI: Record<ReactionKey, string> = {
  fire: "🔥",
  eyes: "👀",
  heart: "❤️",
  laugh: "😂",
};

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar_url?: string;
  bio?: string;
  twitter?: string;
  github?: string;
  website?: string;
  joined_days_ago?: number;
  created_at?: string;
  handle_last_changed_at?: string;
}

export function getHandleCooldownRemainingDays(lastChangedAt?: string | null): number {
  if (!lastChangedAt) return 0;
  const lastChangeMs = new Date(lastChangedAt).getTime();
  if (isNaN(lastChangeMs)) return 0;
  const elapsedMs = Date.now() - lastChangeMs;
  const totalMs = 30 * 24 * 60 * 60 * 1000;
  if (elapsedMs >= totalMs) return 0;
  return Math.ceil((totalMs - elapsedMs) / (1000 * 60 * 60 * 24));
}

export interface Profile {
  id: string;
  seq: number;
  name: string; // Project title
  handle: string; // Project handle/slug
  category: Category;
  active_value: number;
  imageUrl: string;
  linkUrl: string;
  peak_rank: number;
  times_bumped: number;
  times_climbed: number;
  views: number;
  shares: number;
  joined_days_ago: number;
  last_bump_at: number;
  journey: number[];
  reactions: Record<ReactionKey, number>;
  // Creator / Authenticated user profile who owns this project
  owner_id?: string;
  owner_name?: string;
  owner_handle?: string;
  owner_avatar?: string;
  owner_bio?: string;
  aspectRatio?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

export type Project = Profile;

export interface Quote {
  quote_id: string;
  current_value: number;
  target_value: number;
  quoted_top_up: number;
  resulting_value: number;
  expected_rank: number;
  expires_at: number;
}

/** Canonical ordering: active_value DESC, earliest sequence first. */
export function sortBoard(profiles: Profile[]): Profile[] {
  return [...profiles].sort(
    (a, b) => b.active_value - a.active_value || a.seq - b.seq
  );
}

export function rankOf(profiles: Profile[], id: string, category?: string): number | null {
  const pool =
    category && category !== "All"
      ? profiles.filter((p) => p.category === category)
      : profiles;
  const idx = sortBoard(pool).findIndex((p) => p.id === id);
  return idx === -1 ? null : idx + 1;
}

/** Server-side quote: target_value - current_value + minimum_increment. */
export function quoteTopUp(currentValue: number, targetValue: number): number {
  return Math.max(MIN_TOP_UP, targetValue - currentValue + MIN_INCREMENT);
}

export function buildQuote(currentValue: number, targetValue: number, expectedRank: number): Quote {
  const topUp = quoteTopUp(currentValue, targetValue);
  return {
    quote_id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    current_value: currentValue,
    target_value: targetValue,
    quoted_top_up: topUp,
    resulting_value: currentValue + topUp,
    expected_rank: expectedRank,
    expires_at: Date.now() + QUOTE_VALIDITY_MIN * 60 * 1000,
  };
}

/**
 * Recompute-at-confirmation: the highest position `resultingValue` qualifies
 * for against the CURRENT board (quotes never reserve ranks).
 */
export function recomputeRank(profiles: Profile[], resultingValue: number, entrantSeq: number): number {
  let rank = 1;
  for (const p of sortBoard(profiles)) {
    if (resultingValue > p.active_value) break;
    if (resultingValue === p.active_value && entrantSeq < p.seq) break;
    rank++;
  }
  return rank;
}

export function money(n: number): string {
  return "$" + n;
}

export function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** Return appropriately sized and compressed image URL based on slot rank tier */
export function getOptimizedImageUrl(url: string, rank: number): string {
  if (!url) return url;
  if (url.includes('unsplash.com')) {
    let width = 120;
    let quality = 65;
    if (rank === 1) {
      width = 600;
      quality = 80;
    } else if (rank <= 5) {
      width = 360;
      quality = 75;
    } else if (rank <= 15) {
      width = 240;
      quality = 70;
    } else if (rank <= 40) {
      width = 160;
      quality = 65;
    }
    return url
      .replace(/w=\d+/, `w=${width}`)
      .replace(/q=\d+/, `q=${quality}`);
  }
  return url;
}

/** Adapter: canonical Profile -> reference SlotItem shape (UI layer only). */
export function toSlotItem(p: Profile, rank: number, isNew = false, categoryRank?: number, globalRank?: number): SlotItem {
  const imageUrl = getOptimizedImageUrl(p.imageUrl, rank);
  return {
    id: p.id,
    rank,
    imageUrl,
    linkUrl: p.linkUrl,
    title: p.name,
    handle: p.handle,
    bidderName: p.owner_name || p.handle,
    activeValue: p.active_value,
    createdAt: Date.now() - p.joined_days_ago * 86400000,
    isNew,
    aspectRatio: p.aspectRatio,
    naturalWidth: p.naturalWidth,
    naturalHeight: p.naturalHeight,
    owner_id: p.owner_id,
    owner_name: p.owner_name,
    owner_handle: p.owner_handle,
    owner_avatar: p.owner_avatar,
    category: p.category,
    categoryRank,
    globalRank,
    reactions: p.reactions,
  };
}
