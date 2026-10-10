import React, { useState, useMemo } from 'react';
import { ExternalLink, Crown, Sparkles, Shield, Zap } from 'lucide-react';
import { Badge, getRankTier } from './Badge';
import { formatNumber } from '../../lib/board';

export interface GridSlotData {
  id: string;
  rank: number;
  imageUrl: string;
  title: string;
  linkUrl?: string;
  activeValue: number;
  bidderName?: string;
  timestamp?: string;
  isNew?: boolean;
  category?: string;
  categoryRank?: number;
  globalRank?: number;
  reactions?: Record<string, number>;
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
  const _isFeatured = slot.rank <= 5;

  const optimizedSrc = useMemo(() => {
    if (!slot.imageUrl) return "";
    if (slot.imageUrl.includes("images.unsplash.com") && slot.imageUrl.includes("w=")) {
      return slot.imageUrl.replace(/w=\d+/, isHero ? "w=400" : "w=200");
    }
    return slot.imageUrl;
  }, [slot.imageUrl, isHero]);

  const r = slot.reactions;
  const reactionTotal = (r?.fire || 0) + (r?.eyes || 0) + (r?.heart || 0) + (r?.laugh || 0);

  const isOpenSlot = slot.id.startsWith('open-slot-') || slot.activeValue === 0;

