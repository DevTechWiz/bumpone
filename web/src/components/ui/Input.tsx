import React, { InputHTMLAttributes, ReactNode, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      leftAddon,
      rightAddon,
      className = '',
      containerClassName = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-slate-300 uppercase tracking-wider select-none flex items-center justify-between"
          >
            <span>{label}</span>
          </label>
        )}
        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
              {leftAddon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-black/50 text-neutral-100 placeholder:text-neutral-500 rounded-xl text-sm border transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-offset-[#121316] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-white/[0.02] ${
              leftAddon ? 'pl-10' : 'pl-3.5'
            } ${rightAddon ? 'pr-10' : 'pr-3.5'} py-2.5 ${
              error
                ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/30'
                : 'border-white/[0.1] focus:border-white/50 focus:ring-white/20 hover:border-white/[0.2]'
            } ${className}`}
            {...props}
          />
          {rightAddon && (
            <div className="absolute right-3.5 flex items-center text-slate-400">
              {rightAddon}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-rose-400 font-medium">{error}</span>}
        {helperText && !error && (
          <span className="text-xs text-slate-400">{helperText}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
