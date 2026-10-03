import React, { useState, useEffect, useMemo } from 'react';
import { ExternalLink, AlertTriangle, Crown, Sparkles, Shield, Zap } from 'lucide-react';
import { Badge, getRankTier } from './Badge';
import { formatNumber } from '../../lib/board';

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
  imageZoom?: number;
  imagePosX?: number;
  imagePosY?: number;
  imageFit?: "cover" | "contain";
  imageRotation?: number;
}

export interface GridCellProps {
  slot: GridSlotData;
  onClick?: (slot: GridSlotData) => void;
  onHover?: (slot: GridSlotData | null) => void;
  className?: string;
  isInteractive?: boolean;
  style?: React.CSSProperties;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  isClient?: boolean;
}

const GridCellComponent: React.FC<GridCellProps> = ({
  slot,
  onClick,
  onHover,
  className = '',
  isInteractive = true,
  style,
  isHighlighted = false,
  isDimmed = false,
  isClient = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isHoveredLocal, setIsHoveredLocal] = useState(false);
  const tier = getRankTier(slot.rank);

  // Refined borders & glowing accents per batch
  const borderClassMap: Record<string, string> = {
    king: 'border-2 border-amber-400/90 shadow-2xl shadow-amber-500/30 ring-2 ring-amber-400/40',
    champion: 'border-2 border-purple-400/90 shadow-xl shadow-purple-500/30 ring-1 ring-purple-400/40',
    elite: 'border-[1.5px] border-sky-400/70 shadow-lg shadow-sky-500/25',
    vanguard: 'border border-emerald-400/40 shadow-sm shadow-emerald-500/15',
    lord: 'border border-zinc-500/35 shadow-md shadow-black/40 hover:border-zinc-400/60',
    contender: 'border border-white/[0.08] hover:border-white/[0.25]',
  };
  const activeBorder = borderClassMap[tier] || borderClassMap.contender;

  const handleClick = (e: React.MouseEvent) => {
    if (!isInteractive) return;
    if (onClick) {
      onClick(slot);
    } else if (slot.linkUrl) {
      e.stopPropagation();
      window.open(slot.linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleMouseEnter = () => {
    setIsHoveredLocal(true);
    onHover?.(slot);
  };

  const handleMouseLeave = () => {
    setIsHoveredLocal(false);
    onHover?.(null);
  };

  const isHero = slot.rank === 1;
  const isFeatured = slot.rank <= 5;

  const optimizedSrc = useMemo(() => {
    if (!slot.imageUrl) return "";
    if (slot.imageUrl.includes("images.unsplash.com") && slot.imageUrl.includes("w=")) {
      return slot.imageUrl.replace(/w=\d+/, isHero ? "w=400" : "w=200");
    }
    return slot.imageUrl;
  }, [slot.imageUrl, isHero]);

  return (
    <div
      style={{
        ...style,
        contain: isHero ? 'layout style' : 'layout style paint',
        contentVisibility: isHero || slot.rank <= 25 ? 'visible' : 'auto',
        containIntrinsicSize: style?.width && style?.height ? `${style.width}px ${style.height}px` : undefined,
        transition: 'transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease',
        transform: isHighlighted || isHoveredLocal ? 'scale(1.025)' : 'scale(1)',
        opacity: isDimmed ? 0.22 : 1,
        zIndex: isHighlighted || isHoveredLocal ? 45 : slot.isNew ? 40 : tier === 'king' ? 25 : tier === 'champion' ? 20 : 1,
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`group relative overflow-hidden rounded bg-[#18191d]/95 select-none ${
        isInteractive ? 'cursor-pointer hover:z-30 hover:shadow-2xl hover:shadow-black/80' : ''
      } ${
        isHighlighted ? 'ring-2 ring-white shadow-2xl shadow-white/30' : ''
      } ${
        isDimmed ? 'filter grayscale-[0.4] pointer-events-auto' : ''
      } w-full h-full box-border ${activeBorder} ${className}`}
    >
      {/* Background Image / Fallback */}
      {!imageError && slot.imageUrl ? (
        <img
          src={optimizedSrc}
          alt={slot.title || `Slot #${slot.rank}`}
          onError={() => setImageError(true)}
          loading={isHero ? "eager" : "lazy"}
          fetchPriority={isHero ? "high" : "low"}
          decoding="async"
          className={`w-full h-full transition-transform duration-300 group-hover:scale-105 ${
            slot.imageFit === "contain" ? "object-contain bg-black/90" : "object-cover"
          }`}
          style={{
            objectPosition: `${slot.imagePosX ?? 50}% ${slot.imagePosY ?? 50}%`,
            transform: `${slot.imageZoom && slot.imageZoom > 1 ? `scale(${slot.imageZoom})` : ""} ${
              slot.imageRotation ? `rotate(${slot.imageRotation}deg)` : ""
            }`.trim() || undefined,
            transformOrigin: `${slot.imagePosX ?? 50}% ${slot.imagePosY ?? 50}%`,
          }}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#222328] to-[#121316] p-1.5 text-center">
          {tier === 'king' && <Crown className="w-8 h-8 text-amber-400 mb-1" />}
          {tier === 'champion' && <Sparkles className="w-6 h-6 text-purple-400 mb-1" />}
          {tier === 'elite' && <Sparkles className="w-4 h-4 text-sky-300 mb-0.5" />}
          {tier === 'vanguard' && <Shield className="w-3.5 h-3.5 text-emerald-300 mb-0.5" />}
          <span className="text-[11px] font-mono text-zinc-400">
            #{slot.rank}
          </span>
          {tier !== 'contender' && (
            <span className="text-[10px] font-mono text-zinc-200 font-semibold">
              ${formatNumber(slot.amountPaid)}
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
        <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-bold bg-black/80 text-slate-100 border border-white/[0.14] shadow-sm">
          ${slot.amountPaid >= 1000 ? `${(slot.amountPaid / 1000).toFixed(1)}k` : slot.amountPaid}
        </span>
      </div>

      {/* King (#1 in Center) Prominent Banner */}
      {tier === 'king' && (
        <div className="absolute bottom-1.5 left-1.5 right-1.5 z-10 pointer-events-none flex flex-col gap-0.5">
          <div className="bg-black/85 backdrop-blur-sm border border-amber-400/40 rounded-lg p-1.5 sm:p-2">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                <Crown className="w-3 h-3 text-amber-400" /> CENTER KING #1
              </span>
              <span className="text-xs font-mono font-bold text-amber-200">
                ${formatNumber(slot.amountPaid)}
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

      {/* Champion (#2..#5) Flanking Banners */}
      {tier === 'champion' && (
        <div className="absolute bottom-1.5 left-1.5 right-1.5 z-10 pointer-events-none flex flex-col gap-0.5">
          <div className="bg-black/85 backdrop-blur-sm border border-purple-400/40 rounded-lg p-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-purple-300">
                💎 #{slot.rank} CHAMPION
              </span>
              <span className="text-[11px] font-mono font-bold text-purple-200">
                ${formatNumber(slot.amountPaid)}
              </span>
            </div>
            <h3 className="text-xs font-bold text-white truncate drop-shadow-sm">
              {slot.title}
            </h3>
          </div>
        </div>
      )}

      {/* Elite (#6..#15) Title strip */}
      {tier === 'elite' && (
        <div className="absolute bottom-1 left-1 right-1 z-10 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-sm rounded px-1.5 py-0.5 border border-sky-400/30 truncate">
            <p className="text-[10px] font-medium text-white truncate">
              {slot.title}
            </p>
          </div>
        </div>
      )}

      {/* Luxury Dark Glass Hover Card Overlay - Conditionally mounted only when hovered to save 1,500 DOM nodes and 100 GPU filter layers */}
      {isClient && isHoveredLocal && (
        <div className="absolute inset-0 bg-[#141519]/95 backdrop-blur-sm flex flex-col justify-between p-2 sm:p-2.5 z-20 border border-white/[0.25] animate-in fade-in duration-150">
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
              ${formatNumber(slot.amountPaid)}
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

export const GridCell = React.memo(GridCellComponent, (prev, next) => {
  return (
    prev.isHighlighted === next.isHighlighted &&
    prev.isDimmed === next.isDimmed &&
    prev.isClient === next.isClient &&
    prev.isInteractive === next.isInteractive &&
    prev.className === next.className &&
    prev.slot.id === next.slot.id &&
    prev.slot.rank === next.slot.rank &&
    prev.slot.amountPaid === next.slot.amountPaid &&
    prev.slot.title === next.slot.title &&
    prev.slot.imageUrl === next.slot.imageUrl &&
    prev.slot.isNew === next.slot.isNew &&
    prev.style?.left === next.style?.left &&
    prev.style?.top === next.style?.top &&
    prev.style?.width === next.style?.width &&
    prev.style?.height === next.style?.height
  );
});