  return (
    <div
      style={{
        ...style,
        contain: isHero ? 'layout style' : 'layout style paint',
        contentVisibility: isHero || slot.rank <= 25 ? 'visible' : 'auto',
        containIntrinsicSize:
          typeof style?.width === 'number' && typeof style?.height === 'number'
            ? `${style.width}px ${style.height}px`
            : undefined,
        // docs/13:60-71 wall rearrange — position changes (rank shifts) move
        // over 700ms (600–1200ms target); hover/scale stays snappy at 180ms.
        transition:
          'transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease, ' +
          'left 700ms cubic-bezier(0.22, 1, 0.36, 1), top 700ms cubic-bezier(0.22, 1, 0.36, 1), ' +
          'width 700ms cubic-bezier(0.22, 1, 0.36, 1), height 700ms cubic-bezier(0.22, 1, 0.36, 1)',
        transform: isHighlighted || isHoveredLocal ? 'scale(1.025)' : 'scale(1)',
        opacity: isDimmed ? 0.22 : 1,
        zIndex: isHighlighted || isHoveredLocal ? 45 : slot.isNew ? 40 : tier === 'king' ? 25 : tier === 'champion' ? 20 : 1,
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`@container group relative overflow-hidden rounded bg-[#18191d]/95 select-none ${
        isInteractive ? 'cursor-pointer hover:z-30 hover:shadow-2xl hover:shadow-black/80' : ''
      } ${
        isHighlighted ? 'ring-2 ring-white shadow-2xl shadow-white/30' : ''
      } ${
        isDimmed ? 'filter grayscale-[0.4] pointer-events-auto' : ''
      } ${
        // docs/13:17/68/106 — new tile enters with a bounce/highlight pop.
        slot.isNew ? 'animate-in fade-in zoom-in-95 duration-500' : ''
      } w-full h-full box-border ${activeBorder} ${className}`}
    >
      {/* Background Image / Fallback */}
      {!imageError && slot.imageUrl ? (
        <div className="absolute inset-0 w-full h-full overflow-hidden bg-[#0a0a0c]">
          {/* Blurred backdrop image to seamlessly fill letterbox/pillarbox space on top featured slots */}
          {slot.rank <= 5 && (
            <img
              src={optimizedSrc}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover filter blur-md opacity-45 scale-125 pointer-events-none transform-gpu"
              referrerPolicy="no-referrer"
            />
          )}
          {/* Foreground fit-mode uncropped crisp image */}
          <img
            src={optimizedSrc}
            alt={slot.title || `Slot #${slot.rank}`}
            onError={() => setImageError(true)}
            loading={isHero ? "eager" : "lazy"}
            fetchPriority={isHero ? "high" : "low"}
            decoding="async"
            className="relative z-[1] w-full h-full object-contain transition-transform duration-300 group-hover:scale-105 p-0.5"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#222328] to-[#121316] p-0.5 text-center ${isOpenSlot ? 'hover:bg-[#282930] transition-colors' : ''}`}>
          {tier === 'king' && <Crown className="w-[clamp(16px,10cqi,30px)] h-[clamp(16px,10cqi,30px)] text-amber-400/90 group-hover:text-amber-300 transition-colors mb-0.5" />}
          {tier === 'champion' && <Sparkles className="w-[clamp(12px,8cqi,22px)] h-[clamp(12px,8cqi,22px)] text-purple-400/90 group-hover:text-purple-300 transition-colors mb-0.5" />}
          {tier === 'elite' && <Sparkles className="w-[clamp(9px,7cqi,16px)] h-[clamp(9px,7cqi,16px)] text-sky-300/80 group-hover:text-sky-300 transition-colors mb-0.5" />}
          {tier === 'vanguard' && <Shield className="w-[clamp(8px,6cqi,14px)] h-[clamp(8px,6cqi,14px)] text-emerald-300/80 group-hover:text-emerald-300 transition-colors mb-0.5" />}
          {tier === 'contender' && (
            <span className="text-[clamp(9px,14cqi,18px)] font-light text-zinc-500/80 group-hover:text-amber-300 group-hover:scale-125 transition-transform leading-none">
              +
            </span>
          )}
        </div>
      )}

      {/* Subtle Dark Vignette gradient on bottom/top for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

      {/* Floating Badges - Fluid positioning and sizing across all card tiers */}
      <div className="absolute top-[clamp(1px,1.2cqi,4px)] left-[clamp(1px,1.2cqi,4px)] flex items-center gap-0.5 z-10 pointer-events-none max-w-[calc(100%-20px)] overflow-hidden">
        <Badge variant="rank" rank={slot.rank} compact={tier !== 'king'} />
        {slot.category && (tier === 'king' || tier === 'champion') && (
          <span className="hidden @[140px]:inline-flex items-center px-1 py-px rounded text-[clamp(6px,2.5cqi,8px)] font-medium leading-tight bg-white/10 border border-white/[0.12] text-neutral-300 backdrop-blur-sm truncate">
            {slot.category}
          </span>
        )}
        {slot.isNew && tier !== 'contender' && (
          <span className="hidden @[130px]:inline-flex items-center gap-0.5 px-1 py-0.2 text-[clamp(5.5px,2.5cqi,8px)] font-mono font-bold uppercase bg-white text-slate-950 rounded shadow-sm animate-pulse">
            <Zap className="w-2 h-2 fill-current" /> BUMPED
          </span>
        )}
      </div>

      {/* Top right: Price Badge dynamically sized per tier with fluid container clamp */}
      <div className="absolute top-[clamp(1px,1.2cqi,4px)] right-[clamp(1px,1.2cqi,4px)] z-10 pointer-events-none">
        <span
          className={`inline-flex items-center rounded font-mono bg-black/85 shadow-sm leading-none ${
            tier === 'king'
              ? 'px-[clamp(4px,2cqi,10px)] py-[clamp(1px,0.6cqi,4px)] text-[clamp(8px,3.5cqi,14px)] font-black border border-amber-400/50 text-amber-200'
              : tier === 'champion'
              ? 'px-[clamp(3px,1.8cqi,8px)] py-[clamp(1px,0.5cqi,3px)] text-[clamp(7px,3.8cqi,12px)] font-bold border border-purple-400/50 text-purple-200'
              : tier === 'elite'
              ? 'px-[clamp(2px,1.5cqi,6px)] py-px text-[clamp(6px,4.5cqi,10px)] font-bold border border-sky-400/30 text-sky-100'
              : tier === 'vanguard'
              ? 'px-[clamp(1.5px,1.5cqi,5px)] py-px text-[clamp(5px,5cqi,9px)] font-semibold border border-emerald-400/20 text-emerald-100'
              : 'px-[clamp(1px,1.5cqi,3.5px)] py-px text-[clamp(4.5px,6.5cqi,8px)] font-medium border border-white/[0.08] text-zinc-300'
          }`}
        >
          ${isOpenSlot ? 10 : (slot.activeValue >= 1000 ? `${(slot.activeValue / 1000).toFixed(1)}k` : slot.activeValue)}
        </span>
      </div>

      {/* King (#1 in Center) Prominent Banner */}
      {tier === 'king' && (
        <div className="absolute bottom-[clamp(2px,1cqi,6px)] left-[clamp(2px,1cqi,6px)] right-[clamp(2px,1cqi,6px)] z-10 pointer-events-none flex flex-col gap-0.5">
          <div className="bg-black/85 backdrop-blur-sm border border-amber-400/40 rounded-md sm:rounded-lg p-[clamp(3px,1.8cqi,8px)]">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-[clamp(8px,3.2cqi,14px)] font-bold uppercase tracking-wider text-amber-300 truncate">
                <Crown className="w-[clamp(9px,3.2cqi,16px)] h-[clamp(9px,3.2cqi,16px)] text-amber-400 shrink-0" /> CENTER KING #1
              </span>
              <span className="text-[clamp(8.5px,3.5cqi,14px)] font-mono font-bold text-amber-200 shrink-0">
                ${formatNumber(isOpenSlot ? 10 : slot.activeValue)}
              </span>
            </div>
            <h3 className="text-[clamp(9px,3.8cqi,16px)] font-extrabold text-white truncate drop-shadow-sm">
              {isOpenSlot ? '👑 Claim King #1 Crown' : slot.title}
            </h3>
            {slot.bidderName && (
              <p className="text-[clamp(7.5px,2.5cqi,12px)] text-slate-300 truncate">
                {isOpenSlot ? 'Available for $10' : `by ${slot.bidderName}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Champion (#2..#5) Flanking Banners */}
      {tier === 'champion' && (
        <div className="absolute bottom-[clamp(2px,1cqi,6px)] left-[clamp(2px,1cqi,6px)] right-[clamp(2px,1cqi,6px)] z-10 pointer-events-none flex flex-col gap-0.5">
          <div className="bg-black/85 backdrop-blur-sm border border-purple-400/40 rounded-md sm:rounded-lg p-[clamp(2.5px,2cqi,6px)]">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[clamp(7.5px,3.5cqi,11px)] font-bold uppercase tracking-wider text-purple-300 truncate">
                💎 #{slot.rank} CHAMPION
              </span>
              <span className="text-[clamp(7.5px,3.8cqi,12px)] font-mono font-bold text-purple-200 shrink-0">
                ${formatNumber(isOpenSlot ? 10 : slot.activeValue)}
              </span>
            </div>
            <h3 className="text-[clamp(8px,4.2cqi,14px)] font-bold text-white truncate drop-shadow-sm">
              {isOpenSlot ? `Claim Rank #${slot.rank}` : slot.title}
            </h3>
          </div>
        </div>
      )}

      {/* Elite (#6..#15) Title strip */}
      {tier === 'elite' && (
        <div className="absolute bottom-[clamp(2px,1cqi,4px)] left-[clamp(2px,1cqi,4px)] right-[clamp(2px,1cqi,4px)] z-10 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-sm rounded px-[clamp(2px,1.5cqi,6px)] py-0.5 border border-sky-400/30 truncate">
            <p className="text-[clamp(6px,4.5cqi,10px)] font-medium text-white truncate leading-tight">
              {isOpenSlot ? `Claim #${slot.rank} ($10)` : slot.title}
            </p>
          </div>
        </div>
      )}

      {/* Luxury Dark Glass Hover Card Overlay - Conditionally mounted only when hovered to save 1,500 DOM nodes and 100 GPU filter layers */}
      {isClient && isHoveredLocal && (
        <div className="absolute inset-0 bg-[#141519]/95 backdrop-blur-sm flex flex-col justify-between p-[clamp(3px,3cqi,10px)] z-20 border border-white/[0.25] animate-in fade-in duration-150">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <span className="text-[clamp(6px,3.5cqi,9px)] font-mono text-zinc-400 uppercase tracking-wider block truncate">
                {isOpenSlot
                  ? `AVAILABLE · RANK #${slot.rank}`
                  : slot.globalRank != null
                    ? `CAT #${slot.categoryRank ?? slot.rank} · GLOBAL #${slot.globalRank}`
                    : `Rank #${slot.rank}${slot.categoryRank ? ` · CAT #${slot.categoryRank}` : ''}`}
              </span>
              <h4 className="text-[clamp(7.5px,4.5cqi,12px)] font-semibold text-white truncate">
                {isOpenSlot ? (slot.rank === 1 ? '👑 Founding King' : `Open Slot #${slot.rank}`) : slot.title}
              </h4>
            </div>
            <span className="text-[clamp(7px,4cqi,12px)] font-mono font-bold text-neutral-200 shrink-0">
              ${formatNumber(isOpenSlot ? 10 : slot.activeValue)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1 text-[clamp(6.5px,3.8cqi,10px)] text-zinc-400 truncate">
            <span className="truncate">
              {isOpenSlot ? '⚡ Click to claim for $10' : (slot.category ? `${slot.category} · ` : '') + (slot.bidderName ? `By ${slot.bidderName}` : 'Anonymous')}
            </span>
          </div>

          {reactionTotal > 0 && (
            <div className="flex items-center gap-1.5 text-[clamp(6px,3.5cqi,10px)] font-mono text-zinc-300">
              <span>🔥 {r?.fire || 0}</span>
              <span>👀 {r?.eyes || 0}</span>
              <span>❤️ {r?.heart || 0}</span>
              <span>😂 {r?.laugh || 0}</span>
            </div>
          )}

          {slot.linkUrl && (
            <div className="pt-1 border-t border-white/[0.08] flex items-center justify-between text-[clamp(6px,3.5cqi,10px)] text-zinc-300 font-medium">
              <span className="truncate text-zinc-400">
                {slot.linkUrl.replace(/^https?:\/\//, '')}
              </span>
              <ExternalLink className="w-[clamp(8px,3cqi,12px)] h-[clamp(8px,3cqi,12px)] text-zinc-300 shrink-0" />
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
    prev.slot.activeValue === next.slot.activeValue &&
    prev.slot.title === next.slot.title &&
    prev.slot.imageUrl === next.slot.imageUrl &&
    prev.slot.isNew === next.slot.isNew &&
    prev.slot.category === next.slot.category &&
    prev.slot.categoryRank === next.slot.categoryRank &&
    prev.slot.globalRank === next.slot.globalRank &&
    prev.slot.reactions === next.slot.reactions &&
    prev.style?.left === next.style?.left &&
    prev.style?.top === next.style?.top &&
    prev.style?.width === next.style?.width &&
    prev.style?.height === next.style?.height
  );
});
