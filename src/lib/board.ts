// BumpOne.lol — canonical domain (project architecture; UI consumes this, never the reverse).
// Ordering: current_active_value DESC, earliest sequence first.
// Pricing: $10 minimum entry + $10 minimum increment on filled slots.
// Genesis face values run $1–$100. Quotes: 10-minute validity,
// informational only, final position recomputed at payment confirmation.
import type { SlotItem } from "./slotTypes";

export const MIN_INCREMENT = 10;
export const MIN_TOP_UP = 10;
export const QUOTE_VALIDITY_MIN = 10;

export const CATEGORIES = [
  "AI",
  "Apps",
  "Websites",
  "Creators",
  "Games",
  "Design",
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

export type FrameStyle = "default" | "gold" | "neon" | "cosmic" | "inset";

export const FRAME_STYLES: { id: FrameStyle; label: string; borderClass: string; glowClass: string }[] = [
  { id: "default", label: "Classic", borderClass: "border-white/[0.12]", glowClass: "" },
  { id: "gold", label: "Gold King", borderClass: "border-2 border-amber-400/90", glowClass: "shadow-[0_0_30px_rgba(251,191,36,0.35)] ring-1 ring-amber-300/60" },
  { id: "neon", label: "Cyber Emerald", borderClass: "border-2 border-emerald-400/90", glowClass: "shadow-[0_0_30px_rgba(52,211,153,0.35)] ring-1 ring-emerald-300/60" },
  { id: "cosmic", label: "Cosmic Aurora", borderClass: "border-2 border-purple-400/90", glowClass: "shadow-[0_0_30px_rgba(168,85,247,0.4)] ring-1 ring-fuchsia-300/60" },
  { id: "inset", label: "Studio Mat", borderClass: "border-4 border-white/20 p-2 bg-[#090a0d]", glowClass: "shadow-inner" },
];

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
  frame?: FrameStyle;
  imageZoom?: number;
  imagePosX?: number;
  imagePosY?: number;
  imageFit?: "cover" | "contain";
  imageRotation?: number;
}

export type Project = Profile;

export interface FeedEntry {
  id: string;
  profile_id: string;
  name: string;
  text: string;
  displaced: number;
  category: Category;
  ts: number;
}

export interface Quote {
  quote_id: string;
  current_value: number;
  target_value: number;
  quoted_top_up: number;
  resulting_value: number;
  expected_rank: number;
  expires_at: number;
}

interface Artwork {
  url: string;
  aspectRatio: number;
  width: number;
  height: number;
}

const ART: Artwork[] = [
  { url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80", aspectRatio: 0.67, width: 500, height: 750 },
  { url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80", aspectRatio: 0.67, width: 500, height: 750 },
  { url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80", aspectRatio: 0.67, width: 500, height: 750 },
  { url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=500&auto=format&fit=crop&q=80", aspectRatio: 0.67, width: 500, height: 750 },
  { url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&auto=format&fit=crop&q=80", aspectRatio: 0.67, width: 500, height: 750 },
  { url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=80", aspectRatio: 0.67, width: 500, height: 750 },
  { url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=80", aspectRatio: 0.67, width: 500, height: 750 },
  { url: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=500&auto=format&fit=crop&q=80", aspectRatio: 0.67, width: 500, height: 750 },
  { url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80", aspectRatio: 1.5, width: 750, height: 500 },
  { url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=700&auto=format&fit=crop&q=80", aspectRatio: 1.5, width: 750, height: 500 },
  { url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=700&auto=format&fit=crop&q=80", aspectRatio: 1.5, width: 750, height: 500 },
  { url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=700&auto=format&fit=crop&q=80", aspectRatio: 1.5, width: 750, height: 500 },
  { url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=700&auto=format&fit=crop&q=80", aspectRatio: 1.5, width: 750, height: 500 },
  { url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=700&auto=format&fit=crop&q=80", aspectRatio: 1.5, width: 750, height: 500 },
  { url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=700&auto=format&fit=crop&q=80", aspectRatio: 1.5, width: 750, height: 500 },
  { url: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=500&auto=format&fit=crop&q=80", aspectRatio: 1.0, width: 500, height: 500 },
  { url: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=500&auto=format&fit=crop&q=80", aspectRatio: 1.0, width: 500, height: 500 },
  { url: "https://images.unsplash.com/photo-1563089145-599997674d42?w=500&auto=format&fit=crop&q=80", aspectRatio: 1.0, width: 500, height: 500 },
  { url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=500&auto=format&fit=crop&q=80", aspectRatio: 1.0, width: 500, height: 500 },
  { url: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=500&auto=format&fit=crop&q=80", aspectRatio: 1.0, width: 500, height: 500 },
];

const ART_MAP = new Map(ART.map((a) => [a.url, a]));

export const CREATORS: User[] = [];

export function getCreator(_idOrHandle: string): User | undefined {
  return undefined;
}

export function buildProfiles(): Profile[] {
  return [];
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
export function toSlotItem(p: Profile, rank: number, isNew = false): SlotItem {
  const art = ART_MAP.get(p.imageUrl);
  const imageUrl = getOptimizedImageUrl(p.imageUrl, rank);
  return {
    id: p.id,
    rank,
    imageUrl,
    linkUrl: p.linkUrl,
    title: p.name,
    bidderName: p.owner_name || p.handle,
    amountPaid: p.active_value,
    createdAt: Date.now() - p.joined_days_ago * 86400000,
    isNew,
    aspectRatio: art?.aspectRatio,
    naturalWidth: art?.width,
    naturalHeight: art?.height,
    imageZoom: p.imageZoom,
    imagePosX: p.imagePosX,
    imagePosY: p.imagePosY,
    imageFit: p.imageFit,
    imageRotation: p.imageRotation,
    owner_id: p.owner_id,
    owner_name: p.owner_name,
    owner_handle: p.owner_handle,
    owner_avatar: p.owner_avatar,
    category: p.category,
    reactions: p.reactions,
  };
}

export function seedFeed(profiles: Profile[]): FeedEntry[] {
  const sorted = sortBoard(profiles);
  const verbs = ["took", "bumped to", "stormed", "claimed"];
  const picks = [0, 3, 6, 11, 17, 23, 30, 44];
  return picks
    .map((pi, k) => {
      const p = sorted[pi];
      if (!p) return null;
      return {
        id: "e" + k,
        profile_id: p.id,
        name: p.name,
        text: `${p.name} ${verbs[k % verbs.length]} #${pi + 1}`,
        displaced: 3 + ((k * 7) % 34),
        category: p.category,
        ts: Date.now() - (k + 1) * 47000,
      } as FeedEntry;
    })
    .filter((e): e is FeedEntry => e !== null);
}
