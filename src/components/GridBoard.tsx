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
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [mounted, setMounted] = useState<boolean>(false);
  const [orientation, setOrientation] = useState<GridOrientation>(() => {
    if (typeof window !== 'undefined') {
      const isPortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
      return isPortrait ? 'portrait' : 'landscape';
    }
    return 'landscape';
  });

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
    const handleResize = () => {
      const isPortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
      const next: GridOrientation = isPortrait ? 'portrait' : 'landscape';
      setOrientation(next);
      onOrientationChange?.(next);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [onOrientationChange]);

  // Compute percentage-based styles so the grid is centered and fills 100% of container immediately
  const cellStyles = useMemo(() => {
    const virtualW = orientation === 'portrait' ? 900 : 1500;
    const virtualH = orientation === 'portrait' ? 1500 : 900;
    const layout = computeBoardLayout(virtualW, virtualH, 100);
    if (!layout || layout.width <= 0 || layout.height <= 0) return null;

    const styles: Record<number, React.CSSProperties> = {};
    for (let rank = 1; rank <= 100; rank++) {
      const rect = layout.slots[rank];
      if (rect) {
        styles[rank] = {
          position: 'absolute',
          left: `${(rect.x / layout.width) * 100}%`,
          top: `${(rect.y / layout.height) * 100}%`,
          width: `${(rect.w / layout.width) * 100}%`,
          height: `${(rect.h / layout.height) * 100}%`,
        };
      }
    }
    return styles;
  }, [orientation]);

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
      <div className="absolute top-3 left-3 z-30 flex items-center gap-1 bg-[#18191d]/90 backdrop-blur-md p-1 rounded-xl border border-white/[0.12] shadow-xl text-neutral-300">
        <button
          onClick={handleZoomIn}
          disabled={zoomLevel >= 1.75}
          className="p-1.5 rounded-lg hover:bg-white/[0.1] hover:text-white disabled:opacity-30 transition-all cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="h-3 w-px bg-white/[0.1]" />
        <button
          onClick={handleZoomOut}
          disabled={zoomLevel <= 0.85}
          className="p-1.5 rounded-lg hover:bg-white/[0.1] hover:text-white disabled:opacity-30 transition-all cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="h-3 w-px bg-white/[0.1]" />
        <button
          onClick={handleResetZoom}
          className="px-1.5 py-1 rounded-lg text-[10px] font-mono hover:bg-white/[0.1] hover:text-white transition-all cursor-pointer flex items-center gap-1"
          title="Reset Zoom"
        >
          <Maximize2 className="w-3 h-3 text-slate-400" />
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
                      className="rounded-lg bg-gradient-to-b from-amber-500/[0.08] to-[#141519]/95 border-2 border-amber-400/90 shadow-2xl shadow-amber-500/20 ring-2 ring-amber-400/30 shimmer-effect overflow-hidden p-2 sm:p-3 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] sm:text-[10px] font-extrabold text-amber-300 bg-black/60 px-2 py-0.5 rounded border border-amber-400/30 flex items-center gap-1">
                          <Crown className="w-3 h-3 text-amber-400" /> #1 KING
                        </span>
                        <span className="h-3.5 w-10 sm:w-12 rounded bg-amber-400/20" />
                      </div>
                      <div className="flex flex-col items-center justify-center my-auto space-y-1.5 text-center">
                        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-amber-400/15 flex items-center justify-center">
                          <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400/70" />
                        </div>
                        <div className="h-2.5 sm:h-3 w-24 sm:w-32 rounded bg-white/20 mx-auto" />
                        <div className="h-2 w-16 sm:w-20 rounded bg-white/10 mx-auto" />
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-amber-400/20">
                        <div className="h-2 w-12 rounded bg-amber-400/20" />
                        <div className="h-2 w-8 rounded bg-white/10" />
                      </div>
                    </div>
                  );
                }

                if (rank >= 2 && rank <= 5) {
                  return (
                    <div
                      key={`shimmer-cell-${rank}`}
                      style={style}
                      className="rounded-lg bg-gradient-to-b from-purple-500/[0.06] to-[#141519]/95 border-2 border-purple-400/80 shadow-lg shadow-purple-500/20 ring-1 ring-purple-400/30 shimmer-effect overflow-hidden p-1.5 sm:p-2 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[8px] sm:text-[9px] font-bold text-purple-300 bg-black/50 px-1.5 py-0.5 rounded border border-purple-400/30 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-purple-400" /> #{rank}
                        </span>
                        <div className="h-2.5 w-7 rounded bg-purple-400/20" />
                      </div>
                      <div className="space-y-1 my-auto">
                        <div className="h-2 w-3/4 rounded bg-white/15" />
                        <div className="h-1.5 w-1/2 rounded bg-white/10" />
                      </div>
                      <div className="flex items-center justify-between pt-0.5 border-t border-purple-400/20">
                        <div className="h-1.5 w-8 rounded bg-purple-400/20" />
                      </div>
                    </div>
                  );
                }

                if (rank >= 6 && rank <= 15) {
                  return (
                    <div
                      key={`shimmer-cell-${rank}`}
                      style={style}
                      className="rounded-lg bg-[#141519]/95 border-[1.5px] border-sky-400/50 shadow-md shadow-sky-500/10 shimmer-effect overflow-hidden p-1 sm:p-1.5 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[8px] font-bold text-sky-300 bg-black/40 px-1 rounded">
                          #{rank}
                        </span>
                      </div>
                      <div className="space-y-1 my-auto">
                        <div className="h-1.5 w-3/4 rounded bg-white/10" />
                      </div>
                    </div>
                  );
                }

                if (rank >= 16 && rank <= 40) {
                  return (
                    <div
                      key={`shimmer-cell-${rank}`}
                      style={style}
                      className="rounded-md bg-[#141519]/95 border border-emerald-400/30 shadow-sm shadow-emerald-500/10 shimmer-effect overflow-hidden p-1 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[7px] font-bold text-emerald-300 bg-black/40 px-1 rounded">
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
                    className="rounded-md bg-[#141519]/90 border border-white/[0.07] shimmer-effect overflow-hidden p-0.5 sm:p-1 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[7px] sm:text-[8px] font-bold text-neutral-500 bg-black/40 px-0.5 rounded">
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
                    style={style}
                    onClick={handleCellClick}
                    onHover={handleCellHover}
                    className={
                      isHighlighted
                        ? 'ring-2 ring-white/90 z-30 shadow-2xl shadow-white/30'
                        : ''
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
