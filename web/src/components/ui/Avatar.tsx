'use client';

import React, { useState } from 'react';
import { User } from 'lucide-react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type AvatarShape = 'circle' | 'rounded-lg' | 'rounded-xl' | 'rounded-2xl';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  shape?: AvatarShape;
  fallbackIcon?: React.ReactNode;
  fallbackClassName?: string;
  ringClassName?: string;
  className?: string;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
}

const sizeMap: Record<AvatarSize, { container: string; text: string; icon: string }> = {
  xs: { container: 'w-4 h-4', text: 'text-[9px]', icon: 'w-2.5 h-2.5' },
  sm: { container: 'w-6 h-6', text: 'text-[10px]', icon: 'w-3 h-3' },
  md: { container: 'w-8 h-8', text: 'text-xs', icon: 'w-4 h-4' },
  lg: { container: 'w-12 h-12', text: 'text-sm font-semibold', icon: 'w-5 h-5' },
  xl: { container: 'w-16 h-16 sm:w-20 sm:h-20', text: 'text-xl font-bold', icon: 'w-8 h-8' },
  '2xl': { container: 'w-20 h-20 sm:w-24 sm:h-24', text: 'text-2xl font-bold', icon: 'w-10 h-10' },
};

const shapeMap: Record<AvatarShape, string> = {
  circle: 'rounded-full',
  'rounded-lg': 'rounded-lg',
  'rounded-xl': 'rounded-xl',
  'rounded-2xl': 'rounded-2xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = '',
  name,
  size = 'md',
  shape = 'circle',
  fallbackIcon,
  fallbackClassName = 'bg-amber-400/20 border border-amber-400/40 text-amber-300',
  ringClassName = '',
  className = '',
  referrerPolicy = 'no-referrer',
}) => {
  const [hasError, setHasError] = useState(false);
  const sizeConfig = sizeMap[size] || sizeMap.md;
  const shapeClass = shapeMap[shape] || shapeMap.circle;

  const initial = (name && name.trim() && name.trim() !== 'N/A'
    ? name.trim().replace(/^@/, '').charAt(0).toUpperCase()
    : '');

  const showImage = Boolean(src && !hasError);

  return (
    <div
      className={`relative shrink-0 overflow-hidden flex items-center justify-center select-none ${sizeConfig.container} ${shapeClass} ${ringClassName} ${className}`}
    >
      {showImage ? (
        <img
          src={src!}
          alt={alt || name || 'Avatar'}
          onError={() => setHasError(true)}
          referrerPolicy={referrerPolicy}
          className={`w-full h-full object-cover ${shapeClass}`}
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center font-bold ${shapeClass} ${fallbackClassName}`}
        >
          {initial ? (
            <span className={sizeConfig.text}>{initial}</span>
          ) : fallbackIcon ? (
            fallbackIcon
          ) : (
            <User className={`${sizeConfig.icon} text-slate-400`} />
          )}
        </div>
      )}
    </div>
  );
};
