import React, { useState } from 'react';
import { Zap, ArrowUpRight, Share2, Check, ShieldCheck, Flag, AlertCircle, User } from 'lucide-react';
import { Modal, Button, Badge, Avatar } from './ui';
import { SlotItem } from '../lib/slotTypes';
import { soundEngine } from '../lib/sound';

export interface SlotDetailModalProps {
  slot: SlotItem | null;
  user?: any;
  onClose: () => void;
  onBumpSlot: (slot: SlotItem) => void;
  onViewProfile?: (creatorIdentifier: string) => void;
  onViewProject?: (projectId: string) => void;
  onRequireAuth?: () => void;
  hasBackdrop?: boolean;
  onUpdateReactions?: (slotId: string, reactions: { fire: number; eyes: number; heart: number; laugh: number }) => void;
}

// Client-side cache for user reactions so they highlight instantly (0ms) on card click
const userReactionsCache = new Map<string, string[]>();

export const SlotDetailModal: React.FC<SlotDetailModalProps> = ({
  slot,
  user,
  onClose,
  onBumpSlot,
  onViewProfile,
  onViewProject,
  onRequireAuth,
  hasBackdrop = true,
  onUpdateReactions,
}) => {
  const [copied, setCopied] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<'scam' | 'spam' | 'offensive' | 'broken_link' | 'other'>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const [localReactions, setLocalReactions] = useState<{ fire: number; eyes: number; heart: number; laugh: number }>(() => ({
    fire: slot?.reactions?.fire || 0,
    eyes: slot?.reactions?.eyes || 0,
    heart: slot?.reactions?.heart || 0,
    laugh: slot?.reactions?.laugh || 0,
  }));
  const [activeReactions, setActiveReactions] = useState<Set<string>>(() => {
    if (slot?.id && userReactionsCache.has(slot.id)) {
      return new Set(userReactionsCache.get(slot.id)!);
    }
    return new Set();
  });

  React.useEffect(() => {
    if (slot) {
      setLocalReactions({
        fire: slot.reactions?.fire || 0,
        eyes: slot.reactions?.eyes || 0,
        heart: slot.reactions?.heart || 0,
        laugh: slot.reactions?.laugh || 0,
      });
      if (slot.id && userReactionsCache.has(slot.id)) {
        setActiveReactions(new Set(userReactionsCache.get(slot.id)!));
      }
    }
  }, [slot]);

  React.useEffect(() => {
    let isCancelled = false;
    if (!user || !slot?.id) {
      setActiveReactions(new Set());
      return;
    }

    // Immediately seed from cache if available for 0ms visual responsiveness
    if (userReactionsCache.has(slot.id)) {
      setActiveReactions(new Set(userReactionsCache.get(slot.id)!));
    }

    fetch(`/api/reactions?projectId=${slot.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (isCancelled) return;
        if (Array.isArray(data?.userReactions)) {
          userReactionsCache.set(slot.id, data.userReactions);
          setActiveReactions(new Set(data.userReactions));
        }
        if (data?.reactions) {
          setLocalReactions(data.reactions);
          onUpdateReactions?.(slot.id, data.reactions);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [slot?.id, user]);

  const handleReaction = async (type: 'fire' | 'eyes' | 'heart' | 'laugh') => {
    soundEngine.playClick();
    if (!user) {
      if (onRequireAuth) {
        onRequireAuth();
      }
      return;
    }

    const isAlreadyActive = activeReactions.has(type);
    const newActive = new Set(activeReactions);
    const prevCount = localReactions[type] || 0;
    const newCount = isAlreadyActive ? Math.max(0, prevCount - 1) : prevCount + 1;

    if (isAlreadyActive) {
      newActive.delete(type);
    } else {
      newActive.add(type);
    }
    setActiveReactions(newActive);
    if (slot?.id) {
      userReactionsCache.set(slot.id, Array.from(newActive));
    }

    const updatedReactions = {
      fire: localReactions.fire || 0,
      eyes: localReactions.eyes || 0,
      heart: localReactions.heart || 0,
      laugh: localReactions.laugh || 0,
      [type]: newCount,
    };
    setLocalReactions(updatedReactions);
    if (slot?.id) {
      onUpdateReactions?.(slot.id, updatedReactions);
    }

    try {
      if (slot?.id) {
        if (isAlreadyActive) {
          const res = await fetch(`/api/reactions?projectId=${slot.id}&reaction=${type}`, {
            method: 'DELETE',
          });
          const data = await res.json();
          const serverReactions = data?.reactions || (data?.count != null ? { ...updatedReactions, [type]: data.count } : null);
          if (serverReactions) {
            setLocalReactions(serverReactions);
            onUpdateReactions?.(slot.id, serverReactions);
          }
        } else {
          const res = await fetch('/api/reactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: slot.id, reaction: type }),
          });
          const data = await res.json();
          const serverReactions = data?.reactions || (data?.count != null ? { ...updatedReactions, [type]: data.count } : null);
          if (serverReactions) {
            setLocalReactions(serverReactions);
            onUpdateReactions?.(slot.id, serverReactions);
          }
        }
      }
    } catch {
      // Keep optimistic state
    }
  };

  if (!slot) return null;

  const handleCopyShare = () => {
    soundEngine.playClick();
    const _shareText = `Check out #${slot.rank} "${slot.title}" on BumpOne.lol ($${slot.activeValue} active value)!`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?rank=${slot.rank}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isKing = slot.rank === 1;
  const isElite = slot.rank >= 2 && slot.rank <= 13;
  const isLord = slot.rank >= 14 && slot.rank <= 40;

  const rawHandle = (slot.owner_handle || slot.bidderName || '').replace(/^@/, '').trim();
  const rawName = slot.owner_name?.trim();
  const hasDistinctName = Boolean(
    rawName &&
    rawName.toLowerCase() !== rawHandle.toLowerCase() &&
    rawName.toLowerCase() !== `@${rawHandle.toLowerCase()}`
  );
  const creatorDisplayName = hasDistinctName ? rawName : (rawHandle ? `@${rawHandle}` : 'Anonymous');
  const creatorHandleSubtitle = hasDistinctName && rawHandle ? `@${rawHandle}` : null;
  const creatorId = slot.owner_handle?.replace(/^@/, '') || slot.owner_id || rawHandle;

  const handleViewCreatorProfile = () => {
    if (onViewProfile) {
      onViewProfile(creatorId);
    } else {
      window.location.href = `/profile/${creatorId}`;
    }
  };

  const handleViewProjectShowcase = () => {
    if (onViewProject) {
      onViewProject(slot.id);
    } else {
      window.location.href = `/project/${slot.id}`;
    }
  };

  const slotSubtitle = (() => {
    if (slot.rank === 1) return 'Current Supreme King of the Board';
    if (slot.rank <= 13) return 'Inner Ring Elite Spot (High Attention)';
    if (slot.rank <= 40) return 'Mid-Board Tier Spot (Ranks 14–40)';
    if (slot.rank <= 100) return 'Active Grid Spot (Ranks 41–100)';
    return 'Archived Slot (Bump to Restore Placement)';
  })();

  return (
    <Modal
      isOpen={!!slot}
      onClose={onClose}
      hasBackdrop={hasBackdrop}
      title={`Slot #${slot.rank} Details`}
      subtitle={slotSubtitle}
      maxWidth="md"
    >
      <div className="space-y-3.5">
        {/* Large Image Preview in Dark Glass (auto-adjusts for portrait vs landscape) */}
        <div className="relative max-h-[250px] min-h-[160px] flex items-center justify-center rounded-2xl overflow-hidden bg-[#0d0e12] border border-white/[0.1] group">
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
            className="relative max-h-[235px] w-auto max-w-full object-contain rounded-lg shadow-2xl z-10 py-1"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-3 left-3 z-20">
            <Badge variant="rank" rank={slot.rank} />
          </div>
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            <button
              onClick={handleCopyShare}
              className="p-1.5 rounded-lg bg-black/80 backdrop-blur-md text-slate-300 hover:text-white border border-white/[0.15] transition-all cursor-pointer shadow-lg"
              title="Copy link to this slot"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
            <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-black/85 backdrop-blur-md text-amber-300 border border-white/[0.2] shadow-lg">
              ${slot.activeValue.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Project Title & Creator Profile Attribution */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3">
          {/* Top row: Title and Category badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug break-words">
                {slot.title}
              </h4>
            </div>
            {slot.category && (
              <span className="shrink-0 text-[10px] px-2.5 py-1 rounded-full font-medium bg-white/[0.06] text-neutral-300 border border-white/[0.1] shadow-sm">
                {slot.category}
              </span>
            )}
          </div>

          {/* Middle: Creator Attribution */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleViewCreatorProfile}
              className="inline-flex items-center gap-2.5 min-w-0 text-left group cursor-pointer"
              title={`View ${creatorDisplayName}'s Profile`}
            >
              <Avatar
                src={slot.owner_avatar}
                name={creatorDisplayName}
                size="md"
                className="border border-white/[0.12] group-hover:border-amber-400/50 transition-colors"
                fallbackClassName="bg-white/[0.06]"
                fallbackIcon={<User className="w-4 h-4 text-slate-400 group-hover:text-amber-300 transition-colors" />}
              />
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 block uppercase font-medium tracking-wider">
                  Created by
                </span>
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs sm:text-sm font-semibold text-white group-hover:text-amber-300 group-hover:underline transition-colors truncate">
                    {creatorDisplayName}
                  </span>
                  {creatorHandleSubtitle && (
                    <span className="text-[11px] text-slate-400 font-normal truncate">
                      ({creatorHandleSubtitle})
                    </span>
                  )}
                </div>
              </div>
            </button>
          </div>

          {/* Bottom Action Grid: Creator Profile & Project Showcase */}
          <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={handleViewCreatorProfile}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] transition-all cursor-pointer group"
              title="View Creator's Profile and all projects they own"
            >
              <User className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-300 transition-colors shrink-0" />
              <span className="truncate">Creator Profile</span>
            </button>

            <button
              type="button"
              onClick={handleViewProjectShowcase}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] hover:border-white/[0.2] transition-all cursor-pointer group"
              title="View Project showcase"
            >
              <span className="truncate">Project Showcase</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
            </button>
          </div>
        </div>

        {/* Interactive Community Reactions */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">
            Reactions
          </span>
          <div className="flex items-center gap-1.5">
            {[
              { type: 'fire', emoji: '🔥', label: 'Fire' },
              { type: 'eyes', emoji: '👀', label: 'Eyes' },
              { type: 'heart', emoji: '❤️', label: 'Heart' },
              { type: 'laugh', emoji: '😂', label: 'Laugh' },
            ].map(({ type, emoji, label }) => {
              const isActive = activeReactions.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleReaction(type as any)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 ring-1 ring-amber-400/40 shadow-sm shadow-amber-500/20 scale-105'
                      : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.08] text-neutral-300 hover:scale-105 active:scale-95'
                  } border`}
                  title={user ? (isActive ? `Remove ${label}` : `React with ${label}`) : `Sign in to react with ${label}`}
                >
                  <span className="text-sm">{emoji}</span>
                  <span className={`text-[10px] font-mono font-medium ${isActive ? 'text-amber-300 font-bold' : 'text-neutral-300'}`}>
                    {localReactions[type as 'fire' | 'eyes' | 'heart' | 'laugh'] || 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* High-Value Takeover Stats (Simple, Direct English) */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/25">
            <span className="text-[10px] text-amber-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
              Cost to Bump
            </span>
            <div className="font-mono font-bold text-white text-base mt-1">
              +$10{' '}
              <span className="text-[11px] font-normal text-slate-400">
                (${slot.activeValue + 10} total)
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block truncate">
              {isKing ? 'Bumps to #1 spot on grid' : `Bumps Rank #${slot.rank} & pushes down`}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-indigo-400" />
              Current Rank Status
            </span>
            <div className="font-semibold text-white text-sm mt-1">
              {isKing
                ? '👑 King of the Grid'
                : isElite
                  ? '⚡ Top 10 Spot'
                  : isLord
                    ? '🛡️ Top 40 Spot'
                    : '🌟 Active on Grid'}
            </div>
            <span className="text-[10px] text-slate-300 mt-0.5 block truncate">
              Active Value: <strong className="text-white font-mono font-semibold">${slot.activeValue.toLocaleString()}</strong> &bull; {isKing ? 'Center King' : isElite ? 'Top 10 Spot' : 'Active Spot'}
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


        {/* Reporting Section */}
        {showReport && (
          <div className="p-3.5 rounded-xl bg-[#131417] border border-rose-500/30 space-y-3 shadow-inner">
            <div className="flex items-center justify-between text-xs font-semibold text-rose-300">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Report Slot #{slot.rank}
              </span>
              <button
                type="button"
                onClick={() => setShowReport(false)}
                className="text-neutral-400 hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
            {reportSuccess ? (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                Thank you. Report received for moderator review.
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = reportDetails.trim();
                  if (!trimmed || trimmed.length < 10) {
                    alert('Please provide a specific comment explaining why this slot violates guidelines (at least 10 characters).');
                    return;
                  }
                  setIsSubmittingReport(true);
                  try {
                    const res = await fetch('/api/reports', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        profileId: slot.id,
                        reason: reportReason,
                        details: trimmed,
                      }),
                    });
                    if (res.ok) {
                      setReportSuccess(true);
                      setTimeout(() => {
                        setShowReport(false);
                        setReportSuccess(false);
                        setReportDetails('');
                      }, 2500);
                    }
                  } catch {
                    alert('Failed to submit report');
                  } finally {
                    setIsSubmittingReport(false);
                  }
                }}
                className="space-y-2.5 text-xs"
              >
                <select
                  value={reportReason}
                  onChange={(e: any) => setReportReason(e.target.value)}
                  className="w-full bg-[#1c1d22] border border-white/[0.12] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400/60 cursor-pointer"
                >
                  <option value="spam" className="bg-[#1c1d22] text-slate-200">Spam / Unsolicited Promotion</option>
                  <option value="scam" className="bg-[#1c1d22] text-slate-200">Scam / Phishing Link</option>
                  <option value="offensive" className="bg-[#1c1d22] text-slate-200">Offensive / Inappropriate Content</option>
                  <option value="broken_link" className="bg-[#1c1d22] text-slate-200">Broken / Malicious Link</option>
                  <option value="other" className="bg-[#1c1d22] text-slate-200">Other Violation</option>
                </select>
                <div>
                  <textarea
                    required
                    minLength={10}
                    rows={2}
                    placeholder="Specific reason for report (required, min 10 chars)..."
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    className="w-full bg-[#1c1d22] border border-white/[0.12] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400/60 resize-none"
                  />
                  <span className="text-[10px] text-slate-400 block -mt-0.5">
                    Please provide clear details to help our trust & safety team verify and investigate this report.
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow-md shadow-rose-900/30"
                >
                  {isSubmittingReport ? 'Submitting…' : 'Submit Abuse Report'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Actions (Clean, Uncluttered Footer) */}
        <div className="pt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowReport(!showReport)}
            className="text-[11px] text-neutral-500 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
            title="Report this listing"
          >
            <Flag className="w-3 h-3" /> Report
          </button>
          <Button
            variant="primary"
            size="md"
            leftIcon={<Zap className="w-4 h-4 fill-zinc-950" />}
            onClick={() => {
              onBumpSlot(slot);
            }}
          >
            Bump Slot #{slot.rank} for ${Math.max(10, slot.activeValue) + 10}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
