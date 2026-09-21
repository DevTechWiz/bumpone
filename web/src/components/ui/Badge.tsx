import React, { ReactNode } from 'react';
import { Crown, Sparkles, Shield, AlertTriangle } from 'lucide-react';

export type RankTier = 'king' | 'elite' | 'lord' | 'contender' | 'bubble';
export type BadgeVariant = 'rank' | 'status' | 'pill' | 'metric';

export interface BadgeProps {
  variant?: BadgeVariant;
  rank?: number;
  label?: string;
  icon?: ReactNode;
  color?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'platinum';
  className?: string;
  children?: ReactNode;
}

export const getRankTier = (rank: number): RankTier => {
  if (rank === 1) return 'king';
  if (rank >= 2 && rank <= 13) return 'elite';
  if (rank >= 14 && rank <= 54) return 'lord';
  if (rank === 100) return 'bubble';
  return 'contender';
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'status',
  rank,
  label,
  icon,
  color = 'default',
  className = '',
  children,
}) => {
  // Rank Badges in luxury cosmic style
  if (variant === 'rank' && typeof rank === 'number') {
    const tier = getRankTier(rank);

    if (tier === 'king') {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-amber-500/15 text-amber-200 border border-amber-400/40 shadow-sm shadow-amber-500/15 backdrop-blur-md select-none ${className}`}
        >
          <Crown className="w-3 h-3 text-amber-400 fill-amber-400/80" />
          <span>#1 KING</span>
        </span>
      );
    }

    if (tier === 'elite') {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-tight bg-white/[0.08] text-slate-200 border border-white/[0.2] backdrop-blur-md select-none ${className}`}
        >
          <Sparkles className="w-2.5 h-2.5 text-slate-300" />
          <span>#{rank} ELITE</span>
        </span>
      );
    }

    if (tier === 'lord') {
      return (
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium tracking-tight bg-zinc-700/30 text-zinc-200 border border-zinc-500/30 backdrop-blur-md select-none ${className}`}
        >
          <Shield className="w-2.5 h-2.5 text-zinc-300" />
          <span>#{rank}</span>
        </span>
      );
    }

    if (tier === 'bubble') {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-tight bg-rose-950/40 text-rose-300 border border-rose-500/40 animate-pulse backdrop-blur-md select-none ${className}`}
        >
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          <span>#100 BRINK</span>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium bg-black/60 text-zinc-400 border border-white/[0.08] backdrop-blur-md select-none ${className}`}
      >
        <span>#{rank}</span>
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
