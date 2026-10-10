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
          className={`inline-flex items-center justify-center gap-1 px-[clamp(4px,2cqi,10px)] py-px sm:py-0.5 rounded-full text-[clamp(8px,3.5cqi,14px)] font-black tracking-wide bg-amber-500/20 text-amber-200 border border-amber-400/60 shadow-md shadow-amber-500/25 backdrop-blur-md select-none ${className}`}
        >
          <Crown className="w-[clamp(9px,3.8cqi,16px)] h-[clamp(9px,3.8cqi,16px)] text-amber-400 fill-amber-400/80 shrink-0" />
          <span>#1</span>
          <span className={compact ? 'hidden' : 'hidden @[120px]:inline'}> KING</span>
        </span>
      );
    }

    if (tier === 'champion') {
      return (
        <span
          className={`inline-flex items-center justify-center gap-0.5 px-[clamp(2.5px,2cqi,7px)] py-px rounded-full font-bold tracking-tight bg-purple-500/20 text-purple-200 border border-purple-400/60 shadow-sm shadow-purple-500/25 backdrop-blur-md select-none text-[clamp(7px,3.8cqi,12px)] ${className}`}
        >
          <span>💎 #{rank}</span>
          <span className={compact ? 'hidden' : 'hidden @[110px]:inline'}> CHAMPION</span>
        </span>
      );
    }

    if (tier === 'elite') {
      return (
        <span
          className={`inline-flex items-center justify-center gap-0.5 px-[clamp(2px,1.8cqi,5px)] py-px rounded-full font-semibold tracking-tight bg-sky-500/15 text-sky-200 border border-sky-400/40 backdrop-blur-md select-none text-[clamp(6px,4.5cqi,10px)] ${className}`}
        >
          <Sparkles className="w-[clamp(7px,4cqi,11px)] h-[clamp(7px,4cqi,11px)] text-sky-300 shrink-0" />
          <span>#{rank}</span>
          <span className={compact ? 'hidden' : 'hidden @[100px]:inline'}> ELITE</span>
        </span>
      );
    }

    if (tier === 'vanguard') {
      return (
        <span
          className={`inline-flex items-center justify-center gap-0.5 px-[clamp(1.5px,1.5cqi,4px)] py-px rounded-full font-semibold tracking-tight bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 backdrop-blur-md select-none text-[clamp(5px,5cqi,9px)] ${className}`}
        >
          <Shield className="w-[clamp(6px,4cqi,10px)] h-[clamp(6px,4cqi,10px)] text-emerald-300 shrink-0" />
          <span>#{rank}</span>
          <span className={compact ? 'hidden' : 'hidden @[90px]:inline'}> VANGUARD</span>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center justify-center gap-0.5 px-[clamp(1px,1.5cqi,3.5px)] py-px rounded font-mono font-medium tracking-tight bg-black/75 text-zinc-400 border border-white/[0.08] backdrop-blur-md select-none text-[clamp(4.5px,6.5cqi,8px)] ${className}`}
      >
        <span>#{rank}</span>
        <span className={compact ? 'hidden' : 'hidden @[80px]:inline'}> CONTENDER</span>
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
