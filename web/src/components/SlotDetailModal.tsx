import React, { useState } from 'react';
import { Zap, ArrowUpRight, Share2, Copy, Check, ShieldCheck, Skull } from 'lucide-react';
import { Modal, Button, Badge } from './ui';
import { SlotItem } from '../lib/slotTypes';
import { soundEngine } from '../lib/sound';

export interface SlotDetailModalProps {
  slot: SlotItem | null;
  onClose: () => void;
  onBumpSlot: (slot: SlotItem) => void;
}

export const SlotDetailModal: React.FC<SlotDetailModalProps> = ({
  slot,
  onClose,
  onBumpSlot,
}) => {
  const [copied, setCopied] = useState(false);

  if (!slot) return null;

  const handleCopyShare = () => {
    soundEngine.playClick();
    const shareText = `Check out #${slot.rank} "${slot.title}" on Bumped.lol ($${slot.amountPaid} active value)!`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${window.location.origin}/?rank=${slot.rank}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isKing = slot.rank === 1;
  const isElite = slot.rank >= 2 && slot.rank <= 13;
  const isLord = slot.rank >= 14 && slot.rank <= 54;
  const isBubble = slot.rank === 100;

  return (
    <Modal
      isOpen={!!slot}
      onClose={onClose}
      title={`Slot #${slot.rank} Details`}
      subtitle={
        isKing
          ? 'Current Supreme King of the Board (4x4 Center Citadel)'
          : isElite
          ? 'Inner Orbit Elite (2x2 Prominent Tile)'
          : isLord
          ? 'Mid-Orbit Domino Lord (2x1 / 1x2 Territory)'
          : isBubble
          ? 'Perimeter Drop Brink (Danger Zone: Next bump sends this to Graveyard!)'
          : 'Outer Perimeter Contender (1x1 Tile)'
      }
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Large Image Preview in Dark Glass (auto-adjusts for portrait vs landscape) */}
        <div className="relative max-h-[360px] min-h-[220px] flex items-center justify-center rounded-2xl overflow-hidden bg-[#0d0e12] border border-white/[0.1] group">
          {/* Blurred backdrop glow for portrait / letterboxed assets */}
          <img
            src={slot.imageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover filter blur-xl opacity-30 scale-110 pointer-events-none"
            referrerPolicy="no-referrer"
          />
          <img
            src={slot.imageUrl}
            alt={slot.title}
            className="relative max-h-[340px] w-auto max-w-full object-contain rounded-lg shadow-2xl z-10 py-2"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-3 left-3 z-20">
            <Badge variant="rank" rank={slot.rank} />
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            <button
              onClick={handleCopyShare}
              className="p-1.5 rounded-lg bg-black/70 backdrop-blur-md text-slate-300 hover:text-white border border-white/[0.15] transition-all cursor-pointer"
              title="Copy link to this slot"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
            <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-black/80 backdrop-blur-md text-white border border-white/[0.15]">
              ${slot.amountPaid.toLocaleString()}
            </span>
          </div>

          {/* Danger zone badge if Rank #100 */}
          {isBubble && (
            <div className="absolute bottom-3 left-3 right-3 px-3 py-1.5 rounded-xl bg-rose-950/80 backdrop-blur-md border border-rose-500/50 flex items-center justify-between text-rose-200 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <Skull className="w-4 h-4 text-rose-400 animate-pulse" />
                DANGER ZONE: On the perimeter brink!
              </span>
              <span className="font-mono text-[11px] text-rose-300">#100</span>
            </div>
          )}
        </div>

        {/* Title & Bidder */}
        <div>
          <h4 className="text-lg font-semibold text-white">{slot.title}</h4>
          <p className="text-xs text-slate-400">Claimed by {slot.bidderName}</p>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <span className="text-[10px] text-slate-400 uppercase font-medium block">
              Grid Footprint
            </span>
            <span className="font-semibold text-slate-200 mt-1 block">
              {isKing
                ? '4x4 Center (16 Unit Cells)'
                : isElite
                ? '2x2 Inner Orbit (4 Unit Cells)'
                : '1x1 Square Tile (Position Scaled)'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <span className="text-[10px] text-slate-400 uppercase font-medium block">
              {slot.naturalWidth && slot.naturalHeight ? 'Asset Resolution' : 'Protection Cost'}
            </span>
            <span className="font-mono font-semibold text-white mt-1 block">
              {slot.naturalWidth && slot.naturalHeight
                ? `${slot.naturalWidth} × ${slot.naturalHeight}px (${slot.aspectRatio}:1)`
                : `Top up from $${slot.amountPaid + 10} to pass`}
            </span>
          </div>
        </div>

        {/* Destination link */}
        {slot.linkUrl && (
          <a
            href={slot.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between text-xs text-slate-200 hover:text-white hover:border-white/[0.2] transition-all group"
          >
            <div className="truncate">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">
                Destination Link
              </span>
              <span className="font-medium text-slate-200 group-hover:underline truncate block">
                {slot.linkUrl}
              </span>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0" />
          </a>
        )}

        {/* Actions */}
        <div className="pt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <a
            href={`/profile/${slot.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white border border-white/[0.1] hover:border-white/[0.25] transition-all"
          >
            Full passport <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
          <Button
            variant="primary"
            size="md"
            leftIcon={<Zap className="w-4 h-4" />}
            onClick={() => {
              onClose();
              onBumpSlot(slot);
            }}
          >
            Top-Up & Bump (from ${slot.amountPaid + 10})
          </Button>
        </div>
      </div>
    </Modal>
  );
};
