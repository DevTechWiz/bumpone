import React, { useState, useMemo } from 'react';
import {
  Compass,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Maximize2
} from 'lucide-react';
import { SlotItem } from '../lib/slotTypes';
import { LANDSCAPE_GRID_LAYOUT, PORTRAIT_GRID_LAYOUT, GridOrientation } from '../lib/concentricGrid';

export interface RadarMiniMapProps {
  slots: SlotItem[];
  orientation?: GridOrientation;
  highlightedRank: number | null;
  hoveredRank: number | null;
  onSelectSlot: (slot: SlotItem) => void;
  onHoverRank?: (rank: number | null) => void;
}

export const RadarMiniMap: React.FC<RadarMiniMapProps> = ({
  slots,
  orientation = 'landscape',
  highlightedRank,
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

  const layout = orientation === 'landscape' ? LANDSCAPE_GRID_LAYOUT : PORTRAIT_GRID_LAYOUT;
  const cols = orientation === 'landscape' ? 16 : 12;
  const rows = orientation === 'landscape' ? 12 : 16;

  // Map slots by rank for fast lookup
  const slotMap = useMemo(() => {
    const map = new Map<number, SlotItem>();
    slots.forEach((s) => map.set(s.rank, s));
    return map;
  }, [slots]);

  // Color mapping per tier
  const getCellColor = (rank: number, tier: string) => {
    if (rank === highlightedRank || rank === hoveredRank) {
      return '#ffffff';
    }
    switch (tier) {
      case 'king':
        return '#f59e0b'; // Amber 500
      case 'elite':
        return '#e5e7eb'; // Platinum Silver
      case 'lord':
        return '#9ca3af'; // Neutral Zinc 400
      case 'bubble':
        return '#f43f5e'; // Rose 500
      default:
        return '#52525b'; // Zinc 600
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
              [{cols}&times;{rows}]
            </span>
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
            {/* SVG Miniature Concentric Radar Canvas */}
            <div className="relative bg-black/60 rounded-xl border border-white/[0.08] p-1.5 flex items-center justify-center overflow-hidden">
              {/* Radar Sweep Animation Line */}
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <div
                  className="w-full h-full"
                  style={{
                    background: 'conic-gradient(from 0deg at 50% 50%, transparent 270deg, rgba(255, 255, 255, 0.35) 360deg)',
                    animation: 'spin 4s linear infinite',
                  }}
                />
              </div>

              {/* Grid SVG */}
              <svg
                viewBox={`0 0 ${cols * 10} ${rows * 10}`}
                className="w-44 h-33 sm:w-48 sm:h-36 block relative z-10"
                onMouseLeave={() => {
                  setActiveTooltip(null);
                  onHoverRank?.(null);
                }}
              >
                {/* Concentric guide rings */}
                <circle
                  cx={(cols * 10) / 2}
                  cy={(rows * 10) / 2}
                  r={rows * 2}
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={(cols * 10) / 2}
                  cy={(rows * 10) / 2}
                  r={rows * 3.8}
                  fill="none"
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="2 2"
                />

                {/* Render all 100 slots */}
                {Array.from({ length: 100 }, (_, i) => i + 1).map((rank) => {
                  const coord = layout[rank];
                  if (!coord) return null;
                  const slot = slotMap.get(rank);
                  const isHovered = hoveredRank === rank;
                  const isHighlighted = highlightedRank === rank;

                  const x = (coord.col - 1) * 10;
                  const y = (coord.row - 1) * 10;
                  const width = coord.colSpan * 10 - 1;
                  const height = coord.rowSpan * 10 - 1;

                  const fill = getCellColor(rank, coord.tier);

                  return (
                    <g key={rank}>
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={coord.tier === 'king' ? 2 : 1}
                        fill={fill}
                        fillOpacity={isHovered || isHighlighted ? 1 : coord.tier === 'king' ? 0.95 : 0.75}
                        stroke={isHovered || isHighlighted ? '#ffffff' : 'rgba(255,255,255,0.15)'}
                        strokeWidth={isHovered || isHighlighted ? 1.5 : 0.5}
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
                      {coord.tier === 'king' && (
                        <circle
                          cx={x + width / 2}
                          cy={y + height / 2}
                          r="2.5"
                          fill="#ffffff"
                          className="animate-ping"
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
