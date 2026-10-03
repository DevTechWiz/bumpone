'use client';

import React from 'react';
import type { AvatarSize, AvatarShape } from './Avatar';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rounded' | 'rounded-full' | 'rounded-lg' | 'rounded-xl' | 'rounded-2xl' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animated?: boolean;
}

const variantStyles: Record<NonNullable<SkeletonProps['variant']>, string> = {
  text: 'rounded h-4 my-0.5',
  circular: 'rounded-full',
  'rounded-full': 'rounded-full',
  rounded: 'rounded-lg',
  'rounded-lg': 'rounded-lg',
  'rounded-xl': 'rounded-xl',
  'rounded-2xl': 'rounded-2xl',
  rectangular: 'rounded-none',
};

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rounded',
  width,
  height,
  animated = true,
  className = '',
  style,
  ...rest
}) => {
  const inlineStyles: React.CSSProperties = {
    ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
    ...style,
  };

  return (
    <div
      aria-hidden="true"
      className={`bg-white/[0.05] border border-white/[0.05] select-none ${
        animated ? 'shimmer-effect' : ''
      } ${variantStyles[variant] || 'rounded-lg'} ${className}`}
      style={inlineStyles}
      {...rest}
    />
  );
};

export interface SkeletonTextProps {
  lines?: number;
  widths?: (string | number)[];
  className?: string;
  lineClassName?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 2,
  widths = ['100%', '75%', '60%'],
  className = 'space-y-2',
  lineClassName = 'h-3.5',
}) => {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => {
        const w = widths[i % widths.length];
        return (
          <Skeleton
            key={i}
            variant="text"
            width={w}
            className={`${lineClassName} ${i === lines - 1 && lines > 1 ? 'opacity-70' : ''}`}
          />
        );
      })}
    </div>
  );
};

const avatarSizeMap: Record<AvatarSize, string> = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16 sm:w-20 sm:h-20',
  '2xl': 'w-20 h-20 sm:w-24 sm:h-24',
};

const avatarShapeMap: Record<AvatarShape, string> = {
  circle: 'rounded-full',
  'rounded-lg': 'rounded-lg',
  'rounded-xl': 'rounded-xl',
  'rounded-2xl': 'rounded-2xl',
};

export interface SkeletonAvatarProps {
  size?: AvatarSize;
  shape?: AvatarShape;
  className?: string;
}

export const SkeletonAvatar: React.FC<SkeletonAvatarProps> = ({
  size = 'md',
  shape = 'circle',
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`bg-white/[0.06] border border-white/[0.08] shimmer-effect shrink-0 ${
        avatarSizeMap[size] || avatarSizeMap.md
      } ${avatarShapeMap[shape] || avatarShapeMap.circle} ${className}`}
    />
  );
};

export interface SkeletonBadgeProps {
  className?: string;
  width?: string | number;
}

export const SkeletonBadge: React.FC<SkeletonBadgeProps> = ({
  className = '',
  width = 64,
}) => {
  return (
    <Skeleton
      variant="circular"
      height={20}
      width={width}
      className={`rounded-full bg-white/[0.05] border-white/[0.06] ${className}`}
    />
  );
};

export interface SkeletonStatProps {
  variant?: 'metric' | 'tile';
  className?: string;
}

export const SkeletonStat: React.FC<SkeletonStatProps> = ({
  variant = 'metric',
  className = '',
}) => {
  if (variant === 'metric') {
    return (
      <div
        aria-hidden="true"
        className={`rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 sm:p-3.5 text-center flex flex-col items-center justify-center min-h-[76px] ${className}`}
      >
        <Skeleton variant="text" width="60%" className="h-6 sm:h-7 mb-2" />
        <Skeleton variant="text" width="45%" className="h-3 opacity-60" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 flex flex-col justify-between min-h-[64px] ${className}`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Skeleton variant="circular" width={12} height={12} />
        <Skeleton variant="text" width="50%" className="h-2.5" />
      </div>
      <Skeleton variant="text" width="70%" className="h-5" />
    </div>
  );
};

export interface SkeletonCardProps {
  className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-white/[0.08] bg-[#18191d]/90 p-4 shadow-xl flex flex-col gap-3 ${className}`}
    >
      <Skeleton variant="rounded-xl" className="w-full h-40 sm:h-44" />
      <div className="flex items-center justify-between gap-2 pt-1">
        <Skeleton variant="text" width="55%" className="h-4" />
        <Skeleton variant="rounded-full" width={48} height={18} className="rounded-full" />
      </div>
      <Skeleton variant="text" width="80%" className="h-3 opacity-60" />
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SkeletonAvatar size="sm" shape="rounded-lg" />
          <Skeleton variant="text" width={70} className="h-3" />
        </div>
        <Skeleton variant="rounded" width={58} height={26} className="rounded-lg" />
      </div>
    </div>
  );
};
