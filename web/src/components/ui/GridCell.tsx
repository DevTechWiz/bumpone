import React, { useState, useEffect } from 'react';
import { ExternalLink, AlertTriangle, Crown, Sparkles, Shield, Zap } from 'lucide-react';
import { Badge, getRankTier } from './Badge';

export interface GridSlotData {
  id: string;
  rank: number;
  imageUrl: string;
  title: string;
  linkUrl?: string;
  amountPaid: number;
  bidderName?: string;
  timestamp?: string;
  isNew?: boolean;
}

export interface GridCellProps {
  slot: GridSlotData;
  onClick?: (slot: GridSlotData) => void;
  onHover?: (slot: GridSlotData | null) => void;
  className?: string;
  isInteractive?: boolean;
  style?: React.CSSProperties;
  isConcentric?: boolean;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  rowSpan?: number;
  colSpan?: number;
}

const GridCellComponent: React.FC<GridCellProps> = ({
  slot,
  onClick,
  onHover,
  className = '',
  isInteractive = true,
  style,
  isConcentric = false,
  isHighlighted = false,
  isDimmed = false,
  rowSpan,
  colSpan,
}) => {
  const [imageError, setImageError] = useState(false);
  // Hover overlays are invisible until a mouse can reach them, so skip all
  // 100 of them in SSR + hydration (~1000 DOM nodes) and mount client-only.
  // Initial client render matches the server (false), so no mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const tier = getRankTier(slot.rank);

  // Size styling classes for default flow (when style coordinate is not provided)
  const rankClassMap = isConcentric
    ? 'w-full h-full'
    : {
        king: 'col-span-4 row-span-4 aspect-square',
        elite: 'col-span-2 row-span-2 aspect-square',
        lord: 'col-span-2 row-span-1 aspect-video',
        contender: 'col-span-1 row-span-1 aspect-square',
        bubble: 'col-span-1 row-span-1 aspect-square',
      }[tier];

  // Refined Neutral Dark Grey borders & glowing accents
  const borderClassMap = {
    king: 'border-2 border-amber-400/80 shadow-2xl shadow-amber-500/25 ring-2 ring-amber-400/40',
    elite: 'border border-white/[0.25] shadow-lg shadow-black/50 hover:border-white/[0.4]',
    lord: 'border border-zinc-500/35 shadow-md shadow-black/40 hover:border-zinc-400/60',
    contender: 'border border-white/[0.08] hover:border-white/[0.25]',
    bubble: 'border-2 border-rose-500 shadow-xl shadow-rose-500/30 animate-pulse',
  }[tier];

  const handleClick = (e: React.MouseEvent) => {
    if (!isInteractive) return;
    if (onClick) {
      onClick(slot);
    } else if (slot.linkUrl) {
      e.stopPropagation();
      window.open(slot.linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      style={{
        ...style,
        transition: 'transform 200ms ease, opacity 200ms ease, box-shadow 200ms ease',
        transform: isHighlighted ? 'scale(1.03)' : 'scale(1)',
        opacity: isDimmed ? 0.22 : 1,
        zIndex: isHighlighted ? 45 : slot.isNew ? 40 : tier === 'king' ? 25 : 1,
      }}
      onClick={handleClick}
      onMouseEnter={() => onHover?.(slot)}
      onMouseLeave={() => onHover?.(null)}
      className={`group relative overflow-hidden rounded-xl bg-[#18191d]/95 backdrop-blur-sm select-none transition-all duration-200 ${
        isInteractive ? 'cursor-pointer hover:scale-[1.018] hover:z-30 hover:shadow-2xl hover:shadow-black/80' : ''
      } ${
        isHighlighted ? 'ring-2 ring-white shadow-2xl shadow-white/30 ring-offset-2 ring-offset-[#121316]' : ''
      } ${
        isDimmed ? 'filter grayscale-[0.4] pointer-events-auto' : ''
      } ${rankClassMap} ${borderClassMap} ${className}`}
    >
      {/* Background Image / Fallback */}
      {!imageError && slot.imageUrl ? (
        <img
          src={slot.imageUrl}
          alt={slot.title || `Slot #${slot.rank}`}
          onError={() => setImageError(true)}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#222328] to-[#121316] p-1.5 text-center">
          {tier === 'king' && <Crown className="w-8 h-8 text-amber-400 mb-1" />}
          {tier === 'elite' && <Sparkles className="w-4 h-4 text-zinc-300 mb-0.5" />}
          {tier === 'lord' && <Shield className="w-3.5 h-3.5 text-zinc-300 mb-0.5" />}
          {tier === 'bubble' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 mb-0.5" />}
          <span className="text-[11px] font-mono text-zinc-400">
            #{slot.rank}
          </span>
          {tier !== 'contender' && (
            <span className="text-[10px] font-mono text-zinc-200 font-semibold">
              ${slot.amountPaid.toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Subtle Dark Vignette gradient on bottom/top for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

      {/* Floating Badges */}
      <div className="absolute top-1 left-1 flex items-center gap-1 z-10 pointer-events-none">
        <Badge variant="rank" rank={slot.rank} />
        {slot.isNew && (
          <span className="hidden xs:inline-flex items-center gap-0.5 px-1 py-0.2 text-[8px] font-mono font-bold uppercase bg-white text-slate-950 rounded shadow-sm animate-pulse">
            <Zap className="w-2 h-2 fill-current" /> BUMPED
          </span>
        )}
      </div>

      {/* Top right: Price Badge in refined dark glass */}
      <div className="absolute top-1 right-1 z-10 pointer-events-none">
        <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-bold bg-black/80 backdrop-blur-md text-slate-100 border border-white/[0.14] shadow-sm">
          ${slot.amountPaid >= 1000 ? `${(slot.amountPaid / 1000).toFixed(1)}k` : slot.amountPaid}
        </span>
      </div>

      {/* King (#1 in Center) Prominent Banner */}
      {tier === 'king' && (
        <div className="absolute bottom-1.5 left-1.5 right-1.5 z-10 pointer-events-none flex flex-col gap-0.5">
          <div className="bg-black/85 backdrop-blur-md border border-amber-400/40 rounded-lg p-1.5 sm:p-2">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                <Crown className="w-3 h-3 text-amber-400" /> CENTER KING #1
              </span>
              <span className="text-xs font-mono font-bold text-amber-200">
                ${slot.amountPaid.toLocaleString()}
              </span>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-white truncate drop-shadow-sm">
              {slot.title}
            </h3>
            {slot.bidderName && (
              <p className="text-[10px] text-slate-300 truncate">
                by {slot.bidderName}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Elite (#2..#13, 2x2 spacious cells) Title strip */}
      {tier === 'elite' && (
        <div className="absolute bottom-1 left-1 right-1 z-10 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-sm rounded px-1.5 py-0.5 border border-white/[0.1] truncate">
            <p className="text-[10px] font-medium text-white truncate">
              {slot.title}
            </p>
          </div>
        </div>
      )}

      {/* Bubble Warning Pill (Slot #100 on perimeter brink) */}
      {slot.rank === 100 && (
        <div className="absolute bottom-0.5 left-0.5 right-0.5 z-10 text-center pointer-events-none">
          <span className="inline-block w-full py-0.5 text-[7px] font-bold uppercase tracking-wider bg-rose-950/95 text-rose-300 border border-rose-500/60 rounded">
            DROP BRINK (#100)
          </span>
        </div>
      )}

      {/* Luxury Dark Grey Glass Hover Card Overlay (client-only; see mounted gate above) */}
      {mounted && (
      <div className="absolute inset-0 bg-[#141519]/95 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2 sm:p-2.5 z-20 border border-white/[0.2]">
        <div className="flex items-start justify-between gap-1">
          <div>
            <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider block">
              Rank #{slot.rank}
            </span>
            <h4 className="text-[11px] sm:text-xs font-semibold text-white truncate max-w-[120px]">
              {slot.title}
            </h4>
          </div>
          <span className="text-[10px] sm:text-xs font-mono font-bold text-neutral-200">
            ${slot.amountPaid.toLocaleString()}
          </span>
        </div>

        <div className="text-[10px] text-zinc-400 truncate">
          {slot.bidderName ? `By ${slot.bidderName}` : 'Anonymous'}
        </div>

        {slot.linkUrl && (
          <div className="pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[9px] sm:text-[10px] text-zinc-300 font-medium">
            <span className="truncate max-w-[90px] text-zinc-400">
              {slot.linkUrl.replace(/^https?:\/\//, '')}
            </span>
            <ExternalLink className="w-2.5 h-2.5 text-zinc-300 shrink-0" />
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export const GridCell = React.memo(GridCellComponent);
