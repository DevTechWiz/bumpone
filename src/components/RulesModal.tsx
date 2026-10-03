import React from 'react';
import { Crown, Sparkles, Shield, Skull, Zap, Radio, ShieldAlert, ArrowRight, DollarSign } from 'lucide-react';
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
      title="How BumpOne Works: The Arena Rules"
      subtitle="Outbid rivals, claim your turf, and rule the 100-slot attention grid."
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs text-slate-300">
        {/* Section 1: The 3-Step Flow */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/[0.08] via-purple-500/[0.05] to-transparent border border-white/[0.08] space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              1. The 3 Steps to Play
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1">
              <span className="font-mono text-[10px] font-bold text-amber-400 flex items-center gap-1">
                STEP 1 <ArrowRight className="w-2.5 h-2.5 text-neutral-500" />
              </span>
              <strong className="block text-white text-[11px]">Pick a Slot or Rival</strong>
              <p className="text-[10px] text-neutral-400 leading-normal">
                Click any slot on the grid to challenge its rank, or hit &ldquo;Bump onto the Grid&rdquo; to launch your project.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1">
              <span className="font-mono text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                STEP 2 <ArrowRight className="w-2.5 h-2.5 text-neutral-500" />
              </span>
              <strong className="block text-white text-[11px]">Pay Only the Difference</strong>
              <p className="text-[10px] text-neutral-400 leading-normal">
                Your past spending carries forward as equity. You only pay the delta + at least ${MIN_TOP_UP} to leap ahead.
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1">
              <span className="font-mono text-[10px] font-bold text-purple-400 flex items-center gap-1">
                STEP 3 <Crown className="w-2.5 h-2.5 text-amber-400" />
              </span>
              <strong className="block text-white text-[11px]">Rule the Grid Live</strong>
              <p className="text-[10px] text-neutral-400 leading-normal">
                Your card displaces rivals instantly worldwide with live audio cues and War Room telemetry.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Active Value Carry-Forward with Concrete Example */}
        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> 2. Active Value Never Resets
            </span>
            <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Permanent Equity
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-300">
            Every dollar you spend stays attached to your project as <strong>Active Value</strong>. You never lose your prior investment:
          </p>
          <div className="p-2.5 rounded-lg bg-black/50 border border-amber-400/20 font-mono text-[11px] text-neutral-200">
            <span className="text-amber-300 font-bold">Example:</span> If your project has <strong className="text-white">$30</strong> active value and you want to overtake a rival sitting at <strong className="text-white">$50</strong>, you only pay <strong className="text-emerald-400">$30</strong> ($50 - $30 + ${MIN_TOP_UP} minimum). Your new active value becomes <strong className="text-amber-300">$60</strong>, and you take their rank immediately!
          </div>
        </div>

        {/* Section 3: The 4 Grid Tiers */}
        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
            3. The 4 Grid Tiers
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* King */}
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-400/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-200 flex items-center gap-1.5 text-xs">
                  <Crown className="w-3.5 h-3.5 text-amber-400" /> #1 King of the Grid
                </span>
                <span className="font-mono text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Throne</span>
              </div>
              <p className="text-[10px] text-slate-300 leading-normal">
                The massive hero card in the exact center. Commands maximum views, clicks, and prestige across the entire internet.
              </p>
            </div>

            {/* Elites */}
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.12] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-slate-300" /> Top 10 Spotlight (#2–#10)
                </span>
                <span className="font-mono text-[9px] text-slate-400 bg-white/[0.06] px-1.5 py-0.5 rounded">Elite Ring</span>
              </div>
              <p className="text-[10px] text-slate-300 leading-normal">
                Prominent cards surrounding the King. High organic views, highlighted borders, and sustained daily traffic.
              </p>
            </div>

            {/* Mid-Ranks */}
            <div className="p-3 rounded-xl bg-zinc-800/30 border border-zinc-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5 text-xs">
                  <Shield className="w-3.5 h-3.5 text-zinc-400" /> Top 50 Mid-Grid (#11–#50)
                </span>
                <span className="font-mono text-[9px] text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded">Core Arena</span>
              </div>
              <p className="text-[10px] text-neutral-300 leading-normal">
                Solid organic discovery from browsing visitors exploring products and builders on the board.
              </p>
            </div>

            {/* Danger Zone */}
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-200 flex items-center gap-1.5 text-xs">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Grid Floor (#51–#100)
                </span>
                <span className="font-mono text-[9px] text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded">Danger Zone</span>
              </div>
              <p className="text-[10px] text-slate-300 leading-normal">
                All 100 spots on the board are active. If an incoming higher bid knocks your card beyond #100, it moves to the Graveyard.
              </p>
            </div>
          </div>
        </div>

        {/* Section 4: War Room & Graveyard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1">
            <div className="flex items-center gap-1.5 text-white font-bold text-xs">
              <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" /> Live War Room
            </div>
            <p className="text-[10px] text-neutral-400 leading-normal">
              Spectate live coronations, hostile takeovers, and displacements as they happen with real-time audio and community chat.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1">
            <div className="flex items-center gap-1.5 text-white font-bold text-xs">
              <Skull className="w-3.5 h-3.5 text-neutral-400" /> The Graveyard
            </div>
            <p className="text-[10px] text-neutral-400 leading-normal">
              Displaced past #100? Your card is never deleted. Your active value stays saved—top up at least ${MIN_TOP_UP} to leap straight back onto the grid.
            </p>
          </div>
        </div>

        {/* Immediate Delivery & Non-Refundable Disclosure */}
        <div className="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[10px] text-neutral-400 font-mono flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
          <span>All bumps take effect instantaneously on the live global board and are strictly non-refundable.</span>
        </div>

        {/* Action Button & Legal Links */}
        <div className="pt-2 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[11px] text-neutral-400 font-mono">
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors underline-offset-2 hover:underline">
              Terms of Service
            </a>
            <span>•</span>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors underline-offset-2 hover:underline">
              Privacy Policy
            </a>
          </div>
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
