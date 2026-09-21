import React, { ReactNode } from 'react';

export interface StatDisplayProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral' | 'urgent';
  trendText?: string;
  className?: string;
}

export const StatDisplay: React.FC<StatDisplayProps> = ({
  label,
  value,
  subValue,
  icon,
  trend = 'neutral',
  trendText,
  className = '',
}) => {
  const trendColor = {
    up: 'text-slate-300 bg-white/[0.06] border-white/[0.12]',
    down: 'text-slate-400 bg-white/[0.04] border-white/[0.08]',
    neutral: 'text-slate-300 bg-white/[0.06] border-white/[0.1]',
    urgent: 'text-rose-300 bg-rose-950/40 border-rose-500/30 animate-pulse',
  }[trend];

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
          <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono">
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
