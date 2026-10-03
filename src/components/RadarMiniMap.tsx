import React, { useState, useMemo } from 'react';
import {
  Compass,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SlotItem } from '../lib/slotTypes';
import {
  computeNormalizedLayout,
  type GridOrientation,
} from '../lib/boardLayout';

export interface RadarMiniMapProps {
  slots: SlotItem[];
  orientation?: GridOrientation;
  highlightedRank: number | null;
  matchingRanks?: Set<number> | null;
  hoveredRank: number | null;
  onSelectSlot: (slot: SlotItem) => void;
  onHoverRank?: (rank: number | null) => void;
}

/** Virtual board size used only to normalize radar rects (matches screen aspect). */
const RADAR_VIEWS = {
  landscape: { w: 1600, h: 900, label: '16×9' },
  portrait: { w: 900, h: 1600, label: '9×16' },
} as const;

const VB = 100; // SVG viewBox units
const RANKS = Array.from({ length: 100 }, (_, i) => i + 1);

const RadarMiniMapComponent: React.FC<RadarMiniMapProps> = ({
  slots,
  orientation = 'landscape',
  highlightedRank,
  matchingRanks = null,
  hoveredRank,
  onSelectSlot,
  onHoverRank,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTooltip, setActiveTooltip] = useState<{
    rank: number;
    title: string;
    amount: number;
    tier: string;
    x: number;
    y: number;
  } | null>(null);

  const view = RADAR_VIEWS[orientation];
  const layout = useMemo(
    () => computeNormalizedLayout(view.w, view.h, 100),
    [view.w, view.h]
  );

  const slotMap = useMemo(() => {
    const map = new Map<number, SlotItem>();
    slots.forEach((s) => map.set(s.rank, s));
    return map;
  }, [slots]);

  // Stealth Obsidian color tokens & orange filter highlights
  const STEALTH_PALETTE = {
    king: {
      fill: '#CBD5E1', // Soft Platinum Slate (toned down from harsh bright white)
      fillOpacity: 0.88,
      stroke: 'rgba(255, 255, 255, 0.45)',
      strokeWidth: 0.5,
    },
    champion: {
      fill: '#94A3B8', // Polished Titanium Slate
      fillOpacity: 0.82,
      stroke: 'rgba(255, 255, 255, 0.3)',
      strokeWidth: 0.4,
    },
    elite: {
      fill: '#64748B', // Cool Slate Steel
      fillOpacity: 0.72,
      stroke: 'rgba(255, 255, 255, 0.18)',
      strokeWidth: 0.3,
    },
    vanguard: {
      fill: '#334155', // Muted Graphite
      fillOpacity: 0.65,
      stroke: 'rgba(255, 255, 255, 0.1)',
      strokeWidth: 0.25,
    },
    contender: {
      fill: '#1E222D', // Deep Stealth Obsidian
      fillOpacity: 0.7,
      stroke: 'rgba(255, 255, 255, 0.07)',
      strokeWidth: 0.2,
    },
    active: {
      fill: '#EA580C', // Deep Vibrant Orange for hovered/selected slot
      fillOpacity: 0.95,
      stroke: 'rgba(254, 215, 170, 0.6)',
      strokeWidth: 0.45,
    },
    filterMatch: {
      fill: '#F97316', // Sleek warm orange highlight for filtered slots
      fillOpacity: 0.85,
      stroke: 'rgba(251, 146, 60, 0.4)', // Subtle matching orange rim, no harsh white
      strokeWidth: 0.35,
    },
  };

  const getCellStyle = (
    rank: number,
    tier: string,
    isHovered: boolean,
    isHighlighted: boolean
  ) => {
    if (isHovered || isHighlighted) {
      return STEALTH_PALETTE.active;
    }
    // Highlight matching slots without isolating the rest of the grid
    if (matchingRanks !== null && matchingRanks.has(rank)) {
      return STEALTH_PALETTE.filterMatch;
    }
    // Grid stays exactly the same for all other cells (no dimming or isolating)
    switch (tier) {
      case 'king':
        return STEALTH_PALETTE.king;
      case 'champion':
        return STEALTH_PALETTE.champion;
      case 'elite':
        return STEALTH_PALETTE.elite;
      case 'vanguard':
        return STEALTH_PALETTE.vanguard;
      default:
        return STEALTH_PALETTE.contender;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[230px] select-none">
      <div className="bg-[#18191d]/95 backdrop-blur-xl border border-white/[0.12] rounded-2xl shadow-2xl shadow-black/80 overflow-hidden transition-all duration-300">
        {/* Radar Header Bar */}
        <div className="px-3 py-2 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-white/[0.02]">
          <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-neutral-300">
            <Compass className="w-3.5 h-3.5 text-neutral-300 animate-[spin_12s_linear_infinite]" />
            <span className="text-[11px] font-semibold tracking-wider text-neutral-200">RADAR HUD</span>
            <span className="text-[9px] text-neutral-400 font-normal">
              [{view.label}]
            </span>
            {matchingRanks !== null && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40">
                {matchingRanks.size} highlighted
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors"
              title={isExpanded ? 'Collapse Radar' : 'Expand Radar'}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="p-3 space-y-2.5">
            {/* SVG Miniature Treemap Radar Canvas */}
            <div className="relative bg-black/60 rounded-xl border border-white/[0.08] p-1.5 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <div
                  className="w-full h-full"
                  style={{
                    background: 'conic-gradient(from 0deg at 50% 50%, transparent 270deg, rgba(255, 255, 255, 0.35) 360deg)',
                    animation: 'spin 4s linear infinite',
                  }}
                />
              </div>

              <svg
                viewBox={`0 0 ${VB} ${VB}`}
                preserveAspectRatio="none"
                className="w-44 h-33 sm:w-48 sm:h-36 block relative z-10"
                onMouseLeave={() => {
                  setActiveTooltip(null);
                  onHoverRank?.(null);
                }}
              >
                {RANKS.map((rank) => {
                  const coord = layout[rank];
                  if (!coord) return null;
                  const slot = slotMap.get(rank);
                  const isHovered = hoveredRank === rank;
                  const isHighlighted = highlightedRank === rank;

                  // Normalized 0–1 → viewBox, with ~0.4 unit inset for gutters.
                  const inset = 0.004;
                  const x = (coord.x + inset) * VB;
                  const y = (coord.y + inset) * VB;
                  const width = Math.max(0.2, (coord.w - inset * 2) * VB);
                  const height = Math.max(0.2, (coord.h - inset * 2) * VB);

                  const cellStyle = getCellStyle(rank, coord.tier, isHovered, isHighlighted);

                  return (
                    <g key={rank}>
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={coord.tier === 'king' ? 1.5 : 0.5}
                        fill={cellStyle.fill}
                        fillOpacity={cellStyle.fillOpacity}
                        stroke={cellStyle.stroke}
                        strokeWidth={cellStyle.strokeWidth}
                        className="cursor-pointer transition-all duration-150 hover:opacity-100"
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setActiveTooltip({
                            rank,
                            title: slot?.title || `Slot #${rank}`,
                            amount: slot?.amountPaid || 0,
                            tier: coord.tier,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                          onHoverRank?.(rank);
                        }}
                        onClick={() => {
                          if (slot) onSelectSlot(slot);
                        }}
                      />
                      {(isHovered || isHighlighted) && (
                        <circle
                          cx={x + width / 2}
                          cy={y + height / 2}
                          r={2.5}
                          fill="#EA580C"
                          className="animate-ping pointer-events-none"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Micro HUD Status Line (always visible; King #1 when nothing hovered) */}
            {(() => {
              const king = slotMap.get(1);
              const tip = activeTooltip ?? {
                rank: 1,
                title: king?.title ?? 'Slot #1',
                amount: king?.amountPaid ?? 0,
              };
              return (
                <div className="p-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-between text-[10px] font-mono">
                  <span className="text-neutral-300 truncate max-w-[110px]">
                    #{tip.rank} {tip.title}
                  </span>
                  <span className="font-bold text-emerald-400 shrink-0">
                    ${tip.amount}
                  </span>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export const RadarMiniMap = React.memo(RadarMiniMapComponent);
