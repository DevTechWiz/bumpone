import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { GridCell } from './ui';
import { SlotItem } from '../lib/slotTypes';
import { getSlotCoordinate, GridOrientation } from '../lib/concentricGrid';
import { soundEngine } from '../lib/sound';

export interface GridBoardProps {
  slots: SlotItem[];
  onSlotClick?: (slot: SlotItem) => void;
  highlightedRank?: number | null;
  matchingRanks?: Set<number> | null;
  hoveredRank?: number | null;
  onHoverRank?: (rank: number | null) => void;
  onOrientationChange?: (orientation: GridOrientation) => void;
}

export const GridBoard: React.FC<GridBoardProps> = ({
  slots,
  onSlotClick,
  highlightedRank,
  matchingRanks = null,
  hoveredRank,
  onHoverRank,
  onOrientationChange,
}) => {
  // Determine landscape vs portrait based on viewport aspect ratio
  const [orientation, setOrientation] = useState<GridOrientation>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < window.innerHeight ? 'portrait' : 'landscape';
    }
    return 'landscape';
  });

  // Google Maps-style zoom level state: 1.0 (Fit), 1.25 (Close-up), 1.5 (Macro)
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  const handleCellClick = useCallback(
    (cellData: { rank: number }) => {
      const fullSlot = slots.find((s) => s.rank === cellData.rank);
      if (fullSlot) {
        onSlotClick?.(fullSlot);
      }
    },
    [slots, onSlotClick]
  );

  const handleCellHover = useCallback(
    (cellData: { rank: number } | null) => {
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

  const gridDimensions = useMemo(() => {
    if (orientation === 'landscape') {
      return {
        cols: 16,
        rows: 12,
        gridTemplateColumns: 'repeat(16, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(12, minmax(0, 1fr))',
      };
    }
    return {
      cols: 12,
      rows: 16,
      gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
      gridTemplateRows: 'repeat(16, minmax(0, 1fr))',
    };
  }, [orientation]);

  return (
    <div className="w-full h-full relative overflow-hidden rounded-2xl bg-[#141519]/90 backdrop-blur-xl border border-white/[0.09] p-1.5 sm:p-2 md:p-2.5 shadow-2xl shadow-black/90 flex flex-col group/board">
      {/* Center Gravitational Celestial Halo */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        {/* Core Amber/Gold Starlight Glow for King */}
        <div className="w-[320px] h-[320px] rounded-full bg-amber-500/[0.07] blur-3xl" />
        {/* Outer Orbit Ring 1 (Elites) */}
        <div className="absolute w-[60%] h-[60%] rounded-full border border-white/[0.03] pointer-events-none" />
        {/* Outer Orbit Ring 2 (Perimeter boundary) */}
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

      {/* Google Maps-style Floating Zoom & Viewport Overlay (Top Left of Board) */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-1 bg-[#18191d]/90 backdrop-blur-md p-1 rounded-xl border border-white/[0.12] shadow-xl text-neutral-300">
        <button
          onClick={handleZoomIn}
          disabled={zoomLevel >= 1.75}
          className="p-1.5 rounded-lg hover:bg-white/[0.1] hover:text-white disabled:opacity-30 transition-all cursor-pointer"
          title="Zoom In (Google Maps viewport)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="h-3 w-px bg-white/[0.1]" />
        <button
          onClick={handleZoomOut}
          disabled={zoomLevel <= 0.85}
          className="p-1.5 rounded-lg hover:bg-white/[0.1] hover:text-white disabled:opacity-30 transition-all cursor-pointer"
          title="Zoom Out (Google Maps viewport)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="h-3 w-px bg-white/[0.1]" />
        <button
          onClick={handleResetZoom}
          className="px-1.5 py-1 rounded-lg text-[10px] font-mono hover:bg-white/[0.1] hover:text-white transition-all cursor-pointer flex items-center gap-1"
          title="Reset Zoom Scale"
        >
          <Maximize2 className="w-3 h-3 text-slate-400" />
          <span>{Math.round(zoomLevel * 100)}%</span>
        </button>
      </div>

      {/* 
        The Concentric 100-Slot Grid Container with smooth transform-origin center scaling
      */}
      <div className="relative z-10 w-full h-full overflow-auto flex items-center justify-center">
        <div
          className="w-full h-full grid gap-1 sm:gap-1.5 transition-transform duration-300 ease-out origin-center"
          style={{
            transform: `scale(${zoomLevel})`,
            gridTemplateColumns: gridDimensions.gridTemplateColumns,
            gridTemplateRows: gridDimensions.gridTemplateRows,
          }}
        >
          {slots.slice(0, 100).map((slot) => {
              const isHighlighted = highlightedRank === slot.rank || hoveredRank === slot.rank;
              const isDimmed = matchingRanks !== null && !matchingRanks.has(slot.rank);
              const coord = getSlotCoordinate(slot.rank, orientation);

              return (
                <GridCell
                  key={slot.id}
                  slot={{
                    ...slot,
                    isNew: slot.isNew,
                  }}
                  isConcentric={true}
                  isHighlighted={isHighlighted}
                  isDimmed={isDimmed}
                  rowSpan={coord.rowSpan}
                  colSpan={coord.colSpan}
                  style={{
                    gridColumn: `${coord.col} / span ${coord.colSpan}`,
                    gridRow: `${coord.row} / span ${coord.rowSpan}`,
                  }}
                  onClick={handleCellClick}
                  onHover={handleCellHover}
                  className={
                    isHighlighted
                      ? 'ring-2 ring-white/90 z-30 scale-[1.02] shadow-2xl shadow-white/30'
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
