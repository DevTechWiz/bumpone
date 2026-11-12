import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Crown, Sparkles } from 'lucide-react';
import { GridCell } from './ui';
import { SlotItem } from '../lib/slotTypes';
import {
  computeBoardLayout,
  type GridOrientation,
} from '../lib/boardLayout';
import { soundEngine } from '../lib/sound';

export interface GridBoardProps {
  slots: SlotItem[];
  isLoading?: boolean;
  onSlotClick?: (slot: SlotItem) => void;
  highlightedRank?: number | null;
  matchingRanks?: Set<number> | null;
  hoveredRank?: number | null;
  onHoverRank?: (rank: number | null) => void;
  onOrientationChange?: (orientation: GridOrientation) => void;
  freeClaimsActive?: boolean;
}

const GridBoardComponent: React.FC<GridBoardProps> = ({
  slots,
  isLoading = false,
  onSlotClick,
  highlightedRank,
  matchingRanks = null,
  hoveredRank,
  onHoverRank,
  onOrientationChange,
  freeClaimsActive = true,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [mounted, setMounted] = useState<boolean>(false);

  const handleCellClick = useCallback(
    (cellData: any) => {
      onSlotClick?.(cellData as SlotItem);
    },
    [onSlotClick]
  );

  const handleCellHover = useCallback(
    (cellData: any) => {
      onHoverRank?.(cellData ? cellData.rank : null);
    },
    [onHoverRank]
  );

  useEffect(() => {
    setMounted(true);
    const mql = window.matchMedia('(orientation: portrait), (max-aspect-ratio: 1/1)');
    const handleMQ = (e: MediaQueryListEvent | MediaQueryList) => {
      const next: GridOrientation = e.matches ? 'portrait' : 'landscape';
      onOrientationChange?.(next);
    };

    handleMQ(mql);
    mql.addEventListener('change', handleMQ);
    return () => mql.removeEventListener('change', handleMQ);
  }, [onOrientationChange]);

  // Pure deterministic styles providing both landscape and portrait coordinates.
  // 100% identical between server and client to eliminate hydration mismatches.
  const cellStyles = useMemo(() => {
    const layoutL = computeBoardLayout(1500, 900, 100);
    const layoutP = computeBoardLayout(900, 1500, 100);
    if (!layoutL || !layoutP) return null;

    const styles: Record<number, React.CSSProperties> = {};
    for (let rank = 1; rank <= 100; rank++) {
      const rectL = layoutL.slots[rank];
      const rectP = layoutP.slots[rank];
      if (rectL && rectP) {
        styles[rank] = {
          ['--l-x' as any]: `${(rectL.x / layoutL.width) * 100}%`,
          ['--l-y' as any]: `${(rectL.y / layoutL.height) * 100}%`,
          ['--l-w' as any]: `${(rectL.w / layoutL.width) * 100}%`,
          ['--l-h' as any]: `${(rectL.h / layoutL.height) * 100}%`,
          ['--p-x' as any]: `${(rectP.x / layoutP.width) * 100}%`,
          ['--p-y' as any]: `${(rectP.y / layoutP.height) * 100}%`,
          ['--p-w' as any]: `${(rectP.w / layoutP.width) * 100}%`,
          ['--p-h' as any]: `${(rectP.h / layoutP.height) * 100}%`,
        };
      }
    }
    return styles;
  }, []);

  const handleZoomIn = () => {
    soundEngine.playClick();
    setZoomLevel((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 1.75));
  };

  const handleZoomOut = () => {
    soundEngine.playClick();
    setZoomLevel((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.85));
  };

  const handleResetZoom = () => {
    soundEngine.playClick();
    setZoomLevel(1.0);
  };

  const showSkeleton = (isLoading && slots.length === 0) || slots.length === 0;

  return (
    <div className="w-full h-full relative overflow-hidden rounded-2xl bg-[#141519]/90 backdrop-blur-xl border border-white/[0.09] shadow-2xl shadow-black/90 flex flex-col group/board">
      <style>{`
        .grid-board-slot {
          position: absolute;
          left: var(--l-x);
          top: var(--l-y);
          width: var(--l-w);
          height: var(--l-h);
        }
        @media (orientation: portrait), (max-aspect-ratio: 1/1) {
          .grid-board-slot {
            left: var(--p-x);
            top: var(--p-y);
            width: var(--p-w);
            height: var(--p-h);
          }
        }
      `}</style>
      {/* Center Gravitational Celestial Halo */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <div className="w-[320px] h-[320px] rounded-full bg-amber-500/[0.07] blur-3xl" />
        <div className="absolute w-[60%] h-[60%] rounded-full border border-white/[0.03] pointer-events-none" />
        <div className="absolute w-[90%] h-[90%] rounded-full border border-white/[0.02] pointer-events-none" />
      </div>

      {/* Background Subtle Coordinate Matrix Pattern */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Zoom controls */}
      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-30 flex items-center gap-0.5 sm:gap-1 bg-[#18191d]/90 backdrop-blur-md p-0.5 sm:p-1 rounded-lg sm:rounded-xl border border-white/[0.12] shadow-xl text-neutral-300">
        <button
          onClick={handleZoomIn}
          disabled={zoomLevel >= 1.75}
          className="p-1 sm:p-1.5 rounded-md sm:rounded-lg hover:bg-white/[0.1] hover:text-white disabled:opacity-30 transition-all cursor-pointer touch-manipulation"
          title="Zoom In"
        >
          <ZoomIn className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        </button>
        <div className="h-2.5 sm:h-3 w-px bg-white/[0.1]" />
        <button
          onClick={handleZoomOut}
          disabled={zoomLevel <= 0.85}
          className="p-1 sm:p-1.5 rounded-md sm:rounded-lg hover:bg-white/[0.1] hover:text-white disabled:opacity-30 transition-all cursor-pointer touch-manipulation"
          title="Zoom Out"
        >
          <ZoomOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        </button>
        <div className="h-2.5 sm:h-3 w-px bg-white/[0.1]" />
        <button
          onClick={handleResetZoom}
          className="px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] font-mono hover:bg-white/[0.1] hover:text-white transition-all cursor-pointer flex items-center gap-1 touch-manipulation"
          title="Reset Zoom"
        >
          <Maximize2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-slate-400" />
          <span>{Math.round(zoomLevel * 100)}%</span>
        </button>
      </div>

      {/* Full-bleed treemap board */}
      <div className="relative z-10 w-full h-full overflow-hidden">
        <div
          className="absolute inset-0 origin-center transition-transform duration-300 ease-out"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {cellStyles && showSkeleton
            ? Array.from({ length: 100 }).map((_, idx) => {
              const rank = idx + 1;
              const style = cellStyles[rank];
              if (!style) return null;

              if (rank === 1) {
                return (
                  <div
                    key="shimmer-cell-1"
                    style={style}
                    className="grid-board-slot @container rounded-lg bg-gradient-to-b from-amber-500/[0.08] to-[#141519]/95 border-2 border-amber-400/90 shadow-2xl shadow-amber-500/20 ring-2 ring-amber-400/30 shimmer-effect overflow-hidden p-[clamp(3px,2cqi,8px)] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[clamp(8px,3.5cqi,12px)] font-extrabold text-amber-300 bg-black/60 px-1.5 py-0.5 rounded border border-amber-400/30 flex items-center gap-1">
                        <Crown className="w-[clamp(8px,3.5cqi,12px)] h-[clamp(8px,3.5cqi,12px)] text-amber-400" /> #1 KING
                      </span>
                      <span className="h-3 w-10 rounded bg-amber-400/20" />
                    </div>
                    <div className="flex flex-col items-center justify-center my-auto space-y-1 text-center">
                      <div className="w-[clamp(16px,8cqi,32px)] h-[clamp(16px,8cqi,32px)] rounded-full bg-amber-400/15 flex items-center justify-center">
                        <Crown className="w-[clamp(10px,5cqi,16px)] h-[clamp(10px,5cqi,16px)] text-amber-400/70" />
                      </div>
                      <div className="h-2 w-20 rounded bg-white/20 mx-auto" />
                    </div>
                    <div className="flex items-center justify-between pt-0.5 border-t border-amber-400/20">
                      <div className="h-1.5 w-10 rounded bg-amber-400/20" />
                    </div>
                  </div>
                );
              }

              if (rank >= 2 && rank <= 5) {
                return (
                  <div
                    key={`shimmer-cell-${rank}`}
                    style={style}
                    className="grid-board-slot @container rounded-lg bg-gradient-to-b from-purple-500/[0.06] to-[#141519]/95 border-2 border-purple-400/80 shadow-lg shadow-purple-500/20 ring-1 ring-purple-400/30 shimmer-effect overflow-hidden p-[clamp(2.5px,2cqi,6px)] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[clamp(7px,3.8cqi,10px)] font-bold text-purple-300 bg-black/50 px-1 rounded border border-purple-400/30 flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5 text-purple-400" /> #{rank}
                      </span>
                      <div className="h-2 w-6 rounded bg-purple-400/20" />
                    </div>
                    <div className="space-y-1 my-auto">
                      <div className="h-1.5 w-3/4 rounded bg-white/15" />
                    </div>
                  </div>
                );
              }

              if (rank >= 6 && rank <= 15) {
                return (
                  <div
                    key={`shimmer-cell-${rank}`}
                    style={style}
                    className="grid-board-slot @container rounded-lg bg-[#141519]/95 border-[1.5px] border-sky-400/50 shadow-md shadow-sky-500/10 shimmer-effect overflow-hidden p-[clamp(2px,1.8cqi,5px)] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[clamp(6px,4.5cqi,9px)] font-bold text-sky-300 bg-black/40 px-1 rounded">
                        #{rank}
                      </span>
                    </div>
                    <div className="space-y-0.5 my-auto">
                      <div className="h-1 w-3/4 rounded bg-white/10" />
                    </div>
                  </div>
                );
              }

              if (rank >= 16 && rank <= 40) {
                return (
                  <div
                    key={`shimmer-cell-${rank}`}
                    style={style}
                    className="grid-board-slot @container rounded-md bg-[#141519]/95 border border-emerald-400/30 shadow-sm shadow-emerald-500/10 shimmer-effect overflow-hidden p-[clamp(1.5px,1.5cqi,4px)] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[clamp(5px,5cqi,8px)] font-bold text-emerald-300 bg-black/40 px-0.5 rounded">
                        #{rank}
                      </span>
                    </div>
                    <div className="h-1 w-1/2 rounded bg-white/5 my-auto" />
                  </div>
                );
              }

              return (
                <div
                  key={`shimmer-cell-${rank}`}
                  style={style}
                  className="grid-board-slot @container rounded-md bg-[#141519]/90 border border-white/[0.07] shimmer-effect overflow-hidden p-[clamp(1px,1.5cqi,3.5px)] flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[clamp(4.5px,6.5cqi,8px)] font-bold text-neutral-500 bg-black/40 px-0.5 rounded">
                      #{rank}
                    </span>
                  </div>
                  <div className="h-1 w-1/2 rounded bg-white/5 my-auto" />
                </div>
              );
            })
            : cellStyles &&
            slots.map((slot) => {
              const style = cellStyles[slot.rank];
              if (!style) return null;

              const isHighlighted = highlightedRank === slot.rank || hoveredRank === slot.rank;
              const isDimmed = matchingRanks !== null && !matchingRanks.has(slot.rank);

              return (
                <GridCell
                  key={slot.id}
                  slot={slot}
                  isHighlighted={isHighlighted}
                  isDimmed={isDimmed}
                  isClient={mounted}
                  freeClaimsActive={freeClaimsActive}
                  style={style}
                  onClick={handleCellClick}
                  onHover={handleCellHover}
                  className={
                    isHighlighted
                      ? 'grid-board-slot ring-2 ring-white/90 z-30 shadow-2xl shadow-white/30'
                      : 'grid-board-slot'
                  }
                />
              );
            })}
        </div>
      </div>
    </div>
  );
};

export const GridBoard = React.memo(GridBoardComponent);
