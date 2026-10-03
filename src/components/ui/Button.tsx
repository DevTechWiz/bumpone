import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-200 select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-offset-[#121316] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]';

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-3 py-1.5 rounded-lg gap-1.5',
    md: 'text-xs sm:text-sm px-4 py-2 rounded-xl gap-2',
    lg: 'text-sm sm:text-base px-5 py-2.5 rounded-xl gap-2.5 font-semibold',
    xl: 'text-base sm:text-lg px-7 py-3.5 rounded-2xl gap-3 font-bold',
  };

  const variantStyles: Record<ButtonVariant, string> = {
    // Primary: Luxury starlight platinum with subtle cosmic glow
    primary:
      'bg-gradient-to-b from-white via-slate-100 to-slate-200 text-slate-950 hover:from-white hover:to-white shadow-lg shadow-white/10 hover:shadow-white/20 border border-white/80 focus:ring-white/50 font-semibold',
    // Secondary: Deep obsidian glass with starlight border
    secondary:
      'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border border-white/[0.1] hover:border-white/[0.2] shadow-sm backdrop-blur-md focus:ring-slate-400',
    // Outline: Minimalist structural border
    outline:
      'bg-transparent border border-white/[0.12] hover:border-white/[0.25] text-slate-300 hover:text-white hover:bg-white/[0.04] focus:ring-slate-500',
    // Danger: Subtle crimson beacon
    danger:
      'bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-800/40 shadow-sm focus:ring-rose-500',
    // Ghost: Lightweight interactive icon/text action
    ghost:
      'bg-transparent text-slate-400 hover:text-white hover:bg-white/[0.05] focus:ring-slate-500',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
};
