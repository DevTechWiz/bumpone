import React, { useState } from 'react';
import {
  Crown,
  Sparkles,
  ArrowRight,
  Share2,
  Check,
  X,
  Layers,
} from 'lucide-react';
import { Modal, Button } from './ui';
import { Profile, money } from '../lib/board';
import { getRankTier } from '../lib/slotTypes';

export interface BumpResultData {
  profile: Profile;
  previousRank: number | null;
  newRank: number;
  displacedCount: number;
  displacedProfiles?: { rank: number; title: string; imageUrl?: string }[];
}

interface BumpResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: BumpResultData | null;
  onLocateOnBoard?: (rank: number) => void;
}

export const BumpResultModal: React.FC<BumpResultModalProps> = ({
  isOpen,
  onClose,
  result,
  onLocateOnBoard,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !result) return null;

  const { profile, previousRank, newRank, displacedCount, displacedProfiles = [] } = result;
  const isKing = newRank === 1;
  const tier = getRankTier(newRank);

  const twitterShareUrl = (() => {
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/share/${profile.id}`
      : `https://bumpone.lol/share/${profile.id}`;

    const tweetText = isKing
      ? `👑 Just conquered Rank #1 Center King on @bumpone! ${displacedCount > 0 ? `Displaced ${displacedCount} projects on the grid.` : ''} Active Value: ${money(profile.active_value)}. Check the live board:`
      : `🚀 ${profile.name} just bumped to Rank #${newRank} on @bumpone! ${displacedCount > 0 ? `Displaced ${displacedCount} spots.` : ''} Check the live grid:`;

    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
  })();

  const handleShare = async () => {
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/share/${profile.id}`
      : `https://bumpone.lol/share/${profile.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile.name} just bumped to #${newRank} on BumpOne.lol!`,
          text: `I just bumped to #${newRank} on BumpOne.lol! ${displacedCount > 0 ? `${displacedCount} profiles moved.` : ''} Active Value: ${money(profile.active_value)}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignored
    }
  };

  const handleViewBoard = () => {
    onClose();
    if (onLocateOnBoard) {
      onLocateOnBoard(newRank);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" hasBackdrop={true} bodyClassName="p-0 overflow-hidden">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#1c1d22] via-[#121316] to-[#0c0d0f] border border-white/[0.12] p-6 sm:p-8 text-center text-white shadow-2xl shadow-black/90">
        {/* Ambient Glow */}
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-[90px] pointer-events-none opacity-40 ${
            isKing
              ? 'bg-amber-500'
              : tier === 'champion'
              ? 'bg-purple-500'
              : 'bg-emerald-500'
          }`}
        />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-neutral-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebration Badge */}
        <div className="relative z-10 flex justify-center mb-4">
          {isKing ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-lg shadow-amber-500/20">
              <Crown className="w-4 h-4 fill-amber-400/80" />
              <span>CROWN CONQUERED</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span>SUCCESSFUL BUMP</span>
            </div>
          )}
        </div>

        {/* Profile Avatar */}
        <div className="relative z-10 mx-auto w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl mb-4 bg-zinc-900">
          <img
            src={profile.imageUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400'}
            alt={profile.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono font-bold text-amber-300 border border-white/10">
            #{newRank}
          </div>
        </div>

        {/* Main Headline */}
        <h2 className="relative z-10 text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
          {isKing ? "You're Center King #1" : `You're Now Ranked #${newRank}`}
        </h2>

        {/* Displacement Callout */}
        <p className="relative z-10 text-neutral-300 text-sm sm:text-base font-medium mb-6">
          {displacedCount > 0 ? (
            <span>
              You just moved above <strong className="text-amber-300 font-bold">{displacedCount} profiles</strong> on the live board.
            </span>
          ) : (
            <span>You established your position with <strong className="text-emerald-300 font-bold">{money(profile.active_value)}</strong> in active value.</span>
          )}
        </p>

        {/* Rank Delta & Spend Matrix */}
        <div className="relative z-10 grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] mb-6">
          <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-black/40 border border-white/[0.05]">
            <span className="text-[11px] text-neutral-400 font-medium">Trajectory</span>
            <div className="flex items-center gap-1.5 mt-1 font-mono font-bold text-sm">
              <span className="text-neutral-500">{previousRank ? `#${previousRank}` : 'ENTRY'}</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">#{newRank}</span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-black/40 border border-white/[0.05]">
            <span className="text-[11px] text-neutral-400 font-medium">Active Value</span>
            <span className="mt-1 font-mono font-bold text-sm text-amber-300">
              {money(profile.active_value)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-black/40 border border-white/[0.05]">
            <span className="text-[11px] text-neutral-400 font-medium">Displaced</span>
            <div className="flex items-center gap-1 mt-1 font-mono font-bold text-sm text-sky-400">
              <Layers className="w-3.5 h-3.5" />
              <span>{displacedCount}</span>
            </div>
          </div>
        </div>

        {/* Displaced Previews (if any) */}
        {displacedProfiles.length > 0 && (
          <div className="relative z-10 text-left mb-6">
            <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-2 flex items-center justify-between">
              <span>Shifted Downward</span>
              <span className="text-[10px] text-neutral-500">Live Cascade</span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto pr-1">
              {displacedProfiles.slice(0, 4).map((d, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-black/30 border border-white/[0.04] text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[10px] text-rose-400 font-bold">↘ #{d.rank}</span>
                    <span className="text-neutral-300 truncate">{d.title}</span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono">-1 rank</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA Actions */}
        <div className="relative z-10 flex flex-col sm:flex-row gap-2.5">
          <a
            href={twitterShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/20 text-white hover:text-amber-300 text-xs font-bold py-2.5 px-3 transition-colors no-underline shadow-sm"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>Post on X</span>
          </a>

          <Button
            onClick={handleShare}
            variant="secondary"
            className="flex-1 justify-center gap-2 text-xs py-2.5 bg-white/[0.08] hover:bg-white/[0.12] border-white/20"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-amber-300" />}
            <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
          </Button>

          <Button
            onClick={handleViewBoard}
            variant="primary"
            className="flex-1 justify-center gap-2 text-xs py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold shadow-lg shadow-amber-500/25 border-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>View Board</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
