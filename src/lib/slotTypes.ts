export type RankTier = 'king' | 'champion' | 'elite' | 'vanguard' | 'contender';

export const getRankTier = (rank: number): RankTier => {
  if (rank === 1) return 'king';
  if (rank >= 2 && rank <= 5) return 'champion';
  if (rank >= 6 && rank <= 15) return 'elite';
  if (rank >= 16 && rank <= 40) return 'vanguard';
  return 'contender';
};

export interface SlotItem {
  id: string;
  rank: number;
  imageUrl: string;
  linkUrl: string;
  title: string;
  handle?: string;
  bidderName: string;
  activeValue: number;
  createdAt: number;
  isNew?: boolean;
  aspectRatio?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  owner_id?: string;
  owner_name?: string;
  owner_handle?: string;
  owner_avatar?: string;
  category?: string;
  reactions?: Record<string, number>;
}

export interface BumpEvent {
  id: string;
  timestamp: number;
  promotedItem: SlotItem;
  droppedItem: SlotItem;
  previousRank: number;
  newRank: number;
}

export interface BoardStats {
  totalSlots: number;
  priceFloor: number;
  rank1Bid: number;
  rank10Bid: number;
  totalBidsVolume: number;
  totalBumpsCount: number;
}

export interface Message {
  id: string;
  sender: string;
  avatarColor: string;
  text: string;
  slotTag?: number;
  timestamp: number;
  isOfficial?: boolean;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
  y: number;
}
