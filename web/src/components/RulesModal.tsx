import React from 'react';
import { Crown, Sparkles, Shield, Skull, Zap, Compass } from 'lucide-react';
import { Modal, Button } from './ui';
import { MIN_TOP_UP } from '../lib/board';

export interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTakeover: () => void;
  hasBackdrop?: boolean;
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  onOpenTakeover,
  hasBackdrop = true,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasBackdrop={hasBackdrop}
      title="How BumpOne Works: The Rules"
      subtitle="Simple rules: pay to rank, climb the grid, rule #1."
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs text-slate-300">
        {/* Core Premise */}
        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              1. The Highest Bidder Wins the Rank
            </h4>
          </div>
          <p className="leading-relaxed">
            Every slot has an <strong>Active Value</strong> (total dollars paid). The grid displays the <strong>top 100 slots</strong> by value. Your money <strong>always carries forward</strong>: you never pay twice. To climb or take someone&apos;s spot, you only pay the difference plus at least <strong>${MIN_TOP_UP}</strong>.
          </p>
        </div>

        {/* The 4 Grid Tiers */}
        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
            2. The Grid Tiers
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* King */}
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-400/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-200 flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5 text-amber-400" /> #1 King of the Grid
                </span>
                <span className="font-mono text-[10px] text-amber-400">Center Throne</span>
              </div>
              <p className="text-[11px] text-slate-300">
                The huge card right in the center. Gets the most views and highest traffic on the entire site.
              </p>
            </div>

            {/* Elites */}
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.12] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-slate-300" /> Top 10 Spotlight (#2–#10)
                </span>
                <span className="font-mono text-[10px] text-slate-400">High Views</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Prominent cards surrounding the King. High visibility and strong daily clicks.
              </p>
            </div>

            {/* Mid-Ranks */}
            <div className="p-3 rounded-xl bg-zinc-800/30 border border-zinc-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-200 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-zinc-400" /> Top 50 (#11–#50)
                </span>
                <span className="font-mono text-[10px] text-zinc-400">Solid Traffic</span>
              </div>
              <p className="text-[11px] text-neutral-300">
                Mid-grid slots with solid organic discovery from browsing visitors.
              </p>
            </div>

            {/* Danger Zone */}
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-200 flex items-center gap-1">
                  <Skull className="w-3.5 h-3.5 text-rose-400" /> The Danger Zone (#51–#100)
                </span>
                <span className="font-mono text-[10px] text-rose-400">Risk of Bump</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Rank #100 is on the brink. When a new slot enters, #100 gets pushed to the Graveyard. You can top up anytime to get back on the grid.
              </p>
            </div>
          </div>
        </div>

        {/* Permanent Public Ledger */}
        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-1.5">
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
            3. Never Deleted
          </h4>
          <p className="leading-relaxed">
            Even if your card is bumped off the top 100, your profile and history stay saved. Top up anytime with ${MIN_TOP_UP} or more to reclaim your spot on the grid.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-end">
          <Button
            variant="primary"
            size="md"
            leftIcon={<Zap className="w-4 h-4 fill-zinc-950" />}
            onClick={() => {
              onClose();
              onOpenTakeover();
            }}
          >
            Bump onto the Grid
          </Button>
        </div>
      </div>
    </Modal>
  );
};
