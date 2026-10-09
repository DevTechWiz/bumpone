import React, { ReactNode } from 'react';
import { Crown, Sparkles, Shield, Target } from 'lucide-react';
import { getRankTier, type RankTier } from '@/lib/slotTypes';

export type { RankTier };
export { getRankTier };
export type BadgeVariant = 'rank' | 'status' | 'pill' | 'metric';

export interface BadgeProps {
  variant?: BadgeVariant;
  rank?: number;
  label?: string;
  icon?: ReactNode;
  color?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'platinum';
  className?: string;
  children?: ReactNode;
  compact?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'status',
  rank,
  label,
  icon,
  color = 'default',
  className = '',
  children,
  compact = false,
}) => {
  // Rank Badges in luxury cosmic style with dynamic tier-proportional typography
  if (variant === 'rank' && typeof rank === 'number') {
    const tier = getRankTier(rank);

    if (tier === 'king') {
      return (
        <span
          className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm font-black tracking-wide bg-amber-500/20 text-amber-200 border border-amber-400/60 shadow-md shadow-amber-500/25 backdrop-blur-md select-none ${className}`}
        >
          <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 fill-amber-400/80" />
          <span>{compact ? '#1' : '#1 KING'}</span>
        </span>
      );
    }

    if (tier === 'champion') {
      return (
        <span
          className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 ${
            compact
              ? 'px-2 py-0.5 text-[11px] sm:text-xs'
              : 'px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm'
          } rounded-full font-bold tracking-tight bg-purple-500/20 text-purple-200 border border-purple-400/60 shadow-sm shadow-purple-500/25 backdrop-blur-md select-none ${className}`}
        >
          <span>💎 #{rank}{compact ? '' : ' CHAMPION'}</span>
        </span>
      );
    }

    if (tier === 'elite') {
      return (
        <span
          className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 ${
            compact
              ? 'px-1.5 py-0.5 text-[10px] sm:text-[10.5px]'
              : 'px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm'
          } rounded-full font-semibold tracking-tight bg-sky-500/15 text-sky-200 border border-sky-400/40 backdrop-blur-md select-none ${className}`}
        >
          <Sparkles className={`${compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} text-sky-300`} />
          <span>#{rank}{compact ? '' : ' ELITE'}</span>
        </span>
      );
    }

    if (tier === 'vanguard') {
      return (
        <span
          className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 ${
            compact
              ? 'px-1.5 py-0.5 text-[8.5px] sm:text-[9.5px]'
              : 'px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm font-semibold'
          } rounded-full tracking-tight bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 backdrop-blur-md select-none ${className}`}
        >
          <Shield className={`${compact ? 'w-2 h-2 sm:w-2.5 sm:h-2.5' : 'w-3.5 h-3.5'} text-emerald-300`} />
          <span>#{rank}{compact ? '' : ' VANGUARD'}</span>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 ${
          compact
            ? 'px-1 py-0.2 sm:px-1.5 sm:py-0.5 text-[7px] sm:text-[8px] bg-black/70 text-zinc-400 border-white/[0.08]'
            : 'px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm font-mono font-bold bg-zinc-800/90 text-zinc-300 border border-zinc-600/60 shadow-sm shadow-black/40'
        } rounded-md border backdrop-blur-md select-none ${className}`}
      >
        {!compact && <Target className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
        <span>#{rank}{compact ? '' : ' CONTENDER'}</span>
      </span>
    );
  }

  const colorStyles: Record<string, string> = {
    default: 'bg-white/[0.05] text-neutral-300 border-white/[0.08]',
    success: 'bg-emerald-950/30 text-emerald-300 border-emerald-500/25',
    warning: 'bg-amber-950/30 text-amber-300 border-amber-500/25',
    danger: 'bg-rose-950/40 text-rose-300 border-rose-500/30',
    info: 'bg-zinc-800/90 text-zinc-200 border-zinc-600/40',
    gold: 'bg-amber-950/30 text-amber-200 border-amber-500/30',
    platinum: 'bg-white/[0.08] text-white border-white/[0.2]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border backdrop-blur-sm select-none whitespace-nowrap ${colorStyles[color]} ${className}`}
    >
      {icon}
      <span>{label || children}</span>
    </span>
  );
};
