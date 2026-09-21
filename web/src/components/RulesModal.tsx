import React from 'react';
import { Crown, Sparkles, Shield, Skull, Zap, HelpCircle, Compass, Radio } from 'lucide-react';
import { Modal, Button, Badge } from './ui';

export interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTakeover: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  onOpenTakeover,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Board Protocol & Concentric Rules"
      subtitle="How Active Value, top-ups, and the wall actually work."
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs text-slate-300">
        {/* Core Premise */}
        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-sky-400" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Active Value Ranking
            </h4>
          </div>
          <p className="leading-relaxed">
            Every profile holds an <strong>Active Value</strong>. The wall shows the <strong>top 100 by value</strong>, highest first — ranking is unlimited behind the wall, and pushed-out profiles are kept, never deleted. Your value <strong>carries forward</strong>: to climb a filled slot you pay only the top-up, <strong>target value − your value + $10</strong> (minimum $10, whole USD).
          </p>
        </div>

        {/* 5 Concentric Tiers Grid */}
        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
            Concentric Tier Geometries
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* King */}
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-400/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-200 flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5 text-amber-400" /> Supreme King (#1)
                </span>
                <span className="font-mono text-[10px] text-amber-400">4x4 Center (16 Units)</span>
              </div>
              <p className="text-[11px] text-slate-300">
                The massive central sovereign citadel. Radiates gravitational starlight and commands the entire board&apos;s visual focus.
              </p>
            </div>

            {/* Elites */}
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.12] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-slate-300" /> Inner Orbit Elites (#2–13)
                </span>
                <span className="font-mono text-[10px] text-slate-400">2x2 Tiles (4 Units)</span>
              </div>
              <p className="text-[11px] text-slate-300">
                12 prominent prime tiles rotating in the innermost orbit directly adjacent to the center citadel.
              </p>
            </div>

            {/* Mid-Orbit Vanguard */}
            <div className="p-3 rounded-xl bg-zinc-800/30 border border-zinc-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-200 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-zinc-400" /> Mid-Orbit Vanguard (#14–50)
                </span>
                <span className="font-mono text-[10px] text-zinc-400">Position-Scaled Squares</span>
              </div>
              <p className="text-[11px] text-neutral-300">
                Mid-ring territory holders scaled concentrically by radial distance from the King, preserving natural square proportions.
              </p>
            </div>

            {/* Perimeter Contenders & Brink */}
            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-rose-200 flex items-center gap-1">
                  <Skull className="w-3.5 h-3.5 text-rose-400" /> The Graveyard Drop Brink (#100)
                </span>
                <span className="font-mono text-[10px] text-rose-400">1x1 Unit</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Ranks #55–99 form the outer defensive border. Rank #100 is at immediate peril: the next climb pushes #100 off the wall — kept off-board, ready to reclaim.
              </p>
            </div>
          </div>
        </div>

        {/* Top-ups & Quotes */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08] space-y-1.5">
          <h4 className="font-semibold text-white flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" /> Top-Ups, Quotes & Reclaiming
          </h4>
          <p className="leading-relaxed text-slate-400">
            Genesis face values run $1–$100 (#1 = $100 … #100 = $1); every filled-slot takeover adds +$10. Quotes are valid 10 minutes and never reserve a rank — at payment confirmation your position is recomputed against the live board, and you take the highest spot your paid value qualifies for. Ranking stays dynamic: anyone can top up above you. Payment is a visibility service, not ownership or investment. If your tile leaves the wall, open the <strong>Graveyard</strong> drawer to reclaim it with a fresh top-up.
          </p>
        </div>

        {/* Keyboard Shortcuts Summary */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1.5 font-mono text-[11px]">
          <span className="text-slate-400 block uppercase font-medium">Power-User Keyboard Shortcuts</span>
          <div className="flex flex-wrap gap-2 text-slate-300">
            <span className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1]"><strong className="text-white">B</strong> Take Over / Bid</span>
            <span className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1]"><strong className="text-white">W</strong> War Room</span>
            <span className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1]"><strong className="text-white">L</strong> Leaderboard</span>
            <span className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1]"><strong className="text-white">G</strong> Graveyard</span>
            <span className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1]"><strong className="text-white">M</strong> Audio Mute</span>
            <span className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1]"><strong className="text-white">Esc</strong> Close</span>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Got it
          </Button>
          <Button
            variant="primary"
            size="md"
            leftIcon={<Zap className="w-4 h-4" />}
            onClick={() => {
              onClose();
              onOpenTakeover();
            }}
          >
            Claim Turf Now
          </Button>
        </div>
      </div>
    </Modal>
  );
};
