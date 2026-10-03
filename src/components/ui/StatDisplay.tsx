import React, { ReactNode } from 'react';

export interface StatDisplayProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral' | 'urgent';
  trendText?: string;
  variant?: 'card' | 'tile' | 'metric';
  valueClassName?: string;
  className?: string;
}

export const StatDisplay: React.FC<StatDisplayProps> = ({
  label,
  value,
  subValue,
  icon,
  trend = 'neutral',
  trendText,
  variant = 'card',
  valueClassName = '',
  className = '',
}) => {
  const trendColor = {
    up: 'text-slate-300 bg-white/[0.06] border-white/[0.12]',
    down: 'text-slate-400 bg-white/[0.04] border-white/[0.08]',
    neutral: 'text-slate-300 bg-white/[0.06] border-white/[0.1]',
    urgent: 'text-rose-300 bg-rose-950/40 border-rose-500/30 animate-pulse',
  }[trend];

  if (variant === 'metric') {
    return (
      <div
        className={`rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 sm:p-3.5 text-center transition-all ${className}`}
      >
        <div className={`font-mono text-xl sm:text-2xl font-bold ${valueClassName || 'text-white'}`}>
          {value}
        </div>
        <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-center gap-1">
          {icon}
          <span>{label}</span>
        </div>
      </div>
    );
  }

  if (variant === 'tile') {
    return (
      <div
        className={`bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 flex flex-col justify-between transition-all ${className}`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {icon}
          <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
            {label}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-sm sm:text-base font-bold font-mono ${valueClassName || 'text-white'}`}>
            {value}
          </span>
          {subValue && (
            <span className="text-[10px] text-slate-400 font-medium">
              {subValue}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-[#18191d]/85 backdrop-blur-md border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:border-white/[0.18] ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <div className="p-2 rounded-xl bg-white/[0.05] text-slate-300 border border-white/[0.06]">
            {icon}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl sm:text-3xl font-bold tracking-tight font-mono ${valueClassName || 'text-white'}`}>
            {value}
          </span>
          {subValue && (
            <span className="text-xs text-slate-400 font-medium">
              {subValue}
            </span>
          )}
        </div>

        {trendText && (
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono border ${trendColor}`}
            >
              {trendText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
