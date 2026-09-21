import React, { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'interactive' | 'outline' | 'hero';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'md',
  children,
  className = '',
  ...props
}) => {
  const baseStyles = 'relative rounded-2xl transition-all duration-200 overflow-hidden backdrop-blur-md';

  const paddingStyles = {
    none: '',
    sm: 'p-3.5 sm:p-4',
    md: 'p-5 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  const variantStyles = {
    // Dark grey glass
    default: 'bg-[#18191d]/85 border border-white/[0.08] text-neutral-100',
    // Elevated with neutral reflection
    elevated: 'bg-[#1f2026]/90 border border-white/[0.12] shadow-2xl shadow-black/70 text-neutral-100',
    // Interactive hover card
    interactive: 'bg-[#18191d]/85 hover:bg-[#23252c]/95 border border-white/[0.08] hover:border-white/[0.18] cursor-pointer text-neutral-100',
    // Minimalist outline
    outline: 'bg-transparent border border-white/[0.1] text-neutral-100',
    // Hero highlight card with celestial amber ring
    hero: 'bg-[#1f2026]/90 border border-amber-400/40 shadow-xl shadow-amber-500/5 text-neutral-100',
  };

  return (
    <div
      className={`${baseStyles} ${paddingStyles[padding]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
