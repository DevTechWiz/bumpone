import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
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

/** Cards are flush: adjacent rects touch exactly (no gutter, no overlap). */
const GAP = 0;
const GAP_INSET = GAP / 2;

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
  const [orientation, setOrientation] = useState<GridOrientation>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < window.innerHeight ? 'portrait' : 'landscape';
    }
    return 'landscape';
  });

  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [size, setSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768;
      return {
        w: isMobile ? Math.max(320, window.innerWidth - 32) : 1000,
        h: isMobile ? 540 : 700,
      };
    }
    return { w: 1000, h: 700 };
  });
  const containerRef = useRef<HTMLDivElement>(null);

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
    const handleResize = () => {
      const isPortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
      const next = isPortrait ? 'portrait' : 'landscape';
      setOrientation(next);
      onOrientationChange?.(next);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [onOrientationChange]);

  // Measure board → dynamic treemap (fills every pixel of the container).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const apply = (w: number, h: number) => {
      setSize((prev) =>
        Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5
          ? prev
          : { w, h }
      );
    };

    apply(el.clientWidth, el.clientHeight);

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) apply(rect.width, rect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const layout = useMemo(() => {
    if (size.w <= 0 || size.h <= 0) return null;
    return computeBoardLayout(size.w, size.h, Math.min(100, slots.length || 100));
  }, [size.w, size.h, slots.length]);

  const cellStyles = useMemo(() => {
    if (!layout) return null;
    const styles: Record<number, React.CSSProperties> = {};
    for (let rank = 1; rank <= 100; rank++) {
      const rect = layout.slots[rank];
      if (rect) {
        styles[rank] = {
          position: 'absolute',
          left: rect.x + GAP_INSET,
          top: rect.y + GAP_INSET,
          width: Math.max(1, rect.w - GAP),
          height: Math.max(1, rect.h - GAP),
        };
      }
    }
    return styles;
  }, [layout]);

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
          ref={containerRef}
          className="absolute inset-0 origin-center transition-transform duration-300 ease-out"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {cellStyles && (isLoading || slots.length === 0)
            ? Array.from({ length: 100 }).map((_, idx) => {
                const rank = idx + 1;
                const style = cellStyles[rank];
                if (!style) return null;

                return (
                  <div
                    key={`skeleton-cell-${rank}`}
                    style={style}
                    className="rounded-lg bg-white/[0.03] border border-white/[0.05] shimmer-effect overflow-hidden p-1.5 sm:p-2 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] font-bold text-white/30 bg-black/40 px-1 rounded">
                        #{rank}
                      </span>
                    </div>
                    {rank <= 13 && (
                      <div className="space-y-1">
                        <div className="h-2 w-3/4 rounded bg-white/10" />
                        <div className="h-1.5 w-1/2 rounded bg-white/5" />
                      </div>
                    )}
                  </div>
                );
              })
            : cellStyles &&
              slots.slice(0, 100).map((slot) => {
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
