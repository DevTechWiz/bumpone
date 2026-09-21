export interface SlotItem {
  id: string;
  rank: number;
  imageUrl: string;
  linkUrl: string;
  title: string;
  bidderName: string;
  amountPaid: number;
  createdAt: number;
  isNew?: boolean;
  aspectRatio?: number;
  naturalWidth?: number;
  naturalHeight?: number;
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

export interface ChatMessage {
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
