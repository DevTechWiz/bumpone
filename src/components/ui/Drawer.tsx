'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerIcon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  side?: 'left' | 'right';
  width?: string;
  hasBackdrop?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  headerIcon,
  headerExtra,
  side = 'right',
  width = 'w-full sm:w-[420px]',
  hasBackdrop = false,
  children,
  className = '',
}) => {
  // ESC key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const slideClass = side === 'right' ? 'slide-in-from-right' : 'slide-in-from-left';
  const borderClass = side === 'right' ? 'border-l' : 'border-r';
  const positionClass = side === 'right' ? 'right-0' : 'left-0';

  return (
    <>
      {hasBackdrop && (
        <div
          className="fixed inset-0 z-40 bg-[#0d0e12]/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed inset-y-0 ${positionClass} z-50 ${width} bg-[#141519]/98 backdrop-blur-2xl ${borderClass} border-white/[0.12] shadow-2xl flex flex-col select-none animate-in ${slideClass} duration-300 ${className}`}
      >
        {/* Optional Header */}
        {(title || headerIcon || headerExtra) && (
          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-2 min-w-0">
              {headerIcon && (
                <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.14] flex items-center justify-center text-neutral-200 shrink-0">
                  {headerIcon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <div className="text-sm font-bold text-white tracking-wide font-mono truncate">
                    {title}
                  </div>
                )}
                {subtitle && (
                  <p className="text-[11px] text-neutral-400 truncate">{subtitle}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {headerExtra}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {children}
      </div>
    </>
  );
};
